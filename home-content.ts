import { homeFieldKeys, homeFields, homeFieldLimit, longHomeField, type HomeContent } from './portal/home-fields';
const endpoint = '/api/account?siteContent=1';
const edit = document.querySelector<HTMLButtonElement>('#edit-home')!;
const dialog = document.querySelector<HTMLDialogElement>('#home-editor')!;
const form = document.querySelector<HTMLFormElement>('#home-editor-form')!;
const fields = document.querySelector<HTMLElement>('#home-editor-fields')!;
const status = document.querySelector<HTMLElement>('#home-editor-error')!;
const loading = document.querySelector<HTMLElement>('#home-content-status')!;
const loadingMessage = document.querySelector<HTMLElement>('#home-content-message')!;
const retry = document.querySelector<HTMLButtonElement>('#retry-home-content')!;
let revision = 0;

function render(content: HomeContent) {
  for (const key of homeFieldKeys) {
    const value = content[key];
    const node = document.querySelector<HTMLElement>(`[data-content="${key}"]`);
    if (node) node.textContent = typeof value === 'string' ? value : '';
  }
  document.title = content.heroTitle && content.heroSubtitle ? `IEAUM | ${content.heroTitle} ${content.heroSubtitle}` : 'IEAUM';
}

export async function refreshHomeContent() {
  const request = ++revision;
  edit.hidden = true;
  retry.hidden = true;
  loadingMessage.textContent = 'در حال دریافت محتوای صفحه…';
  try {
    const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (!homeFieldKeys.every((key) => typeof result?.content?.[key] === 'string')) throw new Error();
    if (request !== revision) return;
    render(result.content);
    loading.hidden = true;
    edit.hidden = result.canEdit !== true;
  } catch {
    if (request !== revision || loading.hidden) return;
    loadingMessage.textContent = 'دریافت محتوای صفحه انجام نشد.';
    retry.hidden = false;
  }
}

retry.addEventListener('click', () => { void refreshHomeContent(); });
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) return;
  revision++;
  render({});
  edit.hidden = true;
  loading.hidden = false;
  retry.hidden = true;
  loadingMessage.textContent = 'در حال دریافت محتوای صفحه…';
  if (dialog.open) dialog.close();
});

edit.addEventListener('click', () => {
  fields.replaceChildren();
  status.textContent = '';
  for (const key of homeFieldKeys) {
    const label = document.createElement('label');
    const input = document.createElement(longHomeField(key) ? 'textarea' : 'input');
    input.name = key;
    input.required = true;
    input.maxLength = homeFieldLimit(key);
    input.value = document.querySelector(`[data-content="${key}"]`)?.textContent ?? '';
    label.append(homeFields[key], input);
    fields.append(label);
  }
  dialog.showModal();
});
document.querySelector('#close-home-editor')!.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => fields.replaceChildren());
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const buttons = Array.from(form.querySelectorAll('button'));
  buttons.forEach((button) => { button.disabled = true; });
  status.textContent = '';
  try {
    const response = await fetch(endpoint, {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'site-content:replace', content: Object.fromEntries(new FormData(form)) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'ذخیرهٔ محتوا انجام نشد.');
    revision++;
    render(result.content);
    loading.hidden = true;
    edit.hidden = false;
    dialog.close();
  } catch (error) { status.textContent = error instanceof Error ? error.message : 'ذخیرهٔ محتوا انجام نشد.'; }
  finally { buttons.forEach((button) => { button.disabled = false; }); }
});
