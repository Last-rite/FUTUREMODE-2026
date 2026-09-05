import React, { useState, useEffect } from 'react';
import AuthModal from './components/AuthModal.jsx';
import LobbyView from './components/LobbyView.jsx';
import GameView from './components/GameView.jsx';
import { getAuthCookie, setAuthCookie, clearAuthCookie } from './utils/cookieStorage.js';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState('loading'); // 'loading' | 'auth' | 'lobby' | 'game'

  // On initial mount: check 1-day cookie session
  useEffect(() => {
    const existingSession = getAuthCookie();
    if (existingSession && existingSession.gameId) {
      setCurrentUser(existingSession);
      setView('lobby');
    } else {
      setView('auth');
    }
  }, []);

  // Handle successful login (from Google + Game ID input)
  const handleLoginSuccess = (userData) => {
    setAuthCookie(userData);
    setCurrentUser(userData);
    setView('lobby');
  };

  // Handle user profile updates (e.g. edited Game ID in lobby)
  const handleUpdateUser = (updatedData) => {
    setAuthCookie(updatedData);
    setCurrentUser(updatedData);
  };

  // Handle sign out (clear 1-day cookie)
  const handleSignOut = () => {
    clearAuthCookie();
    setCurrentUser(null);
    setView('auth');
  };

  // Start the marble slingshot battle
  const handleStartGame = () => {
    setView('game');
  };

  // Return from game to the lobby dashboard
  const handleExitToLobby = () => {
    setView('lobby');
  };

  if (view === 'loading') {
    return (
      <div className="w-full h-[100dvh] flex items-center justify-center bg-[#05070a] text-[#00ff66] font-mono text-sm tracking-widest">
        INITIALIZING NOXCAT PROTOCOL...
      </div>
    );
  }

  return (
    <>
      {(!currentUser || view === 'auth') && (
        <AuthModal onLoginSuccess={handleLoginSuccess} />
      )}

      {currentUser && view === 'lobby' && (
        <LobbyView
          user={currentUser}
          onStartGame={handleStartGame}
          onSignOut={handleSignOut}
          onUpdateUser={handleUpdateUser}
        />
      )}

      {currentUser && view === 'game' && (
        <GameView
          user={currentUser}
          onExitToLobby={handleExitToLobby}
        />
      )}
    </>
  );
}
