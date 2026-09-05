// Package battle coordinates durable battle sessions and converts bounded
// client-reported MVP outcomes into trusted settlement commands.
package battle

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

const (
	defaultSessionTTL = 2 * time.Hour
	tokenBytes        = 32
)

type Repository interface {
	StartBattleSession(context.Context, string, string, [sha256.Size]byte, time.Time) (domain.BattleSnapshot, error)
	BattleSessionByTokenHash(context.Context, [sha256.Size]byte) (domain.BattleSession, error)
	SettleBattleSession(context.Context, domain.BattleResult) error
	CancelBattleSession(context.Context, string, string) error
}

type Config struct {
	Repository Repository
	SessionTTL time.Duration
	Now        func() time.Time
	Random     io.Reader
}

type Service struct {
	repository Repository
	sessionTTL time.Duration
	now        func() time.Time
	random     io.Reader
}

func NewService(config Config) (*Service, error) {
	if config.Repository == nil {
		return nil, errors.New("battle repository is required")
	}
	ttl := config.SessionTTL
	if ttl == 0 {
		ttl = defaultSessionTTL
	}
	if ttl < 0 {
		return nil, errors.New("battle session TTL must be positive")
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	randomSource := config.Random
	if randomSource == nil {
		randomSource = rand.Reader
	}
	return &Service{repository: config.Repository, sessionTTL: ttl, now: now, random: randomSource}, nil
}

func (s *Service) Start(ctx context.Context, playerID, dungeonID string) (domain.BattleStart, error) {
	if err := ctx.Err(); err != nil {
		return domain.BattleStart{}, err
	}
	rawToken := make([]byte, tokenBytes)
	if _, err := io.ReadFull(s.random, rawToken); err != nil {
		return domain.BattleStart{}, fmt.Errorf("generate battle token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(rawToken)
	hash := sha256.Sum256([]byte(token))
	snapshot, err := s.repository.StartBattleSession(ctx, playerID, dungeonID, hash, s.now().UTC().Add(s.sessionTTL))
	if err != nil {
		return domain.BattleStart{}, err
	}
	return domain.BattleStart{Token: token, Snapshot: snapshot}, nil
}

func (s *Service) Finish(ctx context.Context, playerID string, submission domain.BattleSubmission) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	hash, ok := tokenHash(submission.BattleSeed)
	if !ok {
		return domain.ErrBattleResultMismatch
	}
	session, err := s.repository.BattleSessionByTokenHash(ctx, hash)
	if errors.Is(err, domain.ErrBattleSessionNotFound) {
		return domain.ErrBattleResultMismatch
	}
	if err != nil {
		return err
	}
	if session.PlayerID != playerID {
		return domain.ErrBattleResultMismatch
	}
	if session.Status == domain.BattleSessionExpired {
		return domain.ErrBattleExpired
	}
	if session.Status != domain.BattleSessionActive {
		return domain.ErrBattleNotActive
	}
	if !session.ExpiresAt.After(s.now().UTC()) {
		if err := s.repository.CancelBattleSession(ctx, session.ID, playerID); err != nil {
			return err
		}
		return domain.ErrBattleExpired
	}
	if submission.ClaimedOutcome != "won" && submission.ClaimedOutcome != "lost" {
		return s.cancelMismatch(ctx, session, playerID)
	}
	settlements, valid := settlementsFromSubmission(session.Snapshot, submission.UnitSnapshot)
	if !valid {
		return s.cancelMismatch(ctx, session, playerID)
	}
	won := submission.ClaimedOutcome == "won"
	result := domain.BattleResult{
		SessionID: session.ID, PlayerID: playerID, DungeonID: session.DungeonID,
		Won: won, Units: settlements,
	}
	if won {
		result.MoneyAward = session.Snapshot.Dungeon.RewardMoney
		result.TreasureDrops, err = decodeDrops(session.Snapshot.Dungeon.RewardDrops)
		if err != nil {
			return err
		}
	}
	return s.repository.SettleBattleSession(ctx, result)
}

func (s *Service) Cancel(ctx context.Context, playerID, token string) error {
	hash, ok := tokenHash(token)
	if !ok {
		return domain.ErrBattleResultMismatch
	}
	session, err := s.repository.BattleSessionByTokenHash(ctx, hash)
	if errors.Is(err, domain.ErrBattleSessionNotFound) {
		return domain.ErrBattleResultMismatch
	}
	if err != nil {
		return err
	}
	if session.PlayerID != playerID {
		return domain.ErrBattleResultMismatch
	}
	return s.repository.CancelBattleSession(ctx, session.ID, playerID)
}

func (s *Service) cancelMismatch(ctx context.Context, session domain.BattleSession, playerID string) error {
	if err := s.repository.CancelBattleSession(ctx, session.ID, playerID); err != nil {
		return fmt.Errorf("cancel invalid battle result: %w", err)
	}
	return domain.ErrBattleResultMismatch
}

func tokenHash(token string) ([sha256.Size]byte, bool) {
	var zero [sha256.Size]byte
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || len(raw) != tokenBytes {
		return zero, false
	}
	return sha256.Sum256([]byte(token)), true
}

type submittedUnit struct {
	ID                 string             `json:"id"`
	OwnerID            string             `json:"owner_id"`
	Species            domain.UnitSpecies `json:"species"`
	BaseStats          domain.Stats       `json:"base_stats"`
	CurrentStats       domain.Stats       `json:"current_stats"`
	EquippedTreasureID *string            `json:"equipped_treasure_id"`
	IsPermanent        bool               `json:"is_permanent"`
	IsAlive            bool               `json:"is_alive"`
	IsEquipped         bool               `json:"is_equipped"`
}

func settlementsFromSubmission(snapshot domain.BattleSnapshot, submitted []json.RawMessage) ([]domain.UnitSettlement, bool) {
	if len(submitted) != len(snapshot.Units) {
		return nil, false
	}
	expected := make(map[string]domain.Unit, len(snapshot.Units))
	for _, unit := range snapshot.Units {
		expected[unit.ID] = unit
	}
	seen := make(map[string]struct{}, len(submitted))
	settlements := make([]domain.UnitSettlement, 0, len(submitted))
	for _, raw := range submitted {
		var got submittedUnit
		decoder := json.NewDecoder(bytes.NewReader(raw))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&got) != nil || got.ID == "" {
			return nil, false
		}
		want, exists := expected[got.ID]
		if !exists {
			return nil, false
		}
		if _, duplicate := seen[got.ID]; duplicate {
			return nil, false
		}
		seen[got.ID] = struct{}{}
		if got.OwnerID != want.OwnerID || got.Species != want.Species || got.BaseStats != want.BaseStats ||
			got.CurrentStats.Attack != want.CurrentStats.Attack || got.CurrentStats.Defense != want.CurrentStats.Defense ||
			got.CurrentStats.Speed != want.CurrentStats.Speed || got.CurrentStats.Health < 0 || got.CurrentStats.Health > want.CurrentStats.Health ||
			!equalOptionalID(got.EquippedTreasureID, want.EquippedTreasureID) || got.IsPermanent != want.IsPermanent ||
			got.IsEquipped != want.IsEquipped || (got.IsAlive && got.CurrentStats.Health == 0) || (want.IsPermanent && !got.IsAlive) {
			return nil, false
		}
		settlements = append(settlements, domain.UnitSettlement{UnitID: got.ID, CurrentStats: got.CurrentStats, IsAlive: got.IsAlive})
	}
	return settlements, true
}

func decodeDrops(raw json.RawMessage) ([]domain.NewTreasure, error) {
	if len(bytes.TrimSpace(raw)) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, nil
	}
	var drops []domain.NewTreasure
	if err := json.Unmarshal(raw, &drops); err != nil || drops == nil {
		return nil, domain.ErrInvalidInput
	}
	for _, drop := range drops {
		if drop.DamageBonus < 0 {
			return nil, domain.ErrInvalidInput
		}
	}
	return drops, nil
}

func equalOptionalID(left, right *string) bool {
	return left == nil && right == nil || left != nil && right != nil && *left == *right
}
