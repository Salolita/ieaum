import {useEffect, useRef, useState, type FormEvent} from 'react';
import {TEAM_ORDER, TEAMS, type TeamId} from '../../portal/uniludo/constants';
import {getActivePlayer, getLegalMoves, getStandings} from '../../portal/uniludo/rules';
import {type OnlineRoom, type RoomSummary} from '../../portal/uniludo/service';
import {GameError, gameRequest, type GameSession} from './api';
import {MenchBoard} from './components/MenchBoard';
import {DiceWidget} from './components/DiceWidget';
import {RulesModal} from './components/GameModals';
import {gameAudio} from './utils/audio';
import {toPersianDigits as digits, loadStoredStats, saveStoredStats} from './utils/storage';

type RoomResponse = {room: OnlineRoom; dice?: number};
const message = (failure: unknown) => failure instanceof Error ? failure.message : 'ارتباط با جلسه برقرار نشد.';
const resetQuestion = 'آیا مطمئن هستید از ریست این بازی؟';

export function RoomList({token, onSelect}: {token: string; onSelect: (id: string) => void}) {
  const [rooms, setRooms] = useState<RoomSummary[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let timer: number;
    async function refresh() {
      try {
        const result = await gameRequest<{rooms: RoomSummary[]}>('room-list', {}, token);
        if (active) { setRooms(result.rooms); setError(''); }
      } catch (failure) {
        if (active) setError(message(failure));
      } finally {
        if (active) timer = window.setTimeout(refresh, 8000);
      }
    }
    void refresh();
    return () => { active = false; window.clearTimeout(timer); };
  }, [token]);
  if (error) return <p role="alert" className="game-error">{error}</p>;
  if (!rooms) return <p role="status">در حال دریافت جلسات…</p>;
  if (!rooms.length) return <p>جلسهٔ بازی فعالی وجود ندارد.</p>;
  return <ul className="room-list">{rooms.map(room => <li key={room.id}>
    <button type="button" className="room-card" data-started={room.status === 'playing'} disabled={room.status === 'playing' && !room.joined && !room.owner}
      onClick={() => onSelect(room.id)}>
      <strong>{room.title}</strong>
      {room.status === 'playing' ? <span>این بازی شروع شده است.</span>
        : <span>{room.mode === 'ranked' ? 'امتیازی' : 'دورهمی'} · {digits(room.count)} از {digits(room.capacity)} نفر</span>}
      {room.owner && <span>جلسهٔ شما</span>}
      {room.status === 'playing' && (room.joined || room.owner) && <span>ادامهٔ بازی</span>}
    </button>
  </li>)}</ul>;
}

export function CreateRoom({token, onCreated, onBack}: {
  token: string; onCreated: (id: string) => void; onBack: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const {room} = await gameRequest<RoomResponse>('room-create', {
        title: fields.get('title'), capacity: Number(fields.get('capacity')), mode: fields.get('mode'),
      }, token);
      onCreated(room.id);
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }
  return <main className="game-ranking"><section className="game-panel">
    <button className="game-secondary" onClick={onBack}>بازگشت</button>
    <h1>ساخت جلسهٔ بازی</h1>
    <form className="room-form" onSubmit={submit}>
      <label>نام جلسه<input className="game-field" required name="title" maxLength={60} /></label>
      <label>تعداد شرکت‌کنندگان<select className="game-field" name="capacity">
        <option value="2">۲ نفر</option><option value="3">۳ نفر</option><option value="4">۴ نفر</option>
      </select></label>
      <label>نوع بازی<select className="game-field" name="mode">
        <option value="casual">دورهمی</option><option value="ranked">امتیازی</option>
      </select></label>
      <button className="game-secondary" disabled={busy}>ساخت جلسه</button>
      {error && <p role="alert" className="game-error">{error}</p>}
    </form>
  </section></main>;
}

export function OnlineGame({id, session, onBack, onDenied}: {
  id: string; session: GameSession; onBack: () => void; onDenied: (message: string) => void;
}) {
  const {token} = session;
  const [room, setRoom] = useState<OnlineRoom>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [rolling, setRolling] = useState(false);
  const [dice, setDice] = useState<number>();
  const [rules, setRules] = useState(false);
  const [muted, setMuted] = useState(() => loadStoredStats().muted);
  const [notice, setNotice] = useState('');
  const [stopped, setStopped] = useState(false);
  const lock = useRef(false);
  const newest = useRef<OnlineRoom>(undefined);

  useEffect(() => { gameAudio.setMuted(muted); }, [muted]);
  useEffect(() => {
    const leaveWaitingRoom = () => {
      if (newest.current?.status === 'waiting' && newest.current.joined) {
        void gameRequest('room-leave', {roomId:id}, token, true).catch(() => {});
      }
    };
    window.addEventListener('pagehide', leaveWaitingRoom);
    return () => window.removeEventListener('pagehide', leaveWaitingRoom);
  }, [id, token]);
  useEffect(() => {
    let active = true;
    let timer: number;
    async function refresh() {
      try {
        if (!lock.current && !document.hidden) {
          const {room: received} = await gameRequest<RoomResponse>('room-view', {roomId:id}, token);
          if (active && !lock.current && (!newest.current || received.revision >= newest.current.revision)) {
            newest.current = received;
            setRoom(received);
            setConnectionError('');
          }
        }
      } catch (failure) {
        if (active) {
          if (failure instanceof GameError && failure.status === 401) { onDenied(failure.message); return; }
          setConnectionError(message(failure));
          if (failure instanceof GameError && failure.status === 409) { setStopped(true); return; }
        }
      }
      if (active) timer = window.setTimeout(refresh, newest.current?.status === 'playing' ? 2200 : 5000);
    }
    void refresh();
    return () => { active = false; window.clearTimeout(timer); };
  }, [id, token, onDenied]);

  async function command(action: string, input: Record<string, unknown> = {}, exit = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError('');
    try {
      const result = await gameRequest<RoomResponse>('room-' + action, {roomId:id, ...input}, token);
      if (exit) { onBack(); return; }
      const received = result.room;
      newest.current = received;
      setRoom(received);
      if (action === 'roll') {
        if (result.dice === 6) gameAudio.playSixChime();
        setDice(result.dice);
      }
      if (action === 'reset') setDice(undefined);
      if (action === 'move') {
        gameAudio.playPawnHop();
        if (received.state?.lastEvent && received.state.lastEvent.turn !== room?.state?.lastEvent?.turn) {
          gameAudio.playCampusEvent(received.state.lastEvent.event.kind !== 'setback');
        }
        if (received.status === 'finished') gameAudio.playVictoryFanfare();
      }
    } catch (failure) {
      if (failure instanceof GameError && failure.status === 401) onDenied(failure.message);
      else setError(message(failure));
    } finally {
      lock.current = false; setBusy(false); setRolling(false);
    }
  }

  const invite = 'https://t.me/ieaumbot?start=uniludo_' + id;
  async function copyInvite() {
    try { await navigator.clipboard.writeText(invite); setNotice('لینک دعوت کپی شد.'); }
    catch { setNotice('لینک دعوت را از کادر زیر بردارید.'); }
  }
  const state = room?.state;
  const active = state && getActivePlayer(state);
  const myTurn = room?.status === 'playing' && !!room.team && active?.teamId === room.team;
  const moves = myTurn && active && state?.phase === 'awaiting_move' && state.diceValue !== null
    ? getLegalMoves(state, active.id, state.diceValue) : [];
  const leave = () => {
    if (!room || room.status !== 'waiting' || !room.joined || stopped) onBack();
    else void command('leave', {}, true);
  };

  return <main className="room-page"><section className="game-panel">
    <header className="room-heading">
      <button className="game-secondary" disabled={busy} onClick={leave}>بازگشت به جلسات</button>
      <h1>{room?.title ?? 'جلسهٔ بازی'}</h1>
    </header>
    {(error || connectionError) && <p role="alert" className="game-error">{connectionError || error}</p>}
    {!room && !connectionError && <p role="status">در حال دریافت جلسه…</p>}
    {room && !stopped && <>
      <p>{room.mode === 'ranked' ? 'امتیازی' : 'دورهمی'} · {digits(room.count)} از {digits(room.capacity)} نفر</p>
      {room.owner && room.status !== 'finished' &&
        <form className="room-heading" onSubmit={event => {
          event.preventDefault();
          void command('rename', {title:new FormData(event.currentTarget).get('title')});
        }}>
          <input className="game-field" aria-label="نام جدید جلسه" name="title" required maxLength={60} defaultValue={room.title} />
          <button className="game-secondary" disabled={busy}>ویرایش نام</button>
        </form>}
      {room.owner && room.status === 'waiting' && <>
        <button className="game-secondary" disabled={busy} onClick={() => void copyInvite()}>کپی لینک دعوت</button>
        {notice && <p role="status">{notice}</p>}
        <input aria-label="لینک دعوت" className="game-field" readOnly dir="ltr" value={invite} onFocus={event => event.currentTarget.select()} />
      </>}
      {room.owner && (room.status === 'waiting' || room.status === 'playing') &&
        <button className="game-secondary" disabled={busy} onClick={() => {
          if (window.confirm('آیا از حذف این جلسه مطمئن هستید؟')) void command('delete', {}, true);
        }}>حذف جلسه</button>}

      {room.status === 'waiting' && <>
        <h2>انتخاب نقش</h2>
        <div className="room-teams">
          {TEAM_ORDER.map(team => {
            const assigned = room.members.find(player => player.team === team);
            return <button key={team} className="game-secondary" type="button" aria-pressed={room.team === team}
              disabled={busy || Boolean(assigned) || (!room.joined && room.count >= room.capacity)}
              onClick={() => void command('join', {team})}>
              <span>{team === 'optimization' ? 'بهینه‌ساز' : TEAMS[team].shortName}</span>
              {assigned && <span>{assigned.name}</span>}
            </button>;
          })}
        </div>
        {room.count === room.capacity ? room.owner ? <>
          <p role="status">بازی آماده‌ست.</p>
          <button className="game-secondary" disabled={busy} onClick={() => void command('start',{revision:room.revision})}>تأیید و شروع بازی</button>
        </> : <p role="status">منتظر شروع بازی توسط مدیر جلسه…</p> : <p role="status">منتظر ورود بازیکنان…</p>}
      </>}

      {room.status === 'playing' && !state && <p>این بازی شروع شده است.</p>}
      {state && active && <>
        <div className="room-heading">
          <button className="game-secondary" onClick={() => setRules(true)}>قوانین</button>
          <button className="game-secondary" onClick={() => {
            saveStoredStats({...loadStoredStats(), muted:!muted}); setMuted(!muted);
          }}>{muted ? 'فعال کردن صدا' : 'بی‌صدا کردن'}</button>
          {room.owner && room.status === 'playing' && <button className="game-secondary" disabled={busy} onClick={() => {
            if (window.confirm(resetQuestion)) void command('reset',{revision:room.revision});
          }}>ریست بازی</button>}
        </div>
        <ul className="room-player-strip">{state.players.map(player => <li key={player.id} style={{borderColor:TEAMS[player.teamId].color}}>
          {player.name}{player.finishRank ? ' · ' + digits(player.finishRank) : ''}
        </li>)}</ul>
        <MenchBoard players={state.players} pawns={state.pawns} activePlayerId={active.id} legalMoves={moves}
          ruleMode={state.config.ruleMode} animatingPawnCoord={null} captureFlashCoord={null}
          interactive={myTurn && !busy} onSelectMove={move => void command('move',{revision:room.revision,pawnId:move.pawnId})} />
        {room.status === 'finished' ? <>
          <h2>نتیجهٔ بازی</h2>
          <ol>{getStandings(state).sort((a,b) => a.player.finishRank! - b.player.finishRank!).map(({player}) =>
            <li key={player.id}>{digits(player.finishRank!)}. {player.name}
              {room.mode === 'ranked' && ' · ' + digits([15,10,5,0][player.finishRank! - 1]) + ' امتیاز'}</li>)}</ol>
        </> : <div className="room-dice">
          <DiceWidget value={state.diceValue ?? dice ?? 6} rolling={rolling} canRoll={myTurn && state.phase === 'awaiting_roll' && !busy}
            activeFacultyId={active.teamId} activePlayerName={active.name} isBotTurn={false}
            promptText={myTurn ? (moves.length ? 'یکی از مهره‌های روشن را انتخاب کن.' : 'نوبت شماست.') : 'منتظر نوبت بازیکن…'}
            onRoll={() => { gameAudio.playDiceRattle(); setRolling(true); void command('roll',{revision:room.revision}); }} />
        </div>}
        {state.lastEvent && <p>{state.lastEvent.event.title} · {state.lastEvent.event.description}</p>}
      </>}
    </>}
    {rules && <RulesModal onClose={() => setRules(false)} />}
  </section></main>;
}
