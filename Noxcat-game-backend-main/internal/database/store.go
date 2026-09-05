package database

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store is the PostgreSQL persistence boundary used by HTTP handlers and
// application services.
type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

type rowScanner interface {
	Scan(dest ...any) error
}

const unitColumns = `id, owner_id, species, base_stats, current_stats,
	equipped_treasure_id, is_permanent, is_alive, is_equipped, created_at`

const treasureColumns = `id, owner_id, code, name, treasure_type, rarity,
	damage_bonus, health_bonus, defense_bonus, speed_bonus, effect_code, charges,
	equipped_by_unit_id, created_at`

func marshalStats(stats domain.Stats) ([]byte, error) {
	value, err := json.Marshal(stats)
	if err != nil {
		return nil, fmt.Errorf("marshal unit stats: %w", err)
	}
	return value, nil
}

func scanPlayer(row rowScanner) (domain.Player, error) {
	var player domain.Player
	err := row.Scan(
		&player.ID,
		&player.Username,
		&player.PasswordHash,
		&player.Role,
		&player.Money,
		&player.Status,
		&player.IsBanned,
		&player.ActiveLoadoutSlot,
		&player.CreatedAt,
	)
	return player, err
}

func scanUnit(row rowScanner) (domain.Unit, error) {
	var unit domain.Unit
	var baseStats []byte
	var currentStats []byte
	err := row.Scan(
		&unit.ID,
		&unit.OwnerID,
		&unit.Species,
		&baseStats,
		&currentStats,
		&unit.EquippedTreasureID,
		&unit.IsPermanent,
		&unit.IsAlive,
		&unit.IsEquipped,
		&unit.CreatedAt,
	)
	if err != nil {
		return unit, err
	}
	if err := json.Unmarshal(baseStats, &unit.BaseStats); err != nil {
		return unit, fmt.Errorf("decode base stats: %w", err)
	}
	if err := json.Unmarshal(currentStats, &unit.CurrentStats); err != nil {
		return unit, fmt.Errorf("decode current stats: %w", err)
	}
	return unit, nil
}

func scanTreasure(row rowScanner) (domain.Treasure, error) {
	var treasure domain.Treasure
	err := row.Scan(
		&treasure.ID,
		&treasure.OwnerID,
		&treasure.Code,
		&treasure.Name,
		&treasure.TreasureType,
		&treasure.Rarity,
		&treasure.DamageBonus,
		&treasure.HealthBonus,
		&treasure.DefenseBonus,
		&treasure.SpeedBonus,
		&treasure.EffectCode,
		&treasure.Charges,
		&treasure.EquippedByUnitID,
		&treasure.CreatedAt,
	)
	return treasure, err
}

func scanDungeon(row rowScanner) (domain.Dungeon, error) {
	var dungeon domain.Dungeon
	err := row.Scan(
		&dungeon.ID,
		&dungeon.Name,
		&dungeon.SortOrder,
		&dungeon.EnemyConfig,
		&dungeon.RewardMoney,
		&dungeon.RewardDrops,
	)
	return dungeon, err
}

func scanTrade(row rowScanner) (domain.Trade, error) {
	var trade domain.Trade
	err := row.Scan(
		&trade.ID,
		&trade.FromPlayerID,
		&trade.ToPlayerID,
		&trade.UnitID,
		&trade.TreasureID,
		&trade.Status,
		&trade.CreatedAt,
	)
	return trade, err
}

func notFound(specific error) error {
	return fmt.Errorf("%w: %w", specific, domain.ErrNotFound)
}

func usernameError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "players_username_uidx" {
		return domain.ErrUsernameTaken
	}
	return err
}

func rollback(tx pgx.Tx) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = tx.Rollback(ctx)
}
