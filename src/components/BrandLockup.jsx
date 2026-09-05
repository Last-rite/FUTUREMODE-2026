import React from 'react';

export default function BrandLockup({ compact = false, className = '' }) {
  return (
    <div className={`brand-lockup ${compact ? 'brand-lockup--compact' : ''} ${className}`.trim()}>
      <h1 className="brand-lockup__title">
        <img
          className="brand-lockup__image"
          src="/noxpawble-logo.svg"
          alt="NoxPawble"
        />
      </h1>
    </div>
  );
}
