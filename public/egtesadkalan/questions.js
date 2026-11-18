function slideNumber(value){
  const digits=String(value??'').trim().replace(/[۰-۹٠-٩]/g,digit=>
    String(digit.charCodeAt(0)-(digit<='٩'?0x660:0x6f0)));
  return /^[0-9]{1,2}$/.test(digits)?Number(digits):NaN;
}
export function checkQuestion(raw){
  const clean=value=>typeof value==='string'?value.trim():'';
  const after=slideNumber(raw?.after);
  const text=clean(raw?.text);
  const options=Array.isArray(raw?.options)?raw.options.map(clean):[];
  const chosen=raw?.correct;
  const issues=[];
  const add=(field,message)=>issues.push({field,message});
  if(!Number.isInteger(after)||after<1||after>14)
    add('after','شمارهٔ اسلاید قبلی را از ۱ تا ۱۴ وارد کن.');
  if(!text||text.length>300) add('text','متن سؤال باید بین ۱ تا ۳۰۰ نویسه باشد.');
  const filled=options.flatMap((value,index)=>value?[{value,index}]:[]);
  if(filled.length<2||options.length>4) add('option0','بین دو تا چهار گزینه وارد کن.');
  const seen=new Set();
  for(const {value,index} of filled){
    if(value.length>140) add('option'+index,'این گزینه بیشتر از ۱۴۰ نویسه است.');
    else if(seen.has(value)) add('option'+index,'این گزینه با یکی از گزینه‌های قبلی یکسان است.');
    seen.add(value);
  }
  const correct=filled.findIndex(({index})=>index===chosen);
  if(correct===-1) add('correct','یکی از گزینه‌های پرشده را به‌عنوان پاسخ درست انتخاب کن.');
  return {issues,question:{after,text,options:filled.map(({value})=>value),correct}};
}
