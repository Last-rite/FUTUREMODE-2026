import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from '../game/Engine.js';
import { sound } from '../game/audio.js';
import { TEAM_SIZE, W, H, SHOW_BOSS_BAR } from '../game/constants.js';
import {
  Volume2, VolumeX, RotateCcw, HelpCircle,
  Trophy, Skull, X, Shield, Swords
} from 'lucide-react';

export default function GameView({ onExitToLobby }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  const [snapshot, setSnapshot] = useState({
    round: 1,
    activeLabel: '1a',
    activeOwner: 1,
    turnPhase: 'PLAYER_AIM',
    initiativeQueue: [],
    boss: null,
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

  const boss = snapshot.boss;
  const bossHpRatio = boss ? Math.max(0, Math.min(100, (boss.totalHp / boss.maxTotalHp) * 100)) : 0;

  return (
    <div className="relative w-full h-[100dvh] flex items-center justify-center bg-[#05070a] select-none overflow-hidden font-sans">
      {/* ── Main Arcade Phone Frame (NOXCAT Deep Tech Theme) ── */}
      <div className="relative w-full max-w-[480px] h-full max-h-[920px] flex flex-col justify-between items-center shadow-2xl bg-[#080d14] border-x border-[#172331]">
        
        {/* ── Playfield Arena Area with Optional Floating Boss HP Bar ── */}
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

            {/* ── Boss HP Bar (Toggleable via SHOW_BOSS_BAR backdoor in constants.js) ── */}
            {SHOW_BOSS_BAR && boss && (
              <div className="absolute top-3 inset-x-3 pointer-events-none z-20 flex flex-col items-center">
                <div className="pointer-events-auto w-full max-w-[420px] bg-[#0c131dc0] backdrop-blur-md border border-[#ff2a55]/40 rounded-full px-3 py-1 flex items-center gap-2 shadow-[0_4px_20px_rgba(0,0,0,0.8)] animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Boss Skull Badge */}
                  <div className="flex items-center gap-1 bg-[#220a12] border border-[#ff2a55] px-2 py-0.5 rounded-full shrink-0">
                    <Skull size={13} className="text-[#ff2a55] animate-pulse" />
                    <span className="text-[10px] font-black text-[#ff2a55] font-mono tracking-wider">
                      BOSS
                    </span>
                  </div>

                  {/* Segmented Boss HP Bar */}
                  <div className="flex-1 flex flex-col gap-0.5">
                    <div className="flex justify-between items-center text-[10px] font-mono font-bold px-0.5">
                      <span className="text-white drop-shadow">ENEMY FLEET</span>
                      <span className="text-[#ff2a55] drop-shadow">{boss.totalHp} / {boss.maxTotalHp}</span>
                    </div>
                    <div className="w-full h-2.5 bg-[#141d28] rounded-full overflow-hidden p-0.5 border border-[#ff2a55]/30">
                      <div
                        className="h-full bg-gradient-to-r from-[#ffd000] via-[#ff5533] to-[#ff2a55] rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(255,42,85,0.6)]"
                        style={{ width: `${bossHpRatio}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ── Monster Strike Bottom Console (Initiative Queue + Toolbar) ── */}
        <footer className="w-full shrink-0 z-10 flex flex-col bg-[#080d14] border-t border-[#172331] shadow-[0_-8px_25px_rgba(0,0,0,0.7)]">
          {/* 1. Initiative Character Rack (Leftmost is ALWAYS the active mover) */}
          <div className="w-full px-2 pt-5 pb-2 overflow-x-auto scrollbar-none flex items-center gap-2">
            {snapshot.initiativeQueue.map((char, index) => {
              const isCurrent = char.isCurrent;
              const isPlayer = char.owner === 1;
              const hpPct = Math.max(0, Math.min(100, (char.hp / char.maxHp) * 100));

              return (
                <div
                  key={`${char.label}-${index}`}
                  className={`relative shrink-0 flex flex-col items-center rounded-xl p-1.5 pt-2 transition-all duration-200 border ${
                    isCurrent
                      ? isPlayer
                        ? 'bg-[#0b1f14] border-[#00ff66] shadow-[0_0_18px_rgba(0,255,102,0.6)] scale-105 z-20'
                        : 'bg-[#260c14] border-[#ff2a55] shadow-[0_0_18px_rgba(255,42,85,0.6)] scale-105 z-20'
                      : isPlayer
                      ? 'bg-[#091410] border-[#00ff66]/30 opacity-80'
                      : 'bg-[#18090d] border-[#ff2a55]/30 opacity-80'
                  }`}
                  style={{ width: '70px' }}
                >
                  {/* Prominent Leftmost "GO!" Banner */}
                  {isCurrent && (
                    <div
                      className={`absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-black font-mono uppercase tracking-wider text-center shadow-lg animate-bounce z-30 border ${
                        isPlayer
                          ? 'bg-[#00ff66] text-black border-white shadow-[0_0_10px_rgba(0,255,102,0.9)]'
                          : 'bg-[#ff2a55] text-white border-white shadow-[0_0_10px_rgba(255,42,85,0.9)]'
                      }`}
                    >
                      GO!
                    </div>
                  )}

                  {/* Character Avatar with Outer Liquid Ring */}
                  <div
                    className="relative w-10 h-10 rounded-full border-2 flex items-center justify-center mb-1 overflow-hidden shadow-inner mt-0.5"
                    style={{
                      borderColor: isCurrent ? '#ffffff' : (isPlayer ? '#00ff66' : '#ff2a55'),
                      backgroundColor: '#060a0f',
                    }}
                  >
                    {/* Ring liquid fill level from bottom */}
                    <div
                      className="absolute bottom-0 inset-x-0 transition-all duration-300"
                      style={{
                        height: `${hpPct}%`,
                        backgroundColor: isPlayer ? '#00ff66' : '#ff2a55',
                        opacity: 0.9,
                      }}
                    />
                    {/* Inner core cutout */}
                    <div className="relative z-10 w-6 h-6 rounded-full bg-[#080d14] border border-white/20 flex items-center justify-center">
                      <span className="text-[10px] font-black font-mono text-white">
                        {char.label}
                      </span>
                    </div>
                  </div>

                  {/* HP Bar Below Character */}
                  <div className="w-full flex flex-col gap-0.5 items-center">
                    <div className="w-full h-1.5 bg-[#141d28] rounded-full overflow-hidden p-[1px] border border-slate-700/50">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${hpPct}%`,
                          backgroundColor: isPlayer ? '#00ff66' : '#ff2a55',
                        }}
                      />
                    </div>
                    {/* Numerical HP indicator */}
                    <span className="text-[10px] font-mono font-bold text-slate-300 leading-none mt-0.5">
                      {char.hp}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 2. Utility Toolbar (Below the characters) */}
          <div className="w-full px-3 py-1.5 bg-[#06090e] border-t border-[#131c26] flex items-center justify-between">
            {/* Battle / Round status */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded bg-[#0d1622] text-[#00ff66] border border-[#00ff66]/30 shadow-[0_0_8px_rgba(0,255,102,0.15)]">
                BATTLE R{snapshot.round}
              </span>
              <span className="text-[11px] font-mono font-bold text-slate-400">
                INITIATIVE QUEUE
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
