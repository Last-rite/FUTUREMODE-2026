CREATE UNIQUE INDEX players_username_uidx
    ON players (username);

CREATE UNIQUE INDEX player_dungeon_progress_player_dungeon_uidx
    ON player_dungeon_progress (player_id, dungeon_id);

CREATE INDEX player_dungeon_progress_player_solved_idx
    ON player_dungeon_progress (player_id, solved);

CREATE INDEX units_owner_idx
    ON units (owner_id);

CREATE INDEX units_owner_alive_idx
    ON units (owner_id, is_alive);

CREATE UNIQUE INDEX units_equipped_treasure_uidx
    ON units (equipped_treasure_id)
    WHERE equipped_treasure_id IS NOT NULL;

CREATE INDEX treasures_owner_idx
    ON treasures (owner_id);

CREATE UNIQUE INDEX treasures_equipped_by_unit_uidx
    ON treasures (equipped_by_unit_id)
    WHERE equipped_by_unit_id IS NOT NULL;

CREATE INDEX trades_to_player_status_idx
    ON trades (to_player_id, status);

CREATE INDEX trades_from_player_status_idx
    ON trades (from_player_id, status);
