import assert from 'node:assert/strict';
import { deliverPersonalNotices, handleBirthdayCallback, matchesBirthday, saveBirthdayTemplate } from '../server/bot-features.ts';
import { jalaliDateLabel, jalaliToISO } from '../client/utils/jalali.ts';

Object.assign(process.env,{TELEGRAM_ADMIN_IDS:'100',TELEGRAM_BOT_TOKEN:'fixture',SUPABASE_URL:'https://test.example',SUPABASE_SECRET_KEY:'fixture'});
const legacyDate = jalaliToISO('1384/8/29');
const today = jalaliToISO('1405/8/29');
assert.match(jalaliDateLabel(legacyDate), /آبان/);
assert.equal(matchesBirthday(legacyDate, today), true);
assert.equal(matchesBirthday(legacyDate, jalaliToISO('1405/8/30')), false);
const profile = { id:'00000000-0000-4000-8000-000000000012', username:'legacy.name', first_name:'کاربر', last_name:'آزمایشی', birth_date:legacyDate, telegram_id:'55' };
const prefs = { menu_ready:false, usernames_queued:false, birthday_enabled:true, birthday_template:'{name} عزیز، تولدت مبارک!', birthdays_queued_on:null };
const telegramCalls = [];
const queue = [];
globalThis.fetch = async (url, options) => {
  const uri = new URL(url);
  const path = uri.pathname.split('/').at(-1);
  const data = JSON.parse(options.body ?? 'null');
  if (uri.hostname === 'api.telegram.org') { telegramCalls.push({ path, ...data }); return Response.json({ ok:true }); }
  if (path === 'portal_bot_preferences') {
    if (options.method === 'PATCH') Object.assign(prefs, data);
    return Response.json([prefs]);
  }
  if (path === 'portal_profiles') return Response.json([profile]);
  if (path === 'portal_prepare_personal_notices') {
    if (data.p_kind === 'username') prefs.usernames_queued = true;
    else {
      assert.deepEqual(data.p_profiles, [profile.id]);
      prefs.birthdays_queued_on = data.p_date;
    }
    queue.push({ profile_id:profile.id, kind:data.p_kind, event_date:data.p_date, attempts:1 });
    return Response.json(null);
  }
  if (path === 'portal_claim_personal_notices') return Response.json(queue.splice(0));
  if (path === 'portal_personal_notices' && options.method === 'PATCH') { assert.equal(data.state,'sent'); return Response.json([]); }
  throw new Error(uri.pathname);
};

await deliverPersonalNotices(new Date(`${today}T05:29:00Z`));
assert.ok(telegramCalls.some(entry => entry.path === 'setMyCommands' && entry.commands.some(item => item.command === 'menu')));
assert.ok(telegramCalls.some(entry => entry.path === 'setChatMenuButton' && entry.menu_button.type === 'commands'));
assert.ok(telegramCalls.some(entry => entry.chat_id === '55' && /۲۴ تا ۴۸/.test(entry.text)));
assert.ok(!telegramCalls.some(entry => entry.chat_id === '55' && /تولدت/.test(entry.text)));
await deliverPersonalNotices(new Date(`${today}T05:30:00Z`));
await deliverPersonalNotices(new Date(`${today}T05:31:00Z`));
assert.equal(telegramCalls.filter(entry => entry.chat_id === '55' && entry.text.includes('کاربر آزمایشی عزیز، تولدت مبارک')).length, 1);
await handleBirthdayCallback({ id:'cb', data:'birthday:off', from:{id:55}, message:{chat:{id:55,type:'private'}} });
assert.equal(prefs.birthday_enabled,true);
await handleBirthdayCallback({ id:'cb', data:'birthday:off', from:{id:100}, message:{chat:{id:100,type:'private'}} });
assert.equal(prefs.birthday_enabled,false);
await saveBirthdayTemplate('100','تبریک تولد بدون نام');
assert.equal(prefs.birthday_template,'{name} عزیز، تولدت مبارک!');
await saveBirthdayTemplate('100','تولدت مبارک {name}!');
assert.equal(prefs.birthday_template,'تولدت مبارک {name}!');
console.log('Verified command menu, legacy-name notice, Tehran birthday boundary, Persian dates and admin template controls.');
