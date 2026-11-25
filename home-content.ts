import { homeFieldKeys, homeFields, homeFieldLimit, longHomeField, type HomeContent } from './portal/home-fields';
const endpoint = '/api/account?siteContent=1';
const edit = document.querySelector<HTMLButtonElement>('#edit-home')!;
const dialog = document.querySelector<HTMLDialogElement>('#home-editor')!;
const form = document.querySelector<HTMLFormElement>('#home-editor-form')!;
const fields = document.querySelector<HTMLElement>('#home-editor-fields')!;
const status = document.querySelector<HTMLElement>('#home-editor-error')!;

function render(content: HomeContent) {
  for (const key of homeFieldKeys) {
    const value = content[key];
    const node = document.querySelector<HTMLElement>(`[data-content="${key}"]`);
    if (node && typeof value === 'string') node.textContent = value;
  }
}

export async function refreshHomeContent() {
  edit.hidden = true;
  const response = await fetch(endpoint, { cache: 'no-store' });
  if (!response.ok) return;
  const result = await response.json();
  render(result.content ?? {});
  edit.hidden = result.canEdit !== true;
}

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
    render(result.content);
    dialog.close();
  } catch (error) { status.textContent = error instanceof Error ? error.message : 'ذخیرهٔ محتوا انجام نشد.'; }
  finally { buttons.forEach((button) => { button.disabled = false; }); }
});
