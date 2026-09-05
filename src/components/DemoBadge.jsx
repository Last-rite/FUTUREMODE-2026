import React from 'react';
import { FlaskConical } from 'lucide-react';

export default function DemoBadge({ compact = false }) {
  return <div className={`demo-badge ${compact ? 'demo-badge--compact' : ''}`} title="資料只存在這台裝置的瀏覽器中"><FlaskConical size={12} /><span>{compact ? 'DEMO' : 'TEST BACKEND · LOCAL ONLY'}</span></div>;
}
