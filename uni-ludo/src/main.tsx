import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {uniLudoBot, uniLudoTelegramOnly} from '../../portal/uniludo/service';
import App from './App.tsx';
import {gameRequest, type GameSession} from './api';
import {getTelegramInitData, initTelegramWebApp} from './utils/telegram';
import './index.css';

function UniLudo() {
  const [session, setSession] = useState<GameSession>();
  const [status, setStatus] = useState('در حال بررسی حساب IEAUM…');
  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) { setStatus(uniLudoTelegramOnly); return; }
    initTelegramWebApp();
    void gameRequest<GameSession>('session', {initData}).then(setSession).catch(failure => setStatus(failure.message));
  }, []);
  if (session) return <App session={session} onDenied={message => {setSession(undefined); setStatus(message);}} />;
  return <main className="game-gate"><section className="game-panel">
    <img width={42} height={42} src="/ieaum-shell-mark.png" alt="IEAUM" />
    <h1>منچ صنایع</h1>
    <p role="status" style={{whiteSpace: 'pre-line'}}>{status}</p>
    <a className="game-secondary" href={uniLudoBot}>باز کردن ربات تلگرام</a>
  </section></main>;
}

createRoot(document.getElementById('root')!).render(<UniLudo />);
