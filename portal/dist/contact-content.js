const contactLimits = { groups: 12, links: 6, title: 100, label: 100, url: 300 };
const defaultContacts = {
  title: "\u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u0627 \u0645\u0627",
  groups: [
    { title: "\u0648\u0628\u200C\u0633\u0627\u06CC\u062A", links: [{ label: "ieaum.ir", url: "https://ieaum.ir/" }] },
    { title: "\u0631\u0628\u0627\u062A \u062A\u0644\u06AF\u0631\u0627\u0645", links: [{ label: "@ieaumbot", url: "https://t.me/ieaumbot" }] },
    { title: "\u06A9\u0627\u0646\u0627\u0644 \u062A\u0644\u06AF\u0631\u0627\u0645\u06CC", links: [{ label: "@ieaum_club", url: "https://t.me/ieaum_club" }] },
    { title: "\u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u0627 \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC", links: [
      { label: "@Saleh_2007K", url: "https://t.me/Saleh_2007K" },
      { label: "@Armin_3A", url: "https://t.me/Armin_3A" }
    ] }
  ]
};
function contactUrl(raw) {
  if (!raw || raw.length > contactLimits.url || /[\s\p{Cc}]/u.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.href.length > contactLimits.url) return null;
    if (url.protocol === "https:" && url.hostname && !url.username && !url.password) return url.href;
    if (url.protocol === "mailto:" && /^[^?@]+@[^?@]+$/u.test(url.pathname) && !url.search && !url.hash) return url.href;
    if (url.protocol === "tel:" && /^[+\d().-]{5,25}$/.test(url.pathname) && !url.search && !url.hash) return url.href;
  } catch {
  }
  return null;
}
export {
  contactLimits,
  contactUrl,
  defaultContacts
};
