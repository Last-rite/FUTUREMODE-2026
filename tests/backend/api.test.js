import { describe, it, expect, beforeEach } from 'vitest';
import { demoApi } from '../../src/demo-backend/api.js';

describe('demoApi Mock Backend Business Logic', () => {
  beforeEach(async () => {
    localStorage.clear();
    await demoApi.reset();
  });

  describe('Authentication & Registration', () => {
    it('registers a new user and grants starter 6 NOXCATs and 3 equipments', async () => {
      const user = await demoApi.register('testuser', 'demo1234', '測試喵喵');
      expect(user.username).toBe('testuser');
      expect(user.displayName).toBe('測試喵喵');

      const data = await demoApi.getGameData(user.id);
      expect(data.pets.length).toBe(6);
      expect(data.items.length).toBe(3);
      // 3 pets should be pre-selected for party
      const selected = data.pets.filter((p) => p.selected);
      expect(selected.length).toBe(3);
    });

    it('rejects registration with duplicate username', async () => {
      await demoApi.register('dupe', 'demo1234', '一號');
      await expect(demoApi.register('dupe', 'demo1234', '二號')).rejects.toThrow('此帳號已存在');
    });

    it('rejects registration with invalid display name (only Han/letters/numbers allowed)', async () => {
      await expect(demoApi.register('invalid_name', 'demo1234', '@@@$$%')).rejects.toThrow(
        '玩家暱稱僅限中文、英文字母或數字'
      );
    });

    it('logs in successfully with valid credentials and fails on wrong password', async () => {
      await demoApi.register('validuser', 'mypassword', '玩家一號');

      const loggedIn = await demoApi.login('validuser', 'mypassword');
      expect(loggedIn.username).toBe('validuser');

      await expect(demoApi.login('validuser', 'wrongpass')).rejects.toThrow('本帳號不存在或密碼不正確');
      await expect(demoApi.login('nonexistent', 'mypassword')).rejects.toThrow('本帳號不存在或密碼不正確');
    });
  });

  describe('Party & Equipment Management', () => {
    it('toggles party members and enforces max 3 members limit', async () => {
      const user = await demoApi.register('partyleader', 'demo1234', '隊長');
      const data = await demoApi.getGameData(user.id);
      const selectedPets = data.pets.filter((p) => p.selected);
      const unselectedPets = data.pets.filter((p) => !p.selected);

      // Unselect one pet -> now 2 selected
      let nextData = await demoApi.togglePartyMember(selectedPets[0].id, user.id);
      expect(nextData.pets.filter((p) => p.selected).length).toBe(2);

      // Select an unselected pet -> now 3 selected
      nextData = await demoApi.togglePartyMember(unselectedPets[0].id, user.id);
      expect(nextData.pets.filter((p) => p.selected).length).toBe(3);

      // Try selecting a 4th pet -> should throw error
      await expect(demoApi.togglePartyMember(unselectedPets[1].id, user.id)).rejects.toThrow('出戰隊伍最多 3 隻');
    });

    it('equips item to pet, and automatically un-equips when equipped to another pet', async () => {
      const user = await demoApi.register('gearuser', 'demo1234', '配裝者');
      const data = await demoApi.getGameData(user.id);
      const item = data.items[0];
      const pet1 = data.pets[0];
      const pet2 = data.pets[1];

      // Equip item to pet1
      let nextData = await demoApi.equipItem(pet1.id, item.id, user.id);
      let updatedPet1 = nextData.pets.find((p) => p.id === pet1.id);
      expect(updatedPet1.equipped).toBe(item.id);

      // Equip same item to pet2 -> pet1 should lose it
      nextData = await demoApi.equipItem(pet2.id, item.id, user.id);
      updatedPet1 = nextData.pets.find((p) => p.id === pet1.id);
      let updatedPet2 = nextData.pets.find((p) => p.id === pet2.id);
      expect(updatedPet1.equipped).toBeNull();
      expect(updatedPet2.equipped).toBe(item.id);

      // Toggle item again -> un-equips
      nextData = await demoApi.equipItem(pet2.id, item.id, user.id);
      updatedPet2 = nextData.pets.find((p) => p.id === pet2.id);
      expect(updatedPet2.equipped).toBeNull();
    });

    it('adds pet and item through simulation', async () => {
      const user = await demoApi.register('collector', 'demo1234', '收藏家');
      let data = await demoApi.addPet({ name: '自訂機甲貓', atk: 15 }, user.id);
      expect(data.pets.some((p) => p.name === '自訂機甲貓')).toBe(true);

      data = await demoApi.addItem({ name: '重裝泰坦盾', defBonus: 5 }, user.id);
      expect(data.items.some((i) => i.name === '重裝泰坦盾')).toBe(true);
    });
  });

  describe('Trading System', () => {
    it('creates trade listing and validates parameters', async () => {
      const user = await demoApi.register('trader_a', 'demo1234', '商人A');
      const data = await demoApi.getGameData(user.id);
      const petToTrade = data.pets[0];

      const nextData = await demoApi.createTrade({
        playerId: user.id,
        to_player_id: 'trader_b',
        unit_id: petToTrade.id,
      });

      const trade = nextData.trades[0];
      expect(trade.to).toBe('trader_b');
      expect(trade.offeredPetId).toBe(petToTrade.id);
      expect(trade.status).toBe('pending');
    });

    it('throws error when creating invalid trade (missing recipient or asset)', async () => {
      await expect(
        demoApi.createTrade({
          playerId: 'user1',
          to_player_id: '',
          unit_id: 'some-unit',
        })
      ).rejects.toThrow('交易資料不完整');
    });

    it('resolves trade: transferring asset ownership when accepted', async () => {
      const userA = await demoApi.register('seller', 'demo1234', '賣家');
      const userB = await demoApi.register('buyer', 'demo1234', '買家');
      const dataA = await demoApi.getGameData(userA.id);
      const pet = dataA.pets[0];

      await demoApi.createTrade({
        playerId: userA.id,
        to_player_id: userB.id,
        unit_id: pet.id,
      });

      const dbData = await demoApi.getGameData(userA.id);
      const trade = dbData.trades[0];

      // Buyer accepts the trade
      const finalDataB = await demoApi.resolveTrade(trade.id, 'accepted', userB.id);
      expect(finalDataB.trades.find((t) => t.id === trade.id).status).toBe('accepted');

      // The pet should now be in Buyer's roster
      expect(finalDataB.pets.some((p) => p.id === pet.id)).toBe(true);
    });
  });

  describe('Battle Result Recording', () => {
    it('records player victory and unlocks dungeon progress', async () => {
      const user = await demoApi.register('fighter', 'demo1234', '勇士');
      const result = { winner: 'PLAYER', rounds: 3, hitCount: 15 };

      const gameData = await demoApi.recordBattleResult(result, 'dungeon-zero', user.id);
      expect(gameData.lastBattle.winner).toBe('PLAYER');
      expect(gameData.solvedDungeonIds).toContain('dungeon-zero');
    });
  });
});
