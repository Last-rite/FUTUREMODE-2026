import React, { useEffect, useState, useRef } from 'react';
import AuthModal from './components/AuthModal.jsx';
import LobbyView from './components/LobbyView.jsx';
import CollectionView from './components/CollectionView.jsx';
import TradeView from './components/TradeView.jsx';
import GameView from './components/GameView.jsx';
import BottomNav from './components/BottomNav.jsx';
import Toast from './components/Toast.jsx';
import BattleTransitionOverlay from './components/BattleTransitionOverlay.jsx';
import BrandLockup from './components/BrandLockup.jsx';
import { demoApi } from './demo-backend/api.js';
import { getAuthCookie, setAuthCookie, clearAuthCookie } from './utils/cookieStorage.js';
import { getActiveTeam } from './utils/teamStorage.js';
import { startBackgroundPreload, preloadGameDataAssets } from './utils/assetPreloader.js';
import { sound } from './game/audio.js';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [data, setData] = useState(null);
  const [view, setView] = useState('loading');
  const [activeDungeon, setActiveDungeon] = useState(null);
  const [battleOutcome, setBattleOutcome] = useState(null);
  const [isEnteringBattle, setIsEnteringBattle] = useState(false);
  const [toast, setToast] = useState(null);
  const transitionTimeoutsRef = useRef([]);

  const clearTransitionTimeouts = () => {
    transitionTimeoutsRef.current.forEach((id) => clearTimeout(id));
    transitionTimeoutsRef.current = [];
  };

  useEffect(() => {
    // Start preloading images in the background early (from boot / login screen)
    startBackgroundPreload();

    const bootstrap = async () => {
      const session = getAuthCookie();
      if (!session?.id) { setView('auth'); return; }
      const gameData = await demoApi.getGameData(session.id);
      preloadGameDataAssets(gameData);
      setCurrentUser(session); setData(gameData); setView('home');
    };
    bootstrap();
  }, []);

  useEffect(() => {
    if (view !== 'game') {
      sound.playMusic('base');
      return;
    }

    if (battleOutcome === 'PLAYER') {
      sound.playMusic('victory', { restart: true });
    } else if (battleOutcome) {
      sound.playMusic('defeat', { restart: true });
    } else {
      sound.playMusic('battle');
    }
  }, [view, battleOutcome]);

  useEffect(() => () => sound.stopMusic(), []);

  const handleLoginSuccess = async ({ mode, username, password, displayName }) => {
    const user = mode === 'register'
      ? await demoApi.register(username, password, displayName)
      : await demoApi.login(username, password);
    const gameData = await demoApi.getGameData(user.id);
    preloadGameDataAssets(gameData);
    setAuthCookie(user); setCurrentUser(user); setData(gameData); setView('home');
  };
  const handleSignOut = () => { clearAuthCookie(); setCurrentUser(null); setView('auth'); };
  const showMessage = (message, tone = 'success') => setToast({ message, tone, key: Date.now() });

  const handleToggleParty = async (petId) => {
    const nextData = await demoApi.togglePartyMember(petId, currentUser?.id);
    setData(nextData);
  };

  const handleEquipItem = async (petId, itemId) => {
    const nextData = await demoApi.equipItem(petId, itemId, currentUser?.id);
    setData(nextData);
  };

  const handleAddPet = async (petData) => {
    const nextData = await demoApi.addPet(petData, currentUser?.id);
    setData(nextData);
    showMessage('成功召喚新 NOXCAT！');
  };

  const handleAddItem = async (itemData) => {
    const nextData = await demoApi.addItem(itemData, currentUser?.id);
    setData(nextData);
    showMessage('成功鍛造新裝備！');
  };

  const handleCreateTrade = async (trade) => {
    const nextData = await demoApi.createTrade({ ...trade, playerId: currentUser?.id });
    setData(nextData);
  };

  const handleResolveTrade = async (tradeId, status) => {
    const nextData = await demoApi.resolveTrade(tradeId, status, currentUser?.id);
    setData(nextData);
    showMessage(status === 'accepted' ? '已接受交易' : '已拒絕交易');
  };

  const handleStartGame = (dungeon) => {
    clearTransitionTimeouts();
    setBattleOutcome(null);
    sound.playMusic('battle', { restart: true });
    setActiveDungeon(dungeon);
    setIsEnteringBattle(true);
    // Switch to game screen mid-transition (450ms) behind closed shutters
    const t1 = setTimeout(() => {
      setView('game');
    }, 450);
    // Shutters open at 1.0s; text banner floats atop combat field until 1.8s
    const t2 = setTimeout(() => {
      setIsEnteringBattle(false);
    }, 1800);
    transitionTimeoutsRef.current = [t1, t2];
  };

  const handleDismissTransition = () => {
    clearTransitionTimeouts();
    setView('game');
    const t = setTimeout(() => {
      setIsEnteringBattle(false);
    }, 200);
    transitionTimeoutsRef.current = [t];
  };

  const handleBattleComplete = async (result) => {
    setBattleOutcome(result?.winner || 'AI');
    const nextData = await demoApi.recordBattleResult(result, activeDungeon?.id, currentUser?.id);
    setData(nextData);
  };

  const handleExitBattle = () => {
    setBattleOutcome(null);
    setView('home');
  };

  if (view === 'loading') return <div className="boot-screen"><BrandLockup /><div className="boot-line"><i /></div></div>;
  if (!currentUser || view === 'auth') return <AuthModal onLoginSuccess={handleLoginSuccess} />;
  if (!data) return null;

  return (
    <>
      {view === 'game' ? (
        <GameView
          user={currentUser}
          dungeon={activeDungeon}
          playerTeam={getActiveTeam(data)}
          onExitToLobby={handleExitBattle}
          onBattleComplete={handleBattleComplete}
        />
      ) : (
        <div className="app-viewport">
          <div className="phone-shell">
            <div className="view-transition" key={view}>
              {view === 'home' && (
                <LobbyView
                  user={currentUser}
                  data={data}
                  onStartGame={handleStartGame}
                  onSignOut={handleSignOut}
                />
              )}
              {view === 'collection' && (
                <CollectionView
                  data={data}
                  onToggleParty={handleToggleParty}
                  onEquipItem={handleEquipItem}
                  onMessage={showMessage}
                />
              )}
              {view === 'trade' && (
                <TradeView
                  data={data}
                  currentUser={currentUser}
                  onCreateTrade={handleCreateTrade}
                  onResolveTrade={handleResolveTrade}
                  onMessage={showMessage}
                />
              )}
            </div>
            <BottomNav active={view} onNavigate={setView} />
            {toast && <Toast key={toast.key} message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
          </div>
        </div>
      )}
      {isEnteringBattle && (
        <BattleTransitionOverlay
          dungeon={activeDungeon}
          onDismiss={handleDismissTransition}
        />
      )}
    </>
  );
}
