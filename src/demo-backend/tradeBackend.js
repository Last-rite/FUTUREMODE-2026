// src/demo-backend/tradeBackend.js
// Mock backend implementation for Trading System
// Adheres strictly to architecture.md and api.md contracts.

/**
 * Simulates row-level lock & atomic unit transfer.
 * Architecture ref: TransferUnit(unitID, fromPlayerID, toPlayerID string) error
 */
export function TransferUnit(db, unitId, fromPlayerId, toPlayerId) {
  const pet = (db.pets || []).find((p) => p.id === unitId || p.idString === unitId);
  if (!pet) {
    const err = new Error('unit_not_found');
    err.status = 404;
    err.code = 'unit_not_found';
    throw err;
  }

  if (pet.ownerId && pet.ownerId !== fromPlayerId) {
    const err = new Error('asset_not_owned');
    err.status = 403;
    err.code = 'asset_not_owned';
    throw err;
  }

  // Unequip item if attached before transferring
  pet.equipped = null;
  pet.selected = false;
  pet.ownerId = toPlayerId;
  return pet;
}

/**
 * Simulates row-level lock & atomic treasure/gear transfer.
 * Architecture ref: TransferTreasure(treasureID, fromPlayerID, toPlayerID string) error
 */
export function TransferTreasure(db, treasureId, fromPlayerId, toPlayerId) {
  const item = (db.items || []).find((i) => i.id === treasureId || i.idString === treasureId);
  if (!item) {
    const err = new Error('treasure_not_found');
    err.status = 404;
    err.code = 'treasure_not_found';
    throw err;
  }

  if (item.ownerId && item.ownerId !== fromPlayerId) {
    const err = new Error('asset_not_owned');
    err.status = 403;
    err.code = 'asset_not_owned';
    throw err;
  }

  // Ensure item is not equipped on any pet of the sender
  (db.pets || []).forEach((p) => {
    if (p.ownerId === fromPlayerId && p.equipped === item.id) {
      p.equipped = null;
    }
  });

  item.ownerId = toPlayerId;
  return item;
}

/**
 * Mock Trade Service implementing api.md endpoints:
 * - GET /trades?status=pending
 * - POST /trades
 * - POST /trades/:id/accept
 * - POST /trades/:id/reject
 * - POST /trades/:id/cancel
 */
export const tradeBackend = {
  /**
   * GET /trades?status=pending
   * Lists trades involving the authenticated player.
   */
  getTrades(db, { playerId, status } = {}) {
    let list = db.trades || [];
    if (playerId) {
      const cleanId = String(playerId).trim().toLowerCase();
      list = list.filter((t) => {
        const fromMatch = String(t.from_player_id || t.from || '').trim().toLowerCase() === cleanId;
        const toMatch = String(t.to_player_id || t.to || '').trim().toLowerCase() === cleanId;
        return fromMatch || toMatch;
      });
    }

    if (status && status !== 'all') {
      list = list.filter((t) => t.status === status);
    }

    return list;
  },

  /**
   * POST /trades
   * Creates a new trade proposal.
   * Enforces rules from api.md:
   * - Exactly one of unit_id and treasure_id is present
   * - to_player_id is not empty and differs from caller
   * - Asset is owned by caller and not equipped
   */
  createTrade(db, {
    fromPlayerId,
    toPlayerId,
    unitId,
    treasureId,
    requestUnitId,
    requestTreasureId,
    requestAssetType,
    request,
    requestQty,
  }) {
    const callerId = (fromPlayerId || 'player').trim();
    const targetId = (toPlayerId || '').trim();

    if (!targetId) {
      const err = new Error('交易資料不完整：缺少收件玩家');
      err.status = 400;
      err.code = 'invalid_request';
      throw err;
    }

    if (callerId.toLowerCase() === targetId.toLowerCase()) {
      const err = new Error('無法與自己發起交易');
      err.status = 400;
      err.code = 'invalid_request';
      throw err;
    }

    const hasUnit = Boolean(unitId);
    const hasTreasure = Boolean(treasureId);
    if ((hasUnit && hasTreasure) || (!hasUnit && !hasTreasure)) {
      const err = new Error('交易資料不完整：必須且僅能提供一項資產 (unit 或 treasure)');
      err.status = 400;
      err.code = 'invalid_request';
      throw err;
    }

    // Resolve pet or item
    const pet = hasUnit
      ? (db.pets || []).find((p) => p.id === unitId || p.idString === unitId)
      : null;
    const item = hasTreasure
      ? (db.items || []).find((i) => i.id === treasureId || i.idString === treasureId)
      : null;

    if (hasUnit && !pet) {
      const err = new Error('找不到指定的 NOXCAT');
      err.status = 404;
      err.code = 'unit_not_found';
      throw err;
    }

    if (hasTreasure && !item) {
      const err = new Error('找不到指定的裝備道具');
      err.status = 404;
      err.code = 'treasure_not_found';
      throw err;
    }

    // Check ownership
    if (pet && pet.ownerId && pet.ownerId !== callerId) {
      const err = new Error('非本人資產，無法發起交易');
      err.status = 403;
      err.code = 'asset_not_owned';
      throw err;
    }

    if (item && item.ownerId && item.ownerId !== callerId) {
      const err = new Error('非本人資產，無法發起交易');
      err.status = 403;
      err.code = 'asset_not_owned';
      throw err;
    }

    // Check if treasure is currently equipped
    if (item) {
      const isEquipped = (db.pets || []).some(
        (p) => p.ownerId === callerId && p.equipped === item.id
      );
      if (isEquipped) {
        const err = new Error('已佩戴的裝備道具無法交易，請先卸下');
        err.status = 409;
        err.code = 'already_equipped';
        throw err;
      }
    }

    // Check if asset is already committed to another pending trade
    const alreadyInPendingTrade = (db.trades || []).some(
      (t) =>
        t.status === 'pending' &&
        ((pet && (t.unit_id === pet.id || t.offeredPetId === pet.id)) ||
          (item && (t.treasure_id === item.id || t.offeredItemId === item.id)))
    );
    if (alreadyInPendingTrade) {
      const err = new Error('此資產已有進行中的交易掛單');
      err.status = 409;
      err.code = 'trade_asset_unavailable';
      throw err;
    }

    // Resolve requested asset (以物易物對方出資)
    let reqName = (request || '').trim();
    let reqPetCode = null;
    let reqAssetType = requestAssetType || 'treasure';
    let reqQty = Number(requestQty) || 1;

    if (requestUnitId) {
      const reqPet = (db.pets || []).find((p) => p.id === requestUnitId || p.idString === requestUnitId);
      if (reqPet) {
        reqName = reqPet.name;
        reqPetCode = reqPet.code;
        reqAssetType = 'unit';
      }
    } else if (requestTreasureId) {
      const reqTreasure = (db.items || []).find((i) => i.id === requestTreasureId || i.idString === requestTreasureId);
      if (reqTreasure) {
        reqName = reqTreasure.name;
        reqAssetType = 'treasure';
      }
    }

    if (!reqName) {
      reqName = '回家石';
    }

    const equippedItem = pet?.equipped
      ? (db.items || []).find((i) => i.id === pet.equipped)
      : null;

    const newTrade = {
      id: `trade-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      from_player_id: callerId,
      to_player_id: targetId,
      unit_id: pet?.id || null,
      treasure_id: item?.id || null,
      request_unit_id: requestUnitId || null,
      request_treasure_id: requestTreasureId || null,
      request_asset_type: reqAssetType,
      // Barter display & legacy fields
      from: callerId.toUpperCase(),
      to: targetId,
      assetType: pet ? 'unit' : 'treasure',
      offeredPetId: pet?.id || null,
      offeredItemId: item?.id || null,
      offer: pet?.name || item?.name,
      offerPetCode: pet?.code || null,
      offerWeapon: pet ? (equippedItem?.name || '未裝備') : item?.name,
      request: reqName,
      requestPetCode: reqPetCode,
      requestQty: reqQty,
      status: 'pending',
      time: '剛剛',
      created_at: new Date().toISOString(),
    };

    db.trades ||= [];
    db.trades.unshift(newTrade);
    return newTrade;
  },

  /**
   * POST /trades/:id/accept
   * Atomically executes two-way barter asset transfer.
   */
  acceptTrade(db, { tradeId, callerPlayerId }) {
    const trade = (db.trades || []).find((t) => t.id === tradeId);
    if (!trade) {
      const err = new Error('找不到指定的交易紀錄');
      err.status = 404;
      err.code = 'trade_not_found';
      throw err;
    }

    if (trade.status !== 'pending') {
      const err = new Error('此交易已結算或已關閉');
      err.status = 409;
      err.code = 'trade_not_pending';
      throw err;
    }

    const activeCaller = (callerPlayerId || '').trim().toLowerCase();
    const recipient = String(trade.to_player_id || trade.to || '').trim().toLowerCase();

    // Verify recipient authorization if caller is specified and trade has specific target
    if (activeCaller && recipient && activeCaller !== recipient && recipient !== 'public market') {
      const err = new Error('僅有指定接收者才能接受此交易');
      err.status = 403;
      err.code = 'invalid_trade_recipient';
      throw err;
    }

    const targetOwner = callerPlayerId || trade.to_player_id || trade.to;
    const fromOwner = trade.from_player_id || trade.from;

    // 1. Atomic asset transfer: Initiator -> Target
    if (trade.unit_id || trade.offeredPetId) {
      TransferUnit(db, trade.unit_id || trade.offeredPetId, fromOwner, targetOwner);
    } else if (trade.treasure_id || trade.offeredItemId) {
      TransferTreasure(db, trade.treasure_id || trade.offeredItemId, fromOwner, targetOwner);
    }

    // 2. Atomic asset transfer: Target -> Initiator (True Barter Exchange!)
    if (trade.request_unit_id) {
      TransferUnit(db, trade.request_unit_id, targetOwner, fromOwner);
    } else if (trade.request_treasure_id) {
      TransferTreasure(db, trade.request_treasure_id, targetOwner, fromOwner);
    } else if (trade.request) {
      const targetPet = (db.pets || []).find(
        (p) => p.ownerId === targetOwner && (p.name === trade.request || p.code === trade.requestPetCode)
      );
      const targetItem = (db.items || []).find(
        (i) => i.ownerId === targetOwner && i.name === trade.request
      );

      if (targetPet && (trade.request_asset_type === 'unit' || trade.requestPetCode)) {
        TransferUnit(db, targetPet.id, targetOwner, fromOwner);
      } else if (targetItem) {
        TransferTreasure(db, targetItem.id, targetOwner, fromOwner);
      } else {
        const anyTargetItem = (db.items || []).find(
          (i) =>
            i.ownerId === targetOwner &&
            !((db.pets || []).some((p) => p.ownerId === targetOwner && p.equipped === i.id))
        );
        if (anyTargetItem) {
          TransferTreasure(db, anyTargetItem.id, targetOwner, fromOwner);
        } else {
          // If target has no items in db (e.g. mock user/dummy), grant the requested item to initiator
          const grantedItem = {
            id: `item-${fromOwner}-${Date.now()}`,
            idString: `barter_reward_${Date.now()}`,
            name: trade.request,
            type: 'TREASURE',
            bonus: '以物易物交換所得',
            ownerId: fromOwner,
          };
          db.items ||= [];
          db.items.push(grantedItem);
        }
      }
    }

    trade.status = 'accepted';
    trade.settled_at = new Date().toISOString();
    return trade;
  },

  /**
   * POST /trades/:id/reject
   * Rejects the trade proposal.
   */
  rejectTrade(db, { tradeId, callerPlayerId }) {
    const trade = (db.trades || []).find((t) => t.id === tradeId);
    if (!trade) {
      const err = new Error('找不到指定的交易紀錄');
      err.status = 404;
      err.code = 'trade_not_found';
      throw err;
    }

    if (trade.status !== 'pending') {
      const err = new Error('此交易已結算或已關閉');
      err.status = 409;
      err.code = 'trade_not_pending';
      throw err;
    }

    const activeCaller = (callerPlayerId || '').trim().toLowerCase();
    const recipient = String(trade.to_player_id || trade.to || '').trim().toLowerCase();

    if (activeCaller && recipient && activeCaller !== recipient && recipient !== 'public market') {
      const err = new Error('僅有指定接收者才能拒絕此交易');
      err.status = 403;
      err.code = 'invalid_trade_recipient';
      throw err;
    }

    trade.status = 'rejected';
    trade.settled_at = new Date().toISOString();
    return trade;
  },

  /**
   * POST /trades/:id/cancel
   * Cancels a pending trade proposal by its creator.
   */
  cancelTrade(db, { tradeId, callerPlayerId }) {
    const trade = (db.trades || []).find((t) => t.id === tradeId);
    if (!trade) {
      const err = new Error('找不到指定的交易紀錄');
      err.status = 404;
      err.code = 'trade_not_found';
      throw err;
    }

    if (trade.status !== 'pending') {
      const err = new Error('此交易已非待確認狀態');
      err.status = 409;
      err.code = 'trade_not_pending';
      throw err;
    }

    const activeCaller = (callerPlayerId || '').trim().toLowerCase();
    const creator = String(trade.from_player_id || trade.from || '').trim().toLowerCase();

    if (activeCaller && creator && activeCaller !== creator) {
      const err = new Error('僅有發起者本人能撤回交易');
      err.status = 403;
      err.code = 'forbidden';
      throw err;
    }

    trade.status = 'rejected';
    trade.settled_at = new Date().toISOString();
    return trade;
  },
};
