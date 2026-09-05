package database

import (
	"context"
	"errors"
	"fmt"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/jackc/pgx/v5"
)

const dungeonColumns = `id, name, enemy_config, reward_money, reward_drops`

func (s *Store) CreateDungeon(ctx context.Context, dungeon domain.Dungeon) (domain.Dungeon, error) {
	if dungeon.Name == "" || len(dungeon.EnemyConfig) == 0 || dungeon.RewardMoney < 0 {
		return domain.Dungeon{}, domain.ErrInvalidInput
	}
	created, err := scanDungeon(s.db.QueryRow(ctx, `
		INSERT INTO dungeons (name, enemy_config, reward_money, reward_drops)
		VALUES ($1, $2, $3, $4)
		RETURNING `+dungeonColumns,
		dungeon.Name, dungeon.EnemyConfig, dungeon.RewardMoney, nullableJSON(dungeon.RewardDrops),
	))
	if err != nil {
		return domain.Dungeon{}, fmt.Errorf("create dungeon: %w", err)
	}
	return created, nil
}

func (s *Store) UpdateDungeon(ctx context.Context, dungeon domain.Dungeon) (domain.Dungeon, error) {
	if dungeon.ID == "" || dungeon.Name == "" || len(dungeon.EnemyConfig) == 0 || dungeon.RewardMoney < 0 {
		return domain.Dungeon{}, domain.ErrInvalidInput
	}
	updated, err := scanDungeon(s.db.QueryRow(ctx, `
		UPDATE dungeons
		SET name = $2, enemy_config = $3, reward_money = $4, reward_drops = $5
		WHERE id = $1
		RETURNING `+dungeonColumns,
		dungeon.ID, dungeon.Name, dungeon.EnemyConfig, dungeon.RewardMoney, nullableJSON(dungeon.RewardDrops),
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Dungeon{}, notFound(domain.ErrDungeonNotFound)
	}
	if err != nil {
		return domain.Dungeon{}, fmt.Errorf("update dungeon: %w", err)
	}
	return updated, nil
}

func nullableJSON(value []byte) any {
	if len(value) == 0 {
		return nil
	}
	return value
}
