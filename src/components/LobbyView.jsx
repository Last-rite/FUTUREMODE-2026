import React, { useMemo, useState } from 'react';
import { AlertTriangle, BatteryCharging, ChevronLeft, ChevronRight, Coins, LockKeyhole, LogOut } from 'lucide-react';
import NoxPlaceholder from './NoxPlaceholder.jsx';
import { ItemIllustration } from './CollectionView.jsx';
import BrandLockup from './BrandLockup.jsx';
import levelCityImg from '../assets/level_city.png';
import { getActiveTeam, getActiveLoadoutIndex } from '../utils/teamStorage.js';

export default function LobbyView({ user, data, onStartGame, onSignOut }) {
  const [dungeonIndex, setDungeonIndex] = useState(0);
  const [showIncompleteWarning, setShowIncompleteWarning] = useState(false);
  const dungeon = data.dungeons[dungeonIndex];
  const solvedDungeonIds = data.solvedDungeonIds || [];
  const highestSolvedIndex = data.dungeons.reduce((highest, entry, index) => (
    solvedDungeonIds.includes(entry.id) ? Math.max(highest, index) : highest
  ), -1);
  const unlockedThroughIndex = Math.min(highestSolvedIndex + 1, data.dungeons.length - 1);
  const isDungeonLocked = dungeonIndex > unlockedThroughIndex;
  
  // Retrieve the actual last selected team setup from the setup menu (CollectionView)
  const activeLoadoutIdx = getActiveLoadoutIndex();
  const team = useMemo(() => getActiveTeam(data), [data]);

  const cycleDungeon = (direction) => setDungeonIndex((current) => (
    current + direction + data.dungeons.length
  ) % data.dungeons.length);

  const handleStartClick = () => {
    if (team.length === 0 || isDungeonLocked) return;
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

  const lostInDungeon = (data.lostAssets || []).filter(
    (a) => a.status === 'in_pool' && (a.dungeonId === dungeon?.id || a.location?.includes(dungeon?.name))
  );
  const lostCatsCount = lostInDungeon.filter((a) => a.type === 'pet').length;
  const lostItemsCount = lostInDungeon.filter((a) => a.type !== 'pet').length;

  return (
    <main className="screen-scroll sketch-home" aria-label="大廳主畫面">
      <header className="sketch-brandbar">
        <BrandLockup compact />
        <div className="sketch-brandbar__actions">
          <button className="sketch-icon-button" onClick={onSignOut} aria-label="登出"><LogOut size={18} /></button>
        </div>
      </header>

      <section className="sketch-playerbar" aria-label="玩家資料">
        <span>{user.gameId} · LV.{user.level}</span>
        <strong><Coins size={15} /> {user.nox.toLocaleString()}</strong>
      </section>

      <section className={`sketch-mission ${isDungeonLocked ? 'is-locked' : ''}`} style={{ '--dungeon-tone': dungeon.tone }}>
        <div className="sketch-mission__heading">
          <span>關卡 {dungeon.chapter}</span>
          <h1>{dungeon.name}</h1>
          <div className="flex items-center justify-center gap-3 mt-0.5 text-[11px] font-mono tracking-wider">
            <span className="text-red-400 font-bold">💀 走失貓咪:{lostCatsCount}</span>
            <span className="text-[#00e5ff] font-semibold">失落遺物:{lostItemsCount}</span>
          </div>
        </div>
        <div className="sketch-mission__field">
          <div className="sketch-stage-platform" aria-hidden="true" />
          <div className={`sketch-mission__node ${isDungeonLocked ? 'is-locked' : ''}`} aria-label={isDungeonLocked ? `${dungeon.name}，尚未解鎖` : `${dungeon.name}關卡圖像`} key={dungeon.id}>
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
            {isDungeonLocked && (
              <div className="sketch-stage-lock" aria-hidden="true">
                <LockKeyhole size={38} strokeWidth={2.3} />
                <strong>尚未解鎖</strong>
              </div>
            )}
          </div>
          <button className="sketch-stage-arrow sketch-stage-arrow--left" onClick={() => cycleDungeon(-1)} aria-label="上一個關卡"><ChevronLeft size={28} /></button>
          <button className="sketch-stage-arrow sketch-stage-arrow--right" onClick={() => cycleDungeon(1)} aria-label="下一個關卡"><ChevronRight size={28} /></button>
          <div className="sketch-party" aria-label={`目前出戰隊伍 (編組 ${activeLoadoutIdx})`}>
            {team.map((pet, index) => (
              <div className="sketch-party__member" key={pet.id} style={{ '--pet-accent': pet.accent }}>
                <NoxPlaceholder pet={pet} size="sm" />
                <span>{index + 1}</span>
                <div
                  className={`sketch-party__weapon ${pet.equipped ? 'is-equipped' : 'is-empty'}`}
                  aria-label={pet.equipped ? `已裝備 ${data.items.find((item) => item.id === pet.equipped)?.name || '武器'}` : '未裝備武器'}
                >
                  {pet.equipped ? (
                    <ItemIllustration item={data.items.find((item) => item.id === pet.equipped)} size="sm" />
                  ) : (
                    <i aria-hidden="true">—</i>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <button
        className="sketch-start"
        onClick={handleStartClick}
        disabled={team.length === 0 || isDungeonLocked}
        title={isDungeonLocked ? '通關前一關後解鎖' : (team.length === 0 ? '隊伍目前無出戰角色' : '出擊')}
      >
        <span className="sketch-start-label">{isDungeonLocked ? 'LOCKED' : 'START'}</span>
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
