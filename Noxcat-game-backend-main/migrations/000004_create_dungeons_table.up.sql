CREATE TABLE dungeons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    enemy_config jsonb NOT NULL,
    reward_money integer NOT NULL DEFAULT 0 CHECK (reward_money >= 0),
    reward_drops jsonb
);
