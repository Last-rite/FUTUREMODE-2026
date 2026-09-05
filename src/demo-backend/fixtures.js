import levelCityImg from '../assets/level_city.png';

// DEMO ONLY: browser fixtures that imitate data returned by the future API.
// Each newly registered account receives their own 6 starting NOXCATs and 3 equipment items.

/**
 * Generates the full initial roster of 6 NOXCATs and 3 equipment items for any player.
 * - 3 copies of NOXCAT (Core 1, 2, 3: 100hp, 10 atk, 2 def, 100% spd)
 * - FUTURE NOXCAT (Tech: 100hp, 12 atk, 1 def, 100% spd)
 * - COOL NOXCAT (Rush: 100hp, 10 atk, 3 def, 80% spd)
 * - HARD NOXCAT (Tank: 100hp, 8 atk, 2 def, 120% spd)
 * - 3 starter equipments (像素劍 +2 ATK, 資料盾 +1 DEF, 回家石 +5 HP)
 */
export function createStarterRosterForPlayer(playerId) {
  const pId = playerId || 'player';
  const pets = [
    // 3 copies of the current 1st guy (100hp, 10 atk, 2 def, 100% spd)
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
      skill: '自動回家：戰鬥中 HP 歸零時自動返回背包，不掉落不遺失。',
      equipped: `item-${pId}-shield`,
      ownerId: pId,
    },
    {
      id: `nox-${pId}-2`,
      idString: `peg_noxcat_core_${pId}_2`,
      code: '01',
      name: 'NOXCAT #2',
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
      skill: '自動回家：戰鬥中 HP 歸零時自動返回背包，不掉落不遺失。',
      equipped: `item-${pId}-blade`,
      ownerId: pId,
    },
    {
      id: `nox-${pId}-3`,
      idString: `peg_noxcat_core_${pId}_3`,
      code: '01',
      name: 'NOXCAT #3',
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
      skill: '自動回家：戰鬥中 HP 歸零時自動返回背包，不掉落不遺失。',
      equipped: null,
      ownerId: pId,
    },
    // The next 3 guys:
    // 100hp 12 atk 1 def 100%spd
    {
      id: `nox-${pId}-4`,
      idString: `peg_noxcat_tech_${pId}`,
      code: '02',
      name: 'FUTURE NOXCAT',
      className: 'TECH',
      level: 10,
      hp: 100,
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
    // 100hp 10atk 3 def 80%spd
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
    // 100hp 8 atk 2 def 120%spd
    {
      id: `nox-${pId}-6`,
      idString: `peg_noxcat_tank_${pId}`,
      code: '04',
      name: 'HARD NOXCAT',
      className: 'TANK',
      level: 8,
      hp: 100,
      atk: 8,
      def: 2,
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

export const DEMO_PLAYERS = [];
export const DEMO_PETS = [];
export const DEMO_ITEMS = [];

export const DEMO_DUNGEONS = [
  { id: 'dungeon-zero', chapter: '01', name: '零號資料井', subtitle: 'DATA WELL // ENTRY NODE', difficulty: 'NORMAL', cost: 5, loot: 3, tone: '#00ff66', image: levelCityImg },
  { id: 'dungeon-ash', chapter: '02', name: '灰燼轉運站', subtitle: 'ASH RELAY // HIGH RISK', difficulty: 'HARD', cost: 8, loot: 7, tone: '#ff5f3d' },
];

export const DEMO_TRADES = [
  { id: 'trade-001', from: 'PIXEL_GHOST', offer: 'FUTURE NOXCAT', offerPetCode: '01', offerWeapon: '像素短劍', request: '回家石', requestQty: 2, status: 'pending', time: '2 分鐘前' },
  { id: 'trade-002', from: 'CYBER_PUP', offer: 'SHADOW NOXCAT', offerPetCode: '03', offerWeapon: '資料盾', request: '能量晶石', requestQty: 2, status: 'pending', time: '10 分鐘前' },
  { id: 'trade-003', from: 'NULL_CAT', offer: 'EMBER NOXCAT', offerPetCode: '07', offerWeapon: '像素短劍', request: '急救模組', requestQty: 2, status: 'accepted', time: '1 小時前' },
  { id: 'trade-004', from: 'GLITCH_FOX', offer: 'NEO NOXCAT', offerPetCode: '02', offerWeapon: '資料盾', request: '量子核心', requestQty: 2, status: 'rejected', time: '昨天' },
];

export const DEMO_LOST_ASSETS = [
  { id: 'lost-003', type: 'pet', name: 'SHADOW NOXCAT', code: '03', status: 'in_pool', location: '灰燼轉運站', lostAt: '2 天前' },
  { id: 'lost-004', type: 'weapon', name: '像素短劍', iconType: 'blade', bonus: '+15 ATK', status: 'in_pool', location: '零號資料井', lostAt: '3 天前' },
  { id: 'lost-005', type: 'pet', name: 'NEO NOXCAT', code: '02', status: 'in_pool', location: '零號資料井', lostAt: '4 天前' },
];

export function createDemoDatabase() {
  return {
    players: [],
    pets: [],
    items: [],
    dungeons: DEMO_DUNGEONS.map((entry) => ({ ...entry })),
    trades: DEMO_TRADES.map((entry) => ({ ...entry })),
    lostAssets: DEMO_LOST_ASSETS.map((entry) => ({ ...entry })),
  };
}
