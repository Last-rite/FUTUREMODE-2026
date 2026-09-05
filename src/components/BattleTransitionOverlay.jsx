import React from 'react';

export default function BattleTransitionOverlay({ dungeon }) {
  return (
    <div className="battle-transition-overlay" aria-hidden="true">
      {/* Top Shutter */}
      <div className="battle-shutter battle-shutter--top">
        <div className="battle-shutter-stripe" />
      </div>

      {/* Bottom Shutter */}
      <div className="battle-shutter battle-shutter--bottom">
        <div className="battle-shutter-stripe" />
      </div>

      {/* Speedlines / Beam Slashes */}
      <div className="battle-speedlines">
        <div className="battle-speedline line-1" />
        <div className="battle-speedline line-2" />
        <div className="battle-speedline line-3" />
        <div className="battle-speedline line-4" />
      </div>

      {/* Central Cyber Combat Warning Banner */}
      <div className="battle-transition-center">
        <div className="battle-hud-bracket battle-hud-bracket--left" />
        <div className="battle-hud-content">
          <div className="battle-hud-sub">SYSTEM ALERT // ENGAGING ENEMY</div>
          <div className="battle-hud-title">COMBAT ENGAGED</div>
          <div className="battle-hud-target">
            SECTOR: <span className="text-[#35d9ff]">{dungeon?.name || 'ZONE 01'}</span>
          </div>
        </div>
        <div className="battle-hud-bracket battle-hud-bracket--right" />
      </div>

      {/* Cyber Flash Pulse */}
      <div className="battle-transition-flash" />
    </div>
  );
}
