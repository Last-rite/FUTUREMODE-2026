package database

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/jackc/pgx/v5"
)

// SettleBattleSession locks and completes the durable battle session while
// atomically updating units, rewards, progress, and player status.
func (s *Store) SettleBattleSession(ctx context.Context, result domain.BattleResult) error {
	if result.PlayerID == "" || result.DungeonID == "" || result.SessionID == "" || result.MoneyAward < 0 {
		return domain.ErrInvalidInput
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin battle settlement: %w", err)
	}
	defer rollback(tx)

	var status domain.PlayerStatus
	err = tx.QueryRow(ctx, `SELECT status FROM players WHERE id = $1 FOR UPDATE`, result.PlayerID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(domain.ErrPlayerNotFound)
	}
	if err != nil {
		return fmt.Errorf("lock player for settlement: %w", err)
	}
	{
		var sessionPlayerID, sessionDungeonID string
		var sessionStatus domain.BattleSessionStatus
		var expired bool
		err := tx.QueryRow(ctx, `
			SELECT player_id, dungeon_id, status, expires_at <= now()
			FROM battle_sessions WHERE id = $1 FOR UPDATE`, result.SessionID,
		).Scan(&sessionPlayerID, &sessionDungeonID, &sessionStatus, &expired)
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(domain.ErrBattleSessionNotFound)
		}
		if err != nil {
			return fmt.Errorf("lock battle session for settlement: %w", err)
		}
		if sessionPlayerID != result.PlayerID || sessionDungeonID != result.DungeonID {
			return domain.ErrBattleResultMismatch
		}
		if sessionStatus == domain.BattleSessionExpired {
			return domain.ErrBattleExpired
		}
		if sessionStatus != domain.BattleSessionActive {
			return domain.ErrBattleNotActive
		}
		if expired {
			if _, err := tx.Exec(ctx, `
				UPDATE battle_sessions SET status = 'expired', completed_at = now()
				WHERE id = $1`, result.SessionID); err != nil {
				return fmt.Errorf("expire battle during settlement: %w", err)
			}
			if _, err := tx.Exec(ctx, `UPDATE players SET status = 'idle' WHERE id = $1`, result.PlayerID); err != nil {
				return fmt.Errorf("reset player after battle expiry: %w", err)
			}
			if err := tx.Commit(ctx); err != nil {
				return fmt.Errorf("commit expired battle settlement: %w", err)
			}
			return domain.ErrBattleExpired
		}
		if status != domain.PlayerStatusCombat {
			return domain.ErrPlayerNotInCombat
		}
	}
	var dungeonExists bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM dungeons WHERE id = $1)`, result.DungeonID,
	).Scan(&dungeonExists); err != nil {
		return fmt.Errorf("check settlement dungeon: %w", err)
	}
	if !dungeonExists {
		return notFound(domain.ErrDungeonNotFound)
	}

	settlements := append([]domain.UnitSettlement(nil), result.Units...)
	sort.Slice(settlements, func(i, j int) bool { return settlements[i].UnitID < settlements[j].UnitID })
	for index, settlement := range settlements {
		if settlement.UnitID == "" || (index > 0 && settlement.UnitID == settlements[index-1].UnitID) {
			return domain.ErrInvalidInput
		}
		var ownerID string
		err := tx.QueryRow(ctx, `SELECT owner_id FROM units WHERE id = $1 FOR UPDATE`, settlement.UnitID).Scan(&ownerID)
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(domain.ErrUnitNotFound)
		}
		if err != nil {
			return fmt.Errorf("lock settlement unit: %w", err)
		}
		if ownerID != result.PlayerID {
			return domain.ErrAssetNotOwned
		}
	}

	for _, settlement := range settlements {
		stats, err := marshalStats(settlement.CurrentStats)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE units
			SET current_stats = $2,
			    is_alive = $3,
			    is_equipped = CASE WHEN $3 THEN is_equipped ELSE false END
			WHERE id = $1`,
			settlement.UnitID, stats, settlement.IsAlive,
		); err != nil {
			return fmt.Errorf("update settlement unit: %w", err)
		}
	}

	if result.Won {
		if _, err := tx.Exec(ctx, `
			INSERT INTO player_dungeon_progress (player_id, dungeon_id, solved, solved_at)
			VALUES ($1, $2, true, now())
			ON CONFLICT (player_id, dungeon_id)
			DO UPDATE SET solved = true, solved_at = COALESCE(player_dungeon_progress.solved_at, EXCLUDED.solved_at)`,
			result.PlayerID, result.DungeonID,
		); err != nil {
			return fmt.Errorf("record dungeon progress: %w", err)
		}
		for _, drop := range result.TreasureDrops {
			if _, err := tx.Exec(ctx, `
				INSERT INTO treasures (owner_id, damage_bonus) VALUES ($1, $2)`,
				result.PlayerID, drop.DamageBonus,
			); err != nil {
				return fmt.Errorf("insert treasure drop: %w", err)
			}
		}
	}

	moneyAward := 0
	if result.Won {
		moneyAward = result.MoneyAward
	}
	if _, err := tx.Exec(ctx, `
		UPDATE players SET money = money + $2, status = 'idle' WHERE id = $1`,
		result.PlayerID, moneyAward,
	); err != nil {
		return fmt.Errorf("finish player settlement: %w", err)
	}
	command, err := tx.Exec(ctx, `
			UPDATE battle_sessions SET status = 'settled', completed_at = now()
			WHERE id = $1 AND status = 'active'`, result.SessionID)
	if err != nil {
		return fmt.Errorf("complete battle session: %w", err)
	}
	if command.RowsAffected() != 1 {
		return domain.ErrBattleNotActive
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit battle settlement: %w", err)
	}
	return nil
}
