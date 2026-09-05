CREATE INDEX player_dungeon_progress_dungeon_idx
    ON player_dungeon_progress (dungeon_id);

CREATE INDEX trades_unit_idx
    ON trades (unit_id);

CREATE INDEX trades_treasure_idx
    ON trades (treasure_id);
