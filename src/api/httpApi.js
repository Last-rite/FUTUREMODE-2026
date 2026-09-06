import { clearAccessToken, getAccessToken, setAccessToken } from './session.js';
import { saveStoredLoadouts, setActiveLoadoutIndex } from '../utils/teamStorage.js';

const DEFAULT_BASE_URL = '';

const SPECIES_PRESENTATION = {
  generic: { code: '01', className: 'CORE', name: 'NOXCAT' },
  fire: { code: '02', className: 'TECH', name: 'FUTURE NOXCAT' },
  wind: { code: '03', className: 'RUSH', name: 'COOL NOXCAT' },
  water: { code: '04', className: 'TANK', name: 'HARD NOXCAT' },
};

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'request_failed', fields = {}, requestId = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.requestId = requestId;
  }
}

function trimBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function jwtPayload(token) {
  try {
    const encoded = token.split('.')[1];
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(decodeURIComponent(atob(padded).split('').map((character) => (
      `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`
    )).join('')));
  } catch (error) {
    return null;
  }
}

function userFromPlayer(player) {
  return {
    id: player.id,
    username: player.username,
    displayName: player.username,
    gameId: player.username.toUpperCase(),
    level: 1,
    rank: 'Bronze I',
    nox: player.money,
    status: player.status,
    activeLoadoutSlot: player.active_loadout_slot || 1,
    isDemo: false,
  };
}

function petFromUnit(unit, index) {
  const presentation = SPECIES_PRESENTATION[unit.species] || SPECIES_PRESENTATION.generic;
  const baseStats = unit.base_stats || {};
  return {
    id: unit.id,
    idString: `noxcat_${unit.species}_${unit.id}`,
    code: presentation.code,
    name: index > 0 && unit.species === 'generic' ? `${presentation.name} · ${index + 1}` : presentation.name,
    className: presentation.className,
    level: 1,
    hp: baseStats.hp || 0,
    atk: baseStats.atk || 0,
    def: baseStats.def || 0,
    spd: baseStats.spd || 0,
    protected: Boolean(unit.is_permanent),
    selected: Boolean(unit.is_equipped),
    alive: Boolean(unit.is_alive),
    accent: '#00ff66',
    quote: 'Feel Nothing. Do Everything.',
    skill: unit.is_permanent ? '初始守護：戰敗時會返回背包。' : '自動戰鬥單位。',
    equipped: unit.equipped_treasure_id,
    ownerId: unit.owner_id,
  };
}

function itemFromTreasure(treasure) {
  const bonuses = [
    ['HP', treasure.health_bonus],
    ['ATK', treasure.damage_bonus],
    ['DEF', treasure.defense_bonus],
    ['SPD', treasure.speed_bonus],
  ].filter(([, value]) => Number(value) !== 0).map(([name, value]) => `${name} +${value}`);
  const type = treasure.treasure_type === 'weapon'
    ? 'WEAPON'
    : treasure.treasure_type === 'armor' ? 'GEAR' : 'TREASURE';
  return {
    id: treasure.id,
    idString: treasure.code || treasure.id,
    name: treasure.name || '遺物',
    type,
    bonus: bonuses.join(' · ') || '無屬性加成',
    rarity: String(treasure.rarity || 'common').toUpperCase(),
    hpBonus: treasure.health_bonus || 0,
    atkBonus: treasure.damage_bonus || 0,
    defBonus: treasure.defense_bonus || 0,
    spdBonus: treasure.speed_bonus || 0,
    effectCode: treasure.effect_code,
    charges: treasure.charges,
    quote: treasure.effect_code === 'home_stone' ? '失去意識時仍能找到回家的路。' : '來自資料井的遺物。',
    skill: treasure.effect_code === 'home_stone' ? '空間折躍：提供回家石保護。' : '裝備後提升戰鬥屬性。',
    ownerId: treasure.owner_id,
  };
}

function dungeonFromApi(dungeon, index) {
  const rawConfig = dungeon.enemy_config;
  const config = Array.isArray(rawConfig)
    ? (rawConfig[0] || {})
    : rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  return {
    id: dungeon.id,
    name: dungeon.name,
    chapter: config.chapter || String(dungeon.sort_order || index + 1).padStart(2, '0'),
    subtitle: config.subtitle || '',
    difficulty: config.difficulty || 'NORMAL',
    tone: config.tone || '#00ff66',
    image: config.image || null,
    enemyConfig: dungeon.enemy_config,
    rewardMoney: dungeon.reward_money,
    rewardDrops: dungeon.reward_drops,
  };
}

function tradeFromApi(trade, pets, items) {
  const pet = pets.find((entry) => entry.id === trade.unit_id);
  const item = items.find((entry) => entry.id === trade.treasure_id);
  const isUnit = Boolean(trade.unit_id);
  const requestedAssets = (trade.requested_assets || []).map((asset) => {
    if (asset.unit_id) {
      const requestedPet = pets.find((entry) => entry.id === asset.unit_id);
      return { ...asset, type: 'unit', id: asset.unit_id, name: requestedPet?.name || `NOXCAT ${asset.unit_id.slice(0, 8)}` };
    }
    const requestedItem = items.find((entry) => entry.id === asset.treasure_id);
    return { ...asset, type: 'treasure', id: asset.treasure_id, name: requestedItem?.name || `遺物 ${asset.treasure_id?.slice(0, 8)}` };
  });
  const requestedType = requestedAssets[0]?.type || 'gift';
  const requestedLabel = requestedAssets.length === 0
    ? '無（贈與）'
    : requestedAssets.map((asset) => asset.name).join('、');
  return {
    ...trade,
    assetType: isUnit ? 'unit' : 'treasure',
    offeredPetId: trade.unit_id,
    offeredItemId: trade.treasure_id,
    offer: pet?.name || item?.name || (isUnit ? 'NOXCAT' : '遺物'),
    offerPetCode: pet?.code,
    offerWeapon: pet?.equipped ? '已裝備' : '未裝備',
    requestedAssets,
    request_asset_type: requestedType,
    request: requestedLabel,
    requestQty: requestedAssets.length,
    from: trade.from_player_id,
    to: trade.to_player_id,
  };
}

function serverLoadouts(loadouts) {
  const normalized = {};
  for (let slot = 1; slot <= 5; slot += 1) {
    const loadout = loadouts.find((entry) => entry.slot === slot);
    const unitIds = loadout?.unit_ids || [];
    normalized[slot] = [unitIds[0] || null, unitIds[1] || null, unitIds[2] || null];
  }
  return normalized;
}

export function createHttpApi({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  baseUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_BASE_URL : DEFAULT_BASE_URL,
} = {}) {
  if (!fetchImpl) throw new Error('fetch implementation is required');
  const apiBase = trimBaseUrl(baseUrl);
  let lastGameData = null;
  let activeBattle = null;

  const request = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await fetchImpl(`${apiBase}${path}`, {
      ...options,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) clearAccessToken();
      const detail = payload?.error || {};
      throw new ApiError(detail.message || `Request failed (${response.status})`, {
        status: response.status,
        code: detail.code,
        fields: detail.fields,
        requestId: detail.request_id || response.headers.get('X-Request-ID') || '',
      });
    }
    return payload;
  };

  const api = {
    isAuthenticated() {
      return Boolean(getAccessToken());
    },

    logout() {
      clearAccessToken();
      activeBattle = null;
      lastGameData = null;
    },

    async login(username, password) {
      const response = await request('/auth/login', { method: 'POST', body: { username, password } });
      const token = response?.access_token;
      const claims = jwtPayload(token || '');
      if (!token || !claims?.player_id) throw new ApiError('登入回應缺少有效憑證');
      setAccessToken(token);
      try {
        const player = await request(`/players/${claims.player_id}`);
        return userFromPlayer(player.player);
      } catch (error) {
        clearAccessToken();
        throw error;
      }
    },

    async register(username, password) {
      await request('/auth/register', { method: 'POST', body: { username, password } });
      return api.login(username, password);
    },

    async getGameData(playerId) {
      const [playerResult, unitsResult, treasuresResult, loadoutsResult, dungeonsResult, solvedResult, tradesResult] = await Promise.all([
        request(`/players/${playerId}`),
        request(`/players/${playerId}/units`),
        request(`/players/${playerId}/treasures`),
        request(`/players/${playerId}/loadouts`),
        request('/dungeons'),
        request(`/players/${playerId}/dungeons`),
        request('/trades'),
      ]);
      const pets = unitsResult.units.map(petFromUnit);
      const items = treasuresResult.treasures.map(itemFromTreasure);
      const loadouts = serverLoadouts(loadoutsResult.loadouts);
      const activeLoadoutSlot = playerResult.player.active_loadout_slot || 1;
      saveStoredLoadouts(loadouts);
      setActiveLoadoutIndex(activeLoadoutSlot);
      lastGameData = {
        activePlayerId: playerId,
        player: playerResult.player,
        user: userFromPlayer(playerResult.player),
        pets,
        items,
        allPets: pets,
        allItems: items,
        loadouts,
        activeLoadoutSlot,
        dungeons: dungeonsResult.dungeons.map(dungeonFromApi),
        solvedDungeonIds: solvedResult.dungeons.map((dungeon) => dungeon.id),
        trades: tradesResult.trades.map((trade) => tradeFromApi(trade, pets, items)),
        lostAssets: [],
      };
      return lastGameData;
    },

    async saveLoadout(slot, unitIds, playerId) {
      await request(`/players/${playerId}/loadouts/${slot}`, {
        method: 'PUT', body: { unit_ids: unitIds.filter(Boolean) },
      });
    },

    async setActiveLoadout(slot, playerId) {
      await request(`/players/${playerId}/loadouts/active`, { method: 'PUT', body: { slot } });
    },

    async togglePartyMember(petId, playerId) {
      const data = lastGameData || await api.getGameData(playerId);
      const activeSlot = data.activeLoadoutSlot || 1;
      const next = [...(data.loadouts[activeSlot] || [])].filter(Boolean);
      const index = next.indexOf(petId);
      if (index >= 0) next.splice(index, 1);
      else if (next.length < 3) next.push(petId);
      else throw new ApiError('出戰隊伍最多 3 隻');
      await api.saveLoadout(activeSlot, next, playerId);
      return api.getGameData(playerId);
    },

    async equipItem(petId, itemId, playerId) {
      const data = lastGameData || await api.getGameData(playerId);
      const pet = data.pets.find((entry) => entry.id === petId);
      if (!pet) throw new ApiError('找不到此 NOXCAT');
      if (pet.equipped === itemId) {
        await request(`/treasures/${itemId}/equip`, { method: 'DELETE' });
      } else {
        await request(`/treasures/${itemId}/equip`, { method: 'POST', body: { unit_id: petId } });
      }
      return api.getGameData(playerId);
    },

    async getTrades(status) {
      const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
      const response = await request(`/trades${suffix}`);
      const data = lastGameData || { pets: [], items: [] };
      return response.trades.map((trade) => tradeFromApi(trade, data.pets, data.items));
    },

    async getTradeAssets(playerIdentifier) {
      const response = await request(`/players/${encodeURIComponent(playerIdentifier)}/trade-assets`);
      return {
        playerId: response.player?.id || playerIdentifier,
        username: response.player?.username || '',
        pets: response.units.map(petFromUnit),
        items: response.treasures.map(itemFromTreasure),
      };
    },

    async createTrade({
      playerId,
      to_player_id: toPlayerId,
      unit_id: unitId,
      treasure_id: treasureId,
      request_unit_id: requestUnitId,
      request_treasure_id: requestTreasureId,
      request_asset_type: requestAssetType,
      request: requestedLabel,
      request_qty: requestQuantity,
      requested_assets: exactRequestedAssets,
    }) {
      let requestedAssets = exactRequestedAssets;
      if (!requestedAssets && requestUnitId) requestedAssets = [{ unit_id: requestUnitId }];
      if (!requestedAssets && requestTreasureId) requestedAssets = [{ treasure_id: requestTreasureId }];
      if (!requestedAssets && (requestAssetType || requestedLabel || requestQuantity)) {
        throw new ApiError('雙向交換必須選擇對方實際擁有的資產', { code: 'exact_trade_asset_required' });
      }
      await request('/trades', {
        method: 'POST',
        body: {
          to_player_id: toPlayerId,
          ...(unitId ? { unit_id: unitId } : { treasure_id: treasureId }),
          requested_assets: requestedAssets || [],
        },
      });
      return api.getGameData(playerId);
    },

    async resolveTrade(tradeId, status, playerId) {
      const action = status === 'accepted' ? 'accept' : status === 'cancelled' ? 'cancel' : 'reject';
      await request(`/trades/${tradeId}/${action}`, { method: 'POST' });
      return api.getGameData(playerId);
    },

    async startBattle(dungeonId) {
      activeBattle = await request('/battles/start', { method: 'POST', body: { dungeon_id: dungeonId } });
      return activeBattle;
    },

    async cancelBattle() {
      if (!activeBattle?.battle_seed) return;
      const battleSeed = activeBattle.battle_seed;
      activeBattle = null;
      await request('/battles/cancel', { method: 'POST', body: { battle_seed: battleSeed } });
    },

    async recordBattleResult(result, dungeonId, playerId) {
      if (!activeBattle?.battle_seed) throw new ApiError('找不到有效的戰鬥工作階段');
      const states = new Map((result.unitStates || []).map((state) => [state.id, state]));
      const unitSnapshot = activeBattle.units.map((unit) => {
        const state = states.get(unit.id);
        let health = Math.max(0, Math.min(unit.current_stats.hp, Math.round(state?.hp ?? unit.current_stats.hp)));
        let isAlive = Boolean(state?.alive ?? true) && health > 0;
        if (unit.is_permanent && !isAlive) {
          isAlive = true;
          health = 1;
        }
        return {
          id: unit.id,
          owner_id: unit.owner_id,
          species: unit.species,
          base_stats: unit.base_stats,
          current_stats: { ...unit.current_stats, hp: health },
          equipped_treasure_id: unit.equipped_treasure_id,
          is_permanent: unit.is_permanent,
          is_alive: isAlive,
          is_equipped: unit.is_equipped,
        };
      });
      const battleSeed = activeBattle.battle_seed;
      activeBattle = null;
      await request('/battles/result', {
        method: 'POST',
        body: {
          battle_seed: battleSeed,
          unit_snapshot: unitSnapshot,
          action_log: [],
          claimed_outcome: result.winner === 'PLAYER' ? 'won' : 'lost',
        },
      });
      return api.getGameData(playerId);
    },

    rollDungeonLoot() {
      return null;
    },

    async addPet() {
      throw new ApiError('正式後端不提供測試用召喚功能');
    },

    async addItem() {
      throw new ApiError('正式後端不提供測試用鍛造功能');
    },
  };

  return api;
}

export const httpApi = createHttpApi();
