package database

import (
	"context"
	"fmt"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/jackc/pgx/v5"
)

// lockPlayerStatuses locks every requested player in UUID order. Callers must
// acquire these locks before battle-relevant unit or treasure locks.
func lockPlayerStatuses(ctx context.Context, tx pgx.Tx, playerIDs ...string) (map[string]domain.PlayerStatus, error) {
	rows, err := tx.Query(ctx, `
		SELECT id, status FROM players
		WHERE id = ANY($1::uuid[])
		ORDER BY id FOR UPDATE`, playerIDs)
	if err != nil {
		return nil, fmt.Errorf("lock players: %w", err)
	}
	statuses := make(map[string]domain.PlayerStatus, len(playerIDs))
	for rows.Next() {
		var playerID string
		var status domain.PlayerStatus
		if err := rows.Scan(&playerID, &status); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan locked player: %w", err)
		}
		statuses[playerID] = status
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, fmt.Errorf("iterate locked players: %w", err)
	}
	rows.Close()
	if len(statuses) != len(playerIDs) {
		return nil, notFound(domain.ErrPlayerNotFound)
	}
	return statuses, nil
}

func rejectCombatPlayers(statuses map[string]domain.PlayerStatus, playerIDs ...string) error {
	for _, playerID := range playerIDs {
		if statuses[playerID] == domain.PlayerStatusCombat {
			return domain.ErrPlayerBusy
		}
	}
	return nil
}
