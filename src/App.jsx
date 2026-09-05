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

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [data, setData] = useState(null);
  const [view, setView] = useState('loading');
  const [activeDungeon, setActiveDungeon] = useState(null);
  const [isEnteringBattle, setIsEnteringBattle] = useState(false);
  const [toast, setToast] = useState(null);
  const transitionTimeoutsRef = useRef([]);

  const clearTransitionTimeouts = () => {
    transitionTimeoutsRef.current.forEach((id) => clearTimeout(id));
    transitionTimeoutsRef.current = [];
  };

  useEffect(() => {
    const bootstrap = async () => {
      const session = getAuthCookie();
      if (!session?.id) { setView('auth'); return; }
      const gameData = await demoApi.getGameData(session.id);
      setCurrentUser(session); setData(gameData); setView('home');
    };
    bootstrap();
  }, []);

  const handleLoginSuccess = async ({ mode, username, password, displayName }) => {
    const user = mode === 'register'
      ? await demoApi.register(username, password, displayName)
      : await demoApi.login(username, password);
    const gameData = await demoApi.getGameData(user.id);
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
    showMessage(status === 'accepted' ? '已接受測試交易' : '已拒絕測試交易');
  };

  const handleReset = async () => {
    const nextData = await demoApi.reset(currentUser?.id);
    setData(nextData);
    showMessage('測試資料已重置');
  };

  const handleStartGame = (dungeon) => {
    clearTransitionTimeouts();
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
          onExitToLobby={() => setView('home')}
          onBattleComplete={(result) => demoApi.recordBattleResult(result, activeDungeon?.id)}
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
                  onReset={handleReset}
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
