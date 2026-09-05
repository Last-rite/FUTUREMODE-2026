import React, { useState } from 'react';
import { ArrowRight, Cat, Check, ChevronDown, Clock3, Gem, LocateFixed, LockKeyhole, MapPin, Plus, Repeat2, UserRound, X } from 'lucide-react';
import DemoBadge from './DemoBadge.jsx';
import NoxPlaceholder from './NoxPlaceholder.jsx';

function AssetDisc({ type = 'pet', label }) {
  return <span className={`sketch-asset-disc sketch-asset-disc--${type}`}>{type === 'pet' ? <Cat size={22} /> : <Gem size={22} />}<small>{label}</small></span>;
}

export default function TradeView({ data, onCreateTrade, onResolveTrade, onMessage }) {
  const [tab, setTab] = useState('market');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ playerId: 'PIXEL_GHOST', offeredPetId: data.pets[1]?.id || data.pets[0]?.id, requestedItemId: data.items[2]?.id || data.items[0]?.id });
  const [submitting, setSubmitting] = useState(false);

  const submitTrade = async (event) => {
    event.preventDefault(); setSubmitting(true);
    try { await onCreateTrade(form); setShowCreate(false); onMessage('測試交易請求已建立'); }
    finally { setSubmitting(false); }
  };

  return (
    <main className="screen-scroll feature-screen sketch-trade">
      <header className="sketch-feature-brand"><div><strong>FUTUREMODE</strong><span>資產交換站</span></div><DemoBadge compact /></header>
      <div className="sketch-trade-tabs" role="tablist">
        <button className={tab === 'market' ? 'is-active' : ''} onClick={() => setTab('market')} role="tab"><Repeat2 size={20} /><span>交易所</span></button>
        <button className={tab === 'lost' ? 'is-active' : ''} onClick={() => setTab('lost')} role="tab"><LocateFixed size={20} /><span>走失列表</span></button>
      </div>

      {tab === 'market' ? (
        <section className="sketch-trade-list" aria-label="交易請求">
          {data.trades.map((trade) => (
            <article className={`sketch-trade-row is-${trade.status}`} key={trade.id}>
              <span className="sketch-trade-status">{trade.status === 'accepted' ? <Check size={19} /> : trade.status === 'rejected' ? <X size={19} /> : <Clock3 size={18} />}</span>
              <div className="sketch-trade-user"><UserRound size={13} /><span>{trade.from}</span><small>{trade.time}</small></div>
              <div className="sketch-trade-assets">
                <AssetDisc type="pet" label={trade.offer} />
                <span className="sketch-exchange-arrow"><ArrowRight size={20} /></span>
                <AssetDisc type="item" label={trade.request} />
              </div>
              {trade.status === 'pending' && <footer><button onClick={() => onResolveTrade(trade.id, 'rejected')}><X size={15} />拒絕</button><button onClick={() => onResolveTrade(trade.id, 'accepted')}><Check size={15} />接受</button></footer>}
            </article>
          ))}
          <button className="sketch-floating-plus" onClick={() => setShowCreate(true)} aria-label="發起交易"><Plus size={28} /></button>
        </section>
      ) : (
        <section className="sketch-lost-grid" aria-label="走失資產">
          {data.lostAssets.map((asset) => {
            const pet = { code: asset.code, name: asset.name, accent: asset.status === 'claimed' ? '#35d9ff' : '#ff2a55' };
            return (
              <article className="sketch-lost-card" key={asset.id}>
                <NoxPlaceholder pet={pet} size="md" muted />
                <span className="sketch-lost-route"><ArrowRight size={17} /></span>
                <span className="sketch-lost-place">{asset.status === 'claimed' ? <UserRound size={25} /> : <MapPin size={25} />}</span>
                <h3>{asset.name}</h3>
                <p>{asset.status === 'claimed' ? asset.claimedBy : asset.location}</p>
                <small>{asset.lostAt}</small>
              </article>
            );
          })}
        </section>
      )}

      {showCreate && (
        <div className="sheet-backdrop" onClick={() => setShowCreate(false)}>
          <form className="detail-sheet create-trade-sheet sketch-create-trade" onClick={(event) => event.stopPropagation()} onSubmit={submitTrade}>
            <button type="button" className="sheet-close" onClick={() => setShowCreate(false)} aria-label="關閉"><X size={18} /></button>
            <small>TEST REQUEST</small><h2>發起測試交易</h2><p>送出後只會加入本機測試列表，資產不會真的轉移。</p>
            <label><span>對方玩家 ID</span><div className="callsign-input"><span>#</span><input value={form.playerId} onChange={(event) => setForm({ ...form, playerId: event.target.value.toUpperCase() })} required /></div></label>
            <label><span>我方提供</span><div className="select-wrap"><select value={form.offeredPetId} onChange={(event) => setForm({ ...form, offeredPetId: event.target.value })}>{data.pets.filter((pet) => !pet.protected).map((pet) => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</select><ChevronDown size={16} /></div></label>
            <label><span>希望取得</span><div className="select-wrap"><select value={form.requestedItemId} onChange={(event) => setForm({ ...form, requestedItemId: event.target.value })}>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.bonus}</option>)}</select><ChevronDown size={16} /></div></label>
            <div className="inline-note inline-note--danger"><LockKeyhole size={15} /><span>正式版本會由後端鎖定資產；目前僅為測試。</span></div>
            <button className="primary-action" disabled={submitting}><span>{submitting ? '建立中…' : '確認送出'}</span><ArrowRight size={18} /></button>
          </form>
        </div>
      )}
    </main>
  );
}
