import React, { useMemo, useState } from 'react';
import { ArrowRight, BatteryCharging, ChevronLeft, ChevronRight, Coins, Flame, LogOut, Play, RotateCcw, ShieldCheck, Signal, Sparkles, Swords, Trophy } from 'lucide-react';
import DemoBadge from './DemoBadge.jsx';
import NoxPlaceholder from './NoxPlaceholder.jsx';

export default function LobbyView({ user, data, onStartGame, onSignOut, onReset }) {
  const [dungeonIndex, setDungeonIndex] = useState(0);
  const dungeon = data.dungeons[dungeonIndex];
  const team = useMemo(() => data.pets.filter((pet) => pet.selected).slice(0, 3), [data.pets]);
  const cycleDungeon = (direction) => setDungeonIndex((current) => (current + direction + data.dungeons.length) % data.dungeons.length);

  return (
    <div className="screen-scroll home-screen">
      <header className="topbar">
        <div><div className="eyebrow eyebrow--green">FUTUREMODE // NODE 01</div><div className="player-line"><span className="online-dot" /><strong>{user.gameId}</strong><span>LV.{user.level}</span></div></div>
        <div className="topbar-actions"><DemoBadge compact /><button className="icon-button" onClick={onReset} aria-label="重置測試資料"><RotateCcw size={17} /></button><button className="icon-button" onClick={onSignOut} aria-label="登出"><LogOut size={18} /></button></div>
      </header>

      <section className="wallet-strip">
        <div><Coins size={16} /><span>NOX</span><strong>{user.nox.toLocaleString()}</strong></div>
        <div><Flame size={16} /><span>連勝</span><strong>{user.streak}</strong></div>
        <div><Trophy size={16} /><span>階級</span><strong>{user.rank}</strong></div>
      </section>

      <section className="dungeon-section">
        <div className="section-heading"><div><span>SELECT MISSION</span><h2>選擇地下城</h2></div><span className="pager">0{dungeonIndex + 1} / 0{data.dungeons.length}</span></div>
        <div className="dungeon-stage" style={{ '--dungeon-tone': dungeon.tone }}>
          <div className="dungeon-grid" aria-hidden="true" /><div className="dungeon-number">{dungeon.chapter}</div>
          <div className="dungeon-node" aria-hidden="true"><span /><span /><span /><BatteryCharging size={44} /></div>
          <div className="dungeon-copy"><span>{dungeon.subtitle}</span><h3>{dungeon.name}</h3><div className="difficulty"><Signal size={13} /> {dungeon.difficulty}</div></div>
          <button className="stage-arrow stage-arrow--left" onClick={() => cycleDungeon(-1)} aria-label="上一個地下城"><ChevronLeft /></button>
          <button className="stage-arrow stage-arrow--right" onClick={() => cycleDungeon(1)} aria-label="下一個地下城"><ChevronRight /></button>
        </div>
        <div className="mission-meta">
          <div><Swords size={16} /><span>敵方單位</span><strong>3</strong></div>
          <div><Sparkles size={16} /><span>共享戰利品</span><strong>{dungeon.loot}</strong></div>
          <div><ShieldCheck size={16} /><span>入場消耗</span><strong>{dungeon.cost}</strong></div>
        </div>
      </section>

      <section className="team-preview">
        <div className="section-heading section-heading--compact"><div><span>ACTIVE SQUAD</span><h2>出戰隊伍</h2></div><span className="team-count">{team.length}/3 READY</span></div>
        <div className="team-row">
          {team.map((pet, index) => <article className="team-chip" key={pet.id} style={{ '--pet-accent': pet.accent }}><span className="team-order">0{index + 1}</span><NoxPlaceholder pet={pet} size="sm" /><div><strong>{pet.name}</strong><span>LV.{pet.level} · {pet.className}</span></div></article>)}
        </div>
      </section>

      <section className="risk-banner"><ShieldCheck size={20} /><div><strong>掉落規則已啟用</strong><span>非初始保護 NOXCAT 在 HP 歸零時會進入此關共享池。</span></div><ArrowRight size={18} /></section>
      <button className="battle-button" onClick={() => onStartGame(dungeon)} disabled={team.length !== 3}><span className="battle-button__icon"><Play size={23} fill="currentColor" /></span><span><small>MISSION {dungeon.chapter}</small>開始戰鬥</span><span className="battle-button__cost">-{dungeon.cost} <Coins size={14} /></span></button>
    </div>
  );
}
