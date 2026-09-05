package battle

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/database"
	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/Ian747-tw/noxcat_game_backend/internal/httpapi"
)

const (
	testPlayerID  = "11111111-1111-4111-8111-111111111111"
	testUnitID    = "33333333-3333-4333-8333-333333333333"
	testDungeonID = "55555555-5555-4555-8555-555555555555"
)

type fakeRepository struct {
	startFn  func(context.Context, string, string, [sha256.Size]byte, time.Time) (domain.BattleSnapshot, error)
	loadFn   func(context.Context, [sha256.Size]byte) (domain.BattleSession, error)
	settleFn func(context.Context, domain.BattleResult) error
	cancelFn func(context.Context, string, string) error
}

func (f *fakeRepository) StartBattleSession(ctx context.Context, p, d string, h [sha256.Size]byte, e time.Time) (domain.BattleSnapshot, error) {
	return f.startFn(ctx, p, d, h, e)
}
func (f *fakeRepository) BattleSessionByTokenHash(ctx context.Context, h [sha256.Size]byte) (domain.BattleSession, error) {
	return f.loadFn(ctx, h)
}
func (f *fakeRepository) SettleBattleSession(ctx context.Context, r domain.BattleResult) error {
	return f.settleFn(ctx, r)
}
func (f *fakeRepository) CancelBattleSession(ctx context.Context, s, p string) error {
	return f.cancelFn(ctx, s, p)
}

var _ Repository = (*fakeRepository)(nil)
var _ Repository = (*database.Store)(nil)
var _ httpapi.BattleService = (*Service)(nil)

func testSnapshot() domain.BattleSnapshot {
	return domain.BattleSnapshot{PlayerID: testPlayerID, Dungeon: domain.Dungeon{ID: testDungeonID, RewardMoney: 25, RewardDrops: json.RawMessage(`[{"damage_bonus":3}]`)}, Units: []domain.Unit{{ID: testUnitID, OwnerID: testPlayerID, Species: domain.UnitSpeciesFire, BaseStats: domain.Stats{Attack: 5, Health: 20, Defense: 3, Speed: 4}, CurrentStats: domain.Stats{Attack: 5, Health: 20, Defense: 3, Speed: 4}, IsAlive: true, IsEquipped: true}}}
}

func finalUnit(snapshot domain.BattleSnapshot, health int, alive bool) json.RawMessage {
	u := snapshot.Units[0]
	current := u.CurrentStats
	current.Health = health
	raw, _ := json.Marshal(map[string]any{"id": u.ID, "owner_id": u.OwnerID, "species": u.Species, "base_stats": u.BaseStats, "current_stats": current, "equipped_treasure_id": u.EquippedTreasureID, "is_permanent": u.IsPermanent, "is_alive": alive, "is_equipped": u.IsEquipped})
	return raw
}

func serviceFor(t *testing.T, repo Repository, now *time.Time) *Service {
	t.Helper()
	service, err := NewService(Config{Repository: repo, SessionTTL: time.Hour, Now: func() time.Time { return *now }, Random: strings.NewReader(strings.Repeat("r", tokenBytes))})
	if err != nil {
		t.Fatal(err)
	}
	return service
}

func TestStartCreatesDurableSessionWithHashedToken(t *testing.T) {
	now := time.Date(2026, 9, 5, 0, 0, 0, 0, time.UTC)
	snapshot := testSnapshot()
	var storedHash [sha256.Size]byte
	repo := &fakeRepository{startFn: func(_ context.Context, p, d string, h [sha256.Size]byte, expires time.Time) (domain.BattleSnapshot, error) {
		if p != testPlayerID || d != testDungeonID || !expires.Equal(now.Add(time.Hour)) {
			t.Fatal("wrong start input")
		}
		storedHash = h
		return snapshot, nil
	}}
	service := serviceFor(t, repo, &now)
	start, err := service.Start(context.Background(), testPlayerID, testDungeonID)
	if err != nil {
		t.Fatal(err)
	}
	if start.Token == "" || start.Snapshot.PlayerID != testPlayerID {
		t.Fatalf("start=%+v", start)
	}
	if sha256.Sum256([]byte(start.Token)) != storedHash {
		t.Fatal("repository did not receive token hash")
	}
}

func TestFinishBuildsTrustedSettlement(t *testing.T) {
	now := time.Now()
	snapshot := testSnapshot()
	token := base64Token()
	hash, _ := tokenHash(token)
	var settled domain.BattleResult
	repo := &fakeRepository{loadFn: func(_ context.Context, got [sha256.Size]byte) (domain.BattleSession, error) {
		if got != hash {
			t.Fatal("wrong hash")
		}
		return domain.BattleSession{ID: "session", PlayerID: testPlayerID, DungeonID: testDungeonID, Snapshot: snapshot, Status: domain.BattleSessionActive, ExpiresAt: now.Add(time.Hour)}, nil
	}, settleFn: func(_ context.Context, result domain.BattleResult) error { settled = result; return nil }}
	service := serviceFor(t, repo, &now)
	err := service.Finish(context.Background(), testPlayerID, domain.BattleSubmission{BattleSeed: token, UnitSnapshot: []json.RawMessage{finalUnit(snapshot, 12, true)}, ClaimedOutcome: "won"})
	if err != nil {
		t.Fatal(err)
	}
	if settled.SessionID != "session" || settled.PlayerID != testPlayerID || settled.MoneyAward != 25 || len(settled.TreasureDrops) != 1 || settled.Units[0].CurrentStats.Health != 12 {
		t.Fatalf("settlement=%+v", settled)
	}
}

func TestUnknownOrForeignTokenNeverCancelsActiveBattle(t *testing.T) {
	now := time.Now()
	cancelled := false
	repo := &fakeRepository{loadFn: func(context.Context, [sha256.Size]byte) (domain.BattleSession, error) {
		return domain.BattleSession{}, fmtNotFound()
	}, cancelFn: func(context.Context, string, string) error { cancelled = true; return nil }}
	service := serviceFor(t, repo, &now)
	if err := service.Finish(context.Background(), testPlayerID, domain.BattleSubmission{BattleSeed: base64Token(), ClaimedOutcome: "won"}); !errors.Is(err, domain.ErrBattleResultMismatch) {
		t.Fatalf("error=%v", err)
	}
	if cancelled {
		t.Fatal("unknown token cancelled a battle")
	}
	repo.loadFn = func(context.Context, [sha256.Size]byte) (domain.BattleSession, error) {
		return domain.BattleSession{ID: "other", PlayerID: "22222222-2222-4222-8222-222222222222", Status: domain.BattleSessionActive}, nil
	}
	if err := service.Cancel(context.Background(), testPlayerID, base64Token()); !errors.Is(err, domain.ErrBattleResultMismatch) {
		t.Fatalf("error=%v", err)
	}
	if cancelled {
		t.Fatal("foreign token cancelled a battle")
	}
}

func TestInvalidFinalStateCancelsOnlyVerifiedSession(t *testing.T) {
	now := time.Now()
	snapshot := testSnapshot()
	cancelledID := ""
	repo := sessionRepo(now, snapshot)
	repo.cancelFn = func(_ context.Context, id, p string) error {
		cancelledID = id
		if p != testPlayerID {
			t.Fatal("wrong player")
		}
		return nil
	}
	service := serviceFor(t, repo, &now)
	invalid := finalUnit(snapshot, 99, true)
	err := service.Finish(context.Background(), testPlayerID, domain.BattleSubmission{BattleSeed: base64Token(), UnitSnapshot: []json.RawMessage{invalid}, ClaimedOutcome: "won"})
	if !errors.Is(err, domain.ErrBattleResultMismatch) || cancelledID != "session" {
		t.Fatalf("error=%v cancelled=%q", err, cancelledID)
	}
}

func TestExpiredSessionIsCancelledAndReported(t *testing.T) {
	now := time.Now()
	snapshot := testSnapshot()
	repo := sessionRepo(now, snapshot)
	session, _ := repo.loadFn(context.Background(), [sha256.Size]byte{})
	session.ExpiresAt = now.Add(-time.Minute)
	repo.loadFn = func(context.Context, [sha256.Size]byte) (domain.BattleSession, error) { return session, nil }
	cancelled := false
	repo.cancelFn = func(context.Context, string, string) error { cancelled = true; return nil }
	service := serviceFor(t, repo, &now)
	err := service.Finish(context.Background(), testPlayerID, domain.BattleSubmission{BattleSeed: base64Token(), UnitSnapshot: []json.RawMessage{finalUnit(snapshot, 1, true)}, ClaimedOutcome: "lost"})
	if !errors.Is(err, domain.ErrBattleExpired) || !cancelled {
		t.Fatalf("error=%v cancelled=%v", err, cancelled)
	}
}

func TestCancelIsDelegatedForVerifiedOwnedSession(t *testing.T) {
	now := time.Now()
	repo := sessionRepo(now, testSnapshot())
	called := false
	repo.cancelFn = func(_ context.Context, id, p string) error { called = id == "session" && p == testPlayerID; return nil }
	service := serviceFor(t, repo, &now)
	if err := service.Cancel(context.Background(), testPlayerID, base64Token()); err != nil {
		t.Fatal(err)
	}
	if !called {
		t.Fatal("cancel not delegated")
	}
}

func TestConfigurationAndMalformedToken(t *testing.T) {
	if _, err := NewService(Config{}); err == nil {
		t.Fatal("nil repository accepted")
	}
	now := time.Now()
	repo := &fakeRepository{}
	service := serviceFor(t, repo, &now)
	if err := service.Finish(context.Background(), testPlayerID, domain.BattleSubmission{BattleSeed: "bad"}); !errors.Is(err, domain.ErrBattleResultMismatch) {
		t.Fatalf("error=%v", err)
	}
}

func sessionRepo(now time.Time, snapshot domain.BattleSnapshot) *fakeRepository {
	return &fakeRepository{loadFn: func(context.Context, [sha256.Size]byte) (domain.BattleSession, error) {
		return domain.BattleSession{ID: "session", PlayerID: testPlayerID, DungeonID: testDungeonID, Snapshot: snapshot, Status: domain.BattleSessionActive, ExpiresAt: now.Add(time.Hour)}, nil
	}, settleFn: func(context.Context, domain.BattleResult) error { return nil }, cancelFn: func(context.Context, string, string) error { return nil }}
}
func base64Token() string { return "cnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnI" }
func fmtNotFound() error  { return errors.Join(domain.ErrBattleSessionNotFound, domain.ErrNotFound) }
