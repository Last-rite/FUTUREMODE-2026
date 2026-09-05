// DEMO ONLY: browser fixtures that imitate data returned by the future API.
// This module is not a production backend and must never be treated as an
// authority for authentication or asset ownership.

export const DEMO_PLAYERS = [
  { id: 'player-a', username: 'neon_mochi', gameId: 'NEON_MOCHI', displayName: 'Demo Pilot A', level: 12, rank: 'Silver III', nox: 1840, streak: 4 },
  { id: 'player-b', username: 'void_rider', gameId: 'VOID_RIDER', displayName: 'Demo Pilot B', level: 9, rank: 'Bronze I', nox: 960, streak: 2 },
];

export const DEMO_PETS = [
  // 3 copies of the current 1st guy (100hp, 10 atk, 2 def, 100% spd)
  { id: 'nox-001', idString: 'peg_noxcat_core_1', code: '01', name: 'NOXCAT', className: 'CORE', level: 12, hp: 100, atk: 10, def: 2, spd: 100, protected: true, selected: true, accent: '#00ff66', quote: 'Feel Nothing. Do Everything.', skill: '自動回家：戰鬥中 HP 歸零時自動返回背包，不掉落不遺失。', equipped: 'item-shield' },
  { id: 'nox-001-b', idString: 'peg_noxcat_core_2', code: '01', name: 'NOXCAT #2', className: 'CORE', level: 12, hp: 100, atk: 10, def: 2, spd: 100, protected: false, selected: true, accent: '#00ff66', quote: 'Feel Nothing. Do Everything.', skill: '自動回家：戰鬥中 HP 歸零時自動返回背包，不掉落不遺失。', equipped: 'item-blade' },
  { id: 'nox-001-c', idString: 'peg_noxcat_core_3', code: '01', name: 'NOXCAT #3', className: 'CORE', level: 12, hp: 100, atk: 10, def: 2, spd: 100, protected: false, selected: true, accent: '#00ff66', quote: 'Feel Nothing. Do Everything.', skill: '自動回家：戰鬥中 HP 歸零時自動返回背包，不掉落不遺失。', equipped: null },
  // The next 3 guys:
  // 100hp 12 atk 1 def 100%spd
  { id: 'nox-002', idString: 'peg_noxcat_tech', code: '02', name: 'FUTURE NOXCAT', className: 'TECH', level: 10, hp: 100, atk: 12, def: 1, spd: 100, protected: false, selected: false, accent: '#8bff3d', quote: 'Tomorrow already happened.', skill: '時空衝擊：撞牆後下一次攻擊 +2 傷害。', equipped: null },
  // 100hp 10atk 3 def 80%spd
  { id: 'nox-003', idString: 'peg_noxcat_rush', code: '03', name: 'COOL NOXCAT', className: 'RUSH', level: 11, hp: 100, atk: 10, def: 3, spd: 80, protected: false, selected: false, accent: '#35d9ff', quote: 'No rush. I am the rush.', skill: '疾風推進：碰撞時強力擊退對手。', equipped: null },
  // 100hp 8 atk 2 def 120%spd
  { id: 'nox-004', idString: 'peg_noxcat_tank', code: '04', name: 'HARD NOXCAT', className: 'TANK', level: 8, hp: 100, atk: 8, def: 2, spd: 120, protected: false, selected: false, accent: '#ffcc33', quote: 'Try moving me.', skill: '堅毅立場：若上一輪未命中任何目標，下一次受擊免傷並使對手減速。', equipped: null },
];

export const DEMO_ITEMS = [
  { id: 'item-blade', idString: 'wpn_pixel_blade', name: '像素劍', type: 'WEAPON', bonus: 'ATK +2', rarity: 'RARE', hpBonus: 0, atkBonus: 2, defBonus: 0, spdBonus: 0, quote: '只要砍得夠快，敵人就追不上。', skill: '鋒刃加成：提升裝備者 2 點基礎攻擊力。' },
  { id: 'item-shield', idString: 'gear_data_shield', name: '資料盾', type: 'GEAR', bonus: 'DEF +1', rarity: 'COMMON', hpBonus: 0, atkBonus: 0, defBonus: 1, spdBonus: 0, quote: '擋得住攻擊，擋不住隊友犯蠢。', skill: '資料壁壘：提升裝備者 1 點基礎防禦力。' },
  { id: 'item-home', idString: 'item_return_stone', name: '回家石', type: 'TREASURE', bonus: 'HP +5 · 防止一次掉落', rarity: 'EPIC', hpBonus: 5, atkBonus: 0, defBonus: 0, spdBonus: 0, quote: '帶你安全抵達溫暖的貓窩。', skill: '空間折躍：提升裝備者 5 點生命上限；戰鬥 HP 歸零時觸發，防止本次掉落並直接回家。' },
];

export const DEMO_DUNGEONS = [
  { id: 'dungeon-zero', chapter: '01', name: '零號資料井', subtitle: 'DATA WELL // ENTRY NODE', difficulty: 'NORMAL', cost: 5, loot: 3, tone: '#00ff66' },
  { id: 'dungeon-ash', chapter: '02', name: '灰燼轉運站', subtitle: 'ASH RELAY // HIGH RISK', difficulty: 'HARD', cost: 8, loot: 7, tone: '#ff5f3d' },
];

export const DEMO_TRADES = [
  { id: 'trade-001', from: 'PIXEL_GHOST', offer: 'FUTURE NOXCAT', offerPetCode: '01', offerWeapon: '像素短劍', request: '回家石', requestQty: 2, status: 'pending', time: '2 分鐘前' },
  { id: 'trade-002', from: 'CYBER_PUP', offer: 'SHADOW NOXCAT', offerPetCode: '03', offerWeapon: '資料盾', request: '能量晶石', requestQty: 2, status: 'pending', time: '10 分鐘前' },
  { id: 'trade-003', from: 'NULL_CAT', offer: 'EMBER NOXCAT', offerPetCode: '07', offerWeapon: '像素短劍', request: '急救模組', requestQty: 2, status: 'accepted', time: '1 小時前' },
  { id: 'trade-004', from: 'GLITCH_FOX', offer: 'NEO NOXCAT', offerPetCode: '02', offerWeapon: '資料盾', request: '量子核心', requestQty: 2, status: 'rejected', time: '昨天' },
  { id: 'trade-005', from: 'VOID_RIDER', offer: 'WAVE NOXCAT', offerPetCode: '05', offerWeapon: '像素短劍', request: '回家石', requestQty: 2, status: 'rejected', time: '2 天前' },
];

export const DEMO_LOST_ASSETS = [
  { id: 'lost-001', type: 'pet', name: 'EMBER NOXCAT', code: '07', status: 'claimed', claimedBy: 'VOID_RIDER', lostAt: '今天 09:42' },
  { id: 'lost-002', type: 'pet', name: 'WAVE NOXCAT', code: '05', status: 'claimed', claimedBy: 'PIXEL_GHOST', lostAt: '昨天 23:18' },
  { id: 'lost-003', type: 'pet', name: 'SHADOW NOXCAT', code: '03', status: 'in_pool', location: '灰燼轉運站', lostAt: '2 天前' },
  { id: 'lost-004', type: 'weapon', name: '像素短劍', iconType: 'blade', bonus: '+15 ATK', status: 'in_pool', location: '零號資料井', lostAt: '3 天前' },
  { id: 'lost-005', type: 'pet', name: 'NEO NOXCAT', code: '02', status: 'in_pool', location: '零號資料井', lostAt: '4 天前' },
];

export function createDemoDatabase() {
  return {
    players: DEMO_PLAYERS.map((entry) => ({ ...entry })),
    pets: DEMO_PETS.map((entry) => ({ ...entry })),
    items: DEMO_ITEMS.map((entry) => ({ ...entry })),
    dungeons: DEMO_DUNGEONS.map((entry) => ({ ...entry })),
    trades: DEMO_TRADES.map((entry) => ({ ...entry })),
    lostAssets: DEMO_LOST_ASSETS.map((entry) => ({ ...entry })),
  };
}
