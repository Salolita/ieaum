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

export function AccountPanel({ account, onLogout, managingQuizzes = false }: { account: Account; onLogout: () => void; managingQuizzes?: boolean }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isStudent = account.role === 'student' && !managingQuizzes;

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

  return <section className={`solver-panel mx-auto max-w-3xl p-5 sm:p-8 account-panel${managingQuizzes ? ' quiz-management' : ''}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="service-page-title">{managingQuizzes ? 'مدیریت آزمون‌ها' : isStudent ? 'پنل دانشجو' : 'پنل مدیریت آزمون استاد'}</h1>
      <button type="button" disabled={busy} className="rounded-lg border border-slate-300 px-3 py-1" onClick={logout}>خروج</button>
    </div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
    {isStudent ? <>
      <p>{account.first_name} {account.last_name} · <bdi>{account.username}</bdi></p>
      <p>اتصال به ربات تلگرام · {account.telegramConnected ? 'متصل' : <a className="underline" href={botLogin}>اتصال حساب</a>}</p>
    </> : <div className="account-profile-details">
      <p>{account.first_name} {account.last_name} · <bdi>{account.username}</bdi></p>
      <p>اتصال به ربات تلگرام · {account.telegramConnected ? 'متصل' : <a className="underline" href={botLogin}>اتصال حساب</a>}</p>
      {managingQuizzes && <a className="underline" href="/panel/">بازگشت به نمایهٔ من</a>}
    </div>}
    <QuizPanel role={managingQuizzes ? 'teacher' : account.role} management={managingQuizzes} />
  </section>;
}
