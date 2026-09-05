import React from 'react';
import { Cat } from 'lucide-react';
import nxc1_64 from '../assets/nxc_1.png';
import nxc2_64 from '../assets/nxc_2.png';
import nxc3_64 from '../assets/nxc_3.png';
import nxc1_128 from '../assets/nxc_1_128.png';
import nxc2_128 from '../assets/nxc_2_128.png';
import nxc3_128 from '../assets/nxc_3_128.png';

const AVATARS_64 = {
  '01': nxc1_64,
  '1': nxc1_64,
  '02': nxc2_64,
  '2': nxc2_64,
  '03': nxc3_64,
  '3': nxc3_64,
};

const AVATARS_128 = {
  '01': nxc1_128,
  '1': nxc1_128,
  '02': nxc2_128,
  '2': nxc2_128,
  '03': nxc3_128,
  '3': nxc3_128,
};

export function getPetAvatar(pet, size = 'md') {
  if (!pet) return null;
  if (pet.avatar) return pet.avatar;
  if (pet.image) return pet.image;

  const code = String(pet.code || '').trim();
  let matchedCode = code;
  if (!matchedCode || !AVATARS_64[matchedCode]) {
    if (pet.name?.includes('FUTURE') || pet.idString?.includes('tech')) matchedCode = '02';
    else if (pet.name?.includes('COOL') || pet.idString?.includes('rush')) matchedCode = '03';
    else if (pet.name?.includes('NOXCAT') || pet.idString?.includes('core')) matchedCode = '01';
  }

  if (size === 'hero' || size === 'lg') {
    return AVATARS_128[matchedCode] || AVATARS_64[matchedCode] || null;
  }
  return AVATARS_64[matchedCode] || null;
}

export default function NoxPlaceholder({ pet, size = 'md', muted = false }) {
  const avatarSrc = getPetAvatar(pet, size);

  return (
    <div
      className={`nox-avatar nox-avatar--${size} ${muted ? 'nox-avatar--muted' : ''}`}
      style={{ '--pet-accent': pet?.accent || '#00ff66' }}
      aria-label={`${pet?.name || 'NOXCAT'} 圖像`}
    >
      <span className="nox-avatar__scan" />
      {avatarSrc ? (
        <img
          src={avatarSrc}
          alt={pet?.name || 'NOXCAT'}
          className="nox-avatar__img pixelated"
        />
      ) : (
        <>
          <Cat aria-hidden="true" />
          <span className="nox-avatar__code">NXC-{pet?.code || '00'}</span>
          <span className="nox-avatar__placeholder">ART PLACEHOLDER</span>
        </>
      )}
    </div>
  );
}
