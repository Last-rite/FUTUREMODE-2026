import React, { useState } from 'react';
import { ArrowLeftRight, ArrowRight, Cat, Check, ChevronDown, Gem, LockKeyhole, Plus, Swords, UserRound, Waves, X } from 'lucide-react';
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

export default function TradeView({ data, onCreateTrade, onResolveTrade, onMessage }) {
  const [tab, setTab] = useState('market'); // 'market' | 'lost'
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    playerId: 'PIXEL_GHOST',
    offeredPetId: data.pets[1]?.id || data.pets[0]?.id,
    requestedItemId: data.items[2]?.id || data.items[0]?.id,
  });
  const [submitting, setSubmitting] = useState(false);

  const submitTrade = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onCreateTrade(form);
      setShowCreate(false);
      onMessage('測試交易請求已建立');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="screen-scroll feature-screen sketch-trade">
      {/* 1. Header: Clean centered Title matching sketch "標題" */}
      <header className="sketch-screen-topbar">
        <BrandLockup compact />
      </header>

      {/* 2. Angled Tabs matching sketch: Active has angled border /  \, Inactive has NO border */}
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
        /* MARKET VIEW: matching trade_example.jpg */
        <section className="sketch-trade-list-container" aria-label="交易請求列表">
          <div className="sketch-trade-rows">
            {data.trades.map((trade) => {
              const petObj = {
                code: trade.offerPetCode || '01',
                name: trade.offer,
                accent: '#00ff66',
              };

              return (
                <article className={`sketch-trade-card is-${trade.status}`} key={trade.id}>
                  {/* Left: Circular status/actor disc */}
                  <div className="sketch-trade-actor-col" title={`狀態: ${trade.status} · 來自 #${trade.from}`}>
                    <div className={`sketch-trade-status-disc is-${trade.status}`}>
                      {trade.status === 'accepted' ? (
                        <Check size={22} strokeWidth={3} />
                      ) : trade.status === 'rejected' ? (
                        <X size={22} strokeWidth={3} />
                      ) : (
                        <UserRound size={21} strokeWidth={2.4} />
                      )}
                    </div>
                  </div>

                  {/* Middle Left: Offered Assets (Pet + Weapon) */}
                  <div className="sketch-trade-offer-group">
                    <div className="sketch-trade-offer-visuals">
                      <div className="sketch-trade-pet-avatar">
                        <NoxPlaceholder pet={petObj} size="sm" />
                      </div>
                      <div className="sketch-trade-weapon-badge" title={trade.offerWeapon || '攜帶武器'}>
                        <img
                          src={trade.offerWeapon?.includes('盾') ? shieldImg : (trade.offerWeapon?.includes('寶石') || trade.offerWeapon?.includes('水晶') || trade.offerWeapon?.includes('石')) ? gemImg : swordImg}
                          alt={trade.offerWeapon || '武器'}
                          className="w-5 h-5 object-contain pixelated"
                        />
                      </div>
                    </div>
                    <div className="sketch-trade-label-group">
                      <span className="sketch-trade-asset-txt">{trade.offer}</span>
                      <small className="sketch-trade-sub-txt">{trade.offerWeapon || '武器'}</small>
                    </div>
                  </div>

                  {/* Center: Exchange Arrow <=> */}
                  <div className="sketch-trade-arrow-col" title="等價交換">
                    <ArrowLeftRight size={22} strokeWidth={2.6} className="sketch-trade-arrow-icon" />
                  </div>

                  {/* Middle Right: Requested Asset (Item x Quantity) */}
                  <div className="sketch-trade-req-group">
                    <div className="sketch-trade-req-visuals">
                      <div className="sketch-trade-gem-disc">
                        <Gem size={20} />
                      </div>
                      <span className="sketch-trade-qty-pill">×{trade.requestQty || 2}</span>
                    </div>
                    <div className="sketch-trade-label-group">
                      <span className="sketch-trade-asset-txt">{trade.request}</span>
                      <small className="sketch-trade-sub-txt">需求 x{trade.requestQty || 2}</small>
                    </div>
                  </div>

                  {/* Pending Action Buttons (if pending) */}
                  {trade.status === 'pending' && (
                    <footer className="sketch-trade-card__actions">
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
                        aria-label="接受交易"
                      >
                        <Check size={14} /> 接受
                      </button>
                    </footer>
                  )}
                </article>
              );
            })}
          </div>

          {/* 3D Raised FAB (+) matching trade_example.jpg bottom right */}
          <button
            className="sketch-3d-fab-btn"
            onClick={() => setShowCreate(true)}
            aria-label="發起交易"
            title="發起交易 (+)"
          >
            <span className="sketch-3d-fab-surface">
              <Plus size={30} strokeWidth={3} />
            </span>
            <span className="sketch-3d-fab-shadow" />
          </button>
        </section>
      ) : (
        /* MOURN / LOST VIEW: 2-Column Grid matching mourn_example.jpg */
        <section className="sketch-mourn-grid" aria-label="走失資產名錄">
          {data.lostAssets.map((asset) => {
            const isPet = asset.type !== 'weapon';
            const petObj = {
              code: asset.code || '07',
              name: asset.name,
              accent: asset.status === 'claimed' ? '#35d9ff' : '#ff2a55',
            };

            return (
              <article className={`sketch-mourn-card is-${asset.status}`} key={asset.id}>
                {/* Top Trio: [ Asset (Pet/Weapon) ]  [ † Tombstone ]  [ User / Pool Disc ] */}
                <div className="sketch-mourn-trio">
                  {/* Left: Lost asset */}
                  <div className="sketch-mourn-disc sketch-mourn-disc--asset">
                    {isPet ? (
                      <NoxPlaceholder pet={petObj} size="sm" muted />
                    ) : (
                      <div className="sketch-mourn-weapon-icon" title={asset.name}>
                        <img
                          src={(asset.name?.includes('盾') || asset.iconType === 'shield') ? shieldImg : (asset.name?.includes('寶石') || asset.name?.includes('水晶') || asset.name?.includes('石')) ? gemImg : swordImg}
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
                  <h4 className="sketch-mourn-title">{asset.name}</h4>
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
            onClick={(event) => event.stopPropagation()}
            onSubmit={submitTrade}
          >
            <button
              type="button"
              className="sheet-close"
              onClick={() => setShowCreate(false)}
              aria-label="關閉"
            >
              <X size={18} />
            </button>
            <small>TEST REQUEST</small>
            <h2>發起測試交易</h2>
            <p>送出後只會加入本機測試列表，資產不會真的轉移。</p>

            <label>
              <span>對方玩家 ID</span>
              <div className="callsign-input">
                <span>#</span>
                <input
                  value={form.playerId}
                  onChange={(event) =>
                    setForm({ ...form, playerId: event.target.value.toUpperCase() })
                  }
                  required
                />
              </div>
            </label>

            <label>
              <span>我方提供 (寵物)</span>
              <div className="select-wrap">
                <select
                  value={form.offeredPetId}
                  onChange={(event) => setForm({ ...form, offeredPetId: event.target.value })}
                >
                  {data.pets
                    .filter((pet) => !pet.protected)
                    .map((pet) => (
                      <option key={pet.id} value={pet.id}>
                        {pet.name} (出戰中)
                      </option>
                    ))}
                </select>
                <ChevronDown size={16} />
              </div>
            </label>

            <label>
              <span>希望取得 (道具)</span>
              <div className="select-wrap">
                <select
                  value={form.requestedItemId}
                  onChange={(event) => setForm({ ...form, requestedItemId: event.target.value })}
                >
                  {data.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.bonus}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} />
              </div>
            </label>

            <div className="inline-note inline-note--danger">
              <LockKeyhole size={15} />
              <span>正式版本會由後端鎖定資產；目前僅為測試。</span>
            </div>

            <button className="primary-action" disabled={submitting}>
              <span>{submitting ? '建立中…' : '確認送出'}</span>
              <ArrowRight size={18} />
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
