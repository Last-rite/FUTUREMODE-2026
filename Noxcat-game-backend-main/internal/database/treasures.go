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
		SELECT `+treasureColumns+`
		FROM treasures WHERE owner_id = $1 ORDER BY id FOR UPDATE`, ownerID)
	if err != nil {
		return fmt.Errorf("lock treasures for equip: %w", err)
	}
	var targetTreasure domain.Treasure
	treasureFound := false
	for treasureRows.Next() {
		treasure, err := scanTreasure(treasureRows)
		if err != nil {
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
	if reserved, err := anyTradeAssetReserved(ctx, tx, []string{unitID}, []string{treasureID}, ""); err != nil {
		return err
	} else if reserved {
		return domain.ErrAssetReserved
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
	currentStats.Health += targetTreasure.HealthBonus
	currentStats.Defense += targetTreasure.DefenseBonus
	currentStats.Speed += targetTreasure.SpeedBonus
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

// UnequipTreasure clears both sides of the equipment relationship while using
// the same stable inventory lock order as EquipTreasure.
func (s *Store) UnequipTreasure(ctx context.Context, ownerID, treasureID string) error {
	if ownerID == "" || treasureID == "" {
		return domain.ErrInvalidInput
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin unequip treasure: %w", err)
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
		return fmt.Errorf("lock units for unequip: %w", err)
	}
	units := make(map[string]domain.Unit)
	for unitRows.Next() {
		unit, scanErr := scanUnit(unitRows)
		if scanErr != nil {
			unitRows.Close()
			return fmt.Errorf("scan locked unit for unequip: %w", scanErr)
		}
		units[unit.ID] = unit
	}
	if err := unitRows.Err(); err != nil {
		unitRows.Close()
		return fmt.Errorf("iterate locked units for unequip: %w", err)
	}
	unitRows.Close()

	treasureRows, err := tx.Query(ctx, `
		SELECT `+treasureColumns+`
		FROM treasures WHERE owner_id = $1 ORDER BY id FOR UPDATE`, ownerID)
	if err != nil {
		return fmt.Errorf("lock treasures for unequip: %w", err)
	}
	var target domain.Treasure
	found := false
	for treasureRows.Next() {
		treasure, scanErr := scanTreasure(treasureRows)
		if scanErr != nil {
			treasureRows.Close()
			return fmt.Errorf("scan locked treasure for unequip: %w", scanErr)
		}
		if treasure.ID == treasureID {
			target = treasure
			found = true
		}
	}
	if err := treasureRows.Err(); err != nil {
		treasureRows.Close()
		return fmt.Errorf("iterate locked treasures for unequip: %w", err)
	}
	treasureRows.Close()
	if !found {
		return assetOwnershipError(ctx, tx, "treasures", treasureID, domain.ErrTreasureNotFound)
	}
	if target.EquippedByUnitID == nil {
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit already unequipped treasure: %w", err)
		}
		return nil
	}
	unit, ok := units[*target.EquippedByUnitID]
	if !ok {
		return domain.ErrAssetNotOwned
	}
	baseStats, err := marshalStats(unit.BaseStats)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE units
		SET equipped_treasure_id = NULL, current_stats = $2
		WHERE id = $1`, unit.ID, baseStats); err != nil {
		return fmt.Errorf("clear treasure from unit: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE treasures SET equipped_by_unit_id = NULL WHERE id = $1`, treasureID); err != nil {
		return fmt.Errorf("clear unit from treasure: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit unequip treasure: %w", err)
	}
	return nil
}

func (s *Store) ListPlayerTreasures(ctx context.Context, playerID string) ([]domain.Treasure, error) {
	rows, err := s.db.Query(ctx, `
		SELECT `+treasureColumns+`
		FROM treasures
		WHERE owner_id = $1
		ORDER BY created_at, id`, playerID)
	if err != nil {
		return nil, fmt.Errorf("list player treasures: %w", err)
	}
	defer rows.Close()
	treasures := make([]domain.Treasure, 0)
	for rows.Next() {
		treasure, err := scanTreasure(rows)
		if err != nil {
			return nil, fmt.Errorf("scan player treasure: %w", err)
		}
		treasures = append(treasures, treasure)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate player treasures: %w", err)
	}
	if len(treasures) == 0 {
		if err := s.ensurePlayerExists(ctx, playerID); err != nil {
			return nil, err
		}
	}
	return treasures, nil
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
