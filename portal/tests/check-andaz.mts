import assert from 'node:assert/strict';
import api from '../api/erae-session.ts';
import {andazProgress,andazSummary,courseRequirements,courses,coursesById} from '../andaz-courses.ts';
import {andazCallback} from '../server/andaz-bot.ts';

const origin='https://ieaum.ir';
Object.assign(process.env,{PORTAL_ENABLED:'true',PORTAL_ORIGIN:'https://numeralab.ieaum.ir',SUPABASE_URL:'https://example.test',
  SUPABASE_SECRET_KEY:'fixture-only',TELEGRAM_BOT_TOKEN:'fixture-only'});
const learner={id:'00000000-0000-4000-8000-000000000001',active:true,role:'student'};
const instructor={...learner,id:'00000000-0000-4000-8000-000000000002',role:'teacher'};
const selection=new Map();
const telegram=[];
let account=learner;
globalThis.fetch=async (url, options)=>{
  const addr=new URL(url);
  const path=addr.pathname.split('/').at(-1);
  const body=JSON.parse(options?.body??'null');
  if(addr.hostname==='api.telegram.org'){
    telegram.push({method:path,...body});
    return Response.json({ok:true,result:true});
  }
  if(path==='portal_profiles') return Response.json([account]);
  if(path==='portal_rate_limit') return Response.json(true);
  if(path==='portal_sessions') return Response.json([{profile_id:account.id}]);
  if(path==='portal_required_channels') return Response.json([]);
  if(path==='portal_andaz_passed_courses'){
    if(options.method==='POST'){
      assert.equal(body.profile_id,account.id);
      assert.equal(addr.searchParams.get('on_conflict'),'profile_id,slot');
      selection.set(body.profile_id + ':' + body.slot,body);
      return Response.json([body]);
    }
    assert.equal(addr.searchParams.get('profile_id'),'eq.' + account.id);
    if(options.method==='DELETE'){
      const key=account.id + ':' + addr.searchParams.get('slot').slice(3);
      if(addr.searchParams.get('course_id') === 'eq.' + selection.get(key)?.course_id) selection.delete(key);
    }
    return Response.json([...selection.values()].filter(row=>row.profile_id===account.id));
  }
  throw new Error(path);
};
const req=(body,cookie='__Host-ieaum='+'a'.repeat(32))=>api.fetch(new Request(origin+'/api/account',{
  method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body),
}));
const cb=(data, user=55)=>andazCallback({id:'fixture',from:{id:user},message:{chat:{type:'private',id:55},message_id:12},data:'andaz:' + data});

assert.equal(new Set(courses.map(course=>course.id)).size,courses.length);
for(const course of courses){
  assert.ok([...course.prerequisites,...course.corequisites].every(id=>coursesById.has(id)));
}
const catalog=andazProgress(Object.fromEntries(courses.map(course=>[course.id,course.credits])));
assert.equal(catalog.total,146);
for (const [category,expected] of [['general',28],['basic',21],['specialty',66],['skills',9],['prep',6]]) {
  const slots=new Map(courses.filter(course=>course.category===category).map(course=>[course.slot,course.credits]));
  assert.equal([...slots.values()].reduce((sum,credits)=>sum+credits,0),expected,category);
}
assert.deepEqual(andazProgress({}).sections.map(section=>section.required),[28,21,66,9,22,6]);
assert.deepEqual(andazProgress({'16':3,'24-2':2}).sections.map(section=>section.counted),[0,3,0,0,0,2]);
assert.match(courseRequirements(coursesById.get('18'),{'17':3}),/هم‌نیاز ✓ ریاضی عمومی ۲/);
assert.match(courseRequirements(coursesById.get('26'),{}),/پیش‌نیاز ریاضی عمومی ۱، جبر خطی/);
assert.match(andazSummary({'16':3}),/۳ از ۱۴۶ واحد/);
assert.equal((await req({action:'andaz:get'},'')).status,401);
account=instructor;
assert.equal((await req({action:'andaz:set',course:'16',credits:3})).status,403);
await cb('start');
assert.match(telegram.at(-1).text,/حساب دانشجویی فعال/);
account=learner;
assert.equal((await req({action:'andaz:set',course:'16',credits:2})).status,422);
assert.equal((await req({action:'andaz:set',course:'65',credits:5})).status,422);
assert.equal((await req({action:'andaz:set',course:'90',credits:3})).status,422);
assert.deepEqual(await (await req({action:'andaz:set',course:'9a',credits:2})).json(),{passed:{'9a':2}});
await cb('set:9b:2');
assert.deepEqual(await (await req({action:'andaz:get'})).json(),{passed:{'9b':2}});
await cb('set:9a:0'); // A stale button cannot remove another alternative in the same group.
assert.deepEqual(await (await req({action:'andaz:get'})).json(),{passed:{'9b':2}});
await cb('set:16:3',56);
assert.deepEqual(await (await req({action:'andaz:get'})).json(),{passed:{'9b':2}});
await cb('set:16:3');
assert.equal(telegram.at(-1).method,'editMessageText');
assert.match(telegram.at(-1).text,/ریاضی عمومی ۱/);
await cb('units:65');
assert.equal(telegram.at(-1).reply_markup.inline_keyboard[0].length,3);
await cb('set:65:3');
assert.deepEqual(await (await req({action:'andaz:get'})).json(),{passed:{'9b':2,'16':3,'65':3}});
await cb('start');
assert.match(telegram.at(-1).text,/۸ از ۱۴۶ واحد/);
assert.equal(telegram.at(-1).reply_markup.inline_keyboard.length,6);
console.log('Andaz catalog, role restrictions, shared selections, elective alternates, credits and Telegram paging verified.');
