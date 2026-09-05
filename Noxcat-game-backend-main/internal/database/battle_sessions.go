package database

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/jackc/pgx/v5"
)

// StartBattleSession atomically recovers an expired battle, snapshots the
// selected loadout, inserts its durable session, and moves the player to combat.
func (s *Store) StartBattleSession(ctx context.Context, playerID, dungeonID string, tokenHash [sha256.Size]byte, expiresAt time.Time) (domain.BattleSnapshot, error) {
	if playerID == "" || dungeonID == "" || expiresAt.IsZero() {
		return domain.BattleSnapshot{}, domain.ErrInvalidInput
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return domain.BattleSnapshot{}, fmt.Errorf("begin battle session: %w", err)
	}
	defer rollback(tx)

	var status domain.PlayerStatus
	var banned bool
	if err := tx.QueryRow(ctx, `SELECT status, is_banned FROM players WHERE id = $1 FOR UPDATE`, playerID).Scan(&status, &banned); errors.Is(err, pgx.ErrNoRows) {
		return domain.BattleSnapshot{}, notFound(domain.ErrPlayerNotFound)
	} else if err != nil {
		return domain.BattleSnapshot{}, fmt.Errorf("lock player for battle session: %w", err)
	}
	if banned {
		return domain.BattleSnapshot{}, domain.ErrPlayerBanned
	}

	var activeID string
	var activeUnexpired bool
	err = tx.QueryRow(ctx, `
		SELECT id, expires_at > now() FROM battle_sessions
		WHERE player_id = $1 AND status = 'active' FOR UPDATE`, playerID,
	).Scan(&activeID, &activeUnexpired)
	switch {
	case err == nil && activeUnexpired:
		return domain.BattleSnapshot{}, domain.ErrPlayerBusy
	case err == nil:
		if _, err := tx.Exec(ctx, `UPDATE battle_sessions SET status = 'expired', completed_at = now() WHERE id = $1`, activeID); err != nil {
			return domain.BattleSnapshot{}, fmt.Errorf("expire abandoned battle: %w", err)
		}
		status = domain.PlayerStatusIdle
	case errors.Is(err, pgx.ErrNoRows) && status == domain.PlayerStatusCombat:
		// Recover legacy/orphaned combat state left without a durable session.
		status = domain.PlayerStatusIdle
	case errors.Is(err, pgx.ErrNoRows):
	case err != nil:
		return domain.BattleSnapshot{}, fmt.Errorf("lock active battle session: %w", err)
	}
	if status != domain.PlayerStatusIdle {
		return domain.BattleSnapshot{}, domain.ErrPlayerBusy
	}

	dungeon, err := scanDungeon(tx.QueryRow(ctx, `SELECT `+dungeonColumns+` FROM dungeons WHERE id = $1`, dungeonID))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.BattleSnapshot{}, notFound(domain.ErrDungeonNotFound)
	}
	if err != nil {
		return domain.BattleSnapshot{}, fmt.Errorf("get battle-session dungeon: %w", err)
	}
	rows, err := tx.Query(ctx, `
		SELECT `+unitColumns+` FROM units
		WHERE owner_id = $1 AND is_equipped = true AND is_alive = true
		ORDER BY id FOR UPDATE`, playerID)
	if err != nil {
		return domain.BattleSnapshot{}, fmt.Errorf("lock battle-session units: %w", err)
	}
	units := make([]domain.Unit, 0, 3)
	for rows.Next() {
		unit, scanErr := scanUnit(rows)
		if scanErr != nil {
			rows.Close()
			return domain.BattleSnapshot{}, fmt.Errorf("scan battle-session unit: %w", scanErr)
		}
		units = append(units, unit)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return domain.BattleSnapshot{}, fmt.Errorf("iterate battle-session units: %w", err)
	}
	rows.Close()
	if len(units) == 0 || len(units) > 3 {
		return domain.BattleSnapshot{}, domain.ErrInvalidUnitSelection
	}
	snapshot := domain.BattleSnapshot{PlayerID: playerID, Dungeon: dungeon, Units: units}
	snapshotJSON, err := json.Marshal(snapshot)
	if err != nil {
		return domain.BattleSnapshot{}, fmt.Errorf("encode battle snapshot: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO battle_sessions (player_id, dungeon_id, token_hash, snapshot, expires_at)
		VALUES ($1, $2, $3, $4, $5)`, playerID, dungeonID, tokenHash[:], snapshotJSON, expiresAt); err != nil {
		return domain.BattleSnapshot{}, fmt.Errorf("insert battle session: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE players SET status = 'in_combat' WHERE id = $1`, playerID); err != nil {
		return domain.BattleSnapshot{}, fmt.Errorf("set player in combat: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.BattleSnapshot{}, fmt.Errorf("commit battle session: %w", err)
	}
	return snapshot, nil
}

func (s *Store) BattleSessionByTokenHash(ctx context.Context, tokenHash [sha256.Size]byte) (domain.BattleSession, error) {
	var session domain.BattleSession
	var snapshotJSON []byte
	err := s.db.QueryRow(ctx, `
		SELECT id, player_id, dungeon_id, snapshot, status, created_at, expires_at, completed_at
		FROM battle_sessions WHERE token_hash = $1`, tokenHash[:],
	).Scan(&session.ID, &session.PlayerID, &session.DungeonID, &snapshotJSON, &session.Status,
		&session.CreatedAt, &session.ExpiresAt, &session.CompletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.BattleSession{}, notFound(domain.ErrBattleSessionNotFound)
	}
	if err != nil {
		return domain.BattleSession{}, fmt.Errorf("get battle session: %w", err)
	}
	if err := json.Unmarshal(snapshotJSON, &session.Snapshot); err != nil {
		return domain.BattleSession{}, fmt.Errorf("decode battle snapshot: %w", err)
	}
	return session, nil
}

func (s *Store) CancelBattleSession(ctx context.Context, sessionID, playerID string) error {
	if sessionID == "" || playerID == "" {
		return domain.ErrInvalidInput
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin cancel battle: %w", err)
	}
	defer rollback(tx)
	var playerStatus domain.PlayerStatus
	if err := tx.QueryRow(ctx, `SELECT status FROM players WHERE id = $1 FOR UPDATE`, playerID).Scan(&playerStatus); errors.Is(err, pgx.ErrNoRows) {
		return notFound(domain.ErrPlayerNotFound)
	} else if err != nil {
		return fmt.Errorf("lock player to cancel battle: %w", err)
	}
	var ownerID string
	var sessionStatus domain.BattleSessionStatus
	var expired bool
	if err := tx.QueryRow(ctx, `SELECT player_id, status, expires_at <= now() FROM battle_sessions WHERE id = $1 FOR UPDATE`, sessionID).Scan(&ownerID, &sessionStatus, &expired); errors.Is(err, pgx.ErrNoRows) {
		return notFound(domain.ErrBattleSessionNotFound)
	} else if err != nil {
		return fmt.Errorf("lock battle session to cancel: %w", err)
	}
	if ownerID != playerID {
		return domain.ErrBattleResultMismatch
	}
	if sessionStatus == domain.BattleSessionSettled {
		return domain.ErrBattleNotActive
	}
	resetPlayer := false
	if sessionStatus == domain.BattleSessionActive {
		newStatus := domain.BattleSessionCancelled
		if expired {
			newStatus = domain.BattleSessionExpired
		}
		if _, err := tx.Exec(ctx, `UPDATE battle_sessions SET status = $2, completed_at = now() WHERE id = $1`, sessionID, newStatus); err != nil {
			return fmt.Errorf("cancel battle session: %w", err)
		}
		resetPlayer = true
	}
	if resetPlayer && playerStatus == domain.PlayerStatusCombat {
		if _, err := tx.Exec(ctx, `UPDATE players SET status = 'idle' WHERE id = $1`, playerID); err != nil {
			return fmt.Errorf("reset cancelled battle player: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit cancel battle: %w", err)
	}
	return nil
}

func (s *Store) ExpireBattleSessions(ctx context.Context, limit int) (int64, error) {
	if limit <= 0 {
		return 0, domain.ErrInvalidInput
	}
	rows, err := s.db.Query(ctx, `
		SELECT id, player_id FROM battle_sessions
		WHERE status = 'active' AND expires_at <= now()
		ORDER BY expires_at LIMIT $1`, limit)
	if err != nil {
		return 0, fmt.Errorf("lock expired battles: %w", err)
	}
	type expired struct{ id, playerID string }
	items := make([]expired, 0, limit)
	for rows.Next() {
		var item expired
		if err := rows.Scan(&item.id, &item.playerID); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scan expired battle: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, fmt.Errorf("iterate expired battles: %w", err)
	}
	rows.Close()
	var expiredCount int64
	for _, item := range items {
		expired, err := s.expireBattleSession(ctx, item.id, item.playerID)
		if err != nil {
			return expiredCount, err
		}
		if expired {
			expiredCount++
		}
	}
	return expiredCount, nil
}

// expireBattleSession follows the global player-then-session lock order used
// by start, cancel, and settlement, preventing cleanup deadlocks.
func (s *Store) expireBattleSession(ctx context.Context, sessionID, playerID string) (bool, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("begin expire battle: %w", err)
	}
	defer rollback(tx)
	var playerStatus domain.PlayerStatus
	if err := tx.QueryRow(ctx, `SELECT status FROM players WHERE id = $1 FOR UPDATE`, playerID).Scan(&playerStatus); errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	} else if err != nil {
		return false, fmt.Errorf("lock player to expire battle: %w", err)
	}
	var activeAndExpired bool
	if err := tx.QueryRow(ctx, `
		SELECT status = 'active' AND expires_at <= now()
		FROM battle_sessions WHERE id = $1 AND player_id = $2 FOR UPDATE`, sessionID, playerID).Scan(&activeAndExpired); errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	} else if err != nil {
		return false, fmt.Errorf("lock battle session to expire: %w", err)
	}
	if !activeAndExpired {
		return false, nil
	}
	if _, err := tx.Exec(ctx, `UPDATE battle_sessions SET status = 'expired', completed_at = now() WHERE id = $1`, sessionID); err != nil {
		return false, fmt.Errorf("expire battle session: %w", err)
	}
	if playerStatus == domain.PlayerStatusCombat {
		if _, err := tx.Exec(ctx, `UPDATE players SET status = 'idle' WHERE id = $1`, playerID); err != nil {
			return false, fmt.Errorf("reset expired battle player: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("commit expire battle: %w", err)
	}
	return true, nil
}
