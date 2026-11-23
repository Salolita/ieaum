import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import api from '../api/portal.ts';
import { digest } from '../server/portal-store.ts';
import { resetDigest } from '../server/portal-entry.ts';
import { currentWeek } from '../server/bot-services.ts';
const origin='https://numeralab.ieaum.ir';
assert.equal(currentWeek('2026-11-21', true, '2026-11-19'), null);
assert.deepEqual(currentWeek('2026-11-21', true, '2026-11-19', true), { date:'2026-11-14', odd:false });
assert.deepEqual(currentWeek('2026-11-21', true, '2026-11-21', true), { date:'2026-11-21', odd:true });
const reviewer=8592192595;
Object.assign(process.env,{PORTAL_ENABLED:'true',PORTAL_ORIGIN:origin,TELEGRAM_BOT_TOKEN:'fixture',TELEGRAM_WEBHOOK_SECRET:'hook',TELEGRAM_ADMIN_IDS:`777,${reviewer}`,SUPABASE_URL:'https://test.example',SUPABASE_PUBLIC_KEY:'fixture',SUPABASE_SECRET_KEY:'fixture'});
const id='00000000-0000-4000-8000-000000000001';
const profile={id,active:true,role:'teacher',review_status:'approved',telegram_id:null,first_name:'Fixture',last_name:'Teacher'};
const tickets=new Map(), sessions=new Set(), deliveries=[];
const membershipBucket=digest(`membership-review:${id}`);
let membershipChecks=0;
let weekEnabled=false;
let liveCodeStatus='offline';
let liveCodeChecks=0;
let weekSchedule={ weekday:6, minute_of_day:360 };
let verifiedPassword='fixture-password';
const signed=(chat)=> {
 const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:chat})});
 params.sort();
 const secret=createHmac('sha256','WebAppData').update('fixture').digest();
 params.set('hash',createHmac('sha256',secret).update([...params].map((pair)=>pair.join('=')).join('\n')).digest('hex'));
 return params.toString();
};
globalThis.fetch=async (url,options)=>{
 const uri=new URL(url), p=uri.pathname, body=JSON.parse(options.body??'null');
 if(uri.href==='https://livecode.ieaum.ir/api/status'){
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(options.credentials,'omit');
  liveCodeChecks++;
  if(liveCodeStatus==='unreachable')throw new TypeError('fixture network error');
  return Response.json({status:liveCodeStatus});
 }
 if(p.endsWith('/sendMessage')){deliveries.push(body);return Response.json({ok:true});}
 if(p.endsWith('/answerCallbackQuery')||p.endsWith('/editMessageText'))return Response.json({ok:true});
 if(p.endsWith('/portal_rate_limit'))return Response.json(body.p_bucket!==membershipBucket||membershipChecks++===0);
 if(p.endsWith('/portal_valid_week_worker'))return Response.json(false);
 if(p.endsWith('/portal_week_subscriptions')){
  if(options.method==='POST'){weekEnabled=body.enabled;weekSchedule={...weekSchedule,...body};return Response.json([]);}
  return Response.json([{enabled:weekEnabled,weekday:weekSchedule.weekday,minute_of_day:weekSchedule.minute_of_day}]);
 }
 if(p.endsWith('/portal_auth_email'))return Response.json('fixture@ieaum.invalid');
 if(p.endsWith('/token')) return body.password===verifiedPassword ? Response.json({user:{id},access_token:'fixture-session'}) : Response.json({}, {status:400});
 if(p.endsWith('/admin/users/'+id)){assert.equal(options.method,'PUT');verifiedPassword=body.password;tickets.clear();sessions.clear();return Response.json({id});}
 if(p.endsWith('/logout')) return new Response(null,{status:204});
 if(p.endsWith('/portal_profiles')){
  if(uri.searchParams.has('review_status')&&uri.searchParams.get('review_status')!==`eq.${profile.review_status}`)return Response.json([]);
  if(uri.searchParams.get('or')?.includes(`telegram_id.neq.${profile.telegram_id}`))return Response.json([]);
  if(options.method==='PATCH'){Object.assign(profile,body);return Response.json([profile]);}
  const filter=uri.searchParams.get('telegram_id');
  return Response.json(!filter||filter==='eq.'+profile.telegram_id||filter==='not.is.null'&&profile.telegram_id?[profile]:[]);
 }
 if(p.endsWith('/portal_tickets')){
  if(options.method==='POST'){tickets.set(body.token_hash,body);return Response.json([]);}
  if(options.method==='DELETE'){
   const hash=uri.searchParams.get('token_hash').slice(3);
   const t=tickets.get(hash);
   if(!t||'eq.'+t.telegram_id!==uri.searchParams.get('telegram_id'))return Response.json([]);
   tickets.delete(hash);return Response.json([t]);
  }
  const ticket=tickets.get(uri.searchParams.get('token_hash').slice(3));
  return Response.json(ticket?[ticket]:[]);
 }
 if(p.endsWith('/portal_open_session')){
  const ticket=tickets.get(body.p_ticket);
  if(!ticket||ticket.telegram_id!==profile.telegram_id||!profile.active)return Response.json(false);
  tickets.delete(body.p_ticket);sessions.add(body.p_session);
  return Response.json(true);
 }
 if(p.endsWith('/portal_sessions')){
  if(options.method==='POST'){sessions.add(body.token_hash);return Response.json([]);}
  if(options.method==='DELETE'){sessions.delete(uri.searchParams.get('token_hash').slice(3));return Response.json([]);}
  assert.equal(options.method,'GET');
  return Response.json(sessions.has(uri.searchParams.get('token_hash').slice(3))?[{profile_id:id}]:[]);
 }
 throw Error(p);
};
const post=(body,hook=false)=>api.fetch(new Request(origin+'/api/portal'+(hook?'?telegram=1':''),{method:'POST',headers:{origin,'content-type':'application/json','x-telegram-bot-api-secret-token':'hook'},body:JSON.stringify(body)}));
const login={action:'login',username:'teacher.user',password:'fixture-password',target:'home'};
const bot=(text,id=55)=>post({message:{text,from:{id},chat:{type:'private',id}}},true);
const callback=(from,data)=>post({callback_query:{id:'fixture-callback',data,from:{id:from},message:{message_id:1,chat:{type:'private',id:from}}}},true);
const browserLogin=await post(login);
assert.equal(browserLogin.status,200);
assert.match(browserLogin.headers.get('set-cookie'),/Max-Age=2592000/);
assert.equal((await post({...login,action:'register',role:'student'})).status,401);
await bot('/start');
assert.ok(deliveries.at(-1).reply_markup.keyboard.flat().some(x=>x.text==='ساخت حساب استاد'));
assert.equal(deliveries.at(-1).reply_markup.is_persistent,true);
assert.equal(deliveries.at(-1).reply_markup.one_time_keyboard,false);
const verified=await post({...login,telegramInitData:signed(55)});
assert.equal(verified.status,200,await verified.clone().text());
assert.equal(verified.headers.get('set-cookie'),null);
const next=new URL((await verified.json()).nextUrl);
assert.equal(next.origin,'https://ieaum.ir');
assert.equal(next.pathname,'/');
const homeTicket = new URLSearchParams(next.hash.slice(1)).get('ticket');
assert.equal(profile.telegram_id,'55');
assert.equal(tickets.has(digest(homeTicket)),true);
assert.ok(deliveries.find(m=>m.text.includes('به پلتفرم دستیار مهندسان صنایع خوش آمدید.')&&m.reply_markup.inline_keyboard[0][0].text==='بزن بریم!'));
assert.ok(!deliveries.at(-1).reply_markup.keyboard.flat().some(x=>x.text.includes('ساخت حساب')));
assert.equal((await post({...login,telegramInitData:signed(56)})).status,409);
const step={action:'redeem-login',ticket:homeTicket};
const redeemed=await post(step);
assert.equal(redeemed.status,200);
assert.equal((await post(step)).status,401);
const cookie=redeemed.headers.get('set-cookie').split(';')[0];
assert.match(cookie,/^__Host-ieaum=/);
const session=await api.fetch(new Request(origin+'/api/portal',{headers:{cookie}}));
const sessionData=await session.json();
assert.equal(sessionData.profile.telegramConnected,true);
assert.equal('telegram_id' in sessionData.profile,false);
const old=await api.fetch(new Request(origin+'/api/portal',{headers:{cookie:cookie.replace('ieaum','numralab')}}));
assert.equal((await old.json()).profile,null);
await bot('ورود به پنل');
assert.equal(deliveries.at(-1).text,'برای ورود کلیک نمایید.');
assert.match(deliveries.at(-1).reply_markup.inline_keyboard[0][0].url,/^https:\/\/ieaum\.ir\/panel\/#ticket=[\w-]{32}$/);
await bot('سرویس‌ها');
assert.deepEqual(deliveries.at(-1).reply_markup.keyboard.map(row => row.map(button => button.text)), [
  ['نامرالب', 'ارائه‌طوری'], ['انداز برانداز', 'استعدادتو'], ['اجرای زنده کد'], ['منوی اصلی'],
]);
assert.equal(liveCodeChecks,0);
await bot('اجرای زنده کد');
assert.equal(deliveries.at(-1).text,'این بخش توسط مدیر غیرفعال شده است.');
liveCodeStatus='online';
await bot('اجرای زنده کد');
assert.equal(deliveries.at(-1).reply_markup.inline_keyboard[0][0].url,'https://livecode.ieaum.ir');
liveCodeStatus='unreachable';
await bot('اجرای زنده کد');
assert.equal(deliveries.at(-1).text,'این بخش توسط مدیر غیرفعال شده است.');
assert.equal(liveCodeChecks,3);
await bot('ارائه‌طوری');
assert.equal(deliveries.at(-1).reply_markup.inline_keyboard[0][0].text,'ایجاد ارائه');
assert.equal(deliveries.at(-1).reply_markup.inline_keyboard[0][1].text,'ارائه‌های من');
assert.equal(deliveries.at(-1).reply_markup.inline_keyboard[0][1].callback_data,'erae:list:');
assert.match(deliveries.at(-1).reply_markup.inline_keyboard[0][0].url,/^https:\/\/ieaum\.ir\/erae-tori\/#ticket=[\w-]{32}$/);
await bot('نمایه من');
assert.match(deliveries.at(-1).text,/شمارهٔ تماس/);
assert.ok(deliveries.at(-1).reply_markup.inline_keyboard.flat().some(button => button.text === 'فراموشی رمز عبور'));
await bot('نامرالب');
const botLink = new URL(deliveries.at(-1).reply_markup.inline_keyboard[0][0].url);
assert.equal(botLink.pathname,'/');
assert.equal((await post({action:'redeem-login',ticket:new URLSearchParams(botLink.hash.slice(1)).get('ticket')})).status,200);
await bot('/start reset');
const resetCode = new URL(deliveries.at(-1).reply_markup.inline_keyboard[0][0].web_app.url).searchParams.get('code');
assert.ok(tickets.has(resetDigest(resetCode)));
assert.equal((await post({action:'redeem-login',ticket:resetCode})).status,401);
const reset={action:'reset-password',resetCode,password:'new-fixture-password',confirmPassword:'new-fixture-password'};
assert.equal((await post(reset)).status,401);
assert.equal((await post({...reset,telegramInitData:signed(56)})).status,403);
assert.equal((await post({...reset,telegramInitData:signed(55)})).status,200);
assert.equal((await post({...reset,telegramInitData:signed(55)})).status,401);
assert.equal((await post(login)).status,401);
login.password=reset.password;
assert.equal((await post(login)).status,200);
await bot('انداز برانداز');
assert.equal(deliveries.at(-1).text,'این سرویس به زودی ارائه می‌شود.');
await bot('استعدادتو');
assert.equal(deliveries.at(-1).text,'این سرویس به زودی ارائه می‌شود.');
await bot('درباره ما');
assert.equal(deliveries.at(-1).reply_markup.inline_keyboard[0][0].url,'https://t.me/ieaum_club');
await bot('ساخت حساب استاد');
assert.ok(!deliveries.at(-1).reply_markup.keyboard.flat().some(x=>x.text.includes('ساخت حساب')));
profile.active=false;profile.review_status='pending';
const reviewMessages=()=>deliveries.filter(message=>message.chat_id===String(reviewer)&&message.reply_markup?.inline_keyboard?.[0][0]?.callback_data?.startsWith('approve:'));
assert.equal((await post({...login,password:'incorrect-password'})).status,401);
assert.equal((await post({...login,telegramInitData:signed(56)})).status,403);
assert.equal(reviewMessages().length,0);
assert.equal((await post({...login,telegramInitData:signed(55)})).status,403);
assert.equal((await post(login)).status,403);
assert.equal(reviewMessages().length,1);
assert.deepEqual(reviewMessages()[0].reply_markup.inline_keyboard[0].map(button=>button.callback_data),[`approve:${id}`,`reject:${id}`]);
await callback(56,`approve:${id}`);
assert.equal(profile.review_status,'pending');
await callback(reviewer,`reject:${id}`);
assert.equal(profile.review_status,'rejected');
profile.review_status='pending';
await callback(reviewer,`approve:${id}`);
assert.equal(profile.active,true);
profile.telegram_id=String(reviewer);
profile.active=false;profile.review_status='pending';
await callback(reviewer,`approve:${id}`);
assert.equal(profile.review_status,'pending');
profile.active=true;profile.review_status='approved';
await bot('/start',reviewer);
const reviewerMenu=deliveries.at(-1).reply_markup;
assert.equal(reviewerMenu.is_persistent,true);
assert.equal(reviewerMenu.one_time_keyboard,false);
assert.ok(reviewerMenu.keyboard.flat().some(button=>button.text==='نمایه من'));
assert.ok(!reviewerMenu.keyboard.flat().some(button=>button.text==='فهرست حساب‌ها'||button.text==='درخواست‌های ثبت‌نام'));
await bot('سرویس‌ها',reviewer);
assert.equal(deliveries.at(-1).reply_markup.is_persistent,true);
assert.ok(deliveries.at(-1).reply_markup.keyboard.flat().some(button=>button.text==='منوی اصلی'));
await callback(reviewer,'acct:status');
assert.match(deliveries.at(-1).text,/تأیید شده است/);
await callback(reviewer,'week:on');
assert.equal(weekEnabled,true);
await callback(reviewer,'week:fri');
assert.equal(weekSchedule.weekday,5);
assert.equal(weekSchedule.minute_of_day,1260);
await callback(reviewer,'week:sat');
assert.equal(weekSchedule.weekday,6);
assert.equal(weekSchedule.minute_of_day,360);
await callback(reviewer,'week:custom');
const customPrompt=deliveries.at(-1).text;
assert.equal(deliveries.at(-1).reply_markup.force_reply,true);
await post({message:{text:'یکشنبه ۱۴:۲۰',from:{id:reviewer},chat:{type:'private',id:reviewer},reply_to_message:{text:customPrompt,from:{is_bot:true}}}},true);
assert.equal(weekSchedule.weekday,0);
assert.equal(weekSchedule.minute_of_day,860);
assert.equal((await callback(reviewer,`acct:yes:${id}`)).status,200);
await bot('ارائه‌طوری',56);
assert.match(deliveries.at(-1).text,/لطفاً حساب کاربری IEAUM بسازید/);
console.log('Verified signed Mini App, legacy binding, secure one-time browser handoff, profile, bot navigation and pending denial.');
