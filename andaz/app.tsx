import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {andazCategories, andazDigits, andazIntro, andazStartLabel, andazSummary,
  andazTitle, courseRequirements, courses, type Course, type PassedCourses} from '../portal/andaz-courses';
import './style.css';

async function request(action: string, course?: string, credits?: number) {
  const response = await fetch('/api/account', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action,course,credits}),
    cache:'no-store', signal:AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.passed) {
    const error = new Error(result?.error ?? 'ارتباط با انداز برانداز برقرار نشد.');
    throw Object.assign(error,{status:response.status});
  }
  return result.passed as PassedCourses;
}

function Andaz() {
  const [passed,setPassed] = useState<PassedCourses>();
  const [category,setCategory] = useState<typeof andazCategories[number]['id']>('general');
  const [credits65,setCredits65] = useState(1);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [login,setLogin] = useState(false);

  async function update(course?: Course, value?: number) {
    if (busy) return;
    setBusy(true); setError(''); setLogin(false);
    try {
      const next = await request(course ? 'andaz:set' : 'andaz:get',course?.id,value);
      setPassed(next);
      if (next['65']) setCredits65(next['65']);
    } catch (failure) {
      setLogin((failure as {status?: number}).status === 401);
      setError(failure instanceof Error ? failure.message : 'ارتباط برقرار نشد. دوباره تلاش کن.');
    } finally {setBusy(false);}
  }

  return <main className="andaz-main">
    <section className="andaz-panel">
      <h1 className="service-page-title">{andazTitle}</h1>
      {!passed && <>
        <p>{andazIntro}</p>
        <div className="andaz-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={() => void update()}>{busy ? 'در حال دریافت…' : andazStartLabel}</button>
          {login && <a className="button primary" href="/panel/">ورود به حساب IEAUM</a>}
        </div>
      </>}
      {error && <p role="alert" className="andaz-error">{error}</p>}
      {passed && <div className="andaz-summary" role="status" aria-label="پیشرفت تحصیلی">
        {andazSummary(passed).split('\n').map((line,index) => index === 0 ? <strong key={line}>{line}</strong> : <p key={line}>{line}</p>)}
      </div>}
    </section>
    {passed && <section className="andaz-panel" aria-labelledby="andaz-courses-heading">
      <h2 id="andaz-courses-heading">دروس گذرانده‌شده</h2>
      <p>هر درس رو که پاس کردی علامت بزن. تغییرات هم در سایت و هم در ربات دیده می‌شن.</p>
      <label className="andaz-filter">دستهٔ درس‌ها
        <select value={category} onChange={event => setCategory(event.target.value as typeof category)}>
          {andazCategories.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}
        </select>
      </label>
      <ul className="andaz-courses">{courses.filter(course => course.category === category).map(course => {
        const checked = Object.hasOwn(passed,course.id);
        return <li key={course.id}>
          <label className="andaz-course-label"><input type="checkbox" checked={checked} disabled={busy}
            onChange={event => void update(course,event.target.checked ? course.id === '65' ? credits65 : course.credits : 0)} />
            <strong>{course.title}</strong>
            <span>{course.id === '65' && !checked ? '۱ تا ۳' : andazDigits(passed[course.id] ?? course.credits)} واحد</span>
          </label>
          {course.id === '65' && <label className="andaz-edit-credits">تعداد واحد درس بین‌رشته‌ای
            <select value={credits65} disabled={busy} onChange={event => {
              const value = Number(event.target.value);
              if (checked) void update(course,value);
              else setCredits65(value);
            }}>
              {[1,2,3].map(units => <option value={units} key={units}>{andazDigits(units)}</option>)}
            </select>
          </label>}
          <p>{courseRequirements(course,passed)}</p>
        </li>;
      })}</ul>
    </section>}
    <a className="andaz-return" href="/panel/">بازگشت به نمایه</a>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Andaz />);
