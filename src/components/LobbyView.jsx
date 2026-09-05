import React, { useState } from 'react';
import {
  Play, LogOut, Edit2, Check, Shield, Trophy,
  Sparkles, Gamepad2, User, Clock
} from 'lucide-react';

export default function LobbyView({ user, onStartGame, onSignOut, onUpdateUser }) {
  const [isEditingId, setIsEditingId] = useState(false);
  const [editedId, setEditedId] = useState(user?.gameId || '');

  const handleSaveId = () => {
    const trimmed = editedId.trim();
    if (trimmed && trimmed.length <= 20) {
      onUpdateUser({ ...user, gameId: trimmed });
      setIsEditingId(false);
    }
  };

  return (
    <div className="relative w-full h-[100dvh] flex items-center justify-center bg-[#05070a] select-none overflow-hidden font-sans p-4">
      {/* ── Main Arcade Dashboard Shell ── */}
      <div className="relative w-full max-w-[480px] h-full max-h-[920px] flex flex-col justify-between items-center shadow-2xl bg-[#080d14] border border-[#172331] rounded-3xl overflow-hidden">
        
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#00ff66]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 left-0 w-64 h-64 bg-[#ff2a55]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Navigation Bar */}
        <header className="w-full shrink-0 z-10 px-5 py-4 border-b border-[#172331] bg-[#0a1018]/80 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00ff66]/10 border border-[#00ff66]/40 flex items-center justify-center">
              <Gamepad2 size={16} className="text-[#00ff66]" />
            </div>
            <div>
              <span className="text-[10px] font-mono tracking-widest text-[#00ff66] font-bold block leading-none">
                FUTUREMODE
              </span>
              <span className="text-xs font-mono font-black text-white leading-tight">
                PILOT TERMINAL
              </span>
            </div>
          </div>

          {/* Sign Out Button */}
          <button
            onClick={onSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1c0e14] hover:bg-[#2e131d] text-[#ff2a55] border border-[#ff2a55]/30 hover:border-[#ff2a55] text-xs font-mono font-bold active:scale-95 transition-all cursor-pointer shadow-[0_0_10px_rgba(255,42,85,0.2)]"
            title="Clear 1-day cookie & Sign Out"
          >
            <LogOut size={13} />
            <span>SIGN OUT</span>
          </button>
        </header>

        {/* Main Content Area */}
        <main className="w-full flex-1 min-h-0 overflow-y-auto p-5 flex flex-col items-center justify-center gap-6 z-10">
          
          {/* Pilot Identity Card */}
          <div className="w-full bg-gradient-to-b from-[#0e1724] to-[#0a0f18] border border-[#1f3144] rounded-3xl p-6 flex flex-col items-center text-center shadow-xl relative overflow-hidden">
            {/* Ambient Corner Badge */}
            <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#00ff66]/10 border border-[#00ff66]/30 text-[9px] font-mono text-[#00ff66] font-bold">
              <Sparkles size={10} />
              <span>ACTIVE PILOT</span>
            </div>

            {/* Google Account Avatar (Prominent & High-Res) */}
            <div className="relative mb-4 mt-2">
              <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-[#00ff66] via-white/50 to-[#00ff66] shadow-[0_0_25px_rgba(0,255,102,0.4)]">
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={user.gameId || 'Google Avatar'}
                    className="w-full h-full rounded-full object-cover bg-[#05070a]"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-[#111c29] flex items-center justify-center text-2xl font-mono font-bold text-[#00ff66]">
                    <User size={36} />
                  </div>
                )}
              </div>
              {/* Online Indicator Badge */}
              <div className="absolute bottom-1 right-1 w-5 h-5 bg-[#00ff66] border-2 border-[#080d14] rounded-full shadow-[0_0_8px_rgba(0,255,102,0.8)]" />
            </div>

            {/* In-Game Name / Game ID Display & Edit */}
            <div className="flex items-center gap-2 mb-1">
              {isEditingId ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    maxLength={20}
                    value={editedId}
                    onChange={(e) => setEditedId(e.target.value)}
                    className="bg-[#060a0f] border border-[#00ff66] rounded-lg px-2.5 py-1 text-sm font-mono font-black text-white outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveId}
                    className="p-1 rounded-lg bg-[#00ff66] text-black hover:bg-[#10e86b] cursor-pointer"
                  >
                    <Check size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black font-mono tracking-wider text-white">
                    {user?.gameId || 'COMMANDER'}
                  </h2>
                  <button
                    onClick={() => {
                      setEditedId(user?.gameId || '');
                      setIsEditingId(true);
                    }}
                    title="Change In-Game Name"
                    className="text-slate-400 hover:text-[#00ff66] p-1 cursor-pointer transition-colors"
                  >
                    <Edit2 size={13} />
                  </button>
                </div>
              )}
            </div>

            <span className="text-[10px] font-mono tracking-widest text-[#00ff66] uppercase font-bold mb-2">
              GAME ID / CALLSIGN
            </span>

            {/* Linked Google Account Info */}
            <div className="w-full mt-2 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="text-slate-400">GOOGLE ACCOUNT</span>
              <span className="text-slate-200 truncate max-w-[200px]">{user?.email || user?.name}</span>
            </div>
          </div>

          {/* Quick Battle Stats Banner */}
          <div className="w-full grid grid-cols-2 gap-3">
            <div className="bg-[#0b121b] border border-[#172331] rounded-2xl p-3 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[#00ff66]/10 text-[#00ff66]">
                <Shield size={18} />
              </div>
              <div className="text-left">
                <span className="text-[10px] font-mono text-slate-400 block">FLEET RANK</span>
                <span className="text-xs font-mono font-bold text-white">ELITE STRIKER</span>
              </div>
            </div>

            <div className="bg-[#0b121b] border border-[#172331] rounded-2xl p-3 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[#ff2a55]/10 text-[#ff2a55]">
                <Trophy size={18} />
              </div>
              <div className="text-left">
                <span className="text-[10px] font-mono text-slate-400 block">BATTLE MODE</span>
                <span className="text-xs font-mono font-bold text-white">PEG ARENA</span>
              </div>
            </div>
          </div>

          {/* 1-Day Cookie Active Indicator */}
          <div className="w-full bg-[#070c12] border border-slate-800/80 rounded-xl px-3 py-2 flex items-center justify-center gap-2 text-[11px] font-mono text-slate-400">
            <Clock size={13} className="text-[#00ff66]" />
            <span>1-Day Auto-Login active (cookie stored)</span>
          </div>

        </main>

        {/* Bottom Launcher Bar: Big START GAME Button */}
        <footer className="w-full shrink-0 p-5 bg-[#0a1018]/90 backdrop-blur-md border-t border-[#172331] z-10">
          <button
            onClick={onStartGame}
            className="w-full py-4 rounded-2xl bg-[#00ff66] hover:bg-[#12f073] text-black font-black text-base tracking-widest uppercase active:scale-98 transition-all shadow-[0_0_30px_rgba(0,255,102,0.4)] flex items-center justify-center gap-3 font-mono cursor-pointer"
          >
            <Play size={20} className="fill-black" />
            <span>START GAME</span>
          </button>
        </footer>

      </div>
    </div>
  );
}
