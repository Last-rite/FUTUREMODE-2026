// DEMO ONLY: browser fixtures that imitate data returned by the future API.
// This module is not a production backend and must never be treated as an
// authority for authentication or asset ownership.

export const DEMO_PLAYERS = [
  { id: 'player-a', username: 'neon_mochi', gameId: 'NEON_MOCHI', displayName: 'Demo Pilot A', level: 12, rank: 'Silver III', nox: 1840, streak: 4 },
  { id: 'player-b', username: 'void_rider', gameId: 'VOID_RIDER', displayName: 'Demo Pilot B', level: 9, rank: 'Bronze I', nox: 960, streak: 2 },
];

export const DEMO_PETS = [
  { id: 'nox-001', code: '01', name: 'NOXCAT', className: 'CORE', level: 12, hp: 100, atk: 8, def: 2, spd: 5, protected: true, selected: true, accent: '#00ff66', quote: 'Feel Nothing. Do Everything.', skill: '穩定而可靠的初始單位。', equipped: 'item-shield' },
  { id: 'nox-002', code: '02', name: 'FUTURE NOXCAT', className: 'TECH', level: 10, hp: 80, atk: 9, def: 1, spd: 7, protected: false, selected: true, accent: '#8bff3d', quote: 'Tomorrow already happened.', skill: '撞牆後，下一次攻擊 +2。', equipped: 'item-blade' },
  { id: 'nox-003', code: '03', name: 'COOL NOXCAT', className: 'RUSH', level: 11, hp: 100, atk: 10, def: 2, spd: 10, protected: false, selected: true, accent: '#35d9ff', quote: 'No rush. I am the rush.', skill: '碰撞時擊退對手。', equipped: null },
  { id: 'nox-004', code: '04', name: 'HARD NOXCAT', className: 'TANK', level: 8, hp: 130, atk: 6, def: 3, spd: 3, protected: false, selected: false, accent: '#ffcc33', quote: 'Try moving me.', skill: '未命中時，下一次受擊免傷並使對手減速。', equipped: null },
];

export const DEMO_ITEMS = [
  { id: 'item-blade', name: '像素劍', type: 'WEAPON', bonus: 'ATK +3', rarity: 'RARE' },
  { id: 'item-shield', name: '資料盾', type: 'GEAR', bonus: 'DEF +3', rarity: 'COMMON' },
  { id: 'item-home', name: '回家石', type: 'TREASURE', bonus: '防止一次掉落', rarity: 'EPIC' },
];

export const DEMO_DUNGEONS = [
  { id: 'dungeon-zero', chapter: '01', name: '零號資料井', subtitle: 'DATA WELL // ENTRY NODE', difficulty: 'NORMAL', cost: 5, loot: 3, tone: '#00ff66' },
  { id: 'dungeon-ash', chapter: '02', name: '灰燼轉運站', subtitle: 'ASH RELAY // HIGH RISK', difficulty: 'HARD', cost: 8, loot: 7, tone: '#ff5f3d' },
];

export const DEMO_TRADES = [
  { id: 'trade-001', from: 'PIXEL_GHOST', offer: 'FUTURE NOXCAT', request: '回家石', status: 'pending', time: '2 分鐘前' },
  { id: 'trade-002', from: 'NULL_CAT', offer: '像素劍', request: '資料盾', status: 'accepted', time: '昨天' },
];

export const DEMO_LOST_ASSETS = [
  { id: 'lost-001', name: 'EMBER NOXCAT', code: '07', status: 'in_pool', location: '灰燼轉運站', lostAt: '今天 09:42' },
  { id: 'lost-002', name: 'WAVE NOXCAT', code: '05', status: 'claimed', claimedBy: 'VOID_RIDER', lostAt: '昨天 23:18' },
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
