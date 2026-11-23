import { createRoot } from 'react-dom/client';
import { useEffect, useState, type FormEvent } from 'react';
import { AccountPanel, type Account } from '../portal/client/components/AccountPanel';
import { portal } from '../portal/client/utils/portal';
import { liveCodeLabel, liveCodeOffline, liveCodeOnline, liveCodeUrl } from '../portal/live-code';
import { botReset, botSignup } from '../portal/client/utils/entry';
import { loadPanelProfile, redeemSiteTicket, restoreFromSolver, takeSiteTicket } from '../portal/client/utils/site-session';
import '../portal/client/index.css';
import './style.css';

const ticket = takeSiteTicket();
const comingSoon = 'این سرویس به زودی ارائه می‌شود.';
const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2';

function Panel() {
  const [account, setAccount] = useState<Account | null>();
  const [error, setError] = useState('');
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
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
    setCheckingLiveCode(true);
    setAlert('');
    try {
      if (await liveCodeOnline()) window.location.assign(liveCodeUrl);
      else setAlert(liveCodeOffline);
    } finally { setCheckingLiveCode(false); }
  }

  return <>
    <nav className="panel-services" aria-label="سرویس‌های IEAUM">
      <a href="/erae-tori/">ارائه‌طوری</a>
      <button type="button" onClick={() => setAlert(comingSoon)}>استعدادتو</button>
      <a href="https://numeralab.ieaum.ir/">نامرالب</a>
      <button type="button" onClick={() => setAlert(comingSoon)}>انداز برانداز</button>
      {account && <button type="button" className="live-code-entry" disabled={checkingLiveCode}
        aria-busy={checkingLiveCode} onClick={() => void openLiveCode()}>{liveCodeLabel}</button>}
    </nav>
    {alert && <div className="panel-alert"><p role="alert">{alert}</p><button type="button" aria-label="بستن اعلان" onClick={() => setAlert('')}>×</button></div>}
    <main className="account-ui text-slate-900">
      {account ? <AccountPanel account={account} onLogout={() => { sessionStorage.setItem('ieaum-logged-out', '1'); setAccount(null); }} />
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
