import assert from 'node:assert/strict';
import sessions from '../api/erae-session.ts';
import { digest } from '../server/portal-store.ts';
import { telegramWebhook } from '../server/portal-bot.ts';
import { presenceDay, recordDeparture } from '../server/presence.ts';
import { onPageHidden } from '../client/utils/page-presence.ts';

Object.assign(process.env, { SUPABASE_URL:'https://fixture.test', SUPABASE_SECRET_KEY:'fixture',
  TELEGRAM_ADMIN_IDS:'1484056418,777', TELEGRAM_BOT_TOKEN:'fixture', TELEGRAM_WEBHOOK_SECRET:'fixture' });
const owner = 'A'.repeat(32);
const other = 'B'.repeat(32);
const id = '11111111-1111-4111-8111-111111111111';
const rows = [], notices = [];
let settings = { active_day:null, mode:'telegram' };
let disabled = false, deleted = false;
let changed = 0;
globalThis.fetch = async (input, opts = {}) => {
  const url = new URL(input);
  const table = url.pathname.split('/').at(-1);
  const data = JSON.parse(opts.body ?? 'null');
  if (url.hostname === 'api.telegram.org') { notices.push({ table, data }); return Response.json({ ok:true }); }
  if (table === 'portal_sessions') return Response.json([{ profile_id: url.searchParams.get('token_hash') === 'eq.' + digest(owner) ? 'master' : 'other' }]);
  if (table === 'portal_profiles') return Response.json([{ id:'fixture', username:'saleh_2007k',
    telegram_id:url.searchParams.get('id') === 'eq.master' ? '1484056418' : '777', active:true }]);
  if (table === 'portal_required_channels') return Response.json([]);
  if (table === 'portal_rate_limit') return Response.json(true);
  if (table === 'portal_presence_settings') {
    if (opts.method === 'PATCH') Object.assign(settings, data);
    return Response.json([settings]);
  }
  if (table === 'portal_presence_events') {
    if (opts.method === 'POST') {
      if (rows.some((row) => row.id === data.id)) return Response.json([]);
      rows.push(data);
      return Response.json([{id:data.id}]);
    }
    assert.equal(url.searchParams.get('mode'), 'eq.report');
    return Response.json(rows.filter((row) => row.mode === 'report'));
  }
  assert.equal(table, 'erae_rooms');
  if (deleted) return Response.json([]);
  if (opts.method === 'PATCH') { disabled = data.moderation_disabled; changed++; }
  if (opts.method === 'DELETE') { deleted = true; changed++; }
  return Response.json([{ id, moderation_disabled:disabled }]);
};
const call = (scope, token, data) => sessions.fetch(new Request('https://ieaum.ir/api/account?siteManagement=1&scope=' + scope, {
  method:data ? 'POST' : 'GET', headers:{ Origin:'https://ieaum.ir', 'Content-Type':'application/json', ...(token ? { Cookie:'__Host-ieaum=' + token } : {}) },
  body:data ? JSON.stringify(data) : undefined,
}));
const tap = (action, sender) => telegramWebhook(new Request('https://numeralab.ieaum.ir/api/portal?telegram=1', {
  method:'POST', headers:{ 'Content-Type':'application/json','x-telegram-bot-api-secret-token':'fixture' },
  body:JSON.stringify({ callback_query:{ id:'fixture', data:'presence:' + action, from:{ id:sender }, message:{ chat:{ id:sender,type:'private' } } } }),
}));
assert.equal(presenceDay(new Date('2026-11-25T20:30:00Z')), '2026-11-26');
assert.equal((await call('report', other)).status, 403);
assert.equal((await call('rooms', undefined)).status, 403);
assert.equal((await call('rooms', other, { action:'delete', id })).status, 403);
await recordDeparture('presentation','session','guest','علی رضایی','جلسه');
assert.equal(rows.length,0);
await tap('on', 777);
assert.equal(settings.active_day, null);
await tap('on', 1484056418);
assert.equal(settings.active_day, presenceDay());
await recordDeparture('presentation','session','guest','علی رضایی','جلسه');
await recordDeparture('presentation','session','guest','علی رضایی','جلسه');
assert.equal(rows.length,1);
assert.ok(notices.some(({ data }) => data.chat_id === '1484056418' && data.text?.includes('علی رضایی')));
await tap('report', 1484056418);
await recordDeparture('quiz','session','member','سارا احمدی','آزمون');
assert.equal((await (await call('report', owner)).json()).rows[0].attendee_name, 'سارا احمدی');
await tap('off', 1484056418);
await recordDeparture('livecode','session','member','سارا احمدی','جلسه');
assert.equal(rows.length,2);
assert.equal(settings.active_day,null);
assert.equal((await call('rooms',owner,{action:'disable',id})).status,200);
assert.equal(disabled,true);
assert.equal((await call('rooms',owner,{action:'enable',id})).status,200);
assert.equal(disabled,false);
assert.equal((await call('rooms',owner,{action:'delete',id})).status,200);
assert.equal(changed,3);

const fakePage = Object.assign(new EventTarget(), { visibilityState:'visible' });
globalThis.document = fakePage;
globalThis.window = new EventTarget();
let departures = 0;
const dispose = onPageHidden(() => departures++);
fakePage.visibilityState = 'hidden';
fakePage.dispatchEvent(new Event('visibilitychange'));
window.dispatchEvent(new Event('pagehide'));
assert.equal(departures, 1);
dispose();
console.log('Verified Tehran-day activation, report isolation, delivery deduplication, admin moderation and browser departure events.');
