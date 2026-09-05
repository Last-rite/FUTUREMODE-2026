CREATE TABLE treasures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    damage_bonus integer NOT NULL DEFAULT 0,
    equipped_by_unit_id uuid REFERENCES units (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
