ALTER TABLE players
    ADD COLUMN active_loadout_slot smallint NOT NULL DEFAULT 1
    CHECK (active_loadout_slot BETWEEN 1 AND 5);

CREATE TABLE player_loadouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 5),
    name text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (player_id, slot)
);

CREATE TABLE player_loadout_units (
    loadout_id uuid NOT NULL REFERENCES player_loadouts (id) ON DELETE CASCADE,
    position smallint NOT NULL CHECK (position BETWEEN 1 AND 3),
    unit_id uuid NOT NULL REFERENCES units (id) ON DELETE CASCADE,
    PRIMARY KEY (loadout_id, position),
    UNIQUE (loadout_id, unit_id)
);

CREATE INDEX player_loadout_units_unit_idx
    ON player_loadout_units (unit_id);

INSERT INTO player_loadouts (player_id, slot, name)
SELECT players.id, slots.slot, 'Loadout ' || slots.slot
FROM players
CROSS JOIN generate_series(1, 5) AS slots(slot);

INSERT INTO player_loadout_units (loadout_id, position, unit_id)
SELECT loadouts.id, equipped.position, equipped.unit_id
FROM player_loadouts loadouts
JOIN (
    SELECT owner_id, id AS unit_id,
           row_number() OVER (PARTITION BY owner_id ORDER BY id)::smallint AS position
    FROM units
    WHERE is_equipped = true
) equipped ON equipped.owner_id = loadouts.player_id
WHERE loadouts.slot = 1 AND equipped.position <= 3;
