import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from '../game/Engine.js';
import { sound } from '../game/audio.js';
import { TEAM_SIZE, W, H, SHOW_TOP_BAR } from '../game/constants.js';
import {
  Volume2, VolumeX, RotateCcw, HelpCircle,
  Trophy, Skull, X, Shield, Swords, Coins
} from 'lucide-react';

function SquarcleBall({ char, isCurrent, isPlayer }) {
  const canvasRef = useRef(null);
  const phaseRef = useRef(0);
  const waveAmpRef = useRef(0);
  const prevHpRef = useRef(char.hp);
  const prevCurrentRef = useRef(isCurrent);

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

    const render = () => {
      const size = 58;
      const ringW = 7;
      const innerSize = size - ringW * 2; // 44
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
        if (isPlayer) {
          liqGrad.addColorStop(0, '#00ff66');
          liqGrad.addColorStop(1, '#008f39');
        } else {
          liqGrad.addColorStop(0, '#ff2a55');
          liqGrad.addColorStop(1, '#99112e');
        }

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

      // Cutout inner squarcle core (7px border width)
      ctx.beginPath();
      ctx.roundRect(ringW, ringW, innerSize, innerSize, 8);
      ctx.fillStyle = '#080d14';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Centered Character Label inside inner squarcle
      ctx.font = '900 15px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(char.label, size / 2, size / 2);

      ctx.restore();

      // Outer squarcle border:
      // When NOT their turn, outer green/red edge is slightly thicker (3.0px) and bold
      // When IS their turn, neon white active edge
      const borderW = isCurrent ? 2.5 : 3.0;
      const inset = borderW / 2;
      ctx.beginPath();
      ctx.roundRect(inset, inset, size - borderW, size - borderW, 14);
      ctx.strokeStyle = isCurrent
        ? '#ffffff'
        : (isPlayer ? '#00ff66' : '#ff2a55');
      ctx.lineWidth = borderW;
      ctx.stroke();

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [char.hp, char.maxHp, char.label, isCurrent, isPlayer]);

  return (
    <div
      className={`relative rounded-2xl p-0.5 transition-all duration-200 ${
        isCurrent
          ? isPlayer
            ? 'shadow-[0_0_22px_rgba(0,255,102,0.8)] scale-105 z-20'
            : 'shadow-[0_0_22px_rgba(255,42,85,0.8)] scale-105 z-20'
          : isPlayer
          ? 'border border-[#00ff66]/60 shadow-[0_0_8px_rgba(0,255,102,0.25)] opacity-90'
          : 'border border-[#ff2a55]/60 shadow-[0_0_8px_rgba(255,42,85,0.25)] opacity-90'
      }`}
    >
      <canvas
        ref={canvasRef}
        width={58}
        height={58}
        className="w-[58px] h-[58px] block rounded-2xl bg-[#060a0f]"
      />
    </div>
  );
}

export default function GameView({ onExitToLobby }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  const [snapshot, setSnapshot] = useState({
    round: 1,
    activeLabel: '1a',
    activeOwner: 1,
    turnPhase: 'PLAYER_AIM',
    initiativeQueue: [],
    topBarInfo: null,
    boss: null,
    goldEarned: 0,
    playerAliveCount: TEAM_SIZE,
    aiAliveCount: TEAM_SIZE,
  });

  const [isMuted, setIsMuted] = useState(false);
  const [gameOver, setGameOver] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new GameEngine(canvasRef.current, {
      onSnapshot: (snap) => {
        setSnapshot(snap);
      },
      onGameOver: (result) => {
        setGameOver(result);
      },
      onLog: () => {},
    });

    engineRef.current = engine;

    return () => {
      engine.destroy();
    };
  }, []);

  const handleRestart = () => {
    setGameOver(null);
    engineRef.current?.resetGame();
  };

  const handleToggleMute = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  const topBar = snapshot.topBarInfo || snapshot.boss;
  const topBarRatio = topBar ? Math.max(0, Math.min(100, (topBar.ratio ?? (topBar.hp / (topBar.maxHp || 1))) * 100)) : 0;

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
                  {/* Subtle diagonal tech stripes pattern matching sketch */}
                  <div
                    className="absolute inset-0 opacity-20 pointer-events-none"
                    style={{
                      backgroundImage: 'repeating-linear-gradient(-45deg, #ffffff 0, #ffffff 2px, transparent 2px, transparent 8px)',
                    }}
                  />

                  {/* Liquid HP fill */}
                  <div
                    className="h-full bg-gradient-to-r from-[#ffd000] via-[#ff5533] to-[#ff2a55] transition-all duration-300 shadow-[0_0_12px_rgba(255,42,85,0.8)] relative"
                    style={{ width: `${topBarRatio}%` }}
                  >
                    {/* Diagonal hatching on active bar */}
                    <div
                      className="absolute inset-0 opacity-25 pointer-events-none"
                      style={{
                        backgroundImage: 'repeating-linear-gradient(-45deg, #ffffff 0, #ffffff 2px, transparent 2px, transparent 8px)',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Exact HP Numbers */}
              <span className="absolute right-2 text-[10px] font-mono font-black text-white drop-shadow-[0_1px_3px_rgba(0,0,0,1)] tabular-nums select-none pointer-events-none z-10">
                {topBar.hp} / {topBar.maxHp}
              </span>
            </div>
          </header>
        )}

        {/* ── Playfield Arena Area ── */}
        <main className="relative flex-1 w-full min-h-0 flex items-center justify-center p-2 overflow-hidden">
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

        {/* ── Monster Strike Bottom Console (Initiative Queue + Toolbar) ── */}
        <footer className="w-full shrink-0 z-10 flex flex-col bg-[#080d14] border-t border-[#172331] shadow-[0_-8px_25px_rgba(0,0,0,0.7)]">
          {/* 1. Initiative Character Rack (Leftmost is ALWAYS the active mover) */}
          <div className="w-full px-3 pt-6 pb-2.5 overflow-x-auto scrollbar-none flex items-center gap-2.5">
            {snapshot.initiativeQueue.map((char, index) => {
              const isCurrent = char.isCurrent;
              const isPlayer = char.owner === 1;

              return (
                <div
                  key={`${char.label}-${index}`}
                  className="relative shrink-0 flex flex-col items-center"
                >
                  {/* Prominent Leftmost "GO!" Banner */}
                  {isCurrent && (
                    <div
                      className={`absolute -top-3.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[9px] font-black font-mono uppercase tracking-wider text-center shadow-lg animate-bounce z-30 border ${
                        isPlayer
                          ? 'bg-[#00ff66] text-black border-white shadow-[0_0_12px_rgba(0,255,102,0.9)]'
                          : 'bg-[#ff2a55] text-white border-white shadow-[0_0_12px_rgba(255,42,85,0.9)]'
                      }`}
                    >
                      GO!
                    </div>
                  )}

                  {/* Centered Squarcle Ball with Liquid Wave Ring */}
                  <SquarcleBall
                    char={char}
                    isCurrent={isCurrent}
                    isPlayer={isPlayer}
                  />
                </div>
              );
            })}
          </div>

          {/* 2. Utility Toolbar (Below the characters) */}
          <div className="w-full px-3 py-1.5 bg-[#06090e] border-t border-[#131c26] flex items-center justify-between">
            {/* Gold earned this fight (fixed width to prevent layout overflow/jitter) */}
            <div
              className="w-[88px] h-7 px-2 py-0.5 rounded-lg bg-[#0d1622] border border-[#ffd000]/40 shadow-[0_0_10px_rgba(255,208,0,0.15)] flex items-center gap-1.5 shrink-0 select-none overflow-hidden"
              title="Gold earned this fight (1 gold per damage dealt)"
            >
              <Coins size={14} className="text-[#ffd000] shrink-0 drop-shadow-[0_0_4px_rgba(255,208,0,0.5)]" />
              <span className="text-xs font-mono font-black text-[#ffd000] tabular-nums truncate leading-none">
                +{snapshot.goldEarned ?? 0}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowHelp(true)}
                aria-label="Info & Rules"
                title="Game Rules"
                className="p-1.5 rounded-lg bg-[#0e1620] hover:bg-[#162232] text-slate-300 hover:text-white active:scale-95 transition-all border border-slate-700/60 cursor-pointer"
              >
                <HelpCircle size={15} />
              </button>
              <button
                onClick={handleToggleMute}
                aria-label="Mute / Unmute"
                title={isMuted ? 'Unmute' : 'Mute'}
                className="p-1.5 rounded-lg bg-[#0e1620] hover:bg-[#162232] text-slate-300 hover:text-white active:scale-95 transition-all border border-slate-700/60 cursor-pointer"
              >
                {isMuted ? <VolumeX size={15} className="text-[#ff2a55]" /> : <Volume2 size={15} className="text-[#00ff66]" />}
              </button>
              <button
                onClick={handleRestart}
                aria-label="Restart Match"
                title="Restart"
                className="p-1.5 rounded-lg bg-[#0e1620] hover:bg-[#162232] text-slate-300 hover:text-white active:scale-95 transition-all border border-slate-700/60 cursor-pointer"
              >
                <RotateCcw size={15} />
              </button>
            </div>
          </div>
        </footer>

        {/* ── Victory / Defeat Modal ── */}
        {gameOver && (
          <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-xs bg-[#0b121a] border border-[#00ff66]/40 rounded-2xl p-6 text-center shadow-[0_0_30px_rgba(0,0,0,0.8)] flex flex-col items-center animate-in fade-in zoom-in duration-200">
              <div className="p-3 rounded-full mb-3 bg-[#111c29] border border-slate-700/50">
                {gameOver.winner === 'PLAYER' ? (
                  <Trophy size={48} className="text-[#00ff66] animate-bounce drop-shadow-[0_0_12px_rgba(0,255,102,0.8)]" />
                ) : (
                  <Skull size={48} className="text-[#ff2a55] animate-pulse drop-shadow-[0_0_12px_rgba(255,42,85,0.8)]" />
                )}
              </div>

              <h2 className="text-2xl font-black tracking-wider mb-1 font-mono">
                {gameOver.winner === 'PLAYER' ? (
                  <span className="text-[#00ff66] drop-shadow-[0_0_10px_rgba(0,255,102,0.5)]">VICTORY!</span>
                ) : (
                  <span className="text-[#ff2a55] drop-shadow-[0_0_10px_rgba(255,42,85,0.5)]">DEFEAT!</span>
                )}
              </h2>

              <p className="text-xs text-slate-400 mb-5 font-mono">
                {gameOver.winner === 'PLAYER'
                  ? `All AI liquid orbs shattered in Round ${gameOver.round}!`
                  : `All your capsules shattered in Round ${gameOver.round}!`}
              </p>

              <button
                onClick={onExitToLobby}
                className="w-full py-3 rounded-xl bg-[#00ff66] hover:bg-[#10e86b] text-black font-black text-sm tracking-wider uppercase active:scale-95 transition-all shadow-[0_0_20px_rgba(0,255,102,0.4)] cursor-pointer font-mono"
              >
                Return to Lobby
              </button>
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
