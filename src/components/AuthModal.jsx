import React, { useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Eye, EyeOff, KeyRound, LogIn, Sparkles, UserPlus, UserRound, X, Zap } from 'lucide-react';
import BrandLockup from './BrandLockup.jsx';

const sanitizeName = (val) => val.replace(/[^\p{Script=Han}a-zA-Z0-9]/gu, '').slice(0, 16);

export default function AuthModal({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [popupError, setPopupError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isComposingRef = useRef(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!username.trim() || !password || isSubmitting) return;
    if (mode === 'register') {
      const cleanName = sanitizeName(displayName);
      if (!cleanName) {
        setPopupError('玩家暱稱僅限中文、英文字母或數字');
        return;
      }
    }
    setIsSubmitting(true);
    setPopupError('');
    try {
      await onLoginSuccess({
        mode,
        username,
        password,
        displayName: sanitizeName(displayName),
      });
    } catch (loginError) {
      if (mode === 'login') {
        setPopupError('本帳號不存在或密碼不正確');
      } else {
        setPopupError(loginError.message || '創建帳號失敗');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = mode === 'login'
    ? (username.trim() && password)
    : (username.trim() && displayName.trim() && password);

  return (
    <main className="auth-screen">
      <div className="auth-grid" aria-hidden="true" />
      <section className="auth-card">
        <header className="auth-brand">
          <BrandLockup />
        </header>

        <div className="auth-visual" aria-hidden="true">
          <div className="auth-orbit auth-orbit--one" /><div className="auth-orbit auth-orbit--two" />
          <div className="auth-core"><Zap size={36} fill="currentColor" /></div>
          <span className="auth-coordinate auth-coordinate--left">AUTH // LOCAL</span><span className="auth-coordinate auth-coordinate--right">NODE 0X-27</span>
        </div>

        <div className="auth-copy">
          <div className="eyebrow eyebrow--green"><Sparkles size={12} /> CAT DROP PROTOCOL</div>
          <h2>{mode === 'login' ? '登入駕駛艙' : '創建新帳號'}</h2>
        </div>

        <div className="auth-mode-switch" role="tablist">
          <button
            type="button"
            className={`auth-mode-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setPopupError(''); }}
            role="tab"
            aria-selected={mode === 'login'}
          >
            <LogIn size={15} />
            <span>登入帳號</span>
          </button>
          <button
            type="button"
            className={`auth-mode-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setPopupError(''); }}
            role="tab"
            aria-selected={mode === 'register'}
          >
            <UserPlus size={15} />
            <span>創建新帳號</span>
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>USERNAME</span>
            <div className="credential-input">
              <UserRound size={17} />
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                autoComplete="username"
                placeholder="帳號"
                aria-label="帳號"
              />
            </div>
          </label>

          <label>
            <span>PASSWORD</span>
            <div className="credential-input">
              <KeyRound size={17} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="密碼"
                aria-label="密碼"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          {mode === 'register' && (
            <label>
              <span>PLAYER DISPLAY NAME</span>
              <div className="credential-input">
                <Sparkles size={17} />
                <input
                  value={displayName}
                  onChange={(event) => {
                    if (isComposingRef.current) {
                      setDisplayName(event.target.value);
                    } else {
                      setDisplayName(sanitizeName(event.target.value));
                    }
                  }}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={(event) => {
                    isComposingRef.current = false;
                    setDisplayName(sanitizeName(event.target.value));
                  }}
                  onBlur={(event) => {
                    isComposingRef.current = false;
                    setDisplayName(sanitizeName(event.target.value));
                  }}
                  placeholder="玩家暱稱"
                  aria-label="玩家暱稱"
                  maxLength={16}
                />
              </div>
            </label>
          )}

          <button
            className="primary-action"
            type="submit"
            disabled={!isFormValid || isSubmitting}
          >
            <span>
              {isSubmitting
                ? (mode === 'login' ? '登入中…' : '創建帳號中…')
                : (mode === 'login' ? '登入帳號' : '創建新帳號')}
            </span>
            <ArrowRight size={19} />
          </button>
        </form>
      </section>

      {popupError && (
        <div className="auth-popup-backdrop" onClick={() => setPopupError('')}>
          <div
            className="auth-popup-card"
            role="alertdialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="auth-popup-header">
              <div className="auth-popup-icon"><AlertTriangle size={18} /></div>
              <div className="auth-popup-title">認證錯誤 // AUTH ERROR</div>
              <button
                type="button"
                className="auth-popup-close"
                onClick={() => setPopupError('')}
                aria-label="關閉"
              >
                <X size={16} />
              </button>
            </div>
            <div className="auth-popup-body">
              <p>{popupError}</p>
            </div>
            <div className="auth-popup-actions">
              <button
                type="button"
                className="auth-popup-btn"
                onClick={() => setPopupError('')}
              >
                確認
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
