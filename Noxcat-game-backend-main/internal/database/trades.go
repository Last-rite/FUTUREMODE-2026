package database

import (
	"context"
	"errors"
	"fmt"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const tradeColumns = `id, from_player_id, to_player_id, unit_id, treasure_id, status, created_at`

type persistedTradeAsset struct {
	side       string
	position   int
	unitID     *string
	treasureID *string
	reserved   bool
}

// CreateTrade reserves only the sender's offered asset. Requested assets are
// verified for an accurate proposal but intentionally remain available until
// acceptance, preventing a sender from locking another player's inventory.
func (s *Store) CreateTrade(ctx context.Context, input domain.NewTrade) (domain.Trade, error) {
	if input.FromPlayerID == "" || input.ToPlayerID == "" || input.FromPlayerID == input.ToPlayerID ||
		(input.UnitID == nil) == (input.TreasureID == nil) || !validRequestedTradeAssets(input.RequestedAssets) {
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
	unitIDs, treasureIDs := tradeAssetIDs(input.UnitID, input.TreasureID, input.RequestedAssets)
	units, err := lockTradeUnits(ctx, tx, unitIDs)
	if err != nil {
		return domain.Trade{}, err
	}
	treasures, err := lockTradeTreasures(ctx, tx, treasureIDs)
	if err != nil {
		return domain.Trade{}, err
	}
	if err := validateTradeAsset(units, treasures, input.UnitID, input.TreasureID, input.FromPlayerID); err != nil {
		return domain.Trade{}, err
	}
	for _, asset := range input.RequestedAssets {
		if err := validateTradeAsset(units, treasures, asset.UnitID, asset.TreasureID, input.ToPlayerID); err != nil {
			return domain.Trade{}, err
		}
	}
	if reserved, err := anyTradeAssetReserved(ctx, tx, unitIDs, treasureIDs, ""); err != nil {
		return domain.Trade{}, err
	} else if reserved {
		return domain.Trade{}, domain.ErrAssetReserved
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
	if _, err := tx.Exec(ctx, `
		INSERT INTO trade_assets (trade_id, side, position, unit_id, treasure_id, reserved)
		VALUES ($1, 'offered', 1, $2, $3, true)`, trade.ID, input.UnitID, input.TreasureID); err != nil {
		if isTradeReservationConflict(err) {
			return domain.Trade{}, domain.ErrAssetReserved
		}
		return domain.Trade{}, fmt.Errorf("reserve offered trade asset: %w", err)
	}
	for index, asset := range input.RequestedAssets {
		if _, err := tx.Exec(ctx, `
			INSERT INTO trade_assets (trade_id, side, position, unit_id, treasure_id)
			VALUES ($1, 'requested', $2, $3, $4)`,
			trade.ID, index+1, asset.UnitID, asset.TreasureID); err != nil {
			return domain.Trade{}, fmt.Errorf("insert requested trade asset: %w", err)
		}
	}
	trade.RequestedAssets = append([]domain.TradeAsset(nil), input.RequestedAssets...)
	if err := tx.Commit(ctx); err != nil {
		return domain.Trade{}, fmt.Errorf("commit create trade: %w", err)
	}
	return trade, nil
}

// AcceptTrade follows the global mutation lock order: trade, players, units,
// treasures, then loadout memberships. Every ownership change is atomic.
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
	assets, err := loadPersistedTradeAssets(ctx, tx, trade.ID)
	if err != nil {
		return domain.Trade{}, err
	}
	requested := requestedDomainAssets(assets)
	trade.RequestedAssets = requested
	if !hasValidPersistedOffer(assets, trade.UnitID, trade.TreasureID) || !validRequestedTradeAssets(requested) {
		return domain.Trade{}, domain.ErrInvalidTradeAsset
	}

	statuses, err := lockPlayerStatuses(ctx, tx, trade.FromPlayerID, trade.ToPlayerID)
	if err != nil {
		return domain.Trade{}, err
	}
	if err := rejectCombatPlayers(statuses, trade.FromPlayerID, trade.ToPlayerID); err != nil {
		return domain.Trade{}, err
	}
	unitIDs, treasureIDs := tradeAssetIDs(trade.UnitID, trade.TreasureID, requested)
	units, err := lockTradeUnits(ctx, tx, unitIDs)
	if err != nil {
		return domain.Trade{}, err
	}
	treasures, err := lockTradeTreasures(ctx, tx, treasureIDs)
	if err != nil {
		return domain.Trade{}, err
	}
	if err := validateTradeAsset(units, treasures, trade.UnitID, trade.TreasureID, trade.FromPlayerID); err != nil {
		return domain.Trade{}, unavailableTradeAsset(err)
	}
	for _, asset := range requested {
		if err := validateTradeAsset(units, treasures, asset.UnitID, asset.TreasureID, trade.ToPlayerID); err != nil {
			return domain.Trade{}, unavailableTradeAsset(err)
		}
	}
	if reserved, err := anyTradeAssetReserved(ctx, tx, requestedUnitIDs(requested), requestedTreasureIDs(requested), trade.ID); err != nil {
		return domain.Trade{}, err
	} else if reserved {
		return domain.Trade{}, domain.ErrAssetReserved
	}

	transferredUnitIDs := make([]string, 0, 2)
	if trade.UnitID != nil {
		if err := transferTradeUnit(ctx, tx, *trade.UnitID, trade.FromPlayerID, trade.ToPlayerID); err != nil {
			return domain.Trade{}, err
		}
		transferredUnitIDs = append(transferredUnitIDs, *trade.UnitID)
	} else {
		if err := transferTradeTreasure(ctx, tx, *trade.TreasureID, trade.FromPlayerID, trade.ToPlayerID); err != nil {
			return domain.Trade{}, err
		}
	}
	for _, asset := range requested {
		if asset.UnitID != nil {
			if err := transferTradeUnit(ctx, tx, *asset.UnitID, trade.ToPlayerID, trade.FromPlayerID); err != nil {
				return domain.Trade{}, err
			}
			transferredUnitIDs = append(transferredUnitIDs, *asset.UnitID)
		} else {
			if err := transferTradeTreasure(ctx, tx, *asset.TreasureID, trade.ToPlayerID, trade.FromPlayerID); err != nil {
				return domain.Trade{}, err
			}
		}
	}
	for _, unitID := range transferredUnitIDs {
		if err := removeUnitFromLoadouts(ctx, tx, unitID); err != nil {
			return domain.Trade{}, fmt.Errorf("clear transferred unit loadouts: %w", err)
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE trade_assets SET reserved = false WHERE trade_id = $1`, trade.ID); err != nil {
		return domain.Trade{}, fmt.Errorf("release accepted trade reservation: %w", err)
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
	return s.closeTrade(ctx, tradeID, recipientID, domain.TradeStatusRejected, false)
}

func (s *Store) CancelTrade(ctx context.Context, tradeID, senderID string) (domain.Trade, error) {
	return s.closeTrade(ctx, tradeID, senderID, domain.TradeStatusCancelled, true)
}

func (s *Store) closeTrade(ctx context.Context, tradeID, actorID string, status domain.TradeStatus, senderAction bool) (domain.Trade, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return domain.Trade{}, fmt.Errorf("begin close trade: %w", err)
	}
	defer rollback(tx)
	trade, err := scanTrade(tx.QueryRow(ctx, `SELECT `+tradeColumns+` FROM trades WHERE id = $1 FOR UPDATE`, tradeID))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Trade{}, notFound(domain.ErrTradeNotFound)
	}
	if err != nil {
		return domain.Trade{}, fmt.Errorf("lock trade for close: %w", err)
	}
	if trade.Status != domain.TradeStatusPending {
		return domain.Trade{}, domain.ErrTradeNotPending
	}
	if senderAction && trade.FromPlayerID != actorID {
		return domain.Trade{}, domain.ErrTradeSender
	}
	if !senderAction && trade.ToPlayerID != actorID {
		return domain.Trade{}, domain.ErrTradeRecipient
	}
	assets, err := loadPersistedTradeAssets(ctx, tx, trade.ID)
	if err != nil {
		return domain.Trade{}, err
	}
	trade.RequestedAssets = requestedDomainAssets(assets)
	if _, err := tx.Exec(ctx, `UPDATE trade_assets SET reserved = false WHERE trade_id = $1`, trade.ID); err != nil {
		return domain.Trade{}, fmt.Errorf("release closed trade reservation: %w", err)
	}
	trade.Status = status
	if _, err := tx.Exec(ctx, `UPDATE trades SET status = $2 WHERE id = $1`, trade.ID, status); err != nil {
		return domain.Trade{}, fmt.Errorf("close trade: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.Trade{}, fmt.Errorf("commit close trade: %w", err)
	}
	return trade, nil
}

// ListPlayerTrades supports reloading durable trade notifications after a
// player was offline. A nil status returns the complete history.
func (s *Store) ListPlayerTrades(ctx context.Context, playerID string, status *domain.TradeStatus) ([]domain.Trade, error) {
	query := `SELECT ` + tradeColumns + ` FROM trades WHERE (from_player_id = $1 OR to_player_id = $1)`
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
	trades := make([]domain.Trade, 0)
	tradeIDs := make([]string, 0)
	for rows.Next() {
		trade, scanErr := scanTrade(rows)
		if scanErr != nil {
			rows.Close()
			return nil, fmt.Errorf("scan player trade: %w", scanErr)
		}
		trades = append(trades, trade)
		tradeIDs = append(tradeIDs, trade.ID)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, fmt.Errorf("iterate player trades: %w", err)
	}
	rows.Close()
	if len(trades) == 0 {
		if err := s.ensurePlayerExists(ctx, playerID); err != nil {
			return nil, err
		}
		return trades, nil
	}
	requestedByTrade, err := s.listRequestedTradeAssets(ctx, tradeIDs)
	if err != nil {
		return nil, err
	}
	for index := range trades {
		trades[index].RequestedAssets = requestedByTrade[trades[index].ID]
		if trades[index].RequestedAssets == nil {
			trades[index].RequestedAssets = []domain.TradeAsset{}
		}
	}
	return trades, nil
}

// ListTradeAssets exposes only inventory that can currently participate in a
// trade. It is intentionally read-only and does not reserve recipient assets.
func (s *Store) ListTradeAssets(ctx context.Context, playerID string) (domain.TradeInventory, error) {
	if err := s.ensurePlayerExists(ctx, playerID); err != nil {
		return domain.TradeInventory{}, err
	}
	unitRows, err := s.db.Query(ctx, `
		SELECT `+unitColumns+` FROM units u
		WHERE u.owner_id = $1 AND u.is_permanent = false AND u.is_alive = true
		  AND u.is_equipped = false AND u.equipped_treasure_id IS NULL
		  AND NOT EXISTS (SELECT 1 FROM trade_assets a WHERE a.unit_id = u.id AND a.reserved = true)
		ORDER BY u.created_at, u.id`, playerID)
	if err != nil {
		return domain.TradeInventory{}, fmt.Errorf("list tradeable units: %w", err)
	}
	units := make([]domain.Unit, 0)
	for unitRows.Next() {
		unit, scanErr := scanUnit(unitRows)
		if scanErr != nil {
			unitRows.Close()
			return domain.TradeInventory{}, fmt.Errorf("scan tradeable unit: %w", scanErr)
		}
		units = append(units, unit)
	}
	if err := unitRows.Err(); err != nil {
		unitRows.Close()
		return domain.TradeInventory{}, fmt.Errorf("iterate tradeable units: %w", err)
	}
	unitRows.Close()

	treasureRows, err := s.db.Query(ctx, `
		SELECT `+treasureColumns+` FROM treasures t
		WHERE t.owner_id = $1 AND t.equipped_by_unit_id IS NULL
		  AND NOT EXISTS (SELECT 1 FROM trade_assets a WHERE a.treasure_id = t.id AND a.reserved = true)
		ORDER BY t.created_at, t.id`, playerID)
	if err != nil {
		return domain.TradeInventory{}, fmt.Errorf("list tradeable treasures: %w", err)
	}
	treasures := make([]domain.Treasure, 0)
	for treasureRows.Next() {
		treasure, scanErr := scanTreasure(treasureRows)
		if scanErr != nil {
			treasureRows.Close()
			return domain.TradeInventory{}, fmt.Errorf("scan tradeable treasure: %w", scanErr)
		}
		treasures = append(treasures, treasure)
	}
	if err := treasureRows.Err(); err != nil {
		treasureRows.Close()
		return domain.TradeInventory{}, fmt.Errorf("iterate tradeable treasures: %w", err)
	}
	treasureRows.Close()
	return domain.TradeInventory{Units: units, Treasures: treasures}, nil
}

func validRequestedTradeAssets(assets []domain.TradeAsset) bool {
	if len(assets) > 10 {
		return false
	}
	unitCount, treasureCount := 0, 0
	seen := make(map[string]struct{}, len(assets))
	for _, asset := range assets {
		if (asset.UnitID == nil) == (asset.TreasureID == nil) {
			return false
		}
		key := ""
		if asset.UnitID != nil {
			unitCount++
			key = "unit:" + *asset.UnitID
		} else {
			treasureCount++
			key = "treasure:" + *asset.TreasureID
		}
		if key == "unit:" || key == "treasure:" {
			return false
		}
		if _, duplicate := seen[key]; duplicate {
			return false
		}
		seen[key] = struct{}{}
	}
	return unitCount <= 1 && !(unitCount > 0 && treasureCount > 0)
}

func tradeAssetIDs(offeredUnitID, offeredTreasureID *string, requested []domain.TradeAsset) ([]string, []string) {
	unitIDs := make([]string, 0, 2)
	treasureIDs := make([]string, 0, len(requested)+1)
	if offeredUnitID != nil {
		unitIDs = append(unitIDs, *offeredUnitID)
	}
	if offeredTreasureID != nil {
		treasureIDs = append(treasureIDs, *offeredTreasureID)
	}
	for _, asset := range requested {
		if asset.UnitID != nil {
			unitIDs = append(unitIDs, *asset.UnitID)
		} else if asset.TreasureID != nil {
			treasureIDs = append(treasureIDs, *asset.TreasureID)
		}
	}
	return unitIDs, treasureIDs
}

func requestedUnitIDs(assets []domain.TradeAsset) []string {
	unitIDs, _ := tradeAssetIDs(nil, nil, assets)
	return unitIDs
}

func requestedTreasureIDs(assets []domain.TradeAsset) []string {
	_, treasureIDs := tradeAssetIDs(nil, nil, assets)
	return treasureIDs
}

func lockTradeUnits(ctx context.Context, tx pgx.Tx, unitIDs []string) (map[string]domain.Unit, error) {
	units := make(map[string]domain.Unit, len(unitIDs))
	if len(unitIDs) == 0 {
		return units, nil
	}
	rows, err := tx.Query(ctx, `SELECT `+unitColumns+` FROM units WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, unitIDs)
	if err != nil {
		return nil, fmt.Errorf("lock trade units: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		unit, scanErr := scanUnit(rows)
		if scanErr != nil {
			return nil, fmt.Errorf("scan locked trade unit: %w", scanErr)
		}
		units[unit.ID] = unit
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate locked trade units: %w", err)
	}
	return units, nil
}

func lockTradeTreasures(ctx context.Context, tx pgx.Tx, treasureIDs []string) (map[string]domain.Treasure, error) {
	treasures := make(map[string]domain.Treasure, len(treasureIDs))
	if len(treasureIDs) == 0 {
		return treasures, nil
	}
	rows, err := tx.Query(ctx, `SELECT `+treasureColumns+` FROM treasures WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, treasureIDs)
	if err != nil {
		return nil, fmt.Errorf("lock trade treasures: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		treasure, scanErr := scanTreasure(rows)
		if scanErr != nil {
			return nil, fmt.Errorf("scan locked trade treasure: %w", scanErr)
		}
		treasures[treasure.ID] = treasure
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate locked trade treasures: %w", err)
	}
	return treasures, nil
}

func validateTradeAsset(units map[string]domain.Unit, treasures map[string]domain.Treasure, unitID, treasureID *string, ownerID string) error {
	if unitID != nil {
		unit, ok := units[*unitID]
		if !ok {
			return notFound(domain.ErrUnitNotFound)
		}
		if unit.OwnerID != ownerID {
			return domain.ErrAssetNotOwned
		}
		if unit.EquippedTreasureID != nil {
			return domain.ErrAlreadyEquipped
		}
		if unit.IsPermanent || !unit.IsAlive || unit.IsEquipped {
			return domain.ErrUnitUnavailable
		}
		return nil
	}
	if treasureID != nil {
		treasure, ok := treasures[*treasureID]
		if !ok {
			return notFound(domain.ErrTreasureNotFound)
		}
		if treasure.OwnerID != ownerID {
			return domain.ErrAssetNotOwned
		}
		if treasure.EquippedByUnitID != nil {
			return domain.ErrAlreadyEquipped
		}
		return nil
	}
	return domain.ErrInvalidTradeAsset
}

func unavailableTradeAsset(err error) error {
	if errors.Is(err, domain.ErrAssetNotOwned) || errors.Is(err, domain.ErrUnitNotFound) ||
		errors.Is(err, domain.ErrTreasureNotFound) || errors.Is(err, domain.ErrUnitUnavailable) ||
		errors.Is(err, domain.ErrAlreadyEquipped) {
		return domain.ErrAssetNotOwned
	}
	return err
}

func anyTradeAssetReserved(ctx context.Context, tx pgx.Tx, unitIDs, treasureIDs []string, exceptTradeID string) (bool, error) {
	var reserved bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM trade_assets
			WHERE reserved = true
			  AND trade_id <> COALESCE(NULLIF($3, '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
			  AND (unit_id = ANY($1::uuid[]) OR treasure_id = ANY($2::uuid[]))
		)`, unitIDs, treasureIDs, exceptTradeID).Scan(&reserved); err != nil {
		return false, fmt.Errorf("check trade asset reservation: %w", err)
	}
	return reserved, nil
}

func loadPersistedTradeAssets(ctx context.Context, tx pgx.Tx, tradeID string) ([]persistedTradeAsset, error) {
	rows, err := tx.Query(ctx, `
		SELECT side, position, unit_id, treasure_id, reserved
		FROM trade_assets WHERE trade_id = $1
		ORDER BY side, position`, tradeID)
	if err != nil {
		return nil, fmt.Errorf("lock trade assets: %w", err)
	}
	defer rows.Close()
	assets := make([]persistedTradeAsset, 0)
	for rows.Next() {
		var asset persistedTradeAsset
		if err := rows.Scan(&asset.side, &asset.position, &asset.unitID, &asset.treasureID, &asset.reserved); err != nil {
			return nil, fmt.Errorf("scan trade asset: %w", err)
		}
		assets = append(assets, asset)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate trade assets: %w", err)
	}
	return assets, nil
}

func requestedDomainAssets(assets []persistedTradeAsset) []domain.TradeAsset {
	requested := make([]domain.TradeAsset, 0)
	for _, asset := range assets {
		if asset.side == "requested" {
			requested = append(requested, domain.TradeAsset{UnitID: asset.unitID, TreasureID: asset.treasureID})
		}
	}
	return requested
}

func hasValidPersistedOffer(assets []persistedTradeAsset, unitID, treasureID *string) bool {
	count := 0
	for _, asset := range assets {
		if asset.side != "offered" {
			continue
		}
		count++
		if !asset.reserved || !sameOptionalString(asset.unitID, unitID) || !sameOptionalString(asset.treasureID, treasureID) {
			return false
		}
	}
	return count == 1
}

func sameOptionalString(left, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func transferTradeUnit(ctx context.Context, tx pgx.Tx, unitID, fromPlayerID, toPlayerID string) error {
	command, err := tx.Exec(ctx, `UPDATE units SET owner_id = $3, is_equipped = false WHERE id = $1 AND owner_id = $2`, unitID, fromPlayerID, toPlayerID)
	if err != nil {
		return fmt.Errorf("transfer trade unit: %w", err)
	}
	if command.RowsAffected() != 1 {
		return domain.ErrAssetNotOwned
	}
	return nil
}

func transferTradeTreasure(ctx context.Context, tx pgx.Tx, treasureID, fromPlayerID, toPlayerID string) error {
	command, err := tx.Exec(ctx, `UPDATE treasures SET owner_id = $3 WHERE id = $1 AND owner_id = $2`, treasureID, fromPlayerID, toPlayerID)
	if err != nil {
		return fmt.Errorf("transfer trade treasure: %w", err)
	}
	if command.RowsAffected() != 1 {
		return domain.ErrAssetNotOwned
	}
	return nil
}

func (s *Store) listRequestedTradeAssets(ctx context.Context, tradeIDs []string) (map[string][]domain.TradeAsset, error) {
	rows, err := s.db.Query(ctx, `
		SELECT trade_id, unit_id, treasure_id FROM trade_assets
		WHERE trade_id = ANY($1::uuid[]) AND side = 'requested'
		ORDER BY trade_id, position`, tradeIDs)
	if err != nil {
		return nil, fmt.Errorf("list requested trade assets: %w", err)
	}
	defer rows.Close()
	requested := make(map[string][]domain.TradeAsset)
	for rows.Next() {
		var tradeID string
		var asset domain.TradeAsset
		if err := rows.Scan(&tradeID, &asset.UnitID, &asset.TreasureID); err != nil {
			return nil, fmt.Errorf("scan requested trade asset: %w", err)
		}
		requested[tradeID] = append(requested[tradeID], asset)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate requested trade assets: %w", err)
	}
	return requested, nil
}

func isTradeReservationConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" &&
		(pgErr.ConstraintName == "trade_assets_reserved_unit_uidx" || pgErr.ConstraintName == "trade_assets_reserved_treasure_uidx")
}
