import assert from 'node:assert/strict';
import { quizAction } from '../server/portal-quizzes.ts';
import { endOfQuizDate } from '../client/utils/quiz-time.ts';
Object.assign(process.env,{SUPABASE_URL:'https://example.test',SUPABASE_SECRET_KEY:'fixture',TELEGRAM_BOT_TOKEN:'fixture',PORTAL_ORIGIN:'https://numeralab.ieaum.ir'});
const id='00000000-0000-4000-8000-000000000001';
const people=[{username:'sample',first_name:'Sample',last_name:'Student',telegram_id:'123'},{username:'unlinked',first_name:'Other',last_name:'Student',telegram_id:null}];
const teacher={id,username:'teacher',role:'teacher',first_name:'نام',last_name:'استاد',active:true,course_name:'آمار'};
const student={...teacher,role:'student',username:'sample'};
const manager={...student,id:'00000000-0000-4000-8000-000000000002',username:'saleh_2007k',telegram_id:'1484056418'};
let writeOwner, quizFilter;
let quiz={id,title:'آزمون یک',audience:['sample','unlinked'],content:[{prompt:'question',options:['1','2','3','4'],correct:1}],published:false,course_name:'آمار',deadline_at:'2099-11-15T20:30:00.000Z',duration_minutes:30};
let messages=[], started=false;
globalThis.fetch=async (url,options)=>{
 const path=new URL(url), body=JSON.parse(options.body??'null');
 if(path.pathname.endsWith('portal_rate_limit')) return Response.json(true);
 if(path.pathname.endsWith('portal_profiles')) {
   assert.equal(path.searchParams.get('role'),'eq.student');
   assert.equal(path.searchParams.get('active'),'eq.true');
   return Response.json(path.searchParams.get('select').includes('telegram_id') ? people : people.map(({telegram_id,...person})=>person));
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
assert.match(messages[0].text,/نام استاد.*آمار/);
assert.match(messages[0].text,/تعداد سؤال‌ها: ۱/);
assert.equal(messages[0].chat_id,'123');
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
await quizAction('quiz:create',{management:true,title:'نمونهٔ مدیر',courseName:'آمار',audience:'sample',questions:quiz.content},manager);
assert.equal(writeOwner,manager.id);
await quizAction('quiz:close',{management:true,id},manager);
assert.ok(Date.parse(quiz.deadline_at)<=Date.now());
console.log('Quiz delivery, grading, teacher scope, and owner-only creation and moderation verified.');
