package database_test

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/jackc/pgx/v5/pgconn"
)

const deadlockTestTimeout = 5 * time.Second

func runSimultaneously(t *testing.T, operations ...func(context.Context) error) []error {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), deadlockTestTimeout)
	defer cancel()

	start := make(chan struct{})
	results := make([]error, len(operations))
	var waitGroup sync.WaitGroup
	for index, operation := range operations {
		index, operation := index, operation
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			<-start
			results[index] = operation(ctx)
		}()
	}
	close(start)
	waitGroup.Wait()

	for index, err := range results {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "40P01" {
			t.Errorf("operation %d encountered PostgreSQL deadlock: %v", index, err)
		}
		if errors.Is(err, context.DeadlineExceeded) {
			t.Errorf("operation %d exceeded %s: %v", index, deadlockTestTimeout, err)
		}
	}
	return results
}

func TestCrossTradeAcceptsDoNotDeadlock(t *testing.T) {
	store := newStoreTest(t)
	first := createPlayer(t, store, "cross-trade-first", 1)
	second := createPlayer(t, store, "cross-trade-second", 1)
	firstUnits, _ := store.ListPlayerUnits(context.Background(), first.ID)
	secondUnits, _ := store.ListPlayerUnits(context.Background(), second.ID)
	firstTrade, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: first.ID,
		ToPlayerID:   second.ID,
		UnitID:       stringPointer(firstUnits[0].ID),
	})
	if err != nil {
		t.Fatal(err)
	}
	secondTrade, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: second.ID,
		ToPlayerID:   first.ID,
		UnitID:       stringPointer(secondUnits[0].ID),
	})
	if err != nil {
		t.Fatal(err)
	}

	results := runSimultaneously(t,
		func(ctx context.Context) error {
			_, err := store.AcceptTrade(ctx, firstTrade.ID, second.ID)
			return err
		},
		func(ctx context.Context) error {
			_, err := store.AcceptTrade(ctx, secondTrade.ID, first.ID)
			return err
		},
	)
	for index, err := range results {
		if err != nil {
			t.Fatalf("cross-trade accept %d error = %v", index, err)
		}
	}
}

func TestCreateTradeAndAcceptTradeDoNotInvertPlayerUnitLocks(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "create-accept-sender", 12)
	recipient := createPlayer(t, store, "create-accept-recipient", 0)
	units, _ := store.ListPlayerUnits(context.Background(), sender.ID)

	for round, unit := range units {
		existing, err := store.CreateTrade(context.Background(), domain.NewTrade{
			FromPlayerID: sender.ID,
			ToPlayerID:   recipient.ID,
			UnitID:       stringPointer(unit.ID),
		})
		if err != nil {
			t.Fatalf("round %d create initial trade: %v", round, err)
		}

		results := runSimultaneously(t,
			func(ctx context.Context) error {
				_, err := store.CreateTrade(ctx, domain.NewTrade{
					FromPlayerID: sender.ID,
					ToPlayerID:   recipient.ID,
					UnitID:       stringPointer(unit.ID),
				})
				return err
			},
			func(ctx context.Context) error {
				_, err := store.AcceptTrade(ctx, existing.ID, recipient.ID)
				return err
			},
		)
		if results[1] != nil {
			t.Fatalf("round %d AcceptTrade() error = %v", round, results[1])
		}
		if results[0] != nil && !errors.Is(results[0], domain.ErrAssetNotOwned) {
			t.Fatalf("round %d concurrent CreateTrade() error = %v", round, results[0])
		}
	}
}

func TestConcurrentTreasureEquipmentUsesStableUnitTreasureOrder(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "concurrent-equipment-player", 12)
	units, _ := store.ListPlayerUnits(context.Background(), player.ID)
	operations := make([]func(context.Context) error, len(units))
	for index, unit := range units {
		treasure := createTreasure(t, player.ID, index+1)
		unitID, treasureID := unit.ID, treasure.ID
		operations[index] = func(ctx context.Context) error {
			return store.EquipTreasure(ctx, player.ID, treasureID, unitID)
		}

	}
	results := runSimultaneously(t, operations...)
	for index, err := range results {
		if err != nil {
			t.Fatalf("equipment operation %d error = %v", index, err)
		}
	}
}

func TestConcurrentBattleStartAndLoadoutChangeStayConsistent(t *testing.T) {
	store := newStoreTest(t)
	dungeon := createDungeon(t, store)
	for round := 0; round < 20; round++ {
		player := createPlayer(t, store, fmt.Sprintf("start-loadout-%d", round), 4)
		units, _ := store.ListPlayerUnits(context.Background(), player.ID)
		selectedID := units[3].ID
		var snapshot domain.BattleSnapshot
		results := runSimultaneously(t,
			func(ctx context.Context) error {
				var err error
				snapshot, err = startBattleSession(store, ctx, player.ID, dungeon.ID)
				return err
			},
			func(ctx context.Context) error {
				return store.SetBattleLoadout(ctx, player.ID, []string{selectedID})
			},
		)
		if results[0] != nil {
			t.Fatalf("round %d StartBattleSession() error = %v", round, results[0])
		}
		if results[1] != nil && !errors.Is(results[1], domain.ErrPlayerBusy) {
			t.Fatalf("round %d SetBattleLoadout() error = %v, want nil or ErrPlayerBusy", round, results[1])
		}
		if results[1] == nil {
			if len(snapshot.Units) != 1 || snapshot.Units[0].ID != selectedID {
				t.Fatalf("round %d snapshot does not contain committed loadout: %+v", round, snapshot.Units)
			}
		} else if len(snapshot.Units) != 3 {
			t.Fatalf("round %d snapshot unit count = %d, want original 3", round, len(snapshot.Units))
		}
	}
}

func TestConcurrentBattleStartAndTreasureEquipStayConsistent(t *testing.T) {
	store := newStoreTest(t)
	dungeon := createDungeon(t, store)
	for round := 0; round < 20; round++ {
		player := createPlayer(t, store, fmt.Sprintf("start-equip-%d", round), 1)
		units, _ := store.ListPlayerUnits(context.Background(), player.ID)
		treasure := createTreasure(t, player.ID, 3)
		var snapshot domain.BattleSnapshot
		results := runSimultaneously(t,
			func(ctx context.Context) error {
				var err error
				snapshot, err = startBattleSession(store, ctx, player.ID, dungeon.ID)
				return err
			},
			func(ctx context.Context) error {
				return store.EquipTreasure(ctx, player.ID, treasure.ID, units[0].ID)
			},
		)
		if results[0] != nil {
			t.Fatalf("round %d StartBattleSession() error = %v", round, results[0])
		}
		if results[1] != nil && !errors.Is(results[1], domain.ErrPlayerBusy) {
			t.Fatalf("round %d EquipTreasure() error = %v, want nil or ErrPlayerBusy", round, results[1])
		}
		got := snapshot.Units[0]
		if results[1] == nil {
			if got.EquippedTreasureID == nil || *got.EquippedTreasureID != treasure.ID || got.CurrentStats.Attack != units[0].BaseStats.Attack+3 {
				t.Fatalf("round %d snapshot does not contain committed treasure: %+v", round, got)
			}
		} else if got.EquippedTreasureID != nil || got.CurrentStats != units[0].CurrentStats {
			t.Fatalf("round %d busy equipment changed snapshot: %+v", round, got)
		}
	}
}

func TestBattleSettlementAndTradeAcceptanceDoNotDeadlock(t *testing.T) {
	store := newStoreTest(t)
	dungeon := createDungeon(t, store)
	for round := 0; round < 20; round++ {
		fighter := createPlayer(t, store, fmt.Sprintf("settlement-trade-fighter-%d", round), 1)
		recipient := createPlayer(t, store, fmt.Sprintf("settlement-trade-recipient-%d", round), 0)
		units, _ := store.ListPlayerUnits(context.Background(), fighter.ID)
		trade, err := store.CreateTrade(context.Background(), domain.NewTrade{
			FromPlayerID: fighter.ID,
			ToPlayerID:   recipient.ID,
			UnitID:       stringPointer(units[0].ID),
		})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := startBattleSession(store, context.Background(), fighter.ID, dungeon.ID); err != nil {
			t.Fatal(err)
		}
		result := domain.BattleResult{
			PlayerID: fighter.ID, DungeonID: dungeon.ID,
			Units: []domain.UnitSettlement{{UnitID: units[0].ID, CurrentStats: units[0].CurrentStats, IsAlive: true}},
		}
		results := runSimultaneously(t,
			func(ctx context.Context) error {
				return settleActiveBattleSession(store, ctx, result)
			},
			func(ctx context.Context) error {
				_, err := store.AcceptTrade(ctx, trade.ID, recipient.ID)
				return err
			},
		)
		if results[0] != nil {
			t.Fatalf("round %d SettleBattleSession() error = %v", round, results[0])
		}
		if results[1] != nil && !errors.Is(results[1], domain.ErrPlayerBusy) {
			t.Fatalf("round %d AcceptTrade() error = %v, want nil or ErrPlayerBusy", round, results[1])
		}
	}
}

func TestEquipTreasureAndCreateTradeDoNotDeadlock(t *testing.T) {
	store := newStoreTest(t)
	owner := createPlayer(t, store, "equip-trade-owner", 1)
	recipient := createPlayer(t, store, "equip-trade-recipient", 0)
	units, _ := store.ListPlayerUnits(context.Background(), owner.ID)
	treasure := createTreasure(t, owner.ID, 3)

	results := runSimultaneously(t,
		func(ctx context.Context) error {
			return store.EquipTreasure(ctx, owner.ID, treasure.ID, units[0].ID)
		},
		func(ctx context.Context) error {
			_, err := store.CreateTrade(ctx, domain.NewTrade{
				FromPlayerID: owner.ID,
				ToPlayerID:   recipient.ID,
				UnitID:       stringPointer(units[0].ID),
			})
			return err
		},
	)
	if results[0] != nil {
		t.Fatalf("EquipTreasure() error = %v", results[0])
	}
	if results[1] != nil && !errors.Is(results[1], domain.ErrAlreadyEquipped) {
		t.Fatalf("CreateTrade() error = %v, want nil or ErrAlreadyEquipped", results[1])
	}
}
