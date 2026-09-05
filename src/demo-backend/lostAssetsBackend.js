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

  /**
   * Rolls a random reward from the dungeon loot table when an enemy peg is defeated.
   *
   * Default Loot Table:
   * - 1% new FUTURE NOXCAT
   * - 1% new COOL NOXCAT
   * - 1% new HARD NOXCAT
   * - 5% new 像素劍
   * - 5% new 資料盾
   * - 5% new 回家石
   * - 82% "claim losts"
   *
   * When rolling "claim losts":
   * - Success chance is x / (x + 100), where x is the number of pegs/items lost to this dungeon.
   * - If fail (or x === 0): randomly get 1~10 gold.
   * - If success: take a random peg/item out of the pool, AND roll an extra "claim losts" (looping).
   */
  rollDungeonLoot(db, { dungeonId, playerId, playerCallsign } = {}) {
    const dungeon = (db.dungeons || []).find((d) => d.id === dungeonId) || db.dungeons?.[0];
    const lootTable = dungeon?.lootTable || [
      { id: 'loot_futurecat', type: 'pet', code: '02', name: 'FUTURE NOXCAT', weight: 1 },
      { id: 'loot_coolcat', type: 'pet', code: '03', name: 'COOL NOXCAT', weight: 1 },
      { id: 'loot_hardcat', type: 'pet', code: '04', name: 'HARD NOXCAT', weight: 1 },
      { id: 'loot_sword', type: 'item', itemType: 'WEAPON', name: '像素劍', weight: 5 },
      { id: 'loot_shield', type: 'item', itemType: 'GEAR', name: '資料盾', weight: 5 },
      { id: 'loot_homestone', type: 'item', itemType: 'TREASURE', name: '回家石', weight: 5 },
      { id: 'loot_claim_losts', type: 'claim_losts', name: 'claim losts', weight: 82 },
    ];

    const totalWeight = lootTable.reduce((sum, item) => sum + (item.weight || 0), 0);
    let rand = Math.random() * totalWeight;
    let picked = lootTable[0];
    for (const entry of lootTable) {
      if (rand < entry.weight) {
        picked = entry;
        break;
      }
      rand -= entry.weight;
    }

    const rollResult = {
      pickedType: picked.type,
      pickedName: picked.name,
      gainedPets: [],
      gainedItems: [],
      goldGained: 0,
      claimedAssets: [],
      logMessages: [],
    };

    const pCallsign = (playerCallsign || playerId || 'PILOT').toUpperCase();

    if (picked.type === 'pet') {
      const isFuture = picked.name?.includes('FUTURE');
      const isCool = picked.name?.includes('COOL');
      const newPet = {
        id: `nox-loot-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        idString: `peg_noxcat_loot_${Date.now()}`,
        code: picked.code || (isFuture ? '02' : isCool ? '03' : '04'),
        name: picked.name,
        className: isFuture ? 'TECH' : isCool ? 'RUSH' : 'TANK',
        level: isFuture ? 10 : isCool ? 11 : 8,
        hp: isFuture ? 80 : isCool ? 100 : 130,
        atk: isFuture ? 12 : isCool ? 8 : 10,
        def: isFuture ? 1 : isCool ? 2 : 3,
        spd: isFuture ? 100 : isCool ? 120 : 80,
        protected: false,
        selected: false,
        accent: '#00ff66',
        quote: isFuture ? 'Tomorrow already happened.' : isCool ? 'No rush. I am the rush.' : 'Try moving me.',
        skill: isFuture
          ? '時空修復：主動回合每次撞擊隊友為該隊友 +5 HP。'
          : isCool
          ? '疾風推進：碰撞時強力擊退對手。'
          : '堅毅立場：被敵人撞擊時，使攻擊者額外減速一次。',
        equipped: null,
        ownerId: playerId || null,
      };
      rollResult.gainedPets.push(newPet);
      rollResult.logMessages.push(`🎁 敵方掉落稀有夥伴：${picked.name}！`);
    } else if (picked.type === 'item') {
      const isBlade = picked.name?.includes('劍') || picked.itemType === 'WEAPON';
      const isShield = picked.name?.includes('盾') || picked.itemType === 'GEAR';
      const newItem = {
        id: `item-loot-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        idString: isBlade ? `wpn_blade_loot_${Date.now()}` : isShield ? `gear_shield_loot_${Date.now()}` : `item_stone_loot_${Date.now()}`,
        name: picked.name,
        type: picked.itemType || (isBlade ? 'WEAPON' : isShield ? 'GEAR' : 'TREASURE'),
        bonus: isBlade ? 'ATK +3' : isShield ? 'DEF +3' : 'HP +5 · 防止一次掉落',
        rarity: isBlade || isShield ? 'RARE' : 'EPIC',
        hpBonus: isBlade || isShield ? 0 : 5,
        atkBonus: isBlade ? 3 : 0,
        defBonus: isShield ? 3 : 0,
        spdBonus: 0,
        quote: isBlade ? '鋒銳如初。' : isShield ? '堅不可摧。' : '溫暖的避風港。',
        skill: isBlade ? '鋒刃加成：提升基礎攻擊力。' : isShield ? '資料壁壘：提升基礎防禦力。' : '空間折躍：HP 歸零防止掉落直接回家。',
        ownerId: playerId || null,
      };
      rollResult.gainedItems.push(newItem);
      rollResult.logMessages.push(`⚔️ 敵方掉落稀有裝備：${picked.name}！`);
    } else if (picked.type === 'claim_losts') {
      // Loop claim losts while success rolls continue
      while (true) {
        db.lostAssets ||= [];
        const pool = db.lostAssets.filter(
          (a) => a.status === 'in_pool' && (a.dungeonId === dungeonId || !dungeonId)
        );
        const x = pool.length;

        if (x <= 0) {
          // No lost items in pool, fallback to 1~10 gold
          const gold = Math.floor(Math.random() * 10) + 1;
          rollResult.goldGained += gold;
          break;
        }

        const successChance = x / (x + 100);
        const roll = Math.random();

        if (roll < successChance) {
          // Success! Pick a random item/peg out of the pool
          const randomIndex = Math.floor(Math.random() * pool.length);
          const asset = pool[randomIndex];
          asset.status = 'claimed';
          asset.claimedByPlayerId = playerId || 'PILOT';
          asset.claimedBy = pCallsign;
          asset.claimedAt = new Date().toISOString();

          rollResult.claimedAssets.push(asset);

          if (asset.type === 'pet') {
            const rescuedPet = {
              ...(asset.petSnapshot || {}),
              id: asset.petSnapshot?.id || `nox-rescued-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              name: asset.name,
              code: asset.code || '02',
              level: asset.petSnapshot?.level || 10,
              hp: asset.petSnapshot?.hp || 100,
              atk: asset.petSnapshot?.atk || 10,
              def: asset.petSnapshot?.def || 2,
              spd: asset.petSnapshot?.spd || 100,
              accent: '#35d9ff',
              selected: false,
              equipped: null,
              ownerId: playerId || null,
            };
            rollResult.gainedPets.push(rescuedPet);
            rollResult.logMessages.push(
              `🎉 成功打撈走失夥伴：${asset.name}！（機率 ${(successChance * 100).toFixed(1)}%）觸發連續抽取！`
            );
          } else {
            const isBlade = asset.name?.includes('劍') || asset.iconType === 'blade' || asset.type === 'weapon';
            const isShield = asset.name?.includes('盾') || asset.iconType === 'shield' || asset.type === 'gear';
            const rescuedItem = {
              ...(asset.itemSnapshot || {}),
              id: asset.itemSnapshot?.id || `item-rescued-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              name: asset.name,
              type: asset.itemSnapshot?.type || (isBlade ? 'WEAPON' : isShield ? 'GEAR' : 'TREASURE'),
              bonus: asset.itemSnapshot?.bonus || asset.bonus || (isBlade ? 'ATK +2' : 'DEF +1'),
              rarity: asset.itemSnapshot?.rarity || 'RARE',
              atkBonus: asset.itemSnapshot?.atkBonus ?? (isBlade ? 2 : 0),
              defBonus: asset.itemSnapshot?.defBonus ?? (isShield ? 1 : 0),
              hpBonus: asset.itemSnapshot?.hpBonus ?? 0,
              spdBonus: asset.itemSnapshot?.spdBonus ?? 0,
              ownerId: playerId || null,
            };
            rollResult.gainedItems.push(rescuedItem);
            rollResult.logMessages.push(
              `🎉 成功打撈走失裝備：${asset.name}！（機率 ${(successChance * 100).toFixed(1)}%）觸發連續抽取！`
            );
          }
          // Loop repeats: gets an extra "claim losts" roll!
        } else {
          // Failed attempt: get 1~10 gold and break
          const gold = Math.floor(Math.random() * 10) + 1;
          rollResult.goldGained += gold;
          break;
        }
      }
    }

    return rollResult;
  },
};
