package database

import (
	"context"
	"fmt"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

const maxBattleLoadout = 3

// SetBattleLoadout replaces a player's active loadout atomically. Locking the
// player row serializes concurrent loadout changes and unit transfers.
func (s *Store) SetBattleLoadout(ctx context.Context, playerID string, unitIDs []string) error {
	if playerID == "" || len(unitIDs) > maxBattleLoadout || hasDuplicates(unitIDs) {
		return domain.ErrInvalidUnitSelection
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin set battle loadout: %w", err)
	}
	defer rollback(tx)
	statuses, err := lockPlayerStatuses(ctx, tx, playerID)
	if err != nil {
		return err
	}
	if err := rejectCombatPlayers(statuses, playerID); err != nil {
		return err
	}

	rows, err := tx.Query(ctx, `
		SELECT id, is_alive FROM units
		WHERE owner_id = $1
		ORDER BY id FOR UPDATE`, playerID)
	if err != nil {
		return fmt.Errorf("lock units for battle loadout: %w", err)
	}
	requested := make(map[string]struct{}, len(unitIDs))
	for _, unitID := range unitIDs {
		requested[unitID] = struct{}{}
	}
	found := 0
	for rows.Next() {
		var unitID string
		var alive bool
		if err := rows.Scan(&unitID, &alive); err != nil {
			rows.Close()
			return fmt.Errorf("scan unit for battle loadout: %w", err)
		}
		if _, selected := requested[unitID]; selected {
			if !alive {
				rows.Close()
				return domain.ErrUnitUnavailable
			}
			found++
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return fmt.Errorf("iterate units for battle loadout: %w", err)
	}
	rows.Close()
	if found != len(unitIDs) {
		return domain.ErrAssetNotOwned
	}

	query := `UPDATE units SET is_equipped = false WHERE owner_id = $1`
	arguments := []any{playerID}
	if len(unitIDs) > 0 {
		query = `
			UPDATE units
			SET is_equipped = (id = ANY($2::uuid[]))
			WHERE owner_id = $1`
		arguments = append(arguments, unitIDs)
	}
	if _, err := tx.Exec(ctx, query, arguments...); err != nil {
		return fmt.Errorf("replace battle loadout: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit battle loadout: %w", err)
	}
	return nil
}

// SetUnitEquipped toggles one unit while enforcing the three-unit maximum.
func (s *Store) SetUnitEquipped(ctx context.Context, playerID, unitID string, equipped bool) error {
	if playerID == "" || unitID == "" {
		return domain.ErrInvalidInput
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin set unit equipped: %w", err)
	}
	defer rollback(tx)
	statuses, err := lockPlayerStatuses(ctx, tx, playerID)
	if err != nil {
		return err
	}
	if err := rejectCombatPlayers(statuses, playerID); err != nil {
		return err
	}

	rows, err := tx.Query(ctx, `
		SELECT id, is_alive, is_equipped FROM units
		WHERE owner_id = $1
		ORDER BY id FOR UPDATE`, playerID)
	if err != nil {
		return fmt.Errorf("lock units for equip flag: %w", err)
	}
	found := false
	alive := false
	alreadyEquipped := false
	equippedCount := 0
	for rows.Next() {
		var currentID string
		var currentAlive, currentEquipped bool
		if err := rows.Scan(&currentID, &currentAlive, &currentEquipped); err != nil {
			rows.Close()
			return fmt.Errorf("scan unit equip flag: %w", err)
		}
		if currentEquipped {
			equippedCount++
		}
		if currentID == unitID {
			found = true
			alive = currentAlive
			alreadyEquipped = currentEquipped
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return fmt.Errorf("iterate unit equip flags: %w", err)
	}
	rows.Close()
	if !found {
		return assetOwnershipError(ctx, tx, "units", unitID, domain.ErrUnitNotFound)
	}
	if equipped && !alive {
		return domain.ErrUnitUnavailable
	}
	if equipped && !alreadyEquipped && equippedCount >= maxBattleLoadout {
		return domain.ErrBattleLoadoutFull
	}

	if _, err := tx.Exec(ctx, `
		UPDATE units SET is_equipped = $2 WHERE id = $1`, unitID, equipped,
	); err != nil {
		return fmt.Errorf("set unit equip flag: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit unit equip flag: %w", err)
	}
	return nil
}

func hasDuplicates(values []string) bool {
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if value == "" {
			return true
		}
		if _, exists := seen[value]; exists {
			return true
		}
		seen[value] = struct{}{}
	}
	return false
}
