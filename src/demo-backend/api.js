import { createDemoDatabase } from './fixtures.js';

// TEST BACKEND ONLY. This async localStorage adapter mirrors a future API
// boundary so screens can later swap to HTTP without changing their UI logic.
const DB_KEY = 'futuremode_demo_backend_v2';
const wait = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));
const DEMO_PASSWORD = 'demo1234';

function readDb() {
  try {
    const saved = localStorage.getItem(DB_KEY);
    if (!saved) {
      const fresh = createDemoDatabase();
      writeDb(fresh);
      return fresh;
    }
    return JSON.parse(saved);
  } catch {
    return createDemoDatabase();
  }
}

function writeDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  return db;
}

export const demoApi = {
  async login(username, password) {
    await wait(320);
    const db = readDb();
    const base = db.players.find((player) => player.username === username.trim().toLowerCase());
    if (!base || password !== DEMO_PASSWORD) throw new Error('帳號或密碼錯誤');
    return { ...base, isDemo: true };
  },
  async getGameData() { await wait(); return readDb(); },
  async togglePartyMember(petId) {
    await wait(120);
    const db = readDb();
    const pet = db.pets.find((entry) => entry.id === petId);
    if (!pet) throw new Error('找不到此 NOXCAT');
    if (pet.selected) pet.selected = false;
    else {
      if (db.pets.filter((entry) => entry.selected).length >= 3) throw new Error('出戰隊伍最多 3 隻');
      pet.selected = true;
    }
    return writeDb(db);
  },
  async equipItem(petId, itemId) {
    await wait(120);
    const db = readDb();
    const pet = db.pets.find((entry) => entry.id === petId);
    if (!pet) throw new Error('找不到此 NOXCAT');
    if (pet.equipped === itemId) {
      pet.equipped = null;
    } else {
      // Unequip if another pet has it
      db.pets.forEach((p) => {
        if (p.equipped === itemId) p.equipped = null;
      });
      pet.equipped = itemId;
    }
    return writeDb(db);
  },
  async createTrade({ playerId, offeredPetId, requestedItemId }) {
    await wait(260);
    const db = readDb();
    const pet = db.pets.find((entry) => entry.id === offeredPetId);
    const item = db.items.find((entry) => entry.id === requestedItemId);
    const equippedItem = pet?.equipped ? db.items.find((entry) => entry.id === pet.equipped) : null;
    db.trades.unshift({
      id: `trade-${Date.now()}`,
      from: playerId.trim().toUpperCase(),
      offer: pet?.name || 'NOXCAT',
      offerPetCode: pet?.code || '01',
      offerWeapon: equippedItem?.name || '像素短劍',
      request: item?.name || '道具',
      requestQty: 2,
      status: 'pending',
      time: '剛剛',
    });
    return writeDb(db);
  },
  async resolveTrade(tradeId, status) {
    await wait(160);
    const db = readDb();
    const trade = db.trades.find((entry) => entry.id === tradeId);
    if (trade) trade.status = status;
    return writeDb(db);
  },
  async recordBattleResult(result, dungeonId) {
    await wait(140);
    const db = readDb();
    db.lastBattle = { ...result, dungeonId, settledAt: Date.now(), testOnly: true };
    return writeDb(db);
  },
  async reset() { await wait(100); localStorage.removeItem(DB_KEY); return createDemoDatabase(); },
};
