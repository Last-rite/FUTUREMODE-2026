ALTER TYPE trade_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Older versions allowed several pending offers to reference the same asset.
-- Keep the oldest offer active and close the rest before reservations become
-- unique, so this migration is safe for existing databases.
WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY unit_id IS NOT NULL, COALESCE(unit_id, treasure_id)
               ORDER BY created_at, id
           ) AS reservation_order
    FROM trades
    WHERE status = 'pending'
)
UPDATE trades
SET status = 'rejected'
WHERE id IN (
    SELECT id FROM ranked WHERE reservation_order > 1
);

CREATE TABLE trade_assets (
    trade_id uuid NOT NULL REFERENCES trades (id) ON DELETE CASCADE,
    side varchar(9) NOT NULL CHECK (side IN ('offered', 'requested')),
    position smallint NOT NULL CHECK (position BETWEEN 1 AND 10),
    unit_id uuid REFERENCES units (id),
    treasure_id uuid REFERENCES treasures (id),
    reserved boolean NOT NULL DEFAULT false,
    PRIMARY KEY (trade_id, side, position),
    CHECK (num_nonnulls(unit_id, treasure_id) = 1),
    CHECK (NOT reserved OR side = 'offered')
);

INSERT INTO trade_assets (trade_id, side, position, unit_id, treasure_id, reserved)
SELECT id, 'offered', 1, unit_id, treasure_id, status = 'pending'
FROM trades;

CREATE UNIQUE INDEX trade_assets_reserved_unit_uidx
    ON trade_assets (unit_id)
    WHERE reserved = true AND unit_id IS NOT NULL;

CREATE UNIQUE INDEX trade_assets_reserved_treasure_uidx
    ON trade_assets (treasure_id)
    WHERE reserved = true AND treasure_id IS NOT NULL;

CREATE INDEX trade_assets_unit_idx
    ON trade_assets (unit_id)
    WHERE unit_id IS NOT NULL;

CREATE INDEX trade_assets_treasure_idx
    ON trade_assets (treasure_id)
    WHERE treasure_id IS NOT NULL;
