ALTER TABLE units
    ADD CONSTRAINT units_equipped_treasure_id_fkey
    FOREIGN KEY (equipped_treasure_id)
    REFERENCES treasures (id)
    ON DELETE SET NULL;
