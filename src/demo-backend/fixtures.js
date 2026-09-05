import levelCityImg from '../assets/level_city.png';

// Plausible mock database fixtures strictly aligned with game-design Documents.md
// and the sketch designs (trade_example.jpg, mourn_example.jpg).

/**
 * Generates the full initial roster of 6 NOXCATs and 3 equipment items for any player.
 * - 3 Core NOXCATs (Core 1: Protected; Core 2, 3: Tradable/Droppable)
 * - FUTURE NOXCAT (Tech: 時空衝擊)
 * - COOL NOXCAT (Rush: 疾風推進)
 * - HARD NOXCAT (Tank: 堅毅立場)
 * - 3 starter equipments (像素劍 +2 ATK, 資料盾 +1 DEF, 回家石 +5 HP / 防止掉落)
 */
export function createStarterRosterForPlayer(playerId) {
  const pId = playerId || 'player';
  const pets = [
    // 3 copies of Core NOXCAT (1st copy has system starter protection)
    {
      id: `nox-${pId}-1`,
      idString: `peg_noxcat_core_${pId}_1`,
      code: '01',
      name: 'NOXCAT',
      className: 'CORE',
      level: 12,
      hp: 100,
      atk: 10,
      def: 2,
      spd: 100,
      protected: true,
      selected: true,
      accent: '#00ff66',
      quote: 'Feel Nothing. Do Everything.',
      skill: '初始守護：受到系統最高權限保護，戰鬥中 HP 歸零自動返回背包，不掉落不遺失。',
      equipped: `item-${pId}-shield`,
      ownerId: pId,
    },
    {
      id: `nox-${pId}-2`,
      idString: `peg_noxcat_core_${pId}_2`,
      code: '01',
      name: 'NOXCAT · 貳號',
      className: 'CORE',
      level: 12,
      hp: 100,
      atk: 10,
      def: 2,
      spd: 100,
      protected: false,
      selected: true,
      accent: '#00ff66',
      quote: 'Feel Nothing. Do Everything.',
      skill: '常規機甲：戰鬥 HP 歸零時將遺落於地下城中，可由其他通關玩家拯救拾獲。',
      equipped: `item-${pId}-blade`,
      ownerId: pId,
    },
    {
      id: `nox-${pId}-3`,
      idString: `peg_noxcat_core_${pId}_3`,
      code: '01',
      name: 'NOXCAT · 參號',
      className: 'CORE',
      level: 12,
      hp: 100,
      atk: 10,
      def: 2,
      spd: 100,
      protected: false,
      selected: true,
      accent: '#00ff66',
      quote: 'Feel Nothing. Do Everything.',
      skill: '常規機甲：戰鬥 HP 歸零時將遺落於地下城中，可由其他通關玩家拯救拾獲。',
      equipped: null,
      ownerId: pId,
    },
    // Specialized variants from Documents.md
    {
      id: `nox-${pId}-4`,
      idString: `peg_noxcat_tech_${pId}`,
      code: '02',
      name: 'FUTURE NOXCAT',
      className: 'TECH',
      level: 10,
      hp: 80,
      atk: 12,
      def: 1,
      spd: 100,
      protected: false,
      selected: false,
      accent: '#00ff66',
      quote: 'Tomorrow already happened.',
      skill: '時空衝擊：撞牆後下一次攻擊 +2 傷害。',
      equipped: null,
      ownerId: pId,
    },
    {
      id: `nox-${pId}-5`,
      idString: `peg_noxcat_rush_${pId}`,
      code: '03',
      name: 'COOL NOXCAT',
      className: 'RUSH',
      level: 11,
      hp: 100,
      atk: 10,
      def: 3,
      spd: 80,
      protected: false,
      selected: false,
      accent: '#00ff66',
      quote: 'No rush. I am the rush.',
      skill: '疾風推進：碰撞時強力擊退對手。',
      equipped: null,
      ownerId: pId,
    },
    {
      id: `nox-${pId}-6`,
      idString: `peg_noxcat_tank_${pId}`,
      code: '04',
      name: 'HARD NOXCAT',
      className: 'TANK',
      level: 8,
      hp: 130,
      atk: 8,
      def: 3,
      spd: 120,
      protected: false,
      selected: false,
      accent: '#00ff66',
      quote: 'Try moving me.',
      skill: '堅毅立場：若上一輪未命中任何目標，下一次受擊免傷並使對手減速。',
      equipped: null,
      ownerId: pId,
    },
  ];

  const items = [
    {
      id: `item-${pId}-blade`,
      idString: `wpn_pixel_blade_${pId}`,
      name: '像素劍',
      type: 'WEAPON',
      bonus: 'ATK +2',
      rarity: 'RARE',
      hpBonus: 0,
      atkBonus: 2,
      defBonus: 0,
      spdBonus: 0,
      quote: '只要砍得夠快，敵人就追不上。',
      skill: '鋒刃加成：提升裝備者 2 點基礎攻擊力。',
      ownerId: pId,
    },
    {
      id: `item-${pId}-shield`,
      idString: `gear_data_shield_${pId}`,
      name: '資料盾',
      type: 'GEAR',
      bonus: 'DEF +1',
      rarity: 'COMMON',
      hpBonus: 0,
      atkBonus: 0,
      defBonus: 1,
      spdBonus: 0,
      quote: '擋得住攻擊，擋不住隊友犯蠢。',
      skill: '資料壁壘：提升裝備者 1 點基礎防禦力。',
      ownerId: pId,
    },
    {
      id: `item-${pId}-home`,
      idString: `item_return_stone_${pId}`,
      name: '回家石',
      type: 'TREASURE',
      bonus: 'HP +5 · 防止一次掉落',
      rarity: 'EPIC',
      hpBonus: 5,
      atkBonus: 0,
      defBonus: 0,
      spdBonus: 0,
      quote: '帶你安全抵達溫暖的貓窩。',
      skill: '空間折躍：提升裝備者 5 點生命上限；戰鬥 HP 歸零時觸發，防止本次掉落並直接回家。',
      ownerId: pId,
    },
  ];

  return { pets, items };
}

// 4 Active Community Demo Players matching market & lost and found lore
export const DEMO_PLAYERS = [
  {
    id: 'player-cyber-pup',
    username: 'cyber_pup',
    displayName: '賽博小狗',
    password: 'demo1234',
    level: 14,
    gold: 320,
    created_at: '2026-09-01T08:00:00.000Z',
  },
  {
    id: 'player-pixel-ghost',
    username: 'pixel_ghost',
    displayName: '像素幽靈',
    password: 'demo1234',
    level: 16,
    gold: 580,
    created_at: '2026-09-01T09:30:00.000Z',
  },
  {
    id: 'player-null-cat',
    username: 'null_cat',
    displayName: '空號貓',
    password: 'demo1234',
    level: 12,
    gold: 210,
    created_at: '2026-09-02T11:20:00.000Z',
  },
  {
    id: 'player-glitch-fox',
    username: 'glitch_fox',
    displayName: '故障狐狸',
    password: 'demo1234',
    level: 15,
    gold: 440,
    created_at: '2026-09-02T15:40:00.000Z',
  },
];

export const DEMO_DUNGEONS = [
  {
    id: 'dungeon-zero',
    chapter: '01',
    name: '零號資料井',
    subtitle: 'DATA WELL // ENTRY NODE',
    difficulty: 'NORMAL',
    cost: 5,
    loot: 3,
    tone: '#00ff66',
    image: levelCityImg,
  },
  {
    id: 'dungeon-ash',
    chapter: '02',
    name: '灰燼轉運站',
    subtitle: 'ASH RELAY // HIGH RISK',
    difficulty: 'HARD',
    cost: 8,
    loot: 7,
    tone: '#ff5f3d',
  },
];

// Realistic barter listings between community players, matching trade_example.jpg
export const DEMO_TRADES = [
  {
    id: 'trade-001',
    from_player_id: 'player-pixel-ghost',
    to_player_id: 'player-cyber-pup',
    from: 'PIXEL_GHOST',
    to: 'CYBER_PUP',
    unit_id: 'nox-player-pixel-ghost-4',
    offeredPetId: 'nox-player-pixel-ghost-4',
    offer: 'FUTURE NOXCAT',
    offerPetCode: '02',
    offerWeapon: '像素劍',
    request_asset_type: 'treasure',
    request: '回家石',
    requestQty: 2,
    status: 'pending',
    time: '2 分鐘前',
    created_at: '2026-09-05T15:58:00.000Z',
  },
  {
    id: 'trade-002',
    from_player_id: 'player-cyber-pup',
    to_player_id: 'player-pixel-ghost',
    from: 'CYBER_PUP',
    to: 'PIXEL_GHOST',
    unit_id: 'nox-cyber-pup-shadow',
    offeredPetId: 'nox-cyber-pup-shadow',
    offer: 'SHADOW NOXCAT',
    offerPetCode: '03',
    offerWeapon: '資料盾',
    request_asset_type: 'treasure',
    request: '能量晶石',
    requestQty: 2,
    status: 'pending',
    time: '10 分鐘前',
    created_at: '2026-09-05T15:50:00.000Z',
  },
  {
    id: 'trade-003',
    from_player_id: 'player-null-cat',
    to_player_id: 'player-glitch-fox',
    from: 'NULL_CAT',
    to: 'GLITCH_FOX',
    unit_id: 'nox-player-null-cat-6',
    offeredPetId: 'nox-player-null-cat-6',
    offer: 'HARD NOXCAT',
    offerPetCode: '04',
    offerWeapon: '未裝備',
    request_asset_type: 'treasure',
    request: '急救模組',
    requestQty: 1,
    status: 'accepted',
    time: '1 小時前',
    created_at: '2026-09-05T14:30:00.000Z',
    settled_at: '2026-09-05T14:45:00.000Z',
  },
  {
    id: 'trade-004',
    from_player_id: 'player-glitch-fox',
    to_player_id: 'player-cyber-pup',
    from: 'GLITCH_FOX',
    to: 'CYBER_PUP',
    treasure_id: 'item-player-glitch-fox-shield',
    offeredItemId: 'item-player-glitch-fox-shield',
    offer: '資料盾',
    request_asset_type: 'treasure',
    request: '像素劍',
    requestQty: 1,
    status: 'rejected',
    time: '昨天',
    created_at: '2026-09-04T18:20:00.000Z',
    settled_at: '2026-09-04T19:00:00.000Z',
  },
];

// Plausible Lost Assets matching mourn_example.jpg (Row 1: Claimed by players; Rows 2 & 3: In Dungeon Pool)
export const DEMO_LOST_ASSETS = [
  // 1 & 2: Rescued/Claimed from dungeons by players (displays user icon and claimer ID)
  {
    id: 'lost-001',
    type: 'pet',
    name: 'SHADOW NOXCAT',
    code: '03',
    status: 'claimed',
    location: '零號資料井',
    dungeonId: 'dungeon-zero',
    claimedBy: 'CYBER_PUP',
    claimedByPlayerId: 'player-cyber-pup',
    lostAt: '1 天前',
    claimedAt: '4 小時前',
  },
  {
    id: 'lost-002',
    type: 'pet',
    name: 'NEO NOXCAT',
    code: '02',
    status: 'claimed',
    location: '灰燼轉運站',
    dungeonId: 'dungeon-ash',
    claimedBy: 'PIXEL_GHOST',
    claimedByPlayerId: 'player-pixel-ghost',
    lostAt: '2 天前',
    claimedAt: '12 小時前',
  },
  // 3, 4, 5: Lost during battle, currently remaining in dungeon shared loot pool
  {
    id: 'lost-003',
    type: 'pet',
    name: 'EMBER NOXCAT',
    code: '07',
    status: 'in_pool',
    location: '零號資料井',
    dungeonId: 'dungeon-zero',
    lostAt: '3 小時前',
  },
  {
    id: 'lost-004',
    type: 'weapon',
    name: '像素劍',
    iconType: 'blade',
    bonus: 'ATK +2',
    status: 'in_pool',
    location: '零號資料井',
    dungeonId: 'dungeon-zero',
    lostAt: '5 小時前',
  },
  {
    id: 'lost-005',
    type: 'pet',
    name: 'HARD NOXCAT',
    code: '04',
    status: 'in_pool',
    location: '灰燼轉運站',
    dungeonId: 'dungeon-ash',
    lostAt: '1 天前',
  },
];

/**
 * Initializes the full persistent demo database including community players,
 * their rosters, active trade proposals, and dungeon lost/claimed records.
 */
export function createDemoDatabase() {
  const allPets = [];
  const allItems = [];

  DEMO_PLAYERS.forEach((player) => {
    const { pets, items } = createStarterRosterForPlayer(player.id);
    allPets.push(...pets);
    allItems.push(...items);
  });

  // Additional lore assets tied to the claimed and trade story:
  // CYBER_PUP claimed SHADOW NOXCAT
  allPets.push({
    id: 'nox-cyber-pup-shadow',
    idString: 'peg_noxcat_shadow_cyber_pup',
    code: '03',
    name: 'SHADOW NOXCAT',
    className: 'SHADOW',
    level: 13,
    hp: 100,
    atk: 11,
    def: 2,
    spd: 90,
    protected: false,
    selected: false,
    accent: '#35d9ff',
    quote: 'Where shadow falls, we hunt.',
    skill: '暗影匿跡：穿透第一個接觸的障礙物。',
    equipped: 'item-player-cyber-pup-shield',
    ownerId: 'player-cyber-pup',
  });

  // Extra energy crystals and items for barter
  allItems.push(
    {
      id: 'item-player-pixel-ghost-gem',
      idString: 'item_matrix_gem_pixel_ghost',
      name: '能量晶石',
      type: 'TREASURE',
      bonus: '素材 · 矩陣晶片 x2',
      rarity: 'RARE',
      hpBonus: 0,
      atkBonus: 0,
      defBonus: 0,
      spdBonus: 0,
      quote: '充盈著零號資料井的原始能量。',
      skill: '能量共振：稀有交易媒介與升級材料。',
      ownerId: 'player-pixel-ghost',
    },
    {
      id: 'item-player-cyber-pup-home2',
      idString: 'item_return_stone_cyber_pup_extra',
      name: '回家石',
      type: 'TREASURE',
      bonus: 'HP +5 · 防止一次掉落',
      rarity: 'EPIC',
      hpBonus: 5,
      atkBonus: 0,
      defBonus: 0,
      spdBonus: 0,
      quote: '備用折躍石，旅人的保險。',
      skill: '空間折躍：HP 歸零防止掉落直接回家。',
      ownerId: 'player-cyber-pup',
    }
  );

  return {
    players: DEMO_PLAYERS.map((p) => ({ ...p })),
    pets: allPets,
    items: allItems,
    dungeons: DEMO_DUNGEONS.map((entry) => ({ ...entry })),
    dungeonProgress: {
      'player-cyber-pup': ['dungeon-zero'],
      'player-pixel-ghost': ['dungeon-zero', 'dungeon-ash'],
    },
    trades: DEMO_TRADES.map((entry) => ({ ...entry })),
    lostAssets: DEMO_LOST_ASSETS.map((entry) => ({ ...entry })),
  };
}
