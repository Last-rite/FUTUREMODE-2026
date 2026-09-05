CREATE TABLE trades (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_player_id uuid NOT NULL REFERENCES players (id),
    to_player_id uuid NOT NULL REFERENCES players (id),
    unit_id uuid REFERENCES units (id),
    treasure_id uuid REFERENCES treasures (id),
    status trade_status NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (from_player_id <> to_player_id),
    CHECK (num_nonnulls(unit_id, treasure_id) = 1)
);
