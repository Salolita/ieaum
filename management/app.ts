import './style.css';

type Room = { id: string; title: string; published: boolean; moderation_disabled: boolean; owner: { first_name: string; last_name: string } };
type Event = { service: 'presentation' | 'quiz' | 'livecode'; session_title: string; attendee_name: string; created_at: string };
const url = '/api/account?siteManagement=1';
const names = { presentation: 'ارائه‌طوری', quiz: 'آزمون', livecode: 'Live Code' };
const time = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' });
const status = document.querySelector<HTMLElement>('#management-status')!;
const content = document.querySelector<HTMLElement>('#management-content')!;
const list = document.querySelector<HTMLElement>('#management-list')!;
const day = document.querySelector<HTMLInputElement>('#report-day')!;
const dateControl = document.querySelector<HTMLElement>('#management-date')!;
const previous = document.querySelector<HTMLButtonElement>('#page-prev')!;
const next = document.querySelector<HTMLButtonElement>('#page-next')!;
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-view]'));
let view = new URLSearchParams(location.search).get('view') === 'report' ? 'report' : 'rooms';
let page = 1;
let latest = 0;

async function request<T>(suffix = '', body?: object) {
  const response = await fetch(url + suffix, { cache: 'no-store', ...(body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'ارتباط با سامانه برقرار نشد.');
  return data as T;
}
function error(failure: unknown) {
  status.textContent = failure instanceof Error && failure.name !== 'TypeError' ? failure.message : 'ارتباط با سامانه برقرار نشد.';
}
function line(text: string) {
  const p = document.createElement('p'); p.textContent = text; return p;
}
function roomCard(room: Room) {
  const article = document.createElement('article');
  article.append(line(room.title), line(`${room.owner?.first_name ?? ''} ${room.owner?.last_name ?? ''} · ${room.moderation_disabled ? 'غیرفعال توسط مدیر' : room.published ? 'منتشرشده' : 'پیش‌نویس'}`));
  const actions = document.createElement('div');
  actions.className = 'actions';
  for (const [action, label] of [[room.moderation_disabled ? 'enable' : 'disable', room.moderation_disabled ? 'فعال‌سازی' : 'غیرفعال‌سازی'], ['delete', 'حذف دائمی']]) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'button secondary'; button.textContent = label;
    button.addEventListener('click', async () => {
      if (action === 'delete' && !window.confirm('«' + room.title + '» و داده‌های وابسته برای همیشه حذف شوند؟')) return;
      if (action === 'disable' && !window.confirm('لینک ارائه و دسترسی شرکت‌کنندگان غیرفعال شود؟')) return;
      for (const control of actions.querySelectorAll('button')) control.disabled = true;
      try { await request('', { action, id: room.id }); await load(); }
      catch (failure) { error(failure); }
      finally { for (const control of actions.querySelectorAll('button')) control.disabled = false; }
    });
    actions.append(button);
  }
  if (room.published && !room.moderation_disabled) {
    const roster = document.createElement('div');
    roster.hidden = true;
    roster.setAttribute('aria-live', 'polite');
    const refresh = document.createElement('button');
    refresh.type = 'button'; refresh.className = 'button secondary'; refresh.textContent = 'شرکت‌کنندگان';
    refresh.setAttribute('aria-expanded', 'false');
    async function loadParticipants(action = 'participants', body?: object) {
      refresh.disabled = true;
      for (const control of roster.querySelectorAll('button')) control.disabled = true;
      try {
        const response = await fetch('/erae-tori/api?action=' + action + '&id=' + encodeURIComponent(room.id), {
          cache: 'no-store',
          ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        const result = data as { runId: string; participants: { id: string; name: string; answered: number }[] };
        const rows = document.createElement('ul');
        for (const item of result.participants) {
          const li = document.createElement('li');
          li.className = 'actions';
          const name = document.createElement('span');
          name.textContent = item.name + ' · ' + item.answered.toLocaleString('fa-IR') + ' پاسخ';
          const remove = document.createElement('button');
          remove.type = 'button'; remove.className = 'button secondary'; remove.textContent = 'حذف از این اجرا';
          remove.addEventListener('click', () => {
            if (window.confirm('«' + item.name + '» از این اجرا حذف شود؟')) {
              void loadParticipants('remove-participant', { runId: result.runId, participantId: item.id });
            }
          });
          li.append(name, remove);
          rows.append(li);
        }
        roster.replaceChildren(result.participants.length ? rows : line('هنوز شرکت‌کننده‌ای در این اجرا ثبت نشده است.'));
        status.textContent = '';
      } catch (failure) { error(failure); }
      finally { refresh.disabled = false; for (const control of roster.querySelectorAll('button')) control.disabled = false; }
    }
    refresh.addEventListener('click', () => {
      roster.hidden = false;
      refresh.setAttribute('aria-expanded', 'true');
      refresh.textContent = 'تازه‌سازی شرکت‌کنندگان';
      void loadParticipants();
    });
    actions.append(refresh);
    article.append(actions, roster);
  } else article.append(actions);
  return article;
}
function reportCard(item: Event) {
  const article = document.createElement('article');
  article.append(line(item.attendee_name), line(names[item.service] + ' · ' + item.session_title), line(time.format(new Date(item.created_at))));
  return article;
}
async function load() {
  const serial = ++latest;
  const scope = view;
  status.textContent = 'در حال بارگذاری…';
  dateControl.hidden = scope !== 'report';
  previous.disabled = next.disabled = true;
  buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === scope)));
  list.replaceChildren();
  try {
    const data = await request<{ rooms?: Room[]; rows?: Event[]; more: boolean; day?: string }>(
      '&scope=' + scope + '&page=' + page + (scope === 'report' && day.value ? '&day=' + day.value : ''));
    if (serial !== latest) return;
    const items = scope === 'rooms' ? (data.rooms ?? []).map(roomCard) : (data.rows ?? []).map(reportCard);
    if (!items.length && page > 1) { page--; await load(); return; }
    if (data.day) day.value = data.day;
    list.replaceChildren(...(items.length ? items : [line(scope === 'rooms' ? 'ارائه‌ای برای نمایش وجود ندارد.' : 'برای این روز گزارشی ثبت نشده است.')]));
    previous.disabled = page <= 1;
    next.disabled = !data.more;
    status.textContent = '';
  } catch (failure) { if (serial === latest) error(failure); }
}
buttons.forEach((button) => button.addEventListener('click', () => { view = button.dataset.view!; page = 1; void load(); }));
day.addEventListener('change', () => { page = 1; void load(); });
previous.addEventListener('click', () => { page--; void load(); });
next.addEventListener('click', () => { page++; void load(); });
void request<{ canManage: boolean }>('&scope=access').then((result) => {
  if (!result.canManage) {
    status.textContent = 'این بخش مخصوص مدیر IEAUM است.';
    document.querySelector<HTMLElement>('#management-login')!.hidden = false;
    return;
  }
  content.hidden = false;
  void load();
}).catch(error);
