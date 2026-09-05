import React, { useMemo, useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  Cat,
  Gem,
  Plus,
  Shield,
  Sparkles,
  Swords,
  X,
  Zap,
} from 'lucide-react';
import NoxPlaceholder from './NoxPlaceholder.jsx';
import BrandLockup from './BrandLockup.jsx';
import swordImg from '../assets/sword_128.png';
import shieldImg from '../assets/shield_128.png';
import gemImg from '../assets/noxgem_128.png';
import {
  getStoredLoadouts,
  saveStoredLoadouts,
  getActiveLoadoutIndex,
  setActiveLoadoutIndex,
} from '../utils/teamStorage.js';

const STAT_ICONS = { hp: Shield, atk: Swords, def: Shield, spd: Zap };

// Stat bar bounds: leftmost is 0, rightmost is 333 HP, 33 ATK, 6 DEF, 333% SPD
const STAT_MAX_LIMITS = {
  hp: 333,
  atk: 33,
  def: 6,
  spd: 333,
};

// Custom cyber weapon illustration component
export function ItemIllustration({ item, size = 'lg' }) {
  const isBlade = item?.type === 'WEAPON' || item?.id?.includes('blade') || item?.name?.includes('劍');
  const isShield = item?.type === 'GEAR' || item?.id?.includes('shield') || item?.name?.includes('盾');
  const isHome = item?.type === 'TREASURE' || item?.id?.includes('home') || item?.name?.includes('寶石') || item?.name?.includes('水晶');

  if (size === 'sm') {
    return (
      <span className="sketch-mini-item-icon">
        {isBlade && <img src={swordImg} alt={item?.name || '劍'} className="w-5 h-5 object-contain pixelated" />}
        {isShield && <img src={shieldImg} alt={item?.name || '盾'} className="w-5 h-5 object-contain pixelated" />}
        {isHome && <img src={gemImg} alt={item?.name || '寶石'} className="w-5 h-5 object-contain pixelated" />}
        {!isBlade && !isShield && !isHome && <Gem size={18} />}
      </span>
    );
  }

  if (size === 'slot') {
    return (
      <div className="sketch-slot-weapon-fill">
        {isBlade && <img src={swordImg} alt={item?.name || '劍'} className="sketch-slot-weapon-full-img pixelated" />}
        {isShield && <img src={shieldImg} alt={item?.name || '盾'} className="sketch-slot-weapon-full-img pixelated" />}
        {isHome && <img src={gemImg} alt={item?.name || '寶石'} className="sketch-slot-weapon-full-img pixelated" />}
        {!isBlade && !isShield && !isHome && <Gem size={52} className="text-[#35d9ff]" />}
      </div>
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
          <Gem size={46} />
        </div>
      )}
      <span className="cyber-item-art__code">{item?.rarity || 'RELIC'}</span>
    </div>
  );
}

/**
 * Speech Bubble with Automatic Collision Avoidance:
 * Sits directly on top of the character's head by default.
 * If colliding with the stats bar on the left, automatically shifts right
 * and constrains width to become taller & narrower ("如果疊到就稍微向右+變高變窄").
 */
function DetailSpeechBubble({ statsRef, containerRef, quote, isWeapon = false }) {
  const bubbleRef = useRef(null);
  const [avoidance, setAvoidance] = useState({ shifted: false, shiftX: 0, maxWidth: null, tailOffsetX: 0 });
  const avoidanceRef = useRef(avoidance);
  avoidanceRef.current = avoidance;

  useLayoutEffect(() => {
    let animId = null;
    const timers = [];

    const checkCollision = () => {
      if (!statsRef.current || !bubbleRef.current || !containerRef.current) return;

      const statsEl = statsRef.current;
      const bubbleEl = bubbleRef.current;
      const contEl = containerRef.current;

      const bubbleRect = bubbleEl.getBoundingClientRect();
      const contRect = contEl.getBoundingClientRect();
      const currentShift = avoidanceRef.current.shifted ? avoidanceRef.current.shiftX : 0;
      const unshiftedLeft = bubbleRect.left - currentShift;
      const unshiftedRight = bubbleRect.right - currentShift;

      // Generous safety margin between outer speech box border/glow and any stat row/value/bar
      const safetyMargin = 18;

      let maxOverlapX = 0;
      let worstRowRight = 0;

      // Check each individual stat row and skill card in the left column
      const rows = statsEl.querySelectorAll('.sketch-stat-row, .sketch-fs-skill');
      rows.forEach((row) => {
        const rowRect = row.getBoundingClientRect();
        // Check if the outer bubble box overlaps vertically with this element (with 6px buffer)
        const verticalOverlap =
          bubbleRect.bottom >= rowRect.top - 6 && bubbleRect.top <= rowRect.bottom + 6;

        if (verticalOverlap) {
          const overlap = rowRect.right + safetyMargin - unshiftedLeft;
          if (overlap > maxOverlapX) {
            maxOverlapX = overlap;
            worstRowRight = rowRect.right;
          }
        }
      });

      // Also check against overall stats container bounds
      const statsRect = statsEl.getBoundingClientRect();
      const contVerticalOverlap =
        bubbleRect.bottom >= statsRect.top - 6 && bubbleRect.top <= statsRect.bottom + 6;
      if (contVerticalOverlap) {
        const contOverlap = statsRect.right + safetyMargin - unshiftedLeft;
        if (contOverlap > maxOverlapX) {
          maxOverlapX = contOverlap;
          worstRowRight = Math.max(worstRowRight, statsRect.right);
        }
      }

      if (maxOverlapX > 0) {
        // ENTIRE BOX overlaps or is too close!
        // Shift right so the bubble's left outer edge clears all stat elements
        const maxAllowedLeft = worstRowRight + safetyMargin;
        const availableWidth = contRect.right - maxAllowedLeft - 10;
        
        // Target maxWidth: narrower so text wraps to 3~4 lines (taller and narrower)
        const targetMaxWidth = Math.max(115, Math.min(150, availableWidth));
        const shiftX = Math.max(12, Math.min(maxOverlapX + 4, contRect.right - unshiftedRight - 8));

        const next = {
          shifted: true,
          shiftX,
          maxWidth: `${Math.round(targetMaxWidth)}px`,
          tailOffsetX: -Math.round(shiftX * 0.76),
        };

        if (
          !avoidanceRef.current.shifted ||
          Math.abs(avoidanceRef.current.shiftX - shiftX) > 2 ||
          avoidanceRef.current.maxWidth !== next.maxWidth
        ) {
          setAvoidance(next);
        }
      } else {
        if (avoidanceRef.current.shifted) {
          setAvoidance({ shifted: false, shiftX: 0, maxWidth: null, tailOffsetX: 0 });
        }
      }
    };

    checkCollision();
    animId = requestAnimationFrame(checkCollision);
    timers.push(setTimeout(checkCollision, 50));
    timers.push(setTimeout(checkCollision, 120));
    timers.push(setTimeout(checkCollision, 260)); // after fullDetailIn 220ms animation
    timers.push(setTimeout(checkCollision, 450));

    window.addEventListener('resize', checkCollision);

    let resizeObs = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(() => checkCollision());
      if (containerRef.current) resizeObs.observe(containerRef.current);
      if (statsRef.current) resizeObs.observe(statsRef.current);
    }

    return () => {
      cancelAnimationFrame(animId);
      timers.forEach((t) => clearTimeout(t));
      window.removeEventListener('resize', checkCollision);
      if (resizeObs) resizeObs.disconnect();
    };
  }, [quote, statsRef, containerRef]);

  return (
    <div
      ref={bubbleRef}
      className={`sketch-speech-bubble ${isWeapon ? 'sketch-speech-bubble--item' : ''} ${avoidance.shifted ? 'is-avoiding' : ''}`}
      style={{
        ...(avoidance.shifted
          ? {
              transform: `translateX(${avoidance.shiftX}px)`,
              maxWidth: avoidance.maxWidth,
            }
          : {}),
      }}
    >
      <p>「{quote}」</p>
      <span
        className={`sketch-bubble-tail ${isWeapon ? 'sketch-bubble-tail--item' : ''}`}
        style={{
          ...(avoidance.shifted && avoidance.tailOffsetX
            ? {
                transform: `translateX(calc(-50% + ${avoidance.tailOffsetX}px))`,
              }
            : {}),
        }}
      />
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
  const petStatsRef = useRef(null);
  const petMainRef = useRef(null);
  const weaponStatsRef = useRef(null);
  const weaponMainRef = useRef(null);

  // Loadout management: 5 tabs storing distinct 3-slot party line-ups
  const [loadout, setLoadout] = useState(() => getActiveLoadoutIndex());
  const [loadouts, setLoadouts] = useState(() => getStoredLoadouts(data.pets));

  const saveLoadouts = (next) => {
    setLoadouts(next);
    saveStoredLoadouts(next);
  };

  const handleSelectLoadout = (number) => {
    setLoadout(number);
    setActiveLoadoutIndex(number);
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

  // Precompute equipped item IDs for O(1) checks (prevents lag/crashing with hundreds of items)
  const equippedItemIds = useMemo(() => {
    const set = new Set();
    (data.pets || []).forEach((p) => {
      if (p && p.equipped) set.add(p.equipped);
    });
    return set;
  }, [data.pets]);

  // Custom scrollbar & wheel isolation state
  const scrollRef = useRef(null);
  const vaultWrapperRef = useRef(null);
  const FIXED_THUMB_HEIGHT = 44; // Fixed height in px matching hand-drawn sketch proportions
  const trackRef = useRef(null);
  const [thumbMetrics, setThumbMetrics] = useState({ topPx: 0, isScrollable: true, progress: 0 });
  const [isDraggingThumb, setIsDraggingThumb] = useState(false);
  const dragStartYRef = useRef(0);
  const dragStartScrollTopRef = useRef(0);

  const updateScrollMetrics = useCallback(() => {
    if (!scrollRef.current || !trackRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const trackHeight = trackRef.current.clientHeight;
    const maxScroll = scrollHeight - clientHeight;
    const maxTravel = Math.max(0, trackHeight - FIXED_THUMB_HEIGHT);

    const progress = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;
    const topPx = progress * maxTravel;
    const isScrollable = maxScroll > 0 && maxTravel > 0;
    setThumbMetrics({ topPx, isScrollable, progress });
  }, []);

  const handleScroll = () => {
    updateScrollMetrics();
  };

  // Recalculate metrics when tab, items change, or viewport resizes
  useEffect(() => {
    updateScrollMetrics();
    const id = setTimeout(updateScrollMetrics, 50);
    window.addEventListener('resize', updateScrollMetrics);

    let ro;
    if (scrollRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateScrollMetrics);
      ro.observe(scrollRef.current);
    }

    return () => {
      clearTimeout(id);
      window.removeEventListener('resize', updateScrollMetrics);
      if (ro) ro.disconnect();
    };
  }, [tab, data.pets?.length, data.items?.length, updateScrollMetrics]);

  // Isolate wheel scrolling to vault container: prevent outer webpage from scrolling up and down
  useEffect(() => {
    const wrapper = vaultWrapperRef.current;
    if (!wrapper) return;

    const onWheel = (e) => {
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      // Stop the webpage from scrolling up and down when mouse wheel is on vault or sidebar
      e.preventDefault();
      e.stopPropagation();
      scrollEl.scrollTop += e.deltaY;
    };

    wrapper.addEventListener('wheel', onWheel, { passive: false });
    return () => wrapper.removeEventListener('wheel', onWheel);
  }, []);

  // Thumb dragging with mouse and touch
  const handleThumbMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingThumb(true);
    dragStartYRef.current = e.clientY;
    dragStartScrollTopRef.current = scrollRef.current ? scrollRef.current.scrollTop : 0;
  };

  const handleThumbTouchStart = (e) => {
    e.stopPropagation();
    const touch = e.touches[0];
    dragStartYRef.current = touch.clientY;
    dragStartScrollTopRef.current = scrollRef.current ? scrollRef.current.scrollTop : 0;
    setIsDraggingThumb(true);
  };

  useEffect(() => {
    if (!isDraggingThumb) return;

    const handleMove = (clientY) => {
      if (!scrollRef.current || !trackRef.current) return;
      const deltaY = clientY - dragStartYRef.current;
      const trackHeight = trackRef.current.clientHeight;
      const { scrollHeight, clientHeight } = scrollRef.current;
      const maxScroll = scrollHeight - clientHeight;
      const maxTravel = trackHeight - FIXED_THUMB_HEIGHT;
      if (maxScroll <= 0 || maxTravel <= 0) return;

      // Variable sensitivity: deltaY maps to content scroll proportional to maxTravel
      const scrollRatio = deltaY / maxTravel;
      scrollRef.current.scrollTop = dragStartScrollTopRef.current + scrollRatio * maxScroll;
    };

    const onMouseMove = (e) => handleMove(e.clientY);
    const onMouseUp = () => setIsDraggingThumb(false);
    const onTouchMove = (e) => {
      if (e.touches && e.touches[0]) {
        e.preventDefault();
        handleMove(e.touches[0].clientY);
      }
    };
    const onTouchEnd = () => setIsDraggingThumb(false);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDraggingThumb]);

  // Clicking on track jumps to position
  const handleTrackClick = (e) => {
    if (e.target.closest('.sketch-scroll-thumb')) return;
    if (!scrollRef.current || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const trackHeight = trackRef.current.clientHeight;
    const maxTravel = trackHeight - FIXED_THUMB_HEIGHT;
    const { scrollHeight, clientHeight } = scrollRef.current;
    const maxScroll = scrollHeight - clientHeight;
    if (maxTravel <= 0 || maxScroll <= 0) return;

    const targetThumbTop = Math.max(0, Math.min(maxTravel, clickY - FIXED_THUMB_HEIGHT / 2));
    const ratio = targetThumbTop / maxTravel;
    scrollRef.current.scrollTo({ top: ratio * maxScroll, behavior: 'smooth' });
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
    } else if (existingIndex === targetIndex) {
      return;
    } else {
      nextSlots[targetIndex] = petId;
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
    const nextSlots = [...currentSlots];
    nextSlots[slotIndex] = null;
    const nextLoadouts = { ...loadouts, [loadout]: nextSlots };
    saveLoadouts(nextLoadouts);
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
    <main className="feature-screen sketch-collection">
      <header className="sketch-collection-brandbar">
        <BrandLockup compact />
      </header>
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
                onClick={() => handleSelectLoadout(number)}
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
        </div>

        <div className="sketch-loadout__slots-grid">
          {[0, 1, 2].map((slot) => {
            const pet = team[slot];
            const item = data.items.find((entry) => entry.id === pet?.equipped);
            const isSlotDragOver = dragOverSlot === slot;
            const slotName = isPetMode ? (pet ? pet.name : '未配置') : (item ? item.name : (pet ? '未裝備' : '空位'));

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
                {/* Solid tactile corner number matching hand-drawn sketch (No circular frame!) */}
                <span className="sketch-slot-idx">{slot + 1}</span>

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
                    style={{ '--remove-accent': '#35d9ff', color: '#35d9ff' }}
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
                    </>
                  ) : (
                    pet ? (
                      <NoxPlaceholder pet={pet} size="sm" />
                    ) : (
                      <Cat size={18} strokeWidth={2.4} />
                    )
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
                        <ItemIllustration item={item} size="slot" />
                      ) : (
                        <div className="sketch-slot-empty-weapon">
                          <Plus size={22} />
                        </div>
                      )}
                    </>
                  ) : (
                    <>{item ? <ItemIllustration item={item} size="sm" /> : <Plus size={12} />}</>
                  )}
                </button>

                {/* Name displayed outside the circle frame */}
                <div
                  className={`sketch-slot-name-tag ${(isPetMode ? !pet : !item) ? 'is-empty' : ''}`}
                  title={slotName}
                >
                  {slotName}
                </div>
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
        <div className="sketch-vault-wrapper" ref={vaultWrapperRef}>
          {/* Scrollable Container (Default scrollbar hidden via CSS, wheel isolated) */}
          <div
            className="sketch-vault-scroll"
            ref={scrollRef}
            onScroll={handleScroll}
          >
            {isPetMode ? (
              <div className="sketch-vault-grid" aria-label="寵物收藏列表">
                {(data.pets || []).map((pet, index) => {
                  const isInCurrentTeam = activePartyIds.includes(pet.id);
                  const isDragging = draggingItem?.id === pet.id;
                  return (
                    <button
                      type="button"
                      className={`sketch-vault-token ${isInCurrentTeam ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
                      key={pet.id || `pet-${index}`}
                      style={{ '--pet-accent': pet.accent }}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, { type: 'pet', id: pet.id, name: pet.name })}
                      onDragEnd={handleDragEnd}
                      onTouchStart={(e) => handleTouchStart(e, { type: 'pet', id: pet.id, name: pet.name })}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onClick={() => setSelectedPet(pet)}
                      title="查看詳情"
                    >
                      <NoxPlaceholder pet={pet} size="md" />
                      <strong>{pet.name}</strong>
                      <span>{isInCurrentTeam ? '出戰中' : `LV.${pet.level}`}</span>
                    </button>
                  );
                })}
                {Array.from(
                  { length: (4 - ((data.pets || []).length % 4)) % 4 + 4 },
                  (_, index) => (
                    <div
                      className="sketch-vault-token is-empty"
                      key={`empty-${index}`}
                      aria-hidden="true"
                    >
                      <div className="sketch-vault-empty-circle">
                        <i>+</i>
                        <small>EMPTY</small>
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="sketch-vault-grid" aria-label="裝備收藏列表">
                {(data.items || []).map((item, index) => {
                  const isEquippedAnywhere = equippedItemIds.has(item.id);
                  const isDragging = draggingItem?.id === item.id;
                  return (
                    <button
                      type="button"
                      className={`sketch-vault-token sketch-vault-token--item ${isEquippedAnywhere ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
                      key={item.id || `item-${index}`}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, { type: 'item', id: item.id, name: item.name })}
                      onDragEnd={handleDragEnd}
                      onTouchStart={(e) => handleTouchStart(e, { type: 'item', id: item.id, name: item.name })}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onClick={() => setSelectedItem(item)}
                      title="查看詳情"
                    >
                      <ItemIllustration item={item} size="md" />
                      <strong>{item.name}</strong>
                      <span className="item-bonus-pill">{item.bonus}</span>
                    </button>
                  );
                })}
                {Array.from(
                  { length: (4 - ((data.items || []).length % 4)) % 4 + 4 },
                  (_, index) => (
                    <div
                      className="sketch-vault-token is-empty"
                      key={`item-empty-${index}`}
                      aria-hidden="true"
                    >
                      <div className="sketch-vault-empty-circle">
                        <i>+</i>
                        <small>EMPTY</small>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* Hand-drawn rail: fixed-size draggable thumb with center vertical accent line matching pet_screen_example.jpg */}
          <div className="sketch-custom-scrollbar" aria-hidden="true">
            <div className="sketch-scroll-track" ref={trackRef} onClick={handleTrackClick}>
              <div
                className={`sketch-scroll-thumb ${isDraggingThumb ? 'is-dragging' : ''} ${!thumbMetrics.isScrollable ? 'is-static' : ''}`}
                style={{
                  height: `${FIXED_THUMB_HEIGHT}px`,
                  transform: `translateY(${thumbMetrics.topPx}px)`,
                }}
                onMouseDown={handleThumbMouseDown}
                onTouchStart={handleThumbTouchStart}
              >
                <div className="sketch-thumb-line" />
              </div>
            </div>
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
          ref={petMainRef}
        >
          {/* Top Title ("標題" centered as in sketch) + Close */}
          <header className="sketch-fs-topbar">
            <BrandLockup className="sketch-fs-brand" compact />
            <button
              className="sketch-fs-close-btn"
              onClick={() => setSelectedPet(null)}
              aria-label="關閉"
              autoFocus
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
            {/* Left Column: Stats on top, Special Skill on bottom */}
            <div className="sketch-fs-left-col" ref={petStatsRef}>
              <div className="sketch-fs-stats">
                {['hp', 'atk', 'def', 'spd'].map((key) => {
                  const Icon = STAT_ICONS[key];
                  const value = selectedPet[key];
                  const maxRef = STAT_MAX_LIMITS[key] || 100;
                  const barWidth = Math.min(100, Math.max(0, (value / maxRef) * 100));
                  const displayVal = key === 'spd' ? `${value}%` : value;

                  return (
                    <div className="sketch-stat-row" key={key}>
                      <div className="sketch-stat-label-wrap">
                        <span className="sketch-stat-label">
                          <Icon size={12} />
                          {key.toUpperCase()} :
                        </span>
                      </div>
                      <strong className="sketch-stat-val">{displayVal}</strong>
                      <div className="sketch-stat-bar-track">
                        <div
                          className="sketch-stat-bar-fill"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Special Skill card on bottom left */}
              <div className="sketch-fs-skill">
                <span className="sketch-fs-skill-title">Special:</span>
                <p className="sketch-fs-skill-desc">{selectedPet.skill}</p>
              </div>
            </div>

            {/* Right Hero Column: Speech Bubble directly above Character Art */}
            <div className="sketch-fs-hero-col">
              <DetailSpeechBubble
                statsRef={petStatsRef}
                containerRef={petMainRef}
                quote={selectedPet.quote}
              />

              {/* Large Character Art */}
              <div className="sketch-fs-character">
                <NoxPlaceholder pet={selectedPet} size="hero" />
              </div>
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
          ref={weaponMainRef}
        >
          {/* Top Title ("標題" centered as in sketch) + Close */}
          <header className="sketch-fs-topbar">
            <BrandLockup className="sketch-fs-brand" compact />
            <button
              className="sketch-fs-close-btn"
              onClick={() => setSelectedItem(null)}
              aria-label="關閉"
              autoFocus
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
            {/* Left Column: Stats on top, Special Effect on bottom */}
            <div className="sketch-fs-left-col" ref={weaponStatsRef}>
              <div className="sketch-fs-stats sketch-fs-stats--weapon">
                {['hp', 'atk', 'def', 'spd'].map((key) => {
                  const Icon = STAT_ICONS[key];
                  const bonusVal = getItemBonus(selectedItem, key);
                  const hasBonus = bonusVal > 0;
                  const maxRef = STAT_MAX_LIMITS[key] || 100;
                  const fillWidth = hasBonus ? Math.min(100, Math.max(0, (bonusVal / maxRef) * 100)) : 0;
                  const displayBonus = hasBonus
                    ? (key === 'spd' ? `+${bonusVal}%` : `+${bonusVal}`)
                    : (key === 'spd' ? '+0%' : '+0');

                  return (
                    <div className={`sketch-stat-row ${hasBonus ? 'is-boosted' : ''}`} key={key}>
                      <div className="sketch-stat-label-wrap">
                        <span className="sketch-stat-label">
                          <Icon size={12} />
                          {key.toUpperCase()} :
                        </span>
                        {/* Blue handwritten-style arrow callout matching sketch */}
                        {hasBonus && (
                          <span className="sketch-increase-callout">
                            ➔
                          </span>
                        )}
                      </div>
                      <strong className={`sketch-stat-val ${hasBonus ? 'text-[#35d9ff]' : 'text-[#56655c]'}`}>
                        {displayBonus}
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

              {/* Special Effect & Description on bottom left */}
              <div className="sketch-fs-skill">
                <span className="sketch-fs-skill-title">Special:</span>
                <p className="sketch-fs-skill-desc">
                  {selectedItem.skill || `${selectedItem.bonus}。裝備後於戰鬥中提供額外戰力支援。`}
                </p>
              </div>
            </div>

            {/* Right Hero Column: Speech Bubble positioned directly above Weapon Art */}
            <div className="sketch-fs-hero-col">
              <DetailSpeechBubble
                statsRef={weaponStatsRef}
                containerRef={weaponMainRef}
                quote={selectedItem.quote || '只要砍得夠快，敵人就追不上。'}
                isWeapon
              />

              {/* Big Weapon Art */}
              <div className="sketch-fs-character sketch-fs-weapon-art">
                <ItemIllustration item={selectedItem} size="hero" />
              </div>
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
