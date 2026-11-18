import { admins, isMembershipReviewer } from "./account-review.js";
import { equalSecret, query, reply, rpc, studentNumber, supabase, write } from "./portal-store.js";
import { telegram } from "./telegram-delivery.js";
import { jalaliToISO } from "../client/utils/jalali.js";
const usersLabel = "\u06A9\u0627\u0631\u0628\u0631\u0627\u0646 \u0648\u0627\u0631\u062F\u0634\u062F\u0647";
const weekLabel = "\u0627\u0639\u0644\u0627\u0646 \u0647\u0641\u062A\u0647\u0654 \u0632\u0648\u062C \u0648 \u0641\u0631\u062F";
const weekSettingsLabel = "\u062A\u0646\u0638\u06CC\u0645 \u0647\u0641\u062A\u0647\u0654 \u0632\u0648\u062C \u0648 \u0641\u0631\u062F";
const weekPrompt = "\u062A\u0627\u0631\u06CC\u062E \u0634\u0631\u0648\u0639 \u0647\u0641\u062A\u0647 \u0648 \u0648\u0636\u0639\u06CC\u062A\u0634 \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F. \u0646\u0645\u0648\u0646\u0647: \u06F1\u06F4\u06F0\u06F5/\u06F0\u06F8/\u06F3\u06F0 \u0641\u0631\u062F";
const fa = new Intl.NumberFormat("fa-IR", { useGrouping: false });
const dayMs = 864e5;
const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
const send = (chat, text, reply_markup, protect_content = false) => telegram("sendMessage", { chat_id: chat, text, reply_markup, protect_content });
async function listLoggedIn(chat) {
  if (!admins().includes(chat)) return;
  const rows = [];
  for (let offset = 0; ; offset += 250) {
    const page = await query("portal_profiles", {
      active: "eq.true",
      last_portal_login_at: "not.is.null",
      select: "id,first_name,last_name",
      order: "last_portal_login_at.desc,id.asc",
      limit: "250",
      offset: String(offset)
    });
    rows.push(...page);
    if (page.length < 250) break;
  }
  if (!rows.length) {
    await write("portal_admin_user_lists", "DELETE", void 0, { chat_id: `eq.${chat}` });
    return send(chat, "\u0648\u0631\u0648\u062F\u06CC \u062B\u0628\u062A\u200C\u0634\u062F\u0647\u200C\u0627\u06CC \u062F\u0631 \u0641\u0647\u0631\u0633\u062A \u0646\u06CC\u0633\u062A.");
  }
  await supabase("/rest/v1/portal_admin_user_lists?on_conflict=chat_id", "POST", {
    chat_id: chat,
    profile_ids: rows.map(({ id }) => id),
    expires_at: new Date(Date.now() + 9e5).toISOString()
  }, false, void 0, "resolution=merge-duplicates");
  for (let i = 0; i < rows.length; i += 18) {
    const lines = rows.slice(i, i + 18).map((row, index) => `${fa.format(i + index + 1)}. ${row.first_name} ${row.last_name}`);
    await send(chat, lines.join("\n"), void 0, true);
  }
  await send(chat, "\u0628\u0631\u0627\u06CC \u062D\u0630\u0641 \u062F\u0633\u062A\u0631\u0633\u06CC\u060C \u0634\u0645\u0627\u0631\u0647\u0654 \u0631\u062F\u06CC\u0641 \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F. \u0627\u06CC\u0646 \u0641\u0647\u0631\u0633\u062A \u062A\u0627 \u06F1\u06F5 \u062F\u0642\u06CC\u0642\u0647 \u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.", void 0, true);
}
async function removeListedUser(chat, input) {
  if (!admins().includes(chat)) return;
  const index = Number(studentNumber(input)) - 1;
  const [list] = await query("portal_admin_user_lists", {
    chat_id: `eq.${chat}`,
    expires_at: `gt.${(/* @__PURE__ */ new Date()).toISOString()}`,
    select: "profile_ids"
  });
  const id = list?.profile_ids[index];
  if (!id) return send(chat, "\u0631\u062F\u06CC\u0641 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \xAB\u06A9\u0627\u0631\u0628\u0631\u0627\u0646 \u0648\u0627\u0631\u062F\u0634\u062F\u0647\xBB \u0631\u0627 \u0628\u0632\u0646\u06CC\u062F \u0648 \u0634\u0645\u0627\u0631\u0647 \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F.");
  const [user] = await query("portal_profiles", { id: `eq.${id}`, select: "telegram_id" });
  if (user?.telegram_id && (admins().includes(user.telegram_id) || isMembershipReviewer(user.telegram_id))) {
    return send(chat, "\u062D\u0630\u0641 \u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631 \u06CC\u0627 \u062A\u0623\u06CC\u06CC\u062F\u06A9\u0646\u0646\u062F\u0647 \u0627\u0632 \u0627\u06CC\u0646 \u0641\u0647\u0631\u0633\u062A \u0645\u0645\u06A9\u0646 \u0646\u06CC\u0633\u062A.");
  }
  const removed = await rpc("portal_remove_user", { p_id: id });
  await send(chat, removed ? "\u062F\u0633\u062A\u0631\u0633\u06CC \u06A9\u0627\u0631\u0628\u0631 \u062D\u0630\u0641 \u0634\u062F \u0648 \u0646\u0634\u0633\u062A\u200C\u0647\u0627\u06CC \u0648\u0631\u0648\u062F \u0628\u0633\u062A\u0647 \u0634\u062F\u0646\u062F." : "\u062D\u0633\u0627\u0628 \u0642\u0628\u0644\u0627\u064B \u0627\u0632 \u062F\u0633\u062A\u0631\u0633 \u062E\u0627\u0631\u062C \u0634\u062F\u0647 \u0627\u0633\u062A.");
}
async function weekMenu(chat) {
  const [subscription] = await query("portal_week_subscriptions", { chat_id: `eq.${chat}`, select: "enabled" });
  return send(chat, subscription?.enabled ? "\u0627\u0639\u0644\u0627\u0646 \u0647\u0641\u062A\u06AF\u06CC \u0628\u0631\u0627\u06CC \u0634\u0645\u0627 \u0641\u0639\u0627\u0644 \u0627\u0633\u062A." : "\u0627\u0639\u0644\u0627\u0646 \u0647\u0641\u062A\u06AF\u06CC \u0628\u0631\u0627\u06CC \u0634\u0645\u0627 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A.", {
    inline_keyboard: [[subscription?.enabled ? { text: "\u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u06A9\u0631\u062F\u0646", callback_data: "week:off" } : { text: "\u0641\u0639\u0627\u0644 \u06A9\u0631\u062F\u0646", callback_data: "week:on" }]]
  });
}
async function setWeekSubscription(chat, enabled) {
  await supabase("/rest/v1/portal_week_subscriptions?on_conflict=chat_id", "POST", { chat_id: chat, enabled }, false, void 0, "resolution=merge-duplicates");
}
async function setWeekAnchor(chat, input) {
  if (!admins().includes(chat)) return;
  const [date, parity, extra] = input.split(/\s+/);
  const anchor = jalaliToISO(date);
  if (!anchor || !["\u0632\u0648\u062C", "\u0641\u0631\u062F"].includes(parity) || extra) return send(chat, weekPrompt, { force_reply: true });
  await write("portal_week_schedule", "PATCH", { anchor, odd: parity === "\u0641\u0631\u062F" }, { id: "eq.1" });
  await send(chat, `\u0645\u0628\u0646\u0627\u06CC \u0647\u0641\u062A\u0647 \u0631\u0648\u06CC ${date} (${parity}) \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F.`);
}
function currentWeek(anchor, odd, today) {
  const start = Date.parse(anchor);
  const elapsed = Math.floor((Date.parse(today) - start) / (7 * dayMs));
  if (elapsed < 0) return null;
  return { date: new Date(start + elapsed * 7 * dayMs).toISOString().slice(0, 10), odd: elapsed % 2 === 0 ? odd : !odd };
}
async function deliverWeekNotices(request) {
  const secret = process.env.CRON_SECRET;
  if (request.method !== "GET" || !secret || !equalSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return reply({ error: "Unauthorized" }, 401);
  const [schedule] = await query("portal_week_schedule", { id: "eq.1", select: "anchor,odd" });
  const week = schedule && currentWeek(schedule.anchor, schedule.odd, dateFormat.format(/* @__PURE__ */ new Date()));
  if (!week) return reply({ sent: 0 });
  let sent = 0;
  const deadline = Date.now() + 43e3;
  while (Date.now() < deadline) {
    const batch = await rpc("portal_claim_week", { p_week: week.date, p_count: 12 });
    if (!batch.length) break;
    await Promise.allSettled(batch.map(async ({ chat_id }) => {
      const [current] = await query("portal_week_subscriptions", { chat_id: `eq.${chat_id}`, select: "enabled" });
      if (!current?.enabled) return;
      await send(chat_id, `\u062F\u0631\u0648\u062F\u060C
\u0627\u06CC\u0646 \u0647\u0641\u062A\u0647 ${week.odd ? "\u0641\u0631\u062F" : "\u0632\u0648\u062C"} \u0627\u0633\u062A.
\u0645\u0648\u0641\u0642 \u0628\u0627\u0634\u06CC\u062F.`);
      await write("portal_week_subscriptions", "PATCH", { last_week: week.date, lease_until: null }, { chat_id: `eq.${chat_id}` });
      sent++;
    }));
  }
  return reply({ sent });
}
export {
  currentWeek,
  deliverWeekNotices,
  listLoggedIn,
  removeListedUser,
  setWeekAnchor,
  setWeekSubscription,
  usersLabel,
  weekLabel,
  weekMenu,
  weekPrompt,
  weekSettingsLabel
};
