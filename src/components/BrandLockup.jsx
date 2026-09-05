import React from 'react';

export default function BrandLockup({ context, compact = false, className = '' }) {
  return (
    <div className={`brand-lockup ${compact ? 'brand-lockup--compact' : ''} ${className}`.trim()}>
      <img
        className="brand-lockup__mark"
        src="/noxpawble-mark.svg"
        alt=""
        aria-hidden="true"
      />
      <div className="brand-lockup__copy">
        <h1 className="brand-lockup__title">NoxPawble</h1>
        {context && <span className="brand-lockup__context">{context}</span>}
      </div>
    </div>
  );
}
