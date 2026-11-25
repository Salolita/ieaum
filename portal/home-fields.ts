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
} as const;
export type HomeField = keyof typeof homeFields;
export type HomeContent = Partial<Record<HomeField, string>>;
export const homeFieldKeys = Object.keys(homeFields) as HomeField[];
export const longHomeField = (key: HomeField) => key.endsWith('Text') || ['heroIntro', 'entryGuide'].includes(key);
export const homeFieldLimit = (key: HomeField) => longHomeField(key) ? 600 : 120;
