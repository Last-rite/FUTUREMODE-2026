import React from 'react';
import { Cat, HandCoins, House } from 'lucide-react';

const ITEMS = [
  { id: 'collection', label: '收藏', icon: Cat },
  { id: 'home', label: '主畫面', icon: House },
  { id: 'trade', label: '交易', icon: HandCoins },
];

export default function BottomNav({ active, onNavigate }) {
  return (
    <nav className="bottom-nav sketch-bottom-nav" aria-label="主要導覽">
      {ITEMS.map(({ id, label, icon: Icon }) => (
        <button key={id} className={active === id ? 'is-active' : ''} onClick={() => onNavigate(id)} aria-current={active === id ? 'page' : undefined}>
          <span className="sketch-bottom-nav__icon"><Icon size={23} strokeWidth={2.2} /></span><small>{label}</small>
        </button>
      ))}
    </nav>
  );
}
