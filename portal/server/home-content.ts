import { homeFieldKeys, homeFieldLimit, readHomeSections, readHomeServices, type HomeContent } from '../home-fields.js';
import { admins } from './account-review.js';
import { currentProfile, limit, query, reply, supabase } from './portal-store.js';

const defaultHomeContent = {
  heroLabel: 'درگاه دانشجویی مهندسی صنایع',
  heroTitle: 'مهندسان صنایع',
  heroSubtitle: 'دانشگاه آزاد مشهد',
  heroIntro: 'از تمرین محاسبات عددی تا ارتباط دانشجو و استاد. سرویس‌های آموزشی و راه‌های ارتباطی IEAUM را اینجا پیدا کنید.',
  entryGuide: 'برای استفاده از سرویس‌ها وارد حساب خود شوید. افتتاح حساب از طریق ربات تلگرام انجام می‌شود.',
  servicesTitle: 'سرویس‌ها',
  solverTitle: 'نامرالب',
  solverText: 'معادله را وارد کنید و ریشه‌یابی را با چهار روش عددی، جدول تکرار و نمودار تمرین کنید.',
  botTitle: 'ربات تلگرام',
  botText: 'در مینی‌اپ ربات حساب بسازید یا وارد شوید و از منوی ربات به سرویس‌ها دسترسی پیدا کنید.',
  panelTitle: 'پنل دانشجو و استاد',
  panelText: 'دانشجو آزمون‌هایش را می‌بیند. استاد آزمون مرحله‌ای می‌سازد، آن را به دانشجویان اختصاص می‌دهد و نمره‌ها را بررسی می‌کند.',
  presentationTitle: 'ارائه‌طوری',
  presentationText: 'فایل ارائه را بارگذاری کنید، بین اسلایدها کوییز بگذارید و لینک کلاس را به شرکت‌کنندگان بدهید.',
  aboutTitle: 'دربارهٔ IEAUM',
  aboutText: 'IEAUM درگاه معرفی سرویس‌های آموزشی برای دانشجویان و استادان مهندسی صنایع دانشگاه آزاد مشهد است. نامرالب نخستین ابزار این مجموعه برای تمرین محاسبات عددی است.',
  footerText: 'مهندسان صنایع دانشگاه آزاد مشهد',
  commentsTitle: 'نظرات',
} satisfies Record<(typeof homeFieldKeys)[number], string>;

export async function siteAdmin(request: Request) {
  const profile = await currentProfile(request);
  return profile?.telegram_id && admins().includes(String(profile.telegram_id)) ? profile.id : undefined;
}

export async function readHomeContent(request: Request) {
  const [[record], admin] = await Promise.all([
    query<{ body: HomeContent }[]>('portal_home_content', { id: 'eq.1', select: 'body' }), siteAdmin(request),
  ]);
  return reply({ content: { ...defaultHomeContent, ...record?.body }, canEdit: Boolean(admin) });
}

export async function replaceHomeContent(request: Request, submitted: unknown) {
  const admin = await siteAdmin(request);
  if (!admin) return reply({ error: 'دسترسی مدیریت محتوا لازم است.' }, 403);
  await limit('site-content:' + admin, 12);
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) {
    return reply({ error: 'محتوا معتبر نیست.' }, 422);
  }
  const fields = submitted as Record<string, unknown>;
  const body: HomeContent = {};
  for (const key of homeFieldKeys) {
    const value = key === 'commentsTitle' ? fields[key] ?? defaultHomeContent[key] : fields[key];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > homeFieldLimit(key)) {
      return reply({ error: 'همهٔ فیلدها را در محدودهٔ مشخص تکمیل کنید.' }, 422);
    }
    body[key] = value.trim();
  }
  const keepServices = !Object.hasOwn(fields, 'services');
  const keepSections = !Object.hasOwn(fields, 'sections');
  const [current] = keepServices || keepSections ? await query<{ body: HomeContent }[]>('portal_home_content', { id: 'eq.1', select: 'body' }) : [];
  if (!keepServices) {
    const services = readHomeServices(fields.services);
    if (!services) return reply({ error: 'مشخصات سرویس‌ها معتبر نیست. لینک باید داخلی یا HTTPS باشد.' }, 422);
    body.services = services;
  } else if (current?.body?.services) body.services = current.body.services;
  if (!keepSections) {
    const sections = readHomeSections(fields.sections);
    if (!sections) return reply({ error: 'عنوان، متن یا جایگاه یکی از بخش‌ها معتبر نیست.' }, 422);
    body.sections = sections;
  } else if (current?.body?.sections) body.sections = current.body.sections;
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 46000) {
    return reply({ error: 'حجم محتوا بیش از حد است. متن‌ها را کوتاه‌تر کنید.' }, 422);
  }
  await supabase('/rest/v1/portal_home_content?on_conflict=id', 'POST', { id: 1, body },
    false, undefined, 'resolution=merge-duplicates');
  return reply({ content: body, canEdit: true });
}
