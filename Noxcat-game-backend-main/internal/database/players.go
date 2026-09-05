package database

import (
	"context"
	"errors"
	"fmt"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/jackc/pgx/v5"
)

const playerColumns = `id, username, password_hash, role, money, status, is_banned, active_loadout_slot, created_at`

// CreatePlayer creates the player and all starting units atomically.
func (s *Store) CreatePlayer(ctx context.Context, input domain.NewPlayer) (domain.Player, error) {
	if input.Username == "" || input.PasswordHash == "" || input.StartingMoney < 0 {
		return domain.Player{}, domain.ErrInvalidInput
	}
	equippedCount := 0
	for _, unit := range input.StartingUnits {
		if unit.IsEquipped {
			equippedCount++
		}
		if equippedCount > 3 {
			return domain.Player{}, domain.ErrBattleLoadoutFull
		}
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return domain.Player{}, fmt.Errorf("begin create player: %w", err)
	}
	defer rollback(tx)

	player, err := scanPlayer(tx.QueryRow(ctx, `
		INSERT INTO players (username, password_hash, money)
		VALUES ($1, $2, $3)
		RETURNING `+playerColumns,
		input.Username, input.PasswordHash, input.StartingMoney,
	))
	if err != nil {
		return domain.Player{}, fmt.Errorf("insert player: %w", usernameError(err))
	}

	equippedUnitIDs := make([]string, 0, maxBattleLoadout)
	for _, unit := range input.StartingUnits {
		baseStats, err := marshalStats(unit.BaseStats)
		if err != nil {
			return domain.Player{}, err
		}
		var unitID string
		if err := tx.QueryRow(ctx, `
			INSERT INTO units (
				owner_id, species, base_stats, current_stats, is_permanent, is_equipped
			) VALUES ($1, $2, $3, $3, $4, $5)
			RETURNING id`,
			player.ID, unit.Species, baseStats, unit.IsPermanent, unit.IsEquipped,
		).Scan(&unitID); err != nil {
			return domain.Player{}, fmt.Errorf("insert starting unit: %w", err)
		}
		if unit.IsEquipped {
			equippedUnitIDs = append(equippedUnitIDs, unitID)
		}
	}

	loadoutIDs := make([]string, maxLoadoutSlots)
	for slot := 1; slot <= maxLoadoutSlots; slot++ {
		if err := tx.QueryRow(ctx, `
			INSERT INTO player_loadouts (player_id, slot, name)
			VALUES ($1, $2, $3)
			RETURNING id`, player.ID, slot, fmt.Sprintf("Loadout %d", slot),
		).Scan(&loadoutIDs[slot-1]); err != nil {
			return domain.Player{}, fmt.Errorf("insert player loadout: %w", err)
		}
	}
	for position, unitID := range equippedUnitIDs {
		if _, err := tx.Exec(ctx, `
			INSERT INTO player_loadout_units (loadout_id, position, unit_id)
			VALUES ($1, $2, $3)`, loadoutIDs[0], position+1, unitID,
		); err != nil {
			return domain.Player{}, fmt.Errorf("insert starting loadout unit: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.Player{}, fmt.Errorf("commit create player: %w", err)
	}
	return player, nil
}

func (s *Store) PlayerByID(ctx context.Context, playerID string) (domain.Player, error) {
	player, err := scanPlayer(s.db.QueryRow(ctx,
		`SELECT `+playerColumns+` FROM players WHERE id = $1`, playerID,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Player{}, notFound(domain.ErrPlayerNotFound)
	}
	if err != nil {
		return domain.Player{}, fmt.Errorf("get player by id: %w", err)
	}
	return player, nil
}

// PlayerByUsername provides the password hash required by the login endpoint.
func (s *Store) PlayerByUsername(ctx context.Context, username string) (domain.Player, error) {
	player, err := scanPlayer(s.db.QueryRow(ctx,
		`SELECT `+playerColumns+` FROM players WHERE username = $1`, username,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Player{}, notFound(domain.ErrPlayerNotFound)
	}
	if err != nil {
		return domain.Player{}, fmt.Errorf("get player by username: %w", err)
	}
	return player, nil
}

func (s *Store) PlayerStatus(ctx context.Context, playerID string) (domain.PlayerStatus, error) {
	var status domain.PlayerStatus
	err := s.db.QueryRow(ctx, `SELECT status FROM players WHERE id = $1`, playerID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", notFound(domain.ErrPlayerNotFound)
	}
	if err != nil {
		return "", fmt.Errorf("get player status: %w", err)
	}
	return status, nil
}

func (s *Store) ListPlayerUnits(ctx context.Context, playerID string) ([]domain.Unit, error) {
	rows, err := s.db.Query(ctx, `
		SELECT `+unitColumns+`
		FROM units
		WHERE owner_id = $1
		ORDER BY created_at, id`, playerID)
	if err != nil {
		return nil, fmt.Errorf("list player units: %w", err)
	}
	defer rows.Close()

	units := make([]domain.Unit, 0)
	for rows.Next() {
		unit, err := scanUnit(rows)
		if err != nil {
			return nil, fmt.Errorf("scan player unit: %w", err)
		}
		units = append(units, unit)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate player units: %w", err)
	}
	if len(units) == 0 {
		if err := s.ensurePlayerExists(ctx, playerID); err != nil {
			return nil, err
		}
	}
	return units, nil
}

func (s *Store) ListPlayerDungeonProgress(ctx context.Context, playerID string) ([]domain.PlayerDungeonProgress, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, player_id, dungeon_id, solved, solved_at
		FROM player_dungeon_progress
		WHERE player_id = $1 AND solved = true
		ORDER BY solved_at, dungeon_id`, playerID)
	if err != nil {
		return nil, fmt.Errorf("list solved dungeons: %w", err)
	}
	defer rows.Close()

	progress := make([]domain.PlayerDungeonProgress, 0)
	for rows.Next() {
		var item domain.PlayerDungeonProgress
		if err := rows.Scan(&item.ID, &item.PlayerID, &item.DungeonID, &item.Solved, &item.SolvedAt); err != nil {
			return nil, fmt.Errorf("scan dungeon progress: %w", err)
		}
		progress = append(progress, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate dungeon progress: %w", err)
	}
	if len(progress) == 0 {
		if err := s.ensurePlayerExists(ctx, playerID); err != nil {
			return nil, err
		}
	}
	return progress, nil
}

// ListSolvedDungeons returns the dungeon resources expected by
// GET /players/:id/dungeons rather than exposing join-table details.
func (s *Store) ListSolvedDungeons(ctx context.Context, playerID string) ([]domain.Dungeon, error) {
	rows, err := s.db.Query(ctx, `
		SELECT d.id, d.name, d.sort_order, d.enemy_config, d.reward_money, d.reward_drops
		FROM dungeons d
		JOIN player_dungeon_progress p ON p.dungeon_id = d.id
		WHERE p.player_id = $1 AND p.solved = true
		ORDER BY p.solved_at, d.id`, playerID)
	if err != nil {
		return nil, fmt.Errorf("list solved dungeons: %w", err)
	}
	defer rows.Close()

	dungeons := make([]domain.Dungeon, 0)
	for rows.Next() {
		dungeon, err := scanDungeon(rows)
		if err != nil {
			return nil, fmt.Errorf("scan solved dungeon: %w", err)
		}
		dungeons = append(dungeons, dungeon)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate solved dungeons: %w", err)
	}
	if len(dungeons) == 0 {
		if err := s.ensurePlayerExists(ctx, playerID); err != nil {
			return nil, err
		}
	}
	return dungeons, nil
}

func (s *Store) ensurePlayerExists(ctx context.Context, playerID string) error {
	var exists bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM players WHERE id = $1)`, playerID).Scan(&exists); err != nil {
		return fmt.Errorf("check player existence: %w", err)
	}
	if !exists {
		return notFound(domain.ErrPlayerNotFound)
	}
	return nil
}

func (s *Store) BanPlayer(ctx context.Context, playerID string) error {
	command, err := s.db.Exec(ctx, `UPDATE players SET is_banned = true WHERE id = $1`, playerID)
	if err != nil {
		return fmt.Errorf("ban player: %w", err)
	}
	if command.RowsAffected() == 0 {
		return notFound(domain.ErrPlayerNotFound)
	}
	return nil
}

func (s *Store) AdjustPlayerMoney(ctx context.Context, playerID string, delta int) error {
	command, err := s.db.Exec(ctx, `
		UPDATE players SET money = money + $2
		WHERE id = $1 AND money + $2 >= 0`, playerID, delta)
	if err != nil {
		return fmt.Errorf("adjust player money: %w", err)
	}
	if command.RowsAffected() == 0 {
		var exists bool
		if err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM players WHERE id = $1)`, playerID).Scan(&exists); err != nil {
			return fmt.Errorf("check player after money adjustment: %w", err)
		}
		if !exists {
			return notFound(domain.ErrPlayerNotFound)
		}
		return domain.ErrInvalidInput
	}
	return nil
}
