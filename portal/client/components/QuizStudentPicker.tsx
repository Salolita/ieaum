import {useEffect, useState} from 'react';
import {portal} from '../utils/portal';

export interface QuizStudent { username: string; first_name: string; last_name: string }
export const quizInput = 'w-full rounded-lg border border-slate-300 px-3 py-2';
export const quizButton = 'rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-950 disabled:opacity-50';
export const studentNames = (value: string) => value.split(/[\s,،]+/).filter(Boolean);

export function QuizStudentPicker({selected, onChange, management}: {
  selected: string[]; onChange: (names: string[]) => void; management: boolean;
}) {
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [directory, setDirectory] = useState<QuizStudent[]>();
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load(offset: number, term: string) {
    setBusy(true); setError('');
    try {
      const data = await portal<{ students: QuizStudent[]; more: boolean }>({action:'quiz:students', management, search:term, offset});
      setDirectory(previous => offset ? [...(previous ?? []), ...data.students] : data.students);
      setMore(data.more); setApplied(term);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(0, ''); }, []);
  return <fieldset className="quiz-picker rounded-lg border border-slate-200 p-3">
    <legend>دانشجویان مجاز ({selected.length.toLocaleString('fa-IR')})</legend>
    <div className="quiz-picker-search">
      <label className="quiz-field">جست‌وجوی نام یا نام کاربری<input className={quizInput} value={search} onChange={event => setSearch(event.target.value)}
        onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); if (!busy) void load(0, search);}}}/></label>
      <button type="button" className={quizButton} disabled={busy} onClick={() => void load(0, search)}>جست‌وجو</button>
    </div>
    {selected.length > 0 && <>
      <div className="flex flex-wrap gap-2">{selected.map(name => <button type="button" key={name} className={quizButton}
        aria-label={'حذف ' + name} onClick={() => onChange(selected.filter(item => item !== name))}><bdi>{name}</bdi> ×</button>)}</div>
      <button type="button" className={quizButton} onClick={() => onChange([])}>پاک کردن انتخاب همهٔ دانشجویان</button>
    </>}
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {directory && (directory.length ? <div className="quiz-student-list">
      {directory.map(person => {
        const checked = selected.includes(person.username);
        return <label key={person.username} className="flex items-center gap-2">
          <input type="checkbox" checked={checked} disabled={selected.length >= 100 && !checked}
            onChange={event => onChange(event.target.checked ? [...selected,person.username] : selected.filter(name => name !== person.username))}/>
          {person.first_name} {person.last_name} · <bdi>{person.username}</bdi>
        </label>;
      })}
    </div> : <p>دانشجوی فعالی پیدا نشد.</p>)}
    {more && <button type="button" className={quizButton} disabled={busy} onClick={() => void load(directory!.length, applied)}>نمایش موارد بیشتر</button>}
  </fieldset>;
}
