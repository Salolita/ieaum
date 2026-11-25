import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { checkQuestion } from './questions.js';
import { digest, equalSecret, limit, query, readBody, write } from '../portal/dist/server/portal-store.js';

const blank = () => ({room:null,questions:[],position:-1,players:{}});
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail = (status,message) => { throw {status,message}; };
const token = () => crypto.randomUUID();
const bearer = request => request.headers.get('Authorization')?.replace(/^Bearer /,'');
const safeToken = (a,b) => {
  if (typeof a!=='string'||typeof b!=='string'||!a||a.length!==b.length) return false;
  let diff=0;
  for(let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
};
function sequence(questions){
  const steps=[];
  for(let n=1;n<=15;n++){
    steps.push({type:'slide',number:n});
    questions.forEach((q,index)=>{if(q.after===n) steps.push({type:'question',index});});
  }
  return [...steps,{type:'ranking'}];
}
function furthestPosition(state,steps){
  const furthestSlide=steps.findIndex(step=>step.type==='slide'&&step.number===state.furthestSlide);
  return Math.max(state.position,state.furthestPosition??-1,furthestSlide);
}
function playerPosition(state,steps,player){
  const reached=furthestPosition(state,steps);
  // A participant may owe a question even after the presenter advances or goes back.
  for(let position=player.firstPosition??0;position<=reached;position++){
    const step=steps[position];
    if(step.type==='question'&&player.answers[step.index]===undefined) return position;
  }
  return state.position;
}
function ranking(state){
  const rows=Object.values(state.players).map(p=>({name:p.name,score:state.questions.reduce(
    (n,q,i)=>n+Number(p.answers[i]===q.correct),0)})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'fa'));
  let rank=0;
  return rows.map((p,i)=>{
    if(!i || p.score!==rows[i-1].score) rank=i+1;
    return {...p,rank};
  });
}
function view(state,admin,player){
  const steps=sequence(state.questions);
  const position=player?playerPosition(state,steps,player):state.position;
  const step=steps[position]??{type:'waiting'};
  const result={step,position,total:steps.length};
  if(step.type==='question'){
    const {text,options}=state.questions[step.index];
    result.question={text,options};
    result.answer=player?.answers[step.index];
  }
  if(step.type==='ranking') result.ranking=ranking(state);
  if(admin) Object.assign(result,{room:state.room,savedQuestions:state.savedQuestions??state.questions,participants:Object.keys(state.players).length,
    answered:step.type==='question'?Object.values(state.players).filter(p=>p.answers[step.index]!==undefined).length:null});
  return result;
}
function validateQuestions(input){
  if(!Array.isArray(input)||input.length!==4) fail(400,'دقیقاً چهار سؤال لازم است.');
  return input.map((raw,index)=>{
    const {issues,question}=checkQuestion(raw);
    if(issues.length)
      fail(400,'سؤال '+(index+1).toLocaleString('fa-IR')+' — '+issues[0].message);
    return question;
  });
}
async function read(){
  const [row]=await query('live_presentation',{id:'eq.1',select:'revision,body,admin_digest'});
  if(!row) fail(503,'پایگاه جلسه آماده نیست.');
  return row;
}
async function change(update){
  for(let i=0;i<15;i++){
    const row=await read();
    const {state,result}=update(row.body);
    const saved=await write('live_presentation','PATCH',{body:state,revision:row.revision+1},{
      id:'eq.1',revision:`eq.${row.revision}`,select:'revision',
    });
    if(saved.length===1) return json(result);
  }
  fail(409,'درخواست‌ها هم‌زمان رسیدند. دوباره تلاش کن.');
}
function editQuestions(state,questions){
  const savedQuestions=questions;
  if(!state.room) return {...state,questions,savedQuestions};
  const steps=sequence(state.questions);
  const latestSlide=Math.max(state.furthestSlide??0,...steps.slice(0,state.position+1).map(step=>step.number??0));
  const questionsForRoom=state.questions.map((current,index)=>
    current.after>latestSlide&&questions[index].after>latestSlide?questions[index]:current);
  return {...state,questions:questionsForRoom,savedQuestions};
}
function requirePlayer(state,key){
  const player=state.room&&Object.hasOwn(state.players,key)?state.players[key]:null;
  if(!player) fail(401,'دوباره از لینک جلسه وارد شو.');
  return player;
}
export default {
  async fetch(request){
    try {
      const url=new URL(request.url);
      const action=url.searchParams.get('action');
      const key=bearer(request);
      const row=await read();
      const admin=Boolean(key && key.length<=150 && equalSecret(digest(key),row.admin_digest));
      if(request.method==='GET'){
        const state=row.body;
        const player=admin?null:requirePlayer(state,key);
        if(action==='state') return json(view(state,admin,player));
        if(action==='image'){
          const steps=sequence(state.questions);
          const position=player?playerPosition(state,steps,player):state.position;
          const step=steps[position];
          if(step?.type!=='slide'||String(step.number)!==url.searchParams.get('n'))
            fail(404,'این اسلاید در حال نمایش نیست.');
          const slide=await readFile(resolve(process.cwd(),'node_modules/@ieaum/platform/legacy-presentation/slides',String(step.number).padStart(2,'0')+'.jpg'));
          return new Response(new Uint8Array(slide),
            {headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store'}});
        }
      }
      if(request.method!=='POST') return json({},404);
      const data=await readBody(request,18000);
      if(action==='join'){
        const ip=request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()||'unknown';
        await limit(`presentation:join:${ip}`,200);
        return await change(state=>{
          if(!state.room||!safeToken(data?.room,state.room)) fail(404,'لینک این جلسه معتبر نیست.');
          if(sequence(state.questions)[state.position]?.type==='ranking') fail(409,'جلسه به رتبه‌بندی رسیده است.');
          const name=typeof data.name==='string'?data.name.trim():'';
          if(!name||name.length>40) fail(400,'نامت را تا ۴۰ نویسه وارد کن.');
          if(Object.keys(state.players).length>=150) fail(409,'ظرفیت جلسه تکمیل است.');
          const id=token();
          state.players[id]={name,answers:{},firstPosition:Math.max(0,state.position)};
          return {state,result:{id,view:view(state,false,state.players[id])}};
        });
      }
      if(action==='answer'){
        return await change(state=>{
          const player=requirePlayer(state,key);
          const steps=sequence(state.questions);
          const step=steps[playerPosition(state,steps,player)];
          if(Number.isInteger(data?.index)&&player.answers[data.index]!==undefined)
            return {state,result:view(state,false,player)};
          if(step?.type!=='question'||data?.index!==step.index) fail(409,'این سؤال در حال نمایش نیست.');
          if(!Number.isInteger(data.choice)||data.choice<0||data.choice>=state.questions[step.index].options.length)
            fail(400,'گزینه معتبر نیست.');
          if(player.answers[step.index]===undefined) player.answers[step.index]=data.choice;
          return {state,result:view(state,false,player)};
        });
      }
      if(!admin) fail(401,'کد مدیر معتبر نیست.');
      if(action==='questions'){
        const questions=validateQuestions(data.questions);
        return await change(state=>{
          if((data.room??null)!==state.room) fail(409,'جلسه عوض شده. صفحه را تازه کن.');
          const next=editQuestions(state,questions);
          return {state:next,result:view(next,true)};
        });
      }
      if(action==='setup'){
        return await change(state=>{
          if(state.room) fail(409,'ابتدا جلسهٔ فعلی را ببند.');
          const questions=validateQuestions(state.savedQuestions??state.questions);
          state={...blank(),room:token(),questions,savedQuestions:questions};
          return {state,result:view(state,true)};
        });
      }
      if(action==='move'){
        return await change(state=>{
          if(!state.room||data.room!==state.room||data.position!==state.position||![-1,1].includes(data.delta))
            fail(409,'وضعیت جلسه عوض شده. صفحه را بررسی کن.');
          const steps=sequence(state.questions);
          const reached=furthestPosition(state,steps);
          state.position=Math.max(-1,Math.min(steps.length-1,state.position+data.delta));
          state.furthestPosition=Math.max(reached,state.position);
          const step=steps[state.position];
          if(step?.type==='slide') state.furthestSlide=Math.max(state.furthestSlide??0,step.number);
          return {state,result:view(state,true)};
        });
      }
      if(action==='close'){
        return await change(state=>{
          if(!state.room||data.room!==state.room) fail(409,'جلسه عوض شده.');
          const next={...blank(),questions:state.savedQuestions??state.questions};
          return {state:next,result:view(next,true)};
        });
      }
      return json({},404);
    } catch(error){
      if(!error.status) console.error(error);
      return json({error:error.status?error.message:'ارتباط با سرویس برقرار نشد.'},error.status??500);
    }
  }
};
