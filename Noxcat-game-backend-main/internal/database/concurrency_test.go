package database_test

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

func TestConcurrentAcceptTradeSerializesOnRowLock(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "lock-sender", 1)
	recipient := createPlayer(t, store, "lock-recipient", 0)
	units, _ := store.ListPlayerUnits(context.Background(), sender.ID)
	trade, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID,
		ToPlayerID:   recipient.ID,
		UnitID:       stringPointer(units[0].ID),
	})
	if err != nil {
		t.Fatal(err)
	}

	const workers = 32
	start := make(chan struct{})
	errorsByWorker := make(chan error, workers)
	var waitGroup sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			<-start
			_, err := store.AcceptTrade(context.Background(), trade.ID, recipient.ID)
			errorsByWorker <- err
		}()
	}
	close(start)
	waitGroup.Wait()
	close(errorsByWorker)

	successes := 0
	for err := range errorsByWorker {
		if err == nil {
			successes++
			continue
		}
		if !errors.Is(err, domain.ErrTradeNotPending) {
			t.Errorf("AcceptTrade() concurrent error = %v, want ErrTradeNotPending", err)
		}
	}
	if successes != 1 {
		t.Fatalf("successful accepts = %d, want exactly 1", successes)
	}
}

func TestConcurrentMoneyUpdatesDoNotLoseWrites(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "money-player", 0)

	const workers = 24
	const incrementsPerWorker = 20
	start := make(chan struct{})
	var waitGroup sync.WaitGroup
	var failures atomic.Int32
	for worker := 0; worker < workers; worker++ {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			<-start
			for increment := 0; increment < incrementsPerWorker; increment++ {
				if err := store.AdjustPlayerMoney(context.Background(), player.ID, 1); err != nil {
					failures.Add(1)
				}
			}
		}()
	}
	close(start)
	waitGroup.Wait()

	if failures.Load() != 0 {
		t.Fatalf("concurrent update failures = %d", failures.Load())
	}
	loaded, err := store.PlayerByID(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	want := 100 + workers*incrementsPerWorker
	if loaded.Money != want {
		t.Fatalf("money after concurrent updates = %d, want %d", loaded.Money, want)
	}
}

func TestConcurrentLoadoutChangesNeverExceedThree(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "concurrent-loadout-player", 8)
	units, err := store.ListPlayerUnits(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetBattleLoadout(context.Background(), player.ID, nil); err != nil {
		t.Fatalf("clear battle loadout: %v", err)
	}

	start := make(chan struct{})
	errorsByWorker := make(chan error, len(units))
	var waitGroup sync.WaitGroup
	for _, unit := range units {
		unitID := unit.ID
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			<-start
			errorsByWorker <- store.SetUnitEquipped(context.Background(), player.ID, unitID, true)
		}()
	}
	close(start)
	waitGroup.Wait()
	close(errorsByWorker)

	successes := 0
	for err := range errorsByWorker {
		if err == nil {
			successes++
			continue
		}
		if !errors.Is(err, domain.ErrBattleLoadoutFull) {
			t.Errorf("concurrent loadout error = %v, want ErrBattleLoadoutFull", err)
		}
	}
	if successes != 3 {
		t.Fatalf("successful loadout additions = %d, want exactly 3", successes)
	}

	loadedUnits, err := store.ListPlayerUnits(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	equippedCount := 0
	for _, unit := range loadedUnits {
		if unit.IsEquipped {
			equippedCount++
		}
	}
	if equippedCount != 3 {
		t.Fatalf("equipped unit count = %d, want 3", equippedCount)
	}
}
