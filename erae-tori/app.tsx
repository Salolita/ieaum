import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { prepareCover, prepareSlides } from './documents';
import { onPageHidden } from '../portal/client/utils/page-presence';
import { csvText } from '../portal/client/utils/csv';
import { readQuestions, type Question, type Step } from '../portal/client/utils/erae-model';
import './presentation.css';
import './style.css';

const params = new URLSearchParams(location.search);
const ownerId = params.get('admin');
const editId = params.get('edit');
const joinCode = params.get('s');
const fa = new Intl.NumberFormat('fa-IR');
type RoomInfo = { title: string; caption: string; pageCount: number; studentEntry?: boolean; runId?: string };
type RoomView = RoomInfo & { revision?: number; step: Step; stepPosition?: number; resumeAt?: number; question?: Omit<Question, 'after' | 'correct'>; answer?: number;
  questionCount?: number; ranking?: { name: string; score: number; rank: number }[];
  position?: number; total?: number; participants?: number; answered?: number | null; joinCode?: string; published?: boolean;
  questions?: Question[]; lastShownPage?: number };
type OwnedRoom = { id: string; title: string; caption: string; published: boolean; moderation_disabled?: boolean; expires_at: string | null; page_count: number; furthest: number };
type Access = { id?: string; s?: string; key?: string; batch?: string };

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function endpoint(action: string, { id, s, batch }: Access, page?: number) {
  const url = new URL('/erae-tori/api', location.origin);
  url.searchParams.set('action', action);
  if (id) url.searchParams.set('id', id);
  if (s) url.searchParams.set('s', s);
  if (batch) url.searchParams.set('batch', batch);
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
  const list = () => api<{ rooms: OwnedRoom[]; autoDelete?: boolean }>('list', {}, undefined, undefined, signal);
  if (handoffTicket && keyPattern.test(handoffTicket)) await restoreSession().catch(() => {});
  try { return await list(); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    await restoreSession().catch(() => { throw error; });
    return list();
  }
}

function announceWebsiteEntry() {
  if (!handoffTicket) void account({ action: 'service:opened', target: 'presentation' }).catch(() => {});
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
  return <section className="narrow"><h1 className="service-page-title">ورود به ارائه‌طوری</h1><p>برای ساخت یا مدیریت ارائه، وارد حساب IEAUM شوید.</p>
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
      <div className="bar"><button disabled={busy}>ورود</button></div>
    </form>
    <div className="bar"><a href="https://t.me/ieaumbot?start=signup">ساخت حساب</a><a href="https://t.me/ieaumbot?start=reset">فراموشی رمز عبور</a></div>
  </section>;
}

function Retention({ editing = false }: { editing?: boolean }) {
  return <label>حذف خودکار<select name="retention" defaultValue={editing ? 'keep' : ''}>
    {editing && <option value="keep">زمان فعلی حفظ شود</option>}
    <option value="">خاموش</option><option value="3">۳ روز دیگر</option><option value="5">۵ روز دیگر</option>
  </select></label>;
}

const expiryDate = (value: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const editUrl = (id: string) => `/erae-tori/?edit=${encodeURIComponent(id)}`;

function ManageRoom({ room, autoDelete, onSaved, onDeleted }: { room: OwnedRoom; autoDelete: boolean; onSaved: () => Promise<void>; onDeleted: () => void }) {
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(''); setStatus('');
    try {
      const cover = data.get('cover');
      const image = cover instanceof File && cover.size ? await prepareCover(cover) : null;
      const deck = data.get('deck');
      if (deck instanceof File && deck.size) {
        const slides = await prepareSlides(deck, setStatus);
        if (slides.length !== room.page_count) throw new Error(`فایل جایگزین باید ${fa.format(room.page_count)} اسلاید داشته باشد تا جای کوییزها حفظ شود.`);
        const access = { id: room.id, batch: crypto.randomUUID() };
        for (const [index, slide] of slides.entries()) {
          setStatus(`بارگذاری اسلاید ${fa.format(index + 1)} از ${fa.format(slides.length)}…`);
          await api('stage-slide', access, slide, index + 1);
        }
        await api('replace-slides', access, {});
      }
      const retention = data.get('retention');
      await api('metadata', { id: room.id }, { title: data.get('title'), caption: data.get('caption'), ...(retention !== null && retention !== 'keep' ? { retention } : {}) });
      if (image) await api('cover-update', { id: room.id }, image);
      await onSaved();
      setStatus('تغییرات ارائه ذخیره شد.');
      for (const name of ['cover', 'deck']) {
        const file = form.elements.namedItem(name);
        if (file instanceof HTMLInputElement) file.value = '';
      }
    } catch (failure) { setError(message(failure)); setStatus(''); }
    finally { setBusy(false); }
  }

  return <section className="narrow"><h1 className="service-page-title">مدیریت ارائه</h1>
    {room.moderation_disabled && <p role="status">این ارائه توسط مدیر IEAUM غیرفعال شده است.</p>}
    <p>{room.expires_at ? `زمان حذف خودکار: ${expiryDate(room.expires_at)}` : 'حذف خودکار خاموش است.'}</p>
    {error && <p role="alert" className="field-error">{error}</p>}
    {status && <p role="status">{status}</p>}
    <form onSubmit={save}><fieldset disabled={busy}>
      <label>عنوان<input name="title" maxLength={120} required defaultValue={room.title} /></label>
      <label>کپشن<textarea name="caption" maxLength={800} rows={3} defaultValue={room.caption} /></label>
      <label>تصویر جلد تازه<input name="cover" type="file" accept="image/jpeg,image/png,image/webp" /></label>
      {room.furthest < 0 && <label>فایل جایگزین با {fa.format(room.page_count)} اسلاید<input name="deck" type="file" accept=".pdf,.docx,.pptx" /></label>}
      {autoDelete && <Retention editing />}
    </fieldset><button disabled={busy}>ذخیرهٔ تغییرات</button></form>
    <div className="bar">
      {room.published && !room.moderation_disabled && <a className="action" href={ownerUrl(room.id)}>کنترل، بازنشانی و ویرایش کوییز</a>}
      <a className="action" href="/erae-tori/">ارائه‌های من</a>
      {!confirmDelete && <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmDelete(true)}>حذف ارائه</button>}
    </div>
    {confirmDelete && <section><p>ارائه، اسلایدها و پاسخ‌های کوییز برای همیشه حذف می‌شوند.</p><div className="bar">
      <button type="button" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { await api('delete', { id: room.id }, {}); sessionStorage.removeItem(roomKey(room.id)); onDeleted(); }
        catch (failure) { setError(message(failure)); } finally { setBusy(false); }
      }}>تأیید حذف</button><button type="button" className="secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>انصراف</button>
    </div></section>}
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
  const [autoDelete, setAutoDelete] = useState(false);
  const [login, setLogin] = useState(false);
  const [slides, setSlides] = useState<Blob[]>([]);
  const [cover, setCover] = useState<Blob>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<{ id: string; code: string }>();
  const [created, setCreated] = useState<{ id: string; code: string; joinCode: string }>();
  const load = () => ownedRooms().then(({ rooms, autoDelete }) => { setRooms(rooms); setAutoDelete(Boolean(autoDelete)); }).catch((error) => {
    if (error instanceof ApiError && error.status === 401) setLogin(true);
    else setError(message(error));
  });
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (rooms) announceWebsiteEntry(); }, [Boolean(rooms)]);
  if (login) return <NeedAccount />;
  if (editId && rooms) {
    const selected = rooms.find((room) => room.id === editId);
    return selected ? <ManageRoom room={selected} autoDelete={autoDelete} onSaved={load} onDeleted={() => location.replace('/erae-tori/')} />
      : <section className="narrow"><h1 className="service-page-title">ارائه در دسترس نیست</h1><a href="/erae-tori/">ارائه‌های من</a></section>;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const preparedQuestions = readQuestions(questions, slides.length);
      if (!cover || !slides.length) throw new Error('فایل ارائه و تصویر جلد را انتخاب کنید.');
      const room = draft ?? await api<{ id: string; code: string }>('create', {}, { title: data.get('title'), caption: data.get('caption'), pageCount: slides.length, retention: data.get('retention') });
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

  if (created) return <section className="narrow"><h1 className="service-page-title">ارائه آماده است</h1>
    <Copy label="لینک مدیریت ارائه" value={ownerUrl(created.id)} />
    <Copy label="کد ورود مدیر" value={created.code} />
    <Copy label="لینک ورود شرکت‌کنندگان" value={viewerUrl(created.joinCode)} />
    <a className="action" href={ownerUrl(created.id)}>باز کردن کنترل ارائه</a>
  </section>;
  return <section className="narrow"><h1 className="service-page-title">ساخت ارائه</h1>
    {error && <p role="alert" className="field-error">{error}</p>}
    {!rooms ? <p role="status">در حال بررسی حساب…</p> : <>
    {rooms.length >= 3 && !draft ? <p>حداکثر ۳ ارائه می‌توانید داشته باشید. برای ارائهٔ جدید یکی را حذف کنید.</p> : <form onSubmit={submit}>
      <fieldset disabled={busy}><legend>مشخصات ارائه</legend>
        <label>عنوان<input name="title" maxLength={120} required readOnly={Boolean(draft)} /></label>
        <label>کپشن<textarea name="caption" maxLength={800} rows={3} readOnly={Boolean(draft)} /></label>
        {!draft && autoDelete && <Retention />}
        <label>تصویر ابتدایی<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(draft)} onChange={async (event) => {
          const file = event.target.files?.[0];
          setCover(undefined); setError('');
          if (!file) return;
          setBusy(true);
          try { setCover(await prepareCover(file)); } catch (error) { setError(message(error)); } finally { setBusy(false); }
        }} /></label>
        <label>فایل ارائه<input type="file" accept=".pdf,.docx,.pptx" disabled={Boolean(draft)} onChange={async (event) => {
          const file = event.target.files?.[0];
          setSlides([]); setQuestions([]); setError('');
          if (!file) return;
          setBusy(true);
          try { setSlides(await prepareSlides(file, setStatus)); }
          catch (error) { setError(message(error)); }
          finally { setBusy(false); setStatus(''); }
        }} /></label>
        <p className="hint">PDF، PPTX و DOCX، حداکثر ۲۵ مگابایت و ۴۰ اسلاید. برای حفظ دقیق صفحه‌آرایی، نمودارها و فونت‌ها، PDF پیشنهاد می‌شود.</p>
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
    </form>}
    {rooms.length > 0 && <section><h2>ارائه‌های من</h2><ul>{rooms.map((room) => <li key={room.id}>
      <a href={editUrl(room.id)}>{room.title}{room.published ? '' : ' (پیش‌نویس)'} · مدیریت</a>
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

function rankingCsv(rows: NonNullable<RoomView['ranking']>) {
  const csv = csvText([['ردیف', 'نام', 'امتیاز'], ...rows.map(({ name, score }, index) => [index + 1, name, score])]);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'erae-tori-ranking.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Recovery { code: string; lastSeen?: number; attempt?: string }
const privateCode = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replaceAll('+', '-').replaceAll('/', '_');
const recoveryKey = (room: string, student: string, run?: string) => 'erae-recovery-' + room + '-' +
  (run && run !== 'initial' ? run + '-' : '') +
  student.trim().replace(/[۰-۹٠-٩]/g, (digit) => String(digit.charCodeAt(0) - (digit >= '۰' ? 0x6f0 : 0x660)));
function readRecovery(key: string): Recovery | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    return saved && keyPattern.test(saved.code) ? saved : undefined;
  } catch { return undefined; }
}
function storeRecovery(key: string, saved: Recovery) {
  try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* The code remains visible for copying. */ }
}

function Session() {
  const id = ownerId ?? undefined;
  const s = joinCode ?? undefined;
  const admin = Boolean(id);
  const storage = id ? roomKey(id) : viewerKey(s!);
  const [key, setKey] = useState(sessionStorage.getItem(storage) ?? '');
  const [recoverySlot, setRecoverySlot] = useState(sessionStorage.getItem(storage + '-recovery') ?? '');
  const [recoveryCode, setRecoveryCode] = useState(() => readRecovery(recoverySlot)?.code ?? '');
  const [view, setView] = useState<RoomView>();
  const [info, setInfo] = useState<RoomInfo>();
  const [account, setAccount] = useState<boolean>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ first: number; questions: Question[] }>();
  const [resetRun, setResetRun] = useState<string>();
  const [status, setStatus] = useState('');
  function applyView(next: RoomView) {
    setView((shown) => (shown?.revision ?? -1) > (next.revision ?? -1) ? shown : next);
  }
  useEffect(() => {
    const controller = new AbortController();
    if (!s || key) return;
    api<RoomInfo>('info', { s }, undefined, undefined, controller.signal)
      .then(setInfo).catch((error) => { if (!controller.signal.aborted) setError(message(error)); });
    return () => controller.abort();
  }, [s, key]);
  useEffect(() => {
    const controller = new AbortController();
    if (admin) ownedRooms(controller.signal).then(() => { setAccount(true); announceWebsiteEntry(); }).catch((error) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) setAccount(false);
      else setError(message(error));
    });
    return () => controller.abort();
  }, [admin]);

  useEffect(() => {
    if (admin ? !account : !key) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function sync() {
      try {
        const next = await api<RoomView>('state', { id, s, key }, undefined, undefined, controller.signal);
        if (!controller.signal.aborted) applyView(next);
      }
      catch (error) {
        if (controller.signal.aborted) return;
        setError(message(error));
        if (error instanceof ApiError && [401, 404].includes(error.status)) {
          sessionStorage.removeItem(storage);
          setKey(''); setView(undefined);
          if (s) {
            sessionStorage.removeItem(storage + '-recovery');
            setRecoverySlot(''); setRecoveryCode('');
            setInfo(undefined);
          }
          return;
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(sync, document.hidden ? 12000 : 3000);
    }
    void sync();
    return () => { clearTimeout(timer); controller.abort(); };
  }, [id, s, key, storage, admin, account]);

  useEffect(() => {
    if (recoverySlot && recoveryCode && view?.stepPosition !== undefined) {
      storeRecovery(recoverySlot, { code: recoveryCode, lastSeen: view.stepPosition });
    }
  }, [recoverySlot, recoveryCode, view?.stepPosition]);

  const ongoing = view?.step.type === 'slide' || view?.step.type === 'question';
  useEffect(() => {
    if (!s || !key || !ongoing) return;
    let last = 0;
    return onPageHidden(() => {
      if (Date.now() - last < 30_000) return;
      last = Date.now();
      void fetch(endpoint('departure', { s }), { method: 'POST', keepalive: true, headers: { Authorization: 'Bearer ' + key } }).catch(() => {});
    });
  }, [s, key, ongoing]);

  const saveKey = (value: string) => { sessionStorage.setItem(storage, value); setKey(value); };
  async function run<T>(task: () => Promise<T>, done: (result: T) => void) {
    setBusy(true); setError(''); setStatus('');
    try { done(await task()); } catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  if (admin && account === false) return <NeedAccount />;
  const access = { id, s, key };
  const stage = view?.step;
  const move = (delta: number) => run(() => api<RoomView>('move', access, { delta, position: view?.position, runId: view?.runId }), applyView);
  return <section className={view ? '' : 'narrow'}>
    <h1 className="service-page-title">{view?.title ?? info?.title ?? (admin ? 'کنترل ارائه' : 'ورود به ارائه')}</h1>
    {error && <p role="alert" className="field-error">{error}</p>}
    {status && <p role="status">{status}</p>}
    {!view ? <>
      {s && info && <><p className="caption">{info.caption}</p><figure className="cover"><img src={endpoint('cover', { s }).href} alt="جلد ارائه" /></figure></>}
      {!admin && !key && s && info && <form onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const name = String(fields.get('entry') ?? '').trim();
        const number = String(fields.get('studentNumber') ?? '').trim();
        const slot = recoveryKey(s, number, info.runId);
        const saved = readRecovery(slot);
        const code = String(fields.get('recovery') ?? '').trim() || saved?.code || privateCode();
        const attempt = saved?.code === code && saved.attempt ? saved.attempt : privateCode();
        if (info.studentEntry) storeRecovery(slot, { code, attempt, lastSeen: saved?.lastSeen });
        void run(async () => {
          try {
            return await api<{ access: string; view: RoomView; recovery?: string }>('join', { s }, info.studentEntry ? {
              name, studentNumber: number, recovery: code, attempt, lastSeen: saved?.lastSeen, runId: info.runId,
            } : { name });
          } catch (failure) {
            if (failure instanceof ApiError && failure.status === 409) {
              const current = await api<RoomInfo>('info', { s }).catch(() => undefined);
              if (current) setInfo(current);
            }
            throw failure;
          }
        }, (result) => {
          const credential = result.view.studentEntry ? result.recovery ?? code : undefined;
          if (credential) {
            storeRecovery(slot, { code: credential, lastSeen: result.view.stepPosition });
            sessionStorage.setItem(storage + '-recovery', slot);
            setRecoverySlot(slot);
            setRecoveryCode(credential);
          }
          applyView(result.view);
          saveKey(result.access);
        });
      }}>
        <label>نام و نام خانوادگی<input name="entry" required maxLength={60} autoComplete="off" /></label>
        {info.studentEntry && <>
          <label>شمارهٔ دانشجویی<input name="studentNumber" dir="ltr" inputMode="numeric" required maxLength={20} autoComplete="off" /></label>
          <details><summary>ادامهٔ نشست در مرورگر دیگر</summary>
            <label>کد بازیابی ارائه<input name="recovery" dir="ltr" maxLength={32} autoComplete="off" /></label>
          </details>
        </>}
        <div className="bar"><button disabled={busy}>ورود</button></div>
      </form>}
    </> : <>
      {!admin && <div className="bar">
        {recoveryCode && <details><summary>کد بازیابی ارائه</summary><Copy label="برای ورود از مرورگر دیگر" value={recoveryCode} /></details>}
        <button type="button" className="secondary" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            if (view.studentEntry && recoveryCode && (view.stepPosition ?? -1) >= 0) {
              await api('checkpoint', access, { position: view.stepPosition });
            }
          } catch { /* A browser checkpoint is also saved for the next entry. */ }
          finally {
            sessionStorage.removeItem(storage);
            sessionStorage.removeItem(storage + '-recovery');
            setView(undefined);
            setKey('');
            setError('');
            setBusy(false);
          }
        }}>خروج از ارائه</button>
      </div>}
      {admin && <>
        <details><summary>لینک‌ها و کد مدیر</summary>
          {key && <Copy label="کد ورود مدیر" value={key} />}
          <button type="button" className="secondary" disabled={busy} onClick={() => void run(() => api<{ code: string }>('new-code', { id }, {}), ({ code }) => saveKey(code))}>صدور کد مدیر تازه</button>
          <Copy label="لینک مدیریت ارائه" value={ownerUrl(id!)} />
          {view.published && view.joinCode && <Copy label="لینک ورود شرکت‌کنندگان" value={viewerUrl(view.joinCode)} />}
        </details>
        <div className="bar controls"><button disabled={busy || Boolean(edit || resetRun) || !view.published || view.position === -1} onClick={() => void move(-1)}>گام قبلی</button>
          <button disabled={busy || Boolean(edit || resetRun) || !view.published || view.position === (view.total ?? 1) - 1} onClick={() => void move(1)}>{view.position === -1 ? 'شروع ارائه' : 'گام بعدی'}</button>
          {view.published && !edit && !resetRun && (view.lastShownPage ?? 0) < view.pageCount - 1 && <button className="secondary" onClick={() => {
            const shown = view.lastShownPage ?? 0;
            setEdit({ first: shown + 1, questions: (view.questions ?? []).filter((question) => question.after > shown) });
          }}>ویرایش کوییزهای بعدی</button>}
          {view.published && view.runId && !edit && !resetRun && <button type="button" className="secondary" disabled={busy}
            onClick={() => { setError(''); setStatus(''); setResetRun(view.runId); }}>بازنشانی ارائه</button>}
          <span>{fa.format(view.participants ?? 0)} شرکت‌کننده{view.answered !== null && view.answered !== undefined ? `، ${fa.format(view.answered)} پاسخ` : ''}</span>
        </div>
        {resetRun && <section className="narrow" aria-label="تأیید بازنشانی">
          <p>پاسخ‌ها، رتبه‌بندی و ورودهای این اجرا پاک می‌شوند. شرکت‌کنندگان دوباره از همان لینک وارد می‌شوند. اسلایدها، سؤال‌ها و زمان حذف خودکار حفظ می‌شوند.</p>
          <div className="bar">
            <button type="button" disabled={busy || resetRun !== view.runId} onClick={() => void run(
              () => api<RoomView>('reset', access, { runId: resetRun }),
              (state) => { applyView(state); setResetRun(undefined); setStatus('ارائه به گام آغاز برگشت و برای اجرای بعدی آماده است.'); },
            )}>تأیید بازنشانی</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setResetRun(undefined)}>انصراف</button>
          </div>
        </section>}
        {edit && <form className="narrow" onSubmit={(event) => {
          event.preventDefault();
          void run(() => api<RoomView>('questions', access, { questions: edit.questions, runId: view.runId }), (state) => { applyView(state); setEdit(undefined); });
        }}>
          <QuizEditor questions={edit.questions} count={view.pageCount} first={edit.first} disabled={busy} setQuestions={(questions) => setEdit({ ...edit, questions })} />
          <div className="bar"><button disabled={busy}>ذخیرهٔ کوییز</button><button type="button" className="secondary" onClick={() => setEdit(undefined)}>انصراف</button></div>
        </form>}
      </>}
      {stage?.type === 'waiting' && <p role="status">{admin ? 'لینک شرکت‌کنندگان را به کلاس بدهید و ارائه را شروع کنید.' : 'در انتظار شروع ارائه…'}</p>}
      {stage?.type === 'slide' && <Slide page={stage.page} access={access} />}
      {stage?.type === 'question' && view.question && <section className="narrow"><h2>{view.question.text}</h2><div className="options">
        {view.question.options.map((option, choice) => <button key={choice} disabled={admin || busy || view.answer !== undefined} className={view.answer === choice ? 'selected' : ''}
          onClick={() => void run(() => api<RoomView>('answer', access, { index: stage.index, choice }), applyView)}>{option}</button>)}
      </div>{view.answer !== undefined && <p role="status">پاسخ ثبت شد. منتظر مرحلهٔ بعد باشید.</p>}</section>}
      {!admin && view.resumeAt !== undefined && view.resumeAt === view.stepPosition
        && (stage?.type !== 'question' || view.answer !== undefined)
        && <button disabled={busy} onClick={() => void run(() => api<RoomView>('resume-next', access, { position: view.resumeAt }), applyView)}>ادامهٔ ارائه</button>}
      {stage?.type === 'ranking' && <section><h2>رتبه‌بندی نهایی</h2>
        {admin && view.ranking && <button type="button" className="secondary" onClick={() => rankingCsv(view.ranking!)}>دانلود CSV رتبه‌بندی</button>}
        <table><thead><tr><th>ردیف</th><th>نام</th><th>امتیاز از {fa.format(view.questionCount ?? 0)}</th></tr></thead>
        <tbody>{view.ranking?.map((row, index) => <tr key={index}><td>{fa.format(index + 1)}</td><td>{row.name}</td><td>{fa.format(row.score)}</td></tr>)}</tbody>
      </table></section>}
      {stage?.type === 'end' && <p>ارائه به پایان رسید.</p>}
    </>}
  </section>;
}

createRoot(document.getElementById('root')!).render(ownerId || joinCode ? <Session /> : <Builder />);
