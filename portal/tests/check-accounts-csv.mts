import assert from 'node:assert/strict';
import { telegramWebhook } from '../server/portal-bot.ts';

Object.assign(process.env, {
  TELEGRAM_ADMIN_IDS: '777,8592192595', TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_WEBHOOK_SECRET: 'fixture-hook',
  SUPABASE_URL: 'https://db.test', SUPABASE_SECRET_KEY: 'fixture',
});
const profiles = [
  { id:'A', username:'first', first_name:'رضا', last_name:'نمونه', role:'student', active:true, review_status:'approved', last_portal_login_at:null },
  { id:'B', username:'second', first_name:' =TEST()', last_name:'«نام»', role:'teacher', active:false, review_status:'pending', last_portal_login_at:'2026-11-20' },
];
const calls = [];
let savedList;
let expired = false;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  const method = url.pathname.split('/').at(-1);
  if (url.hostname === 'api.telegram.org') {
    const data = options.body instanceof FormData ? options.body : JSON.parse(options.body ?? 'null');
    calls.push({ method, data });
    if (options.body instanceof FormData) assert.ok(!options.headers);
    return Response.json({ok:true});
  }
  if (method === 'portal_required_channels') return Response.json([]);
  if (method === 'portal_profiles') return Response.json(profiles);
  if (method === 'portal_rate_limit') return Response.json(true);
  if (method === 'portal_record_bot_contact') return Response.json(null);
  assert.equal(method, 'portal_admin_user_lists');
  if (options.method === 'POST') {
    savedList = JSON.parse(options.body);
    return Response.json([]);
  }
  assert.equal(url.searchParams.get('chat_id'), 'eq.777');
  assert.match(url.searchParams.get('expires_at'), /^gt\./);
  return Response.json(!expired && savedList ? [savedList] : []);
};
const hook = (update) => telegramWebhook(new Request('https://numeralab.ieaum.ir/api/portal?telegram=1', {
  method: 'POST', headers: { 'Content-Type':'application/json', 'x-telegram-bot-api-secret-token':'fixture-hook' },
  body: JSON.stringify(update),
}));
const callback = (from, chat = from, type = 'private') => hook({
  callback_query: { id:'tap', from:{id:from}, data:'accounts:csv', message:{chat:{id:chat,type}} },
});
await hook({ message: { chat:{id:777,type:'private'}, from:{id:777}, text:'/users' } });
assert.deepEqual(savedList.profile_ids, ['A','B']);
assert.equal(calls.at(-1).data.reply_markup.inline_keyboard[0][0].callback_data, 'accounts:csv');
await callback(8592192595);
await callback(888, 777);
await callback(777, 777, 'group');
assert.equal(calls.filter(({method}) => method === 'sendDocument').length, 0);
profiles.reverse();
await callback(777);
const fileCall = calls.at(-1);
assert.equal(fileCall.method, 'sendDocument');
assert.equal(fileCall.data.get('chat_id'), '777');
assert.equal(fileCall.data.get('protect_content'), null);
const attachment = fileCall.data.get('document');
assert.equal(attachment.name, 'ieaum-members.csv');
const csv = await attachment.text();
assert.match(csv, /"ردیف","نام"/);
assert.ok(csv.includes('"1","رضا","نمونه","first"'));
assert.ok(csv.includes('"2","\' =TEST()","«نام»","second","استاد","در انتظار تأیید"'));
assert.ok(!csv.includes('2026-11-20'));
expired = true;
await callback(777);
assert.equal(calls.at(-1).method, 'sendMessage');
assert.match(calls.at(-1).data.text, /دوباره باز کنید/);
console.log('Verified admin-only Telegram CSV, downloadable attachment, preserved row numbers and formula escaping.');
