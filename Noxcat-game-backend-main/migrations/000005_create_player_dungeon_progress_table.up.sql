CREATE TABLE player_dungeon_progress (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    dungeon_id uuid NOT NULL REFERENCES dungeons (id) ON DELETE CASCADE,
    solved boolean NOT NULL DEFAULT false,
    solved_at timestamptz,
    CHECK (solved OR solved_at IS NULL)
);
