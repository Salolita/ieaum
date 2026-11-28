import assert from 'node:assert/strict';
import { quizAction } from '../server/portal-quizzes.ts';
import { endOfQuizDate } from '../client/utils/quiz-time.ts';
Object.assign(process.env,{SUPABASE_URL:'https://example.test',SUPABASE_SECRET_KEY:'fixture',TELEGRAM_BOT_TOKEN:'fixture',PORTAL_ORIGIN:'https://numeralab.ieaum.ir'});
const id='00000000-0000-4000-8000-000000000001';
const memberId='00000000-0000-4000-8000-000000000003';
const groupId='00000000-0000-4000-8000-000000000004';
const people=[{id:memberId,username:'sample',first_name:'Sample',last_name:'Student',telegram_id:'123'},
 {id:'00000000-0000-4000-8000-000000000005',username:'unlinked',first_name:'Other',last_name:'Student',telegram_id:null}];
const teacher={id,username:'teacher',role:'teacher',first_name:'نام',last_name:'استاد',active:true,course_name:'آمار'};
const student={...teacher,role:'student',username:'sample'};
const manager={...student,id:'00000000-0000-4000-8000-000000000002',username:'saleh_2007k',telegram_id:'1484056418'};
let writeOwner, quizFilter;
let quiz={id,title:'آزمون یک',audience:['sample','unlinked'],content:[{prompt:'question',options:['1','2','3','4'],correct:1}],published:false,course_name:'آمار',deadline_at:'2099-11-15T20:30:00.000Z',duration_minutes:30};
let messages=[], started=false, group;
globalThis.fetch=async (url,options)=>{
 const path=new URL(url), body=JSON.parse(options.body??'null');
 if(path.pathname.endsWith('portal_rate_limit')) return Response.json(true);
 if(path.pathname.endsWith('portal_profiles')) {
   assert.equal(path.searchParams.get('role'),'eq.student');
   assert.equal(path.searchParams.get('active'),'eq.true');
   const columns=path.searchParams.get('select').split(',');
   const ids=path.searchParams.get('id');
   const names=path.searchParams.get('username');
   return Response.json(people.filter(person=>(!ids||ids.includes(person.id))&&(!names||names.includes('"' + person.username + '"')))
     .map(person=>Object.fromEntries(columns.map(key=>[key,person[key]]))));
 }
 if(path.pathname.endsWith('portal_quiz_student_groups')) {
   const owner=path.searchParams.get('owner_id');
   if(options.method==='POST') group={id:groupId,...body};
   else if(!group||owner!=='eq.'+group.owner_id) return Response.json([]);
   else if(options.method==='PATCH') group={...group,...body};
   const fields=path.searchParams.get('select').split(',');
   return Response.json([Object.fromEntries(fields.map(key=>[key,group[key]]))]);
 }
 if(path.pathname.endsWith('portal_quizzes')) {
   quizFilter=path.searchParams;
   if(options.method==='POST'){writeOwner=body.owner_id;return Response.json([]);}
   if(options.method==='PATCH'){
     if(body.deadline_at){quiz.deadline_at=body.deadline_at;return Response.json([quiz]);}
     if(quiz.published) return Response.json([]);
     quiz.published=true;
   }
   return Response.json([quiz]);
 }
 if(path.pathname.endsWith('portal_start_quiz')) {started=true;return Response.json('2099-11-15T20:29:00.000Z');}
 if(path.pathname.endsWith('portal_quiz_starts')) return Response.json([]);
 if(path.pathname.endsWith('portal_submissions')) return Response.json([]);
 if(path.pathname.endsWith('portal_submit_quiz')) return Response.json(started ? body.p_score : null);
 if(path.pathname.endsWith('sendMessage')) {messages.push(body);return Response.json({ok:true});}
 throw Error(path.href);
};
assert.equal(endOfQuizDate('2026-11-14'),'2026-11-14T20:30:00.000Z');
assert.equal(endOfQuizDate('2026-02-31'),null);
const listing=await quizAction('quiz:students',{search:'Sample'},teacher);
assert.equal('telegram_id' in listing.students[0],false);
await assert.rejects(quizAction('quiz:students',{},student),{status:422});
const publication=await quizAction('quiz:publish',{id},teacher);
assert.deepEqual(publication.delivery,{sent:1,unlinked:1,failed:0,inactive:0});
assert.match(messages[0].text,/آزمون «آزمون یک»، توسط استاد نام استاد برای شما در سایت تعریف شد\./);
assert.match(messages[0].text,/تعریف شد\.\nمهلت پاسخ‌گویی به آزمون/);
assert.match(messages[0].text,/درس «آمار»/);
assert.match(messages[0].text,/تعداد سؤال‌ها: ۱/);
assert.equal(messages[0].chat_id,'123');
assert.deepEqual(messages[0].reply_markup.inline_keyboard[0][0],
 {text:'ورود به آزمون',url:`https://ieaum.ir/panel/?quiz=${id}#quiz-${id}`});
await quizAction('quiz:publish',{id},teacher);
assert.equal(messages.length,1);
const before=await quizAction('quiz:list',{},student);
assert.equal(before.quizzes[0].content.length,0);
assert.equal('audience' in before.quizzes[0],false);
await assert.rejects(quizAction('quiz:submit',{id,answers:[1]},student),{status:409});
const start=await quizAction('quiz:start',{id},student);
assert.equal('correct' in start.content[0],false);
assert.equal((await quizAction('quiz:submit',{id,answers:[1]},student)).score,1);
await assert.rejects(quizAction('quiz:list',{management:true},teacher),{status:403});
await assert.rejects(quizAction('quiz:list',{management:true},student),{status:403});
assert.equal((await quizAction('quiz:list',{management:true,offset:50},manager)).quizzes.length,1);
assert.equal(quizFilter.get('owner_id'),null);
assert.equal(quizFilter.get('offset'),'50');
await quizAction('quiz:list',{},teacher);
assert.equal(quizFilter.get('owner_id'),'eq.'+id);
const otherTeacher={...teacher,id:manager.id};
await assert.rejects(quizAction('quiz:groups',{},student),{status:403});
assert.deepEqual((await quizAction('quiz:group-save',{name:'گروه آمار',audience:'sample'},teacher)).group,{id:groupId,name:'گروه آمار'});
assert.deepEqual(group.student_ids,[memberId]);
assert.equal((await quizAction('quiz:groups',{},teacher)).groups.length,1);
assert.equal((await quizAction('quiz:groups',{},otherTeacher)).groups.length,0);
await assert.rejects(quizAction('quiz:group-members',{id:groupId},otherTeacher),{status:404});
await assert.rejects(quizAction('quiz:group-save',{id:groupId,name:'تغییر نام',audience:'sample'},otherTeacher),{status:404});
await quizAction('quiz:group-save',{id:groupId,name:'گروه جدید',audience:'unlinked'},teacher);
assert.equal((await quizAction('quiz:group-members',{id:groupId},teacher)).group.students[0].username,'unlinked');
await quizAction('quiz:create',{management:true,title:'نمونهٔ مدیر',courseName:'آمار',audience:'sample',questions:quiz.content},manager);
assert.equal(writeOwner,manager.id);
await quizAction('quiz:close',{management:true,id},manager);
assert.ok(Date.parse(quiz.deadline_at)<=Date.now());
console.log('Quiz delivery links, grading, teacher-private student groups, and owner creation and moderation verified.');
