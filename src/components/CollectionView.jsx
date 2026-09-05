import React, { useMemo, useRef, useState } from 'react';
import {
  Cat,
  Check,
  ChevronDown,
  ChevronUp,
  Gem,
  Plus,
  Shield,
  Sparkles,
  Swords,
  X,
  Zap,
} from 'lucide-react';
import NoxPlaceholder from './NoxPlaceholder.jsx';
import swordImg from '../assets/sword_128.png';
import shieldImg from '../assets/shield_128.png';

const STAT_ICONS = { hp: Shield, atk: Swords, def: Shield, spd: Zap };

// Custom cyber weapon illustration component
export function ItemIllustration({ item, size = 'lg' }) {
  const isBlade = item?.type === 'WEAPON' || item?.id?.includes('blade') || item?.name?.includes('劍');
  const isShield = item?.type === 'GEAR' || item?.id?.includes('shield') || item?.name?.includes('盾');
  const isHome = item?.type === 'TREASURE' || item?.id?.includes('home');

  if (size === 'sm') {
    return (
      <span className="sketch-mini-item-icon">
        {isBlade && <img src={swordImg} alt={item?.name || '劍'} className="w-3.5 h-3.5 object-contain pixelated" />}
        {isShield && <img src={shieldImg} alt={item?.name || '盾'} className="w-3.5 h-3.5 object-contain pixelated" />}
        {isHome && <Gem size={12} />}
        {!isBlade && !isShield && !isHome && <Gem size={12} />}
      </span>
    );
  }

  return (
    <div className={`cyber-item-art cyber-item-art--${size}`}>
      {isBlade && (
        <img
          src={swordImg}
          alt={item?.name || '劍'}
          className="item-img"
        />
      )}
      {isShield && (
        <img
          src={shieldImg}
          alt={item?.name || '盾'}
          className="item-img"
        />
      )}
      {isHome && (
        <svg viewBox="0 0 100 100" className="item-svg item-svg--home">
          <defs>
            <linearGradient id="homeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff55ff" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#35d9ff" />
            </linearGradient>
            <filter id="crystalGlow">
              <feGaussianBlur stdDeviation="3.5" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <polygon points="50,12 78,35 68,82 50,92 32,82 22,35" fill="rgba(139,92,246,0.18)" stroke="url(#homeGrad)" strokeWidth="4" filter="url(#crystalGlow)" />
          <polygon points="50,22 68,38 60,74 50,80 40,74 32,38" fill="rgba(255,85,255,0.25)" stroke="#fff" strokeWidth="1.5" />
          <circle cx="50" cy="50" r="4" fill="#35d9ff" />
          <line x1="50" y1="12" x2="50" y2="92" stroke="rgba(255,255,255,0.6)" strokeWidth="1" strokeDasharray="4 4" />
        </svg>
      )}
      {!isBlade && !isShield && !isHome && (
        <div className="item-svg-fallback">
          <Gem size={42} />
        </div>
      )}
      <span className="cyber-item-art__code">{item?.rarity || 'RELIC'}</span>
    </div>
  );
}

export default function CollectionView({ data, onToggleParty, onEquipItem, onMessage }) {
  // Mode switch: 'pets' vs 'items'
  const [tab, setTab] = useState('pets');
  const [selectedPet, setSelectedPet] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [equipTargetPetId, setEquipTargetPetId] = useState(null);

  // Loadout management: 5 tabs storing distinct party line-ups
  const LOADOUTS_KEY = 'futuremode_party_loadouts_v2';
  const [loadout, setLoadout] = useState(1);
  const [loadouts, setLoadouts] = useState(() => {
    try {
      const saved = localStorage.getItem(LOADOUTS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    const pIds = data.pets.map((p) => p.id);
    return {
      1: [pIds[0], pIds[1], pIds[2]].filter(Boolean),
      2: [pIds[0], pIds[1]].filter(Boolean),
      3: [pIds[0], pIds[2]].filter(Boolean),
      4: [pIds[0], pIds[3]].filter(Boolean),
      5: [pIds[0]].filter(Boolean),
    };
  });

  const saveLoadouts = (next) => {
    setLoadouts(next);
    try {
      localStorage.setItem(LOADOUTS_KEY, JSON.stringify(next));
    } catch (e) {}
  };

  // Get current active party for selected loadout
  const activePartyIds = loadouts[loadout] || [];
  const team = useMemo(() => {
    return activePartyIds.map((id) => data.pets.find((p) => p.id === id)).filter(Boolean);
  }, [activePartyIds, data.pets]);

  // Custom scrollbar state
  const scrollRef = useRef(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll > 0) {
      setScrollProgress(scrollTop / maxScroll);
    } else {
      setScrollProgress(0);
    }
  };

  const handleScrollStep = (direction) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ top: direction * 120, behavior: 'smooth' });
    }
  };

  // Toggle pet in current active loadout
  const handleToggle = async (pet) => {
    const isCurrentlyInTeam = activePartyIds.includes(pet.id);
    let nextIds;
    if (isCurrentlyInTeam) {
      nextIds = activePartyIds.filter((id) => id !== pet.id);
      onMessage(`${pet.name} 已從編組 ${loadout} 移出`);
    } else {
      if (activePartyIds.length >= 3) {
        onMessage(`編組 ${loadout} 已滿（最多 3 隻）`, 'error');
        return;
      }
      nextIds = [...activePartyIds, pet.id];
      onMessage(`${pet.name} 已加入編組 ${loadout}`);
    }
    const nextLoadouts = { ...loadouts, [loadout]: nextIds };
    saveLoadouts(nextLoadouts);

    // Sync to backend if on loadout 1
    if (loadout === 1) {
      try {
        await onToggleParty(pet.id);
      } catch (e) {}
    }
    setSelectedPet(null);
  };

  const handleEquip = async (petId, itemId) => {
    if (!onEquipItem) return;
    try {
      await onEquipItem(petId, itemId);
      const pet = data.pets.find((p) => p.id === petId);
      const item = data.items.find((i) => i.id === itemId);
      onMessage(pet?.equipped === itemId ? `已卸下 ${item?.name}` : `已將 ${item?.name} 裝備給 ${pet?.name}`);
      setSelectedItem(null);
      setEquipTargetPetId(null);
    } catch (error) {
      onMessage(error.message, 'error');
    }
  };

  // Helper to extract clean numerical bonus for any stat key
  const getItemBonus = (item, key) => {
    if (!item) return 0;
    if (key === 'atk') {
      if (typeof item.atkBonus === 'number') return item.atkBonus;
      const m = item.bonus?.match(/ATK\s*\+(\d+)/i);
      return m ? parseInt(m[1], 10) : 0;
    }
    if (key === 'def') {
      if (typeof item.defBonus === 'number') return item.defBonus;
      const m = item.bonus?.match(/DEF\s*\+(\d+)/i);
      return m ? parseInt(m[1], 10) : 0;
    }
    if (key === 'hp') {
      if (typeof item.hpBonus === 'number') return item.hpBonus;
      const m = item.bonus?.match(/HP\s*\+(\d+)/i);
      return m ? parseInt(m[1], 10) : 0;
    }
    if (key === 'spd') {
      if (typeof item.spdBonus === 'number') return item.spdBonus;
      const m = item.bonus?.match(/SPD\s*\+(\d+)/i);
      return m ? parseInt(m[1], 10) : 0;
    }
    return 0;
  };

  const isPetMode = tab === 'pets';

  return (
    <main className="screen-scroll feature-screen sketch-collection">
      {/* Loadout Bar: Big/Small Overlapping Circle Switcher + Angled Tabs (No border on inactive tabs!) */}
      <nav className="sketch-loadout-tabs" aria-label="編隊組合與介面切換">
        <button
          className={`sketch-circle-switcher ${!isPetMode ? 'is-weapons-active' : 'is-pets-active'}`}
          onClick={() => setTab((prev) => (prev === 'pets' ? 'items' : 'pets'))}
          aria-label={isPetMode ? '當前寵物視角，點擊切換為武器視角' : '當前武器視角，點擊切換為寵物視角'}
          title="切換 寵物 / 武器 視角"
        >
          <div className="circle-node circle-node--pet" title="寵物">
            <Cat size={15} />
          </div>
          <div className="circle-node circle-node--item" title="武器">
            <Swords size={11} />
          </div>
        </button>

        <div className="sketch-tabs-strip" role="tablist" aria-label="儲存不同隊組">
          {[1, 2, 3, 4, 5].map((number) => {
            const isActive = loadout === number;
            return (
              <button
                key={number}
                className={`sketch-tab-btn ${isActive ? 'is-active' : 'is-inactive'}`}
                onClick={() => setLoadout(number)}
                role="tab"
                aria-selected={isActive}
                aria-label={`編組 ${number}`}
              >
                <span>{number}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Battle Party Loadout Slots with Dual Big/Small Size Scaling Animation */}
      <section className={`sketch-loadout ${!isPetMode ? 'sketch-loadout--weapon-mode' : 'sketch-loadout--pet-mode'}`} aria-label={`出戰隊伍 編組 ${loadout}`}>
        <div className="sketch-loadout__indicator">
          <span>{isPetMode ? `編組 ${loadout} · 出戰寵物` : `編組 ${loadout} · 攜帶裝備`}</span>
          <button
            className="sketch-anim-swap-btn"
            onClick={() => setTab((prev) => (prev === 'pets' ? 'items' : 'pets'))}
            title="動化切換視角"
          >
            動化切換 ⇄
          </button>
        </div>

        <div className="sketch-loadout__slots-grid">
          {[0, 1, 2].map((slot) => {
            const pet = team[slot];
            const item = data.items.find((entry) => entry.id === pet?.equipped);

            return (
              <div className="sketch-loadout__slot" key={`slot-${slot}`}>
                {/* Pet Circle Node (morphs between primary large circle & secondary small badge) */}
                <button
                  className={`slot-morph-node slot-morph-node--pet ${isPetMode ? 'is-primary' : 'is-secondary'} ${pet ? 'is-filled' : 'is-empty'}`}
                  style={{ '--pet-accent': pet?.accent || '#38433c' }}
                  onClick={() => {
                    if (pet) setSelectedPet(pet);
                  }}
                  aria-label={pet ? `查看 ${pet.name}` : `出戰位置 ${slot + 1} 空白`}
                >
                  {isPetMode ? (
                    <>
                      {pet ? <NoxPlaceholder pet={pet} size="md" /> : <div className="sketch-slot-empty-plus">+</div>}
                      <span className="sketch-slot-idx">{slot + 1}</span>
                    </>
                  ) : (
                    <Cat size={14} />
                  )}
                </button>

                {/* Weapon Circle Node (morphs between secondary small badge & primary large circle) */}
                <button
                  className={`slot-morph-node slot-morph-node--weapon ${!isPetMode ? 'is-primary' : 'is-secondary'} ${item ? 'is-filled' : 'is-empty'}`}
                  onClick={() => {
                    if (item) setSelectedItem(item);
                    else if (isPetMode) setTab('items');
                  }}
                  aria-label={item ? `查看裝備 ${item.name}` : `第 ${slot + 1} 號位未裝備`}
                >
                  {!isPetMode ? (
                    <>
                      {item ? (
                        <div className="sketch-slot-weapon-fill">
                          <ItemIllustration item={item} size="md" />
                          <small>{item.bonus}</small>
                        </div>
                      ) : (
                        <div className="sketch-slot-empty-weapon">
                          <Plus size={18} />
                          <small>未裝備</small>
                        </div>
                      )}
                      <span className="sketch-slot-idx">{slot + 1}</span>
                    </>
                  ) : (
                    <>{item ? <ItemIllustration item={item} size="sm" /> : <Plus size={10} />}</>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Vault Grid Area with Custom Cyberpunk Scrollbar (No default scrollbar!) */}
      <section className="sketch-vault-section">
        <div className="sketch-vault-header">
          <span className="sketch-vault-title">
            {isPetMode ? 'NOXCAT 收藏庫' : '裝備與道具庫'}
          </span>
          <span className="sketch-vault-count">
            {isPetMode ? `${data.pets.length} 隻持有中` : `${data.items.length} 件持有中`}
          </span>
        </div>

        <div className="sketch-vault-wrapper">
          {/* Scrollable Container (Default scrollbar hidden via CSS) */}
          <div
            className="sketch-vault-scroll"
            ref={scrollRef}
            onScroll={handleScroll}
          >
            {isPetMode ? (
              <div className="sketch-vault-grid" aria-label="寵物收藏列表">
                {data.pets.map((pet) => {
                  const isInCurrentTeam = activePartyIds.includes(pet.id);
                  return (
                    <button
                      className={`sketch-vault-token ${isInCurrentTeam ? 'is-selected' : ''}`}
                      key={pet.id}
                      style={{ '--pet-accent': pet.accent }}
                      onClick={() => setSelectedPet(pet)}
                    >
                      <NoxPlaceholder pet={pet} size="md" />
                      <strong>{pet.name}</strong>
                      <span>LV.{pet.level}</span>
                    </button>
                  );
                })}
                {Array.from({ length: Math.max(4, 12 - data.pets.length) }, (_, index) => (
                  <span className="sketch-vault-token is-empty" key={`empty-${index}`}>
                    <i>+</i>
                    <small>EMPTY</small>
                  </span>
                ))}
              </div>
            ) : (
              <div className="sketch-vault-grid" aria-label="裝備收藏列表">
                {data.items.map((item) => (
                  <button
                    className="sketch-vault-token sketch-vault-token--item"
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                  >
                    <ItemIllustration item={item} size="md" />
                    <strong>{item.name}</strong>
                    <span className="item-bonus-pill">{item.bonus}</span>
                  </button>
                ))}
                {Array.from({ length: Math.max(4, 8 - data.items.length) }, (_, index) => (
                  <span className="sketch-vault-token is-empty" key={`item-empty-${index}`}>
                    <i>+</i>
                    <small>EMPTY</small>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Custom Stylized Cyberpunk Scrollbar Rail (matching the hand-drawn sketch) */}
          <div className="sketch-custom-scrollbar" aria-hidden="true">
            <button className="sketch-scroll-arrow" onClick={() => handleScrollStep(-1)} tabIndex={-1}>
              <ChevronUp size={12} />
            </button>
            <div className="sketch-scroll-track">
              <div
                className="sketch-scroll-thumb"
                style={{
                  top: `${Math.min(84, Math.max(0, scrollProgress * 84))}%`,
                }}
              >
                <div className="sketch-thumb-grip" />
              </div>
            </div>
            <button className="sketch-scroll-arrow" onClick={() => handleScrollStep(1)} tabIndex={-1}>
              <ChevronDown size={12} />
            </button>
          </div>
        </div>
      </section>

      {/* Pet Detail View: FULL-SCREEN matching pet_detail_example.jpg (No nested modal frames!) */}
      {selectedPet && (
        <section
          className="sketch-fullscreen-detail sketch-fullscreen-detail--pet"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedPet.name} 詳情`}
          style={{ '--pet-accent': selectedPet.accent }}
        >
          {/* Top Title ("標題" centered as in sketch) + Close */}
          <header className="sketch-fs-topbar">
            <h1 className="sketch-fs-title">NOXCAT 檔案庫</h1>
            <button
              className="sketch-fs-close-btn"
              onClick={() => setSelectedPet(null)}
              aria-label="關閉"
            >
              <X size={22} />
            </button>
          </header>

          {/* Name Banner: "名字 >>" with angled trapezoidal cut */}
          <div className="sketch-fs-name-row">
            <div className="sketch-name-banner">
              <h2>{selectedPet.name}</h2>
              <span className="sketch-banner-chevron">&gt;&gt;</span>
            </div>
          </div>

          {/* Main Content Area: Stats on left, Speech Bubble & Art on right */}
          <div className="sketch-fs-main">
            {/* Left Stats Column */}
            <div className="sketch-fs-stats">
              {['hp', 'atk', 'def', 'spd'].map((key) => {
                const Icon = STAT_ICONS[key];
                const value = selectedPet[key];
                return (
                  <div className="sketch-stat-row" key={key}>
                    <div className="sketch-stat-label-wrap">
                      <span className="sketch-stat-label">
                        <Icon size={12} />
                        {key.toUpperCase()} :
                      </span>
                    </div>
                    <strong className="sketch-stat-val">{value}</strong>
                    <div className="sketch-stat-bar-track">
                      <div
                        className="sketch-stat-bar-fill"
                        style={{ width: `${Math.min(100, (value / 130) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Speech Bubble: "每隻獨一無二的幹話" with pointer tail pointing to character */}
            <div className="sketch-speech-bubble">
              <p>「{selectedPet.quote}」</p>
              <span className="sketch-bubble-tail" />
            </div>

            {/* Large Character Art on bottom right */}
            <div className="sketch-fs-character">
              <NoxPlaceholder pet={selectedPet} size="hero" />
            </div>

            {/* Special Skill and Description on bottom left */}
            <div className="sketch-fs-skill">
              <span className="sketch-fs-skill-title">特殊技能</span>
              <p className="sketch-fs-skill-desc">{selectedPet.skill}</p>
            </div>
          </div>

          {/* Bottom Action: Add to / Remove from active loadout */}
          <footer className="sketch-fs-footer">
            <button
              className={`sketch-fs-action-btn ${activePartyIds.includes(selectedPet.id) ? 'is-remove' : ''}`}
              onClick={() => handleToggle(selectedPet)}
            >
              {activePartyIds.includes(selectedPet.id) ? <X size={18} /> : <Check size={18} />}
              {activePartyIds.includes(selectedPet.id) ? `從編組 ${loadout} 移出` : `加入編組 ${loadout}`}
            </button>
          </footer>
        </section>
      )}

      {/* Weapon Detail View: FULL-SCREEN matching weapon_detail_example.jpg */}
      {selectedItem && (
        <section
          className="sketch-fullscreen-detail sketch-fullscreen-detail--weapon"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedItem.name} 詳情`}
        >
          {/* Top Title ("標題" centered as in sketch) + Close */}
          <header className="sketch-fs-topbar">
            <h1 className="sketch-fs-title">裝備與道具檔案</h1>
            <button
              className="sketch-fs-close-btn"
              onClick={() => {
                setSelectedItem(null);
                setEquipTargetPetId(null);
              }}
              aria-label="關閉"
            >
              <X size={22} />
            </button>
          </header>

          {/* Name Banner: "名字 >>" with cyan trapezoidal cut */}
          <div className="sketch-fs-name-row">
            <div className="sketch-name-banner sketch-name-banner--item">
              <h2>{selectedItem.name}</h2>
              <span className="sketch-banner-chevron">&gt;&gt;</span>
            </div>
          </div>

          {/* Main Content Area: Left Stats with dynamic "增加量", Right Bubble & Big Art */}
          <div className="sketch-fs-main">
            {/* Left Stats Column with accurate "增加量" annotation and dynamic bar calculation */}
            <div className="sketch-fs-stats sketch-fs-stats--weapon">
              {['hp', 'atk', 'def', 'spd'].map((key) => {
                const Icon = STAT_ICONS[key];
                const bonusVal = getItemBonus(selectedItem, key);
                const hasBonus = bonusVal > 0;
                const maxRef = key === 'hp' ? 30 : 5;
                const fillWidth = hasBonus ? Math.min(100, Math.max(25, (bonusVal / maxRef) * 100)) : 0;

                return (
                  <div className={`sketch-stat-row ${hasBonus ? 'is-boosted' : ''}`} key={key}>
                    <div className="sketch-stat-label-wrap">
                      <span className="sketch-stat-label">
                        <Icon size={12} />
                        {key.toUpperCase()} :
                      </span>
                      {/* Blue handwritten-style "增加量" callout matching sketch */}
                      {hasBonus && (
                        <span className="sketch-increase-callout">
                          增加量 ➔
                        </span>
                      )}
                    </div>
                    <strong className={`sketch-stat-val ${hasBonus ? 'text-[#35d9ff]' : 'text-[#56655c]'}`}>
                      {hasBonus ? `+${bonusVal}` : '+0'}
                    </strong>
                    <div className="sketch-stat-bar-track">
                      <div
                        className={`sketch-stat-bar-fill ${hasBonus ? 'is-bonus-fill' : ''}`}
                        style={{ width: `${fillWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Speech Bubble: "每隻獨一無二的幹話" with tail pointing to weapon */}
            <div className="sketch-speech-bubble sketch-speech-bubble--item">
              <p>「{selectedItem.quote || '只要砍得夠快，敵人就追不上。'}」</p>
              <span className="sketch-bubble-tail sketch-bubble-tail--item" />
            </div>

            {/* Big Weapon Art on bottom right */}
            <div className="sketch-fs-character sketch-fs-weapon-art">
              <ItemIllustration item={selectedItem} size="hero" />
            </div>

            {/* Special Effect & Description on bottom left */}
            <div className="sketch-fs-skill">
              <span className="sketch-fs-skill-title">特殊效果</span>
              <p className="sketch-fs-skill-desc">
                {selectedItem.skill || `${selectedItem.bonus}。裝備後於戰鬥中提供額外戰力支援。`}
              </p>
            </div>
          </div>

          {/* Bottom Action: Equip to Party Members */}
          <footer className="sketch-fs-footer sketch-fs-footer--weapon">
            <div className="sketch-equip-picker-line">
              <small>裝備給出戰隊友：</small>
              <div className="sketch-target-pets">
                {team.map((pet) => {
                  const isEquippedHere = pet.equipped === selectedItem.id;
                  const isSelected = equipTargetPetId === pet.id || (isEquippedHere && !equipTargetPetId);
                  return (
                    <button
                      key={pet.id}
                      className={`sketch-target-btn ${isSelected ? 'is-selected' : ''} ${isEquippedHere ? 'is-current' : ''}`}
                      onClick={() => setEquipTargetPetId(pet.id)}
                    >
                      <NoxPlaceholder pet={pet} size="sm" />
                      <span>{pet.name}</span>
                      {isEquippedHere && <small className="text-[#00ff66]">已裝備</small>}
                    </button>
                  );
                })}
              </div>
            </div>

            {team.length > 0 && (
              <button
                className="sketch-fs-action-btn sketch-fs-action-btn--weapon"
                onClick={() => {
                  const targetId = equipTargetPetId || team[0]?.id;
                  if (targetId) handleEquip(targetId, selectedItem.id);
                }}
              >
                <Sparkles size={16} />
                裝備 / 卸下切換
              </button>
            )}
          </footer>
        </section>
      )}
    </main>
  );
}
