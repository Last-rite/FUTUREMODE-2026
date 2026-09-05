import React, { useMemo, useState } from 'react';
import { BatteryCharging, ChevronLeft, ChevronRight, Coins, LogOut, Play, RotateCcw } from 'lucide-react';
import DemoBadge from './DemoBadge.jsx';
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
        <div className="sketch-brand">
          <span className="sketch-brand__mark"><i>FM</i></span>
          <span><strong>FUTUREMODE</strong><small>NOXCAT</small></span>
        </div>
        <div className="sketch-brandbar__actions">
          <DemoBadge compact />
          <button className="sketch-icon-button" onClick={onReset} aria-label="重置測試資料"><RotateCcw size={17} /></button>
          <button className="sketch-icon-button" onClick={onSignOut} aria-label="登出"><LogOut size={17} /></button>
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
          <span className="sketch-field-line sketch-field-line--one" />
          <span className="sketch-field-line sketch-field-line--two" />
          <span className="sketch-field-line sketch-field-line--three" />
          <div className="sketch-mission__node" aria-label="關卡圖像 placeholder">
            <BatteryCharging size={50} />
            <span>STAGE PLACEHOLDER</span>
          </div>
          <button className="sketch-stage-arrow sketch-stage-arrow--left" onClick={() => cycleDungeon(-1)} aria-label="上一個關卡"><ChevronLeft /></button>
          <button className="sketch-stage-arrow sketch-stage-arrow--right" onClick={() => cycleDungeon(1)} aria-label="下一個關卡"><ChevronRight /></button>
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
        <Play size={21} fill="currentColor" /><span>START</span><small>-{dungeon.cost}</small>
      </button>
    </main>
  );
}
