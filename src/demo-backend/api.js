import { createDemoDatabase, createStarterRosterForPlayer } from './fixtures.js';
import { getAuthCookie } from '../utils/cookieStorage.js';
import { tradeBackend, TransferUnit, TransferTreasure } from './tradeBackend.js';
import { lostAssetsBackend } from './lostAssetsBackend.js';

// TEST BACKEND ONLY. This async localStorage adapter mirrors a future API
// boundary so screens can later swap to HTTP without changing their UI logic.
const DB_KEY = 'futuremode_demo_backend_v5';
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
          parsed.pets.forEach((p) => {
            p.accent = '#00ff66';
            if (p.name === 'COOL NOXCAT' || p.idString?.includes('rush')) {
              p.hp = 130;
              p.atk = 8;
              p.def = 3;
              p.spd = 120;
            } else if (p.name === 'HARD NOXCAT' || p.idString?.includes('tank')) {
              p.hp = 100;
              p.atk = 10;
              p.def = 3;
              p.spd = 80;
            }
          });
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

  async getTrades(status, playerId) {
    await wait(100);
    const db = readDb();
    const activePlayerId = playerId || getAuthCookie()?.id || null;
    return tradeBackend.getTrades(db, { playerId: activePlayerId, status });
  },

  async createTrade({
    playerId,
    to_player_id: toPlayerId,
    unit_id: unitId,
    treasure_id: treasureId,
    request_unit_id: requestUnitId,
    request_treasure_id: requestTreasureId,
    request_asset_type: requestAssetType,
    request,
    request_qty: requestQty,
  }) {
    await wait(240);
    const db = readDb();
    const activePlayerId = playerId || getAuthCookie()?.id || null;
    tradeBackend.createTrade(db, {
      fromPlayerId: activePlayerId,
      toPlayerId,
      unitId,
      treasureId,
      requestUnitId,
      requestTreasureId,
      requestAssetType,
      request,
      requestQty,
    });
    writeDb(db);
    return this.getGameData(activePlayerId);
  },

  async resolveTrade(tradeId, status, playerId) {
    await wait(160);
    const db = readDb();
    const activePlayerId = playerId || getAuthCookie()?.id || null;
    if (status === 'accepted') {
      tradeBackend.acceptTrade(db, { tradeId, callerPlayerId: activePlayerId });
    } else if (status === 'rejected') {
      tradeBackend.rejectTrade(db, { tradeId, callerPlayerId: activePlayerId });
    } else if (status === 'cancelled') {
      tradeBackend.cancelTrade(db, { tradeId, callerPlayerId: activePlayerId });
    }
    writeDb(db);
    return this.getGameData(activePlayerId);
  },

  async acceptTrade(tradeId, playerId) {
    return this.resolveTrade(tradeId, 'accepted', playerId);
  },

  async rejectTrade(tradeId, playerId) {
    return this.resolveTrade(tradeId, 'rejected', playerId);
  },

  async cancelTrade(tradeId, playerId) {
    return this.resolveTrade(tradeId, 'cancelled', playerId);
  },

  async getLostAssets(dungeonId, status) {
    await wait(100);
    const db = readDb();
    return lostAssetsBackend.getLostAssets(db, { dungeonId, status });
  },

  async claimLostAsset(dungeonId, playerId) {
    await wait(140);
    const db = readDb();
    const activePlayerId = playerId || getAuthCookie()?.id || null;
    const player = (db.players || []).find((p) => p.id === activePlayerId);
    const claimed = lostAssetsBackend.claimDungeonLostAsset(db, {
      dungeonId,
      winnerPlayerId: activePlayerId,
      winnerCallsign: player?.gameId || player?.displayName || player?.username,
    });
    writeDb(db);
    return {
      gameData: await this.getGameData(activePlayerId),
      claimed,
    };
  },

  async recordBattleResult(result, dungeonId, playerId) {
    await wait(140);
    const db = readDb();
    const activePlayerId = playerId || getAuthCookie()?.id || null;
    const player = (db.players || []).find((p) => p.id === activePlayerId);
    const dungeon = (db.dungeons || []).find((d) => d.id === dungeonId);

    // 1. Add gold earned to player wallet
    if (result.goldEarned && result.goldEarned > 0) {
      if (!db.wallet) db.wallet = { gold: 0, gem: 0, chip: 0 };
      db.wallet.gold = (Number(db.wallet.gold) || 0) + result.goldEarned;
    }

    // 2. Snapshot lost equipment & pets before removal to populate dungeon pool
    const lostEquipments = [];
    if (result.lostItemIds && result.lostItemIds.length > 0) {
      const lostSet = new Set(result.lostItemIds);
      (db.items || []).forEach((item) => {
        if (lostSet.has(item.id) || lostSet.has(item.idString)) {
          lostEquipments.push(item);
        }
      });
      db.items = (db.items || []).filter(
        (item) => !lostSet.has(item.id) && !lostSet.has(item.idString)
      );
      if (db.pets) {
        db.pets.forEach((p) => {
          if (lostSet.has(p.equipped)) p.equipped = null;
        });
      }
    }

    const lostPegs = [];
    if (result.lostPegIds && result.lostPegIds.length > 0) {
      const lostPetSet = new Set(result.lostPegIds);
      (db.pets || []).forEach((pet) => {
        if (lostPetSet.has(pet.id) || lostPetSet.has(pet.idString)) {
          lostPegs.push(pet);
        }
      });
      db.pets = (db.pets || []).filter(
        (pet) => !lostPetSet.has(pet.id) && !lostPetSet.has(pet.idString)
      );
    }

    // 3. Drop into dungeon lost assets pool!
    if (lostPegs.length > 0 || lostEquipments.length > 0) {
      lostAssetsBackend.dropLostAssets(db, {
        dungeonId,
        dungeonName: dungeon?.name || '深層資料井',
        playerId: activePlayerId,
        playerCallsign: player?.gameId || player?.displayName || player?.username,
        lostPegs: lostPegs.map((p) => ({ petId: p.id, label: p.name, code: p.code })),
        lostEquipments: lostEquipments.map((e) => ({ itemId: e.id, label: e.name })),
      });
    }

    // 4. If player won, rescue any lost asset remaining in this dungeon pool!
    let rescued = null;
    if (activePlayerId && dungeonId && result?.winner === 'PLAYER') {
      db.dungeonProgress ||= {};
      const solved = new Set(db.dungeonProgress[activePlayerId] || []);
      solved.add(dungeonId);
      db.dungeonProgress[activePlayerId] = [...solved];

      rescued = lostAssetsBackend.claimDungeonLostAsset(db, {
        dungeonId,
        winnerPlayerId: activePlayerId,
        winnerCallsign: player?.gameId || player?.displayName || player?.username,
      });
    }

    db.lastBattle = {
      ...result,
      dungeonId,
      rescuedAsset: rescued,
      settledAt: Date.now(),
      testOnly: true,
    };

    writeDb(db);
    return this.getGameData(activePlayerId);
  },

  async reset(playerId) {
    await wait(100);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DB_KEY);
    }
    memoryDb = null;
    return this.getGameData(playerId);
  },
};

export { tradeBackend, lostAssetsBackend, TransferUnit, TransferTreasure };


