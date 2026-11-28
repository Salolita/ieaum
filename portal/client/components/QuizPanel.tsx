import { useEffect, useRef, useState, type FormEvent } from 'react';
import { portal as accountRequest } from '../utils/portal';
import { onPageHidden } from '../utils/page-presence';
import { formatQuizTime, quizDate } from '../utils/quiz-time';
import {QuizStudentPicker, quizButton as button, quizInput as input, studentNames, type QuizStudent as Student} from './QuizStudentPicker';

interface Question { prompt: string; options: string[]; correct: number }
interface Quiz {
  id: string; title: string; content: Question[]; published: boolean; audience?: string[];
  course_name: string | null; deadline_at: string | null; duration_minutes: number | null;
  expiresAt?: string | null; questionCount?: number;
}
interface Result { score: number; submitted_at: string; portal_profiles: { first_name: string; last_name: string } }
type Group = {id: string; name: string};
type GroupDraft = {id?: string; name: string; names: string[]};

export function QuizPanel({ role, management = false }: { role: 'student' | 'teacher'; management?: boolean }) {
  const portal = <T,>(data: Record<string, unknown>) => accountRequest<T>(management ? { ...data, management: true } : data);
  const selectedQuiz = useRef<string | undefined>(undefined);
  const linkedQuiz = role === 'student' ? new URLSearchParams(location.search).get('quiz') : null;
  const focusedLink = useRef(false);
  const lastReport = useRef({ id: '', time: 0 });
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [results, setResults] = useState<{ id: string; rows: Result[] }>();
  const [count, setCount] = useState(2);
  const [title, setTitle] = useState('');
  const [sample, setSample] = useState<'bisection' | 'matlab' | null>(null);
  const [editing, setEditing] = useState<Quiz | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [view, setView] = useState<'quizzes' | 'students' | 'grades' | 'groups'>('quizzes');
  const [student, setStudent] = useState<Student | null>(null);
  const [audience, setAudience] = useState('');
  const [groups, setGroups] = useState<Group[]>();
  const [groupToApply, setGroupToApply] = useState('');
  const [groupDraft, setGroupDraft] = useState<GroupDraft>();
  const [groupError, setGroupError] = useState('');
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

  const [quizOffset, setQuizOffset] = useState(0);
  const [moreQuizzes, setMoreQuizzes] = useState(false);

  async function load(offset = quizOffset): Promise<void> {
    const data = await portal<{ quizzes: Quiz[]; results: { quiz_id: string; score: number }[]; courseName?: string; serverNow?: number; more?: boolean }>(
      { action: 'quiz:list', ...(management ? { offset } : {}), ...(linkedQuiz ? {quiz:linkedQuiz} : {}) });
    if (management && offset && !data.quizzes.length) return load(Math.max(0, offset - 50));
    setQuizOffset(offset);
    setMoreQuizzes(Boolean(data.more));
    setQuizzes(data.quizzes);
    setScores(Object.fromEntries(data.results.map(({ quiz_id, score }) => [quiz_id, score])));
    if (data.courseName !== undefined) setDefaultCourse(data.courseName);
    if (data.serverNow !== undefined) setClockOffset(data.serverNow - Date.now());
  }
  useEffect(() => { load().catch((error: Error) => setError(error.message)); }, []);
  useEffect(() => {
    if (focusedLink.current || !linkedQuiz || !quizzes.some(quiz => quiz.id === linkedQuiz)) return;
    const card = document.getElementById('quiz-' + linkedQuiz);
    if (card) {
      focusedLink.current = true;
      card.focus({preventScroll:true});
      card.scrollIntoView({block:'start'});
    }
  }, [linkedQuiz, quizzes]);
  useEffect(() => {
    if (role === 'teacher' && (view === 'groups' || editorOpen) && !groups) void loadGroups();
  }, [role, view, editorOpen]);
  useEffect(() => {
    if (role !== 'student') return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [role]);

  useEffect(() => {
    if (role !== 'student' || view !== 'quizzes') return;
    return onPageHidden(() => {
      const now = Date.now() + clockOffset;
      const ongoing = quizzes.filter((quiz) => quiz.published && scores[quiz.id] === undefined
        && (!quiz.deadline_at || Date.parse(quiz.deadline_at) > now)
        && (!quiz.duration_minutes || Boolean(quiz.expiresAt && Date.parse(quiz.expiresAt) > now)));
      const target = ongoing.find(({ id }) => id === selectedQuiz.current) ??
        (ongoing.length === 1 ? ongoing[0] : undefined);
      if (!target || (lastReport.current.id === target.id && Date.now() - lastReport.current.time < 30_000)) return;
      lastReport.current = { id: target.id, time: Date.now() };
      const url = location.pathname.startsWith('/panel/') ? '/api/account' : '/api/portal';
      void fetch(url, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'quiz:departure', id: target.id }),
      }).catch(() => {});
    });
  }, [quizzes, role, view, scores, clockOffset]);

  async function loadGroups() {
    setGroupError('');
    try { setGroups((await portal<{groups: Group[]}>({action:'quiz:groups'})).groups); }
    catch (failure) { setGroupError((failure as Error).message); }
  }

  async function groupMembers(id: string) {
    const {group} = await portal<{group: Group & { students: Student[] }}>({action:'quiz:group-members',id});
    return {id:group.id, name:group.name, names:group.students.map(person => person.username)};
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
      await load(editing ? quizOffset : 0);
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
  const selected = studentNames(audience);
  const now = clock + clockOffset;
  return <section className="space-y-4" aria-labelledby="quiz-heading">
    <nav aria-label="بخش‌های پنل" className="account-quiz-nav flex flex-wrap gap-2">
      <button type="button" className={button} aria-pressed={view === 'quizzes'} onClick={() => setView('quizzes')}>آزمون‌ها</button>
      {role === 'teacher'
        ? <>
          <button type="button" className={button} aria-pressed={view === 'students'} onClick={() => setView('students')}>دانشجویان</button>
          <button type="button" className={button} aria-pressed={view === 'groups'} onClick={() => setView('groups')}>گروه‌های دانشجویی</button>
        </>
        : <button type="button" className={button} aria-pressed={view === 'grades'} onClick={() => setView('grades')}>نمره‌های من</button>}
    </nav>
    <h2 id="quiz-heading" className="account-quiz-heading text-lg font-bold">{view === 'groups' ? 'گروه‌های دانشجویی' : view === 'students' ? 'دانشجویان آزمون‌های من' : view === 'grades' ? 'نمره‌های من' : 'آزمون‌ها'}</h2>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-700">{notice}</p>}
    {view === 'groups' && role === 'teacher' && <div className="quiz-form">
      {groupError ? <div className="flex flex-wrap gap-3 items-center">
        <p role="alert">{groupError}</p><button type="button" className={button} onClick={() => void loadGroups()}>تلاش دوباره</button>
      </div> : <>
        <div><button type="button" className={button} onClick={() => setGroupDraft({name:'',names:[]})}>ساخت گروه</button></div>
        {groups?.length ? <ul className="quiz-form">{groups.map(group => <li key={group.id} className="quiz-group rounded-lg border border-slate-200 p-3">
          <strong>{group.name}</strong>
          <button type="button" className={button} disabled={busy} onClick={() => void perform(async () => {
            setGroupDraft(await groupMembers(group.id));
          })}>ویرایش گروه</button>
        </li>)}</ul> : <p>{groups ? 'هنوز گروهی ایجاد نشده است.' : 'در حال دریافت گروه‌ها…'}</p>}
      </>}
      {groupDraft && <form className="quiz-form rounded-xl border border-slate-200 p-4" onSubmit={event => {
        event.preventDefault();
        void perform(async () => {
          await portal({action:'quiz:group-save',id:groupDraft.id,name:groupDraft.name,audience:groupDraft.names.join(', ')});
          setGroupDraft(undefined);
          await loadGroups();
          setNotice('گروه دانشجویی ذخیره شد.');
        });
      }}>
        <label className="quiz-field">نام گروه<input className={input} required maxLength={80} value={groupDraft.name}
          onChange={event => setGroupDraft({...groupDraft,name:event.target.value})}/></label>
        <QuizStudentPicker selected={groupDraft.names} onChange={names => setGroupDraft({...groupDraft,names})} management={management}/>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy || !groupDraft.names.length}>ذخیرهٔ گروه</button>
          <button className={button} type="button" onClick={() => setGroupDraft(undefined)}>انصراف</button>
        </div>
      </form>}
    </div>}
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
    {role === 'teacher' && <details hidden={view !== 'quizzes'} open={editorOpen} onToggle={event => setEditorOpen(event.currentTarget.open)}
      className="rounded-xl border border-slate-200 p-4">
      <summary className="cursor-pointer font-bold">{editing ? 'ویرایش پیش‌نویس' : 'ساخت آزمون جدید'}</summary>
      <form className="mt-4 quiz-form" onSubmit={create} key={formVersion}>
        <p className="text-sm text-slate-600">اعلان پس از انتشار آزمون برای دانشجویان منتخب ارسال می‌شود.</p>
        {!editing && <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => {
          setCount(2); setTitle('نمونهٔ دونیم‌سازی'); setSample('bisection'); setFormVersion((version) => version + 1);
        }}>بارگذاری نمونهٔ دونیم‌سازی</button>
        <button type="button" className={button} onClick={() => {
          setCount(1); setTitle('نمونهٔ MATLAB'); setSample('matlab'); setFormVersion((version) => version + 1);
        }}>بارگذاری نمونهٔ MATLAB</button>
        </div>}
        <label className="quiz-field">عنوان<input className={input} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></label>
        <label className="quiz-field">نام درس<input className={input} value={course ?? defaultCourse} onChange={(event) => setCourse(event.target.value)} maxLength={120} required /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="quiz-field">مهلت تا پایان روز (میلادی، وقت تهران)<input type="date" className={input} min={quizDate()} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <label className="quiz-field">مدت پاسخ‌گویی از شروع (دقیقه، اختیاری)<input type="number" min="1" max="480" className={input} value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="۳۰" /></label>
        </div>
        {!!groups?.length && <div className="quiz-picker-search">
          <label className="quiz-field">گروه‌های ذخیره‌شده<select className={input} value={groupToApply} onChange={event => setGroupToApply(event.target.value)}>
            <option value="">انتخاب گروه</option>
            {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select></label>
          <button type="button" className={button} disabled={busy || !groupToApply} onClick={() => void perform(async () => {
            const group = await groupMembers(groupToApply);
            if (!group.names.length) throw new Error('این گروه دانشجوی فعال ندارد.');
            const merged = [...new Set([...selected,...group.names])];
            if (merged.length > 100) throw new Error('حداکثر ۱۰۰ دانشجو می‌توانند در آزمون شرکت کنند.');
            setAudience(merged.join(', '));
          })}>افزودن اعضای گروه</button>
        </div>}
        {editorOpen && <QuizStudentPicker selected={selected} onChange={names => setAudience(names.join(', '))} management={management}/>}
        {Array.from({ length: count }, (_, index) => <fieldset className="space-y-2 rounded-lg bg-slate-50 p-3" key={index}>
          <legend>مرحلهٔ {index + 1}</legend>
          <label className="quiz-field">متن مرحله<textarea name={`prompt-${index}`} className={input} maxLength={1000} required defaultValue={template[index]?.prompt} /></label>
          <div className="grid gap-2 sm:grid-cols-2">{Array.from({ length: 4 }, (_, option) =>
            <label className="quiz-field" key={option}>گزینهٔ {option + 1}<input name={`option-${index}-${option}`} className={input} maxLength={200} required defaultValue={template[index]?.options[option]} /></label>)}</div>
          <label className="quiz-field">گزینهٔ صحیح<select className={input} name={`correct-${index}`} defaultValue={editing?.content[index]?.correct ?? 0}>{[0, 1, 2, 3].map((option) => <option value={option} key={option}>{option + 1}</option>)}</select></label>
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
    {view === 'quizzes' && quizzes.map((quiz) => <article key={quiz.id} id={'quiz-' + quiz.id} tabIndex={linkedQuiz === quiz.id ? -1 : undefined}
      className="quiz-card space-y-3 rounded-xl border border-slate-200 p-4">
      <h3 className="font-bold">{quiz.title}</h3>
      {(quiz.course_name || quiz.deadline_at || quiz.duration_minutes) && <p className="text-sm">
        {[quiz.course_name, quiz.deadline_at && `مهلت تا ${formatQuizTime(new Date(Date.parse(quiz.deadline_at) - 1000).toISOString())} به وقت تهران`,
          quiz.duration_minutes && `${quiz.duration_minutes.toLocaleString('fa-IR')} دقیقه از شروع`].filter(Boolean).join(' · ')}
      </p>}
      {role === 'teacher' ? <>
        <p className="text-sm text-slate-600">{quiz.published ? quiz.deadline_at && Date.parse(quiz.deadline_at) <= Date.now() ? 'پایان‌یافته' : 'منتشر شده' : 'پیش‌نویس'} · {quiz.audience?.length ?? 0} دانشجوی مجاز</p>
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
            {management && <button className={button} disabled={busy} onClick={() => {
              if (!window.confirm('این پیش‌نویس حذف شود؟')) return;
              void perform(async () => {
                await portal({ action: 'quiz:delete-draft', id: quiz.id });
                if (editing?.id === quiz.id) { setEditing(null); setEditorOpen(false); }
                await load();
                setNotice('پیش‌نویس حذف شد.');
              });
            }}>حذف پیش‌نویس</button>}
          </>}
          {management && quiz.published && (!quiz.deadline_at || Date.parse(quiz.deadline_at) > Date.now()) &&
            <button className={button} disabled={busy} onClick={() => {
              if (!window.confirm('پاسخ‌گویی به این آزمون پایان یابد؟')) return;
              void perform(async () => {
                await portal({ action: 'quiz:close', id: quiz.id });
                await load();
                setNotice('پاسخ‌گویی به آزمون بسته شد.');
              });
            }}>پایان پاسخ‌گویی</button>}
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
            selectedQuiz.current = quiz.id;
            setClockOffset(data.serverNow - Date.now());
            setQuizzes((previous) => previous.map((item) => item.id === quiz.id ? { ...item, expiresAt: data.expiresAt, content: data.content } : item));
          })}>شروع آزمون</button>
        </div> :
        <form className="space-y-3" onFocus={() => { selectedQuiz.current = quiz.id; }} onSubmit={(event) => {
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
    {management && view === 'quizzes' && (moreQuizzes || quizOffset > 0) && <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={busy || !quizOffset} onClick={() => void perform(() => load(quizOffset - 50))}>صفحهٔ قبل</button>
      <button type="button" className={button} disabled={busy || !moreQuizzes} onClick={() => void perform(() => load(quizOffset + 50))}>صفحهٔ بعد</button>
    </div>}
  </section>;
}
