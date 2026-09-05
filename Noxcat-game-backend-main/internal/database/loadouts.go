package database

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/jackc/pgx/v5"
)

const (
	maxBattleLoadout = 3
	maxLoadoutSlots  = 5
)

type lockedLoadoutUnit struct {
	id       string
	alive    bool
	equipped bool
	reserved bool
}

func (s *Store) ListPlayerLoadouts(ctx context.Context, playerID string) ([]domain.PlayerLoadout, error) {
	rows, err := s.db.Query(ctx, `
		SELECT l.id, l.player_id, l.slot, l.name, l.created_at, l.updated_at,
		       COALESCE(array_agg(lu.unit_id ORDER BY lu.position)
		           FILTER (WHERE lu.unit_id IS NOT NULL), ARRAY[]::uuid[])
		FROM player_loadouts l
		LEFT JOIN player_loadout_units lu ON lu.loadout_id = l.id
		WHERE l.player_id = $1
		GROUP BY l.id
		ORDER BY l.slot`, playerID)
	if err != nil {
		return nil, fmt.Errorf("list player loadouts: %w", err)
	}
	defer rows.Close()

	loadouts := make([]domain.PlayerLoadout, 0, maxLoadoutSlots)
	for rows.Next() {
		var loadout domain.PlayerLoadout
		if err := rows.Scan(
			&loadout.ID, &loadout.PlayerID, &loadout.Slot, &loadout.Name,
			&loadout.CreatedAt, &loadout.UpdatedAt, &loadout.UnitIDs,
		); err != nil {
			return nil, fmt.Errorf("scan player loadout: %w", err)
		}
		loadouts = append(loadouts, loadout)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate player loadouts: %w", err)
	}
	if len(loadouts) == 0 {
		if err := s.ensurePlayerExists(ctx, playerID); err != nil {
			return nil, err
		}
	}
	return loadouts, nil
}

// SetBattleLoadout preserves the original endpoint by replacing the active preset.
func (s *Store) SetBattleLoadout(ctx context.Context, playerID string, unitIDs []string) error {
	return s.setPlayerLoadout(ctx, playerID, 0, unitIDs)
}

func (s *Store) SetPlayerLoadout(ctx context.Context, playerID string, slot int, unitIDs []string) error {
	if slot < 1 || slot > maxLoadoutSlots {
		return domain.ErrInvalidUnitSelection
	}
	return s.setPlayerLoadout(ctx, playerID, slot, unitIDs)
}

func (s *Store) setPlayerLoadout(ctx context.Context, playerID string, slot int, unitIDs []string) error {
	if playerID == "" || len(unitIDs) > maxBattleLoadout || hasDuplicates(unitIDs) {
		return domain.ErrInvalidUnitSelection
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin set player loadout: %w", err)
	}
	defer rollback(tx)
	statuses, err := lockPlayerStatuses(ctx, tx, playerID)
	if err != nil {
		return err
	}
	if err := rejectCombatPlayers(statuses, playerID); err != nil {
		return err
	}

	activeSlot, loadoutID, selectedSlot, err := lockPlayerLoadout(ctx, tx, playerID, slot)
	if err != nil {
		return err
	}
	units, err := lockPlayerLoadoutUnits(ctx, tx, playerID)
	if err != nil {
		return err
	}
	if err := validateSelectedUnits(units, unitIDs); err != nil {
		return err
	}
	if err := replaceLoadoutUnits(ctx, tx, loadoutID, unitIDs); err != nil {
		return err
	}
	if selectedSlot == activeSlot {
		if err := replaceEquippedFlags(ctx, tx, playerID, unitIDs); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit player loadout: %w", err)
	}
	return nil
}

func (s *Store) SetActivePlayerLoadout(ctx context.Context, playerID string, slot int) error {
	if playerID == "" || slot < 1 || slot > maxLoadoutSlots {
		return domain.ErrInvalidUnitSelection
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin activate player loadout: %w", err)
	}
	defer rollback(tx)
	statuses, err := lockPlayerStatuses(ctx, tx, playerID)
	if err != nil {
		return err
	}
	if err := rejectCombatPlayers(statuses, playerID); err != nil {
		return err
	}
	_, loadoutID, _, err := lockPlayerLoadout(ctx, tx, playerID, slot)
	if err != nil {
		return err
	}
	selected, err := loadoutUnitIDs(ctx, tx, loadoutID)
	if err != nil {
		return err
	}
	units, err := lockPlayerLoadoutUnits(ctx, tx, playerID)
	if err != nil {
		return err
	}
	if err := validateSelectedUnits(units, selected); err != nil {
		return err
	}
	if err := replaceEquippedFlags(ctx, tx, playerID, selected); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE players SET active_loadout_slot = $2 WHERE id = $1`, playerID, slot); err != nil {
		return fmt.Errorf("set active loadout slot: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit active player loadout: %w", err)
	}
	return nil
}

// SetUnitEquipped keeps legacy callers synchronized with the active preset.
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
	_, loadoutID, _, err := lockPlayerLoadout(ctx, tx, playerID, 0)
	if err != nil {
		return err
	}
	units, err := lockPlayerLoadoutUnits(ctx, tx, playerID)
	if err != nil {
		return err
	}

	found, alive, reserved := false, false, false
	selected := make([]string, 0, maxBattleLoadout)
	for _, unit := range units {
		if unit.id == unitID {
			found, alive, reserved = true, unit.alive, unit.reserved
			unit.equipped = equipped
		}
		if unit.equipped {
			selected = append(selected, unit.id)
		}
	}
	if !found {
		return assetOwnershipError(ctx, tx, "units", unitID, domain.ErrUnitNotFound)
	}
	if equipped && !alive {
		return domain.ErrUnitUnavailable
	}
	if equipped && reserved {
		return domain.ErrAssetReserved
	}
	if len(selected) > maxBattleLoadout {
		return domain.ErrBattleLoadoutFull
	}
	sort.Strings(selected)
	if err := replaceLoadoutUnits(ctx, tx, loadoutID, selected); err != nil {
		return err
	}
	if err := replaceEquippedFlags(ctx, tx, playerID, selected); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit unit equip flag: %w", err)
	}
	return nil
}

func lockPlayerLoadout(ctx context.Context, tx pgx.Tx, playerID string, requestedSlot int) (int, string, int, error) {
	var activeSlot int
	if err := tx.QueryRow(ctx, `SELECT active_loadout_slot FROM players WHERE id = $1`, playerID).Scan(&activeSlot); err != nil {
		return 0, "", 0, fmt.Errorf("read active loadout slot: %w", err)
	}
	selectedSlot := requestedSlot
	if selectedSlot == 0 {
		selectedSlot = activeSlot
	}
	var loadoutID string
	if err := tx.QueryRow(ctx, `
		SELECT id FROM player_loadouts
		WHERE player_id = $1 AND slot = $2
		FOR UPDATE`, playerID, selectedSlot).Scan(&loadoutID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, "", 0, fmt.Errorf("player loadout slot %d is missing", selectedSlot)
		}
		return 0, "", 0, fmt.Errorf("lock player loadout: %w", err)
	}
	return activeSlot, loadoutID, selectedSlot, nil
}

func lockPlayerLoadoutUnits(ctx context.Context, tx pgx.Tx, playerID string) ([]lockedLoadoutUnit, error) {
	rows, err := tx.Query(ctx, `
		SELECT id, is_alive, is_equipped,
		       EXISTS (
		           SELECT 1 FROM trade_assets a
		           WHERE a.unit_id = units.id AND a.reserved = true
		       )
		FROM units
		WHERE owner_id = $1
		ORDER BY id FOR UPDATE`, playerID)
	if err != nil {
		return nil, fmt.Errorf("lock units for player loadout: %w", err)
	}
	defer rows.Close()
	units := make([]lockedLoadoutUnit, 0)
	for rows.Next() {
		var unit lockedLoadoutUnit
		if err := rows.Scan(&unit.id, &unit.alive, &unit.equipped, &unit.reserved); err != nil {
			return nil, fmt.Errorf("scan unit for player loadout: %w", err)
		}
		units = append(units, unit)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate units for player loadout: %w", err)
	}
	return units, nil
}

func validateSelectedUnits(units []lockedLoadoutUnit, unitIDs []string) error {
	requested := make(map[string]struct{}, len(unitIDs))
	for _, unitID := range unitIDs {
		requested[unitID] = struct{}{}
	}
	found := 0
	for _, unit := range units {
		if _, selected := requested[unit.id]; selected {
			if !unit.alive {
				return domain.ErrUnitUnavailable
			}
			if unit.reserved {
				return domain.ErrAssetReserved
			}
			found++
		}
	}
	if found != len(unitIDs) {
		return domain.ErrAssetNotOwned
	}
	return nil
}

func replaceLoadoutUnits(ctx context.Context, tx pgx.Tx, loadoutID string, unitIDs []string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM player_loadout_units WHERE loadout_id = $1`, loadoutID); err != nil {
		return fmt.Errorf("clear player loadout: %w", err)
	}
	for position, unitID := range unitIDs {
		if _, err := tx.Exec(ctx, `
			INSERT INTO player_loadout_units (loadout_id, position, unit_id)
			VALUES ($1, $2, $3)`, loadoutID, position+1, unitID); err != nil {
			return fmt.Errorf("insert player loadout unit: %w", err)
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE player_loadouts SET updated_at = now() WHERE id = $1`, loadoutID); err != nil {
		return fmt.Errorf("touch player loadout: %w", err)
	}
	return nil
}

func removeUnitFromLoadouts(ctx context.Context, tx pgx.Tx, unitID string) error {
	if _, err := tx.Exec(ctx, `
		WITH removed AS (
			DELETE FROM player_loadout_units
			WHERE unit_id = $1
			RETURNING loadout_id
		)
		UPDATE player_loadouts
		SET updated_at = now()
		WHERE id IN (SELECT loadout_id FROM removed)`, unitID); err != nil {
		return fmt.Errorf("remove unit from player loadouts: %w", err)
	}
	return nil
}

func replaceEquippedFlags(ctx context.Context, tx pgx.Tx, playerID string, unitIDs []string) error {
	query := `UPDATE units SET is_equipped = false WHERE owner_id = $1`
	arguments := []any{playerID}
	if len(unitIDs) > 0 {
		query = `UPDATE units SET is_equipped = (id = ANY($2::uuid[])) WHERE owner_id = $1`
		arguments = append(arguments, unitIDs)
	}
	if _, err := tx.Exec(ctx, query, arguments...); err != nil {
		return fmt.Errorf("replace active loadout flags: %w", err)
	}
	return nil
}

func loadoutUnitIDs(ctx context.Context, tx pgx.Tx, loadoutID string) ([]string, error) {
	rows, err := tx.Query(ctx, `
		SELECT unit_id FROM player_loadout_units
		WHERE loadout_id = $1
		ORDER BY position`, loadoutID)
	if err != nil {
		return nil, fmt.Errorf("list loadout units: %w", err)
	}
	defer rows.Close()
	unitIDs := make([]string, 0, maxBattleLoadout)
	for rows.Next() {
		var unitID string
		if err := rows.Scan(&unitID); err != nil {
			return nil, fmt.Errorf("scan loadout unit: %w", err)
		}
		unitIDs = append(unitIDs, unitID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate loadout units: %w", err)
	}
	return unitIDs, nil
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
