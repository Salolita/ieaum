import { createHmac, randomInt } from 'node:crypto';
import { accountForChat } from '../server/account-actions.js';
import { equalSecret, field, limit, PortalError, query, readBody, reply, rpc, setting, uuidPattern } from '../server/portal-store.js';
import { telegramIdentity } from '../server/telegram-identity.js';
import { TEAM_ORDER, type TeamId } from '../uniludo/constants.js';
import { applyMove, chooseBotMove, createInitialMatch, getActivePlayer, getLegalMoves, rollDice, type GameConfig } from '../uniludo/rules.js';
import type { RankedMatch, RankingRow } from '../uniludo/service.js';

const origin = 'https://ieaum.ir';
const noAccount = 'برای بازی، حساب فعال IEAUM را به همین تلگرام متصل کنید.';
const stale = 'وضعیت بازی تغییر کرد. بازی را از همین مرحله ادامه دهید.';
const sessionPattern = /^([1-9][0-9]{0,15})\.([0-9a-f-]{36})\.([0-9]{10})\.([a-f0-9]{64})$/i;
const lifetimeSeconds = 8 * 60 * 60;
const now = () => Math.floor(Date.now() / 1000);

function sign(payload: string) {
  return createHmac('sha256', setting('TELEGRAM_BOT_TOKEN')).update('IEAUM-UniLudo-session:v1:' + payload).digest('hex');
}

function openSession(chat: string, profile: string) {
  const payload = [chat, profile, now() + lifetimeSeconds].join('.');
  return payload + '.' + sign(payload);
}

function readSession(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.{1,150})$/)?.[1] ?? '';
  const claims = sessionPattern.exec(token);
  if (!claims || !uuidPattern.test(claims[2]) || Number(claims[3]) <= now()
      || !equalSecret(claims[4], sign(token.slice(0, -65)))) {
    throw new PortalError(401, 'نشست بازی منقضی شده است. مینی‌اپ را دوباره از ربات باز کنید.');
  }
  return { chat: claims[1], profileId: claims[2] };
}

function gameConfig(value: unknown): GameConfig {
  const config = value as Partial<GameConfig> | undefined;
  if (!config || (config.playerCount !== 2 && config.playerCount !== 3 && config.playerCount !== 4)
      || (config.ruleMode !== 'student' && config.ruleMode !== 'classic')
      || !TEAM_ORDER.includes(config.humanTeam as TeamId)) {
    throw new PortalError(422, 'تنظیمات بازی را بررسی کنید.');
  }
  return { playerCount: config.playerCount, ruleMode: config.ruleMode, humanTeam: config.humanTeam!, vsBots: true };
}

function matchVersion(body: Record<string, unknown>) {
  if (typeof body.matchId !== 'string' || !uuidPattern.test(body.matchId)
      || typeof body.revision !== 'number' || !Number.isInteger(body.revision) || body.revision < 0 || body.revision > 2_147_483_646) {
    throw new PortalError(422, 'شناسه یا نسخهٔ بازی معتبر نیست.');
  }
  return { p_match: body.matchId, p_revision: body.revision };
}

async function current(profileId: string) {
  const [match] = await query<RankedMatch[]>('portal_uniludo_matches', {
    profile_id: 'eq.' + profileId, select: 'id,revision,state', limit: '1',
  });
  return match ?? null;
}

export default {
  async fetch(request: Request) {
    try {
      if (request.method !== 'POST') return reply({error: 'درخواست معتبر نیست.'}, 405);
      if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') {
        return reply({error: 'درخواست معتبر نیست.'}, 403);
      }
      if (setting('PORTAL_ENABLED') !== 'true') return reply({error: 'بازی فعلاً در دسترس نیست.'}, 503);
      const body = await readBody(request, 10_000);
      const action = field(body, 'action');
      if (action === 'session') {
        const chat = telegramIdentity(field(body, 'initData'));
        const account = await accountForChat(chat);
        if (!account?.active) return reply({error: noAccount}, 403);
        await limit('uniludo:session:' + account.id, 18);
        return reply({ token: openSession(chat, account.id), name: `${account.first_name} ${account.last_name}`.trim(),
          match: await current(account.id) });
      }

      const { chat, profileId } = readSession(request);
      const account = await accountForChat(chat);
      if (!account?.active || account.id !== profileId) return reply({error: noAccount}, 403);
      if (action === 'ranking') return reply({ ranking: await rpc<RankingRow[]>('portal_uniludo_ranking', {p_profile: profileId}) });
      if (action === 'current') return reply({match: await current(profileId)});
      if (action === 'start') {
        const config = gameConfig(body.config);
        const replacement = body.matchId === undefined ? null : matchVersion(body);
        if (replacement) await limit('uniludo:restart:' + profileId, 12);
        const match = await rpc<RankedMatch | null>('portal_uniludo_start', {p_profile: profileId,
          p_state: createInitialMatch(config, `${account.first_name} ${account.last_name}`.trim()),
          p_replace: replacement?.p_match ?? null, p_revision: replacement?.p_revision ?? null});
        if (!match?.id) return reply({error: noAccount}, 403);
        return reply({match: {id: match.id, revision: match.revision, state: match.state}});
      }
      if (action !== 'roll' && action !== 'move') return reply({error: 'درخواست معتبر نیست.'}, 400);

      const version = matchVersion(body);
      const match = await current(profileId);
      if (!match || match.id !== version.p_match || match.revision !== version.p_revision) return reply({error: stale, match}, 409);
      const state = match.state;
      if (action === 'roll' && state.phase !== 'awaiting_roll'
          || action === 'move' && (state.phase !== 'awaiting_move' || state.diceValue === null)) {
        return reply({error: 'این حرکت در نوبت فعلی ممکن نیست.'}, 422);
      }
      const result = action === 'roll' ? rollDice(state, randomInt(1, 7)) : (() => {
        const active = getActivePlayer(state);
        const move = active.isBot ? chooseBotMove(state, active.id, state.diceValue!)
          : getLegalMoves(state, active.id, state.diceValue!).find(candidate => candidate.pawnId === body.pawnId);
        if (!move) throw new PortalError(422, 'این مهره نمی‌تواند حرکت کند.');
        return applyMove(state, move, () => randomInt(0, 1_000_000) / 1_000_000);
      })();
      const { nextState, ...animation } = result;
      const saved = await rpc<RankedMatch | null>('portal_uniludo_move', {p_profile: profileId, ...version, p_state: nextState});
      if (!saved?.id) return reply({error: stale, match: await current(profileId)}, 409);
      return reply({match: {id: saved.id, revision: saved.revision, state: saved.state},
        ...(action === 'roll' ? {roll: animation} : {move: animation})});
    } catch (error) {
      return error instanceof PortalError ? reply({error: error.message}, error.status)
        : reply({error: 'ارتباط با بازی برقرار نشد. دوباره تلاش کنید.'}, 503);
    }
  },
};
