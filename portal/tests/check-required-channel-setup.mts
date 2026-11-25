import assert from 'node:assert/strict';
import { telegramWebhook } from '../server/portal-bot.ts';

const origin = 'https://numeralab.ieaum.ir';
Object.assign(process.env, { PORTAL_ORIGIN: origin, PORTAL_ENABLED: 'true', SUPABASE_URL: 'https://fixture.test',
  SUPABASE_SECRET_KEY: 'fixture', TELEGRAM_ADMIN_IDS: '777', TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_WEBHOOK_SECRET: 'fixture' });
const channels = new Map();
const messages = [];
let lookup = 'accessible';
let botStatus = 'left';
let participantStatus = 'left';
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  const method = url.pathname.split('/').at(-1);
  const body = JSON.parse(options.body ?? 'null');
  if (url.hostname === 'api.telegram.org') {
    if (method === 'sendMessage') messages.push(body);
    if (method === 'getChat') {
      assert.equal(body.chat_id, '@ieaum_club');
      if (lookup === 'inaccessible') return Response.json({ ok:false, error_code:400 }, { status:400 });
      return Response.json({ ok:true, result:{ id:-10011112222, username:'ieaum_club', title:'IE AUM', type:'channel' } });
    }
    if (method === 'getMe') return Response.json({ ok:true, result:{ id:4242 } });
    if (method === 'getChatMember') {
      assert.equal(body.chat_id, -10011112222);
      const status = body.user_id === 4242 ? botStatus : participantStatus;
      if (status === 'inaccessible') return Response.json({ ok:false, error_code:403 }, { status:403 });
      return Response.json({ ok:true, result:{ status } });
    }
    return Response.json({ ok:true });
  }
  if (method === 'portal_profiles') return Response.json([]);
  if (method === 'portal_record_bot_contact') return Response.json(null);
  if (method === 'portal_rate_limit') return Response.json(true);
  if (method === 'portal_required_channels') {
    const id = url.searchParams.get('chat_id')?.slice(3);
    if (options.method === 'POST') {
      channels.set(body.chat_id, { ...body, enabled:false });
      return Response.json([body]);
    }
    if (options.method === 'PATCH') {
      const row = { ...channels.get(id), ...body };
      channels.delete(id);
      channels.set(row.chat_id, row);
      return Response.json([row]);
    }
    if (options.method === 'DELETE') {
      channels.delete(id);
      return Response.json([]);
    }
    return Response.json([...channels.values()].filter((row) => (!id || row.chat_id === id)
      && (!url.searchParams.has('enabled') || row.enabled)));
  }
  throw new Error(url.href);
};
const webhook = (body) => telegramWebhook(new Request(origin + '/api/portal?telegram=1', {
  method:'POST', headers:{ 'content-type':'application/json', 'x-telegram-bot-api-secret-token':'fixture' }, body:JSON.stringify(body),
}));
const submit = (data, id=777) => webhook({ message:{ chat:{ id, type:'private' }, from:{ id }, ...data } });
const callback = (data) => webhook({ callback_query:{ id:'callback', data, from:{ id:777 }, message:{ chat:{ id:777, type:'private' } } } });
const replyToPrompt = (text) => submit({ text, reply_to_message:{ text:messages.at(-1).text, from:{ is_bot:true } } });
const id = '-10011112222';

await callback('membership:add');
await replyToPrompt('https://t.me/ieaum_club');
assert.equal(channels.get(id).enabled, false);
await callback('membership:on:' + id);
assert.match(messages.at(-1).text, /مدیران همان کانال/);
assert.equal(channels.get(id).enabled, false);
botStatus = 'inaccessible';
await callback('membership:on:' + id);
assert.match(messages.at(-1).text, /@ieaumbot/);
assert.equal(channels.get(id).enabled, false);
await callback('membership:delete:' + id);

lookup = 'inaccessible';
await callback('membership:add');
await replyToPrompt('@ieaum_club');
const picker = messages.at(-1).reply_markup.keyboard[0][0].request_chat;
assert.equal(picker.chat_is_channel, true);
assert.equal(picker.chat_has_username, true);
const shared = { request_id:picker.request_id, chat_id:Number(id), title:'IE AUM', username:'ieaum_club' };
await submit({ chat_shared:shared }, 888);
await submit({ chat_shared:{ ...shared, request_id:-1 } });
assert.equal(channels.size, 0);
await submit({ chat_shared:shared });
await submit({ chat_shared:shared });
assert.equal(channels.size, 1);
assert.equal(channels.get(id).enabled, false);
assert.ok(messages.at(-1).reply_markup.keyboard);
botStatus = 'administrator';
await callback('membership:on:' + id);
assert.equal(channels.get(id).enabled, true);
await submit({ text:'سرویس‌ها' }, 888);
assert.match(messages.at(-1).text, /عضو شوید/);
participantStatus = 'member';
await submit({ text:'سرویس‌ها' }, 888);
assert.match(messages.at(-1).text, /سرویس را انتخاب کنید/);
console.log('Verified the public handle and picker, admin-only registration, activation permissions and membership access.');
