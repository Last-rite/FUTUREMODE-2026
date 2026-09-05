import { describe, it, expect, beforeEach } from 'vitest';
import { demoApi } from '../../src/demo-backend/api.js';
import { tradeBackend } from '../../src/demo-backend/tradeBackend.js';
import { lostAssetsBackend } from '../../src/demo-backend/lostAssetsBackend.js';

describe('Trade and Lost Assets Mock Backend', () => {
  beforeEach(async () => {
    localStorage.clear();
    await demoApi.reset('test-user');
  });

  describe('Trading System Mock Backend (tradeBackend)', () => {
    it('creates trade listing and enforces single-asset rule', async () => {
      const userA = await demoApi.register('trader_1', 'demo1234', '交易者A');
      const userB = await demoApi.register('trader_2', 'demo1234', '交易者B');
      const dataA = await demoApi.getGameData(userA.id);

      // Successfully create trade with a unit
      const pet = dataA.pets[0];
      const nextData = await demoApi.createTrade({
        playerId: userA.id,
        to_player_id: userB.id,
        unit_id: pet.id,
      });

      const trade = nextData.trades[0];
      expect(trade.from_player_id).toBe(userA.id);
      expect(trade.to_player_id).toBe(userB.id);
      expect(trade.status).toBe('pending');
      expect(trade.unit_id).toBe(pet.id);
    });

    it('rejects self-trade with clear error', async () => {
      const userA = await demoApi.register('trader_self', 'demo1234', '自己');
      const dataA = await demoApi.getGameData(userA.id);
      const pet = dataA.pets[0];

      await expect(
        demoApi.createTrade({
          playerId: userA.id,
          to_player_id: userA.id,
          unit_id: pet.id,
        })
      ).rejects.toThrow('無法與自己發起交易');
    });

    it('rejects trade with both unit and treasure or neither', async () => {
      const userA = await demoApi.register('trader_both', 'demo1234', '雙重');
      const dataA = await demoApi.getGameData(userA.id);

      await expect(
        demoApi.createTrade({
          playerId: userA.id,
          to_player_id: 'target',
          unit_id: dataA.pets[0].id,
          treasure_id: dataA.items[0].id,
        })
      ).rejects.toThrow('必須且僅能提供一項資產');

      await expect(
        demoApi.createTrade({
          playerId: userA.id,
          to_player_id: 'target',
        })
      ).rejects.toThrow('必須且僅能提供一項資產');
    });

    it('rejects trade of an already equipped treasure', async () => {
      const userA = await demoApi.register('trader_equipped', 'demo1234', '已裝備');
      const dataA = await demoApi.getGameData(userA.id);
      const equippedItem = dataA.items.find((i) => dataA.pets.some((p) => p.equipped === i.id));

      if (equippedItem) {
        await expect(
          demoApi.createTrade({
            playerId: userA.id,
            to_player_id: 'someone_else',
            treasure_id: equippedItem.id,
          })
        ).rejects.toThrow('已佩戴的裝備道具無法交易');
      }
    });

    it('accepts trade and atomically transfers asset to recipient', async () => {
      const seller = await demoApi.register('seller_alpha', 'demo1234', '賣家阿發');
      const buyer = await demoApi.register('buyer_beta', 'demo1234', '買家貝塔');
      const sellerData = await demoApi.getGameData(seller.id);
      const pet = sellerData.pets[0];

      await demoApi.createTrade({
        playerId: seller.id,
        to_player_id: buyer.id,
        unit_id: pet.id,
      });

      const tradeList = await demoApi.getTrades('pending', seller.id);
      const pendingTrade = tradeList[0];

      // Buyer accepts trade
      await demoApi.acceptTrade(pendingTrade.id, buyer.id);

      // Check buyer's inventory
      const buyerData = await demoApi.getGameData(buyer.id);
      expect(buyerData.pets.some((p) => p.id === pet.id)).toBe(true);

      // Check seller's inventory no longer contains the pet
      const updatedSellerData = await demoApi.getGameData(seller.id);
      expect(updatedSellerData.pets.some((p) => p.id === pet.id)).toBe(false);
    });

    it('executes two-way barter exchange: atomically swapping assets between players', async () => {
      const traderA = await demoApi.register('trader_barter_a', 'demo1234', '易物者A');
      const traderB = await demoApi.register('trader_barter_b', 'demo1234', '易物者B');
      const dataA = await demoApi.getGameData(traderA.id);
      const dataB = await demoApi.getGameData(traderB.id);

      const petA = dataA.pets[0];
      const itemB = dataB.items.find((i) => i.name === '回家石');

      // A offers petA, requests B's itemB (回家石)
      await demoApi.createTrade({
        playerId: traderA.id,
        to_player_id: traderB.id,
        unit_id: petA.id,
        request_treasure_id: itemB.id,
        request: itemB.name,
      });

      const tradeList = await demoApi.getTrades('pending', traderA.id);
      const pendingTrade = tradeList[0];

      // B accepts the trade proposal
      await demoApi.acceptTrade(pendingTrade.id, traderB.id);

      // Verify B received petA and lost itemB
      const nextDataB = await demoApi.getGameData(traderB.id);
      expect(nextDataB.pets.some((p) => p.id === petA.id)).toBe(true);
      expect(nextDataB.items.some((i) => i.id === itemB.id)).toBe(false);

      // Verify A lost petA and received itemB (Not a gift! Both sides exchanged!)
      const nextDataA = await demoApi.getGameData(traderA.id);
      expect(nextDataA.pets.some((p) => p.id === petA.id)).toBe(false);
      expect(nextDataA.items.some((i) => i.id === itemB.id)).toBe(true);
    });

    it('rejects trade without changing asset ownership', async () => {
      const userA = await demoApi.register('user_rej_a', 'demo1234', '發起者');
      const userB = await demoApi.register('user_rej_b', 'demo1234', '拒絕者');
      const dataA = await demoApi.getGameData(userA.id);
      const pet = dataA.pets[0];

      await demoApi.createTrade({
        playerId: userA.id,
        to_player_id: userB.id,
        unit_id: pet.id,
      });

      const trade = (await demoApi.getTrades('pending', userA.id))[0];
      await demoApi.rejectTrade(trade.id, userB.id);

      // Still owned by User A
      const dataAAfter = await demoApi.getGameData(userA.id);
      expect(dataAAfter.pets.some((p) => p.id === pet.id)).toBe(true);
    });

    it('allows trade creator to cancel a pending trade', async () => {
      const userA = await demoApi.register('user_can_a', 'demo1234', '撤回者');
      const dataA = await demoApi.getGameData(userA.id);
      const pet = dataA.pets[0];

      await demoApi.createTrade({
        playerId: userA.id,
        to_player_id: 'random_player',
        unit_id: pet.id,
      });

      const trade = (await demoApi.getTrades('pending', userA.id))[0];
      await demoApi.cancelTrade(trade.id, userA.id);

      const trades = await demoApi.getTrades('all', userA.id);
      expect(trades.find((t) => t.id === trade.id).status).toBe('rejected');
    });
  });

  describe('Lost Assets & Dungeon Pool Mock Backend (lostAssetsBackend)', () => {
    it('records lost assets in the dungeon pool during battle loss', async () => {
      const user = await demoApi.register('fighter_loss', 'demo1234', '探險者');
      const userData = await demoApi.getGameData(user.id);
      const petToLose = userData.pets[1]; // non-protected

      const battleResult = {
        winner: 'AI',
        goldEarned: 0,
        lostPegIds: [petToLose.id],
        lostItemIds: [],
      };

      await demoApi.recordBattleResult(battleResult, 'dungeon-zero', user.id);

      // Verify pet is removed from user collection
      const afterData = await demoApi.getGameData(user.id);
      expect(afterData.pets.some((p) => p.id === petToLose.id)).toBe(false);

      // Verify pet appears in lost assets pool
      const lostList = await demoApi.getLostAssets('dungeon-zero', 'in_pool');
      expect(lostList.some((a) => a.name === petToLose.name && a.status === 'in_pool')).toBe(true);
    });

    it('rescues and transfers dungeon lost asset upon player victory', async () => {
      // 1. User A loses an asset in dungeon-ash
      const userA = await demoApi.register('loser_a', 'demo1234', '戰敗者');
      const userB = await demoApi.register('rescuer_b', 'demo1234', '拯救者');
      const dataA = await demoApi.getGameData(userA.id);
      const lostPet = dataA.pets[1];

      await demoApi.recordBattleResult(
        {
          winner: 'AI',
          lostPegIds: [lostPet.id],
          lostItemIds: [],
        },
        'dungeon-ash',
        userA.id
      );

      // 2. User B beats dungeon-ash and rescues the lost asset!
      const victoryDataB = await demoApi.recordBattleResult(
        {
          winner: 'PLAYER',
          goldEarned: 50,
          lostPegIds: [],
          lostItemIds: [],
        },
        'dungeon-ash',
        userB.id
      );

      // User B should receive the rescued pet in their collection!
      expect(victoryDataB.pets.some((p) => p.name === lostPet.name)).toBe(true);
      expect(victoryDataB.lastBattle.rescuedAsset).not.toBeNull();
      expect(victoryDataB.lastBattle.rescuedAsset.asset.status).toBe('claimed');
      expect(victoryDataB.lastBattle.rescuedAsset.asset.claimedByPlayerId).toBe(userB.id);
    });
  });
});
