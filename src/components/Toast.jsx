import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function Toast({ message, tone = 'success', onDone }) {
  useEffect(() => { const id = setTimeout(onDone, 2400); return () => clearTimeout(id); }, [message, onDone]);
  return <div className={`toast toast--${tone}`} role="status">{tone === 'error' ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}<span>{message}</span></div>;
}
