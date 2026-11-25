import './site-comments.css';

type View = 'public' | 'mine' | 'manage';
type Comment = {
  id: string; author_name: string; visibility: 'public' | 'private';
  message: string; admin_reply: string | null; created_at: string;
};
type Comments = { comments: Comment[]; canComment: boolean; canManage: boolean; hasNext: boolean };

const endpoint = '/api/account?siteComments=1';
const list = document.querySelector<HTMLElement>('#comments-list')!;
const feedback = document.querySelector<HTMLElement>('#comments-feedback')!;
const form = document.querySelector<HTMLFormElement>('#comment-form')!;
const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const signIn = document.querySelector<HTMLElement>('#comments-signin')!;
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-comment-view]'));
const pages = document.querySelector<HTMLElement>('.comments-pages')!;
const previous = document.querySelector<HTMLButtonElement>('#comments-prev')!;
const next = document.querySelector<HTMLButtonElement>('#comments-next')!;
const pageLabel = document.querySelector<HTMLElement>('#comments-page')!;
const dateFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeZone: 'Asia/Tehran' });
const numbers = new Intl.NumberFormat('fa-IR');
let view: View = 'public';
let page = 1;
let requestNumber = 0;

function paragraph(text: string, className?: string) {
  const p = document.createElement('p');
  if (className) p.className = className;
  p.textContent = text;
  return p;
}

function actionButton(label: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button secondary';
  button.textContent = label;
  return button;
}

async function json<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'ارتباط با بخش نظرات برقرار نشد.');
  return body;
}

async function change(body: object) {
  await json(await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}

function report(failure: unknown) {
  feedback.textContent = failure instanceof Error ? failure.message : 'انجام درخواست ممکن نشد.';
}

function card(comment: Comment) {
  const article = document.createElement('article');
  article.className = 'comment-card';
  const name = document.createElement('bdi');
  name.textContent = comment.author_name;
  const date = document.createElement('time');
  date.dateTime = comment.created_at;
  date.textContent = dateFormat.format(new Date(comment.created_at));
  const details = document.createElement('div');
  details.className = 'comment-meta';
  details.append(name, date);
  if (view === 'manage') details.append(paragraph(comment.visibility === 'private' ? 'خصوصی' : 'عمومی'));
  article.append(details, paragraph(comment.message, 'comment-message'));
  if (comment.admin_reply) {
    const answer = document.createElement('div');
    answer.className = 'comment-answer';
    answer.append(paragraph('پاسخ مدیر'), paragraph(comment.admin_reply, 'comment-message'));
    article.append(answer);
  }
  if (view !== 'manage') return article;

  const actions = document.createElement('div');
  actions.className = 'comments-views';
  const respond = actionButton(comment.admin_reply ? 'ویرایش پاسخ' : 'پاسخ');
  const remove = actionButton('حذف نظر');
  const editor = document.createElement('form');
  editor.hidden = true;
  const label = document.createElement('label');
  label.textContent = 'پاسخ مدیر';
  const message = document.createElement('textarea');
  message.rows = 3;
  message.required = true;
  message.maxLength = 1200;
  message.value = comment.admin_reply ?? '';
  label.append(message);
  const save = actionButton('ثبت پاسخ');
  save.type = 'submit';
  editor.append(label, save);
  respond.addEventListener('click', () => { editor.hidden = !editor.hidden; if (!editor.hidden) message.focus(); });
  remove.addEventListener('click', async () => {
    if (!window.confirm('این نظر و پاسخ آن حذف شوند؟')) return;
    remove.disabled = save.disabled = true;
    try {
      await change({ action: 'delete', id: comment.id });
      feedback.textContent = 'نظر حذف شد.';
      await load('manage', page);
    } catch (error) { report(error); }
    finally { remove.disabled = save.disabled = false; }
  });
  editor.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = remove.disabled = true;
    try {
      await change({ action: 'reply', id: comment.id, message: message.value });
      feedback.textContent = 'پاسخ ثبت شد.';
      await load('manage', page);
    } catch (error) { report(error); }
    finally { save.disabled = remove.disabled = false; }
  });
  actions.append(respond, remove);
  article.append(actions, editor);
  return article;
}

async function load(scope: View, target: number) {
  const sequence = ++requestNumber;
  list.setAttribute('aria-busy', 'true');
  try {
    const result = await json<Comments>(await fetch(endpoint + '&scope=' + scope + '&page=' + target, { cache: 'no-store' }));
    if (sequence !== requestNumber) return;
    if (!result.comments.length && target > 1) { await load(scope, target - 1); return; }
    view = scope;
    page = target;
    form.hidden = !result.canComment;
    signIn.hidden = result.canComment;
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.commentView === view));
      if (button.dataset.commentView === 'mine') button.hidden = !result.canComment;
      if (button.dataset.commentView === 'manage') button.hidden = !result.canManage;
    }
    list.replaceChildren(...(result.comments.length ? result.comments.map(card) : [paragraph('هنوز نظری در این فهرست ثبت نشده است.')]));
    pages.hidden = page === 1 && !result.hasNext;
    previous.disabled = page === 1;
    next.disabled = !result.hasNext;
    pageLabel.textContent = 'صفحهٔ ' + numbers.format(page);
  } catch (error) {
    if (sequence !== requestNumber) return;
    if (sequence === 1) list.replaceChildren(paragraph('بخش نظرات فعلاً در دسترس نیست.'));
    else report(error);
  } finally { if (sequence === requestNumber) list.removeAttribute('aria-busy'); }
}

for (const button of buttons) button.addEventListener('click', () => {
  feedback.textContent = '';
  void load(button.dataset.commentView as View, 1);
});
previous.addEventListener('click', () => { if (page > 1) void load(view, page - 1); });
next.addEventListener('click', () => void load(view, page + 1));
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const { visibility, message } = Object.fromEntries(new FormData(form));
  submit.disabled = true;
  feedback.textContent = '';
  try {
    await change({ action: 'submit', visibility, message });
    form.reset();
    feedback.textContent = visibility === 'private' ? 'پیام خصوصی برای مدیر ثبت شد.' : 'نظر شما منتشر شد.';
    await load(visibility === 'private' ? 'mine' : 'public', 1);
  } catch (error) { report(error); }
  finally { submit.disabled = false; }
});
window.addEventListener('ieaum:session-ready', () => { void load('public', 1); });
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  list.replaceChildren();
  form.reset();
  form.hidden = signIn.hidden = true;
  feedback.textContent = '';
  buttons.filter((button) => button.dataset.commentView !== 'public').forEach((button) => { button.hidden = true; });
  pages.hidden = true;
  void load('public', 1);
});
void load('public', 1);
