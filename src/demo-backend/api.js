import { createDemoDatabase, createStarterRosterForPlayer } from './fixtures.js';
import { getAuthCookie } from '../utils/cookieStorage.js';

// TEST BACKEND ONLY. This async localStorage adapter mirrors a future API
// boundary so screens can later swap to HTTP without changing their UI logic.
const DB_KEY = 'futuremode_demo_backend_v4';
const wait = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));
const DEMO_PASSWORD = 'demo1234';

let memoryDb = null;

function readDb() {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(DB_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.pets)) {
          parsed.pets.forEach(p => { p.accent = '#00ff66'; });
        }
        memoryDb = parsed;
        return parsed;
      }
    }
  } catch (e) {}

  if (!memoryDb) {
    memoryDb = createDemoDatabase();
    writeDb(memoryDb);
  }
  return memoryDb;
}

function writeDb(db) {
  memoryDb = db;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    }
  } catch (e) {
    console.warn('Failed to write to localStorage:', e);
  }
  return db;
}

export const demoApi = {
  async login(username, password) {
    await wait(320);
    const db = readDb();
    const base = db.players.find((player) => player.username === username.trim().toLowerCase());
    if (!base) throw new Error('本帳號不存在或密碼不正確');
    const isValid = base.password ? base.password === password : (password === DEMO_PASSWORD || password === 'demo1234' || !base.password);
    if (!isValid) throw new Error('本帳號不存在或密碼不正確');
    return { ...base, isDemo: true };
  },

  async register(username, password, displayName) {
    await wait(320);
    const db = readDb();
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser) throw new Error('請輸入帳號');
    if (db.players.some((player) => player.username === cleanUser)) {
      throw new Error('此帳號已存在');
    }
    const cleanDisplayName = (displayName || '').replace(/[^\p{Script=Han}a-zA-Z0-9]/gu, '').trim().slice(0, 16);
    if (!cleanDisplayName) {
      throw new Error('玩家暱稱僅限中文、英文字母或數字');
    }
    const newPlayer = {
      id: `player-${Date.now()}`,
      username: cleanUser,
      gameId: cleanUser.toUpperCase(),
      displayName: cleanDisplayName,
      password,
      level: 1,
      rank: 'Bronze I',
      nox: 1000,
      streak: 0,
    };
    db.players.push(newPlayer);

    // Give each newly registered account the 6 starting NOXCATs and 3 equipment items
    const { pets: starterPets, items: starterItems } = createStarterRosterForPlayer(newPlayer.id);
    db.pets.push(...starterPets);
    db.items.push(...starterItems);

    writeDb(db);
    return { ...newPlayer, isDemo: true };
  },

  async getGameData(playerId) {
    await wait();
    const db = readDb();
    const activePlayerId = playerId || getAuthCookie()?.id || null;

    if (!activePlayerId) {
      return {
        ...db,
        activePlayerId: null,
        pets: [],
        items: [],
      };
    }

    // Per-person resolution: filter pets and items for active player
    let userPets = (db.pets || []).filter((p) => p.ownerId === activePlayerId);
    let userItems = (db.items || []).filter((i) => i.ownerId === activePlayerId);

    // If an account has no pets yet, automatically grant the starter 6 NOXCATs and 3 equipments!
    if (userPets.length === 0) {
      const { pets: starterPets, items: starterItems } = createStarterRosterForPlayer(activePlayerId);
      db.pets = (db.pets || []).concat(starterPets);
      db.items = (db.items || []).concat(starterItems);
      writeDb(db);
      userPets = starterPets;
      userItems = starterItems;
    }

    return {
      ...db,
      activePlayerId,
      solvedDungeonIds: db.dungeonProgress?.[activePlayerId] || [],
      pets: userPets,
      items: userItems,
      allPets: db.pets,
      allItems: db.items,
    };
  },

  async togglePartyMember(petId, playerId) {
    await wait(120);
    const db = readDb();
    const activePlayerId = playerId || getAuthCookie()?.id;
    const pet = db.pets.find((entry) => entry.id === petId);
    if (!pet) throw new Error('找不到此 NOXCAT');

    if (pet.selected) {
      pet.selected = false;
    } else {
      const activeUserPets = db.pets.filter((p) => p.ownerId === activePlayerId);
      if (activeUserPets.filter((entry) => entry.selected).length >= 3) {
        throw new Error('出戰隊伍最多 3 隻');
      }
      pet.selected = true;
    }
    writeDb(db);
    return this.getGameData(activePlayerId);
  },

  async equipItem(petId, itemId, playerId) {
    await wait(120);
    const db = readDb();
    const activePlayerId = playerId || getAuthCookie()?.id;
    const pet = db.pets.find((entry) => entry.id === petId);
    if (!pet) throw new Error('找不到此 NOXCAT');

    if (pet.equipped === itemId) {
      pet.equipped = null;
    } else {
      // Unequip if another pet belonging to this player has it
      db.pets.forEach((p) => {
        if (p.ownerId === activePlayerId && p.equipped === itemId) {
          p.equipped = null;
        }
      });
      pet.equipped = itemId;
    }
    writeDb(db);
    return this.getGameData(activePlayerId);
  },

  async addPet(petData = {}, playerId) {
    await wait(120);
    const db = readDb();
    const activePlayerId = playerId || getAuthCookie()?.id || 'player-a';
    const playerPets = db.pets.filter((p) => p.ownerId === activePlayerId || (!p.ownerId && activePlayerId === 'player-a'));
    const count = playerPets.length + 1;
    const newId = `nox-${activePlayerId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newPet = {
      id: newId,
      idString: `peg_noxcat_${newId}`,
      code: petData.code || String(count).padStart(2, '0').slice(-2),
      name: petData.name || `NOXCAT #${count}`,
      className: petData.className || (count % 3 === 0 ? 'TANK' : count % 2 === 0 ? 'RUSH' : 'CORE'),
      level: petData.level || 1,
      hp: petData.hp || 100,
      atk: petData.atk || 10,
      def: petData.def || 2,
      spd: petData.spd || 100,
      protected: false,
      selected: false,
      accent: '#00ff66',
      quote: petData.quote || 'Feel Nothing. Do Everything.',
      skill: petData.skill || '自動回家：戰鬥中 HP 歸零時自動返回背包。',
      equipped: null,
      ownerId: activePlayerId,
    };
    db.pets.push(newPet);
    writeDb(db);
    return this.getGameData(activePlayerId);
  },

  async addItem(itemData = {}, playerId) {
    await wait(120);
    const db = readDb();
    const activePlayerId = playerId || getAuthCookie()?.id || 'player-a';
    const playerItems = db.items.filter((i) => i.ownerId === activePlayerId || (!i.ownerId && activePlayerId === 'player-a'));
    const count = playerItems.length + 1;
    const newId = `item-${activePlayerId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const isBlade = count % 2 !== 0;
    const newItem = {
      id: newId,
      idString: isBlade ? `wpn_blade_${newId}` : `gear_shield_${newId}`,
      name: itemData.name || (isBlade ? `像素短劍 #${count}` : `資料盾 #${count}`),
      type: itemData.type || (isBlade ? 'WEAPON' : 'GEAR'),
      bonus: itemData.bonus || (isBlade ? 'ATK +2' : 'DEF +1'),
      rarity: itemData.rarity || (count % 3 === 0 ? 'EPIC' : 'RARE'),
      hpBonus: itemData.hpBonus || 0,
      atkBonus: itemData.atkBonus ?? (isBlade ? 2 : 0),
      defBonus: itemData.defBonus ?? (isBlade ? 0 : 1),
      spdBonus: itemData.spdBonus ?? 0,
      quote: itemData.quote || (isBlade ? '只要砍得夠快，敵人就追不上。' : '堅不可摧。'),
      skill: itemData.skill || '鋒刃加成：提升裝備者基礎屬性。',
      ownerId: activePlayerId,
    };
    db.items.push(newItem);
    writeDb(db);
    return this.getGameData(activePlayerId);
  },

  async createTrade({ playerId, to_player_id: toPlayerId, unit_id: unitId, treasure_id: treasureId }) {
    await wait(260);
    const db = readDb();
    const suppliedAssetCount = Number(Boolean(unitId)) + Number(Boolean(treasureId));
    const pet = unitId ? db.pets.find((entry) => entry.id === unitId) : null;
    const item = treasureId ? db.items.find((entry) => entry.id === treasureId) : null;
    if (!toPlayerId || suppliedAssetCount !== 1 || (!pet && !item)) throw new Error('交易資料不完整');
    const equippedItem = pet?.equipped ? db.items.find((entry) => entry.id === pet.equipped) : null;
    db.trades.unshift({
      id: `trade-${Date.now()}`,
      from: (playerId || 'PLAYER').trim().toUpperCase(),
      to: toPlayerId.trim(),
      assetType: pet ? 'unit' : 'treasure',
      offeredPetId: pet?.id || null,
      offeredItemId: item?.id || null,
      offer: pet?.name || item?.name,
      offerPetCode: pet?.code || null,
      offerWeapon: pet ? (equippedItem?.name || '未裝備') : item?.name,
      request: toPlayerId.trim(),
      requestQty: null,
      status: 'pending',
      time: '剛剛',
    });
    writeDb(db);
    return this.getGameData(playerId);
  },

  async resolveTrade(tradeId, status, playerId) {
    await wait(160);
    const db = readDb();
    const activePlayerId = playerId || getAuthCookie()?.id || 'player-a';
    const trade = db.trades.find((entry) => entry.id === tradeId);
    if (trade) {
      trade.status = status;
      if (status === 'accepted') {
        if (trade.offeredPetId) {
          const pet = db.pets.find((p) => p.id === trade.offeredPetId);
          if (pet) pet.ownerId = activePlayerId;
        }
        if (trade.offeredItemId) {
          const item = db.items.find((i) => i.id === trade.offeredItemId);
          if (item) item.ownerId = activePlayerId;
        }
      }
    }
    writeDb(db);
    return this.getGameData(activePlayerId);
  },

  async recordBattleResult(result, dungeonId, playerId) {
    await wait(140);
    const db = readDb();
    const activePlayerId = playerId || getAuthCookie()?.id || null;

    // 1. Add gold earned to player wallet
    if (result.goldEarned && result.goldEarned > 0) {
      if (!db.wallet) db.wallet = { gold: 0, gem: 0, chip: 0 };
      db.wallet.gold = (Number(db.wallet.gold) || 0) + result.goldEarned;
    }

    // 2. Remove lost equipment from items
    if (result.lostItemIds && result.lostItemIds.length > 0) {
      const lostSet = new Set(result.lostItemIds);
      db.items = (db.items || []).filter(item => !lostSet.has(item.id) && !lostSet.has(item.idString));
      if (db.pets) {
        db.pets.forEach(p => {
          if (lostSet.has(p.equipped)) p.equipped = null;
        });
      }
    }

    // 3. Remove lost pets from collection
    if (result.lostPegIds && result.lostPegIds.length > 0) {
      const lostPetSet = new Set(result.lostPegIds);
      db.pets = (db.pets || []).filter(pet => !lostPetSet.has(pet.id) && !lostPetSet.has(pet.idString));
    }
    db.lastBattle = { ...result, dungeonId, settledAt: Date.now(), testOnly: true };
    if (activePlayerId && dungeonId && result?.winner === 'PLAYER') {
      db.dungeonProgress ||= {};
      const solved = new Set(db.dungeonProgress[activePlayerId] || []);
      solved.add(dungeonId);
      db.dungeonProgress[activePlayerId] = [...solved];
    }
    writeDb(db);
    return this.getGameData(activePlayerId);
  },

  async reset(playerId) {
    await wait(100);
    localStorage.removeItem(DB_KEY);
    return this.getGameData(playerId);
  },
};

