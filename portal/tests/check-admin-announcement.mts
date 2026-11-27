import assert from 'node:assert/strict';
import { telegramWebhook } from '../server/portal-bot.ts';
import { announcementLabel, announcementPrompt, announcementStatusLabel, deliverQueuedAnnouncements } from '../server/admin-announcements.ts';
Object.assign(process.env,{TELEGRAM_WEBHOOK_SECRET:'fixture-hook',TELEGRAM_ADMIN_IDS:'100,101',TELEGRAM_BOT_TOKEN:'fixture-token',PORTAL_ORIGIN:'https://numeralab.ieaum.ir',SUPABASE_URL:'https://test.example',SUPABASE_SECRET_KEY:'fixture'});
const first='00000000-0000-4000-8000-000000000001';
const second='00000000-0000-4000-8000-000000000002';
const third='00000000-0000-4000-8000-000000000003';
const db=new Map();
const composers=new Map();
const contacts=new Map();
const deliveries=[];
const telegram=[];
globalThis.fetch=async (url,options)=>{
  const req=new URL(url), data=JSON.parse(options.body??'null');
  if(req.pathname.endsWith('/portal_required_channels'))return Response.json([]);
  const filter=req.searchParams;
  if(req.hostname==='api.telegram.org'){
    const method=req.pathname.split('/').at(-1);
    telegram.push({method,...data});
    return data.chat_id==='301' ? Response.json({ok:false},{status:403}) : Response.json({ok:true});
  }
  if(req.pathname.endsWith('/portal_rate_limit'))return Response.json(true);
  if(req.pathname.endsWith('/portal_announcement_composers')){
    if(options.method==='POST'){
      composers.set(data.admin_telegram_id,data);
      return Response.json([]);
    }
    const owner=filter.get('admin_telegram_id').slice(3);
    const draft=composers.get(owner);
    if(!draft||(filter.has('id')&&filter.get('id')!==`eq.${draft.id}`))return Response.json([]);
    composers.delete(owner);
    return Response.json([draft]);
  }
  if(req.pathname.endsWith('/portal_record_bot_contact')){
    contacts.set(data.p_chat,data.p_active);
    return Response.json(null);
  }
  if(req.pathname.endsWith('/portal_enqueue_announcement')){
    const draft=db.get(data.p_id);
    if(!draft || draft.admin_telegram_id!==data.p_admin || draft.state!=='draft')return Response.json(null);
    const receivers=new Set(['300','301'].filter(id=>contacts.get(id)!==false));
    if(data.p_audience==='all')for(const [id,active] of contacts)if(active)receivers.add(id);
    draft.state='sending';draft.confirm_message_id=data.p_message;
    for(const chat_id of receivers)deliveries.push({announcement_id:draft.id,chat_id,body:draft.body,state:'pending',attempts:0});
    return Response.json(receivers.size);
  }
  if(req.pathname.endsWith('/portal_claim_announcement_deliveries')){
    const pending=deliveries.filter(delivery=>delivery.state==='pending').slice(0,data.p_count);
    for(const delivery of pending){delivery.state='sending';delivery.attempts++;}
    return Response.json(pending);
  }
  if(req.pathname.endsWith('/portal_announcement_status')){
    const match=[...db.values()].reverse().find(item=>item.admin_telegram_id===data.p_admin
      && ['sending','sent'].includes(item.state) && (data.p_id===null || item.id===data.p_id));
    if (!match) return Response.json([]);
    const rows=deliveries.filter(row=>row.announcement_id===match.id);
    return Response.json([{id:match.id,state:match.state,
      delivered:match.delivered??rows.filter(row=>row.state==='sent').length,
      failed:match.failed??rows.filter(row=>row.state==='failed').length,
      remaining:rows.filter(row=>['sending','pending'].includes(row.state)).length}]);
  }
  if(req.pathname.endsWith('/portal_finish_announcements')){
    const summaries=[];
    for(const draft of db.values()){
      const rows=deliveries.filter(delivery=>delivery.announcement_id===draft.id);
      if(draft.state!=='sending'||rows.some(row=>row.state==='pending'||row.state==='sending'))continue;
      draft.state='sent';
      draft.delivered=rows.filter(row=>row.state==='sent').length;
      draft.failed=rows.filter(row=>row.state==='failed').length;
      summaries.push({announcement_id:draft.id,admin_telegram_id:draft.admin_telegram_id,message_id:draft.confirm_message_id,
        delivered:rows.filter(row=>row.state==='sent').length,failed:rows.filter(row=>row.state==='failed').length});
    }
    return Response.json(summaries);
  }
  if(req.pathname.endsWith('/portal_announcement_deliveries')){
    for(const row of deliveries.filter(row=>`eq.${row.announcement_id}`===filter.get('announcement_id'))){
      if(options.method==='DELETE')deliveries.splice(deliveries.indexOf(row),1);
      else if(`eq.${row.chat_id}`===filter.get('chat_id'))Object.assign(row,data);
    }
    return Response.json([]);
  }
  if(req.pathname.endsWith('/portal_profiles')){
    if(filter.get('active')==='eq.true' && filter.get('telegram_id')==='not.is.null')return Response.json([{telegram_id:'300'},{telegram_id:'301'}]);
    return Response.json([]);
  }
  if(req.pathname.endsWith('/portal_announcements')){
    if(options.method==='POST'){
      const id=[first,second,third][data.source_message_id-1];
      if(db.has(id))return Response.json({}, {status:409});
      const saved={id,...data,state:'draft'}; db.set(id,saved); return Response.json([saved]);
    }
    if(options.method==='PATCH'){
      const draft=db.get(filter.get('id').slice(3));
      if(!draft||filter.get('state')!=='eq.'+draft.state||filter.has('admin_telegram_id')&&filter.get('admin_telegram_id')!=='eq.'+draft.admin_telegram_id)return Response.json([]);
      Object.assign(draft,data);return Response.json([draft]);
    }
    return Response.json([...db.values()].filter(draft=>filter.get('admin_telegram_id')==='eq.'+draft.admin_telegram_id
      &&filter.get('state')==='eq.'+draft.state&&(filter.get('id')==='eq.'+draft.id||filter.get('source_message_id')==='eq.'+draft.source_message_id)));
  }
  throw Error(req.href);
};
const webhook=(body,secret='fixture-hook')=>telegramWebhook(new Request('https://numeralab.ieaum.ir/api/portal?telegram=1',{method:'POST',headers:{'Content-Type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify(body)}));
const message=(id,text,extra={})=>webhook({message:{text,...extra,from:{id},chat:{id,type:'private'}}});
const replyTo={from:{is_bot:true},text:announcementPrompt,message_id:7};
const callback=(id,data)=>webhook({callback_query:{data,id:'test',from:{id},message:{message_id:77,chat:{id,type:'private'}}}});
await assert.rejects(webhook({},'wrong'),{status:403});
await message(200,'/start');
assert.equal(contacts.get('200'),true);
assert.ok(!telegram.at(-1).reply_markup.keyboard.flat().some(row=>row.text===announcementLabel));
await message(100,'/start');
assert.ok(!telegram.at(-1).reply_markup.keyboard.flat().some(row=>row.text===announcementLabel));
await message(100,'اعلان‌ها');
assert.ok(telegram.at(-1).reply_markup.keyboard.flat().some(row=>row.text===announcementLabel));
assert.ok(telegram.at(-1).reply_markup.keyboard.flat().some(row=>row.text===announcementStatusLabel));
await message(100,announcementLabel);
assert.equal(telegram.at(-1).reply_markup.force_reply,undefined);
await callback(100,telegram.at(-1).reply_markup.inline_keyboard[0][0].callback_data);
await message(100,'Ordinary after cancel',{message_id:5});
assert.equal(db.size,0);
await message(100,announcementLabel);
const body='Test notice';
await message(200,body,{message_id:1,reply_to_message:replyTo});
assert.equal(db.size,0);
await message(100,body,{message_id:1});
const preview=telegram.at(-1);
assert.ok(preview.text.includes(body));
assert.equal(db.size,1);
assert.deepEqual(preview.reply_markup.inline_keyboard.slice(0,2).map(row=>row[0].text),['همهٔ کاربران ربات','دارندگان حساب فعال متصل']);
await callback(200,'announce-accounts:'+first);
await callback(101,'announce-send-accounts:'+first);
assert.equal(db.get(first).state,'draft');
assert.equal(telegram.filter(entry=>entry.chat_id==='300').length,0);
await callback(100,'announce-accounts:'+first);
const sendButton=telegram.at(-1).reply_markup.inline_keyboard[0][0].callback_data;
assert.equal(db.get(first).state,'draft');
await Promise.all([callback(100,sendButton),callback(100,sendButton)]);
assert.equal(db.get(first).state,'sending');
const refresh='announce-status:'+first;
assert.ok(telegram.some(entry=>entry.reply_markup?.inline_keyboard?.flat().some(button=>button.callback_data===refresh)));
await callback(101,refresh);
assert.match(telegram.at(-1).text,/در دسترس نیست/);
await callback(100,refresh);
assert.match(telegram.findLast(entry=>entry.method==='editMessageText').text,/در انتظار: ۲/);
await deliverQueuedAnnouncements();
await message(100,announcementStatusLabel);
assert.match(telegram.at(-1).text,/ارسال موفق: ۱/);
await callback(100,refresh);
assert.match(telegram.findLast(entry=>entry.method==='editMessageText').text,/ارسال ناموفق: ۱/);
assert.equal(telegram.filter(entry=>entry.chat_id==='300').length,1);
assert.equal(telegram.filter(entry=>entry.chat_id==='301').length,1);
assert.equal(db.get(first).state,'sent');
assert.ok(telegram.some(entry=>entry.method==='editMessageText'&&entry.text.includes('ارسال موفق: ۱')&&entry.text.includes('ارسال ناموفق: ۱')));
assert.equal(contacts.get('301'),false);
assert.ok(!telegram.some(entry=>entry.chat_id==='200'&&entry.text===body));
await message(100,'Cancelled',{message_id:2,reply_to_message:replyTo});
assert.ok(telegram.some(entry=>entry.method==='deleteMessage'&&entry.message_id===7));
await callback(100,'announce-cancel:'+second);
await callback(100,'announce-send:'+second);
assert.equal(db.get(second).state,'cancelled');
assert.equal(telegram.filter(entry=>entry.chat_id==='300').length,1);
await webhook({my_chat_member:{chat:{id:201,type:'private'},new_chat_member:{status:'kicked'}}});
assert.equal(contacts.get('201'),false);
await message(100,announcementLabel);
await message(100,'Everyone',{message_id:3});
await callback(100,'announce-all:'+third);
await callback(100,'announce-send-all:'+third);
await deliverQueuedAnnouncements();
assert.deepEqual(telegram.filter(entry=>entry.method==='sendMessage'&&entry.text==='Everyone').map(entry=>entry.chat_id).sort(),['100','200','300']);
assert.equal(deliveries.length,0);
console.log('Verified admin-only menu and confirmation, recipient selection, cancellation, duplicate protection and delivery summary.');
