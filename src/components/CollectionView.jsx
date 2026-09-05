import React, { useMemo, useState } from 'react';
import { Check, Gem, LockKeyhole, Package, Search, Shield, Swords, X, Zap } from 'lucide-react';
import DemoBadge from './DemoBadge.jsx';
import NoxPlaceholder from './NoxPlaceholder.jsx';

const STAT_ICONS = { hp: Shield, atk: Swords, def: LockKeyhole, spd: Zap };

function ItemPlaceholder({ item }) {
  return <span className="sketch-item-token"><Gem size={25} /><small>{item.type}</small></span>;
}

export default function CollectionView({ data, onToggleParty, onMessage }) {
  const [tab, setTab] = useState('pets');
  const [loadout, setLoadout] = useState(1);
  const [selectedPet, setSelectedPet] = useState(null);
  const team = useMemo(() => data.pets.filter((pet) => pet.selected).slice(0, 3), [data.pets]);

  const handleToggle = async (pet) => {
    try {
      await onToggleParty(pet.id);
      onMessage(pet.selected ? `${pet.name} 已離開出戰隊伍` : `${pet.name} 已加入出戰隊伍`);
      setSelectedPet(null);
    } catch (error) { onMessage(error.message, 'error'); }
  };

  return (
    <main className="screen-scroll feature-screen sketch-collection">
      <header className="sketch-feature-brand">
        <div><strong>FUTUREMODE</strong><span>寵物與裝備</span></div><DemoBadge compact />
      </header>

      <nav className="sketch-loadout-tabs" aria-label="編隊組合">
        <button aria-label="搜尋收藏"><Search size={18} /></button>
        {[1, 2, 3, 4, 5].map((number) => <button key={number} className={loadout === number ? 'is-active' : ''} onClick={() => setLoadout(number)}>{number}</button>)}
      </nav>

      <section className="sketch-loadout" aria-label={`編隊 ${loadout}`}>
        {[0, 1, 2].map((slot) => {
          const pet = team[slot];
          const item = data.items.find((entry) => entry.id === pet?.equipped);
          return (
            <div className="sketch-loadout__slot" key={pet?.id || slot}>
              <button className={pet ? 'is-filled' : ''} style={{ '--pet-accent': pet?.accent || '#38433c' }} onClick={() => pet && setSelectedPet(pet)} aria-label={pet ? `查看 ${pet.name}` : `空白位置 ${slot + 1}`}>
                {pet ? <NoxPlaceholder pet={pet} size="md" /> : <Package size={27} />}
                <span>{slot + 1}</span>
              </button>
              <span className={`sketch-equipped ${item ? 'is-equipped' : ''}`} title={item?.name || '未裝備'}><Gem size={13} /></span>
            </div>
          );
        })}
      </section>

      <div className="sketch-vault-switch" role="tablist">
        <button className={tab === 'pets' ? 'is-active' : ''} onClick={() => setTab('pets')} role="tab">NOXCAT</button>
        <button className={tab === 'items' ? 'is-active' : ''} onClick={() => setTab('items')} role="tab">裝備</button>
      </div>

      {tab === 'pets' ? (
        <section className="sketch-vault-grid" aria-label="寵物收藏">
          {data.pets.map((pet) => (
            <button className={`sketch-vault-token ${pet.selected ? 'is-selected' : ''}`} key={pet.id} style={{ '--pet-accent': pet.accent }} onClick={() => setSelectedPet(pet)}>
              <NoxPlaceholder pet={pet} size="md" />
              <strong>{pet.name}</strong><span>LV.{pet.level}</span>
            </button>
          ))}
          {Array.from({ length: Math.max(4, 12 - data.pets.length) }, (_, index) => <span className="sketch-vault-token is-empty" key={`empty-${index}`}><i>+</i><small>EMPTY</small></span>)}
        </section>
      ) : (
        <section className="sketch-vault-grid" aria-label="裝備收藏">
          {data.items.map((item) => <button className="sketch-vault-token" key={item.id}><ItemPlaceholder item={item} /><strong>{item.name}</strong><span>{item.bonus}</span></button>)}
          {Array.from({ length: 5 }, (_, index) => <span className="sketch-vault-token is-empty" key={`item-empty-${index}`}><i>+</i><small>EMPTY</small></span>)}
        </section>
      )}

      {selectedPet && (
        <section className="sketch-pet-detail" role="dialog" aria-modal="true" aria-label={`${selectedPet.name} 詳情`} style={{ '--pet-accent': selectedPet.accent }}>
          <button className="sketch-pet-detail__close" onClick={() => setSelectedPet(null)} aria-label="關閉"><X size={20} /></button>
          <header><small>NXC-{selectedPet.code} · LV.{selectedPet.level}</small><h2>{selectedPet.name}</h2></header>
          <div className="sketch-pet-detail__body">
            <div className="sketch-detail-stats">
              {['hp', 'atk', 'def', 'spd'].map((key) => {
                const Icon = STAT_ICONS[key];
                const value = selectedPet[key];
                return <div key={key}><span><Icon size={14} />{key.toUpperCase()}</span><strong>{value}</strong><i><b style={{ width: `${Math.min(100, value)}%` }} /></i></div>;
              })}
            </div>
            <blockquote>「{selectedPet.quote}」</blockquote>
            <div className="sketch-detail-character"><NoxPlaceholder pet={selectedPet} size="hero" /></div>
            <div className="sketch-detail-skill"><small>特殊技能</small><strong>{selectedPet.skill}</strong></div>
          </div>
          <button className={`sketch-detail-action ${selectedPet.selected ? 'is-remove' : ''}`} onClick={() => handleToggle(selectedPet)}>{selectedPet.selected ? <X size={18} /> : <Check size={18} />}{selectedPet.selected ? '移出隊伍' : '加入隊伍'}</button>
        </section>
      )}
    </main>
  );
}
