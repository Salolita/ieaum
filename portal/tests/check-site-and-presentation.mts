import assert from 'node:assert/strict';
import erae from '../api/erae-tori.ts';
import sessions from '../api/erae-session.ts';
import { defaultContacts } from '../contact-content.ts';
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
  owner_id: 'profile', expires_at: '2026-12-01T12:00:00Z',
  admin_digest: digest('D'.repeat(32)),
  join_code: 'J'.repeat(32), title: 'ارائه', caption: '', page_count: 2, published: true, revision: 0,
  body: { position: 0, furthest: 0, players: {}, questions: [{ after: 1, text: 'سؤال', options: ['یک','دو'], correct: 0 }] },
};
let home;
let contacts;
let contactsReady = false;
let channelEnabled = false;
let hasJoined = false;
let tablesReady = true;
const messages = [];
let notesUrl = null;
const platformOwner = 1484056418;
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
    if (url.searchParams.has('owner_id') && url.searchParams.get('owner_id') !== 'eq.' + room.owner_id) return Response.json([]);
    if (options.method === 'PATCH') {
      if (url.searchParams.get('revision') !== 'eq.' + room.revision) return Response.json([]);
      Object.assign(room, copy(body));
    }
    return Response.json([copy(room)]);
  }
  if (action === 'portal_sessions') {
    const key = url.searchParams.get('token_hash');
    const profile_id = key === 'eq.'+digest('M'.repeat(32)) ? 'admin' : key === 'eq.'+digest('L'.repeat(32)) ? 'platform-owner' : 'member';
    return Response.json([{ profile_id }]);
  }
  if (action === 'portal_profiles') {
    if (url.searchParams.get('id') === 'eq.platform-owner') return Response.json([{ id: 'platform-owner', active: true, telegram_id: String(platformOwner), username: 'saleh_2007k' }]);
    if (url.searchParams.get('id')) return Response.json([{ id: url.searchParams.get('id') === 'eq.admin' ? 'profile' : 'another-profile', active: true,
      telegram_id: url.searchParams.get('id') === 'eq.admin' ? '777' : '888' }]);
    return Response.json([]);
  }
  if (action === 'portal_home_content') {
    if (options.method === 'POST') home = body.body;
    return Response.json(home ? [{ body: home }] : []);
  }
  if (action === 'portal_site_contacts') {
    if (!contactsReady) return Response.json({ code:'PGRST205' }, { status:404 });
    if (options.method === 'POST') {
      assert.equal(body.id, 1);
      assert.match(options.headers.Prefer, /merge-duplicates/);
      contacts = body.body;
    }
    return Response.json(contacts ? [{ body: contacts }] : []);
  }
  if (action === 'portal_required_channels') {
    if (!tablesReady) return Response.json({ code:'PGRST205' }, { status:404 });
    return Response.json(channelEnabled ? [{ chat_id:'-10000000001', title:'کانال نمونه', invite_url:'https://t.me/sample', enabled:true }] : []);
  }
  if (action === 'portal_bot_preferences') {
    if (options.method === 'PATCH') notesUrl=body.notes_group_url;
    return Response.json([{notes_group_url:notesUrl}]);
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

const owner = (action, data, session, key) => erae.fetch(new Request(
  site + '/erae-tori/api?id=' + room.id + '&action=' + action, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { Origin: site, 'Content-Type': 'application/json', ...accessHeaders(key),
      ...(session ? { Cookie: '__Host-ieaum=' + session } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
}));
const originalContent = copy({ questions: room.body.questions, expires: room.expires_at, join: room.join_code,
  title: room.title, caption: room.caption, pageCount: room.page_count, adminCode: room.admin_digest });
const ownerSession = 'M'.repeat(32);
assert.equal((await owner('reset', { runId: 'initial' })).status, 401);
assert.equal((await owner('reset', { runId: 'initial' }, 'U'.repeat(32))).status, 404);
assert.equal((await owner('reset', { runId: 'initial' }, ownerSession, 'F'.repeat(32))).status, 401);
const resets = await Promise.all([
  owner('reset', { runId: 'initial' }, ownerSession, 'D'.repeat(32)),
  owner('reset', { runId: 'initial' }, ownerSession, 'D'.repeat(32)),
]);
assert.deepEqual(resets.map((response) => response.status).sort(), [200,409]);
const reset = await resets.find((response) => response.ok).json();
assert.equal(reset.step.type, 'waiting');
assert.equal(reset.position, -1);
assert.equal(room.body.furthest, -1);
assert.equal(reset.participants, 0);
assert.equal(reset.ranking, undefined);
assert.notEqual(reset.runId, 'initial');
assert.ok(!JSON.stringify(reset).includes(room.body.runKey));
assert.deepEqual({ questions: room.body.questions, expires: room.expires_at, join: room.join_code,
  title: room.title, caption: room.caption, pageCount: room.page_count, adminCode: room.admin_digest }, originalContent);
assert.equal((await presentation('state', undefined, finalAccess)).status, 401);
assert.equal((await presentation('join', { ...applicant, runId: 'initial' })).status, 409);
assert.equal((await owner('move', { delta: 1, position: -1, runId: 'initial' }, ownerSession)).status, 409);
const again = { ...applicant, runId: reset.runId, attempt: first.access };
const nextEntry = await (await presentation('join', again)).json();
assert.equal(nextEntry.view.step.type, 'waiting');
assert.notEqual(nextEntry.access, first.access);
assert.equal((await (await presentation('join', again)).json()).access, nextEntry.access);
assert.equal(Object.values(room.body.players)[0].entries, 1);
assert.deepEqual(Object.values(room.body.players)[0].answers, {});
assert.equal((await owner('move', { delta: 1, position: -1, runId: reset.runId }, ownerSession)).status, 200);

assert.equal((await owner('participants', undefined, ownerSession)).status, 403);
const moderatorSession = 'L'.repeat(32);
const roster = await (await owner('participants', undefined, moderatorSession)).json();
assert.deepEqual(roster.participants.map(({ name }) => name), [applicant.name]);
assert.ok(!JSON.stringify(roster).includes(nextEntry.access));
const removal = { participantId: roster.participants[0].id, runId: roster.runId };
assert.equal((await owner('remove-participant', removal, ownerSession)).status, 403);
assert.equal((await owner('remove-participant', { ...removal, runId:'initial' }, moderatorSession)).status, 409);
assert.deepEqual((await (await owner('remove-participant', removal, moderatorSession)).json()).participants, []);
assert.equal((await presentation('state', undefined, nextEntry.access)).status, 401);
assert.equal((await presentation('join', again)).status, 403);

const content = (key, data, origin = site) => sessions.fetch(new Request(site + '/api/account?siteContent=1', {
  method: data ? 'POST' : 'GET',
  headers: { Origin:origin, 'Content-Type':'application/json', ...(key ? { Cookie:'__Host-ieaum='+key } : {}) },
  body: data ? JSON.stringify({ action:'site-content:replace', content:data }) : undefined,
}));
const full = (name) => Object.fromEntries(homeFieldKeys.map((key) => [key, name]));
const defaults = await (await content()).json();
assert.ok(homeFieldKeys.every((key) => typeof defaults.content[key] === 'string' && defaults.content[key].length));
home = { heroTitle: 'عنوان ذخیره‌شده' };
const combined = await (await content()).json();
assert.equal(combined.content.heroTitle, home.heroTitle);
assert.equal(combined.content.heroSubtitle, defaults.content.heroSubtitle);
assert.equal((await content('U'.repeat(32), full('عضو'))).status, 403);
assert.equal((await content('M'.repeat(32), full('خارج'), solver)).status, 403);
assert.equal((await content('M'.repeat(32), full('اول'))).status, 200);
assert.equal((await content('M'.repeat(32), full('دوم'))).status, 200);
assert.deepEqual(await (await content()).json(), { content: full('دوم'), canEdit:false });
const service = { title:'جزوهٔ روش تحقیق', icon:'', kind:'آموزش', detail:'', text:'توضیح', action:'باز کردن', href:'/جزوه/' };
assert.equal((await content(ownerSession, {...full('سوم'), services:[{...service, href:'//example.test/'}]})).status, 422);
const extra = { place:'about', title:'خط‌مشی کلاس', text:'متن نمونه' };
assert.equal((await content(ownerSession, {...full('سوم'), services:[service], sections:[extra]})).status, 200);
assert.deepEqual((await (await content()).json()).content.services, [service]);
assert.equal((await content(ownerSession, full('چهارم'))).status, 200);
const updated = (await (await content()).json()).content;
assert.deepEqual(updated.services, [service]);
assert.deepEqual(updated.sections, [extra]);

const contact = (key, data, origin = site) => sessions.fetch(new Request(site + '/api/account?siteContent=contacts', {
  method: data ? 'POST' : 'GET',
  headers: { Origin:origin, 'Content-Type':'application/json', ...(key ? { Cookie:'__Host-ieaum='+key } : {}) },
  body: data ? JSON.stringify({ action:'site-contacts:replace', content:data }) : undefined,
}));
const manager = 'M'.repeat(32);
assert.deepEqual(await (await contact(manager)).json(), { content: defaultContacts, canEdit:false });
contactsReady = true;
assert.deepEqual(await (await contact(manager)).json(), { content: defaultContacts, canEdit:true });
assert.equal((await contact(undefined, defaultContacts)).status, 403);
assert.equal((await contact('U'.repeat(32), defaultContacts)).status, 403);
assert.equal((await contact(manager, defaultContacts, solver)).status, 403);
assert.equal((await contact(manager, { ...defaultContacts, groups: [
  { title:'لینک غیرمجاز', links:[{ label:'نمونه', url:'javascript:alert(1)' }] },
] })).status, 422);
assert.equal((await contact(manager, defaultContacts)).status, 200);
const updatedContacts = { title:'پشتیبانی', groups: [
  { title:'فرم پشتیبانی', links:[{ label:'ارسال درخواست', url:'https://ieaum.ir/contact/' }] },
] };
assert.equal((await contact(manager, updatedContacts)).status, 200);
assert.deepEqual(await (await contact()).json(), { content: updatedContacts, canEdit:false });

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
const botMessage = (id, text, reply_to_message) => hook({ message:{ chat:{ type:'private', id }, from:{ id }, text, reply_to_message } });
const notesCallback = (id) => hook({ callback_query:{ id:'note', from:{ id }, message:{ chat:{type:'private',id} }, data:'notes:link' } });
await botMessage(platformOwner,'جزوات');
assert.equal(messages.at(-1).reply_markup.inline_keyboard[0][0].callback_data,'notes:link');
await notesCallback(platformOwner);
const noteReply = { text:messages.at(-1).text, from:{ is_bot:true } };
await botMessage(888,'https://t.me/UnauthorizedGroup',noteReply);
assert.equal(notesUrl,null);
await botMessage(platformOwner,'https://example.test/group',noteReply);
assert.equal(notesUrl,null);
await botMessage(platformOwner,'https://t.me/NotesSample',noteReply);
assert.equal(notesUrl,'https://t.me/NotesSample');
await botMessage(888,'جزوه‌خونه');
assert.deepEqual(messages.at(-1).reply_markup.inline_keyboard,[[{text:'ورود به گروه جزوه‌خونه',url:notesUrl}]]);
console.log('Verified presentation reset and owner-only removal, service cards, contact replacement, membership, and notes link permissions.');
