CREATE TABLE units (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    species unit_species NOT NULL,
    base_stats jsonb NOT NULL,
    current_stats jsonb NOT NULL,
    equipped_treasure_id uuid,
    is_permanent boolean NOT NULL DEFAULT false,
    is_alive boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
