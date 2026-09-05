import React, { useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, LogIn, UserPlus, UserRound } from 'lucide-react';
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
      <section className="auth-card">
        <header className="auth-brand">
          <BrandLockup />
        </header>

        <div className="auth-copy">
          <h2>{mode === 'login' ? '登入' : '建立帳號'}</h2>
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
            <span>帳號</span>
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
            <span>密碼</span>
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
              <span>玩家名稱</span>
              <div className="credential-input">
                <UserRound size={17} />
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

          {popupError && <p className="login-error" role="alert">{popupError}</p>}

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
          </button>
        </form>
      </section>
    </main>
  );
}
