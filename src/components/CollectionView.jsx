import React, { useMemo, useRef, useState } from 'react';
import {
  Cat,
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
import gemImg from '../assets/noxgem_128.png';

const STAT_ICONS = { hp: Shield, atk: Swords, def: Shield, spd: Zap };

// Custom cyber weapon illustration component
export function ItemIllustration({ item, size = 'lg' }) {
  const isBlade = item?.type === 'WEAPON' || item?.id?.includes('blade') || item?.name?.includes('劍');
  const isShield = item?.type === 'GEAR' || item?.id?.includes('shield') || item?.name?.includes('盾');
  const isHome = item?.type === 'TREASURE' || item?.id?.includes('home') || item?.name?.includes('寶石') || item?.name?.includes('水晶');

  if (size === 'sm') {
    return (
      <span className="sketch-mini-item-icon">
        {isBlade && <img src={swordImg} alt={item?.name || '劍'} className="w-3.5 h-3.5 object-contain pixelated" />}
        {isShield && <img src={shieldImg} alt={item?.name || '盾'} className="w-3.5 h-3.5 object-contain pixelated" />}
        {isHome && <img src={gemImg} alt={item?.name || '寶石'} className="w-3.5 h-3.5 object-contain pixelated" />}
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
        <img
          src={gemImg}
          alt={item?.name || '寶石'}
          className="item-img"
        />
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

  // Drag & drop state for both mouse and touch interactions
  const [draggingItem, setDraggingItem] = useState(null); // { type: 'pet'|'item', id: string, name?: string, sourceSlot?: number }
  const [dragOverSlot, setDragOverSlot] = useState(null); // 0 | 1 | 2 | 'vault' | null
  const [touchGhost, setTouchGhost] = useState(null); // { x, y, name, type }
  const touchInfoRef = useRef(null);

  // Loadout management: 5 tabs storing distinct 3-slot party line-ups
  const LOADOUTS_KEY = 'futuremode_party_loadouts_v3';
  const [loadout, setLoadout] = useState(1);
  const [loadouts, setLoadouts] = useState(() => {
    try {
      const saved = localStorage.getItem(LOADOUTS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    try {
      const savedV2 = localStorage.getItem('futuremode_party_loadouts_v2');
      if (savedV2) {
        const parsed = JSON.parse(savedV2);
        const normalized = {};
        for (const k of [1, 2, 3, 4, 5]) {
          const arr = parsed[k] || [];
          normalized[k] = [arr[0] || null, arr[1] || null, arr[2] || null];
        }
        return normalized;
      }
    } catch (e) {}
    const pIds = data.pets.map((p) => p.id);
    const selectedIds = data.pets.filter((p) => p.selected).map((p) => p.id);
    return {
      1: [selectedIds[0] || pIds[0] || null, selectedIds[1] || pIds[1] || null, selectedIds[2] || pIds[2] || null],
      2: [pIds[0] || null, pIds[1] || null, null],
      3: [pIds[0] || null, null, pIds[2] || null],
      4: [pIds[0] || null, pIds[3] || null, null],
      5: [pIds[0] || null, null, null],
    };
  });

  const saveLoadouts = (next) => {
    setLoadouts(next);
    try {
      localStorage.setItem(LOADOUTS_KEY, JSON.stringify(next));
    } catch (e) {}
  };

  // Fixed 3 slot array [slot0, slot1, slot2]
  const currentSlots = useMemo(() => {
    const raw = loadouts[loadout] || [];
    return [raw[0] || null, raw[1] || null, raw[2] || null];
  }, [loadouts, loadout]);

  const activePartyIds = useMemo(() => currentSlots.filter(Boolean), [currentSlots]);

  const team = useMemo(() => {
    return currentSlots.map((id) => (id ? data.pets.find((p) => p.id === id) || null : null));
  }, [currentSlots, data.pets]);

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

  // Sync loadout 1 to backend demo API
  const syncBackendParty = async (slots) => {
    if (!onToggleParty) return;
    const targetSelectedIds = new Set(slots.filter(Boolean));
    for (const p of data.pets) {
      const isSelected = Boolean(p.selected);
      const shouldSelect = targetSelectedIds.has(p.id);
      if (isSelected !== shouldSelect) {
        try {
          await onToggleParty(p.id);
        } catch (e) {}
      }
    }
  };

  // Assign pet into specific slot (handles moving, swapping, and deploying)
  const handleAssignPetToSlot = async (petId, targetIndex) => {
    const pet = data.pets.find((p) => p.id === petId);
    if (!pet) return;

    const nextSlots = [...currentSlots];
    const existingIndex = nextSlots.findIndex((id) => id === petId);

    if (existingIndex !== -1 && existingIndex !== targetIndex) {
      // Swapping positions
      const prevTarget = nextSlots[targetIndex];
      nextSlots[existingIndex] = prevTarget;
      nextSlots[targetIndex] = petId;
      onMessage(`已將 ${pet.name} 與第 ${existingIndex + 1} 位對調至第 ${targetIndex + 1} 位！`);
    } else if (existingIndex === targetIndex) {
      return;
    } else {
      nextSlots[targetIndex] = petId;
      onMessage(`${pet.name} 已指派至出戰位置 ${targetIndex + 1}！`);
    }

    const nextLoadouts = { ...loadouts, [loadout]: nextSlots };
    saveLoadouts(nextLoadouts);

    if (loadout === 1) {
      syncBackendParty(nextSlots);
    }
  };

  // Remove pet from a specific slot
  const handleRemovePetFromSlot = async (slotIndex) => {
    const petId = currentSlots[slotIndex];
    if (!petId) return;
    const pet = data.pets.find((p) => p.id === petId);
    const nextSlots = [...currentSlots];
    nextSlots[slotIndex] = null;
    const nextLoadouts = { ...loadouts, [loadout]: nextSlots };
    saveLoadouts(nextLoadouts);
    if (pet) {
      onMessage(`${pet.name} 已從出戰編組 ${loadout} 移出`);
    }
    if (loadout === 1) {
      syncBackendParty(nextSlots);
    }
  };

  // Equip item to the pet in target slot
  const handleEquipToSlot = async (itemId, targetIndex) => {
    const pet = team[targetIndex];
    const item = data.items.find((i) => i.id === itemId);
    if (!pet) {
      onMessage(`第 ${targetIndex + 1} 號位尚無出戰寵物，無法裝備武器`, 'error');
      return;
    }
    if (!item) return;

    await handleEquip(pet.id, item.id);
  };

  const handleEquip = async (petId, itemId) => {
    if (!onEquipItem) return;
    try {
      await onEquipItem(petId, itemId);
      const pet = data.pets.find((p) => p.id === petId);
      const item = data.items.find((i) => i.id === itemId);
      onMessage(pet?.equipped === itemId ? `已卸下 ${item?.name}` : `已將 ${item?.name} 裝備給 ${pet?.name}`);
      setSelectedItem(null);
    } catch (error) {
      onMessage(error.message, 'error');
    }
  };

  // Desktop Drag & Drop Handlers
  const handleDragStart = (e, info) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(info));
    e.dataTransfer.effectAllowed = 'copyMove';
    setDraggingItem(info);
  };

  const handleDragEnd = () => {
    setDraggingItem(null);
    setDragOverSlot(null);
  };

  const handleSlotDragOver = (e, slotIndex) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (dragOverSlot !== slotIndex) {
      setDragOverSlot(slotIndex);
    }
  };

  const handleSlotDrop = (e, slotIndex) => {
    e.preventDefault();
    let info = draggingItem;
    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (raw) info = JSON.parse(raw);
    } catch (err) {}

    if (!info) return;

    if (info.type === 'pet') {
      handleAssignPetToSlot(info.id, slotIndex);
    } else if (info.type === 'item') {
      handleEquipToSlot(info.id, slotIndex);
    }

    setDraggingItem(null);
    setDragOverSlot(null);
  };

  const handleVaultDragOver = (e) => {
    if (draggingItem?.sourceSlot !== undefined) {
      e.preventDefault();
      setDragOverSlot('vault');
    }
  };

  const handleVaultDrop = (e) => {
    e.preventDefault();
    if (draggingItem?.sourceSlot !== undefined) {
      if (draggingItem.type === 'pet') {
        handleRemovePetFromSlot(draggingItem.sourceSlot);
      } else if (draggingItem.type === 'item') {
        const pet = team[draggingItem.sourceSlot];
        if (pet && pet.equipped === draggingItem.id) {
          handleEquip(pet.id, draggingItem.id);
        }
      }
    }
    setDraggingItem(null);
    setDragOverSlot(null);
  };

  // Mobile / Touch Drag Handlers
  const handleTouchStart = (e, info) => {
    const touch = e.touches[0];
    touchInfoRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      info,
      isDragging: false,
    };
  };

  const handleTouchMove = (e) => {
    if (!touchInfoRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchInfoRef.current.startX;
    const dy = touch.clientY - touchInfoRef.current.startY;
    const dist = Math.hypot(dx, dy);

    if (dist > 14) {
      touchInfoRef.current.isDragging = true;
      setDraggingItem(touchInfoRef.current.info);
      setTouchGhost({
        x: touch.clientX,
        y: touch.clientY,
        name: touchInfoRef.current.info.name || '',
        type: touchInfoRef.current.info.type,
      });

      const elem = document.elementFromPoint(touch.clientX, touch.clientY);
      const slotElem = elem?.closest('[data-slot-idx]');
      if (slotElem) {
        const sIdx = parseInt(slotElem.getAttribute('data-slot-idx'), 10);
        setDragOverSlot(sIdx);
      } else if (elem?.closest('[data-vault-zone]')) {
        setDragOverSlot('vault');
      } else {
        setDragOverSlot(null);
      }
    }
  };

  const handleTouchEnd = () => {
    if (touchInfoRef.current?.isDragging) {
      const { info } = touchInfoRef.current;
      if (typeof dragOverSlot === 'number') {
        if (info.type === 'pet') {
          handleAssignPetToSlot(info.id, dragOverSlot);
        } else if (info.type === 'item') {
          handleEquipToSlot(info.id, dragOverSlot);
        }
      } else if (dragOverSlot === 'vault' && info.sourceSlot !== undefined) {
        if (info.type === 'pet') {
          handleRemovePetFromSlot(info.sourceSlot);
        } else if (info.type === 'item') {
          const pet = team[info.sourceSlot];
          if (pet && pet.equipped === info.id) {
            handleEquip(pet.id, info.id);
          }
        }
      }
    }
    touchInfoRef.current = null;
    setTouchGhost(null);
    setDraggingItem(null);
    setDragOverSlot(null);
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
        <div className="sketch-drag-hint">
          {isPetMode ? '💡 拖曳下方寵物至上方位置出戰（拖回下方即可移出）' : '💡 拖曳下方武器至出戰隊員進行裝備'}
        </div>

        <div className="sketch-loadout__slots-grid">
          {[0, 1, 2].map((slot) => {
            const pet = team[slot];
            const item = data.items.find((entry) => entry.id === pet?.equipped);
            const isSlotDragOver = dragOverSlot === slot;

            return (
              <div
                className={`sketch-loadout__slot ${draggingItem ? 'is-drop-target' : ''} ${isSlotDragOver ? 'is-drag-over' : ''}`}
                key={`slot-${slot}`}
                data-slot-idx={slot}
                onDragOver={(e) => handleSlotDragOver(e, slot)}
                onDragLeave={() => {
                  if (dragOverSlot === slot) setDragOverSlot(null);
                }}
                onDrop={(e) => handleSlotDrop(e, slot)}
              >
                {/* Subtle remove button for pet in pet mode */}
                {isPetMode && pet && (
                  <button
                    type="button"
                    className="sketch-slot-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemovePetFromSlot(slot);
                    }}
                    title={`將 ${pet.name} 移出出戰位置`}
                    aria-label={`將 ${pet.name} 移出出戰位置`}
                  >
                    <X size={12} />
                  </button>
                )}

                {/* Subtle unequip button for weapon in weapon mode */}
                {!isPetMode && item && (
                  <button
                    type="button"
                    className="sketch-slot-remove-btn"
                    style={{ borderColor: '#35d9ff', color: '#35d9ff' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (pet) handleEquip(pet.id, item.id);
                    }}
                    title={`卸下 ${item.name}`}
                    aria-label={`卸下 ${item.name}`}
                  >
                    <X size={12} />
                  </button>
                )}

                {/* Pet Circle Node (morphs between primary large circle & secondary small badge) */}
                <button
                  type="button"
                  className={`slot-morph-node slot-morph-node--pet ${isPetMode ? 'is-primary' : 'is-secondary'} ${pet ? 'is-filled' : 'is-empty'}`}
                  style={{ '--pet-accent': pet?.accent || '#38433c' }}
                  draggable={Boolean(pet)}
                  onDragStart={(e) => pet && handleDragStart(e, { type: 'pet', id: pet.id, name: pet.name, sourceSlot: slot })}
                  onDragEnd={handleDragEnd}
                  onTouchStart={(e) => pet && handleTouchStart(e, { type: 'pet', id: pet.id, name: pet.name, sourceSlot: slot })}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onClick={() => {
                    if (pet) setSelectedPet(pet);
                    else onMessage('請從下方拖曳 NOXCAT 至此放置出戰！');
                  }}
                  aria-label={pet ? `查看 ${pet.name}（可拖曳對調）` : `出戰位置 ${slot + 1} 空白`}
                >
                  {isPetMode ? (
                    <>
                      {pet ? (
                        <NoxPlaceholder pet={pet} size="md" />
                      ) : (
                        <div className="sketch-slot-empty-plus">+</div>
                      )}
                      <span className="sketch-slot-idx">{slot + 1}</span>
                    </>
                  ) : (
                    <Cat size={14} />
                  )}
                </button>

                {/* Weapon Circle Node (morphs between secondary small badge & primary large circle) */}
                <button
                  type="button"
                  className={`slot-morph-node slot-morph-node--weapon ${!isPetMode ? 'is-primary' : 'is-secondary'} ${item ? 'is-filled' : 'is-empty'}`}
                  draggable={Boolean(item)}
                  onDragStart={(e) => item && handleDragStart(e, { type: 'item', id: item.id, name: item.name, sourceSlot: slot })}
                  onDragEnd={handleDragEnd}
                  onTouchStart={(e) => item && handleTouchStart(e, { type: 'item', id: item.id, name: item.name, sourceSlot: slot })}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onClick={() => {
                    if (item) setSelectedItem(item);
                    else if (isPetMode) setTab('items');
                    else onMessage(pet ? `請從下方拖曳裝備至此為 ${pet.name} 裝備！` : '請先配置出戰寵物再裝備武器');
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
                          <small>{pet ? '拖曳裝備' : '未裝備'}</small>
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
      <section
        className={`sketch-vault-section ${draggingItem?.sourceSlot !== undefined ? 'is-drop-target' : ''}`}
        data-vault-zone="true"
        onDragOver={handleVaultDragOver}
        onDragLeave={() => {
          if (dragOverSlot === 'vault') setDragOverSlot(null);
        }}
        onDrop={handleVaultDrop}
      >
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
                  const isDragging = draggingItem?.id === pet.id;
                  return (
                    <button
                      type="button"
                      className={`sketch-vault-token ${isInCurrentTeam ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
                      key={pet.id}
                      style={{ '--pet-accent': pet.accent }}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, { type: 'pet', id: pet.id, name: pet.name })}
                      onDragEnd={handleDragEnd}
                      onTouchStart={(e) => handleTouchStart(e, { type: 'pet', id: pet.id, name: pet.name })}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onClick={() => setSelectedPet(pet)}
                      title="點擊查看檔案，或直接拖曳至上方配置出戰"
                    >
                      <NoxPlaceholder pet={pet} size="md" />
                      <strong>{pet.name}</strong>
                      <span>{isInCurrentTeam ? '出戰中' : `LV.${pet.level}`}</span>
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
                {data.items.map((item) => {
                  const isEquippedAnywhere = data.pets.some((p) => p.equipped === item.id);
                  const isDragging = draggingItem?.id === item.id;
                  return (
                    <button
                      type="button"
                      className={`sketch-vault-token sketch-vault-token--item ${isEquippedAnywhere ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
                      key={item.id}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, { type: 'item', id: item.id, name: item.name })}
                      onDragEnd={handleDragEnd}
                      onTouchStart={(e) => handleTouchStart(e, { type: 'item', id: item.id, name: item.name })}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onClick={() => setSelectedItem(item)}
                      title="點擊查看檔案，或直接拖曳至上方隊員進行裝備"
                    >
                      <ItemIllustration item={item} size="md" />
                      <strong>{item.name}</strong>
                      <span className="item-bonus-pill">{item.bonus}</span>
                    </button>
                  );
                })}
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

      {/* Pet Detail View: FULL-SCREEN matching pet_detail_example.jpg (Clean without bottom buttons!) */}
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
        </section>
      )}

      {/* Weapon Detail View: FULL-SCREEN matching weapon_detail_example.jpg (Clean without bottom buttons!) */}
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
              onClick={() => setSelectedItem(null)}
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
        </section>
      )}

      {/* Floating touch drag avatar */}
      {touchGhost && (
        <div
          className={`sketch-touch-ghost ${touchGhost.type === 'item' ? 'sketch-touch-ghost--item' : ''}`}
          style={{ left: `${touchGhost.x}px`, top: `${touchGhost.y}px` }}
        >
          {touchGhost.name || (touchGhost.type === 'item' ? '裝備' : 'NOX')}
        </div>
      )}
    </main>
  );
}
