// src/demo-backend/lostAssetsBackend.js
// Mock backend implementation for Lost & Found (走失與地牢戰利品池) System
// Adheres strictly to architecture.md and README.md specifications.

/**
 * Mock Lost Assets Service implementing the Dungeon Lost & Found pool:
 * 1. When a player falls in battle without protection (like 回家石),
 *    the lost NOXCAT or equipment is retained in the dungeon's shared loot pool (status: 'in_pool').
 * 2. When any player defeats this dungeon (winner === 'PLAYER'),
 *    they have the opportunity to rescue and claim the lost asset into their own collection (status: 'claimed').
 */
export const lostAssetsBackend = {
  /**
   * List lost assets.
   * Can be filtered by dungeonId or status ('in_pool' | 'claimed').
   */
  getLostAssets(db, { dungeonId, status } = {}) {
    let list = db.lostAssets || [];
    if (dungeonId) {
      list = list.filter((a) => a.dungeonId === dungeonId);
    }
    if (status && status !== 'all') {
      list = list.filter((a) => a.status === status);
    }
    return list;
  },

  /**
   * Drops dead pegs or items into the dungeon's shared lost assets pool.
   * Invoked during battle settlement when player suffers non-permanent losses.
   */
  dropLostAssets(db, { dungeonId, dungeonName, playerId, playerCallsign, lostPegs = [], lostEquipments = [] }) {
    db.lostAssets ||= [];
    const createdDrops = [];
    const pCallsign = (playerCallsign || playerId || 'PILOT').toUpperCase();

    // 1. Process lost pets
    lostPegs.forEach((peg) => {
      // Look up original pet in collection if available
      const originalPet = (db.pets || []).find(
        (p) => p.id === peg.petId || p.idString === peg.petId || p.name === peg.label
      );

      const lostRecord = {
        id: `lost-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        type: 'pet',
        name: peg.label || originalPet?.name || 'NOXCAT',
        code: peg.code || originalPet?.code || '02',
        status: 'in_pool',
        dungeonId: dungeonId || 'dungeon-zero',
        location: dungeonName || '深層資料井',
        lostByPlayerId: playerId,
        lostBy: pCallsign,
        lostAt: '剛剛',
        created_at: new Date().toISOString(),
        petSnapshot: originalPet
          ? {
              ...originalPet,
              id: `nox-rescued-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              selected: false,
              equipped: null,
              ownerId: null,
            }
          : {
              id: `nox-rescued-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              name: peg.label || 'NOXCAT',
              code: peg.code || '02',
              level: 10,
              hp: 100,
              atk: 10,
              def: 2,
              spd: 100,
              protected: false,
              selected: false,
              accent: '#35d9ff',
              quote: '從地牢深處被成功救援。',
              skill: '時空記憶：在地牢歷劫重生的 NOXCAT。',
              equipped: null,
              ownerId: null,
            },
      };

      db.lostAssets.unshift(lostRecord);
      createdDrops.push(lostRecord);
    });

    // 2. Process lost equipments
    lostEquipments.forEach((eq) => {
      const originalItem = (db.items || []).find(
        (i) => i.id === eq.itemId || i.idString === eq.itemId || i.name === eq.label
      );

      const isBlade = eq.label?.includes('劍') || originalItem?.type === 'WEAPON';
      const isShield = eq.label?.includes('盾') || originalItem?.type === 'GEAR';

      const lostRecord = {
        id: `lost-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        type: isBlade ? 'weapon' : isShield ? 'gear' : 'treasure',
        name: eq.label || originalItem?.name || '遺失裝備',
        bonus: originalItem?.bonus || (isBlade ? '+15 ATK' : '+10 DEF'),
        iconType: isBlade ? 'blade' : isShield ? 'shield' : 'gem',
        status: 'in_pool',
        dungeonId: dungeonId || 'dungeon-zero',
        location: dungeonName || '深層資料井',
        lostByPlayerId: playerId,
        lostBy: pCallsign,
        lostAt: '剛剛',
        created_at: new Date().toISOString(),
        itemSnapshot: originalItem
          ? {
              ...originalItem,
              id: `item-rescued-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              ownerId: null,
            }
          : {
              id: `item-rescued-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              name: eq.label || '遺失裝備',
              type: isBlade ? 'WEAPON' : isShield ? 'GEAR' : 'TREASURE',
              bonus: isBlade ? 'ATK +2' : 'DEF +1',
              rarity: 'RARE',
              atkBonus: isBlade ? 2 : 0,
              defBonus: isShield ? 1 : 0,
              hpBonus: 0,
              spdBonus: 0,
              quote: '從地牢戰利品池中尋回的神兵利器。',
              skill: '遺物甦醒：裝備屬性加成。',
              ownerId: null,
            },
      };

      db.lostAssets.unshift(lostRecord);
      createdDrops.push(lostRecord);
    });

    return createdDrops;
  },

  /**
   * Rescues / claims a lost asset from the dungeon pool upon player victory.
   * Invoked when a player defeats a dungeon stage (winner === 'PLAYER').
   * Transfers the rescued asset into the conquering player's inventory!
   */
  claimDungeonLostAsset(db, { dungeonId, winnerPlayerId, winnerCallsign }) {
    if (!winnerPlayerId || !db.lostAssets) return null;

    // Find first available asset in this dungeon pool
    let candidate = db.lostAssets.find(
      (a) => a.status === 'in_pool' && (a.dungeonId === dungeonId || !dungeonId)
    );

    // If none in specific dungeon, pick any in_pool asset from global pool
    if (!candidate) {
      candidate = db.lostAssets.find((a) => a.status === 'in_pool');
    }

    if (!candidate) return null;

    // Mark asset as claimed
    candidate.status = 'claimed';
    candidate.claimedByPlayerId = winnerPlayerId;
    candidate.claimedBy = (winnerCallsign || winnerPlayerId).toUpperCase();
    candidate.claimedAt = new Date().toISOString();

    // Atomically transfer asset into conquering player's collection
    if (candidate.type === 'pet') {
      const newPet = {
        ...(candidate.petSnapshot || {}),
        id: candidate.petSnapshot?.id || `nox-rescued-${Date.now()}`,
        ownerId: winnerPlayerId,
        selected: false,
        equipped: null,
      };
      db.pets ||= [];
      db.pets.push(newPet);
      return { asset: candidate, pet: newPet };
    } else {
      const newItem = {
        ...(candidate.itemSnapshot || {}),
        id: candidate.itemSnapshot?.id || `item-rescued-${Date.now()}`,
        ownerId: winnerPlayerId,
      };
      db.items ||= [];
      db.items.push(newItem);
      return { asset: candidate, item: newItem };
    }
  },
};
