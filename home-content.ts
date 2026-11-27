import { homeFieldKeys, homeFields, homeFieldLimit, homeLink, homeSectionPlaces, homeServiceFields, homeServiceLimits, homeServices, longHomeField, maxHomeSections, maxHomeServices, readHomeSections, readHomeServices, type HomeContent, type HomeSection, type HomeService } from './portal/home-fields';
const endpoint = '/api/account?siteContent=1';
const edit = document.querySelector<HTMLButtonElement>('#edit-home')!;
const dialog = document.querySelector<HTMLDialogElement>('#home-editor')!;
const form = document.querySelector<HTMLFormElement>('#home-editor-form')!;
const fields = document.querySelector<HTMLElement>('#home-editor-fields')!;
const status = document.querySelector<HTMLElement>('#home-editor-error')!;
const loading = document.querySelector<HTMLElement>('#home-content-status')!;
const loadingMessage = document.querySelector<HTMLElement>('#home-content-message')!;
const retry = document.querySelector<HTMLButtonElement>('#retry-home-content')!;
const cards = document.querySelector<HTMLElement>('#home-services')!;
const cardEditor = document.querySelector<HTMLElement>('#home-service-editor')!;
const addCard = document.querySelector<HTMLButtonElement>('#add-home-service')!;
const sectionEditor = document.querySelector<HTMLElement>('#home-section-editor')!;
const addSection = document.querySelector<HTMLButtonElement>('#add-home-section')!;
const cardKeys = Object.keys(homeServiceFields) as (keyof HomeService)[];
let content: HomeContent = {};
let draft: HomeService[] = [];
let sectionDraft: HomeSection[] = [];
let revision = 0;

function renderCards(services: HomeService[]) {
  cards.replaceChildren(...services.map((service) => {
    const card = document.createElement('article');
    card.className = 'service';
    const top = document.createElement('div');
    top.className = 'service-top';
    const icon = document.createElement('span');
    icon.className = 'service-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = service.icon;
    const kind = document.createElement('span');
    kind.className = 'service-kind';
    kind.textContent = service.kind;
    if (service.icon) top.append(icon);
    if (service.kind) top.append(kind);
    const title = document.createElement('h3');
    title.textContent = service.title;
    if (service.detail) {
      const detail = document.createElement('bdi');
      detail.textContent = service.detail;
      title.append(' ', detail);
    }
    const text = document.createElement('p');
    text.textContent = service.text;
    const link = document.createElement('a');
    link.href = homeLink(service.href) ?? '/';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const label = document.createElement('span');
    if (service.href === '/panel/' && service.action === 'ورود به پنل') {
      label.dataset.panelLabel = '';
      label.textContent = document.documentElement.dataset.signedIn === 'true' ? 'نمایه من' : service.action;
    } else label.textContent = service.action;
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    link.append(label, ' ', arrow);
    if (top.childElementCount) card.append(top);
    card.append(title);
    if (service.text) card.append(text);
    card.append(link);
    return card;
  }));
}

function renderCardEditor() {
  addCard.disabled = draft.length >= maxHomeServices;
  cardEditor.replaceChildren(...draft.map((service, index) => {
    const group = document.createElement('fieldset');
    const title = document.createElement('legend');
    title.textContent = 'سرویس ' + (index + 1).toLocaleString('fa-IR');
    group.append(title);
    for (const key of cardKeys) {
      const label = document.createElement('label');
      const input = document.createElement(key === 'text' ? 'textarea' : 'input');
      input.required = ['title', 'action', 'href'].includes(key);
      input.maxLength = homeServiceLimits[key];
      input.value = service[key];
      if (key === 'href') { input.dir = 'ltr'; input.inputMode = 'url'; }
      input.addEventListener('input', () => { service[key] = input.value; });
      label.append(homeServiceFields[key], input);
      group.append(label);
    }
    const actions = document.createElement('div');
    actions.className = 'actions';
    const button = (text: string, action: () => void, disabled = false) => {
      const control = document.createElement('button');
      control.className = 'button secondary';
      control.type = 'button';
      control.textContent = text;
      control.disabled = disabled;
      control.addEventListener('click', () => { action(); renderCardEditor(); });
      return control;
    };
    const move = (offset: number) => { draft.splice(index, 1); draft.splice(index + offset, 0, service); };
    actions.append(button('بالاتر', () => move(-1), index === 0),
      button('پایین‌تر', () => move(1), index === draft.length - 1),
      button('حذف سرویس', () => { draft.splice(index, 1); }));
    group.append(actions);
    return group;
  }));
}

addCard.addEventListener('click', () => {
  if (draft.length >= maxHomeServices) return;
  draft.push({ icon: '', kind: '', title: '', detail: '', text: '', action: '', href: '' });
  renderCardEditor();
  cardEditor.querySelectorAll('fieldset').item(draft.length - 1)?.querySelector('input')?.focus();
});

function renderSectionEditor() {
  addSection.disabled = sectionDraft.length >= maxHomeSections;
  sectionEditor.replaceChildren(...sectionDraft.map((section, index) => {
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = 'بخش متنی ' + (index + 1).toLocaleString('fa-IR');
    const placement = document.createElement('label');
    const select = document.createElement('select');
    for (const [value, label] of Object.entries(homeSectionPlaces)) select.add(new Option(label, value));
    select.value = section.place;
    select.addEventListener('change', () => { section.place = select.value as HomeSection['place']; });
    placement.append('جایگاه بخش', select);
    group.append(legend, placement);
    for (const key of ['title', 'text'] as const) {
      const label = document.createElement('label');
      const input = document.createElement(key === 'title' ? 'input' : 'textarea');
      input.value = section[key];
      input.required = true;
      input.maxLength = key === 'title' ? 120 : 600;
      input.addEventListener('input', () => { section[key] = input.value; });
      label.append(key === 'title' ? 'عنوان بخش' : 'متن بخش', input);
      group.append(label);
    }
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'button secondary'; remove.textContent = 'حذف بخش';
    remove.addEventListener('click', () => { sectionDraft.splice(index, 1); renderSectionEditor(); });
    group.append(remove);
    return group;
  }));
}

addSection.addEventListener('click', () => {
  if (sectionDraft.length >= maxHomeSections) return;
  sectionDraft.push({ place: 'about', title: '', text: '' });
  renderSectionEditor();
  sectionEditor.querySelector<HTMLInputElement>('fieldset:last-child input')?.focus();
});

function render(next: HomeContent) {
  content = next;
  renderCards(next.heroTitle ? homeServices(next) : []);
  const sections = readHomeSections(next.sections) ?? [];
  for (const container of document.querySelectorAll<HTMLElement>('[data-home-sections]')) {
    container.replaceChildren(...sections.filter((section) => section.place === container.dataset.homeSections).map((section) => {
      const block = document.createElement('section');
      block.className = 'about';
      const title = document.createElement('h2');
      title.textContent = section.title;
      const text = document.createElement('p');
      text.textContent = section.text;
      block.append(title, text);
      return block;
    }));
  }
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
    if (!homeFieldKeys.every((key) => key === 'commentsTitle' || typeof result?.content?.[key] === 'string')) throw new Error();
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
  draft = homeServices(content).map((service) => ({ ...service }));
  sectionDraft = (readHomeSections(content.sections) ?? []).map((section) => ({ ...section }));
  renderCardEditor();
  renderSectionEditor();
  for (const key of homeFieldKeys) {
    if (/^(solver|bot|panel|presentation)(Title|Text)$/.test(key)) continue;
    const label = document.createElement('label');
    const input = document.createElement(longHomeField(key) ? 'textarea' : 'input');
    input.name = key;
    input.required = true;
    input.maxLength = homeFieldLimit(key);
    input.value = content[key] ?? (key === 'commentsTitle' ? 'نظرات' : '');
    label.append(homeFields[key], input);
    fields.append(label);
  }
  dialog.showModal();
});
document.querySelector('#close-home-editor')!.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { fields.replaceChildren(); cardEditor.replaceChildren(); sectionEditor.replaceChildren(); });
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const buttons = Array.from(form.querySelectorAll('button'));
  buttons.forEach((button) => { button.disabled = true; });
  status.textContent = '';
  try {
    const services = readHomeServices(draft);
    if (!services) throw new Error('عنوان، متن دکمه و نشانی داخلی یا HTTPS هر سرویس را بررسی کنید.');
    const sections = readHomeSections(sectionDraft);
    if (!sections) throw new Error('عنوان و متن بخش‌ها را کامل کنید.');
    const legacy = { ...content };
    for (const [index, prefix] of ['solver', 'bot', 'panel', 'presentation'].entries()) {
      // Old deployments still understand the original flat fields.
      const service = services.find(({ href }) => href === homeServices({})[index].href);
      if (service?.title) Object.assign(legacy, { [prefix + 'Title']: service.title, ...(service.text ? { [prefix + 'Text']: service.text } : {}) });
    }
    const response = await fetch(endpoint, {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'site-content:replace', content: { ...legacy, ...Object.fromEntries(new FormData(form)), services, sections } }),
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
