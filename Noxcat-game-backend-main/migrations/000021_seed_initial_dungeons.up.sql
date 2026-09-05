ALTER TABLE dungeons
    ADD COLUMN sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0);

INSERT INTO dungeons (id, name, sort_order, enemy_config, reward_money, reward_drops)
VALUES
    (
        '10000000-0000-4000-8000-000000000001',
        '幽藍之都',
        1,
        '[{"species":"generic","atk":5,"hp":20,"def":3,"spd":4,"chapter":"01","subtitle":"ORCHID CASTLE // ENTRY","difficulty":"NORMAL","tone":"#00ff66"}]'::jsonb,
        25,
        '[{"code":"pixel-blade","name":"像素短劍","treasure_type":"weapon","rarity":"rare","damage_bonus":2,"health_bonus":0,"defense_bonus":0,"speed_bonus":0}]'::jsonb
    ),
    (
        '10000000-0000-4000-8000-000000000002',
        '古代遺跡',
        2,
        '[{"species":"fire","atk":8,"hp":30,"def":4,"spd":5,"chapter":"02","subtitle":"ANCIENT RUINS // HIGH RISK","difficulty":"HARD","tone":"#ff5f3d"}]'::jsonb,
        50,
        '[{"code":"home-stone","name":"回家石","treasure_type":"utility","rarity":"epic","damage_bonus":0,"health_bonus":5,"defense_bonus":0,"speed_bonus":0,"effect_code":"home_stone","charges":1}]'::jsonb
    );
