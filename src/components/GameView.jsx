import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from '../game/Engine.js';
import { sound } from '../game/audio.js';
import { TEAM_SIZE, W, H, SHOW_TOP_BAR, SETTLEMENT_REWARD_COUNT } from '../game/constants.js';
import {
  HelpCircle,
  Skull, X, Shield, Swords, Coins, Gift, MapPin,
  Cat, ShieldPlus
} from 'lucide-react';
import swordImg from '../assets/sword_128.png';
import shieldImg from '../assets/shield_128.png';
import gemImg from '../assets/noxgem_128.png';
import { getBallImage } from '../game/sprites.js';
import { hexToRgba, lerpColor } from '../game/physics.js';

/**
 * Dynamic HP bar gradient:
 * - Keeps the leftmost color (1:3 soft tinted white) and rightmost color (team color) constant.
 * - As the health bar gets shorter, the transition between them naturally becomes harsher and harsher.
 * - Red (Enemy): rgb(255, 184, 198) to rgb(255, 42, 85)
 * - Green (Player): rgb(170, 255, 204) to rgb(0, 255, 102)
 */
function getHpGradient(ratio, colorType = 'red') {
  if (colorType === 'red') {
    return 'linear-gradient(to right, rgb(255, 184, 198), rgb(255, 42, 85))';
  } else {
    return 'linear-gradient(to right, rgb(170, 255, 204), rgb(0, 255, 102))';
  }
}

/**
 * Maintains the hexagonal shape with right triangle tip as the bar shrinks
 */
function getHpFillClipPath(ratio) {
  if (ratio <= 0) return 'none';
  if (ratio < 4) {
    return 'polygon(0% 0%, 100% 50%, 0% 100%)';
  }
  return 'polygon(5px 0%, calc(100% - 6px) 0%, 100% 50%, calc(100% - 6px) 100%, 5px 100%, 0% 50%)';
}

function SquarcleBall({ char, isCurrent, isPlayer }) {
  const canvasRef = useRef(null);
  const phaseRef = useRef(0);
  const waveAmpRef = useRef(0);
  const prevHpRef = useRef(char.hp);
  const prevCurrentRef = useRef(isCurrent);

  const accent = isPlayer ? '#00ff66' : '#ff2a55';

  // Trigger wave when hit/damaged or when engine passes waveAmp
  useEffect(() => {
    if (char.hp < prevHpRef.current) {
      waveAmpRef.current = Math.min(7.5, waveAmpRef.current + 4.0);
    }
    prevHpRef.current = char.hp;

    if (char.waveAmp && char.waveAmp > waveAmpRef.current) {
      waveAmpRef.current = char.waveAmp;
    }
  }, [char.hp, char.waveAmp]);

  // Gentle wave jolt when active turn starts
  useEffect(() => {
    if (isCurrent && !prevCurrentRef.current) {
      waveAmpRef.current = Math.max(waveAmpRef.current, 3.2);
    }
    prevCurrentRef.current = isCurrent;
  }, [isCurrent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
    const size = 58;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const render = () => {
      const ringW = 9;
      const innerSize = size - ringW * 2; // 40
      const maxHp = char.maxHp || 100;
      const hpRatio = Math.max(0, Math.min(1, char.hp / maxHp));

      // Wave undulation decays exponentially toward stasis, matching peg physics
      if (waveAmpRef.current > 0.04) {
        phaseRef.current += 0.22;
        waveAmpRef.current *= 0.972;
      } else {
        waveAmpRef.current = 0; // Stasis
      }
      const waveAmp = waveAmpRef.current;
      const phase = phaseRef.current;

      ctx.clearRect(0, 0, size, size);

      ctx.save();
      // Outer squarcle clipping path
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, 14);
      ctx.fillStyle = '#060a0f';
      ctx.fill();
      ctx.clip();

      // Liquid fill with undulation wave (weakens to stasis when waveAmp = 0)
      if (hpRatio > 0) {
        const surfaceY = size - size * hpRatio;

        const liqGrad = ctx.createLinearGradient(0, surfaceY, 0, size);
        liqGrad.addColorStop(0, accent);
        liqGrad.addColorStop(1, lerpColor(accent, '#000000', 0.55));

        ctx.beginPath();
        ctx.moveTo(-4, size + 4);
        ctx.lineTo(-4, surfaceY);
        for (let x = -4; x <= size + 4; x += 2) {
          const y = surfaceY + (hpRatio < 0.99 && waveAmp > 0.04 ? Math.sin(x * 0.25 + phase) * waveAmp : 0);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(size + 4, size + 4);
        ctx.closePath();
        ctx.fillStyle = liqGrad;
        ctx.fill();

        // White surface meniscus line
        if (hpRatio < 0.99) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let x = 0; x <= size; x += 2) {
            const y = surfaceY + (waveAmp > 0.04 ? Math.sin(x * 0.25 + phase) * waveAmp : 0);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      // Cutout inner squarcle core (9px border width)
      ctx.beginPath();
      ctx.roundRect(ringW, ringW, innerSize, innerSize, 8);
      ctx.fillStyle = '#080d14';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Distinctive radial background glow (底色/底光)
      const centerCoord = Math.round(size / 2);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(ringW, ringW, innerSize, innerSize, 8);
      ctx.clip();

      const coreGlow = ctx.createRadialGradient(
        centerCoord, centerCoord - 2, 1,
        centerCoord, centerCoord, innerSize / 2
      );
      coreGlow.addColorStop(0, hexToRgba(accent, 0.45));
      coreGlow.addColorStop(0.55, hexToRgba(accent, 0.18));
      coreGlow.addColorStop(0.9, hexToRgba(accent, 0.04));
      coreGlow.addColorStop(1, 'rgba(8, 13, 20, 0)');
      ctx.fillStyle = coreGlow;
      ctx.fill();

      // Draw character sprite if available
      const img = getBallImage(char);
      if (img && img.complete && img.naturalWidth > 0) {
        const prevSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        const spriteSize = innerSize - 4; // ~36px
        ctx.save();
        ctx.shadowColor = hexToRgba(accent, 0.55);
        ctx.shadowBlur = 8;
        ctx.drawImage(
          img,
          Math.round(centerCoord - spriteSize / 2),
          Math.round(centerCoord - spriteSize / 2),
          spriteSize,
          spriteSize
        );
        ctx.restore();
        ctx.imageSmoothingEnabled = prevSmoothing;
      } else {
        // Centered Character Label inside inner squarcle
        ctx.font = 'italic 900 15px "Chakra Petch", "Oxanium", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.0;
        ctx.strokeText(char.label, centerCoord, centerCoord);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(char.label, centerCoord, centerCoord);
      }
      ctx.restore(); // Restore clip

      ctx.restore();

      // Outer squarcle border
      const borderW = 3.0;
      const inset = borderW / 2;
      ctx.beginPath();
      ctx.roundRect(inset, inset, size - borderW, size - borderW, 14);
      ctx.strokeStyle = isCurrent ? '#ffffff' : accent;
      ctx.lineWidth = borderW;
      ctx.stroke();

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [char.hp, char.maxHp, char.label, isCurrent, isPlayer, accent]);

  return (
    <div
      className={`relative rounded-2xl transition-all duration-200 ${
        isCurrent ? 'scale-105 z-20' : 'opacity-90'
      }`}
      style={{
        boxShadow: isCurrent
          ? `0 0 20px ${hexToRgba(accent, 0.85)}`
          : `0 0 8px ${hexToRgba(accent, 0.3)}`,
      }}
    >
      <canvas
        ref={canvasRef}
        width={58}
        height={58}
        className="w-[58px] h-[58px] block rounded-2xl bg-[#060a0f]"
      />
      {char.equipment && (() => {
        const eq = char.equipment;
        const isBlade = eq.type === 'WEAPON' || eq.idString?.includes('blade') || eq.name?.includes('劍');
        const isShield = eq.type === 'GEAR' || eq.idString?.includes('shield') || eq.name?.includes('盾');
        const isHome = eq.type === 'TREASURE' || eq.idString?.includes('stone') || eq.idString?.includes('home') || eq.name?.includes('石') || eq.name?.includes('晶');

        return (
          <div
            title={`裝備: ${eq.name}`}
            className="absolute -bottom-[10px] -right-[10px] z-10 w-[32px] h-[32px] rounded-lg bg-black border border-[#2a3a4d] shadow-[0_2px_8px_rgba(0,0,0,0.9)] flex items-center justify-center pointer-events-auto"
          >
            {isBlade && <img src={swordImg} alt={eq.name} className="w-full h-full object-contain pixelated" />}
            {isShield && <img src={shieldImg} alt={eq.name} className="w-full h-full object-contain pixelated" />}
            {isHome && <img src={gemImg} alt={eq.name} className="w-full h-full object-contain pixelated" />}
            {!isBlade && !isShield && !isHome && <span className="w-2.5 h-2.5 rounded-full bg-[#00ff66]" />}
          </div>
        );
      })()}
    </div>
  );
}

function SettlementRail({ type = 'top', color = '#00ff66' }) {
  const isTop = type === 'top';
  return (
    <div className={`settlement-rail settlement-rail--${type}`}>
      <svg viewBox="0 0 360 16" className="settlement-rail-svg" preserveAspectRatio="none">
        {isTop ? (
          <>
            {/* Top rail: Left-anchored very long parallelograms, stops before crossing the board */}
            <polygon points="0,2 216,2 210,5.5 0,5.5" fill={color} />
            {/* 3 Solid filled parallelograms matching exact height (y=2 to 5.5) with uniform 6px spacing */}
            <path
              d="M 222 2 L 240 2 L 234 5.5 L 216 5.5 Z M 246 2 L 264 2 L 258 5.5 L 240 5.5 Z M 270 2 L 288 2 L 282 5.5 L 264 5.5 Z"
              fill={color}
            />
            <polygon points="0,9.5 194,9.5 188,13 0,13" fill={color} />
          </>
        ) : (
          <>
            {/* Bottom rail: Right-anchored very long parallelograms, starts before crossing the board */}
            {/* 3 Solid filled parallelograms matching exact height (y=9.5 to 13) with uniform 6px spacing */}
            <path
              d="M 120 9.5 L 138 9.5 L 132 13 L 114 13 Z M 96 9.5 L 114 9.5 L 108 13 L 90 13 Z M 72 9.5 L 90 9.5 L 84 13 L 66 13 Z"
              fill={color}
            />
            <polygon points="166,2 360,2 360,5.5 160,5.5" fill={color} />
            <polygon points="144,9.5 360,9.5 360,13 138,13" fill={color} />
          </>
        )}
      </svg>
    </div>
  );
}

/**
 * Distributes rewards into columns (max 4):
 * - If rewards <= 4: uses exact count of columns so it stays centered
 * - If rewards > 4: 4 columns with 1, 3, 2, 4 honeycomb distribution
 */
function distributeRewardsToColumns(rewards) {
  if (!rewards || rewards.length === 0) return [];
  const numCols = Math.min(4, Math.max(1, rewards.length));
  const columns = Array.from({ length: numCols }, () => []);
  const colOrderRow2 = [0, 2, 1, 3];

  rewards.forEach((reward, index) => {
    if (index < numCols) {
      columns[index].push(reward);
    } else {
      const offset = index - numCols;
      const targetCol = numCols === 4 ? colOrderRow2[offset % 4] : (index % numCols);
      columns[targetCol].push(reward);
    }
  });

  return columns;
}

function SettlementHexToken({ item }) {
  const isGain = item.variant === 'gain';
  const color = isGain ? '#00ff66' : '#ff2a55';
  const type = item.type;

  const ballImg = item.ball ? getBallImage(item.ball) : null;

  return (
    <div className={`settlement-hex-item is-${item.variant}`}>
      <div className="settlement-hex-shape">
        <svg viewBox="0 0 70 62" className="settlement-hex-svg">
          <polygon
            points="18,2 52,2 68,31 52,60 18,60 2,31"
            fill="rgba(4, 9, 6, 0.92)"
            stroke={color}
            strokeWidth="2.4"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="settlement-hex-icon" style={{ color }}>
          {ballImg && ballImg.src ? (
            <img
              src={ballImg.src}
              alt={item.label}
              className="w-10 h-10 object-contain pixelated"
              style={{ filter: `drop-shadow(0 0 8px ${color})` }}
            />
          ) : (
            <>
              {(type === 'cat' || type === 'lost-cat') && <Cat size={26} strokeWidth={2.2} />}
              {type === 'sword' && (
                <img
                  src={swordImg}
                  alt="武器"
                  className="w-9 h-9 object-contain pixelated"
                  style={{ filter: `drop-shadow(0 0 8px ${color})` }}
                />
              )}
              {type === 'shield' && (
                <img
                  src={shieldImg}
                  alt="防具"
                  className="w-9 h-9 object-contain pixelated"
                  style={{ filter: `drop-shadow(0 0 8px ${color})` }}
                />
              )}
              {type === 'gem' && (
                <img
                  src={gemImg}
                  alt="回家石"
                  className="w-9 h-9 object-contain pixelated"
                  style={{ filter: `drop-shadow(0 0 8px ${color})` }}
                />
              )}
              {type === 'gold' && (
                <Coins
                  size={26}
                  strokeWidth={2.2}
                  className="text-[#00ff66]"
                  style={{ filter: 'drop-shadow(0 0 8px rgba(0,255,102,0.7))' }}
                />
              )}
            </>
          )}
        </div>
      </div>
      <span className="settlement-hex-tag" style={{ color }}>
        {isGain ? '獲得' : '失去'}
      </span>
      {item.label && (
        <span className="text-[10px] font-mono font-black text-slate-200 max-w-[76px] truncate text-center mt-0.5 tracking-tight drop-shadow-sm leading-tight">
          {item.label}
        </span>
      )}
    </div>
  );
}

/**
 * Calculate dynamic scale for subsequent initiative queue items (index > 0)
 * If items overflow horizontally, scale down step-by-step: 1.0 -> 0.9 -> 0.8 -> 0.7 ...
 * Also scales down the gap between items proportionally.
 */
function getRackScale(queueLength, availableWidth) {
  if (queueLength <= 1) return { scale: 1.0, gap: 10 };

  const baseItemW = 58;
  const firstItemW = 58;
  const baseGap = 10;
  const countOthers = queueLength - 1;

  // Step down from 1.0 to 0.9, 0.8, 0.7, 0.6, 0.5, 0.4...
  for (let s = 1.0; s >= 0.4; s = Math.round((s - 0.1) * 10) / 10) {
    const itemW = baseItemW * s;
    const gap = baseGap * s;
    const totalWidth = firstItemW + countOthers * itemW + countOthers * gap;
    if (totalWidth <= availableWidth) {
      return { scale: s, gap: Math.round(gap * 10) / 10 };
    }
  }

  const rawScale = (availableWidth - firstItemW) / (countOthers * (baseItemW + baseGap));
  const minScale = Math.max(0.3, Math.floor(rawScale * 10) / 10);
  return { scale: minScale, gap: Math.round(baseGap * minScale * 10) / 10 };
}

export default function GameView({ dungeon, playerTeam = [], onExitToLobby, onBattleComplete }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  const [snapshot, setSnapshot] = useState({
    round: 1,
    activeLabel: '1a',
    activeOwner: 1,
    turnPhase: 'PLAYER_AIM',
    initiativeQueue: [],
    topBarInfo: null,
    playerBarInfo: null,
    boss: null,
    goldEarned: 0,
    playerAliveCount: playerTeam?.length || TEAM_SIZE,
    aiAliveCount: TEAM_SIZE,
  });

  const [gameOver, setGameOver] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  // Measure initiative rack width to auto-scale subsequent items when overflowing
  const rackRef = useRef(null);
  const [rackWidth, setRackWidth] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth : 390
  ));

  useEffect(() => {
    const el = rackRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el) setRackWidth(el.clientWidth);
    };
    updateWidth();

    const ro = new ResizeObserver(() => {
      updateWidth();
    });
    ro.observe(el);
    window.addEventListener('resize', updateWidth);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  const queueLength = snapshot.initiativeQueue?.length || 0;
  // Available width inside padding px-3 (12px on each side) with 4px safety buffer
  const availableRackWidth = Math.max(0, (rackWidth || 360) - 28);
  const { scale: queueScale, gap: queueGap } = getRackScale(queueLength, availableRackWidth);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new GameEngine(canvasRef.current, {
      playerTeam,
      dungeon,
      onSnapshot: (snap) => {
        setSnapshot(snap);
      },
      onGameOver: (result) => {
        setGameOver(result);
        onBattleComplete?.(result);
      },
      onLog: () => {},
    });

    engineRef.current = engine;

    return () => {
      engine.destroy();
    };
  }, [playerTeam, dungeon]);


  const handleDebugKillOpponents = () => {
    engineRef.current?.debugKillOpponents();
  };

  const handleDebugKillPlayer = () => {
    engineRef.current?.debugKillPlayer();
  };

  const topBar = snapshot.topBarInfo || snapshot.boss;
  const topBarRatio = topBar ? Math.max(0, Math.min(100, (topBar.ratio ?? (topBar.hp / (topBar.maxHp || 1))) * 100)) : 0;

  const playerBar = snapshot.playerBarInfo;
  const playerBarRatio = playerBar ? Math.max(0, Math.min(100, (playerBar.ratio ?? (playerBar.hp / (playerBar.maxHp || 1))) * 100)) : 0;

  return (
    <div className="relative w-full h-[100dvh] flex items-center justify-center bg-[#05070a] select-none overflow-hidden font-sans">
      {/* ── Main Arcade Phone Frame (NOXCAT Deep Tech Theme) ── */}
      <div className="relative w-full max-w-[480px] h-full max-h-[920px] flex flex-col justify-between items-center shadow-2xl bg-[#080d14] border-x border-[#172331]">
        {/* ── Top Health Bar (Matches reference art: name on left, angled bar on right) ── */}
        {SHOW_TOP_BAR && topBar && (
          <header className="w-full shrink-0 z-20 px-3.5 pt-2.5 pb-1.5 flex items-center justify-between gap-3 bg-[#080d14] border-b border-[#172331]/80">
            {/* Title / Name on left */}
            <div className="flex items-center shrink-0">
              <span className="text-xs font-mono font-black text-white uppercase tracking-wider drop-shadow-[0_0_8px_rgba(255,255,255,0.25)] select-none">
                {topBar.name}
              </span>
            </div>

            {/* Angled Tech Health Bar on right */}
            <div className="relative flex-1 max-w-[340px] h-4 flex items-center justify-end">
              <div
                className="relative w-full h-full p-[1.5px] overflow-hidden"
                style={{
                  clipPath: 'polygon(6px 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 6px 100%, 0% 50%)',
                  background: 'linear-gradient(180deg, #24364e 0%, #101a28 100%)',
                  boxShadow: 'inset 0 0 4px rgba(0,0,0,0.9)',
                }}
              >
                <div
                  className="w-full h-full relative overflow-hidden"
                  style={{
                    clipPath: 'polygon(5px 0%, calc(100% - 7px) 0%, 100% 50%, calc(100% - 7px) 100%, 5px 100%, 0% 50%)',
                    background: '#090e15',
                  }}
                >
                  {/* Liquid HP fill */}
                  <div
                    className="h-full transition-all duration-300 shadow-[0_0_12px_rgba(255,42,85,0.8)] relative"
                    style={{
                      width: `${topBarRatio}%`,
                      opacity: topBarRatio > 0 ? 1 : 0,
                      clipPath: getHpFillClipPath(topBarRatio),
                      background: getHpGradient(topBarRatio / 100, 'red'),
                    }}
                  />
                </div>
              </div>

              {/* Exact HP Numbers */}
              <span className="absolute right-2 text-[12px] sm:text-[13px] combat-hp-num text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)] tabular-nums select-none pointer-events-none z-10 antialiased font-black tracking-wider">
                {topBar.hp} / {topBar.maxHp}
              </span>
            </div>
          </header>
        )}

        {/* ── Playfield Arena Area ── */}
        <main className="relative flex-1 w-full min-h-0 flex items-center justify-center px-2 py-1 overflow-hidden">
          <div
            className="relative flex items-center justify-center h-full max-h-full max-w-full"
            style={{ aspectRatio: `${W} / ${H}` }}
          >
            {/* Interactive Game Canvas */}
            <canvas
              ref={canvasRef}
              className="w-full h-full block cursor-crosshair touch-none rounded-xl border-2 border-[#1f3144] shadow-2xl bg-[#05070a]"
            />
          </div>
        </main>

        {/* ── Player Total HP Bar (Between battle board and initiative rack) ── */}
        {playerBar && (
          <div className="w-full shrink-0 z-20 px-3.5 py-1.5 flex items-center justify-between gap-3 bg-[#080d14] border-t border-[#172331]/80">
            {/* Title / Name on left */}
            <div className="flex items-center shrink-0">
              <span className="text-xs font-mono font-black text-[#00ff66] uppercase tracking-wider drop-shadow-[0_0_8px_rgba(0,255,102,0.35)] select-none">
                {playerBar.name || 'PLAYER SQUAD'}
              </span>
            </div>

            {/* Angled Tech Health Bar on right */}
            <div className="relative flex-1 max-w-[340px] h-4 flex items-center justify-end">
              <div
                className="relative w-full h-full p-[1.5px] overflow-hidden"
                style={{
                  clipPath: 'polygon(6px 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 6px 100%, 0% 50%)',
                  background: 'linear-gradient(180deg, #183e2a 0%, #0d1e15 100%)',
                  boxShadow: 'inset 0 0 4px rgba(0,0,0,0.9)',
                }}
              >
                <div
                  className="w-full h-full relative overflow-hidden"
                  style={{
                    clipPath: 'polygon(5px 0%, calc(100% - 7px) 0%, 100% 50%, calc(100% - 7px) 100%, 5px 100%, 0% 50%)',
                    background: '#07120c',
                  }}
                >
                  {/* Liquid HP fill with white-to-green transition */}
                  <div
                    className="h-full transition-all duration-300 shadow-[0_0_12px_rgba(0,255,102,0.8)] relative"
                    style={{
                      width: `${playerBarRatio}%`,
                      opacity: playerBarRatio > 0 ? 1 : 0,
                      clipPath: getHpFillClipPath(playerBarRatio),
                      background: getHpGradient(playerBarRatio / 100, 'green'),
                    }}
                  />
                </div>
              </div>

              {/* Exact HP Numbers */}
              <span className="absolute right-2 text-[12px] sm:text-[13px] combat-hp-num text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)] tabular-nums select-none pointer-events-none z-10 antialiased font-black tracking-wider">
                {playerBar.hp} / {playerBar.maxHp}
              </span>
            </div>
          </div>
        )}

        {/* ── Monster Strike Bottom Console (Initiative Queue + Toolbar) ── */}
        <footer className="w-full shrink-0 z-10 flex flex-col bg-[#080d14] border-t border-[#172331] shadow-[0_-8px_25px_rgba(0,0,0,0.7)]">
          {/* 1. Initiative Character Rack (Leftmost is ALWAYS the active mover) */}
          <div
            ref={rackRef}
            className="w-full px-3 pt-6 pb-2.5 overflow-x-auto scrollbar-none flex items-center"
            style={{ gap: `${queueGap}px` }}
          >
            {snapshot.initiativeQueue.map((char, index) => {
              const isCurrent = char.isCurrent;
              const isPlayer = char.owner === 1;

              if (index === 0) {
                return (
                  <div
                    key={`${char.label}-${index}`}
                    className="relative shrink-0 flex flex-col items-center"
                    style={{ width: '58px', height: '58px' }}
                  >
                    {/* Prominent Leftmost "GO!" Banner */}
                    {isCurrent && (() => {
                      const tokenAccent = isPlayer ? '#00ff66' : '#ff2a55';
                      return (
                        <div
                          className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[9px] font-black font-mono uppercase tracking-wider text-center shadow-lg animate-bounce z-30 border border-white pointer-events-none"
                          style={{
                            backgroundColor: tokenAccent,
                            color: isPlayer ? '#000000' : '#ffffff',
                            boxShadow: `0 0 12px ${hexToRgba(tokenAccent, 0.9)}`,
                          }}
                        >
                          GO!
                        </div>
                      );
                    })()}

                    {/* Centered Squarcle Ball with Liquid Wave Ring */}
                    <SquarcleBall
                      char={char}
                      isCurrent={isCurrent}
                      isPlayer={isPlayer}
                    />
                  </div>
                );
              }

              const scaledW = Math.round(58 * queueScale * 10) / 10;
              return (
                <div
                  key={`${char.label}-${index}`}
                  className="relative shrink-0 flex items-center justify-center"
                  style={{
                    width: `${scaledW}px`,
                    height: `${scaledW}px`,
                  }}
                >
                  <div
                    style={{
                      width: '58px',
                      height: '58px',
                      transform: `scale(${queueScale})`,
                      transformOrigin: 'center center',
                      flexShrink: 0,
                    }}
                  >
                    <SquarcleBall
                      char={char}
                      isCurrent={false}
                      isPlayer={isPlayer}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* 2. Utility Toolbar (Below the characters) */}
          <div className="w-full px-3 py-1.5 bg-[#06090e] border-t border-[#131c26] flex items-center justify-between">
            {/* Gold earned this fight (NOXCAT Neon Green vibe) */}
            <div
              className="w-[88px] h-7 px-2 py-0.5 rounded-lg bg-[#0d1622] border border-[#00ff66]/40 shadow-[0_0_10px_rgba(0,255,102,0.15)] flex items-center gap-1.5 shrink-0 select-none overflow-hidden"
              title="Gold earned this fight (1 gold per damage dealt)"
            >
              <Coins size={14} className="text-[#00ff66] shrink-0 drop-shadow-[0_0_4px_rgba(0,255,102,0.6)]" />
              <span className="text-xs font-mono font-black text-[#00ff66] tabular-nums truncate leading-none drop-shadow-[0_0_4px_rgba(0,255,102,0.4)]">
                +{snapshot.goldEarned ?? 0}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1.5">
              {/* DEBUG: Ugly yellow insta-kill buttons for testing rewards/settlement screen */}
              <button
                onClick={handleDebugKillOpponents}
                aria-label="Debug: Insta Kill Opponent"
                title="[DEBUG] Insta-kill all opponents"
                className="px-1.5 py-1 text-[10px] font-black font-mono tracking-tight bg-[#ffff00] hover:bg-[#ffe600] active:scale-95 text-black border-2 border-[#b8860b] rounded shadow-[0_0_8px_rgba(255,255,0,0.85)] cursor-pointer select-none leading-none"
              >
                KILL OPP
              </button>
              <button
                onClick={handleDebugKillPlayer}
                aria-label="Debug: Insta Kill My Pieces"
                title="[DEBUG] Insta-kill all my pieces"
                className="px-1.5 py-1 text-[10px] font-black font-mono tracking-tight bg-[#ffff00] hover:bg-[#ffe600] active:scale-95 text-black border-2 border-[#b8860b] rounded shadow-[0_0_8px_rgba(255,255,0,0.85)] cursor-pointer select-none leading-none"
              >
                KILL ME
              </button>

              <button
                onClick={() => setShowHelp(true)}
                aria-label="Info & Rules"
                title="Game Rules"
                className="p-1.5 rounded-lg bg-[#0e1620] hover:bg-[#162232] text-slate-300 hover:text-white active:scale-95 transition-all border border-slate-700/60 cursor-pointer"
              >
                <HelpCircle size={15} />
              </button>
            </div>
          </div>
        </footer>

        {/* ── Settlement screen, based on docs/game-design/settlement_screen_example.jpg ── */}
        {gameOver && (
          <div
            className={`battle-settlement ${gameOver.winner === 'PLAYER' ? 'is-victory' : 'is-defeat'}`}
            onClick={onExitToLobby}
            role="dialog"
            aria-modal="true"
            aria-label={gameOver.winner === 'PLAYER' ? '戰鬥勝利' : '戰鬥失敗'}
          >
            <div className="settlement-container">
              {/* Top Rail with Parallelogram Notch */}
              <SettlementRail
                type="top"
                color={gameOver.winner === 'PLAYER' ? '#00ff66' : '#ff2a55'}
              />

              {/* Title Banner with Background Watermark Hexagon */}
              <div className="settlement-banner">
                <div className="settlement-watermark" aria-hidden="true">
                  <svg viewBox="0 0 340 110" className="settlement-watermark-svg">
                    <polygon
                      points="75,4 265,4 335,55 265,106 75,106 5,55"
                      fill="none"
                      stroke={gameOver.winner === 'PLAYER' ? '#00ff66' : '#ff2a55'}
                      strokeWidth="1.6"
                      strokeDasharray="8 5"
                      opacity="0.38"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </div>
                <h2 className="settlement-title">
                  《{gameOver.winner === 'PLAYER' ? 'VICTORY' : 'DEFEAT'}》
                </h2>
              </div>

              {/* Bottom Rail with Parallelogram Notch */}
              <SettlementRail
                type="bottom"
                color={gameOver.winner === 'PLAYER' ? '#00ff66' : '#ff2a55'}
              />

              {/* Hexagon Asset Tokens (Honeycomb Wave with Gains & Losses) */}
              <div className="settlement-hex-grid">
                {distributeRewardsToColumns(
                  (gameOver.allResults && gameOver.allResults.length > 0)
                    ? gameOver.allResults
                    : [{ id: 'gold-zero', type: 'gold', variant: 'gain', label: `+${gameOver.goldEarned || 0} G` }]
                ).map((colItems, colIdx, allCols) => (
                  <div
                    key={`col-${colIdx}`}
                    className={`settlement-hex-col ${allCols.length > 1 ? `col-${colIdx + 1}` : 'col-single'}`}
                  >
                    {colItems.map((item) => (
                      <SettlementHexToken
                        key={item.id}
                        item={item}
                      />
                    ))}
                  </div>
                ))}
              </div>

              {/* Tap to leave prompt */}
              <div className="settlement-tap-prompt">
                Tap to leave
              </div>
            </div>
          </div>
        )}

        {/* ── Help / Rules Modal ── */}
        {showHelp && (
          <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-[#0b121a] border border-[#1f3144] rounded-2xl p-5 shadow-2xl text-left flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 font-mono">
                  <HelpCircle size={16} className="text-[#00ff66]" />
                  Monster Strike Initiative Rules
                </h3>
                <button
                  onClick={() => setShowHelp(false)}
                  className="text-slate-400 hover:text-white p-1 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="text-xs text-slate-300 space-y-2.5 leading-relaxed font-sans">
                <div className="flex items-start gap-2 bg-[#0e1620] p-2.5 rounded-lg border border-slate-800">
                  <Swords size={18} className="text-[#00ff66] shrink-0 mt-0.5" />
                  <div>
                    <b className="text-white font-mono">Initiative Order (Left to Right):</b>
                    <br />
                    The leftmost character card always takes the active turn. Once its launch and collisions conclude, it rotates to the back of the line.
                  </div>
                </div>

                <div className="flex items-start gap-2 bg-[#0e1620] p-2.5 rounded-lg border border-slate-800">
                  <Shield size={18} className="text-[#00ff66] shrink-0 mt-0.5" />
                  <div>
                    <b className="text-white font-mono">Individual Liquid Health:</b>
                    <br />
                    Each character has their own liquid flask and individual HP bar displayed below their portrait. When an orb reaches 0 HP, it shatters and is removed from the queue!
                  </div>
                </div>

                <div className="bg-[#0e1620] p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 font-mono">
                  <b className="text-[#00ff66]">⚙️ Backdoor Variable:</b>
                  <br />
                  Change <code className="text-white">TEAM_SIZE = {TEAM_SIZE}</code> in{' '}
                  <code className="text-[#00ff66]">src/game/constants.js</code> to adjust team sizes without touching the UI!
                </div>
              </div>

              <button
                onClick={() => setShowHelp(false)}
                className="w-full mt-2 py-2 rounded-lg bg-[#172331] hover:bg-[#1f3144] text-white font-semibold text-xs tracking-wider font-mono cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
