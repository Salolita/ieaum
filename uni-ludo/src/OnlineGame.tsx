import {useEffect, useRef, useState, type FormEvent} from 'react';
import {TEAMS, type TeamId} from '../../portal/uniludo/constants';
import {getActivePlayer, getGraduatedCount, getLegalMoves, getStandings, type MatchState} from '../../portal/uniludo/rules';
import {type OnlineRoom, type RoomSummary} from '../../portal/uniludo/service';
import {GameError, gameRequest, type GameSession} from './api';
import {GameArena} from './components/GameArena';
import {GameBrand} from './components/GameBrand';
import {TeamPicker} from './components/TeamPicker';
import {RulesModal} from './components/GameModals';
import {gameAudio} from './utils/audio';
import {toPersianDigits as digits, loadStoredStats, saveStoredStats} from './utils/storage';

type RoomResponse = {room: OnlineRoom; dice?: number};
const message = (failure: unknown) => failure instanceof Error ? failure.message : 'ارتباط با جلسه برقرار نشد.';
const resetQuestion = 'آیا مطمئن هستید از ریست این بازی؟';

function playBoardSounds(previous: MatchState | null | undefined, next: MatchState | null, localRoll: boolean) {
  if (!previous || !next) return;
  if (next.onlineRoll && next.onlineRoll.revision !== previous.onlineRoll?.revision) {
    if (!localRoll) gameAudio.playDiceRattle();
    if (next.onlineRoll.value === 6) gameAudio.playSixChime();
  }
  if (next.pawns.some((pawn, index) => pawn.progress >= 0 && pawn.progress !== previous.pawns[index]?.progress)) {
    gameAudio.playPawnHop();
    if (next.players.some((player, index) => player.captures > (previous.players[index]?.captures ?? 0))) gameAudio.playCapture();
    if (next.players.some(({id}) => getGraduatedCount(next.pawns, id) > getGraduatedCount(previous.pawns, id))) gameAudio.playGraduation();
  }
  if (next.lastEvent && (next.lastEvent.turn !== previous.lastEvent?.turn || next.lastEvent.playerId !== previous.lastEvent?.playerId
    || next.lastEvent.event.title !== previous.lastEvent?.event.title)) {
    gameAudio.playCampusEvent(next.lastEvent.event.kind !== 'setback');
  }
  if (previous.phase !== 'finished' && next.phase === 'finished') gameAudio.playVictoryFanfare();
}

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
    <GameBrand />
    <h1>ساخت جلسهٔ بازی</h1>
    <form className="room-form" onSubmit={submit}>
      <label>نام جلسه<input className="game-field" required name="title" maxLength={60} /></label>
      <label>تعداد شرکت‌کنندگان<select className="game-field" name="capacity">
        <option value="2">۲ نفر</option><option value="3">۳ نفر</option><option value="4">۴ نفر</option>
      </select></label>
      <label>نوع بازی<select className="game-field" name="mode" defaultValue="ranked">
        <option value="ranked">امتیازی</option><option value="casual">دورهمی</option>
      </select></label>
      <button className="game-secondary" disabled={busy}>ساخت جلسه</button>
      {error && <p role="alert" className="game-error">{error}</p>}
    </form>
    <button type="button" className="game-secondary game-back" onClick={onBack}>بازگشت</button>
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
            playBoardSounds(newest.current?.state, received.state, false);
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
      if (action !== 'reset') playBoardSounds(newest.current?.state, received.state, action === 'roll');
      newest.current = received;
      setRoom(received);
      if (action === 'roll') {
        if (!received.state?.onlineRoll && result.dice === 6) gameAudio.playSixChime();
        setDice(result.dice);
      }
      if (action === 'reset') setDice(undefined);
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
    catch { setNotice('لینک دعوت را از کادر کنار دکمه بردارید.'); }
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
  const deleteRoom = () => {
    if (window.confirm('آیا از حذف این جلسه مطمئن هستید؟')) void command('delete', {}, true);
  };
  const toggleMute = () => {
    saveStoredStats({...loadStoredStats(), muted:!muted});
    gameAudio.setMuted(!muted);
    if (muted) gameAudio.playClick();
    setMuted(!muted);
  };
  const members = Object.fromEntries(room?.members.map(({team, name}) => [team,name]) ?? []);

  return <main className={state && !stopped ? 'room-page online-arena' : 'room-page'}>
    <section className="game-panel">
    {!state && <GameBrand />}
    <h1>{room?.title ?? 'جلسهٔ بازی'}</h1>
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
      {room.status === 'waiting' && <>
        <TeamPicker selected={room.team} names={members} disabled={busy || (!room.joined && room.count >= room.capacity)}
          onSelect={(team: TeamId) => {gameAudio.playClick(); void command('join', {team});}} />
        {room.members.length > 0 && <ul className="room-members">
          {room.members.map(({team,name}) => <li key={team}>{TEAMS[team].shortName} · {name}</li>)}
        </ul>}
        {room.count === room.capacity ? room.owner ? <>
          <p role="status">بازی آماده‌ست.</p>
          <button className="game-secondary" disabled={busy} onClick={() => void command('start',{revision:room.revision})}>تأیید و شروع بازی</button>
        </> : <p role="status">منتظر شروع بازی توسط مدیر جلسه…</p> : <p role="status">منتظر ورود بازیکنان…</p>}
      </>}
      {room.status === 'playing' && !state && <p>این بازی شروع شده است.</p>}
      {state && <div className="room-heading">
          <button className="game-secondary" onClick={() => {gameAudio.playClick(); setRules(true);}}>قوانین</button>
          <button className="game-secondary" onClick={toggleMute}>{muted ? 'فعال کردن صدا' : 'بی‌صدا کردن'}</button>
          {room.owner && room.status === 'playing' && <button className="game-secondary" disabled={busy} onClick={() => {
            if (window.confirm(resetQuestion)) void command('reset',{revision:room.revision});
          }}>ریست بازی</button>}
        </div>}
    </>}
    </section>
    {room && state && !stopped && <GameArena match={state} dice={state.diceValue ?? dice ?? 6} rolling={rolling}
      canRoll={myTurn && state.phase === 'awaiting_roll' && !busy} legalMoves={moves} interactive={myTurn && !busy}
      prompt={myTurn ? (moves.length ? 'یکی از مهره‌های روشن را انتخاب کن.' : 'نوبت شماست.') : room.status === 'finished' ? 'پایان بازی' : 'منتظر نوبت بازیکن…'}
      onRoll={() => {gameAudio.playDiceRattle(); setRolling(true); void command('roll',{revision:room.revision});}}
      onMove={move => void command('move',{revision:room.revision,pawnId:move.pawnId})} />}
    <section className="game-panel room-actions">
      {room && !stopped && <>
        {state?.lastEvent && <p>{state.lastEvent.event.title} · {state.lastEvent.event.description}</p>}
        {state && room.status === 'finished' && <>
          <h2>نتیجهٔ بازی</h2>
          <ol>{getStandings(state).sort((a,b) => a.player.finishRank! - b.player.finishRank!).map(({player}) =>
            <li key={player.id}>{digits(player.finishRank!)}. {player.name}
              {room.mode === 'ranked' && ' · ' + digits([15,10,5,0][player.finishRank! - 1]) + ' ژتون'}</li>)}</ol>
        </>}
        {room.owner && room.status === 'waiting' && <>
          <div className="room-invite">
            <input aria-label="لینک دعوت" className="game-field" readOnly dir="ltr" value={invite} onFocus={event => event.currentTarget.select()} />
            <button type="button" className="game-secondary" disabled={busy} onClick={() => void copyInvite()}>کپی لینک دعوت</button>
          </div>
          {notice && <p role="status">{notice}</p>}
        </>}
        {room.owner && room.status !== 'finished' && <button type="button" className="game-secondary" disabled={busy} onClick={deleteRoom}>حذف جلسه</button>}
      </>}
      <button type="button" className="game-secondary" disabled={busy} onClick={leave}>بازگشت به جلسات</button>
    </section>
    {rules && <RulesModal onClose={() => setRules(false)} />}
  </main>;
}
