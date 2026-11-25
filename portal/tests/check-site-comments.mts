import assert from 'node:assert/strict';
import sessions from '../api/erae-session.ts';
import { digest } from '../server/portal-store.ts';

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
  { id: 'c', key: member, username: 'member', telegram_id: '2' },
  { id: 'd', key: delegate, username: 'reviewer', telegram_id: '8592192595' },
];
Object.assign(process.env, { SUPABASE_URL: 'https://fixture.test', SUPABASE_SECRET_KEY: 'fixture' });
const records = [];
let sequence = 0;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  const filters = url.searchParams;
  if (url.pathname.endsWith('/portal_rate_limit')) return Response.json(true);
  if (url.pathname.endsWith('/portal_sessions')) {
    return Response.json(profiles.filter((profile) => filters.get('token_hash') === 'eq.' + digest(profile.key))
      .map((profile) => ({ profile_id: profile.id })));
  }
  if (url.pathname.endsWith('/portal_profiles')) {
    return Response.json(profiles.filter((profile) => filters.get('id') === 'eq.' + profile.id));
  }
  assert.ok(url.pathname.endsWith('/portal_site_comments'));
  const method = options.method ?? 'GET';
  const body = JSON.parse(options.body ?? 'null');
  if (method === 'POST') {
    const id = key.slice(0, -1) + ++sequence;
    records.push({ ...body, id, admin_reply: null, created_at: '2026-11-25T00:00:00Z' });
    return Response.json([{ id }]);
  }
  if (method === 'PATCH' || method === 'DELETE') {
    const index = records.findIndex((entry) => filters.get('id') === 'eq.' + entry.id);
    if (index < 0) return Response.json([]);
    const { id } = records[index];
    if (method === 'DELETE') records.splice(index, 1);
    else Object.assign(records[index], body);
    return Response.json([{ id }]);
  }
  const result = records.filter((entry) =>
    (!filters.has('visibility') || filters.get('visibility') === 'eq.' + entry.visibility)
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
console.log('Verified homepage comments, private isolation, exact manager authorization, replies and deletion.');
