CREATE INDEX units_owner_equipped_idx
    ON units (owner_id, is_equipped);
