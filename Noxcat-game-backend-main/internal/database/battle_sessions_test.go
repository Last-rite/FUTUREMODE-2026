package database_test

import (
	"context"
	"crypto/sha256"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

func TestBattleSessionStartIsAtomicAndDurable(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "session_start", 3)
	dungeon := createDungeon(t, store)
	hash := sha256.Sum256([]byte("battle-token"))
	expires := time.Now().Add(time.Hour)
	snapshot, err := store.StartBattleSession(context.Background(), player.ID, dungeon.ID, hash, expires)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.PlayerID != player.ID || len(snapshot.Units) != 3 {
		t.Fatalf("snapshot=%+v", snapshot)
	}
	session, err := store.BattleSessionByTokenHash(context.Background(), hash)
	if err != nil {
		t.Fatal(err)
	}
	if session.PlayerID != player.ID || session.DungeonID != dungeon.ID || session.Status != domain.BattleSessionActive || len(session.Snapshot.Units) != 3 {
		t.Fatalf("session=%+v", session)
	}
	status, err := store.PlayerStatus(context.Background(), player.ID)
	if err != nil || status != domain.PlayerStatusCombat {
		t.Fatalf("status=%q err=%v", status, err)
	}
}

func TestBattleSessionRecoversExpiredBattleOnNextStart(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "session_recover", 1)
	dungeon := createDungeon(t, store)
	firstHash := sha256.Sum256([]byte("first-token"))
	if _, err := store.StartBattleSession(context.Background(), player.ID, dungeon.ID, firstHash, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(context.Background(), `UPDATE battle_sessions SET created_at=now()-interval '2 hours', expires_at=now()-interval '1 hour' WHERE token_hash=$1`, firstHash[:]); err != nil {
		t.Fatal(err)
	}
	secondHash := sha256.Sum256([]byte("second-token"))
	if _, err := store.StartBattleSession(context.Background(), player.ID, dungeon.ID, secondHash, time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("start after expiry: %v", err)
	}
	first, err := store.BattleSessionByTokenHash(context.Background(), firstHash)
	if err != nil {
		t.Fatal(err)
	}
	if first.Status != domain.BattleSessionExpired || first.CompletedAt == nil {
		t.Fatalf("first session=%+v", first)
	}
	second, err := store.BattleSessionByTokenHash(context.Background(), secondHash)
	if err != nil || second.Status != domain.BattleSessionActive {
		t.Fatalf("second=%+v err=%v", second, err)
	}
}

func TestCancelBattleSessionOnlyResetsItsOwner(t *testing.T) {
	store := newStoreTest(t)
	owner := createPlayer(t, store, "session_owner", 1)
	other := createPlayer(t, store, "session_other", 1)
	dungeon := createDungeon(t, store)
	hash := sha256.Sum256([]byte("cancel-token"))
	if _, err := store.StartBattleSession(context.Background(), owner.ID, dungeon.ID, hash, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	session, _ := store.BattleSessionByTokenHash(context.Background(), hash)
	if err := store.CancelBattleSession(context.Background(), session.ID, other.ID); !errors.Is(err, domain.ErrBattleResultMismatch) {
		t.Fatalf("foreign cancel error=%v", err)
	}
	status, _ := store.PlayerStatus(context.Background(), owner.ID)
	if status != domain.PlayerStatusCombat {
		t.Fatalf("foreign cancel changed owner status to %q", status)
	}
	if err := store.CancelBattleSession(context.Background(), session.ID, owner.ID); err != nil {
		t.Fatal(err)
	}
	if err := store.CancelBattleSession(context.Background(), session.ID, owner.ID); err != nil {
		t.Fatalf("idempotent cancel: %v", err)
	}
	status, _ = store.PlayerStatus(context.Background(), owner.ID)
	if status != domain.PlayerStatusIdle {
		t.Fatalf("owner status=%q", status)
	}
	newHash := sha256.Sum256([]byte("new-active-token"))
	if _, err := store.StartBattleSession(context.Background(), owner.ID, dungeon.ID, newHash, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := store.CancelBattleSession(context.Background(), session.ID, owner.ID); err != nil {
		t.Fatalf("repeat old cancellation: %v", err)
	}
	status, _ = store.PlayerStatus(context.Background(), owner.ID)
	if status != domain.PlayerStatusCombat {
		t.Fatalf("old cancellation reset a newer battle: status=%q", status)
	}
}

func TestSettleBattleSessionAwardsOnlyOnceUnderConcurrency(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "session_settle", 1)
	dungeon := createDungeon(t, store)
	hash := sha256.Sum256([]byte("settle-token"))
	snapshot, err := store.StartBattleSession(context.Background(), player.ID, dungeon.ID, hash, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	session, _ := store.BattleSessionByTokenHash(context.Background(), hash)
	result := domain.BattleResult{SessionID: session.ID, PlayerID: player.ID, DungeonID: dungeon.ID, Won: true, MoneyAward: 25, Units: []domain.UnitSettlement{{UnitID: snapshot.Units[0].ID, CurrentStats: snapshot.Units[0].CurrentStats, IsAlive: true}}}
	start := make(chan struct{})
	errorsOut := make(chan error, 2)
	var workers sync.WaitGroup
	for range 2 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			<-start
			errorsOut <- store.SettleBattleSession(context.Background(), result)
		}()
	}
	close(start)
	workers.Wait()
	close(errorsOut)
	successes := 0
	for err := range errorsOut {
		if err == nil {
			successes++
		} else if !errors.Is(err, domain.ErrPlayerNotInCombat) && !errors.Is(err, domain.ErrBattleNotActive) {
			t.Fatalf("unexpected settle error: %v", err)
		}
	}
	if successes != 1 {
		t.Fatalf("successful settlements=%d", successes)
	}
	var money int
	if err := testPool.QueryRow(context.Background(), `SELECT money FROM players WHERE id=$1`, player.ID).Scan(&money); err != nil {
		t.Fatal(err)
	}
	if money != 125 {
		t.Fatalf("money=%d, want 125", money)
	}
}

func TestExpireBattleSessionsResetsAbandonedPlayers(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "session_cleanup", 1)
	dungeon := createDungeon(t, store)
	hash := sha256.Sum256([]byte("cleanup-token"))
	if _, err := store.StartBattleSession(context.Background(), player.ID, dungeon.ID, hash, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(context.Background(), `UPDATE battle_sessions SET created_at=now()-interval '2 hours', expires_at=now()-interval '1 hour' WHERE token_hash=$1`, hash[:]); err != nil {
		t.Fatal(err)
	}
	count, err := store.ExpireBattleSessions(context.Background(), 100)
	if err != nil || count != 1 {
		t.Fatalf("count=%d err=%v", count, err)
	}
	status, _ := store.PlayerStatus(context.Background(), player.ID)
	if status != domain.PlayerStatusIdle {
		t.Fatalf("status=%q", status)
	}
}

func TestCleanupAndRestartUseDeadlockSafeLockOrder(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "session_cleanup_race", 1)
	dungeon := createDungeon(t, store)
	oldHash := sha256.Sum256([]byte("old-race-token"))
	if _, err := store.StartBattleSession(context.Background(), player.ID, dungeon.ID, oldHash, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(context.Background(), `UPDATE battle_sessions SET created_at=now()-interval '2 hours', expires_at=now()-interval '1 hour' WHERE token_hash=$1`, oldHash[:]); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	start := make(chan struct{})
	errorsOut := make(chan error, 2)
	newHash := sha256.Sum256([]byte("new-race-token"))
	go func() {
		<-start
		_, err := store.StartBattleSession(ctx, player.ID, dungeon.ID, newHash, time.Now().Add(time.Hour))
		errorsOut <- err
	}()
	go func() { <-start; _, err := store.ExpireBattleSessions(ctx, 100); errorsOut <- err }()
	close(start)
	for range 2 {
		if err := <-errorsOut; err != nil {
			t.Fatalf("concurrent cleanup/start: %v", err)
		}
	}
	var activeCount int
	if err := testPool.QueryRow(context.Background(), `SELECT count(*) FROM battle_sessions WHERE player_id=$1 AND status='active'`, player.ID).Scan(&activeCount); err != nil {
		t.Fatal(err)
	}
	if activeCount != 1 {
		t.Fatalf("active sessions=%d", activeCount)
	}
	status, _ := store.PlayerStatus(context.Background(), player.ID)
	if status != domain.PlayerStatusCombat {
		t.Fatalf("status=%q", status)
	}
}
