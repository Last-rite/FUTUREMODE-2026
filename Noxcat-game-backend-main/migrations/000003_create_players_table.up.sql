CREATE TABLE players (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text NOT NULL,
    password_hash text NOT NULL,
    role player_role NOT NULL DEFAULT 'player',
    money integer NOT NULL DEFAULT 0 CHECK (money >= 0),
    status player_status NOT NULL DEFAULT 'idle',
    created_at timestamptz NOT NULL DEFAULT now()
);
