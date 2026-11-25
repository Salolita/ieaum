import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import api from '../api/portal.ts';
import { telegramLaunchData } from '../client/utils/telegram-launch.ts';
const origin='https://numeralab.ieaum.ir';
Object.assign(process.env,{PORTAL_ENABLED:'true',PORTAL_ORIGIN:origin,TELEGRAM_BOT_TOKEN:'fixture',TELEGRAM_WEBHOOK_SECRET:'hook',TELEGRAM_ADMIN_IDS:'777',STUDENT_NUMBER_PREFIX:'404',SUPABASE_URL:'https://test.example',SUPABASE_PUBLIC_KEY:'fixture',SUPABASE_SECRET_KEY:'fixture'});
const auth=(id=55,age=0)=>{
 const data=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)-age),user:JSON.stringify({id})});
 data.sort();
 const secret=createHmac('sha256','WebAppData').update('fixture').digest();
 data.set('hash',createHmac('sha256',secret).update([...data].map(([k,v])=>k+'='+v).join('\n')).digest('hex'));
 return data.toString();
};
let profile, duplicate=false, created=0, messages=[];
globalThis.fetch=async (url,options)=>{
 const path=new URL(url);
 if(path.pathname.endsWith('/portal_required_channels'))return Response.json([]);
 const body=JSON.parse(options.body??'null');
 if(path.hostname==='api.telegram.org'){messages.push(body);return Response.json({ok:true});}
 if(path.pathname.endsWith('/portal_rate_limit'))return Response.json(true);
 if(path.pathname.endsWith('/portal_profiles')){
  if(duplicate&&path.searchParams.has('student_number'))return Response.json([{username:'other-account'}]);
  return Response.json(path.searchParams.has('id')&&profile?[profile]:[]);
 }
 if(path.pathname.endsWith('/admin/users')){
  assert.equal(body.password,'18364925');
  profile={id:'00000000-0000-4000-8000-000000000001',...Object.values(body.app_metadata)[0]};
  created++;
  return Response.json({id:profile.id});
 }
 throw Error(path.pathname);
};
const post=(body,hook=false)=>api.fetch(new Request(origin+'/api/portal'+(hook?'?telegram=1':''),{method:'POST',headers:{origin,'content-type':'application/json','x-telegram-bot-api-secret-token':'hook'},body:JSON.stringify(body)}));
const fixture={action:'register',role:'student',username:'_test_student',password:'18364925',firstName:'علی‌رضا',lastName:'حسینی',studentNumber:'۴۰۴۱۲۳۴۵۶',phone:'۰۹۱۵۰۰۰۰۰۰۰',birthDate:'2005-01-02',telegramInitData:auth()};
assert.equal(telegramLaunchData('#tgWebAppData='+encodeURIComponent(fixture.telegramInitData)+'&tgWebAppPlatform=tdesktop'),fixture.telegramInitData);
assert.equal(telegramLaunchData('#panel'),'');
const cases=[
 [{firstName:'Ali'},'firstName',/فارسی/], [{lastName:'Ahmadi'},'lastName',/فارسی/], [{firstName:''},'firstName',/وارد کنید/],
 [{password:'1234567'},'password',/۸/], [{username:'فارسی'},'username',/انگلیسی/],
 [{studentNumber:'۴۰۵۱۲۳۴۵۶'},'studentNumber',/۴۰۴/], [{studentNumber:'15x'},'studentNumber',/رقم/],
 [{birthDate:'2005-02-30'},'birthDate',/تاریخ تولد/], [{phone:'abc'},'phone',/موبایل ایران/],
 [{phone:'02112345678'},'phone',/۰۹/], [{phone:'+989150000000'},'phone',/۱۱/], [{phone:'0915000000'},'phone',/۱۱/],
 ...['abcd','test.user','test-user','test/user',' testuser','Kelvin'].map(username=>[{username},'username',/زیرخط/]),
 [{role:'teacher',courseName:''},'courseName',/نام درس/],
];
for(const [change,field,pattern] of cases){
 const result=await post({...fixture,...change});
 assert.equal(result.status,422);
 const data=await result.json();
 assert.equal(data.field,field);
 assert.match(data.error,pattern);
}
for(const [telegramInitData,code] of [['','telegram_missing'],[auth(55,901),'telegram_expired'],[auth().replace('%2255','%2256')+'x','telegram_invalid']]){
 const result=await post({...fixture,telegramInitData});
 assert.equal(result.status,401);
 assert.equal((await result.json()).code,code);
}
duplicate=true;
const used=await post(fixture);
assert.equal(used.status,409);
assert.equal((await used.json()).field,'studentNumber');
duplicate=false;
assert.equal(created,0);
assert.equal((await post({message:{text:'/start signup',chat:{id:55,type:'private'},from:{id:55}}},true)).status,200);
assert.match(messages.at(-1).reply_markup.inline_keyboard[0][0].web_app.url,/role=student$/);
assert.match(messages.at(-1).reply_markup.inline_keyboard[1][0].web_app.url,/role=teacher$/);
assert.equal((await post(fixture)).status,201);
assert.equal(profile.first_name,'علی‌رضا');
assert.equal(profile.student_number,'404123456');
assert.equal((await post({...fixture,role:'teacher',courseName:'تحقیق در عملیات'})).status,201);
assert.equal(profile.course_name,'تحقیق در عملیات');
assert.equal(created,2);
assert.ok(messages.some(message=>message.chat_id==='777'&&message.text.includes('درخواست حساب')));
assert.ok(!messages.some(message=>message.chat_id==='8592192595'));
console.log('Verified Persian field errors, eight-digit password, duplicate numbers, direct Mini App launch, signed-data fallback and expired-session handling.');
