import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {uniLudoBot, uniLudoTelegramOnly} from '../../portal/uniludo/service';
import { GameHome } from './GameHome';
import {gameRequest, type GameSession} from './api';
import {getTelegramInitData, initTelegramWebApp, telegramLaunchContext} from './utils/telegram';
import './index.css';

function UniLudo() {
  const [session, setSession] = useState<GameSession>();
  const [status, setStatus] = useState('در حال بررسی حساب IEAUM…');
  const [launch, setLaunch] = useState<ReturnType<typeof telegramLaunchContext>>({inTelegram: false, close: undefined});
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let started = false;
    let active = true;
    function open(ready: boolean) {
      const context = telegramLaunchContext();
      setLaunch(context);
      if (ready || context.inTelegram) initTelegramWebApp();
      if (started) return;
      const initData = getTelegramInitData();
      if (!initData) {
        if (!ready) return;
        setStatus(context.inTelegram
          ? 'هویت تلگرام دریافت نشد. مینی‌اپ را ببندید و منچ را از همان دکمهٔ ربات دوباره باز کنید.'
          : uniLudoTelegramOnly);
        setChecking(false);
        return;
      }
      started = true;
      setStatus('در حال بررسی حساب IEAUM…');
      setChecking(true);
      void gameRequest<GameSession>('session', {initData})
        .then(value => { if (active) setSession(value); })
        .catch(failure => { if (active) setStatus(failure.message); })
        .finally(() => { if (active) setChecking(false); });
    }
    const complete = () => open(true);
    const sdk = document.getElementById('telegram-web-app');
    sdk?.addEventListener('load', complete);
    sdk?.addEventListener('error', complete);
    const waitForSdk = window.setTimeout(complete, 1500);
    open(false);
    return () => {
      active = false;
      window.clearTimeout(waitForSdk);
      sdk?.removeEventListener('load', complete);
      sdk?.removeEventListener('error', complete);
    };
  }, []);
  if (session) return <GameHome session={session} onDenied={message => {setSession(undefined); setStatus(message);}} />;
  return <main className="game-gate"><section className="game-panel">
    <img width={42} height={42} src="/ieaum-shell-mark.png" alt="IEAUM" />
    <h1>منچ صنایع</h1>
    <p role="status" style={{whiteSpace: 'pre-line'}}>{status}</p>
    {!checking && (launch.inTelegram
      ? launch.close && <button type="button" className="game-secondary" onClick={launch.close}>بستن مینی‌اپ</button>
      : <a className="game-secondary" href={uniLudoBot}>باز کردن ربات تلگرام</a>)}
  </section></main>;
}

createRoot(document.getElementById('root')!).render(<UniLudo />);
