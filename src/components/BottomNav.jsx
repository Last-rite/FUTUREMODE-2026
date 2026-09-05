import React from 'react';
import { Cat, House, Repeat2 } from 'lucide-react';

const ITEMS = [
  { id: 'collection', label: '收藏', icon: Cat },
  { id: 'home', label: '主畫面', icon: House },
  { id: 'trade', label: '交易', icon: Repeat2 },
];

export default function BottomNav({ active, onNavigate }) {
  return (
    <nav className="bottom-nav" aria-label="主要導覽">
      {ITEMS.map(({ id, label, icon: Icon }) => (
        <button key={id} className={active === id ? 'is-active' : ''} onClick={() => onNavigate(id)} aria-current={active === id ? 'page' : undefined}>
          <span><Icon size={20} /></span><small>{label}</small>
        </button>
      ))}
    </nav>
  );
}
