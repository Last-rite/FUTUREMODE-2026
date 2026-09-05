package database

import (
	"context"
	"errors"
	"fmt"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/jackc/pgx/v5"
)

const tradeColumns = `id, from_player_id, to_player_id, unit_id, treasure_id, status, created_at`

// CreateTrade verifies and locks the offered asset before inserting the offer.
func (s *Store) CreateTrade(ctx context.Context, input domain.NewTrade) (domain.Trade, error) {
	if input.FromPlayerID == "" || input.ToPlayerID == "" || input.FromPlayerID == input.ToPlayerID ||
		(input.UnitID == nil) == (input.TreasureID == nil) {
		return domain.Trade{}, domain.ErrInvalidTradeAsset
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return domain.Trade{}, fmt.Errorf("begin create trade: %w", err)
	}
	defer rollback(tx)

	if _, err := lockPlayerStatuses(ctx, tx, input.FromPlayerID, input.ToPlayerID); err != nil {
		return domain.Trade{}, err
	}
	if input.UnitID != nil {
		var ownerID string
		var equippedTreasureID *string
		err := tx.QueryRow(ctx, `
			SELECT owner_id, equipped_treasure_id FROM units WHERE id = $1 FOR UPDATE`, *input.UnitID,
		).Scan(&ownerID, &equippedTreasureID)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Trade{}, notFound(domain.ErrUnitNotFound)
		}
		if err != nil {
			return domain.Trade{}, fmt.Errorf("lock offered unit: %w", err)
		}
		if ownerID != input.FromPlayerID {
			return domain.Trade{}, domain.ErrAssetNotOwned
		}
		if equippedTreasureID != nil {
			return domain.Trade{}, domain.ErrAlreadyEquipped
		}
	} else {
		var ownerID string
		var equippedByUnitID *string
		err := tx.QueryRow(ctx, `
			SELECT owner_id, equipped_by_unit_id FROM treasures WHERE id = $1 FOR UPDATE`, *input.TreasureID,
		).Scan(&ownerID, &equippedByUnitID)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Trade{}, notFound(domain.ErrTreasureNotFound)
		}
		if err != nil {
			return domain.Trade{}, fmt.Errorf("lock offered treasure: %w", err)
		}
		if ownerID != input.FromPlayerID {
			return domain.Trade{}, domain.ErrAssetNotOwned
		}
		if equippedByUnitID != nil {
			return domain.Trade{}, domain.ErrAlreadyEquipped
		}
	}

	trade, err := scanTrade(tx.QueryRow(ctx, `
		INSERT INTO trades (from_player_id, to_player_id, unit_id, treasure_id)
		VALUES ($1, $2, $3, $4)
		RETURNING `+tradeColumns,
		input.FromPlayerID, input.ToPlayerID, input.UnitID, input.TreasureID,
	))
	if err != nil {
		return domain.Trade{}, fmt.Errorf("insert trade: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.Trade{}, fmt.Errorf("commit create trade: %w", err)
	}
	return trade, nil
}

// AcceptTrade locks the offer, both players in UUID order, and then the asset.
// Only one concurrent accept/transfer can commit.
func (s *Store) AcceptTrade(ctx context.Context, tradeID, recipientID string) (domain.Trade, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return domain.Trade{}, fmt.Errorf("begin accept trade: %w", err)
	}
	defer rollback(tx)

	trade, err := scanTrade(tx.QueryRow(ctx,
		`SELECT `+tradeColumns+` FROM trades WHERE id = $1 FOR UPDATE`, tradeID,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Trade{}, notFound(domain.ErrTradeNotFound)
	}
	if err != nil {
		return domain.Trade{}, fmt.Errorf("lock trade: %w", err)
	}
	if trade.Status != domain.TradeStatusPending {
		return domain.Trade{}, domain.ErrTradeNotPending
	}
	if trade.ToPlayerID != recipientID {
		return domain.Trade{}, domain.ErrTradeRecipient
	}
	statuses, err := lockPlayerStatuses(ctx, tx, trade.FromPlayerID, trade.ToPlayerID)
	if err != nil {
		return domain.Trade{}, err
	}
	if err := rejectCombatPlayers(statuses, trade.FromPlayerID, trade.ToPlayerID); err != nil {
		return domain.Trade{}, err
	}

	if trade.UnitID != nil {
		command, err := tx.Exec(ctx, `
			UPDATE units SET owner_id = $3, is_equipped = false
			WHERE id = $1 AND owner_id = $2 AND equipped_treasure_id IS NULL`,
			*trade.UnitID, trade.FromPlayerID, trade.ToPlayerID,
		)
		if err != nil {
			return domain.Trade{}, fmt.Errorf("transfer unit: %w", err)
		}
		if command.RowsAffected() == 0 {
			return domain.Trade{}, domain.ErrAssetNotOwned
		}
	} else if trade.TreasureID != nil {
		command, err := tx.Exec(ctx, `
			UPDATE treasures SET owner_id = $3
			WHERE id = $1 AND owner_id = $2 AND equipped_by_unit_id IS NULL`,
			*trade.TreasureID, trade.FromPlayerID, trade.ToPlayerID,
		)
		if err != nil {
			return domain.Trade{}, fmt.Errorf("transfer treasure: %w", err)
		}
		if command.RowsAffected() == 0 {
			return domain.Trade{}, domain.ErrAssetNotOwned
		}
	} else {
		return domain.Trade{}, domain.ErrInvalidTradeAsset
	}

	trade.Status = domain.TradeStatusAccepted
	if _, err := tx.Exec(ctx, `UPDATE trades SET status = 'accepted' WHERE id = $1`, trade.ID); err != nil {
		return domain.Trade{}, fmt.Errorf("accept trade: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.Trade{}, fmt.Errorf("commit accept trade: %w", err)
	}
	return trade, nil
}

func (s *Store) RejectTrade(ctx context.Context, tradeID, recipientID string) (domain.Trade, error) {
	trade, err := scanTrade(s.db.QueryRow(ctx, `
		UPDATE trades SET status = 'rejected'
		WHERE id = $1 AND to_player_id = $2 AND status = 'pending'
		RETURNING `+tradeColumns, tradeID, recipientID,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		var existing domain.Trade
		existing, lookupErr := scanTrade(s.db.QueryRow(ctx,
			`SELECT `+tradeColumns+` FROM trades WHERE id = $1`, tradeID,
		))
		if errors.Is(lookupErr, pgx.ErrNoRows) {
			return domain.Trade{}, notFound(domain.ErrTradeNotFound)
		}
		if lookupErr != nil {
			return domain.Trade{}, fmt.Errorf("look up unmodified trade: %w", lookupErr)
		}
		if existing.ToPlayerID != recipientID {
			return domain.Trade{}, domain.ErrTradeRecipient
		}
		return domain.Trade{}, domain.ErrTradeNotPending
	}
	if err != nil {
		return domain.Trade{}, fmt.Errorf("reject trade: %w", err)
	}
	return trade, nil
}

// ListPlayerTrades supports reloading durable trade notifications after a
// player was offline. A nil status returns the complete history.
func (s *Store) ListPlayerTrades(ctx context.Context, playerID string, status *domain.TradeStatus) ([]domain.Trade, error) {
	query := `
		SELECT ` + tradeColumns + ` FROM trades
		WHERE (from_player_id = $1 OR to_player_id = $1)`
	arguments := []any{playerID}
	if status != nil {
		query += ` AND status = $2`
		arguments = append(arguments, *status)
	}
	query += ` ORDER BY created_at DESC, id`

	rows, err := s.db.Query(ctx, query, arguments...)
	if err != nil {
		return nil, fmt.Errorf("list player trades: %w", err)
	}
	defer rows.Close()
	trades := make([]domain.Trade, 0)
	for rows.Next() {
		trade, err := scanTrade(rows)
		if err != nil {
			return nil, fmt.Errorf("scan player trade: %w", err)
		}
		trades = append(trades, trade)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate player trades: %w", err)
	}
	if len(trades) == 0 {
		if err := s.ensurePlayerExists(ctx, playerID); err != nil {
			return nil, err
		}
	}
	return trades, nil
}
