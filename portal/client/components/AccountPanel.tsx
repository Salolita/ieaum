import { useState } from 'react';
import { QuizPanel } from './QuizPanel';
import { portal } from '../utils/portal';
import { botLogin } from '../utils/entry';

export interface Account {
  username: string;
  first_name: string;
  last_name: string;
  role: 'student' | 'teacher';
  telegramConnected: boolean;
}

export function AccountPanel({ account, onLogout }: { account: Account; onLogout: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await portal({ action: 'logout' });
      onLogout();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="account-panel solver-panel mx-auto max-w-3xl p-5 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="service-page-title">{account.role === 'teacher' ? 'پنل مدیریت آزمون استاد' : 'پنل دانشجو'}</h1>
      <button type="button" disabled={busy} className="rounded-lg border border-slate-300 px-3 py-1" onClick={logout}>خروج</button>
    </div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
    <p>{account.first_name} {account.last_name} · <bdi>{account.username}</bdi></p>
    <p>اتصال به ربات تلگرام · {account.telegramConnected ? 'متصل' : <a className="underline" href={botLogin}>اتصال حساب</a>}</p>
    <QuizPanel role={account.role} />
  </section>;
}
