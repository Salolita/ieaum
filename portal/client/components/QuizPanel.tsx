import { useEffect, useState, type FormEvent } from 'react';
import { portal } from '../utils/portal';
import { formatQuizTime, quizDate } from '../utils/quiz-time';

interface Question { prompt: string; options: string[]; correct: number }
interface Quiz {
  id: string; title: string; content: Question[]; published: boolean; audience?: string[];
  course_name: string | null; deadline_at: string | null; duration_minutes: number | null;
  expiresAt?: string | null; questionCount?: number;
}
interface Result { score: number; submitted_at: string; portal_profiles: { first_name: string; last_name: string } }
interface Student { username: string; first_name: string; last_name: string }
const input = 'w-full rounded-lg border border-slate-300 px-3 py-2';
const button = 'rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-950 disabled:opacity-50';

export function QuizPanel({ role }: { role: 'student' | 'teacher' }) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [results, setResults] = useState<{ id: string; rows: Result[] }>();
  const [count, setCount] = useState(2);
  const [title, setTitle] = useState('');
  const [sample, setSample] = useState<'bisection' | 'matlab' | null>(null);
  const [editing, setEditing] = useState<Quiz | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [view, setView] = useState<'quizzes' | 'students' | 'grades'>('quizzes');
  const [student, setStudent] = useState<Student | null>(null);
  const [audience, setAudience] = useState('');
  const [directory, setDirectory] = useState<Student[]>([]);
  const [moreStudents, setMoreStudents] = useState(false);
  const [directoryLoaded, setDirectoryLoaded] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [directorySearch, setDirectorySearch] = useState('');
  const [defaultCourse, setDefaultCourse] = useState('');
  const [course, setCourse] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState(quizDate);
  const [duration, setDuration] = useState('');
  const [clock, setClock] = useState(Date.now);
  const [clockOffset, setClockOffset] = useState(0);
  const [notice, setNotice] = useState('');
  const [formVersion, setFormVersion] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await portal<{ quizzes: Quiz[]; results: { quiz_id: string; score: number }[]; courseName?: string; serverNow?: number }>({ action: 'quiz:list' });
    setQuizzes(data.quizzes);
    setScores(Object.fromEntries(data.results.map(({ quiz_id, score }) => [quiz_id, score])));
    if (data.courseName !== undefined) setDefaultCourse(data.courseName);
    if (data.serverNow !== undefined) setClockOffset(data.serverNow - Date.now());
  }
  useEffect(() => { load().catch((error: Error) => setError(error.message)); }, []);
  useEffect(() => {
    if (role !== 'student') return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [role]);

  async function loadStudents(offset = 0, search = studentSearch) {
    const data = await portal<{ students: Student[]; more: boolean }>({ action: 'quiz:students', search, offset });
    setDirectory((previous) => offset ? [...previous, ...data.students] : data.students);
    setMoreStudents(data.more);
    setDirectoryLoaded(true);
    setDirectorySearch(search);
  }

  async function perform(action: () => Promise<void>) {
    setError('');
    setNotice('');
    setBusy(true);
    try { await action(); } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const questions = Array.from({ length: count }, (_, index) => ({
      prompt: data.get(`prompt-${index}`),
      options: Array.from({ length: 4 }, (_, option) => data.get(`option-${index}-${option}`)),
      correct: Number(data.get(`correct-${index}`)),
    }));
    void perform(async () => {
      await portal({ action: editing ? 'quiz:update' : 'quiz:create', id: editing?.id, title, questions, audience,
        courseName: course ?? defaultCourse, dueDate, durationMinutes: duration });
      setNotice('پیش‌نویس ذخیره شد. برای نمایش به دانشجویان، دکمهٔ انتشار آزمون را بزنید.');
      setTitle(''); setAudience(''); setSample(null); setEditing(null); setCount(2); setEditorOpen(false); setFormVersion((version) => version + 1);
      setCourse(null); setDueDate(quizDate()); setDuration('');
      await load();
    });
  }

  const examples = [
    { prompt: 'برای x³ − x − 2 = 0، بازهٔ [1, 2] و نقطهٔ میانی 1.5 داده شده است. مقدار تابع در نقطهٔ میانی چند است؟', options: ['−0.125', '0.125', '−2', '4'] },
    { prompt: 'با توجه به f(1.5) = −0.125 و f(2) = 4، بازهٔ بعدی در روش دونیم‌سازی کدام است؟', options: ['[1.5, 2]', '[1, 1.5]', '[1, 2]', '[2, 2.5]'] },
  ];
  const matlabExample = { prompt: 'در روش دونیم‌سازی، کدام دستور MATLAB نقطهٔ میانی بازه را در c قرار می‌دهد؟',
    options: ['c = (a + b) / 2;', 'c = (b - a) / 2;', 'c = a + b / 2;', 'c = a * b / 2;'] };
  const template = editing?.content ?? (sample === 'matlab' ? [matlabExample] : sample === 'bisection' ? examples : []);
  const enrolled = [...new Set(quizzes.flatMap((quiz) => quiz.audience ?? []))].sort();
  const graded = quizzes.filter((quiz) => scores[quiz.id] !== undefined);
  const selected = audience.split(/[\s,،]+/).filter(Boolean);
  const now = clock + clockOffset;
  return <section className="space-y-4" aria-labelledby="quiz-heading">
    <nav aria-label="بخش‌های پنل" className="account-quiz-nav flex flex-wrap gap-2">
      <button type="button" className={button} aria-pressed={view === 'quizzes'} onClick={() => setView('quizzes')}>آزمون‌ها</button>
      {role === 'teacher'
        ? <button type="button" className={button} aria-pressed={view === 'students'} onClick={() => setView('students')}>دانشجویان</button>
        : <button type="button" className={button} aria-pressed={view === 'grades'} onClick={() => setView('grades')}>نمره‌های من</button>}
    </nav>
    <h2 id="quiz-heading" className="account-quiz-heading text-lg font-bold">{view === 'students' ? 'دانشجویان آزمون‌های من' : view === 'grades' ? 'نمره‌های من' : 'آزمون‌ها'}</h2>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-700">{notice}</p>}
    {view === 'students' && role === 'teacher' && <>
      <form className="space-y-2" onSubmit={(event) => {
        event.preventDefault();
        const username = new FormData(event.currentTarget).get('username');
        setStudent(null);
        void perform(async () => setStudent((await portal<{ student: Student }>({ action: 'quiz:student-lookup', username })).student));
      }}>
        <label className="block">نام کاربری دقیق دانشجو<input name="username" required dir="ltr" className={input} maxLength={32} /></label>
        <button className={button} disabled={busy}>یافتن دانشجو</button>
      </form>
      {student && <div className="rounded-lg bg-slate-50 p-3">
        <p>{student.first_name} {student.last_name} · <bdi>{student.username}</bdi></p>
        <button type="button" className={button} onClick={() => {
          setAudience((value) => [...new Set([...value.split(/[\s,،]+/).filter(Boolean), student.username])].join(', '));
          setView('quizzes'); setEditorOpen(true);
        }}>{editing ? 'افزودن به پیش‌نویس در حال ویرایش' : 'افزودن به آزمون جدید'}</button>
      </div>}
      {enrolled.length ? <ul className="space-y-2">{enrolled.map((name) => <li className="rounded-lg bg-slate-50 p-3" key={name}>
        <bdi>{name}</bdi> · {quizzes.filter((quiz) => quiz.audience?.includes(name)).map((quiz) => quiz.title).join('، ')}
      </li>)}</ul> : <p className="text-slate-600">هنوز دانشجویی به آزمون‌های شما اضافه نشده است.</p>}
    </>}
    {view === 'grades' && role === 'student' && (graded.length ? <ul className="space-y-2">{graded.map((quiz) =>
      <li key={quiz.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3">
        <span>{quiz.title}</span><strong>{scores[quiz.id]} از {quiz.questionCount ?? quiz.content.length}</strong>
      </li>)}</ul> : <p className="text-slate-600">هنوز نمره‌ای ثبت نشده است.</p>)}
    {role === 'teacher' && <details hidden={view !== 'quizzes'} open={editorOpen} onToggle={(event) => {
      const open = event.currentTarget.open;
      setEditorOpen(open);
      if (open && !directoryLoaded && !busy) void perform(() => loadStudents());
    }} className="rounded-xl border border-slate-200 p-4">
      <summary className="cursor-pointer font-bold">{editing ? 'ویرایش پیش‌نویس' : 'ساخت آزمون جدید'}</summary>
      <form className="mt-4 space-y-4" onSubmit={create} key={formVersion}>
        <p className="text-sm text-slate-600">اعلان پس از انتشار آزمون برای دانشجویان منتخب ارسال می‌شود.</p>
        {!editing && <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => {
          setCount(2); setTitle('نمونهٔ دونیم‌سازی'); setSample('bisection'); setFormVersion((version) => version + 1);
        }}>بارگذاری نمونهٔ دونیم‌سازی</button>
        <button type="button" className={button + ' ms-2'} onClick={() => {
          setCount(1); setTitle('نمونهٔ MATLAB'); setSample('matlab'); setFormVersion((version) => version + 1);
        }}>بارگذاری نمونهٔ MATLAB</button>
        </div>}
        <label className="block">عنوان<input className={input} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></label>
        <label className="block">نام درس<input className={input} value={course ?? defaultCourse} onChange={(event) => setCourse(event.target.value)} maxLength={120} required /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>مهلت تا پایان روز (میلادی، وقت تهران)<input type="date" className={input} min={quizDate()} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <label>مدت پاسخ‌گویی از شروع (دقیقه، اختیاری)<input type="number" min="1" max="480" className={input} value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="۳۰" /></label>
        </div>
        <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
          <legend>دانشجویان مجاز ({selected.length})</legend>
          <div className="flex flex-wrap gap-2">
            <label className="grow">جست‌وجوی نام یا نام کاربری<input className={input} value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); if (!busy) void perform(() => loadStudents()); }
            }} /></label>
            <button type="button" className={button + ' self-end'} disabled={busy} onClick={() => void perform(() => loadStudents())}>{directoryLoaded ? 'جست‌وجو' : 'نمایش فهرست دانشجویان'}</button>
          </div>
          {selected.length > 0 && <div className="flex flex-wrap gap-2">{selected.map((name) =>
            <button type="button" key={name} className={button} onClick={() => setAudience(selected.filter((item) => item !== name).join(', '))} aria-label={`حذف ${name}`}><bdi>{name}</bdi> ×</button>)}</div>}
          {directoryLoaded && (directory.length ? <div className="max-h-52 space-y-2 overflow-auto">
            {directory.map((person) => <label key={person.username} className="flex items-center gap-2">
              <input type="checkbox" checked={selected.includes(person.username)} disabled={selected.length >= 100 && !selected.includes(person.username)} onChange={(event) =>
                setAudience((event.target.checked ? [...selected, person.username] : selected.filter((name) => name !== person.username)).join(', '))} />
              {person.first_name} {person.last_name} · <bdi>{person.username}</bdi>
            </label>)}
          </div> : <p>دانشجوی فعالی پیدا نشد.</p>)}
          {moreStudents && <button type="button" className={button} disabled={busy} onClick={() => void perform(() => loadStudents(directory.length, directorySearch))}>نمایش موارد بیشتر</button>}
        </fieldset>
        {Array.from({ length: count }, (_, index) => <fieldset className="space-y-2 rounded-lg bg-slate-50 p-3" key={index}>
          <legend>مرحلهٔ {index + 1}</legend>
          <label className="block">متن مرحله<textarea name={`prompt-${index}`} className={input} maxLength={1000} required defaultValue={template[index]?.prompt} /></label>
          <div className="grid gap-2 sm:grid-cols-2">{Array.from({ length: 4 }, (_, option) =>
            <label key={option}>گزینهٔ {option + 1}<input name={`option-${index}-${option}`} className={input} maxLength={200} required defaultValue={template[index]?.options[option]} /></label>)}</div>
          <label className="block">گزینهٔ صحیح<select className={input} name={`correct-${index}`} defaultValue={editing?.content[index]?.correct ?? 0}>{[0, 1, 2, 3].map((option) => <option value={option} key={option}>{option + 1}</option>)}</select></label>
        </fieldset>)}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={count >= 15} onClick={() => setCount(count + 1)}>افزودن مرحله</button>
          <button type="button" className={button} disabled={count <= 1} onClick={() => setCount(count - 1)}>حذف مرحلهٔ آخر</button>
          <button className={button} disabled={busy || !selected.length}>ذخیرهٔ پیش‌نویس</button>
          {editing && <button type="button" className={button} onClick={() => {
            setEditing(null); setTitle(''); setAudience(''); setCount(2); setFormVersion((version) => version + 1);
            setCourse(null); setDueDate(quizDate()); setDuration('');
          }}>انصراف از ویرایش</button>}
        </div>
      </form>
    </details>}
    {view === 'quizzes' && quizzes.length === 0 && <p className="text-slate-600">آزمونی برای نمایش وجود ندارد.</p>}
    {view === 'quizzes' && quizzes.map((quiz) => <article key={quiz.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
      <h3 className="font-bold">{quiz.title}</h3>
      {(quiz.course_name || quiz.deadline_at || quiz.duration_minutes) && <p className="text-sm">
        {[quiz.course_name, quiz.deadline_at && `مهلت تا ${formatQuizTime(new Date(Date.parse(quiz.deadline_at) - 1000).toISOString())} به وقت تهران`,
          quiz.duration_minutes && `${quiz.duration_minutes.toLocaleString('fa-IR')} دقیقه از شروع`].filter(Boolean).join(' · ')}
      </p>}
      {role === 'teacher' ? <>
        <p className="text-sm text-slate-600">{quiz.published ? 'منتشر شده' : 'پیش‌نویس'} · {quiz.audience?.length ?? 0} دانشجوی مجاز</p>
        <div className="flex flex-wrap gap-2">
          {!quiz.published && <>
            <button className={button} disabled={busy} onClick={() => {
              setEditing(quiz); setTitle(quiz.title); setAudience(quiz.audience?.join(', ') ?? ''); setSample(null); setCount(quiz.content.length); setFormVersion((version) => version + 1); setEditorOpen(true);
              setCourse(quiz.course_name); setDueDate(quiz.deadline_at ? quizDate(new Date(Date.parse(quiz.deadline_at) - 1000)) : '');
              setDuration(quiz.duration_minutes?.toString() ?? '');
            }}>ویرایش پیش‌نویس</button>
            <button className={button} disabled={busy || editing?.id === quiz.id} onClick={() => void perform(async () => {
              const { delivery } = await portal<{ delivery?: { sent: number; unlinked: number; failed: number; inactive: number } | null }>({ action: 'quiz:publish', id: quiz.id });
              await load();
              setNotice('آزمون منتشر شد.' + (delivery ? ` تلگرام: ${delivery.sent} ارسال شد، ${delivery.unlinked} حساب بدون اتصال، ${delivery.failed} ارسال ناموفق، ${delivery.inactive} حساب غیرفعال.`
                : delivery === null ? ' وضعیت ارسال اعلان در دسترس نیست.' : ''));
            })}>انتشار آزمون</button>
          </>}
          <button className={button} disabled={busy} onClick={() => void perform(async () => {
            const data = await portal<{ results: Result[] }>({ action: 'quiz:results', id: quiz.id });
            setResults({ id: quiz.id, rows: data.results });
          })}>مشاهدهٔ نتایج</button>
        </div>
        {results?.id === quiz.id && (results.rows.length ? <ul className="space-y-2 text-sm">
          {results.rows.map((row, index) => <li key={index}>{row.portal_profiles.first_name} {row.portal_profiles.last_name} · {row.score} از {quiz.content.length}</li>)}
        </ul> : <p>هنوز پاسخی ثبت نشده است.</p>)}
      </> : scores[quiz.id] !== undefined ? <p>نمرهٔ ثبت‌شده: {scores[quiz.id]} از {quiz.questionCount ?? quiz.content.length}</p>
        : (quiz.deadline_at && Date.parse(quiz.deadline_at) <= now) || (quiz.expiresAt && Date.parse(quiz.expiresAt) <= now)
          ? <p>مهلت پاسخ‌گویی تمام شده است.</p>
        : quiz.duration_minutes && !quiz.expiresAt ? <div className="space-y-2">
          <p>{quiz.questionCount?.toLocaleString('fa-IR')} سؤال. شمارش زمان با زدن دکمه شروع می‌شود.</p>
          <button type="button" className={button} disabled={busy} onClick={() => void perform(async () => {
            const data = await portal<{ expiresAt: string; serverNow: number; content: Question[] }>({ action: 'quiz:start', id: quiz.id });
            setClockOffset(data.serverNow - Date.now());
            setQuizzes((previous) => previous.map((item) => item.id === quiz.id ? { ...item, expiresAt: data.expiresAt, content: data.content } : item));
          })}>شروع آزمون</button>
        </div> :
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void perform(async () => {
            const { score } = await portal<{ score: number }>({ action: 'quiz:submit', id: quiz.id, answers: quiz.content.map((_, index) => Number(data.get(`answer-${index}`))) });
            setScores((previous) => ({ ...previous, [quiz.id]: score }));
          });
        }}>
          {quiz.expiresAt && <p role="timer">زمان باقی‌مانده {Math.ceil(Math.max(0, Date.parse(quiz.expiresAt) - now) / 1000).toLocaleString('fa-IR')} ثانیه</p>}
          {quiz.content.map((question, index) => <fieldset className="rounded-lg bg-slate-50 p-3" key={index}>
            <legend>{index + 1}. {question.prompt}</legend>
            {question.options.map((option, value) => <label className="my-2 flex items-center gap-2" key={value}><input type="radio" name={`answer-${index}`} value={value} required />{option}</label>)}
          </fieldset>)}
          <button className={button} disabled={busy}>ثبت پاسخ</button>
        </form>}
    </article>)}
  </section>;
}
