import React, { useEffect, useState } from 'react';
import AuthModal from './components/AuthModal.jsx';
import LobbyView from './components/LobbyView.jsx';
import CollectionView from './components/CollectionView.jsx';
import TradeView from './components/TradeView.jsx';
import GameView from './components/GameView.jsx';
import BottomNav from './components/BottomNav.jsx';
import Toast from './components/Toast.jsx';
import { demoApi } from './demo-backend/api.js';
import { getAuthCookie, setAuthCookie, clearAuthCookie } from './utils/cookieStorage.js';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [data, setData] = useState(null);
  const [view, setView] = useState('loading');
  const [activeDungeon, setActiveDungeon] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const bootstrap = async () => {
      const session = getAuthCookie();
      if (!session?.id) { setView('auth'); return; }
      const gameData = await demoApi.getGameData();
      setCurrentUser(session); setData(gameData); setView('home');
    };
    bootstrap();
  }, []);

  const handleLoginSuccess = async ({ username, password }) => {
    const [user, gameData] = await Promise.all([demoApi.login(username, password), demoApi.getGameData()]);
    setAuthCookie(user); setCurrentUser(user); setData(gameData); setView('home');
  };
  const handleSignOut = () => { clearAuthCookie(); setCurrentUser(null); setView('auth'); };
  const showMessage = (message, tone = 'success') => setToast({ message, tone, key: Date.now() });

  const handleToggleParty = async (petId) => {
    const nextData = await demoApi.togglePartyMember(petId);
    setData(nextData);
  };

  const handleEquipItem = async (petId, itemId) => {
    const nextData = await demoApi.equipItem(petId, itemId);
    setData(nextData);
  };

  const handleCreateTrade = async (trade) => {
    const nextData = await demoApi.createTrade(trade);
    setData(nextData);
  };

  const handleResolveTrade = async (tradeId, status) => {
    const nextData = await demoApi.resolveTrade(tradeId, status);
    setData(nextData);
    showMessage(status === 'accepted' ? '已接受測試交易' : '已拒絕測試交易');
  };

  const handleReset = async () => {
    const nextData = await demoApi.reset();
    setData(nextData);
    showMessage('測試資料已重置');
  };

  if (view === 'loading') return <div className="boot-screen"><span className="boot-logo">FM</span><span>LOADING LOCAL NODE</span><div className="boot-line"><i /></div></div>;
  if (!currentUser || view === 'auth') return <AuthModal onLoginSuccess={handleLoginSuccess} />;
  if (!data) return null;
  if (view === 'game') return <GameView user={currentUser} dungeon={activeDungeon} onExitToLobby={() => setView('home')} onBattleComplete={(result) => demoApi.recordBattleResult(result, activeDungeon?.id)} />;

  return (
    <div className="app-viewport">
      <div className="phone-shell">
        <div className="view-transition" key={view}>
          {view === 'home' && <LobbyView user={currentUser} data={data} onStartGame={(dungeon) => { setActiveDungeon(dungeon); setView('game'); }} onSignOut={handleSignOut} onReset={handleReset} />}
          {view === 'collection' && <CollectionView data={data} onToggleParty={handleToggleParty} onEquipItem={handleEquipItem} onMessage={showMessage} />}
          {view === 'trade' && <TradeView data={data} onCreateTrade={handleCreateTrade} onResolveTrade={handleResolveTrade} onMessage={showMessage} />}
        </div>
        <BottomNav active={view} onNavigate={setView} />
        {toast && <Toast key={toast.key} message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
      </div>
    </div>
  );
}
