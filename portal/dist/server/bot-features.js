import { admins } from "./account-review.js";
import { query, rpc, write } from "./portal-store.js";
import { telegram, TelegramDeliveryError } from "./telegram-delivery.js";
import { usernamePattern, usernameRules } from "../client/utils/account-fields.js";
import { jalaliParts } from "../client/utils/jalali.js";
const birthdayLabel = "\u062A\u0628\u0631\u06CC\u06A9 \u062A\u0648\u0644\u062F";
const birthdayPrompt = "\u0645\u062A\u0646 \u062C\u062F\u06CC\u062F \u0631\u0627 \u062F\u0631 \u067E\u0627\u0633\u062E \u0628\u0647 \u0647\u0645\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F. \u0628\u0631\u0627\u06CC \u062C\u0627\u06CC \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u060C \u0639\u0628\u0627\u0631\u062A {name} \u0631\u0627 \u062F\u0631 \u0645\u062A\u0646 \u0642\u0631\u0627\u0631 \u062F\u0647\u06CC\u062F.";
const timeZone = "Asia/Tehran";
const localDate = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
const localHour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" });
const send = (chat_id, text, reply_markup) => telegram("sendMessage", { chat_id, text, reply_markup, protect_content: true });
const preferenceKey = { id: "eq.1" };
async function preferences() {
  const [item] = await query("portal_bot_preferences", {
    ...preferenceKey,
    select: "menu_ready,usernames_queued,birthday_enabled,birthday_template,birthdays_queued_on"
  });
  return item;
}
async function birthdayMenu(chat) {
  if (!admins().includes(chat)) return;
  const item = await preferences();
  await send(chat, `${birthdayLabel} ${item.birthday_enabled ? "\u0641\u0639\u0627\u0644 \u0627\u0633\u062A" : "\u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A"}. \u0632\u0645\u0627\u0646 \u0627\u0631\u0633\u0627\u0644: \u06F9 \u0635\u0628\u062D \u0628\u0647 \u0648\u0642\u062A \u062A\u0647\u0631\u0627\u0646.

\u0645\u062A\u0646 \u067E\u06CC\u0627\u0645:
${item.birthday_template}`, {
    inline_keyboard: [
      [{ text: "\u0648\u06CC\u0631\u0627\u06CC\u0634 \u0645\u062A\u0646", callback_data: "birthday:edit" }],
      [{ text: item.birthday_enabled ? "\u063A\u06CC\u0631\u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC" : "\u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC", callback_data: item.birthday_enabled ? "birthday:off" : "birthday:on" }]
    ]
  });
}
async function handleBirthdayCallback(callback) {
  const chat = callback.message?.chat;
  if (chat?.type !== "private" || chat.id !== callback.from?.id || typeof callback.id !== "string" || !admins().includes(String(chat.id))) return;
  const recipient = String(chat.id);
  const operation = callback.data?.split(":")[1];
  await telegram("answerCallbackQuery", { callback_query_id: callback.id }).catch(() => {
  });
  if (operation === "edit") return send(recipient, birthdayPrompt, { force_reply: true });
  if (operation !== "on" && operation !== "off") return;
  await write("portal_bot_preferences", "PATCH", { birthday_enabled: operation === "on" }, preferenceKey);
  await birthdayMenu(recipient);
}
async function saveBirthdayTemplate(chat, text) {
  if (!admins().includes(chat)) return;
  if (!text.includes("{name}") || text.length > 800) {
    await send(chat, "\u0645\u062A\u0646 \u0628\u0627\u06CC\u062F \u062D\u062F\u0627\u06A9\u062B\u0631 \u06F8\u06F0\u06F0 \u0646\u0648\u06CC\u0633\u0647 \u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F \u0648 \u0634\u0627\u0645\u0644 {name} \u0628\u0627\u0634\u062F.");
    return send(chat, birthdayPrompt, { force_reply: true });
  }
  await write("portal_bot_preferences", "PATCH", { birthday_template: text }, preferenceKey);
  await birthdayMenu(chat);
}
function matchesBirthday(iso, today) {
  if (!iso) return false;
  const birth = /* @__PURE__ */ new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(birth.getTime())) return false;
  const current = jalaliParts(/* @__PURE__ */ new Date(`${today}T12:00:00Z`));
  const original = jalaliParts(birth);
  return original.month === current.month && original.day === current.day;
}
async function birthdayProfiles(today) {
  const matches = [];
  let after;
  while (true) {
    const rows = await query("portal_profiles", {
      ...after ? { id: `gt.${after}` } : {},
      active: "eq.true",
      telegram_id: "not.is.null",
      birth_date: "not.is.null",
      select: "id,birth_date",
      order: "id.asc",
      limit: "500"
    });
    for (const { id, birth_date } of rows) if (matchesBirthday(birth_date, today)) matches.push(id);
    if (rows.length < 500) return matches;
    after = rows.at(-1).id;
  }
}
async function configureMenu() {
  await telegram("setMyCommands", { scope: { type: "all_private_chats" }, commands: [
    { command: "menu", description: "\u0645\u0646\u0648\u06CC \u0627\u0635\u0644\u06CC \u0631\u0628\u0627\u062A" },
    { command: "panel", description: "\u0648\u0631\u0648\u062F \u0628\u0647 \u067E\u0646\u0644 IEAUM" },
    { command: "services", description: "\u0633\u0631\u0648\u06CC\u0633\u200C\u0647\u0627" },
    { command: "profile", description: "\u0646\u0645\u0627\u06CC\u0647 \u0645\u0646" },
    { command: "presentation", description: "\u0627\u0631\u0627\u0626\u0647\u200C\u0637\u0648\u0631\u06CC" },
    { command: "week", description: "\u0627\u0639\u0644\u0627\u0646 \u0647\u0641\u062A\u0647\u0654 \u0632\u0648\u062C \u0648 \u0641\u0631\u062F" }
  ] });
  await telegram("setChatMenuButton", { menu_button: { type: "commands" } });
  await write("portal_bot_preferences", "PATCH", { menu_ready: true }, preferenceKey);
}
async function deliverNotice(notice, item, today) {
  const match = { profile_id: `eq.${notice.profile_id}`, kind: `eq.${notice.kind}`, event_date: `eq.${notice.event_date}`, state: "eq.sending" };
  const [profile] = await query("portal_profiles", {
    id: `eq.${notice.profile_id}`,
    active: "eq.true",
    telegram_id: "not.is.null",
    select: "telegram_id,username,first_name,last_name,birth_date",
    limit: "1"
  });
  let state = "skipped";
  try {
    if (profile && notice.kind === "username" && !usernamePattern.test(profile.username)) {
      await send(profile.telegram_id, `\u06A9\u0627\u0631\u0628\u0631 \u06AF\u0631\u0627\u0645\u06CC\u060C
\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0641\u0639\u0644\u06CC \u0634\u0645\u0627 \xAB${profile.username}\xBB \u0628\u0627 \u0642\u0648\u0627\u0646\u06CC\u0646 \u062C\u062F\u06CC\u062F IEAUM \u0633\u0627\u0632\u06AF\u0627\u0631 \u0646\u06CC\u0633\u062A. \u0644\u0637\u0641\u0627\u064B \u0638\u0631\u0641 \u06F2\u06F4 \u062A\u0627 \u06F4\u06F8 \u0633\u0627\u0639\u062A \u0622\u06CC\u0646\u062F\u0647 \u0627\u0632 \u0628\u062E\u0634 \xAB\u0646\u0645\u0627\u06CC\u0647 \u0645\u0646\xBB \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC\u200C\u062A\u0627\u0646 \u0631\u0627 \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0647\u06CC\u062F.

${usernameRules}`, {
        inline_keyboard: [[{ text: "\u0648\u06CC\u0631\u0627\u06CC\u0634 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC", web_app: { url: "https://ieaum.ir/account/?mode=profile" } }]]
      });
      state = "sent";
    } else if (profile && notice.kind === "birthday" && item.birthday_enabled && matchesBirthday(profile.birth_date, today)) {
      await send(profile.telegram_id, item.birthday_template.replaceAll("{name}", () => `${profile.first_name} ${profile.last_name}`.trim()));
      state = "sent";
    }
  } catch (error) {
    if (error instanceof TelegramDeliveryError && error.status === 429 && notice.attempts < 3) {
      const delay = Number.isFinite(error.retryAfter) ? Math.max(1, error.retryAfter) + 1 : 60;
      await write("portal_personal_notices", "PATCH", { state: "pending", available_at: new Date(Date.now() + delay * 1e3).toISOString() }, match);
      return;
    }
    state = "failed";
  }
  await write("portal_personal_notices", "PATCH", { state }, match);
}
async function deliverPersonalNotices(now = /* @__PURE__ */ new Date()) {
  const item = await preferences();
  if (!item) return;
  const today = localDate.format(now);
  if (!item.menu_ready) await configureMenu().catch(() => {
  });
  if (!item.usernames_queued) await rpc("portal_prepare_personal_notices", { p_kind: "username", p_date: today, p_profiles: [] });
  if (item.birthday_enabled && Number(localHour.format(now)) === 9 && item.birthdays_queued_on !== today) {
    await rpc("portal_prepare_personal_notices", { p_kind: "birthday", p_date: today, p_profiles: await birthdayProfiles(today) });
  }
  const batch = await rpc("portal_claim_personal_notices", { p_date: today });
  await Promise.allSettled(batch.map((notice) => deliverNotice(notice, item, today)));
}
export {
  birthdayLabel,
  birthdayMenu,
  birthdayPrompt,
  deliverPersonalNotices,
  handleBirthdayCallback,
  matchesBirthday,
  saveBirthdayTemplate
};
