import React, { useMemo, useState } from 'react';
import { BatteryCharging, ChevronLeft, ChevronRight, Coins, LogOut, RotateCcw, AlertTriangle } from 'lucide-react';
import NoxPlaceholder from './NoxPlaceholder.jsx';
import BrandLockup from './BrandLockup.jsx';
import levelCityImg from '../assets/level_city.png';
import { getActiveTeam, getActiveLoadoutIndex } from '../utils/teamStorage.js';

export default function LobbyView({ user, data, onStartGame, onSignOut, onReset }) {
  const [dungeonIndex, setDungeonIndex] = useState(0);
  const [showIncompleteWarning, setShowIncompleteWarning] = useState(false);
  const dungeon = data.dungeons[dungeonIndex];
  
  // Retrieve the actual last selected team setup from the setup menu (CollectionView)
  const activeLoadoutIdx = getActiveLoadoutIndex();
  const team = useMemo(() => getActiveTeam(data), [data]);

  const cycleDungeon = (direction) => setDungeonIndex((current) => (
    current + direction + data.dungeons.length
  ) % data.dungeons.length);

  const handleStartClick = () => {
    if (team.length === 0) return;
    if (team.length < 3) {
      setShowIncompleteWarning(true);
      return;
    }
    onStartGame(dungeon);
  };

  const handleConfirmStart = () => {
    setShowIncompleteWarning(false);
    onStartGame(dungeon);
  };

  return (
    <main className="screen-scroll sketch-home">
      <header className="sketch-brandbar">
        <BrandLockup compact />
        <div className="sketch-brandbar__actions">
          <button className="sketch-icon-button" onClick={onReset} aria-label="重置測試資料"><RotateCcw size={18} /></button>
          <button className="sketch-icon-button" onClick={onSignOut} aria-label="登出"><LogOut size={18} /></button>
        </div>
      </header>

      <section className="sketch-playerbar" aria-label="玩家資料">
        <span>{user.gameId} · LV.{user.level}</span>
        <strong><Coins size={15} /> {user.nox.toLocaleString()}</strong>
      </section>

      <section className="sketch-mission" style={{ '--dungeon-tone': dungeon.tone }}>
        <div className="sketch-mission__heading">
          <span>關卡 {dungeon.chapter}</span>
          <h1>{dungeon.name}</h1>
          <small>{dungeon.difficulty} · 掉落 {dungeon.loot}</small>
        </div>
        <div className="sketch-mission__field">
          {/* Hand-drawn terrain aesthetic matching sketch ("一個地形") */}
          <svg className="sketch-terrain-svg" viewBox="0 0 400 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="terrainGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="var(--dungeon-tone)" stopOpacity="0.12" />
                <stop offset="100%" stopColor="var(--dungeon-tone)" stopOpacity="0.01" />
              </linearGradient>
            </defs>
            <path
              d="M 0 180 Q 80 120, 140 100 T 260 50 T 360 110 L 400 180 Z"
              fill="url(#terrainGrad)"
            />
            <path
              d="M 0 180 Q 80 120, 140 100 T 260 50 T 360 110 L 400 180"
              fill="none"
              stroke="var(--dungeon-tone)"
              strokeWidth="2"
              strokeDasharray="6 8"
              opacity="0.38"
            />
          </svg>
          <div className="sketch-mission__node" aria-label="關卡圖像">
            {dungeon?.image || dungeon?.chapter === '01' ? (
              <img
                src={dungeon?.image || levelCityImg}
                alt={dungeon?.name || '關卡'}
                className="sketch-mission__node-img pixelated"
              />
            ) : (
              <>
                <BatteryCharging size={46} />
                <span>STAGE</span>
              </>
            )}
          </div>
          <button className="sketch-stage-arrow sketch-stage-arrow--left" onClick={() => cycleDungeon(-1)} aria-label="上一個關卡"><ChevronLeft size={28} /></button>
          <button className="sketch-stage-arrow sketch-stage-arrow--right" onClick={() => cycleDungeon(1)} aria-label="下一個關卡"><ChevronRight size={28} /></button>
          <div className="sketch-party" aria-label={`目前出戰隊伍 (編組 ${activeLoadoutIdx})`}>
            {team.map((pet, index) => (
              <div className="sketch-party__member" key={pet.id} style={{ '--pet-accent': pet.accent }}>
                <NoxPlaceholder pet={pet} size="sm" />
                <span>{index + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <button
        className="sketch-start"
        onClick={handleStartClick}
        disabled={team.length === 0}
        title={team.length === 0 ? '隊伍目前無出戰角色' : '出擊'}
      >
        <span className="sketch-start-chevron">《</span>
        <span className="sketch-start-label">START</span>
        <small className="sketch-start-cost">-{dungeon.cost}</small>
        <span className="sketch-start-chevron">》</span>
      </button>

      {/* Incomplete Team Warning Dialog */}
      {showIncompleteWarning && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-xs bg-[#0c131a] border border-[#ffaa00] rounded-2xl p-5 shadow-[0_0_24px_rgba(255,170,0,0.3)] text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#ffaa00]/15 text-[#ffaa00] grid place-items-center mb-1">
              <AlertTriangle size={26} />
            </div>
            <h2 className="text-base font-bold text-[#ffdd55] tracking-wide">
              隊伍尚未滿員
            </h2>
            <p className="text-xs text-[#a0b0c0] leading-relaxed">
              目前出戰編組僅有 <span className="text-[#00ff66] font-bold font-mono">{team.length}</span> / 3 位角色。
              <br />確定要以此非完整陣容繼續出戰嗎？
            </p>
            <div className="flex gap-2.5 w-full mt-2">
              <button
                onClick={() => setShowIncompleteWarning(false)}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-[#8090a0] bg-[#16222f] hover:bg-[#1f2f40] active:scale-95 transition-all"
              >
                返回整隊
              </button>
              <button
                onClick={handleConfirmStart}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-black bg-[#ffaa00] hover:bg-[#ffbb22] shadow-[0_0_12px_rgba(255,170,0,0.5)] active:scale-95 transition-all"
              >
                確認出戰
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
