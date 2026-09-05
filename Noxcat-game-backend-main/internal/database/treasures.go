package database

import (
	"context"
	"fmt"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/jackc/pgx/v5"
)

// EquipTreasure locks the owner's unit and treasure inventories in a stable
// order so concurrent equip requests cannot violate the reciprocal links.
func (s *Store) EquipTreasure(ctx context.Context, ownerID, treasureID, unitID string) error {
	if ownerID == "" || treasureID == "" || unitID == "" {
		return domain.ErrInvalidInput
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin equip treasure: %w", err)
	}
	defer rollback(tx)
	statuses, err := lockPlayerStatuses(ctx, tx, ownerID)
	if err != nil {
		return err
	}
	if err := rejectCombatPlayers(statuses, ownerID); err != nil {
		return err
	}

	unitRows, err := tx.Query(ctx, `
		SELECT `+unitColumns+`
		FROM units WHERE owner_id = $1 ORDER BY id FOR UPDATE`, ownerID)
	if err != nil {
		return fmt.Errorf("lock units for equip: %w", err)
	}
	var targetUnit domain.Unit
	unitFound := false
	for unitRows.Next() {
		unit, scanErr := scanUnit(unitRows)
		if scanErr != nil {
			unitRows.Close()
			return fmt.Errorf("scan locked unit: %w", scanErr)
		}
		if unit.ID == unitID {
			targetUnit = unit
			unitFound = true
		}
	}
	if err := unitRows.Err(); err != nil {
		unitRows.Close()
		return fmt.Errorf("iterate locked units: %w", err)
	}
	unitRows.Close()
	if !unitFound {
		return assetOwnershipError(ctx, tx, "units", unitID, domain.ErrUnitNotFound)
	}

	treasureRows, err := tx.Query(ctx, `
		SELECT id, owner_id, damage_bonus, equipped_by_unit_id, created_at
		FROM treasures WHERE owner_id = $1 ORDER BY id FOR UPDATE`, ownerID)
	if err != nil {
		return fmt.Errorf("lock treasures for equip: %w", err)
	}
	var targetTreasure domain.Treasure
	treasureFound := false
	for treasureRows.Next() {
		var treasure domain.Treasure
		if err := treasureRows.Scan(
			&treasure.ID, &treasure.OwnerID, &treasure.DamageBonus,
			&treasure.EquippedByUnitID, &treasure.CreatedAt,
		); err != nil {
			treasureRows.Close()
			return fmt.Errorf("scan locked treasure: %w", err)
		}
		if treasure.ID == treasureID {
			targetTreasure = treasure
			treasureFound = true
		}
	}
	if err := treasureRows.Err(); err != nil {
		treasureRows.Close()
		return fmt.Errorf("iterate locked treasures: %w", err)
	}
	treasureRows.Close()
	if !treasureFound {
		return assetOwnershipError(ctx, tx, "treasures", treasureID, domain.ErrTreasureNotFound)
	}
	if targetTreasure.EquippedByUnitID != nil && *targetTreasure.EquippedByUnitID != unitID {
		return domain.ErrAlreadyEquipped
	}

	if targetUnit.EquippedTreasureID != nil && *targetUnit.EquippedTreasureID != treasureID {
		if _, err := tx.Exec(ctx, `
			UPDATE treasures SET equipped_by_unit_id = NULL WHERE id = $1`,
			*targetUnit.EquippedTreasureID,
		); err != nil {
			return fmt.Errorf("unequip previous treasure: %w", err)
		}
	}

	currentStats := targetUnit.BaseStats
	currentStats.Attack += targetTreasure.DamageBonus
	statsJSON, err := marshalStats(currentStats)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE units
		SET equipped_treasure_id = $2, current_stats = $3
		WHERE id = $1`, unitID, treasureID, statsJSON,
	); err != nil {
		return fmt.Errorf("equip treasure on unit: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE treasures SET equipped_by_unit_id = $2 WHERE id = $1`,
		treasureID, unitID,
	); err != nil {
		return fmt.Errorf("equip unit on treasure: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit equip treasure: %w", err)
	}
	return nil
}

func assetOwnershipError(ctx context.Context, tx pgx.Tx, table, assetID string, specific error) error {
	var exists bool
	query := fmt.Sprintf(`SELECT EXISTS (SELECT 1 FROM %s WHERE id = $1)`, table)
	if err := tx.QueryRow(ctx, query, assetID).Scan(&exists); err != nil {
		return fmt.Errorf("check asset existence: %w", err)
	}
	if !exists {
		return notFound(specific)
	}
	return domain.ErrAssetNotOwned
}
