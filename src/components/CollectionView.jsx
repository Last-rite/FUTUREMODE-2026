import React, { useMemo, useState } from 'react';
import { Check, ChevronRight, Gem, Info, LockKeyhole, Package, Shield, Sparkles, Swords, X, Zap } from 'lucide-react';
import DemoBadge from './DemoBadge.jsx';
import NoxPlaceholder from './NoxPlaceholder.jsx';

const STAT_ICONS = { hp: Shield, atk: Swords, def: LockKeyhole, spd: Zap };

export default function CollectionView({ data, onToggleParty, onMessage }) {
  const [tab, setTab] = useState('pets');
  const [selectedPet, setSelectedPet] = useState(null);
  const team = useMemo(() => data.pets.filter((pet) => pet.selected), [data.pets]);

  const handleToggle = async (pet) => {
    try {
      await onToggleParty(pet.id);
      onMessage(pet.selected ? `${pet.name} 已離開出戰隊伍` : `${pet.name} 已加入出戰隊伍`);
    } catch (error) { onMessage(error.message, 'error'); }
  };

  return (
    <div className="screen-scroll feature-screen collection-screen">
      <header className="feature-header">
        <div><div className="eyebrow eyebrow--green">ASSET VAULT</div><h1>收藏與編隊</h1><p>點一下即可查看；使用按鈕編入或移出隊伍。</p></div>
        <DemoBadge compact />
      </header>

      <section className="squad-board">
        <div className="section-heading section-heading--compact"><div><span>ACTIVE SQUAD</span><h2>出戰序列</h2></div><span className="team-count">{team.length}/3</span></div>
        <div className="squad-slots">
          {[0, 1, 2].map((slot) => {
            const pet = team[slot];
            return pet ? (
              <button key={pet.id} className="squad-slot is-filled" style={{ '--pet-accent': pet.accent }} onClick={() => setSelectedPet(pet)}>
                <span className="slot-number">0{slot + 1}</span><NoxPlaceholder pet={pet} size="sm" /><strong>{pet.name}</strong>
                {pet.protected && <span className="slot-lock"><LockKeyhole size={9} /></span>}
              </button>
            ) : <div key={slot} className="squad-slot"><span className="slot-number">0{slot + 1}</span><Package size={22} /><strong>EMPTY</strong></div>;
          })}
        </div>
      </section>

      <div className="segmented-control" role="tablist">
        <button className={tab === 'pets' ? 'is-active' : ''} onClick={() => setTab('pets')} role="tab"><Sparkles size={15} /> NOXCAT <span>{data.pets.length}</span></button>
        <button className={tab === 'items' ? 'is-active' : ''} onClick={() => setTab('items')} role="tab"><Gem size={15} /> 道具 <span>{data.items.length}</span></button>
      </div>

      {tab === 'pets' ? (
        <section className="asset-grid">
          {data.pets.map((pet) => (
            <article className={`asset-card ${pet.selected ? 'is-selected' : ''}`} key={pet.id} style={{ '--pet-accent': pet.accent }}>
              <button className="asset-card__main" onClick={() => setSelectedPet(pet)} aria-label={`查看 ${pet.name}`}>
                <div className="asset-badges"><span>{pet.className}</span>{pet.protected ? <span className="protected"><LockKeyhole size={9} /> 保護</span> : <span className="droppable">可掉落</span>}</div>
                <NoxPlaceholder pet={pet} size="lg" />
                <div className="asset-title"><span>LV.{pet.level}</span><strong>{pet.name}</strong></div>
                <div className="mini-stats"><span>HP {pet.hp}</span><span>ATK {pet.atk}</span><span>SPD {pet.spd}</span></div>
              </button>
              <button className={`party-toggle ${pet.selected ? 'is-remove' : ''}`} onClick={() => handleToggle(pet)}>
                {pet.selected ? <><Check size={14} /> 已出戰</> : <>加入隊伍 <ChevronRight size={14} /></>}
              </button>
            </article>
          ))}
        </section>
      ) : (
        <section className="item-list">
          {data.items.map((item) => (
            <article className="item-card" key={item.id}>
              <div className="item-icon"><Gem size={23} /></div><div><span>{item.type} · {item.rarity}</span><h3>{item.name}</h3><strong>{item.bonus}</strong></div><button aria-label={`查看 ${item.name}`}><ChevronRight size={18} /></button>
            </article>
          ))}
          <div className="inline-note"><Info size={15} /><span>道具裝備與交易皆為本機 Demo 資料，不會產生鏈上紀錄。</span></div>
        </section>
      )}

      {selectedPet && (
        <div className="sheet-backdrop" onClick={() => setSelectedPet(null)}>
          <section className="detail-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${selectedPet.name} 詳情`}>
            <div className="sheet-handle" /><button className="sheet-close" onClick={() => setSelectedPet(null)} aria-label="關閉"><X size={18} /></button>
            <div className="detail-hero" style={{ '--pet-accent': selectedPet.accent }}><NoxPlaceholder pet={selectedPet} size="hero" /><div><span>UNIQUE ID</span><code>{selectedPet.id.toUpperCase()}</code><h2>{selectedPet.name}</h2><p>「{selectedPet.quote}」</p></div></div>
            <div className={`ownership-label ${selectedPet.protected ? 'protected' : 'droppable'}`}>{selectedPet.protected ? <LockKeyhole size={14} /> : <Sparkles size={14} />}{selectedPet.protected ? '初始保護 · 不會掉落' : '可掉落收藏 · 戰敗可能失去'}</div>
            <div className="detail-stats">{['hp', 'atk', 'def', 'spd'].map((key) => { const Icon = STAT_ICONS[key]; return <div key={key}><Icon size={15} /><span>{key.toUpperCase()}</span><strong>{selectedPet[key]}</strong></div>; })}</div>
            <div className="skill-box"><span>PASSIVE SKILL</span><strong>{selectedPet.skill}</strong></div>
            <button className={`primary-action ${selectedPet.selected ? 'secondary-action' : ''}`} onClick={() => handleToggle(selectedPet)}><span>{selectedPet.selected ? '移出出戰隊伍' : '加入出戰隊伍'}</span>{selectedPet.selected ? <X size={18} /> : <Check size={18} />}</button>
          </section>
        </div>
      )}
    </div>
  );
}
