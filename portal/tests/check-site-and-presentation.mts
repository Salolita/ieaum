import assert from 'node:assert/strict';
import erae from '../api/erae-tori.ts';
import sessions from '../api/erae-session.ts';
import { homeFieldKeys } from '../home-fields.ts';
import { digest } from '../server/portal-store.ts';
import { telegramWebhook } from '../server/portal-bot.ts';

const site = 'https://ieaum.ir';
const solver = 'https://numeralab.ieaum.ir';
Object.assign(process.env, {
  PORTAL_ENABLED: 'true', PORTAL_ORIGIN: solver, SUPABASE_URL: 'https://fixture.test',
  SUPABASE_SECRET_KEY: 'fixture', TELEGRAM_ADMIN_IDS: '777',
  TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_WEBHOOK_SECRET: 'fixture',
});
const room = {
  id: '00000000-0000-4000-8000-000000000021',
  join_code: 'J'.repeat(32), title: 'ارائه', caption: '', page_count: 2, published: true, revision: 0,
  body: { position: 0, furthest: 0, players: {}, questions: [{ after: 1, text: 'سؤال', options: ['یک','دو'], correct: 0 }] },
};
let home;
let channelEnabled = false;
let hasJoined = false;
let tablesReady = true;
const messages = [];
const copy = (body) => JSON.parse(JSON.stringify(body));
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  const action = url.pathname.split('/').at(-1);
  const body = JSON.parse(options.body ?? 'null');
  if (url.hostname === 'api.telegram.org') {
    if (action === 'getChatMember') return Response.json({ ok: true, result: { status: hasJoined ? 'member' : 'left' } });
    if (action === 'sendMessage') messages.push(body);
    return Response.json({ ok: true });
  }
  if (action === 'portal_rate_limit') return Response.json(true);
  if (action === 'erae_rooms') {
    if (options.method === 'PATCH') {
      if (url.searchParams.get('revision') !== 'eq.' + room.revision) return Response.json([]);
      Object.assign(room, copy(body));
    }
    return Response.json([copy(room)]);
  }
  if (action === 'portal_sessions') {
    const key = url.searchParams.get('token_hash');
    return Response.json([{ profile_id: key === 'eq.'+digest('M'.repeat(32)) ? 'admin' : 'member' }]);
  }
  if (action === 'portal_profiles') {
    if (url.searchParams.get('id')) return Response.json([{ id: 'profile', active: true,
      telegram_id: url.searchParams.get('id') === 'eq.admin' ? '777' : '888' }]);
    return Response.json([]);
  }
  if (action === 'portal_home_content') {
    if (options.method === 'POST') home = body.body;
    return Response.json(home ? [{ body: home }] : []);
  }
  if (action === 'portal_required_channels') {
    if (!tablesReady) return Response.json({ code:'PGRST205' }, { status:404 });
    return Response.json(channelEnabled ? [{ chat_id:'-10000000001', title:'کانال نمونه', invite_url:'https://t.me/sample', enabled:true }] : []);
  }
  if (action === 'portal_record_bot_contact') return Response.json(null);
  throw Error(url.href);
};
const accessHeaders = (key) => key ? { Authorization: 'Bearer ' + key } : {};
const presentation = (action, data, key) => erae.fetch(new Request(site + '/erae-tori/api?s=' + room.join_code + '&action=' + action, {
  method: data === undefined ? 'GET' : 'POST',
  headers: { Origin: site, 'Content-Type': 'application/json', ...accessHeaders(key) },
  body: data === undefined ? undefined : JSON.stringify(data),
}));
const applicant = { name:'آزمون', studentNumber:'۴۰۴۱۲۳۴۵۶', recovery:'R'.repeat(32) };
assert.equal((await presentation('join', { name:'ناقص' })).status, 422);
const join = await presentation('join', {...applicant, attempt:'A'.repeat(32)});
assert.equal(join.status, 200);
const first = await join.json();
assert.equal(first.recovery, applicant.recovery);
assert.equal((await presentation('join', {...applicant, attempt:'A'.repeat(32)})).status, 200);
assert.equal((await presentation('join', { ...applicant, studentNumber:'404123456', recovery:'X'.repeat(32) })).status, 409);
room.body.position = room.body.furthest = 1;
assert.equal((await presentation('answer', { index:0, choice:0 }, first.access)).status, 200);
assert.equal((await presentation('answer', { index:0, choice:1 }, first.access)).status, 409);
room.body.position = room.body.furthest = 2;
const resumed = await (await presentation('join', {...applicant, studentNumber:'404123456'})).json();
assert.equal(resumed.view.step.type, 'question');
assert.equal(resumed.view.answer, 0);
assert.equal((await presentation('state', undefined, first.access)).status, 401);
const moved = await (await presentation('resume-next', { position: 1 }, resumed.access)).json();
assert.equal(moved.step.type, 'slide');
const results = await Promise.all([presentation('join', applicant), presentation('join', applicant)]);
assert.deepEqual(results.map((response) => response.status).sort(), [200,403]);
assert.equal(Object.keys(room.body.players).length, 1);
const finalAccess = (await results.find((response) => response.ok).json()).access;
room.body.position = room.body.furthest = 3;
const ranking = await (await presentation('state', undefined, finalAccess)).json();
assert.deepEqual(ranking.ranking, [{name:applicant.name,score:1,rank:1}]);
assert.ok(!JSON.stringify(ranking).includes('404123456'));

const content = (key, data, origin = site) => sessions.fetch(new Request(site + '/api/account?siteContent=1', {
  method: data ? 'POST' : 'GET',
  headers: { Origin:origin, 'Content-Type':'application/json', ...(key ? { Cookie:'__Host-ieaum='+key } : {}) },
  body: data ? JSON.stringify({ action:'site-content:replace', content:data }) : undefined,
}));
const full = (name) => Object.fromEntries(homeFieldKeys.map((key) => [key, name]));
assert.equal((await content('U'.repeat(32), full('عضو'))).status, 403);
assert.equal((await content('M'.repeat(32), full('خارج'), solver)).status, 403);
assert.equal((await content('M'.repeat(32), full('اول'))).status, 200);
assert.equal((await content('M'.repeat(32), full('دوم'))).status, 200);
assert.deepEqual(await (await content()).json(), { content: full('دوم'), canEdit:false });

const hook = (body) => telegramWebhook(new Request(solver + '/api/portal?telegram=1', {
  method:'POST', headers:{ 'Content-Type':'application/json', 'x-telegram-bot-api-secret-token':'fixture' }, body:JSON.stringify(body),
}));
const chat = { type:'private', id:888 };
const open = () => hook({ message:{ chat, from:{ id:888 }, text:'سرویس‌ها' } });
tablesReady = false;
await open();
assert.match(messages.at(-1).text, /سرویس را انتخاب/);
tablesReady = true;
channelEnabled = true;
await open();
assert.match(messages.at(-1).text, /عضو شوید/);
hasJoined = true;
await hook({ callback_query:{ id:'test', from:{ id:888 }, message:{ chat }, data:'membership:check' } });
assert.ok(messages.at(-1).reply_markup.keyboard);
await open();
assert.match(messages.at(-1).text, /سرویس را انتخاب/);
console.log('Verified presentation recovery and entry limit, homepage replacement and administrator checks, and Telegram membership recovery.');
