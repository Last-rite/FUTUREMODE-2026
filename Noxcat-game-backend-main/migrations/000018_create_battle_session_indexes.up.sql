CREATE UNIQUE INDEX battle_sessions_token_hash_uidx
    ON battle_sessions (token_hash);

CREATE UNIQUE INDEX battle_sessions_one_active_player_uidx
    ON battle_sessions (player_id)
    WHERE status = 'active';

CREATE INDEX battle_sessions_active_expiry_idx
    ON battle_sessions (expires_at)
    WHERE status = 'active';

CREATE INDEX battle_sessions_player_created_idx
    ON battle_sessions (player_id, created_at DESC);

CREATE INDEX battle_sessions_dungeon_idx
    ON battle_sessions (dungeon_id);
