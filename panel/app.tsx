import { createRoot } from 'react-dom/client';
import { useEffect, useState, type FormEvent } from 'react';
import { AccountPanel, type Account } from '../portal/client/components/AccountPanel';
import { portal } from '../portal/client/utils/portal';
import { liveCodeContactUrl, liveCodeLabel, liveCodeOffline, liveCodeOnline, liveCodeUrl } from '../portal/live-code';
import { uniLudoBot, uniLudoLabel, uniLudoTelegramOnly } from '../portal/uniludo/service';
import { botReset, botSignup } from '../portal/client/utils/entry';
import { loadPanelProfile, redeemSiteTicket, restoreFromSolver, takeSiteTicket } from '../portal/client/utils/site-session';
import '../portal/client/index.css';
import './style.css';

const ticket = takeSiteTicket();
const liveCodePopupNotice = 'برای باز کردن اجرای زنده کد در تب جدید، روی لینک زیر بزنید.';
const comingSoon = 'این سرویس به زودی ارائه می‌شود.';
const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2';

function Panel() {
  const [account, setAccount] = useState<Account | null>();
  const [error, setError] = useState('');
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const quizManagement = new URLSearchParams(location.search).get('quizzes') === 'manage';
  const [checkingLiveCode, setCheckingLiveCode] = useState(false);
  useEffect(() => {
    async function load() {
      if (ticket) await redeemSiteTicket(ticket).catch((failure: Error) => setError(failure.message));
      let profile = await loadPanelProfile<Account>();
      if (!profile && !sessionStorage.getItem('ieaum-logged-out') && await restoreFromSolver().catch(() => false)) {
        profile = await loadPanelProfile<Account>();
      }
      setAccount(profile);
    }
    load().catch((failure: Error) => { setError(failure.message); setAccount(null); });
  }, []);

  useEffect(() => {
    if (account && !ticket) void portal({ action: 'service:opened', target: 'panel' }).catch(() => {});
  }, [account]);

  useEffect(() => {
    setCanManage(false);
    if (!account) return;
    const controller = new AbortController();
    void fetch('/api/account?siteManagement=1&scope=access', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => { if (response.ok && !controller.signal.aborted) setCanManage((await response.json()).canManage === true); })
      .catch(() => {});
    return () => controller.abort();
  }, [account]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      await portal({ action: 'login', ...Object.fromEntries(new FormData(event.currentTarget)) });
      const profile = await loadPanelProfile<Account>();
      if (!profile) throw new Error('نشست ورود برقرار نشد. دوباره وارد شوید.');
      sessionStorage.removeItem('ieaum-logged-out');
      setAccount(profile);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  async function openLiveCode() {
    if (checkingLiveCode) return;
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    setCheckingLiveCode(true);
    setAlert('');
    try {
      if (!(await liveCodeOnline())) {
        tab?.close();
        setAlert(liveCodeOffline);
      } else if (tab) {
        tab.location.replace(liveCodeUrl);
      } else {
        setAlert(liveCodePopupNotice);
      }
    } finally { setCheckingLiveCode(false); }
  }

  return <>
    {account && <nav className="panel-services" aria-label="سرویس‌های IEAUM">
      <a href="/erae-tori/" target="_blank" rel="noopener noreferrer">ارائه‌طوری</a>
      <button type="button" onClick={() => setAlert(comingSoon)}>استعدادتو</button>
      <a href="https://numeralab.ieaum.ir/" target="_blank" rel="noopener noreferrer">نامرالب</a>
      <button type="button" onClick={() => setAlert(comingSoon)}>انداز برانداز</button>
      <button type="button" className="live-code-entry" disabled={checkingLiveCode}
        aria-busy={checkingLiveCode} onClick={() => void openLiveCode()}>{liveCodeLabel}</button>
      <button type="button" onClick={() => setAlert(uniLudoTelegramOnly)}>{uniLudoLabel}</button>
    </nav>}
    {account && canManage && <div className="panel-admin">
      <hr />
      <nav className="panel-services" aria-label="گزینه‌های مدیریت"><a href="/management/">مدیریت IEAUM</a></nav>
    </div>}
    {alert && <div className="panel-alert">
      <p role="alert" style={{whiteSpace: 'pre-line'}}>{alert}
        {alert === liveCodePopupNotice && <> <a href={liveCodeUrl} target="_blank" rel="noopener noreferrer">{liveCodeLabel} ↗</a></>}
        {alert === liveCodeOffline && <> برای فعال‌سازی این بخش با <a href={liveCodeContactUrl}>مدیر</a> هماهنگ کنید.</>}
        {alert === uniLudoTelegramOnly && <><br /><a href={uniLudoBot} target="_blank" rel="noopener noreferrer">باز کردن ربات تلگرام ↗</a></>}
      </p><button type="button" aria-label="بستن اعلان" onClick={() => setAlert('')}>×</button>
    </div>}
    <main className="account-ui text-slate-900">
      {account ? <AccountPanel key={String(quizManagement && canManage)} account={account} managingQuizzes={quizManagement && canManage} onLogout={() => { sessionStorage.setItem('ieaum-logged-out', '1'); setAccount(null); }} />
        : <section className="solver-panel mx-auto max-w-lg space-y-4 p-5 sm:p-7">
          <h1 className="service-page-title">ورود به پنل <bdi>IEAUM</bdi></h1>
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
          {account === undefined ? <p role="status">در حال بررسی حساب…</p> : <>
            <form onSubmit={login} className="space-y-3">
              <label className="block">نام کاربری<input name="username" dir="ltr" autoComplete="username" maxLength={32} required className={input} /></label>
              <label className="block">رمز عبور<input name="password" dir="ltr" autoComplete="current-password" type="password" maxLength={72} required className={input} /></label>
              <button type="submit" disabled={busy} className="button primary">{busy ? 'در حال ورود…' : 'ورود'}</button>
            </form>
            <div className="flex flex-wrap gap-3 text-sm text-sky-800"><a href={botSignup}>ساخت حساب</a><a href={botReset}>فراموشی رمز عبور</a></div>
          </>}
        </section>}
    </main>
  </>;
}

createRoot(document.getElementById('root')!).render(<Panel />);
