import './site-comments.css';
import { CommentsError, commentsRequest, submitComment,
  type Comment, type CommentAccess, type CommentDraft, type CommentPage, type CommentView as View,
} from './site-comments-client';
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
let cacheVersion = 0;
let sessionVersion = 0;
let access: CommentAccess = { canComment: false, canManage: false };
let pendingDraft: CommentDraft | undefined;
const views: View[] = ['public', 'mine', 'manage'];
const pageSize = 15;
const cacheMs = 30_000;
const cache = new Map<string, { data: CommentPage; expires: number }>();
const pageKey = (scope: View, target: number) => scope + ':' + target;

function savePage(scope: View, target: number, data: CommentPage, ttl = cacheMs) {
  cache.set(pageKey(scope, target), { data, expires: Date.now() + ttl });
  if (cache.size > 12) cache.delete(cache.keys().next().value!);
}

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
      await commentsRequest('', { action: 'delete', id: comment.id });
      updateLists(comment.id);
      feedback.textContent = 'نظر حذف شد.';
    } catch (error) { report(error); }
    finally { remove.disabled = save.disabled = false; }
  });
  editor.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = remove.disabled = true;
    try {
      const saved = await commentsRequest<{ comment: Comment }>('', { action: 'reply', id: comment.id, message: message.value });
      updateLists(comment.id, saved.comment);
      feedback.textContent = 'پاسخ ثبت شد.';
    } catch (error) { report(error); }
    finally { save.disabled = remove.disabled = false; }
  });
  actions.append(respond, remove);
  article.append(actions, editor);
  return article;
}

function controls(ready = true) {
  form.hidden = !access.canComment;
  signIn.hidden = !ready || access.canComment;
  for (const button of buttons) {
    const scope = button.dataset.commentView;
    button.setAttribute('aria-pressed', String(scope === view));
    if (scope === 'mine') button.hidden = !access.canComment;
    if (scope === 'manage') button.hidden = !access.canManage;
  }
}

function display(data: CommentPage) {
  list.replaceChildren(...(data.comments.length ? data.comments.map(card) : [paragraph('هنوز نظری در این فهرست ثبت نشده است.')]));
  pages.hidden = page === 1 && !data.hasNext;
  previous.disabled = page === 1;
  next.disabled = !data.hasNext;
  pageLabel.textContent = 'صفحهٔ ' + numbers.format(page);
}

function showListError(retry: () => void, cached?: CommentPage) {
  const button = actionButton('تلاش دوباره');
  button.addEventListener('click', retry, { once: true });
  const notice = document.createElement('div');
  notice.className = 'comments-views';
  notice.append(paragraph('بارگذاری نظرات انجام نشد.'), button);
  if (cached) list.append(notice);
  else list.replaceChildren(notice);
}

async function load(scope: View, target: number, refresh = false) {
  const sequence = ++requestNumber;
  const version = cacheVersion;
  view = scope;
  page = target;
  controls();
  const saved = cache.get(pageKey(scope, target));
  if (saved) display(saved.data);
  if (saved && !refresh && saved.expires > Date.now()) {
    list.removeAttribute('aria-busy');
    return;
  }
  if (!saved) {
    list.replaceChildren(paragraph('در حال دریافت نظرات…'));
    pages.hidden = true;
  }
  list.setAttribute('aria-busy', 'true');
  try {
    const result = await commentsRequest<CommentPage & CommentAccess>('&scope=' + scope + '&page=' + target);
    if (version !== cacheVersion || sequence !== requestNumber) return;
    access = result;
    if (!access.canComment) {
      for (const key of cache.keys()) if (!key.startsWith('public:')) cache.delete(key);
    }
    if (!access.canManage) {
      for (const key of cache.keys()) if (key.startsWith('manage:')) cache.delete(key);
    }
    if (!result.comments.length && target > 1) { await load(scope, target - 1, true); return; }
    savePage(scope, target, result);
    controls();
    display(result);
  } catch (error) {
    if (version !== cacheVersion || sequence !== requestNumber) return;
    if (scope !== 'public' && error instanceof CommentsError && [401, 403].includes(error.status)) {
      await bootstrap();
    } else showListError(() => void load(scope, target, true), saved?.data);
  } finally { if (sequence === requestNumber) list.removeAttribute('aria-busy'); }
}

async function bootstrap() {
  const sequence = ++requestNumber;
  cacheVersion++;
  sessionVersion++;
  cache.clear();
  access = { canComment: false, canManage: false };
  view = 'public';
  page = 1;
  controls(false);
  pages.hidden = true;
  list.replaceChildren(paragraph('در حال دریافت نظرات…'));
  list.setAttribute('aria-busy', 'true');
  try {
    const result = await commentsRequest<CommentAccess & { lists: Partial<Record<View, CommentPage>> }>('&scope=bootstrap');
    if (sequence !== requestNumber) return;
    access = result;
    for (const scope of views) {
      const first = result.lists[scope];
      if (first) savePage(scope, 1, first);
    }
    controls();
    await load('public', 1);
  } catch {
    if (sequence === requestNumber) await load('public', 1);
  } finally { if (sequence === requestNumber) list.removeAttribute('aria-busy'); }
}

function updateLists(id: string, replacement?: Comment) {
  cacheVersion++;
  for (const saved of cache.values()) {
    saved.data = { ...saved.data, comments: saved.data.comments.flatMap((item) =>
      item.id !== id ? [item] : replacement ? [replacement] : []),
    };
    if (!replacement) saved.expires = 0;
  }
  const current = cache.get(pageKey(view, page));
  if (current) {
    display(current.data);
    list.removeAttribute('aria-busy');
  } else void load(view, page, true);
}

function showSubmission(comment: Comment) {
  cacheVersion++;
  const scope: View = comment.visibility === 'private' ? 'mine' : 'public';
  for (const key of cache.keys()) if (!key.endsWith(':1')) cache.delete(key);
  const tabs: View[] = access.canManage ? [scope, 'manage'] : [scope];
  for (const tab of tabs) {
    const existing = cache.get(pageKey(tab, 1));
    const comments = [comment, ...(existing?.data.comments.filter((item) => item.id !== comment.id) ?? [])];
    savePage(tab, 1, { comments: comments.slice(0, pageSize), hasNext: Boolean(existing?.data.hasNext || comments.length > pageSize) },
      existing ? Math.max(0, existing.expires - Date.now()) : 0);
  }
  void load(scope, 1);
}

for (const button of buttons) button.addEventListener('click', () => { void load(button.dataset.commentView as View, 1); });
previous.addEventListener('click', () => { if (page > 1) void load(view, page - 1); });
next.addEventListener('click', () => void load(view, page + 1));
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submit.disabled) return;
  const data = new FormData(form);
  const visibility = data.get('visibility');
  const text = String(data.get('message') ?? '').trim();
  if (!text || (visibility !== 'public' && visibility !== 'private')) {
    feedback.textContent = 'شیوهٔ ارسال و متن نظر را وارد کنید.';
    return;
  }
  const version = sessionVersion;
  const retry = pendingDraft?.message === text && pendingDraft.visibility === visibility;
  const draft = retry ? pendingDraft! : { id: crypto.randomUUID(), visibility, message: text } as const;
  pendingDraft = draft;
  submit.disabled = true;
  feedback.textContent = 'در حال ثبت نظر…';
  try {
    const saved = await submitComment(draft, retry, () => {
      if (version === sessionVersion) feedback.textContent = 'در حال بررسی ثبت نظر…';
    });
    if (version !== sessionVersion) return;
    const current = new FormData(form);
    if (current.get('message') === data.get('message') && current.get('visibility') === visibility) form.reset();
    pendingDraft = undefined;
    feedback.textContent = visibility === 'private' ? 'پیام خصوصی برای مدیر ثبت شد.' : 'نظر شما منتشر شد.';
    showSubmission(saved);
  } catch (error) { if (version === sessionVersion) report(error); }
  finally { submit.disabled = false; }
});

window.addEventListener('ieaum:session-ready', () => { pendingDraft = undefined; void bootstrap(); });
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  pendingDraft = undefined;
  form.reset();
  feedback.textContent = '';
  void bootstrap();
});
void bootstrap();
