import assert from 'node:assert/strict';
import { handleAccountCallback, handleAccountReason } from '../server/account-actions.ts';

Object.assign(process.env, { TELEGRAM_ADMIN_IDS: '100', TELEGRAM_BOT_TOKEN: 'fixture', SUPABASE_URL: 'https://test.example', SUPABASE_SECRET_KEY: 'fixture' });
const profileId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
let profile = { id: profileId, first_name: 'نام', last_name: 'آزمایشی', username: 'fixture', active: true, telegram_id: '300' };
let task;
const messages = [];
globalThis.fetch = async (input, options) => {
  const uri = new URL(input);
  const data = JSON.parse(options.body ?? 'null');
  const method = uri.pathname.split('/').at(-1);
  if (uri.hostname === 'api.telegram.org') { messages.push({ method, ...data }); return Response.json({ ok: true }); }
  if (method === 'portal_profiles') return Response.json(profile ? [profile] : []);
  if (method === 'portal_account_actions') {
    if (options.method === 'POST') { task = { id: requestId, ...data }; return Response.json([task]); }
    return Response.json(options.method === 'GET' && task ? [task] : []);
  }
  if (method === 'portal_decide_account_action') {
    const operation = data.p_accept ? task.operation : 'cancelled';
    if (operation === 'purge') profile = null;
    if (operation === 'disable') profile.active = false;
    task = null;
    return Response.json(operation);
  }
  throw new Error(uri.pathname);
};
const callback = (data, message_id, id = 100) => handleAccountCallback({ data, id: 'test', from: { id }, message: { message_id, chat: { id, type: 'private' } } }, async () => {}, async () => {});
const edit = (id) => messages.findLast((message) => message.method === 'editMessageText' && message.message_id === id);
const send = () => messages.findLast(({ method }) => method === 'sendMessage');
const begin = async (operation) => {
  await callback(`acct:${operation}:${profileId}`, 10);
  assert.match(edit(10).text, /در انتظار ثبت علت/);
  assert.equal(edit(10).reply_markup.inline_keyboard[0][0].callback_data, `acct:refresh:${profileId}`);
  await handleAccountReason('100', send().text, 'علت آزمایشی');
  assert.match(edit(10).text, /در انتظار تأیید/);
  return send().reply_markup.inline_keyboard[0];
};

let buttons = await begin('disable');
await callback(buttons[1].callback_data, 11);
assert.match(edit(11).text, /لغو شد/);
assert.deepEqual(edit(11).reply_markup.inline_keyboard, []);
assert.equal(edit(10).reply_markup.inline_keyboard[0][0].callback_data, `acct:disable:${profileId}`);
buttons = await begin('disable');
await callback(buttons[0].callback_data, 12);
assert.equal(edit(10).reply_markup.inline_keyboard[0][0].callback_data, `acct:enable:${profileId}`);
buttons = await begin('purge');
await callback(buttons[0].callback_data, 13, 300);
assert.ok(profile);
await callback(buttons[0].callback_data, 13);
assert.equal(profile, null);
for (const id of [10, 13]) {
  assert.match(edit(id).text, /برای همیشه حذف شد/);
  assert.deepEqual(edit(id).reply_markup.inline_keyboard, []);
}
await callback(`acct:purge:${profileId}`, 14);
assert.deepEqual(edit(14).reply_markup.inline_keyboard, []);
console.log('Verified both management cards update on cancel, disable and purge, with stale actions cleaned up.');
