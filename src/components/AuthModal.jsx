import React, { useEffect, useRef, useState } from 'react';
import { decodeJwt } from '../utils/cookieStorage.js';
import { Gamepad2, Sparkles, ArrowRight, AlertCircle } from 'lucide-react';

export default function AuthModal({ onLoginSuccess }) {
  const googleBtnRef = useRef(null);
  const [googleUser, setGoogleUser] = useState(null);
  const [gameId, setGameId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isGsiReady, setIsGsiReady] = useState(false);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  // Handle Google Credential Response
  const handleGoogleCallback = (response) => {
    try {
      if (!response.credential) {
        setErrorMsg('No credential received from Google.');
        return;
      }
      const decoded = decodeJwt(response.credential);
      if (!decoded) {
        setErrorMsg('Failed to parse Google credentials.');
        return;
      }

      setGoogleUser({
        sub: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
      });

      // Default game handle based on Google name
      const cleanName = (decoded.name || 'Player')
        .replace(/\s+/g, '_')
        .substring(0, 14);
      setGameId(cleanName);
      setErrorMsg('');
    } catch (err) {
      console.error('Error handling Google response:', err);
      setErrorMsg('Google authentication failed. Please try again.');
    }
  };

  // Initialize Google Identity Services
  useEffect(() => {
    let checkInterval = null;

    const initGsi = () => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCallback,
            auto_select: false,
          });

          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'filled_black',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
            width: 280,
          });

          setIsGsiReady(true);
          if (checkInterval) clearInterval(checkInterval);
        } catch (err) {
          console.warn('GSI render error:', err);
        }
      }
    };

    if (window.google?.accounts?.id) {
      initGsi();
    } else {
      checkInterval = setInterval(initGsi, 200);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [clientId, googleUser]);

  // Final step: Confirm custom Game ID
  const handleConfirmGameId = (e) => {
    e.preventDefault();
    const trimmed = gameId.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a Game ID to continue.');
      return;
    }

    if (trimmed.length > 20) {
      setErrorMsg('Game ID must be 20 characters or fewer.');
      return;
    }

    onLoginSuccess({
      ...googleUser,
      gameId: trimmed,
      createdAt: Date.now(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#030508]/90 backdrop-blur-xl">
      <div className="relative w-full max-w-[400px] rounded-3xl bg-[#080d14] border border-[#172331] shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden p-6 text-center animate-in fade-in zoom-in-95 duration-200">
        
        {/* Glow ambient effect */}
        <div className="absolute -top-16 -left-16 w-36 h-36 bg-[#00ff66]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-36 h-36 bg-[#ff2a55]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#0e1622] border border-[#00ff66]/40 flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(0,255,102,0.25)]">
            <Gamepad2 className="text-[#00ff66]" size={28} />
          </div>
          <h1 className="text-xl font-black font-mono text-white tracking-wider">
            PEG MARBLE BATTLE
          </h1>
        </div>

        {errorMsg && (
          <div className="mb-4 px-3 py-2 rounded-xl bg-[#2b0c14] border border-[#ff2a55]/40 text-[#ff2a55] text-xs font-mono flex items-center gap-2 text-left animate-in fade-in">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Google Sign-In */}
        {!googleUser ? (
          <div className="flex flex-col items-center justify-center py-4">
            <div
              ref={googleBtnRef}
              className="flex items-center justify-center min-h-[44px]"
            />

            {!isGsiReady && (
              <div className="text-[11px] font-mono text-slate-500 animate-pulse mt-2">
                Connecting to Google...
              </div>
            )}
          </div>
        ) : (
          /* STEP 2: Choose Game ID */
          <form onSubmit={handleConfirmGameId} className="flex flex-col items-center gap-4 py-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* User Google Identity Badge */}
            <div className="w-full bg-[#0d1622] border border-[#1f3144] rounded-2xl p-3 flex items-center gap-3">
              <img
                src={googleUser.picture}
                alt={googleUser.name}
                className="w-12 h-12 rounded-full border-2 border-[#00ff66] shadow-[0_0_12px_rgba(0,255,102,0.4)] object-cover"
              />
              <div className="text-left overflow-hidden">
                <div className="text-xs font-mono font-bold text-white truncate">
                  {googleUser.name}
                </div>
                <div className="text-[11px] font-mono text-slate-400 truncate">
                  {googleUser.email}
                </div>
                <div className="text-[10px] font-mono text-[#00ff66] flex items-center gap-1 mt-0.5">
                  <Sparkles size={10} />
                  <span>Google Account Linked</span>
                </div>
              </div>
            </div>

            {/* Game ID Input */}
            <div className="w-full flex flex-col gap-1.5 text-left">
              <label className="text-xs font-mono font-bold text-slate-300 flex items-center justify-between">
                <span>CHOOSE YOUR GAME ID:</span>
                <span className="text-[10px] text-slate-500">{gameId.length}/20</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={20}
                  value={gameId}
                  onChange={(e) => setGameId(e.target.value)}
                  placeholder="e.g. CYBER_STRIKER"
                  autoFocus
                  required
                  className="w-full bg-[#070b10] border border-slate-700 focus:border-[#00ff66] rounded-xl px-3 py-2.5 text-sm font-mono text-white placeholder-slate-600 outline-none transition-all shadow-inner focus:shadow-[0_0_15px_rgba(0,255,102,0.2)]"
                />
              </div>
            </div>

            {/* Confirm & Save Button */}
            <button
              type="submit"
              className="w-full mt-2 py-3 rounded-xl bg-[#00ff66] hover:bg-[#10e86b] text-black font-black text-sm tracking-wider uppercase active:scale-95 transition-all shadow-[0_0_20px_rgba(0,255,102,0.4)] flex items-center justify-center gap-2 font-mono cursor-pointer"
            >
              <span>CONFIRM & ENTER</span>
              <ArrowRight size={16} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
