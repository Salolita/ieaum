import assert from 'node:assert/strict';
import sessions from '../api/erae-session.ts';
import { digest } from '../server/portal-store.ts';
import { CommentsError, submitComment } from '../../site-comments-client.ts';

const site = 'https://ieaum.ir';
const endpoint = site + '/api/account?siteComments=1';
const admin = 'A'.repeat(32);
const other = 'B'.repeat(32);
const member = 'C'.repeat(32);
const delegate = 'D'.repeat(32);
const key = '00000000-0000-4000-8000-000000000001';
const profiles = [
  { id: 'a', key: admin, username: 'saleh_2007k', telegram_id: '1484056418' },
  { id: 'b', key: other, username: 'saleh_2007k', telegram_id: '1' },
  { id: 'c', key: member, username: 'member', telegram_id: '2', first_name:'علی', last_name:'رضایی' },
  { id: 'd', key: delegate, username: 'reviewer', telegram_id: '8592192595' },
];
Object.assign(process.env, { SUPABASE_URL: 'https://fixture.test', SUPABASE_SECRET_KEY: 'fixture' });
const records = [];
let authLookups = 0;
let lostAcknowledgement = false;
let sequence = 0;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  const filters = url.searchParams;
  if (url.pathname.endsWith('/portal_rate_limit')) return Response.json(true);
  if (url.pathname.endsWith('/portal_sessions')) {
    authLookups++;
    assert.equal(filters.get('select'), 'profile:portal_profiles!inner(id,username,telegram_id,first_name,last_name)');
    assert.equal(filters.get('profile.active'), 'eq.true');
    assert.match(filters.get('expires_at'), /^gt\./);
    return Response.json(profiles.filter((profile) => filters.get('token_hash') === 'eq.' + digest(profile.key))
      .map(({ key, ...profile }) => ({ profile })));
  }
  assert.ok(url.pathname.endsWith('/portal_site_comments'));
  const method = options.method ?? 'GET';
  const body = JSON.parse(options.body ?? 'null');
  if (method === 'POST') {
    const id = body.id ?? key.slice(0, -1) + ++sequence;
    if (body.id) {
      assert.equal(filters.get('on_conflict'), 'id');
      assert.match(options.headers.Prefer, /ignore-duplicates/);
      if (records.some((record) => record.id === id)) return Response.json([]);
    }
    const { author_id, ...entry } = { ...body, id, admin_reply: null, created_at: '2026-11-25T00:00:00Z' };
    records.push({ ...entry, author_id });
    return Response.json([entry]);
  }
  if (method === 'PATCH' || method === 'DELETE') {
    const index = records.findIndex((entry) => filters.get('id') === 'eq.' + entry.id);
    if (index < 0) return Response.json([]);
    const { id } = records[index];
    if (method === 'DELETE') {
      records.splice(index, 1);
      return Response.json([{ id }]);
    }
    Object.assign(records[index], body);
    const { author_id, ...entry } = records[index];
    return Response.json([entry]);
  }
  const result = records.filter((entry) =>
    (!filters.has('id') || filters.get('id') === 'eq.' + entry.id)
    && (!filters.has('visibility') || filters.get('visibility') === 'eq.' + entry.visibility)
    && (!filters.has('author_id') || filters.get('author_id') === 'eq.' + entry.author_id));
  return Response.json(result.map(({ author_id, ...entry }) => entry));
};

const call = (scope, session, data, origin = site) => sessions.fetch(new Request(endpoint + '&scope=' + scope, {
  method: data ? 'POST' : 'GET',
  headers: { Origin: origin, 'Content-Type': 'application/json', ...(session ? { Cookie: '__Host-ieaum=' + session } : {}) },
  body: data ? JSON.stringify(data) : undefined,
}));
const send = { action: 'submit', message: 'نظر آزمایشی', visibility: 'public' };
assert.equal((await call('public', undefined, send)).status, 401);
assert.equal((await call('public', member, { ...send, message: '  ' })).status, 422);
assert.equal((await call('public', member, send)).status, 201);
assert.equal((await call('public', member, { ...send, message: 'پیام محرمانه', visibility: 'private' })).status, 201);
const guest = await (await call('public')).json();
assert.equal(guest.comments.length, 1);
assert.equal(guest.comments[0].visibility, 'public');
assert.equal(guest.comments[0].author_name, 'علی رضایی');
assert.equal(guest.canComment, false);
assert.equal(guest.canManage, false);
assert.ok(!JSON.stringify(guest).includes('پیام محرمانه'));
assert.equal((await call('mine')).status, 401);
assert.deepEqual((await (await call('mine', other)).json()).comments, []);
assert.equal((await call('manage', other)).status, 403);
assert.equal((await call('manage', delegate)).status, 403);
const inbox = await (await call('manage', admin)).json();
assert.equal(inbox.canManage, true);
assert.equal(inbox.comments.length, 2);
const privateComment = inbox.comments.find((comment) => comment.visibility === 'private');
const reply = { action: 'reply', id: privateComment.id, message: 'پاسخ مدیر' };
assert.equal((await call('public', admin, reply, 'https://numeralab.ieaum.ir')).status, 403);
assert.equal((await call('public', member, reply)).status, 403);
assert.equal((await call('manage', admin, reply)).status, 200);
assert.equal((await (await call('mine', member)).json()).comments[0].admin_reply, reply.message);
assert.equal((await call('manage', admin, { action: 'delete', id: privateComment.id })).status, 200);
assert.equal((await call('manage', admin, reply)).status, 404);
assert.deepEqual((await (await call('mine', member)).json()).comments, []);
const bootstrap = async (session) => (await call('bootstrap', session)).json();
authLookups = 0;
assert.deepEqual(Object.keys((await bootstrap()).lists), ['public']);
assert.equal(authLookups, 0);
assert.deepEqual(Object.keys((await bootstrap(member)).lists).sort(), ['mine','public']);
assert.equal(authLookups, 1);
assert.deepEqual(Object.keys((await bootstrap(admin)).lists).sort(), ['manage','mine','public']);
assert.equal(authLookups, 2);

const draft = { id: '00000000-0000-4000-8000-000000000012', message: 'پیام با رسید', visibility: 'private' };
const dbFetch = globalThis.fetch;
let posts = 0, receiptChecks = 0;
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith('https://fixture.test')) return dbFetch(url, options);
  const request = new Request(new URL(url, site), {
    ...options, headers: { ...options.headers, Origin: site, Cookie: '__Host-ieaum=' + member },
  });
  const result = await sessions.fetch(request);
  if (request.method === 'POST') {
    posts++;
    if (!lostAcknowledgement) { lostAcknowledgement = true; throw new TypeError('Failed to fetch'); }
  }
  return result;
};
assert.equal((await submitComment(draft, false, () => { receiptChecks++; })).id, draft.id);
assert.equal(receiptChecks, 1);
assert.equal((await submitComment(draft, true, () => assert.fail('saved receipt is available'))).id, draft.id);
assert.equal(posts, 1);
globalThis.fetch = dbFetch;
const duplicate = await call('public', member, { action: 'submit', ...draft });
assert.equal(duplicate.status, 200);
assert.equal(records.filter(({ id }) => id === draft.id).length, 1);
assert.equal((await call('public', other, { action: 'submit', ...draft })).status, 409);
assert.equal((await call('receipt&id=' + draft.id, other)).status, 404);
assert.equal((await call('public', member, { action: 'submit', ...draft, message:'متن متفاوت' })).status, 409);

globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
await assert.rejects(submitComment(draft, false, () => {}), (error) =>
  error instanceof CommentsError && error.status === 0 && /هنوز تأیید نشد/.test(error.message));
globalThis.fetch = dbFetch;
console.log('Verified comment receipt recovery, duplicate protection, prefetched lists, private isolation, replies and deletion.');
