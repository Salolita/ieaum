import {useCallback, useState} from 'react';
import {roomIdPattern} from '../../portal/uniludo/service';
import type {GameSession} from './api';
import {GameError} from './api';
import App from './App';
import {CreateRoom, OnlineGame, RoomList} from './OnlineGame';
import {Ranking} from './Ranking';
import {TitleEmblem} from './components/TitleEmblem';
import backdrop from './assets/campus.jpg';

type Page = 'home' | 'bots' | 'ranking' | 'create' | 'room';
function invitedRoom() {
  const id = new URLSearchParams(location.search).get('room') ?? '';
  return roomIdPattern.test(id) ? id : '';
}

export function GameHome({session, onDenied}: {session: GameSession; onDenied: (message: string) => void}) {
  const [selected, setSelected] = useState(invitedRoom);
  const [page, setPage] = useState<Page>(() => session.student && invitedRoom() ? 'room' : 'home');
  const home = () => {
    setPage('home');
    const url = new URL(location.href);
    if (url.searchParams.has('room')) {
      url.searchParams.delete('room'); history.replaceState(history.state, '', url);
    }
  };
  const choose = (id: string) => {setSelected(id); setPage('room');};
  const rankError = useCallback((error: unknown) => {
    if (error instanceof GameError && error.status === 401) onDenied(error.message);
    return error instanceof Error ? error.message : 'ارتباط با رنکینگ برقرار نشد.';
  }, [onDenied]);
  if (page === 'bots') return <App session={session} onDenied={onDenied} onBack={home} />;
  if (page === 'ranking') return <Ranking token={session.token} onClose={home} onError={rankError} />;
  if (page === 'create') return <CreateRoom token={session.token} onCreated={choose} onBack={home} />;
  if (page === 'room') return <OnlineGame key={selected} id={selected} session={session} onBack={home} onDenied={onDenied} />;
  return <main className="game-home" style={{backgroundImage:`linear-gradient(#130f1be8,#130f1bf5),url(${backdrop})`}}>
    <section className="game-panel">
      <header className="game-home-brand">
        <div><img src="/ieaum-shell-mark.png" width={38} height={38} alt="" /><bdi>IEAUM</bdi></div>
        <TitleEmblem />
      </header>
      <div className="game-home-actions">
        <button className="game-secondary" onClick={() => setPage('bots')}>بازی با ربات</button>
        <button className="game-secondary" disabled={!session.student} onClick={() => setPage('create')}>بازی با همکلاسی‌ها</button>
      </div>
      <section className="game-home-rooms" aria-labelledby="game-rooms-title">
        <div className="room-heading"><h2 id="game-rooms-title">لیست جلسات بازی</h2>
          <button className="game-secondary" onClick={() => setPage('ranking')}>رنکینگ</button></div>
        {session.student ? <RoomList token={session.token} onSelect={choose} /> : <p>جلسات آنلاین برای حساب‌های دانشجویی فعال‌اند.</p>}
      </section>
    </section>
  </main>;
}
