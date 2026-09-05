import React, { useMemo, useState } from 'react';
import { BatteryCharging, ChevronLeft, ChevronRight, Coins, LogOut, RotateCcw } from 'lucide-react';
import NoxPlaceholder from './NoxPlaceholder.jsx';

export default function LobbyView({ user, data, onStartGame, onSignOut, onReset }) {
  const [dungeonIndex, setDungeonIndex] = useState(0);
  const dungeon = data.dungeons[dungeonIndex];
  const team = useMemo(() => data.pets.filter((pet) => pet.selected).slice(0, 3), [data.pets]);
  const cycleDungeon = (direction) => setDungeonIndex((current) => (
    current + direction + data.dungeons.length
  ) % data.dungeons.length);

  return (
    <main className="screen-scroll sketch-home">
      <header className="sketch-brandbar">
        <h1 className="sketch-main-title">戰役部署</h1>
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
            <BatteryCharging size={46} />
            <span>STAGE</span>
          </div>
          <button className="sketch-stage-arrow sketch-stage-arrow--left" onClick={() => cycleDungeon(-1)} aria-label="上一個關卡"><ChevronLeft size={28} /></button>
          <button className="sketch-stage-arrow sketch-stage-arrow--right" onClick={() => cycleDungeon(1)} aria-label="下一個關卡"><ChevronRight size={28} /></button>
          <div className="sketch-party" aria-label="目前出戰隊伍">
            {team.map((pet, index) => (
              <div className="sketch-party__member" key={pet.id} style={{ '--pet-accent': pet.accent }}>
                <NoxPlaceholder pet={pet} size="sm" />
                <span>{index + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <button className="sketch-start" onClick={() => onStartGame(dungeon)} disabled={team.length !== 3}>
        <span className="sketch-start-chevron">《</span>
        <span className="sketch-start-label">START</span>
        <small className="sketch-start-cost">-{dungeon.cost}</small>
        <span className="sketch-start-chevron">》</span>
      </button>
    </main>
  );
}
