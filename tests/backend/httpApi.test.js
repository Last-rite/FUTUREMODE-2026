import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpApi } from '../../src/api/httpApi.js';
import { clearAccessToken, setAccessToken } from '../../src/api/session.js';

const playerId = '11111111-1111-4111-8111-111111111111';
const unitId = '22222222-2222-4222-8222-222222222222';
const dungeonId = '33333333-3333-4333-8333-333333333333';
const treasureId = '44444444-4444-4444-8444-444444444444';
const otherPlayerId = '55555555-5555-4555-8555-555555555555';

function tokenFor(id = playerId) {
  const encode = (value) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ player_id: id, sub: id })}.signature`;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'request-1' },
  });
}

const player = {
  id: playerId,
  username: 'pilot_one',
  role: 'player',
  money: 125,
  status: 'idle',
  is_banned: false,
  active_loadout_slot: 2,
};

const unit = {
  id: unitId,
  owner_id: playerId,
  species: 'fire',
  base_stats: { atk: 5, hp: 20, def: 3, spd: 4 },
  current_stats: { atk: 7, hp: 25, def: 3, spd: 4 },
  equipped_treasure_id: '44444444-4444-4444-8444-444444444444',
  is_permanent: true,
  is_alive: true,
  is_equipped: true,
};

function bootstrapResponse(url) {
  if (url.endsWith(`/players/${playerId}`)) return jsonResponse({ player });
  if (url.endsWith(`/players/${playerId}/units`)) return jsonResponse({ units: [unit] });
  if (url.endsWith(`/players/${playerId}/treasures`)) return jsonResponse({ treasures: [{
    id: unit.equipped_treasure_id,
    owner_id: playerId,
    code: 'home-stone',
    name: '回家石',
    treasure_type: 'utility',
    rarity: 'epic',
    damage_bonus: 2,
    health_bonus: 5,
    defense_bonus: 0,
    speed_bonus: 0,
    effect_code: 'home_stone',
    charges: 1,
    equipped_by_unit_id: unitId,
  }] });
  if (url.endsWith(`/players/${playerId}/loadouts`)) return jsonResponse({ loadouts: [
    { slot: 1, unit_ids: [] },
    { slot: 2, unit_ids: [unitId] },
    { slot: 3, unit_ids: [] },
    { slot: 4, unit_ids: [] },
    { slot: 5, unit_ids: [] },
  ] });
  if (url.endsWith(`/players/${playerId}/dungeons`)) return jsonResponse({ dungeons: [{ id: dungeonId }] });
  if (url.endsWith('/dungeons')) return jsonResponse({ dungeons: [{
    id: dungeonId,
    name: '零號資料井',
    enemy_config: { chapter: '01', difficulty: 'NORMAL' },
    reward_money: 25,
    reward_drops: [],
  }] });
  if (url.endsWith('/trades')) return jsonResponse({ trades: [] });
  throw new Error(`unexpected request: ${url}`);
}

describe('httpApi adapter', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearAccessToken();
  });

  it('logs in, keeps the bearer token out of URLs, and maps the player for the existing UI', async () => {
    const fetchImpl = vi.fn(async (url, options) => {
      if (url === '/auth/login') {
        expect(options.headers.get('Authorization')).toBeNull();
        return jsonResponse({ access_token: tokenFor(), token_type: 'Bearer', expires_in: 86400 });
      }
      expect(url).toBe(`/players/${playerId}`);
      expect(options.headers.get('Authorization')).toBe(`Bearer ${tokenFor()}`);
      return jsonResponse({ player });
    });
    const api = createHttpApi({ fetchImpl, baseUrl: '' });

    const user = await api.login('pilot_one', 'password123');

    expect(user).toMatchObject({ id: playerId, gameId: 'PILOT_ONE', nox: 125, isDemo: false });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/auth/login', `/players/${playerId}`]);
    expect(sessionStorage.getItem('futuremode_access_token')).toBe(tokenFor());
  });

  it('bootstraps the seven server resources and hydrates five loadouts', async () => {
    setAccessToken(tokenFor());
    const fetchImpl = vi.fn(async (url, options) => {
      expect(options.headers.get('Authorization')).toBe(`Bearer ${tokenFor()}`);
      return bootstrapResponse(url);
    });
    const api = createHttpApi({ fetchImpl, baseUrl: '' });

    const data = await api.getGameData(playerId);

    expect(fetchImpl).toHaveBeenCalledTimes(7);
    expect(data.user).toMatchObject({ id: playerId, nox: 125 });
    expect(data.pets[0]).toMatchObject({ id: unitId, className: 'TECH', atk: 5, hp: 20, equipped: unit.equipped_treasure_id });
    expect(data.items[0]).toMatchObject({ name: '回家石', hpBonus: 5, atkBonus: 2, effectCode: 'home_stone' });
    expect(data.loadouts[2]).toEqual([unitId, null, null]);
    expect(data.solvedDungeonIds).toEqual([dungeonId]);
    expect(localStorage.getItem('futuremode_active_loadout_index')).toBe('2');
  });

  it('uses the battle-start snapshot when submitting bounded settlement data', async () => {
    setAccessToken(tokenFor());
    let submitted;
    const fetchImpl = vi.fn(async (url, options) => {
      if (url.endsWith('/battles/start')) {
        return jsonResponse({ battle_seed: 'server-seed', dungeon: { id: dungeonId }, units: [unit] });
      }
      if (url.endsWith('/battles/result')) {
        submitted = JSON.parse(options.body);
        return new Response(null, { status: 204 });
      }
      return bootstrapResponse(url);
    });
    const api = createHttpApi({ fetchImpl, baseUrl: '/api' });

    await api.startBattle(dungeonId);
    await api.recordBattleResult({
      winner: 'AI',
      goldEarned: 99999,
      unitStates: [{ id: unitId, hp: 0, alive: false }],
    }, dungeonId, playerId);

    expect(submitted.battle_seed).toBe('server-seed');
    expect(submitted.claimed_outcome).toBe('lost');
    expect(submitted.action_log).toEqual([]);
    expect(submitted).not.toHaveProperty('goldEarned');
    expect(submitted.unit_snapshot[0]).toMatchObject({
      id: unitId,
      owner_id: playerId,
      is_permanent: true,
      is_alive: true,
      current_stats: { atk: 7, hp: 1, def: 3, spd: 4 },
    });
  });

  it('fails closed when a legacy barter names assets without exact IDs', async () => {
    setAccessToken(tokenFor());
    const fetchImpl = vi.fn();
    const api = createHttpApi({ fetchImpl, baseUrl: '' });

    await expect(api.createTrade({
      playerId,
    to_player_id: otherPlayerId,
      unit_id: unitId,
      request_asset_type: 'treasure',
      request: '回家石',
      request_qty: 1,
  })).rejects.toMatchObject({ code: 'exact_trade_asset_required' });
  expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('loads exact counterparty assets and submits a bidirectional trade', async () => {
  setAccessToken(tokenFor());
  let submitted;
  const requestedTreasure = {
    id: treasureId,
    owner_id: otherPlayerId,
    code: 'pixel-blade',
    name: '像素劍',
    treasure_type: 'weapon',
    rarity: 'rare',
    damage_bonus: 2,
    health_bonus: 0,
    defense_bonus: 0,
    speed_bonus: 0,
    effect_code: null,
    charges: null,
    equipped_by_unit_id: null,
  };
  const fetchImpl = vi.fn(async (url, options) => {
    if (url === `/players/${otherPlayerId}/trade-assets`) {
      return jsonResponse({ player: { id: otherPlayerId, username: 'test2' }, units: [], treasures: [requestedTreasure] });
    }
    if (url === '/trades' && options.method === 'POST') {
      submitted = JSON.parse(options.body);
      return jsonResponse({ trade: { id: 'trade-1' } }, 201);
    }
    return bootstrapResponse(url);
  });
  const api = createHttpApi({ fetchImpl, baseUrl: '' });

  const inventory = await api.getTradeAssets(otherPlayerId);
  expect(inventory).toMatchObject({ playerId: otherPlayerId, username: 'test2' });
  expect(inventory.items[0]).toMatchObject({ id: treasureId, name: '像素劍', atkBonus: 2 });
  await api.createTrade({
    playerId,
    to_player_id: otherPlayerId,
    unit_id: unitId,
    requested_assets: [{ treasure_id: treasureId }],
  });
  expect(submitted).toEqual({
    to_player_id: otherPlayerId,
    unit_id: unitId,
    requested_assets: [{ treasure_id: treasureId }],
  });
  expect(fetchImpl.mock.calls.every(([, options]) => options.headers.get('Authorization') === `Bearer ${tokenFor()}`)).toBe(true);
  });

  it('uses the dedicated cancel transition for sender withdrawal', async () => {
  setAccessToken(tokenFor());
  const fetchImpl = vi.fn(async (url, options) => {
    if (url === '/trades/trade-1/cancel') {
      expect(options.method).toBe('POST');
      return jsonResponse({ trade: { id: 'trade-1', status: 'cancelled' } });
    }
    return bootstrapResponse(url);
  });
  const api = createHttpApi({ fetchImpl, baseUrl: '' });

  await api.resolveTrade('trade-1', 'cancelled', playerId);
  expect(fetchImpl.mock.calls[0][0]).toBe('/trades/trade-1/cancel');
  });
});
