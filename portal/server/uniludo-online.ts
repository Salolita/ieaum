import { randomInt } from 'node:crypto';
import { applyMove, createInitialMatch, getActivePlayer, getLegalMoves, rollDice } from '../uniludo/rules.js';
import { TEAM_ORDER, type TeamId } from '../uniludo/constants.js';
import { roomIdPattern, type OnlineRoom, type RoomSummary } from '../uniludo/service.js';
import { limit, PortalError, reply, rpc } from './portal-store.js';

const roomActions = ['view','join','leave','rename','delete','start','reset','roll','move'];
const random = () => randomInt(0, 1_000_000) / 1_000_000;
type RoomResult = OnlineRoom | {ok: true} | {error: string; id?: string};

function roomCommand(profile: string, id: string | null, action: string, data: object = {}) {
  return rpc<RoomResult>('portal_uniludo_room', {p_profile: profile, p_room: id, p_action: action, p_data: data});
}

function display(result: RoomResult) {
  if ('error' in result) return reply(result, 409);
  return reply('ok' in result ? result : {room: result});
}

function title(value: unknown) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value) || !value.trim() || [...value.trim()].length > 60) {
    throw new PortalError(422, 'برای جلسه نامی بین ۱ تا ۶۰ نویسه وارد کنید.');
  }
  return value.trim();
}

export async function onlineGame(profile: string, action: string, input: Record<string, unknown>) {
  if (action === 'room-list') return reply({rooms: await rpc<RoomSummary[]>('portal_uniludo_lobbies', {p_profile: profile})});
  if (action === 'room-create') {
    const name = title(input.title);
    if (input.capacity !== 2 && input.capacity !== 3 && input.capacity !== 4) throw new PortalError(422, 'تعداد بازیکنان باید ۲ تا ۴ نفر باشد.');
    if (input.mode !== 'casual' && input.mode !== 'ranked') throw new PortalError(422, 'نوع بازی معتبر نیست.');
    await limit('uniludo:room-create:' + profile, 30);
    return display(await roomCommand(profile, null, 'create', {title: name, capacity: input.capacity, mode: input.mode}));
  }
  const command = action.slice('room-'.length);
  const id = input.roomId;
  if (!roomActions.includes(command) || typeof id !== 'string' || !roomIdPattern.test(id)) throw new PortalError(422, 'درخواست جلسه معتبر نیست.');
  if (command === 'join') {
    if (!TEAM_ORDER.includes(input.team as TeamId)) throw new PortalError(422, 'نقش معتبر نیست.');
    return display(await roomCommand(profile, id, command, {team: input.team}));
  }
  if (command === 'rename') return display(await roomCommand(profile, id, command, {title: title(input.title)}));
  if (command === 'view' || command === 'leave' || command === 'delete') return display(await roomCommand(profile, id, command));

  const snapshot = await roomCommand(profile, id, 'view');
  if (!('state' in snapshot)) return display(snapshot);
  const {state, members, capacity, revision, team, owner, status} = snapshot;
  if (revision !== input.revision) throw new PortalError(409, 'وضعیت بازی تغییر کرده است. دوباره تلاش کنید.');
  if (command === 'start' || command === 'reset') {
    if (!owner) throw new PortalError(403, 'این گزینه در اختیار مدیر جلسه است.');
    if (members.length !== capacity || status !== (command === 'start' ? 'waiting' : 'playing')) {
      throw new PortalError(409, 'بازی در این مرحله آمادهٔ شروع نیست.');
    }
    const next = createInitialMatch({playerCount: capacity, ruleMode: 'student', humanTeam: members[0].team, vsBots: false});
    next.playForPlaces = true;
    next.players = next.players.map((player, index) => ({...player, teamId: members[index].team, name: members[index].name}));
    return display(await roomCommand(profile, id, command, {revision, state: next}));
  }

  if (status !== 'playing' || !state || !team || getActivePlayer(state).teamId !== team) {
    throw new PortalError(403, 'نوبت شما نیست.');
  }
  if (command === 'roll' && state.phase === 'awaiting_roll') {
    const result = rollDice(state, randomInt(1, 7));
    const saved = await roomCommand(profile, id, 'play', {revision, state: result.nextState});
    return 'state' in saved ? reply({room: saved, dice: result.diceValue}) : display(saved);
  }
  if (command === 'move' && state.phase === 'awaiting_move' && state.diceValue !== null) {
    const move = getLegalMoves(state, getActivePlayer(state).id, state.diceValue).find(item => item.pawnId === input.pawnId);
    if (move) return display(await roomCommand(profile, id, 'play', {revision, state: applyMove(state, move, random).nextState}));
  }
  throw new PortalError(422, 'این حرکت در نوبت فعلی ممکن نیست.');
}
