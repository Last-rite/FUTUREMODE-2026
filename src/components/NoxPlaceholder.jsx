import React from 'react';
import { Cat } from 'lucide-react';

export default function NoxPlaceholder({ pet, size = 'md', muted = false }) {
  return (
    <div className={`nox-avatar nox-avatar--${size} ${muted ? 'nox-avatar--muted' : ''}`} style={{ '--pet-accent': pet?.accent || '#00ff66' }} aria-label={`${pet?.name || 'NOXCAT'} 圖像 placeholder`}>
      <span className="nox-avatar__scan" />
      <Cat aria-hidden="true" />
      <span className="nox-avatar__code">NXC-{pet?.code || '00'}</span>
      <span className="nox-avatar__placeholder">ART PLACEHOLDER</span>
    </div>
  );
}
