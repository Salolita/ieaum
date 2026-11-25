import { checkQuestion } from './questions.js';

const $ = selector=>document.querySelector(selector);
const main=$('#main');
const params=new URLSearchParams(location.search);
const isAdmin=params.get('admin')==='1';
const room=params.get('s');
const storageKey=isAdmin?'class-admin':'class-player-'+room;
const fa=n=>Number(n).toLocaleString('fa-IR');
let key=sessionStorage.getItem(storageKey);
let state,signature,imageUrl,pending=false,epoch=0;
function element(tag, text, cls){
  const node=document.createElement(tag);
  if(text!==undefined) node.textContent=text;
  if(cls) node.className=cls;
  return node;
}
function button(text,callback,cls){
  const node=element('button',text,cls);
  node.type='button'; node.onclick=callback;
  return node;
}
function heading(box,text){box.append(element('h1',text));}
function label(box,text,input){
  const field=element('label',text);
  field.append(input); box.append(field);
  return input;
}
function error(text=''){$('#message').textContent=text;}
async function api(path, data){
  const headers=key?{Authorization:'Bearer '+key}:{};
  if(data!==undefined) headers['Content-Type']='application/json';
  const endpoint=new URL('/api/presentation',location.origin);
  const [action,query]=path.split('?');
  endpoint.search=new URLSearchParams(query);
  endpoint.searchParams.set('action',action);
  const response=await fetch(endpoint,{headers,method:data===undefined?'GET':'POST',
    body:data===undefined?undefined:JSON.stringify(data)});
  if(!response.ok){
    const info=await response.json().catch(()=>({}));
    throw Object.assign(new Error(info.error||'ارتباط با جلسه قطع شد.'),{status:response.status});
  }
  return path.startsWith('image?')?response.blob():response.json();
}
function signIn(){
  const box=element('form',undefined,'narrow');
  heading(box,isAdmin?'ورود مدیر':'ورود به ارائه');
  if(!isAdmin&&!room){
    const cover=element('figure',undefined,'cover');
    const image=element('img'); image.src='/presentation/cover.jpg'; image.alt='جلد ارائهٔ دو همسایه، دو مسیر اقتصادی';
    cover.append(image);
    box.append(cover,element('p','لینک ورود به جلسه را از ارائه‌دهنده بگیر.'));
    main.replaceChildren(box); return;
  }
  const input=element('input');
  input.required=true;
  input.type=isAdmin?'password':'text';
  input.maxLength=isAdmin?150:40;
  label(box,isAdmin?'کد مدیر':'نام یا نام مستعار',input);
  const submit=element('button','ورود'); box.append(submit);
  box.onsubmit=async event=>{
    event.preventDefault(); submit.disabled=true;
    pending=true; epoch++;
    try {
      if(isAdmin){
        key=input.value.trim();
        state=await api('state');
      }else{
        const joined=await api('join',{room,name:input.value});
        key=joined.id; state=joined.view;
      }
      sessionStorage.setItem(storageKey,key);
      signature=null;
      error(); render(state);
    }catch(e){key=null; error(e.message==='Failed to fetch'?'ارتباط با جلسه قطع شد.':e.message);}
    finally{pending=false;submit.disabled=false;}
  };
  main.replaceChildren(box);
}
function settings(saved,active){
  const form=element('form',undefined,'narrow');
  form.noValidate=true;
  heading(form,'تنظیم چهار سؤال');
  form.append(element('p','برای هر سؤال، شمارهٔ اسلاید قبلی و دست‌کم دو گزینه را وارد کن. سپس پاسخ درست را انتخاب کن.'));
  const fields=Array.from({length:4},(_,i)=>{
    const q=saved[i];
    const group=element('fieldset');
    group.append(element('legend','سؤال '+fa(i+1)));
    const after=element('input');
    Object.assign(after,{type:'text',inputMode:'numeric',required:true,value:q?.after??''});
    label(group,'بعد از اسلاید شماره (۱ تا ۱۴)',after);
    const text=element('textarea');
    Object.assign(text,{maxLength:300,rows:2,required:true,value:q?.text??''});
    label(group,'متن سؤال',text);
    const grid=element('div',undefined,'grid');
    group.append(grid);
    const options=Array.from({length:4},(_,j)=>{
      const field=element('input');
      Object.assign(field,{maxLength:140,required:j<2,value:q?.options[j]??''});
      return label(grid,'گزینهٔ '+fa(j+1),field);
    });
    const correct=element('select');
    const placeholder=element('option','انتخاب کن');placeholder.value='';correct.append(placeholder);correct.required=true;
    options.forEach((input,j)=>{
      const o=element('option');o.value=j;correct.append(o);
      const update=()=>{
        const value=input.value.trim();
        o.textContent='گزینهٔ '+fa(j+1)+(value?' — '+value:'');
        o.disabled=!value;
        if(!value&&correct.value===o.value) correct.value='';
      };
      update();input.addEventListener('input',update);
    });
    correct.value=q?.correct??'';
    label(group,'پاسخ درست',correct);
    form.append(group);
    const controls={after,text,correct};
    options.forEach((input,j)=>{controls['option'+j]=input;});
    for(const [field,input] of Object.entries(controls)){
      const hint=element('small',undefined,'field-error');
      hint.id='q'+i+'-'+field+'-error';
      input.parentNode.append(hint);
      input.setAttribute('aria-describedby',hint.id);
      input.addEventListener('input',()=>{
        input.removeAttribute('aria-invalid');
        hint.textContent='';
      });
    }
    return {after,text,options,correct,controls};
  });
  if(active) form.append(element('p','تغییر سؤال‌هایی که هنوز نمایش داده نشده‌اند در همین جلسه اعمال می‌شود. تغییر سؤال‌های نمایش‌داده‌شده برای جلسهٔ بعد ذخیره می‌شود.'));
  const submit=element('button','ذخیرهٔ سؤال‌ها'); form.append(submit);
  if(active) form.append(button('بازگشت به ارائه',()=>{signature=null;render(state);},'secondary'));
  else {
    const launch=button('ساخت جلسه و لینک ورود',()=>perform('setup',{},launch),'secondary');
    launch.disabled=saved.length!==4;
    form.append(launch);
  }
  form.onsubmit=event=>{
    event.preventDefault();
    error();
    let firstInvalid;
    const questions=fields.map((q,index)=>{
      const raw={after:q.after.value,text:q.text.value,
        options:q.options.map(x=>x.value),correct:q.correct.value===''?null:Number(q.correct.value)};
      for(const [field,input] of Object.entries(q.controls)){
        input.removeAttribute('aria-invalid');
        form.querySelector('#q'+index+'-'+field+'-error').textContent='';
      }
      for(const {field,message} of checkQuestion(raw).issues){
        const input=q.controls[field];
        input.setAttribute('aria-invalid','true');
        form.querySelector('#q'+index+'-'+field+'-error').textContent=message;
        firstInvalid??=input;
      }
      return raw;
    });
    if(firstInvalid){firstInvalid.focus();return;}
    perform('questions',{questions,room:state.room},submit);
  };
  main.replaceChildren(form);
}
async function perform(path,data,control){
  if(pending) return;
  pending=true; epoch++;
  if(control) control.disabled=true;
  try{
    error();
    const result=await api(path,data);
    signature=null;
    render(result);
    if(path==='questions') error('سؤال‌ها ذخیره شدند.');
  }
  catch(e){error(e.message);}
  finally{pending=false;if(control&&control.isConnected)control.disabled=false;}
}
function adminBar(box,s){
  const bar=element('div',undefined,'bar');
  const link=document.createElement('input');link.className='share';link.dir='ltr';link.readOnly=true;
  link.setAttribute('aria-label','لینک ورود کلاس');
  link.value=location.origin+'/presentation.html?s='+encodeURIComponent(s.room);
  const share=button('کپی لینک ورود',async ()=>{
    try{await navigator.clipboard.writeText(link.value);error('لینک ورود کپی شد.');}
    catch{link.focus();link.select();error('لینک انتخاب شد. آن را کپی کن.');}
  });
  bar.append(share,link);
  const counts=element('p');counts.id='counts';bar.append(counts);
  box.append(bar);
  const controls=element('div',undefined,'bar');
  const move=delta=>({delta,position:s.position,room:s.room});
  const previous=button('قبلی',()=>perform('move',move(-1),previous),'secondary');
  previous.disabled=s.position<0;
  const next=button(s.position<0?'نمایش اسلاید اول':'بعدی',()=>perform('move',move(1),next));
  next.disabled=s.step.type==='ranking';
  const close=button('پایان جلسه',()=>{
    if(confirm('با پایان جلسه، لینک فعلی بسته و پاسخ‌ها پاک می‌شوند. ادامه می‌دهی؟'))
      perform('close',{room:s.room},close);
  },'secondary');
  const edit=button('ویرایش سؤال‌ها',()=>settings(s.savedQuestions,true),'secondary');
  controls.append(previous,next,edit,close); box.append(controls);
}
function render(s){
  state=s;
  const current=JSON.stringify([s.room,s.step,s.answer,s.ranking]);
  const status=$('#header-status');
  status.textContent=s.step.type==='slide'?'اسلاید '+fa(s.step.number)+' از ۱۵':'';
  if(current!==signature){
    signature=current;
    if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl=null;}
    if(isAdmin&&!s.room){settings(s.savedQuestions,false);return;}
    const box=element('section');
    if(isAdmin) adminBar(box,s);
    switch(s.step.type){
      case 'waiting':
        heading(box,isAdmin?'جلسه آماده است':'منتظر شروع ارائه');
        box.append(element('p',isAdmin?'لینک ورود را برای کلاس بفرست.':'با شروع ارائه، اسلاید اول اینجا نمایش داده می‌شود.'));
        break;
      case 'slide': {
        const fig=element('figure');
        const img=element('img');img.alt='اسلاید '+fa(s.step.number);
        fig.append(img);box.append(fig);
        api('image?n='+s.step.number).then(blob=>{
          if(!img.isConnected)return;
          imageUrl=URL.createObjectURL(blob);img.src=imageUrl;
        }).catch(()=>{if(img.isConnected){signature=null; error('اسلاید در حال دریافت است…');}});
        break;
      }
      case 'question': {
        const quiz=element('div',undefined,'narrow');
        heading(quiz,s.question.text);
        const list=element('div',undefined,'options');
        s.question.options.forEach((option,i)=>{
          const choice=button(option,()=>perform('answer',{index:s.step.index,choice:i},choice),s.answer===i?'selected':'');
          choice.disabled=isAdmin||s.answer!==undefined;
          list.append(choice);
        });
        quiz.append(list);
        if(s.answer!==undefined) quiz.append(element('p','پاسخت ثبت شد. منتظر ادامهٔ ارائه باش.','hint'));
        box.append(quiz);break;
      }
      case 'ranking': {
        const board=element('div',undefined,'narrow');
        heading(board,'رتبه‌بندی نهایی');
        board.append(element('p','هر پاسخ درست یک امتیاز دارد. امتیازهای برابر رتبهٔ مشترک دارند.','hint'));
        if(s.ranking.length){
          const table=element('table');const head=table.createTHead().insertRow();
          for(const title of ['رتبه','نام','امتیاز از ۴']){const th=element('th',title);th.scope='col';head.append(th);}
          const body=table.createTBody();
          for(const player of s.ranking){
            const row=body.insertRow();
            for(const value of [fa(player.rank),player.name,fa(player.score)])row.insertCell().textContent=value;
          }
          board.append(table);
        }else board.append(element('p','شرکت‌کننده‌ای ثبت نشده است.'));
        box.append(board);break;
      }
    }
    main.replaceChildren(box);
  }
  const counts=$('#counts');
  if(counts) counts.textContent=fa(s.participants)+' نفر در جلسه'+
    (s.answered===null?'':' · '+fa(s.answered)+' پاسخ ثبت شده');
}
async function poll(){
  if(key&&!pending){
    const start=epoch;
    try{
      const result=await api('state');
      if(start===epoch&&!pending){render(result);if($('#message').textContent==='ارتباط با جلسه قطع شد.')error();}
    }catch(e){
      if(start===epoch&&e.status===401){key=null;sessionStorage.removeItem(storageKey);signIn();error(e.message);}
      else if(start===epoch)error('ارتباط با جلسه قطع شد.');
    }
  }
  setTimeout(poll,1100);
}
signIn();
poll();
