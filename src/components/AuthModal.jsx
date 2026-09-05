import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Gamepad2, KeyRound, ShieldCheck, Sparkles, UserRound, Zap } from 'lucide-react';
import DemoBadge from './DemoBadge.jsx';

const DEMO_ACCOUNTS = [
  { label: '玩家 A', username: 'neon_mochi' },
  { label: '玩家 B', username: 'void_rider' },
];

export default function AuthModal({ onLoginSuccess }) {
  const [username, setUsername] = useState('neon_mochi');
  const [password, setPassword] = useState('demo1234');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fillAccount = (account) => {
    setUsername(account.username);
    setPassword('demo1234');
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!username.trim() || !password || isSubmitting) return;
    setIsSubmitting(true); setError('');
    try { await onLoginSuccess({ username, password }); }
    catch (loginError) { setError(loginError.message || '登入失敗'); }
    finally { setIsSubmitting(false); }
  };

  return (
    <main className="auth-screen">
      <div className="auth-grid" aria-hidden="true" />
      <section className="auth-card">
        <header className="auth-brand">
          <div className="auth-mark"><Gamepad2 size={22} /></div>
          <div><div className="eyebrow">NOXCAT NETWORK</div><h1>FUTUREMODE</h1></div>
          <DemoBadge compact />
        </header>

        <div className="auth-visual" aria-hidden="true">
          <div className="auth-orbit auth-orbit--one" /><div className="auth-orbit auth-orbit--two" />
          <div className="auth-core"><Zap size={36} fill="currentColor" /></div>
          <span className="auth-coordinate auth-coordinate--left">AUTH // LOCAL</span><span className="auth-coordinate auth-coordinate--right">NODE 0X-27</span>
        </div>

        <div className="auth-copy">
          <div className="eyebrow eyebrow--green"><Sparkles size={12} /> CAT DROP PROTOCOL</div>
          <h2>登入駕駛艙</h2>
          <p>使用帳號與密碼進入。此 Demo 的驗證只在本機執行，正式版本將交由後端處理。</p>
        </div>

        <div className="demo-account-pills">
          {DEMO_ACCOUNTS.map((account) => <button key={account.username} type="button" onClick={() => fillAccount(account)}><UserRound size={13} />{account.label}<span>{account.username}</span></button>)}
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>USERNAME</span>
            <div className="credential-input"><UserRound size={17} /><input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} autoComplete="username" aria-label="帳號" /></div>
          </label>
          <label>
            <span>PASSWORD</span>
            <div className="credential-input"><KeyRound size={17} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-label="密碼" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
          </label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="primary-action" type="submit" disabled={!username.trim() || !password || isSubmitting}><span>{isSubmitting ? '驗證測試帳號中…' : '進入遊戲'}</span><ArrowRight size={19} /></button>
        </form>

        <footer className="auth-footer"><ShieldCheck size={14} /><span>測試密碼為 <code>demo1234</code>。此版本不連接錢包，也不執行真實交易。</span></footer>
      </section>
    </main>
  );
}
