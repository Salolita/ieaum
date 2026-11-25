import { contactLimits, contactUrl, defaultContacts, type ContactContent } from '../portal/contact-content';

const endpoint = '/api/account?siteContent=contacts';
const title = document.querySelector<HTMLElement>('#contact-title')!;
const groups = document.querySelector<HTMLElement>('#contact-groups')!;
const edit = document.querySelector<HTMLButtonElement>('#edit-contacts')!;
const editor = document.querySelector<HTMLDialogElement>('#contact-editor')!;
const form = document.querySelector<HTMLFormElement>('#contact-editor-form')!;
const fields = document.querySelector<HTMLElement>('#contact-editor-fields')!;
const error = document.querySelector<HTMLElement>('#contact-editor-error')!;
const save = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
const close = document.querySelector<HTMLButtonElement>('#close-contact-editor')!;
let current = defaultContacts;
let draft = structuredClone(current);
let saving = false;

function display(content: ContactContent) {
  title.textContent = content.title;
  document.title = content.title + ' | IEAUM';
  groups.replaceChildren(...content.groups.map((group) => {
    const section = document.createElement('section');
    section.className = 'contact-group';
    const heading = document.createElement('h2');
    heading.textContent = group.title;
    const items = document.createElement('ul');
    for (const entry of group.links) {
      const url = contactUrl(entry.url);
      if (!url) continue;
      const item = document.createElement('li');
      const link = document.createElement('a');
      const label = document.createElement('bdi');
      link.href = url;
      label.textContent = entry.label;
      link.append(label);
      item.append(link);
      items.append(item);
    }
    section.append(heading, items);
    return section;
  }));
}

function input(label: string, value: string, max: number, change: (value: string) => void, url = false) {
  const field = document.createElement('label');
  const control = document.createElement('input');
  field.append(label, control);
  control.value = value;
  control.maxLength = max;
  control.required = true;
  if (url) { control.dir = 'ltr'; control.inputMode = 'url'; control.placeholder = 'https://'; }
  control.addEventListener('input', () => change(control.value));
  return field;
}

function button(label: string, action: () => void, disabled = false) {
  const control = document.createElement('button');
  control.className = 'button secondary';
  control.type = 'button';
  control.textContent = label;
  control.disabled = disabled;
  control.addEventListener('click', () => { action(); renderFields(); });
  return control;
}

function renderFields() {
  fields.replaceChildren(input('عنوان صفحه', draft.title, contactLimits.title, (value) => { draft.title = value; }));
  draft.groups.forEach((group, index) => {
    const groupFields = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = group.title || 'راه ارتباطی جدید';
    groupFields.append(legend, input('عنوان راه ارتباطی', group.title, contactLimits.title, (value) => { group.title = value; }));
    group.links.forEach((link, linkIndex) => {
      const row = document.createElement('div');
      row.className = 'contact-editor-link';
      row.append(
        input('متن لینک', link.label, contactLimits.label, (value) => { link.label = value; }),
        input('نشانی لینک', link.url, contactLimits.url, (value) => { link.url = value; }, true),
        button('حذف لینک', () => { group.links.splice(linkIndex, 1); }, group.links.length <= 1),
      );
      groupFields.append(row);
    });
    const controls = document.createElement('div');
    controls.className = 'actions';
    controls.append(
      button('افزودن لینک', () => { group.links.push({ label: '', url: '' }); }, group.links.length >= contactLimits.links),
      button('حذف راه ارتباطی', () => { draft.groups.splice(index, 1); }, draft.groups.length <= 1),
    );
    groupFields.append(controls);
    fields.append(groupFields);
  });
  fields.append(button('افزودن راه ارتباطی', () => {
    draft.groups.push({ title: '', links: [{ label: '', url: '' }] });
  }, draft.groups.length >= contactLimits.groups));
}

edit.addEventListener('click', () => {
  draft = structuredClone(current);
  error.textContent = '';
  renderFields();
  editor.showModal();
});
close.addEventListener('click', () => editor.close());
editor.addEventListener('cancel', (event) => { if (saving) event.preventDefault(); });

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving) return;
  saving = save.disabled = close.disabled = fields.inert = true;
  error.textContent = '';
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'site-contacts:replace', content: draft }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'ذخیره انجام نشد. دوباره تلاش کنید.');
    current = result.content;
    display(current);
    editor.close();
  } catch (failure) {
    error.textContent = failure instanceof Error ? failure.message : 'ذخیره انجام نشد. دوباره تلاش کنید.';
  } finally { saving = save.disabled = close.disabled = fields.inert = false; }
});

void fetch(endpoint).then(async (response) => {
  if (!response.ok) return;
  const result = await response.json();
  current = result.content;
  display(current);
  edit.hidden = result.canEdit !== true;
}).catch(() => { /* Keep the built-in contact details during an outage. */ });

void fetch('/api/account', { cache: 'no-store' }).then(async (response) => {
  if (!response.ok) return;
  const result = await response.json();
  if (result.profile) document.querySelector('[data-panel-label]')!.textContent = 'نمایه من';
}).catch(() => {});
