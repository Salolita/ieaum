import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { portal, PortalRequestError } from './utils/portal';
import { botLogin, botReset, botSignup, welcomeText } from './utils/entry';
import { telegramLaunchData } from './utils/telegram-launch';
import { jalaliParts, jalaliToISO } from './utils/jalali';
import { phoneRules, usernameRules } from './utils/account-fields';
import './index.css';

const telegram = (window as Window & {
  Telegram?: { WebApp?: { initData: string; platform: string; ready(): void; expand(): void; close(): void; openLink(url: string): void } };
}).Telegram?.WebApp;
const launchData = () => telegram?.initData || telegramLaunchData(location.hash);
const params = new URLSearchParams(location.search);
const requestedRole = params.get('role');
const loginMode = ['login', 'link'].includes(params.get('mode') ?? '');
const resetMode = params.get('mode') === 'reset';
const profileMode = params.get('mode') === 'profile';
const signup = !loginMode && !resetMode;
const field = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2';
const button = 'rounded-lg bg-sky-600 px-4 py-2 font-bold text-white disabled:opacity-50';
const months = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const currentYear = jalaliParts(new Date()).year;
const fa = new Intl.NumberFormat('fa-IR', { useGrouping: false });

function BirthDate({ invalid, initial }: { invalid: boolean; initial?: string | null }) {
  const date = initial ? jalaliParts(new Date(`${initial}T12:00:00Z`)) : null;
  const [year, setYear] = useState(date ? String(date.year) : '');
  const [month, setMonth] = useState(date ? String(date.month) : '');
  const [day, setDay] = useState(date ? String(date.day) : '');
  const days = year && month ? Array.from({ length: 31 }, (_, i) => i + 1)
    .filter((number) => jalaliToISO(`${year}/${month}/${number}`)) : [];
  return <fieldset className="space-y-1" aria-describedby={invalid ? 'account-error' : undefined}>
    <legend>تاریخ تولد (شمسی)</legend>
    <div className="grid grid-cols-3 gap-2">
      <select name="birthDate" aria-label="سال تولد" aria-invalid={invalid || undefined} className={field} value={year} onChange={(event) => { setYear(event.target.value); setDay(''); }}>
        <option value="">سال</option>
        {Array.from({ length: currentYear - 1278 }, (_, i) => currentYear - i).map((value) => <option key={value} value={value}>{fa.format(value)}</option>)}
      </select>
      <select name="birthMonth" aria-label="ماه تولد" className={field} value={month} onChange={(event) => { setMonth(event.target.value); setDay(''); }}>
        <option value="">ماه</option>
        {months.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
      </select>
      <select name="birthDay" aria-label="روز تولد" className={field} value={day} onChange={(event) => setDay(event.target.value)} disabled={!days.length}>
        <option value="">روز</option>
        {days.map((value) => <option key={value} value={value}>{fa.format(value)}</option>)}
      </select>
    </div>
    <input type="hidden" name="birthDateJalali" value={year || month || day ? `${year}/${month}/${day}` : ''} />
  </fieldset>;
}
telegram?.ready();
if (launchData()) telegram?.expand();

function Register() {
  const [role, setRole] = useState(requestedRole === 'student' || requestedRole === 'teacher' ? requestedRole : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PortalRequestError | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [success, setSuccess] = useState(false);
  const [notified, setNotified] = useState(true);
  const [nextUrl, setNextUrl] = useState('');
  const initData = launchData();
  const heading = resetMode ? 'تعیین رمز عبور جدید' : loginMode ? 'ورود به حساب'
    : role === 'teacher' ? 'ساخت حساب استاد' : role === 'student' ? 'ساخت حساب دانشجو' : 'افتتاح حساب';

  useEffect(() => {
    if (!error?.field) return;
    const field = formRef.current?.elements.namedItem(error.field);
    if (field instanceof HTMLElement) field.focus();
  }, [error]);
  const invalid = (field: string) => ({
    'aria-invalid': error?.field === field || undefined,
    'aria-describedby': error?.field === field ? 'account-error' : undefined,
  });
  const openSite = () => {
    if (telegram?.openLink) telegram.openLink(nextUrl);
    else location.assign(nextUrl);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError(null);
    try {
      const fields = Object.fromEntries(new FormData(form));
      if (!loginMode && fields.password !== fields.confirmPassword) {
        throw new PortalRequestError('رمز عبور و تکرار آن یکسان نیستند.', 'confirmPassword');
      }
      const result = await portal<{ notified?: boolean; nextUrl?: string }>({
        ...fields,
        action: resetMode ? 'reset-password' : loginMode ? 'login' : 'register',
        role, target: params.get('to'), resetCode: params.get('code'), telegramInitData: launchData(),
      });
      setNotified(result.notified !== false);
      setNextUrl(result.nextUrl ?? '');
      form.reset();
      setSuccess(true);
    } catch (error) {
      setError(error instanceof PortalRequestError ? error : new PortalRequestError('درخواست انجام نشد. دوباره تلاش کنید.'));
    } finally { setBusy(false); }
  }

  return <main className="numralab mx-auto max-w-lg p-4 sm:p-6">
    <section className="solver-panel space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <img src="/ieaum-logo.png" alt="" width="40" height="40" className="rounded-lg" />
        <h1 className="text-xl font-black">{heading}</h1>
      </div>
      {!initData ? <>
        <p role="alert">اطلاعات هویت تلگرام دریافت نشد. فرم را از دکمهٔ داخل گفت‌وگوی خصوصی ربات باز کنید.</p>
        {telegram?.platform && telegram.platform !== 'unknown'
          ? <button type="button" className={button} onClick={() => telegram.close()}>بستن مینی‌اپ</button>
          : <a className={button + ' inline-block'} href={resetMode ? botReset : loginMode ? botLogin : botSignup}>باز کردن گفت‌وگوی ربات</a>}
      </> : success ? <>
        <p role="status" className="whitespace-pre-line rounded-lg bg-emerald-50 p-3 text-emerald-700">{resetMode ? 'رمز عبور تغییر کرد. می‌توانید با رمز جدید وارد سایت شوید یا از ربات لینک ورود بگیرید.' : loginMode ? welcomeText : 'درخواست ثبت شد و در انتظار تأیید مدیر است.'}</p>
        {!notified && <p className="text-sm text-slate-600">ارسال اعلان تلگرام انجام نشد.</p>}
        {loginMode ? <button type="button" className={button} onClick={openSite}>بزن بریم!</button>
          : <button type="button" className={button} onClick={() => telegram?.close()}>بازگشت به ربات</button>}
      </> : signup && !role ? <div className="flex flex-wrap gap-3">
        <button type="button" className={button} onClick={() => setRole('student')}>ساخت حساب دانشجو</button>
        <button type="button" className={button} onClick={() => setRole('teacher')}>ساخت حساب استاد</button>
      </div> : <form className="space-y-3" ref={formRef} onSubmit={submit} noValidate onInput={(event) => {
        if ((event.target as HTMLInputElement).name === error?.field) setError(null);
      }}>
        {error && <p id="account-error" role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{error.message}</p>}
        {signup && <>
        {role === 'student' && <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">ویژهٔ دانشجویان ورودی ۴۰۴. حساب پس از تأیید مدیر فعال می‌شود.</p>}
        {role === 'teacher' && <p className="text-sm text-slate-600">حساب پس از تأیید مدیر فعال می‌شود.</p>}
        <div className="grid grid-cols-2 gap-3">
          <label>نام (فارسی)<input name="firstName" autoComplete="given-name" maxLength={80} required className={field} {...invalid('firstName')} /></label>
          <label>نام خانوادگی (فارسی)<input name="lastName" autoComplete="family-name" maxLength={80} required className={field} {...invalid('lastName')} /></label>
        </div>
        {role === 'student' ? <>
          <label className="block">شمارهٔ دانشجویی<input name="studentNumber" dir="ltr" inputMode="numeric" maxLength={20} required className={field} {...invalid('studentNumber')} /></label>
          <BirthDate invalid={error?.field === 'birthDate'} />
        </> : <label className="block">نام درس<input name="courseName" maxLength={120} required className={field} {...invalid('courseName')} /></label>}
        <label className="block">شمارهٔ موبایل ایران<input name="phone" type="tel" dir="ltr" inputMode="numeric" autoComplete="tel" placeholder="09xxxxxxxxx" maxLength={11} required className={field} {...invalid('phone')} /></label>
        <p className="text-sm text-slate-600">{phoneRules}</p>
        </>}
        {!resetMode && <label className="block">نام کاربری<input name="username" dir="ltr" autoComplete="username" minLength={loginMode ? 3 : 5} maxLength={32} required className={field} {...invalid('username')} /></label>}
        {signup && <p className="text-sm text-slate-600">{usernameRules}</p>}
        <label className="block">{resetMode ? 'رمز عبور جدید' : 'رمز عبور'}<input name="password" type="password" dir="ltr" autoComplete={loginMode ? 'current-password' : 'new-password'} minLength={8} maxLength={72} required className={field} {...invalid('password')} /></label>
        {!loginMode && <label className="block">{resetMode ? 'تکرار رمز جدید' : 'تکرار رمز عبور'}<input name="confirmPassword" type="password" dir="ltr" autoComplete="new-password" minLength={8} maxLength={72} required className={field} {...invalid('confirmPassword')} /></label>}
        {!loginMode && <p className="text-sm text-slate-600">رمز عبور باید دست‌کم ۸ نویسه داشته باشد.</p>}
        {error?.code?.startsWith('telegram_') && telegram?.close
          ? <button type="button" className={button} onClick={() => telegram.close()}>بستن مینی‌اپ و بازگشت به گفت‌وگو</button>
          : <button className={button} disabled={busy}>{busy ? 'در حال ارسال…' : resetMode ? 'ذخیرهٔ رمز جدید' : loginMode ? 'ورود' : 'ارسال درخواست'}</button>}
      </form>}
    </section>
  </main>;
}

interface EditableProfile {
  first_name: string; last_name: string; username: string; role: 'student' | 'teacher';
  phone: string | null; birth_date: string | null; student_number: string | null; course_name: string | null;
}

function EditProfile() {
  const [profile, setProfile] = useState<EditableProfile>();
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!launchData()) { setError('ویرایش نمایه را از داخل گفت‌وگوی خصوصی ربات باز کنید.'); return; }
    portal<{ profile: EditableProfile }>({ action: 'profile:get', telegramInitData: launchData() })
      .then(({ profile }) => setProfile(profile)).catch((failure: Error) => setError(failure.message));
  }, []);
  async function save(event: FormEvent<HTMLFormElement>, action: 'profile:save' | 'profile:password') {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setError(''); setInfo('');
    try {
      await portal({ ...Object.fromEntries(new FormData(form)), action, telegramInitData: launchData() });
      if (action === 'profile:password') form.reset();
      setInfo(action === 'profile:save' ? 'اطلاعات حساب ذخیره شد.' : 'رمز عبور تغییر کرد. با رمز جدید وارد سایت شوید.');
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="numralab mx-auto max-w-lg p-4 sm:p-6"><section className="solver-panel space-y-5 p-5">
    <h1 className="text-xl font-black">ویرایش اطلاعات حساب</h1>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
    {info && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-700">{info}</p>}
    {profile ? <>
      <form className="space-y-3" onSubmit={(event) => save(event, 'profile:save')} noValidate>
        <div className="grid grid-cols-2 gap-3">
          <label>نام (فارسی)<input name="firstName" defaultValue={profile.first_name} maxLength={80} required className={field} /></label>
          <label>نام خانوادگی (فارسی)<input name="lastName" defaultValue={profile.last_name} maxLength={80} required className={field} /></label>
        </div>
        <label className="block">نام کاربری<input name="username" defaultValue={profile.username} autoComplete="username" dir="ltr" minLength={5} maxLength={32} required className={field} /></label>
        <p className="text-sm text-slate-600">{usernameRules}</p>
        <label className="block">شمارهٔ تماس<input name="phone" type="tel" dir="ltr" defaultValue={profile.phone ?? ''} maxLength={24} required className={field} /></label>
        {profile.role === 'student'
          ? <label className="block">شمارهٔ دانشجویی<input name="studentNumber" defaultValue={profile.student_number ?? ''} dir="ltr" inputMode="numeric" maxLength={20} required className={field} /></label>
          : <label className="block">نام درس<input name="courseName" defaultValue={profile.course_name ?? ''} maxLength={120} required className={field} /></label>}
        <BirthDate invalid={false} initial={profile.birth_date} />
        <button className={button} disabled={busy}>ذخیرهٔ اطلاعات</button>
      </form>
      <form className="space-y-3 border-t border-slate-300 pt-4" onSubmit={(event) => save(event, 'profile:password')}>
        <h2 className="font-bold">تغییر رمز عبور</h2>
        <label className="block">رمز فعلی<input name="currentPassword" type="password" autoComplete="current-password" dir="ltr" required className={field} /></label>
        <label className="block">رمز جدید<input name="password" type="password" autoComplete="new-password" dir="ltr" minLength={8} maxLength={72} required className={field} /></label>
        <label className="block">تکرار رمز جدید<input name="confirmPassword" type="password" autoComplete="new-password" dir="ltr" minLength={8} maxLength={72} required className={field} /></label>
        <button className={button} disabled={busy}>ذخیرهٔ رمز جدید</button>
      </form>
    </> : !error && <p role="status">در حال خواندن نمایه…</p>}
    <button type="button" className="underline" onClick={() => telegram?.close()}>بازگشت به ربات</button>
  </section></main>;
}

createRoot(document.getElementById('root')!).render(profileMode ? <EditProfile /> : <Register />);
