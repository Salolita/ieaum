const homeFields = {
  heroLabel: "\u0645\u0639\u0631\u0641\u06CC \u0628\u0627\u0644\u0627\u06CC \u0639\u0646\u0648\u0627\u0646",
  heroTitle: "\u0639\u0646\u0648\u0627\u0646 \u0627\u0635\u0644\u06CC",
  heroSubtitle: "\u0632\u06CC\u0631\u0639\u0646\u0648\u0627\u0646 \u0627\u0635\u0644\u06CC",
  heroIntro: "\u0645\u062A\u0646 \u0645\u0639\u0631\u0641\u06CC",
  entryGuide: "\u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u0648\u0631\u0648\u062F",
  servicesTitle: "\u0639\u0646\u0648\u0627\u0646 \u0633\u0631\u0648\u06CC\u0633\u200C\u0647\u0627",
  solverTitle: "\u0639\u0646\u0648\u0627\u0646 \u0646\u0627\u0645\u0631\u0627\u0644\u0628",
  solverText: "\u0645\u0639\u0631\u0641\u06CC \u0646\u0627\u0645\u0631\u0627\u0644\u0628",
  botTitle: "\u0639\u0646\u0648\u0627\u0646 \u0631\u0628\u0627\u062A",
  botText: "\u0645\u0639\u0631\u0641\u06CC \u0631\u0628\u0627\u062A",
  panelTitle: "\u0639\u0646\u0648\u0627\u0646 \u067E\u0646\u0644",
  panelText: "\u0645\u0639\u0631\u0641\u06CC \u067E\u0646\u0644",
  presentationTitle: "\u0639\u0646\u0648\u0627\u0646 \u0627\u0631\u0627\u0626\u0647\u200C\u0637\u0648\u0631\u06CC",
  presentationText: "\u0645\u0639\u0631\u0641\u06CC \u0627\u0631\u0627\u0626\u0647\u200C\u0637\u0648\u0631\u06CC",
  aboutTitle: "\u0639\u0646\u0648\u0627\u0646 \u062F\u0631\u0628\u0627\u0631\u0647\u0654 \u0645\u0627",
  aboutText: "\u0645\u062A\u0646 \u062F\u0631\u0628\u0627\u0631\u0647\u0654 \u0645\u0627",
  footerText: "\u0645\u062A\u0646 \u0641\u0648\u062A\u0631",
  commentsTitle: "\u0639\u0646\u0648\u0627\u0646 \u0628\u062E\u0634 \u0646\u0638\u0631\u0627\u062A"
};
const homeServiceFields = {
  icon: "\u0646\u0634\u0627\u0646 \u0633\u0631\u0648\u06CC\u0633",
  kind: "\u062F\u0633\u062A\u0647\u200C\u0628\u0646\u062F\u06CC",
  title: "\u0639\u0646\u0648\u0627\u0646",
  detail: "\u0646\u0627\u0645 \u06A9\u0648\u062A\u0627\u0647 \u06CC\u0627 \u0627\u0646\u06AF\u0644\u06CC\u0633\u06CC",
  text: "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A",
  action: "\u0645\u062A\u0646 \u062F\u06A9\u0645\u0647",
  href: "\u0646\u0634\u0627\u0646\u06CC \u0644\u06CC\u0646\u06A9"
};
const homeServiceLimits = { icon: 12, kind: 60, title: 120, detail: 60, text: 600, action: 100, href: 300 };
const maxHomeServices = 16;
const homeSectionPlaces = { intro: "\u0628\u0639\u062F \u0627\u0632 \u0645\u0639\u0631\u0641\u06CC", services: "\u0628\u0639\u062F \u0627\u0632 \u0633\u0631\u0648\u06CC\u0633\u200C\u0647\u0627", about: "\u0628\u0639\u062F \u0627\u0632 \u062F\u0631\u0628\u0627\u0631\u0647\u0654 \u0645\u0627" };
const maxHomeSections = 6;
function readHomeSections(input) {
  if (!Array.isArray(input) || input.length > maxHomeSections) return null;
  const output = [];
  for (const item of input) {
    if (!item || typeof item !== "object" || !Object.hasOwn(homeSectionPlaces, item.place) || typeof item.title !== "string" || typeof item.text !== "string") return null;
    const title = item.title.trim();
    const text = item.text.trim();
    if (!title || title.length > 120 || !text || text.length > 600) return null;
    output.push({ place: item.place, title, text });
  }
  return output;
}
function homeLink(value) {
  if (!value || /[\s\\\p{C}]/u.test(value) || value.length > homeServiceLimits.href) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
function readHomeServices(input) {
  if (!Array.isArray(input) || input.length > maxHomeServices) return null;
  const output = [];
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const service = {};
    for (const key of Object.keys(homeServiceFields)) {
      const value = item[key];
      if (typeof value !== "string" || value.trim().length > homeServiceLimits[key]) return null;
      service[key] = value.trim();
    }
    if (!service.title || !service.action || !homeLink(service.href)) return null;
    output.push(service);
  }
  return output;
}
function homeServices(content) {
  return readHomeServices(content.services) ?? [
    { icon: "\u0192", kind: "\u0645\u062D\u0627\u0633\u0628\u0627\u062A \u0639\u062F\u062F\u06CC", title: content.solverTitle ?? "", detail: "Numralab", text: content.solverText ?? "", action: "\u0648\u0631\u0648\u062F \u0628\u0647 \u0646\u0627\u0645\u0631\u0627\u0644\u0628", href: "https://numeralab.ieaum.ir/" },
    { icon: "\u27A4", kind: "\u0627\u0631\u062A\u0628\u0627\u0637", title: content.botTitle ?? "", detail: "@ieaumbot", text: content.botText ?? "", action: "\u0628\u0627\u0632 \u06A9\u0631\u062F\u0646 \u062F\u0631 \u062A\u0644\u06AF\u0631\u0627\u0645", href: "https://t.me/ieaumbot" },
    { icon: "\u25A4", kind: "\u0622\u0645\u0648\u0632\u0634 \u0648 \u0627\u0631\u0632\u06CC\u0627\u0628\u06CC", title: content.panelTitle ?? "", detail: "", text: content.panelText ?? "", action: "\u0648\u0631\u0648\u062F \u0628\u0647 \u067E\u0646\u0644", href: "/panel/" },
    { icon: "\u25A3", kind: "\u0627\u0631\u0627\u0626\u0647\u0654 \u06A9\u0644\u0627\u0633\u06CC", title: content.presentationTitle ?? "", detail: "", text: content.presentationText ?? "", action: "\u0648\u0631\u0648\u062F \u0628\u0647 \u0627\u0631\u0627\u0626\u0647\u200C\u0637\u0648\u0631\u06CC", href: "/erae-tori/" }
  ];
}
const homeFieldKeys = Object.keys(homeFields);
const longHomeField = (key) => key.endsWith("Text") || ["heroIntro", "entryGuide"].includes(key);
const homeFieldLimit = (key) => longHomeField(key) ? 600 : 120;
export {
  homeFieldKeys,
  homeFieldLimit,
  homeFields,
  homeLink,
  homeSectionPlaces,
  homeServiceFields,
  homeServiceLimits,
  homeServices,
  longHomeField,
  maxHomeSections,
  maxHomeServices,
  readHomeSections,
  readHomeServices
};
