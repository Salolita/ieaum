export type ContactLink = { label: string; url: string };
export type ContactGroup = { title: string; links: ContactLink[] };
export type ContactContent = { title: string; groups: ContactGroup[] };
export const contactLimits = { groups: 12, links: 6, title: 100, label: 100, url: 300 } as const;
export const defaultContacts: ContactContent = {
  title: 'ارتباط با ما',
  groups: [
    { title: 'وب‌سایت', links: [{ label: 'ieaum.ir', url: 'https://ieaum.ir/' }] },
    { title: 'ربات تلگرام', links: [{ label: '@ieaumbot', url: 'https://t.me/ieaumbot' }] },
    { title: 'کانال تلگرامی', links: [{ label: '@ieaum_club', url: 'https://t.me/ieaum_club' }] },
    { title: 'ارتباط با پشتیبانی', links: [
      { label: '@Saleh_2007K', url: 'https://t.me/Saleh_2007K' },
      { label: '@Armin_3A', url: 'https://t.me/Armin_3A' },
    ] },
  ],
};

export function contactUrl(raw: string) {
  if (!raw || raw.length > contactLimits.url || /[\s\p{Cc}]/u.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.href.length > contactLimits.url) return null;
    if (url.protocol === 'https:' && url.hostname && !url.username && !url.password) return url.href;
    if (url.protocol === 'mailto:' && /^[^?@]+@[^?@]+$/u.test(url.pathname) && !url.search && !url.hash) return url.href;
    if (url.protocol === 'tel:' && /^[+\d().-]{5,25}$/.test(url.pathname) && !url.search && !url.hash) return url.href;
  } catch { /* Invalid href. */ }
  return null;
}
