import assert from 'node:assert/strict';
import { telegramWebhook } from '../server/portal-bot.ts';
import { announcementLabel, announcementPrompt } from '../server/admin-announcements.ts';
Object.assign(process.env,{TELEGRAM_WEBHOOK_SECRET:'fixture-hook',TELEGRAM_ADMIN_IDS:'100,101',TELEGRAM_BOT_TOKEN:'fixture-token',PORTAL_ORIGIN:'https://numeralab.ieaum.ir',SUPABASE_URL:'https://test.example',SUPABASE_SECRET_KEY:'fixture'});
const first='00000000-0000-4000-8000-000000000001';
const second='00000000-0000-4000-8000-000000000002';
const db=new Map();
const telegram=[];
globalThis.fetch=async (url,options)=>{
  const req=new URL(url), data=JSON.parse(options.body??'null');
  const filter=req.searchParams;
  if(req.hostname==='api.telegram.org'){
    const method=req.pathname.split('/').at(-1);
    telegram.push({method,...data});
    return data.chat_id==='301' ? Response.json({ok:false},{status:403}) : Response.json({ok:true});
  }
  if(req.pathname.endsWith('/portal_rate_limit'))return Response.json(true);
  if(req.pathname.endsWith('/portal_profiles')){
    if(filter.get('active')==='eq.true' && filter.get('telegram_id')==='not.is.null')return Response.json([{telegram_id:'300'},{telegram_id:'301'}]);
    return Response.json([]);
  }
  if(req.pathname.endsWith('/portal_announcements')){
    if(options.method==='POST'){
      const id=data.source_message_id===1?first:second;
      if(db.has(id))return Response.json({}, {status:409});
      const saved={id,...data,state:'draft'}; db.set(id,saved); return Response.json([saved]);
    }
    if(options.method==='PATCH'){
      const draft=db.get(filter.get('id').slice(3));
      if(!draft||filter.get('state')!=='eq.'+draft.state||filter.has('admin_telegram_id')&&filter.get('admin_telegram_id')!=='eq.'+draft.admin_telegram_id)return Response.json([]);
      Object.assign(draft,data);return Response.json([draft]);
    }
    return Response.json([...db.values()].filter(draft=>filter.get('source_message_id')==='eq.'+draft.source_message_id&&filter.get('state')==='eq.'+draft.state));
  }
  throw Error(req.href);
};
const webhook=(body,secret='fixture-hook')=>telegramWebhook(new Request('https://numeralab.ieaum.ir/api/portal?telegram=1',{method:'POST',headers:{'Content-Type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify(body)}));
const message=(id,text,extra={})=>webhook({message:{text,...extra,from:{id},chat:{id,type:'private'}}});
const replyTo={from:{is_bot:true},text:announcementPrompt};
const callback=(id,data)=>webhook({callback_query:{data,id:'test',from:{id},message:{message_id:77,chat:{id,type:'private'}}}});
await assert.rejects(webhook({},'wrong'),{status:403});
await message(200,'/start');
assert.ok(!telegram.at(-1).reply_markup.keyboard.flat().some(row=>row.text===announcementLabel));
await message(100,'/start');
assert.ok(telegram.at(-1).reply_markup.keyboard.flat().some(row=>row.text===announcementLabel));
await message(100,announcementLabel);
assert.equal(telegram.at(-1).reply_markup.force_reply,true);
const body='Test notice';
await message(200,body,{message_id:1,reply_to_message:replyTo});
assert.equal(db.size,0);
await message(100,body,{message_id:1,reply_to_message:replyTo});
const preview=telegram.at(-1);
assert.ok(preview.text.includes(body));
assert.equal(db.size,1);
const sendButton=preview.reply_markup.inline_keyboard[0][0].callback_data;
await callback(200,sendButton);
await callback(101,sendButton);
assert.equal(db.get(first).state,'draft');
assert.equal(telegram.filter(entry=>entry.chat_id==='300').length,0);
await Promise.all([callback(100,sendButton),callback(100,sendButton)]);
assert.equal(telegram.filter(entry=>entry.chat_id==='300').length,1);
assert.equal(telegram.filter(entry=>entry.chat_id==='301').length,1);
assert.equal(db.get(first).state,'sent');
assert.ok(telegram.some(entry=>entry.method==='editMessageText'&&entry.text.includes('ارسال موفق: ۱')&&entry.text.includes('ارسال ناموفق: ۱')));
await message(100,'Cancelled',{message_id:2,reply_to_message:replyTo});
await callback(100,'announce-cancel:'+second);
await callback(100,'announce-send:'+second);
assert.equal(db.get(second).state,'cancelled');
assert.equal(telegram.filter(entry=>entry.chat_id==='300').length,1);
console.log('Verified admin-only menu and confirmation, recipient selection, cancellation, duplicate protection and delivery summary.');
