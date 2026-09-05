import React, { useState } from 'react';

export default function BattleTransitionOverlay({ onDismiss }) {
  const [isDismissing, setIsDismissing] = useState(false);

  const handleClick = () => {
    if (isDismissing) return;
    setIsDismissing(true);
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <div
      className={`battle-transition-overlay ${isDismissing ? 'is-dismissing' : ''}`}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleClick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Skip combat transition"
    >
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
          <div className="battle-hud-title">COMBAT</div>
        </div>
        <div className="battle-hud-bracket battle-hud-bracket--right" />
      </div>

      {/* Cyber Flash Pulse */}
      <div className="battle-transition-flash" />
    </div>
  );
}
