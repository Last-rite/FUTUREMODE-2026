ALTER TABLE treasures
    ADD COLUMN code text NOT NULL DEFAULT 'legacy',
    ADD COLUMN name text NOT NULL DEFAULT 'Treasure',
    ADD COLUMN treasure_type text NOT NULL DEFAULT 'weapon'
        CHECK (treasure_type IN ('weapon', 'armor', 'utility')),
    ADD COLUMN rarity text NOT NULL DEFAULT 'common'
        CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
    ADD COLUMN health_bonus integer NOT NULL DEFAULT 0
        CHECK (health_bonus BETWEEN 0 AND 100000),
    ADD COLUMN defense_bonus integer NOT NULL DEFAULT 0
        CHECK (defense_bonus BETWEEN 0 AND 100000),
    ADD COLUMN speed_bonus integer NOT NULL DEFAULT 0
        CHECK (speed_bonus BETWEEN 0 AND 100000),
    ADD COLUMN effect_code text
        CHECK (effect_code IS NULL OR effect_code IN ('home_stone')),
    ADD COLUMN charges integer
        CHECK (charges IS NULL OR charges >= 0);

ALTER TABLE treasures
    ADD CONSTRAINT treasures_damage_bonus_valid
    CHECK (damage_bonus BETWEEN 0 AND 100000);
