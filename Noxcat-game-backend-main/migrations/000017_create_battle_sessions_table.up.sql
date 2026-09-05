CREATE TABLE battle_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    dungeon_id uuid NOT NULL REFERENCES dungeons (id) ON DELETE RESTRICT,
    token_hash bytea NOT NULL,
    snapshot jsonb NOT NULL,
    status battle_session_status NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    completed_at timestamptz,
    CONSTRAINT battle_sessions_token_hash_valid CHECK (octet_length(token_hash) = 32),
    CONSTRAINT battle_sessions_snapshot_valid CHECK (jsonb_typeof(snapshot) = 'object'),
    CONSTRAINT battle_sessions_expiry_valid CHECK (expires_at > created_at),
    CONSTRAINT battle_sessions_completion_valid CHECK (
        (status = 'active' AND completed_at IS NULL)
        OR (status <> 'active' AND completed_at IS NOT NULL)
    )
);
