import React, { useState } from 'react';
import { ArrowLeftRight, Cat, Check, ChevronDown, Gem, Plus, Send, UserRound, Waves, X } from 'lucide-react';
import NoxPlaceholder from './NoxPlaceholder.jsx';
import BrandLockup from './BrandLockup.jsx';
import swordImg from '../assets/sword_128.png';
import shieldImg from '../assets/shield_128.png';
import gemImg from '../assets/noxgem_128.png';

// Stylized Tombstone Cross icon matching sketch †
function TombstoneIcon({ size = 20, className = '' }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 1.15)}
      viewBox="0 0 24 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2v24M5 9h14" />
    </svg>
  );
}

/**
 * Helper: Resolve correct pixel sprite image and label for any item
 */
export function getItemMeta(itemName = '', itemType = '') {
  const name = String(itemName || '').toLowerCase();
  const type = String(itemType || '').toUpperCase();

  const isWeapon =
    type === 'WEAPON' ||
    name.includes('劍') ||
    name.includes('blade') ||
    name.includes('sword');

  const isShield =
    type === 'GEAR' ||
    name.includes('盾') ||
    name.includes('shield');

  if (isWeapon) {
    return {
      src: swordImg,
      alt: itemName || '武器',
      label: '武器',
      bonus: 'ATK +2',
    };
  }

  if (isShield) {
    return {
      src: shieldImg,
      alt: itemName || '防具',
      label: '防具',
      bonus: 'DEF +1',
    };
  }

  // Gem, Stone, Relic, Consumables
  return {
    src: gemImg,
    alt: itemName || '遺物',
    label: '道具',
    bonus: 'HP +5',
  };
}

/**
 * Check if the trade offer is a Pet or an Item
 */
function isPetTrade(trade) {
  if (trade.assetType === 'unit') return true;
  if (trade.assetType === 'treasure') return false;
  if (trade.offeredPetId) return true;
  if (trade.offeredItemId) return false;
  if (trade.offerPetCode) return true;
  if (trade.offer && (trade.offer.includes('NOXCAT') || trade.offer.includes('CAT'))) {
    return true;
  }
  return false;
}

export default function TradeView({ data, currentUser, onCreateTrade, onResolveTrade, onMessage }) {
  const [tab, setTab] = useState('market'); // 'market' | 'lost'
  const [showCreate, setShowCreate] = useState(false);
  const transferableUnits = (data.pets || []).filter((pet) => !pet.protected);
  const equippedItemIds = new Set((data.pets || []).map((pet) => pet.equipped).filter(Boolean));
  const transferableTreasures = (data.items || []).filter((item) => !equippedItemIds.has(item.id));
  const [form, setForm] = useState({
    toPlayerId: '',
    // Offer (我方出資)
    offerType: 'unit',
    offerId: transferableUnits[0]?.id || '',
    // Request (以物易物對方出資)
    requestType: 'treasure',
    requestName: '回家石',
    requestQty: 2,
  });
  const [submitting, setSubmitting] = useState(false);
  const transferableAssets = form.offerType === 'unit' ? transferableUnits : transferableTreasures;
  const canSubmit = Boolean(form.toPlayerId.trim() && form.offerId && form.requestName.trim() && !submitting);

  const selectOfferType = (offerType) => {
    const assets = offerType === 'unit' ? transferableUnits : transferableTreasures;
    setForm((current) => ({ ...current, offerType, offerId: assets[0]?.id || '' }));
  };

  const selectRequestType = (requestType) => {
    setForm((current) => ({
      ...current,
      requestType,
      requestName: requestType === 'unit' ? 'FUTURE NOXCAT' : '回家石',
    }));
  };

  const submitTrade = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onCreateTrade({
        to_player_id: form.toPlayerId.trim(),
        ...(form.offerType === 'unit'
          ? { unit_id: form.offerId }
          : { treasure_id: form.offerId }),
        request_asset_type: form.requestType,
        request: form.requestName.trim(),
        request_qty: Number(form.requestQty) || 1,
      });
      setShowCreate(false);
      onMessage('以物易物請求已送出');
    } catch (err) {
      onMessage(err?.message || '發起交易失敗', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="screen-scroll feature-screen sketch-trade">
      {/* 1. Header: Clean Brand Lockup */}
      <header className="sketch-screen-topbar">
        <BrandLockup compact />
      </header>

      {/* 2. Minimalist Angled Tabs: Active has angled trapezoid border, Inactive has NO border */}
      <nav className="sketch-trade-tabs-strip" role="tablist" aria-label="交易與走失列表切換">
        <button
          className={`sketch-trade-tab-btn ${tab === 'market' ? 'is-active' : 'is-inactive'}`}
          onClick={() => setTab('market')}
          role="tab"
          aria-selected={tab === 'market'}
          aria-label="交易所"
          title="交易所 (<=>)"
        >
          <div className="sketch-tab-inner">
            <ArrowLeftRight size={20} strokeWidth={2.4} />
            <span>交易所</span>
          </div>
        </button>

        <button
          className={`sketch-trade-tab-btn ${tab === 'lost' ? 'is-active' : 'is-inactive'}`}
          onClick={() => setTab('lost')}
          role="tab"
          aria-selected={tab === 'lost'}
          aria-label="走失名錄"
          title="走失名錄 (†)"
        >
          <div className="sketch-tab-inner">
            <TombstoneIcon size={20} />
            <span>走失名錄</span>
          </div>
        </button>
      </nav>

      {/* 3. Tab Content */}
      {tab === 'market' ? (
        /* MARKET VIEW: Clean, Minimalist 3-Part Exchange Row */
        <section className="sketch-trade-list-container" aria-label="交易請求列表">
          <div className="sketch-trade-rows">
            {(data.trades || []).map((trade) => {
              const isPetOffer = isPetTrade(trade);
              const isPetRequest = Boolean(
                trade.request_asset_type === 'unit' ||
                trade.requestPetCode ||
                (trade.request && (trade.request.includes('NOXCAT') || trade.request.includes('CAT')))
              );

              // Offered asset metadata
              const matchedOfferItem = !isPetOffer
                ? (data.allItems || data.items || []).find((i) => i.id === trade.offeredItemId || i.name === trade.offer)
                : null;
              const offerItemMeta = !isPetOffer ? getItemMeta(trade.offer, matchedOfferItem?.type) : null;

              // Check if pet carries an equipped weapon
              const hasEquippedWeapon = Boolean(
                isPetOffer && trade.offerWeapon && trade.offerWeapon !== '未裝備' && trade.offerWeapon !== '未攜帶'
              );
              const weaponMeta = hasEquippedWeapon ? getItemMeta(trade.offerWeapon) : null;

              // Requested asset metadata (for barter trades)
              const reqItemMeta = !isPetRequest ? getItemMeta(trade.request) : null;

              // Roles and counterparty
              const myId = String(currentUser?.id || '').trim().toLowerCase();
              const fromId = String(trade.from_player_id || trade.from || '').trim().toLowerCase();
              const toId = String(trade.to_player_id || trade.to || '').trim().toLowerCase();
              const isMyOffer = Boolean(myId && fromId === myId);
              const isForMe = Boolean(myId && toId === myId);
              const counterpartyName = isMyOffer ? (trade.to_player_id || trade.to) : (trade.from_player_id || trade.from);

              return (
                <article className={`sketch-trade-card is-${trade.status}`} key={trade.id}>
                  {/* Left: Counterparty Avatar Disc (shows checkmark for accepted, cross for rejected) */}
                  <div
                    className="sketch-trade-actor-col"
                    title={`以物易物對象: #${counterpartyName} · 狀態: ${trade.status}`}
                  >
                    <div className={`sketch-trade-status-disc is-${trade.status}`}>
                      {trade.status === 'accepted' ? (
                        <Check size={22} strokeWidth={3} />
                      ) : trade.status === 'rejected' || trade.status === 'cancelled' ? (
                        <X size={22} strokeWidth={3} />
                      ) : (
                        <UserRound size={21} strokeWidth={2.4} />
                      )}
                    </div>
                  </div>

                  {/* Middle Left: Offered Asset (Pet OR Item) */}
                  <div className="sketch-trade-offer-group">
                    <div className="sketch-trade-offer-visuals">
                      {isPetOffer ? (
                        <>
                          <div className="sketch-trade-pet-avatar">
                            <NoxPlaceholder
                              pet={{
                                code: trade.offerPetCode || '01',
                                name: trade.offer,
                                accent: '#00ff66',
                              }}
                              size="sm"
                            />
                          </div>
                          {hasEquippedWeapon && (
                            <div className="sketch-trade-weapon-badge" title={`已佩戴: ${trade.offerWeapon}`}>
                              <img
                                src={weaponMeta.src}
                                alt={trade.offerWeapon}
                                className="w-5 h-5 object-contain pixelated"
                              />
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="sketch-trade-item-disc" title={trade.offer}>
                          <img
                            src={offerItemMeta.src}
                            alt={trade.offer}
                            className="w-7 h-7 object-contain pixelated"
                          />
                        </div>
                      )}
                    </div>
                    <div className="sketch-trade-label-group">
                      <span className="sketch-trade-asset-txt" title={trade.offer}>
                        {trade.offer}
                      </span>
                      <small className="sketch-trade-sub-txt">
                        {isPetOffer
                          ? hasEquippedWeapon
                            ? trade.offerWeapon
                            : '無裝備'
                          : matchedOfferItem?.bonus || offerItemMeta?.bonus || offerItemMeta?.label}
                      </small>
                    </div>
                  </div>

                  {/* Center: Exchange Arrow <=> */}
                  <div className="sketch-trade-arrow-col" title="以物易物">
                    <ArrowLeftRight size={22} strokeWidth={2.6} className="sketch-trade-arrow-icon" />
                  </div>

                  {/* Middle Right: Requested Asset (Pet OR Item x Quantity) */}
                  <div className="sketch-trade-req-group">
                    <div className="sketch-trade-req-visuals">
                      {isPetRequest ? (
                        <div className="sketch-trade-pet-avatar">
                          <NoxPlaceholder
                            pet={{
                              code: trade.requestPetCode || '02',
                              name: trade.request,
                              accent: '#35d9ff',
                            }}
                            size="sm"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="sketch-trade-item-disc" title={trade.request}>
                            <img
                              src={reqItemMeta.src}
                              alt={trade.request}
                              className="w-6 h-6 object-contain pixelated"
                            />
                          </div>
                          <span className="sketch-trade-qty-pill">×{trade.requestQty || 1}</span>
                        </>
                      )}
                    </div>
                    <div className="sketch-trade-label-group">
                      <span className="sketch-trade-asset-txt" title={trade.request}>
                        {trade.request}
                      </span>
                      <small className="sketch-trade-sub-txt">
                        {isPetRequest ? '索求夥伴' : `換取 x${trade.requestQty || 1}`}
                      </small>
                    </div>
                  </div>

                  {/* Pending Action Buttons */}
                  {trade.status === 'pending' && (
                    <footer className="sketch-trade-card__actions">
                      {isForMe ? (
                        <>
                          <button
                            className="sketch-trade-btn sketch-trade-btn--reject"
                            onClick={() => onResolveTrade(trade.id, 'rejected')}
                            aria-label="拒絕交易"
                          >
                            <X size={14} /> 拒絕
                          </button>
                          <button
                            className="sketch-trade-btn sketch-trade-btn--accept"
                            onClick={() => onResolveTrade(trade.id, 'accepted')}
                            aria-label="接受以物易物"
                          >
                            <Check size={14} /> 接受交換
                          </button>
                        </>
                      ) : isMyOffer ? (
                        <button
                          className="sketch-trade-btn sketch-trade-btn--reject w-full"
                          onClick={() => onResolveTrade(trade.id, 'cancelled')}
                          aria-label="撤回交易"
                        >
                          <X size={14} /> 撤回請求
                        </button>
                      ) : (
                        <div className="text-center w-full py-1 text-[10px] text-[#7da087] font-mono">
                          等待 #{trade.to} 確認中…
                        </div>
                      )}
                    </footer>
                  )}
                </article>
              );
            })}
          </div>

          <button
            className="sketch-trade-create-btn"
            onClick={() => setShowCreate(true)}
            aria-label="發起交易"
          >
            <Plus size={20} strokeWidth={2.4} />
            <span>發起交易</span>
          </button>
        </section>
      ) : (
        /* MOURN / LOST VIEW: 2-Column Grid matching mourn_example.jpg */
        <section className="sketch-mourn-grid" aria-label="走失資產名錄">
          {(data.lostAssets || []).map((asset) => {
            const isPet = asset.type === 'pet' || (!asset.type && asset.code);
            const itemMeta = !isPet ? getItemMeta(asset.name, asset.type) : null;
            const petObj = {
              code: asset.code || '07',
              name: asset.name,
              accent: asset.status === 'claimed' ? '#35d9ff' : '#ff2a55',
            };

            return (
              <article className={`sketch-mourn-card is-${asset.status}`} key={asset.id}>
                {/* Top Trio: [ Asset (Pet/Item) ]  [ † Tombstone ]  [ User / Pool Disc ] */}
                <div className="sketch-mourn-trio">
                  {/* Left: Lost asset */}
                  <div className="sketch-mourn-disc sketch-mourn-disc--asset">
                    {isPet ? (
                      <NoxPlaceholder pet={petObj} size="sm" muted />
                    ) : (
                      <div className="sketch-mourn-weapon-icon" title={asset.name}>
                        <img
                          src={itemMeta.src}
                          alt={asset.name}
                          className="w-8 h-8 object-contain pixelated drop-shadow-[0_0_8px_rgba(0,255,102,0.3)]"
                        />
                      </div>
                    )}
                  </div>

                  {/* Middle: Tombstone Cross † */}
                  <div className="sketch-mourn-tombstone" title="走失/陣亡">
                    <TombstoneIcon size={20} />
                  </div>

                  {/* Right: Where it is (Player or Pool) */}
                  <div
                    className={`sketch-mourn-disc sketch-mourn-disc--dest is-${asset.status}`}
                    title={asset.status === 'claimed' ? `被玩家拾獲: #${asset.claimedBy}` : `滯留於: ${asset.location}`}
                  >
                    {asset.status === 'claimed' ? (
                      <UserRound size={22} />
                    ) : (
                      <Waves size={22} />
                    )}
                  </div>
                </div>

                {/* Bottom Details */}
                <div className="sketch-mourn-info">
                  <h4 className="sketch-mourn-title" title={asset.name}>
                    {asset.name}
                  </h4>
                  <p className="sketch-mourn-dest-label">
                    {asset.status === 'claimed' ? `拾獲: #${asset.claimedBy}` : `池中: ${asset.location}`}
                  </p>
                  <small className="sketch-mourn-time">{asset.lostAt}</small>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* Create Trade Modal Sheet */}
      {showCreate && (
        <div className="sheet-backdrop" onClick={() => setShowCreate(false)}>
          <form
            className="detail-sheet create-trade-sheet sketch-create-trade"
            aria-label="發起以物易物交易"
            onClick={(event) => event.stopPropagation()}
            onSubmit={submitTrade}
          >
            <header className="trade-form-header">
              <div>
                <h2>以物易物</h2>
                <small className="text-[#7da087] font-mono text-[11px] block mt-1">
                  雙方確認後自動互換資產
                </small>
              </div>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setShowCreate(false)}
                aria-label="關閉"
              >
                <X size={18} />
              </button>
            </header>

            {/* Target Player */}
            <label>
              <span>指定對象玩家 ID</span>
              <div className="callsign-input">
                <UserRound size={17} />
                <input
                  value={form.toPlayerId}
                  onChange={(event) =>
                    setForm({ ...form, toPlayerId: event.target.value.trimStart() })
                  }
                  autoComplete="off"
                  placeholder="輸入對方玩家 ID，如 CYBER_PUP"
                  required
                />
              </div>
            </label>

            {/* Section 1: Offer Asset (我方出資) */}
            <div className="border border-[#28362d] rounded-xl p-3 mb-3 bg-[#050906]">
              <span className="text-[#00ff66] font-mono text-[11px] font-bold block mb-2">
                ① 我方提供物品 (YOU OFFER)
              </span>
              <fieldset className="trade-asset-type !mb-2">
                <button
                  type="button"
                  className={form.offerType === 'unit' ? 'is-active' : ''}
                  onClick={() => selectOfferType('unit')}
                  aria-pressed={form.offerType === 'unit'}
                >
                  <Cat size={17} /> NOXCAT
                </button>
                <button
                  type="button"
                  className={form.offerType === 'treasure' ? 'is-active' : ''}
                  onClick={() => selectOfferType('treasure')}
                  aria-pressed={form.offerType === 'treasure'}
                >
                  <Gem size={17} /> 道具裝備
                </button>
              </fieldset>

              <label className="!mb-0">
                <div className="select-wrap">
                  <select
                    value={form.offerId}
                    onChange={(event) => setForm({ ...form, offerId: event.target.value })}
                    disabled={transferableAssets.length === 0}
                  >
                    {transferableAssets.length === 0 && <option value="">沒有可交易資產</option>}
                    {transferableAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}{form.offerType === 'unit' ? ` · LV.${asset.level}` : ` · ${asset.bonus}`}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} />
                </div>
              </label>
            </div>

            {/* Section 2: Requested Asset (對方出資 / 索求) */}
            <div className="border border-[#28362d] rounded-xl p-3 mb-3 bg-[#050906]">
              <span className="text-[#35d9ff] font-mono text-[11px] font-bold block mb-2">
                ② 換取對方物品 (YOU REQUEST)
              </span>
              <fieldset className="trade-asset-type !mb-2">
                <button
                  type="button"
                  className={form.requestType === 'treasure' ? 'is-active' : ''}
                  onClick={() => selectRequestType('treasure')}
                  aria-pressed={form.requestType === 'treasure'}
                >
                  <Gem size={17} /> 道具裝備
                </button>
                <button
                  type="button"
                  className={form.requestType === 'unit' ? 'is-active' : ''}
                  onClick={() => selectRequestType('unit')}
                  aria-pressed={form.requestType === 'unit'}
                >
                  <Cat size={17} /> NOXCAT
                </button>
              </fieldset>

              {form.requestType === 'treasure' ? (
                <div className="grid grid-cols-[1fr_80px] gap-2">
                  <div className="select-wrap">
                    <select
                      value={form.requestName}
                      onChange={(event) => setForm({ ...form, requestName: event.target.value })}
                    >
                      <option value="回家石">回家石 (防掉落)</option>
                      <option value="像素劍">像素劍 (ATK +2)</option>
                      <option value="資料盾">資料盾 (DEF +1)</option>
                      <option value="能量晶石">能量晶石 (升級素材)</option>
                      <option value="急救模組">急救模組 (HP +10)</option>
                      <option value="量子核心">量子核心 (SPD +3)</option>
                    </select>
                    <ChevronDown size={16} />
                  </div>
                  <div className="select-wrap">
                    <select
                      value={form.requestQty}
                      onChange={(event) => setForm({ ...form, requestQty: Number(event.target.value) })}
                    >
                      <option value={1}>× 1</option>
                      <option value={2}>× 2</option>
                      <option value={3}>× 3</option>
                    </select>
                    <ChevronDown size={16} />
                  </div>
                </div>
              ) : (
                <div className="select-wrap">
                  <select
                    value={form.requestName}
                    onChange={(event) => setForm({ ...form, requestName: event.target.value })}
                  >
                    <option value="FUTURE NOXCAT">FUTURE NOXCAT #01</option>
                    <option value="SHADOW NOXCAT">SHADOW NOXCAT #03</option>
                    <option value="EMBER NOXCAT">EMBER NOXCAT #07</option>
                    <option value="NEO NOXCAT">NEO NOXCAT #02</option>
                    <option value="GLITCH NOXCAT">GLITCH NOXCAT #08</option>
                  </select>
                  <ChevronDown size={16} />
                </div>
              )}
            </div>

            <div className="text-[10px] text-[#8ea495] font-mono leading-relaxed mb-4 bg-[#09110c] p-2.5 rounded-lg border border-[#1b2b20]">
              ⓘ 宣告支付的物品會在等待確認期間暫時鎖定；對方同意後，雙方資產將自動對調劃轉，絕非單向送禮。
            </div>

            <button className="primary-action" disabled={!canSubmit}>
              <ArrowLeftRight size={18} />
              <span>{submitting ? '發起中…' : '送出以物易物請求'}</span>
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
