package database_test

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/database"
	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

var defaultStats = domain.Stats{Attack: 5, Health: 20, Defense: 3, Speed: 4}
var battleTokenSequence atomic.Uint64

func resetDatabase(ctx context.Context) error {
	_, err := testPool.Exec(ctx, `
		TRUNCATE TABLE
			battle_sessions,
			trades,
			player_dungeon_progress,
			treasures,
			units,
			dungeons,
			players
		RESTART IDENTITY CASCADE`)
	return err
}

func newStoreTest(t *testing.T) *database.Store {
	t.Helper()
	if testPool == nil {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	if err := resetDatabase(context.Background()); err != nil {
		t.Fatalf("reset database before test: %v", err)
	}
	t.Cleanup(func() {
		if err := resetDatabase(context.Background()); err != nil {
			t.Errorf("reset database after test: %v", err)
		}
	})
	return database.NewStore(testPool)
}

func createPlayer(t *testing.T, store *database.Store, username string, unitCount int) domain.Player {
	t.Helper()
	units := make([]domain.NewUnit, unitCount)
	for index := range units {
		units[index] = domain.NewUnit{
			Species:     domain.UnitSpeciesGeneric,
			BaseStats:   defaultStats,
			IsPermanent: true,
			IsEquipped:  index < 3,
		}
	}
	player, err := store.CreatePlayer(context.Background(), domain.NewPlayer{
		Username:      username,
		PasswordHash:  "bcrypt-hash",
		StartingMoney: 100,
		StartingUnits: units,
	})
	if err != nil {
		t.Fatalf("create player %q: %v", username, err)
	}
	return player
}

func createDungeon(t *testing.T, store *database.Store) domain.Dungeon {
	t.Helper()
	dungeon, err := store.CreateDungeon(context.Background(), domain.Dungeon{
		Name:        "First Dungeon",
		EnemyConfig: json.RawMessage(`[{"species":"fire","atk":2}]`),
		RewardMoney: 25,
		RewardDrops: json.RawMessage(`[{"damage_bonus":1}]`),
	})
	if err != nil {
		t.Fatalf("create dungeon: %v", err)
	}
	return dungeon
}

func createTreasure(t *testing.T, ownerID string, damageBonus int) domain.Treasure {
	t.Helper()
	var treasure domain.Treasure
	err := testPool.QueryRow(context.Background(), `
		INSERT INTO treasures (owner_id, damage_bonus)
		VALUES ($1, $2)
		RETURNING id, owner_id, damage_bonus, equipped_by_unit_id, created_at`,
		ownerID, damageBonus,
	).Scan(
		&treasure.ID,
		&treasure.OwnerID,
		&treasure.DamageBonus,
		&treasure.EquippedByUnitID,
		&treasure.CreatedAt,
	)
	if err != nil {
		t.Fatalf("create treasure: %v", err)
	}
	return treasure
}

func stringPointer(value string) *string {
	return &value
}

func startBattleSession(store *database.Store, ctx context.Context, playerID, dungeonID string) (domain.BattleSnapshot, error) {
	sequence := battleTokenSequence.Add(1)
	hash := sha256.Sum256([]byte(fmt.Sprintf("database-test-battle-%d", sequence)))
	return store.StartBattleSession(ctx, playerID, dungeonID, hash, time.Now().Add(time.Hour))
}

func settleActiveBattleSession(store *database.Store, ctx context.Context, result domain.BattleResult) error {
	if result.SessionID == "" {
		if err := testPool.QueryRow(ctx, `
			SELECT id FROM battle_sessions
			WHERE player_id = $1 AND status = 'active'`, result.PlayerID,
		).Scan(&result.SessionID); err != nil {
			return err
		}
	}
	return store.SettleBattleSession(ctx, result)
}
