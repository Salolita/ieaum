export const homeFields = {
  heroLabel: 'معرفی بالای عنوان',
  heroTitle: 'عنوان اصلی',
  heroSubtitle: 'زیرعنوان اصلی',
  heroIntro: 'متن معرفی',
  entryGuide: 'راهنمای ورود',
  servicesTitle: 'عنوان سرویس‌ها',
  solverTitle: 'عنوان نامرالب',
  solverText: 'معرفی نامرالب',
  botTitle: 'عنوان ربات',
  botText: 'معرفی ربات',
  panelTitle: 'عنوان پنل',
  panelText: 'معرفی پنل',
  presentationTitle: 'عنوان ارائه‌طوری',
  presentationText: 'معرفی ارائه‌طوری',
  aboutTitle: 'عنوان دربارهٔ ما',
  aboutText: 'متن دربارهٔ ما',
  footerText: 'متن فوتر',
  commentsTitle: 'عنوان بخش نظرات',
} as const;
export type HomeField = keyof typeof homeFields;
export type HomeService = {
  icon: string; kind: string; title: string; detail: string; text: string; action: string; href: string;
};
export const homeServiceFields = {
  icon: 'نشان سرویس', kind: 'دسته‌بندی', title: 'عنوان', detail: 'نام کوتاه یا انگلیسی',
  text: 'توضیحات', action: 'متن دکمه', href: 'نشانی لینک',
} as const;
export const homeServiceLimits = { icon: 12, kind: 60, title: 120, detail: 60, text: 600, action: 100, href: 300 };
export const maxHomeServices = 16;
export const homeSectionPlaces = { intro: 'بعد از معرفی', services: 'بعد از سرویس‌ها', about: 'بعد از دربارهٔ ما' } as const;
export type HomeSection = { place: keyof typeof homeSectionPlaces; title: string; text: string };
export const maxHomeSections = 6;
export type HomeContent = Partial<Record<HomeField, string>> & { services?: HomeService[]; sections?: HomeSection[] };

export function readHomeSections(input: unknown): HomeSection[] | null {
  if (!Array.isArray(input) || input.length > maxHomeSections) return null;
  const output: HomeSection[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || !Object.hasOwn(homeSectionPlaces, item.place)
      || typeof item.title !== 'string' || typeof item.text !== 'string') return null;
    const title = item.title.trim();
    const text = item.text.trim();
    if (!title || title.length > 120 || !text || text.length > 600) return null;
    output.push({ place: item.place, title, text });
  }
  return output;
}

export function homeLink(value: string) {
  if (!value || /[\s\\\p{C}]/u.test(value) || value.length > homeServiceLimits.href) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function readHomeServices(input: unknown): HomeService[] | null {
  if (!Array.isArray(input) || input.length > maxHomeServices) return null;
  const output: HomeService[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const service = {} as HomeService;
    for (const key of Object.keys(homeServiceFields) as (keyof HomeService)[]) {
      const value = item[key];
      if (typeof value !== 'string' || value.trim().length > homeServiceLimits[key]) return null;
      service[key] = value.trim();
    }
    if (!service.title || !service.action || !homeLink(service.href)) return null;
    output.push(service);
  }
  return output;
}

export function homeServices(content: HomeContent): HomeService[] {
  return readHomeServices(content.services) ?? [
    { icon: 'ƒ', kind: 'محاسبات عددی', title: content.solverTitle ?? '', detail: 'Numralab', text: content.solverText ?? '', action: 'ورود به نامرالب', href: 'https://numeralab.ieaum.ir/' },
    { icon: '➤', kind: 'ارتباط', title: content.botTitle ?? '', detail: '@ieaumbot', text: content.botText ?? '', action: 'باز کردن در تلگرام', href: 'https://t.me/ieaumbot' },
    { icon: '▤', kind: 'آموزش و ارزیابی', title: content.panelTitle ?? '', detail: '', text: content.panelText ?? '', action: 'ورود به پنل', href: '/panel/' },
    { icon: '▣', kind: 'ارائهٔ کلاسی', title: content.presentationTitle ?? '', detail: '', text: content.presentationText ?? '', action: 'ورود به ارائه‌طوری', href: '/erae-tori/' },
  ];
}
export const homeFieldKeys = Object.keys(homeFields) as HomeField[];
export const longHomeField = (key: HomeField) => key.endsWith('Text') || ['heroIntro', 'entryGuide'].includes(key);
export const homeFieldLimit = (key: HomeField) => longHomeField(key) ? 600 : 120;
