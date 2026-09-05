import React, { useState } from 'react';
import { ArrowRight, Check, ChevronDown, Clock3, LocateFixed, LockKeyhole, Plus, Repeat2, Search, ShieldAlert, Sparkles, UserRound, X } from 'lucide-react';
import DemoBadge from './DemoBadge.jsx';
import NoxPlaceholder from './NoxPlaceholder.jsx';

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
    <div className="screen-scroll feature-screen trade-screen">
      <header className="feature-header"><div><div className="eyebrow eyebrow--green">P2P RELAY</div><h1>資產交換站</h1><p>追蹤請求，也能找到離開你的 NOXCAT。</p></div><DemoBadge compact /></header>
      <div className="segmented-control" role="tablist">
        <button className={tab === 'market' ? 'is-active' : ''} onClick={() => setTab('market')} role="tab"><Repeat2 size={15} /> 交易所 <span>{data.trades.length}</span></button>
        <button className={tab === 'lost' ? 'is-active' : ''} onClick={() => setTab('lost')} role="tab"><LocateFixed size={15} /> 走失列表 <span>{data.lostAssets.length}</span></button>
      </div>

      {tab === 'market' ? (
        <>
          <section className="trade-summary"><div><span>PENDING</span><strong>{data.trades.filter((trade) => trade.status === 'pending').length}</strong></div><div><span>COMPLETED</span><strong>{data.trades.filter((trade) => trade.status === 'accepted').length}</strong></div><div><span>LOCKED</span><strong>1</strong></div></section>
          <div className="list-heading"><span>RECENT REQUESTS</span><button><Search size={15} /> 搜尋</button></div>
          <section className="trade-list">
            {data.trades.map((trade) => (
              <article className="trade-card" key={trade.id}>
                <header><div className="trade-user"><span><UserRound size={16} /></span><div><strong>{trade.from}</strong><small>{trade.time}</small></div></div><span className={`status status--${trade.status}`}>{trade.status === 'pending' ? '等待回覆' : trade.status === 'accepted' ? '已接受' : '已拒絕'}</span></header>
                <div className="trade-assets"><div><small>對方提供</small><strong>{trade.offer}</strong></div><span><Repeat2 size={17} /></span><div><small>希望取得</small><strong>{trade.request}</strong></div></div>
                {trade.status === 'pending' && <footer><button className="reject-button" onClick={() => onResolveTrade(trade.id, 'rejected')}><X size={15} /> 拒絕</button><button className="accept-button" onClick={() => onResolveTrade(trade.id, 'accepted')}><Check size={15} /> 接受</button></footer>}
              </article>
            ))}
          </section>
          <button className="floating-create" onClick={() => setShowCreate(true)}><Plus size={20} /><span>發起交易</span></button>
        </>
      ) : (
        <>
          <div className="lost-intro"><ShieldAlert size={20} /><div><strong>Ownership Trace</strong><span>只顯示所在關卡或目前取得者，不會自動取回資產。</span></div></div>
          <section className="lost-list">
            {data.lostAssets.map((asset) => {
              const placeholderPet = { code: asset.code, name: asset.name, accent: asset.status === 'claimed' ? '#35d9ff' : '#ff5f3d' };
              return <article className="lost-card" key={asset.id}><NoxPlaceholder pet={placeholderPet} size="md" muted /><div className="lost-copy"><span>LOST · {asset.lostAt}</span><h3>{asset.name}</h3>{asset.status === 'claimed' ? <p><UserRound size={13} />由 <strong>{asset.claimedBy}</strong> 取得</p> : <p><LocateFixed size={13} />停留於 <strong>{asset.location}</strong></p>}</div><button aria-label={`查看 ${asset.name}`}><ArrowRight size={18} /></button></article>;
            })}
          </section>
        </>
      )}

      {showCreate && (
        <div className="sheet-backdrop" onClick={() => setShowCreate(false)}>
          <form className="detail-sheet create-trade-sheet" onClick={(event) => event.stopPropagation()} onSubmit={submitTrade}>
            <div className="sheet-handle" /><button type="button" className="sheet-close" onClick={() => setShowCreate(false)} aria-label="關閉"><X size={18} /></button>
            <div className="eyebrow eyebrow--green">NEW P2P REQUEST</div><h2>發起測試交易</h2><p>送出後會加入本機請求列表。資產不會真的轉移。</p>
            <label><span>對方玩家 ID</span><div className="callsign-input"><span>#</span><input value={form.playerId} onChange={(event) => setForm({ ...form, playerId: event.target.value.toUpperCase() })} required /></div></label>
            <label><span>我方提供</span><div className="select-wrap"><select value={form.offeredPetId} onChange={(event) => setForm({ ...form, offeredPetId: event.target.value })}>{data.pets.filter((pet) => !pet.protected).map((pet) => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</select><ChevronDown size={16} /></div></label>
            <label><span>希望取得</span><div className="select-wrap"><select value={form.requestedItemId} onChange={(event) => setForm({ ...form, requestedItemId: event.target.value })}>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.bonus}</option>)}</select><ChevronDown size={16} /></div></label>
            <div className="inline-note inline-note--danger"><LockKeyhole size={15} /><span>正式版本送出後會鎖定資產；本 Demo 只模擬狀態。</span></div>
            <button className="primary-action" disabled={submitting}><span>{submitting ? '建立中…' : '確認送出'}</span><ArrowRight size={18} /></button>
          </form>
        </div>
      )}
    </div>
  );
}
