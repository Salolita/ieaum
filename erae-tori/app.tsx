import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { prepareCover, prepareSlides } from './documents';
import { readQuestions, type Question, type Step } from '../portal/client/utils/erae-model';
import './presentation.css';
import './style.css';

const params = new URLSearchParams(location.search);
const ownerId = params.get('admin');
const joinCode = params.get('s');
const fa = new Intl.NumberFormat('fa-IR');
type RoomInfo = { title: string; caption: string; pageCount: number };
type RoomView = RoomInfo & { step: Step; question?: Omit<Question, 'after' | 'correct'>; answer?: number;
  questionCount?: number; ranking?: { name: string; score: number; rank: number }[];
  position?: number; total?: number; participants?: number; answered?: number | null; joinCode?: string; published?: boolean;
  questions?: Question[]; lastShownPage?: number };
type OwnedRoom = { id: string; title: string; published: boolean };
type Access = { id?: string; s?: string; key?: string };

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function endpoint(action: string, { id, s }: Access, page?: number) {
  const url = new URL('/erae-tori/api', location.origin);
  url.searchParams.set('action', action);
  if (id) url.searchParams.set('id', id);
  if (s) url.searchParams.set('s', s);
  if (page !== undefined) url.searchParams.set('page', String(page));
  return url;
}

async function api<T>(action: string, access: Access = {}, body?: object | Blob, page?: number, signal?: AbortSignal): Promise<T> {
  const headers = new Headers();
  if (access.key) headers.set('Authorization', `Bearer ${access.key}`);
  if (body) headers.set('Content-Type', body instanceof Blob ? body.type : 'application/json');
  const response = await fetch(endpoint(action, access, page), { method: body ? 'POST' : 'GET', headers, signal,
    body: body instanceof Blob ? body : body ? JSON.stringify(body) : undefined });
  if (response.ok && action === 'image') return await response.blob() as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.error || 'ارتباط با ارائه‌طوری برقرار نشد.');
  return data as T;
}

const message = (error: unknown) => error instanceof Error ? error.message : 'عملیات انجام نشد. دوباره تلاش کنید.';
const roomKey = (id: string) => `erae-admin-${id}`;
const viewerKey = (code: string) => `erae-viewer-${code}`;
const ownerUrl = (id: string) => `${location.origin}/erae-tori/?admin=${encodeURIComponent(id)}`;
const viewerUrl = (code: string) => `${location.origin}/erae-tori/?s=${encodeURIComponent(code)}`;
const fragment = new URLSearchParams(location.hash.slice(1));
const handoffTicket = fragment.get('ticket');
const previousAccess = fragment.get('access');
const keyPattern = /^[\w-]{32}$/;
if (previousAccess && keyPattern.test(previousAccess) && (ownerId || joinCode)) {
  sessionStorage.setItem(ownerId ? roomKey(ownerId) : viewerKey(joinCode!), previousAccess);
}
if (previousAccess || handoffTicket) history.replaceState(null, '', location.pathname + location.search);

async function account(body: object) {
  const response = await fetch('/erae-tori/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new ApiError(response.status, result?.error || 'ارتباط با سامانهٔ حساب‌ها برقرار نشد.');
  }
}

let restoration: Promise<void> | undefined;
function restoreSession() {
  return restoration ??= (async () => {
    if (handoffTicket && keyPattern.test(handoffTicket)) {
      try { await account({ action: 'redeem-login', ticket: handoffTicket }); return; }
      catch { /* A used or expired link can fall back to an existing session. */ }
    }
    const response = await fetch('https://numeralab.ieaum.ir/api/erae-session?transfer=1', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new ApiError(401, 'ابتدا وارد حساب IEAUM شوید.');
    const { ticket } = await response.json();
    await account({ action: 'redeem-login', ticket });
  })();
}

async function ownedRooms(signal?: AbortSignal) {
  const list = () => api<{ rooms: OwnedRoom[] }>('list', {}, undefined, undefined, signal);
  try { return await list(); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    await restoreSession().catch(() => { throw error; });
    return list();
  }
}

function Copy({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return <label>{label}<div className="copy-line">
    <input dir="ltr" value={value} readOnly onFocus={(event) => event.target.select()} />
    <button type="button" className="secondary" onClick={async () => {
      try { await navigator.clipboard.writeText(value); setCopied(true); }
      catch { setCopied(false); }
    }}>{copied ? 'کپی شد' : 'کپی'}</button>
  </div></label>;
}

function NeedAccount() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <section className="narrow"><h1>ورود به ارائه‌طوری</h1><p>برای ساخت یا مدیریت ارائه، وارد حساب IEAUM شوید.</p>
    <form onSubmit={async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      setBusy(true); setError('');
      try {
        await account({ action: 'login', username: data.get('username'), password: data.get('password') });
        location.reload();
      } catch (error) { setError(message(error)); } finally { setBusy(false); }
    }}>
      <label>نام کاربری<input name="username" dir="ltr" autoComplete="username" maxLength={32} required /></label>
      <label>رمز عبور<input name="password" type="password" dir="ltr" autoComplete="current-password" maxLength={72} required /></label>
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="bar"><button disabled={busy}>ورود</button><a className="action" href="https://t.me/ieaumbot?start=presentation">ورود از طریق ربات</a></div>
    </form>
    <div className="bar"><a href="https://t.me/ieaumbot?start=signup">ساخت حساب</a><a href="https://t.me/ieaumbot?start=reset">فراموشی رمز عبور</a></div>
  </section>;
}

function QuizEditor({ questions, setQuestions, count, disabled, first = 1 }: { questions: Question[]; setQuestions: (value: Question[]) => void; count: number; disabled: boolean; first?: number }) {
  const edit = (index: number, change: Partial<Question>) => setQuestions(questions.map((question, i) => i === index ? { ...question, ...change } : question));
  return <fieldset disabled={disabled}><legend>کوییز اختیاری</legend>
    <p className="hint">سؤال بعد از اسلایدی که انتخاب می‌کنید و پیش از اسلاید بعدی نمایش داده می‌شود.</p>
    {questions.map((question, index) => <fieldset key={index}><legend>سؤال {fa.format(index + 1)}</legend>
      <label>بعد از اسلاید<select value={question.after} onChange={(event) => edit(index, { after: Number(event.target.value) })}>
        {Array.from({ length: Math.max(0, count - first) }, (_, i) => <option key={i} value={i + first}>{fa.format(i + first)}</option>)}
      </select></label>
      <label>متن سؤال<textarea rows={2} maxLength={300} value={question.text} onChange={(event) => edit(index, { text: event.target.value })} /></label>
      <div className="grid">{question.options.map((option, i) => <label key={i}>گزینهٔ {fa.format(i + 1)}
        <input maxLength={140} value={option} onChange={(event) => edit(index, { options: question.options.map((old, j) => i === j ? event.target.value : old) })} />
      </label>)}</div>
      <label>پاسخ درست<select value={question.correct} onChange={(event) => edit(index, { correct: Number(event.target.value) })}>
        {question.options.map((_, i) => <option key={i} value={i}>گزینهٔ {fa.format(i + 1)}</option>)}
      </select></label>
      <div className="bar">
        {question.options.length < 4 && <button type="button" className="secondary" onClick={() => edit(index, { options: [...question.options, ''] })}>افزودن گزینه</button>}
        {question.options.length > 2 && <button type="button" className="secondary" onClick={() => edit(index, { options: question.options.slice(0, -1), correct: Math.min(question.correct, question.options.length - 2) })}>حذف گزینهٔ آخر</button>}
        <button type="button" className="secondary" onClick={() => setQuestions(questions.filter((_, i) => i !== index))}>حذف سؤال</button>
      </div>
    </fieldset>)}
    <button type="button" className="secondary" disabled={count <= first || questions.length >= 20} onClick={() => setQuestions([...questions, { after: first, text: '', options: ['', ''], correct: 0 }])}>افزودن سؤال</button>
    {count <= first && <p className="hint">فاصله‌ای بین اسلایدها برای افزودن سؤال باقی نمانده است.</p>}
  </fieldset>;
}

function Builder() {
  const [rooms, setRooms] = useState<OwnedRoom[] | null>(null);
  const [login, setLogin] = useState(false);
  const [slides, setSlides] = useState<Blob[]>([]);
  const [cover, setCover] = useState<Blob>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<{ id: string; code: string }>();
  const [created, setCreated] = useState<{ id: string; code: string; joinCode: string }>();
  const load = () => ownedRooms().then(({ rooms }) => setRooms(rooms)).catch((error) => {
    if (error instanceof ApiError && error.status === 401) setLogin(true);
    else setError(message(error));
  });
  useEffect(() => { void load(); }, []);
  if (login) return <NeedAccount />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const preparedQuestions = readQuestions(questions, slides.length);
      if (!cover || !slides.length) throw new Error('فایل ارائه و تصویر جلد را انتخاب کنید.');
      const room = draft ?? await api<{ id: string; code: string }>('create', {}, { title: data.get('title'), caption: data.get('caption'), pageCount: slides.length });
      setDraft(room);
      sessionStorage.setItem(roomKey(room.id), room.code);
      const access = { id: room.id, key: room.code };
      const images = [cover, ...slides];
      for (const [page, image] of images.entries()) {
        setStatus(`بارگذاری ${fa.format(page + 1)} از ${fa.format(images.length)}…`);
        await api('upload', access, image, page);
      }
      const published = await api<{ joinCode: string }>('publish', access, { questions: preparedQuestions });
      setCreated({ ...room, ...published });
      setStatus('');
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }

  if (created) return <section className="narrow"><h1>ارائه آماده است</h1>
    <Copy label="لینک مدیریت ارائه" value={ownerUrl(created.id)} />
    <Copy label="کد ورود مدیر" value={created.code} />
    <Copy label="لینک ورود شرکت‌کنندگان" value={viewerUrl(created.joinCode)} />
    <a className="action" href={ownerUrl(created.id)}>باز کردن کنترل ارائه</a>
  </section>;
  return <section className="narrow"><h1>ساخت ارائه</h1>
    {error && <p role="alert" className="field-error">{error}</p>}
    {!rooms ? <p role="status">در حال بررسی حساب…</p> : <>
    <form onSubmit={submit}>
      <fieldset disabled={busy}><legend>مشخصات ارائه</legend>
        <label>عنوان<input name="title" maxLength={120} required readOnly={Boolean(draft)} /></label>
        <label>کپشن<textarea name="caption" maxLength={800} rows={3} readOnly={Boolean(draft)} /></label>
        <label>تصویر ابتدایی<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(draft)} onChange={async (event) => {
          const file = event.target.files?.[0];
          setCover(undefined); setError('');
          if (!file) return;
          setBusy(true);
          try { setCover(await prepareCover(file)); } catch (error) { setError(message(error)); } finally { setBusy(false); }
        }} /></label>
        <label>فایل ارائه<input type="file" accept=".pdf,.docx" disabled={Boolean(draft)} onChange={async (event) => {
          const file = event.target.files?.[0];
          setSlides([]); setQuestions([]); setError('');
          if (!file) return;
          setBusy(true);
          try { setSlides(await prepareSlides(file, setStatus)); }
          catch (error) { setError(message(error)); }
          finally { setBusy(false); setStatus(''); }
        }} /></label>
        <p className="hint">PDF و DOCX، حداکثر ۲۵ مگابایت و ۴۰ صفحه. برای حفظ صفحه‌آرایی و تصاویر Word، فایل را به PDF تبدیل کنید.</p>
        {slides.length > 0 && <p role="status">{fa.format(slides.length)} اسلاید آماده شد.</p>}
      </fieldset>
      {slides.length > 0 && <QuizEditor questions={questions} setQuestions={setQuestions} count={slides.length} disabled={busy} />}
      <div className="bar">
        <button disabled={busy || !slides.length || !cover}>{draft ? 'ادامهٔ بارگذاری و ساخت لینک‌ها' : 'ساخت ارائه و لینک‌ها'}</button>
        {draft && <button type="button" className="secondary" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await api('delete-draft', { id: draft.id }, {}); setDraft(undefined); }
          catch (error) { setError(message(error)); } finally { setBusy(false); }
        }}>لغو پیش‌نویس</button>}
      </div>
      <p role="status">{status}</p>
    </form>
    {rooms.length > 0 && <section><h2>ارائه‌های من</h2><ul>{rooms.map((room) => <li key={room.id}>
      {room.published ? <a href={ownerUrl(room.id)}>{room.title}</a> : <>{room.title} (پیش‌نویس) <button className="secondary" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await api('delete-draft', { id: room.id }, {}); await load(); }
        catch (error) { setError(message(error)); } finally { setBusy(false); }
      }}>حذف پیش‌نویس</button></>}
    </li>)}</ul></section>}
    </>}
  </section>;
}

function Slide({ page, access }: { page: number; access: Access }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const { id, s, key } = access;
  useEffect(() => {
    const controller = new AbortController();
    let url = '';
    setSrc(''); setError('');
    api<Blob>('image', { id, s, key }, undefined, page, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); setSrc(url);
    }).catch((error) => { if (!controller.signal.aborted) setError(message(error)); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [id, s, key, page]);
  return error ? <p role="alert">{error}</p> : src ? <figure><img src={src} alt={`اسلاید ${fa.format(page)}`} /></figure> : <p role="status">در حال دریافت اسلاید…</p>;
}

function Session() {
  const id = ownerId ?? undefined;
  const s = joinCode ?? undefined;
  const admin = Boolean(id);
  const storage = id ? roomKey(id) : viewerKey(s!);
  const [key, setKey] = useState(sessionStorage.getItem(storage) ?? '');
  const [view, setView] = useState<RoomView>();
  const [info, setInfo] = useState<RoomInfo>();
  const [account, setAccount] = useState<boolean>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ first: number; questions: Question[] }>();
  useEffect(() => {
    const controller = new AbortController();
    if (s) api<RoomInfo>('info', { s }, undefined, undefined, controller.signal).then(setInfo).catch((error) => { if (!controller.signal.aborted) setError(message(error)); });
    if (admin) ownedRooms(controller.signal).then(() => setAccount(true)).catch((error) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) setAccount(false);
      else setError(message(error));
    });
    return () => controller.abort();
  }, [s, admin]);

  useEffect(() => {
    if (!key || (admin && !account)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function sync() {
      try { setView(await api<RoomView>('state', { id, s, key }, undefined, undefined, controller.signal)); }
      catch (error) {
        if (controller.signal.aborted) return;
        setError(message(error));
        if (error instanceof ApiError && [401, 404].includes(error.status)) { sessionStorage.removeItem(storage); setKey(''); setView(undefined); return; }
      }
      if (!controller.signal.aborted) timer = setTimeout(sync, document.hidden ? 12000 : 3000);
    }
    void sync();
    return () => { clearTimeout(timer); controller.abort(); };
  }, [id, s, key, storage, admin, account]);

  const saveKey = (value: string) => { sessionStorage.setItem(storage, value); setKey(value); };
  async function run<T>(task: () => Promise<T>, done: (result: T) => void) {
    setBusy(true); setError('');
    try { done(await task()); } catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  if (admin && account === false) return <NeedAccount />;
  const access = { id, s, key };
  const stage = view?.step;
  const move = (delta: number) => run(() => api<RoomView>('move', access, { delta, position: view?.position }), setView);
  return <section className={view ? '' : 'narrow'}>
    <h1>{view?.title ?? info?.title ?? (admin ? 'کنترل ارائه' : 'ورود به ارائه')}</h1>
    {error && <p role="alert" className="field-error">{error}</p>}
    {!view ? <>
      {s && info && <><p className="caption">{info.caption}</p><figure className="cover"><img src={endpoint('cover', { s }).href} alt="جلد ارائه" /></figure></>}
      {!key && ((s && info) || (admin && account)) && <form onSubmit={(event) => {
        event.preventDefault();
        const value = String(new FormData(event.currentTarget).get('entry') ?? '').trim();
        if (admin) void run(() => api<RoomView>('state', { id, key: value }), (state) => { setView(state); saveKey(value); });
        else void run(() => api<{ access: string; view: RoomView }>('join', { s }, { name: value }), (result) => { setView(result.view); saveKey(result.access); });
      }}>
        <label>{admin ? 'کد ورود مدیر' : 'نام و نام خانوادگی'}<input name="entry" required maxLength={admin ? 32 : 60} dir={admin ? 'ltr' : undefined} autoComplete="off" /></label>
        <div className="bar"><button disabled={busy}>ورود</button>
          {admin && <button type="button" className="secondary" disabled={busy} onClick={() => void run(() => api<{ code: string }>('new-code', { id }, {}), ({ code }) => saveKey(code))}>صدور کد مدیر تازه</button>}
        </div>
      </form>}
    </> : <>
      {admin && <>
        <details><summary>لینک‌ها و کد مدیر</summary>
          <Copy label="کد ورود مدیر" value={key} />
          <Copy label="لینک مدیریت ارائه" value={ownerUrl(id!)} />
          {view.published && view.joinCode && <Copy label="لینک ورود شرکت‌کنندگان" value={viewerUrl(view.joinCode)} />}
        </details>
        <div className="bar controls"><button disabled={busy || Boolean(edit) || !view.published || view.position === -1} onClick={() => void move(-1)}>گام قبلی</button>
          <button disabled={busy || Boolean(edit) || !view.published || view.position === (view.total ?? 1) - 1} onClick={() => void move(1)}>{view.position === -1 ? 'شروع ارائه' : 'گام بعدی'}</button>
          {view.published && !edit && (view.lastShownPage ?? 0) < view.pageCount - 1 && <button className="secondary" onClick={() => {
            const shown = view.lastShownPage ?? 0;
            setEdit({ first: shown + 1, questions: (view.questions ?? []).filter((question) => question.after > shown) });
          }}>ویرایش کوییزهای بعدی</button>}
          <span>{fa.format(view.participants ?? 0)} شرکت‌کننده{view.answered !== null && view.answered !== undefined ? `، ${fa.format(view.answered)} پاسخ` : ''}</span>
        </div>
        {edit && <form className="narrow" onSubmit={(event) => {
          event.preventDefault();
          void run(() => api<RoomView>('questions', access, { questions: edit.questions }), (state) => { setView(state); setEdit(undefined); });
        }}>
          <QuizEditor questions={edit.questions} count={view.pageCount} first={edit.first} disabled={busy} setQuestions={(questions) => setEdit({ ...edit, questions })} />
          <div className="bar"><button disabled={busy}>ذخیرهٔ کوییز</button><button type="button" className="secondary" onClick={() => setEdit(undefined)}>انصراف</button></div>
        </form>}
      </>}
      {stage?.type === 'waiting' && <p role="status">{admin ? 'لینک شرکت‌کنندگان را به کلاس بدهید و ارائه را شروع کنید.' : 'در انتظار شروع ارائه…'}</p>}
      {stage?.type === 'slide' && <Slide page={stage.page} access={access} />}
      {stage?.type === 'question' && view.question && <section className="narrow"><h2>{view.question.text}</h2><div className="options">
        {view.question.options.map((option, choice) => <button key={choice} disabled={admin || busy || view.answer !== undefined} className={view.answer === choice ? 'selected' : ''}
          onClick={() => void run(() => api<RoomView>('answer', access, { index: stage.index, choice }), setView)}>{option}</button>)}
      </div>{view.answer !== undefined && <p role="status">پاسخ ثبت شد. منتظر مرحلهٔ بعد باشید.</p>}</section>}
      {stage?.type === 'ranking' && <section><h2>رتبه‌بندی نهایی</h2><table><thead><tr><th>رتبه</th><th>نام</th><th>امتیاز از {fa.format(view.questionCount ?? 0)}</th></tr></thead>
        <tbody>{view.ranking?.map((row, index) => <tr key={index}><td>{fa.format(row.rank)}</td><td>{row.name}</td><td>{fa.format(row.score)}</td></tr>)}</tbody>
      </table></section>}
      {stage?.type === 'end' && <p>ارائه به پایان رسید.</p>}
    </>}
  </section>;
}

createRoot(document.getElementById('root')!).render(ownerId || joinCode ? <Session /> : <Builder />);
