import { admins } from "./account-review.js";
import { manageAccountRow } from "./account-actions.js";
import { equalSecret, query, reply, rpc, studentNumber, supabase, write } from "./portal-store.js";
import { telegram } from "./telegram-delivery.js";
import { jalaliToISO } from "../client/utils/jalali.js";
import { automationReady } from "./weekly-worker.js";
import { deliverQueuedAnnouncements } from "./admin-announcements.js";
const usersLabel = "\u0641\u0647\u0631\u0633\u062A \u062D\u0633\u0627\u0628\u200C\u0647\u0627";
const legacyUsersLabel = "\u06A9\u0627\u0631\u0628\u0631\u0627\u0646 \u0648\u0627\u0631\u062F\u0634\u062F\u0647";
const weekLabel = "\u0627\u0639\u0644\u0627\u0646 \u0647\u0641\u062A\u0647\u0654 \u0632\u0648\u062C \u0648 \u0641\u0631\u062F";
const weekSettingsLabel = "\u062A\u0646\u0638\u06CC\u0645 \u0647\u0641\u062A\u0647\u0654 \u0632\u0648\u062C \u0648 \u0641\u0631\u062F";
const weekPrompt = "\u062A\u0627\u0631\u06CC\u062E \u0634\u0631\u0648\u0639 \u0647\u0641\u062A\u0647 \u0648 \u0648\u0636\u0639\u06CC\u062A\u0634 \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F. \u0646\u0645\u0648\u0646\u0647: \u06F1\u06F4\u06F0\u06F5/\u06F0\u06F8/\u06F3\u06F0 \u0641\u0631\u062F";
const fa = new Intl.NumberFormat("fa-IR", { useGrouping: false });
const dayMs = 864e5;
const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
const send = (chat, text, reply_markup, protect_content = false) => telegram("sendMessage", { chat_id: chat, text, reply_markup, protect_content });
function accountStatus(account) {
  if (account.active) return "\u0641\u0639\u0627\u0644";
  if (account.review_status === "pending") return "\u062F\u0631 \u0627\u0646\u062A\u0638\u0627\u0631 \u062A\u0623\u06CC\u06CC\u062F";
  if (account.review_status === "rejected") return "\u0631\u062F\u0634\u062F\u0647";
  return "\u063A\u06CC\u0631\u0641\u0639\u0627\u0644";
}
async function listAccounts(chat) {
  if (!admins().includes(chat)) return;
  const rows = [];
  while (true) {
    const last = rows.at(-1);
    const page = await query("portal_profiles", {
      select: "id,username,first_name,last_name,role,active,review_status,last_portal_login_at",
      order: "username.asc",
      limit: "250",
      ...last ? { username: `gt.${last.username}` } : {}
    });
    rows.push(...page);
    if (page.length < 250) break;
  }
  if (!rows.length) {
    await write("portal_admin_user_lists", "DELETE", void 0, { chat_id: `eq.${chat}` });
    return send(chat, "\u0647\u06CC\u0686 \u062D\u0633\u0627\u0628\u06CC \u062B\u0628\u062A \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  }
  await supabase("/rest/v1/portal_admin_user_lists?on_conflict=chat_id", "POST", {
    chat_id: chat,
    profile_ids: rows.map(({ id }) => id),
    expires_at: new Date(Date.now() + 9e5).toISOString()
  }, false, void 0, "resolution=merge-duplicates");
  await send(chat, `\u0641\u0647\u0631\u0633\u062A \u062D\u0633\u0627\u0628\u200C\u0647\u0627: ${fa.format(rows.length)} \u062D\u0633\u0627\u0628
\u0641\u0639\u0627\u0644: ${fa.format(rows.filter((row) => row.active).length)}
\u0633\u0627\u0628\u0642\u0647\u0654 \u0648\u0631\u0648\u062F \u062B\u0628\u062A\u200C\u0634\u062F\u0647: ${fa.format(rows.filter((row) => row.last_portal_login_at !== null).length)}`, void 0, true);
  for (let i = 0; i < rows.length; i += 12) {
    const lines = rows.slice(i, i + 12).map((row, index) => `${fa.format(i + index + 1)}. ${row.first_name} ${row.last_name} (${row.username}) \xB7 ${row.role === "teacher" ? "\u0627\u0633\u062A\u0627\u062F" : "\u062F\u0627\u0646\u0634\u062C\u0648"} \xB7 ${accountStatus(row)} \xB7 ${row.last_portal_login_at ? "\u0648\u0631\u0648\u062F \u062B\u0628\u062A \u0634\u062F\u0647" : "\u0628\u062F\u0648\u0646 \u0633\u0627\u0628\u0642\u0647\u0654 \u0648\u0631\u0648\u062F \u062B\u0628\u062A\u200C\u0634\u062F\u0647"}`);
    await send(chat, lines.join("\n"), void 0, true);
  }
  await send(chat, "\u0628\u0631\u0627\u06CC \u0645\u062F\u06CC\u0631\u06CC\u062A \u062D\u0633\u0627\u0628\u060C \u0634\u0645\u0627\u0631\u0647\u0654 \u0631\u062F\u06CC\u0641 \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F. \u0627\u06CC\u0646 \u0641\u0647\u0631\u0633\u062A \u062A\u0627 \u06F1\u06F5 \u062F\u0642\u06CC\u0642\u0647 \u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.", void 0, true);
}
async function manageListedUser(chat, input) {
  if (!admins().includes(chat)) return;
  const index = Number(studentNumber(input)) - 1;
  const [list] = await query("portal_admin_user_lists", {
    chat_id: `eq.${chat}`,
    expires_at: `gt.${(/* @__PURE__ */ new Date()).toISOString()}`,
    select: "profile_ids"
  });
  const id = list?.profile_ids[index];
  if (!id) return send(chat, "\u0631\u062F\u06CC\u0641 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \xAB\u0641\u0647\u0631\u0633\u062A \u062D\u0633\u0627\u0628\u200C\u0647\u0627\xBB \u0631\u0627 \u0628\u0632\u0646\u06CC\u062F \u0648 \u0634\u0645\u0627\u0631\u0647 \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F.");
  await manageAccountRow(chat, id);
}
const noticesLabel = "\u0627\u0639\u0644\u0627\u0646\u200C\u0647\u0627";
const todayWeekLabel = "\u0627\u06CC\u0646 \u0647\u0641\u062A\u0647 \u0632\u0648\u062C \u0627\u0633\u062A \u06CC\u0627 \u0641\u0631\u062F\u061F";
const weekTimePrompt = "\u0631\u0648\u0632 \u0648 \u0633\u0627\u0639\u062A \u0627\u0639\u0644\u0627\u0646 \u0631\u0627 \u0628\u0647 \u0648\u0642\u062A \u062A\u0647\u0631\u0627\u0646 \u062F\u0631 \u067E\u0627\u0633\u062E \u0628\u0647 \u0647\u0645\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F. \u0646\u0645\u0648\u0646\u0647: \u067E\u0646\u062C\u0634\u0646\u0628\u0647 \u06F1\u06F8:\u06F3\u06F0";
const weekdays = ["\u06CC\u06A9\u0634\u0646\u0628\u0647", "\u062F\u0648\u0634\u0646\u0628\u0647", "\u0633\u0647\u200C\u0634\u0646\u0628\u0647", "\u0686\u0647\u0627\u0631\u0634\u0646\u0628\u0647", "\u067E\u0646\u062C\u0634\u0646\u0628\u0647", "\u062C\u0645\u0639\u0647", "\u0634\u0646\u0628\u0647"];
const dayName = (value) => value.replace(/[\s\u200c]/g, "");
async function showCurrentWeek(chat) {
  const [schedule] = await query("portal_week_schedule", { id: "eq.1", select: "anchor,odd" });
  const week = schedule && currentWeek(schedule.anchor, schedule.odd, dateFormat.format(/* @__PURE__ */ new Date()), true);
  return send(chat, week ? `\u062F\u0631\u0648\u062F\u060C
\u0627\u06CC\u0646 \u0647\u0641\u062A\u0647 ${week.odd ? "\u0641\u0631\u062F" : "\u0632\u0648\u062C"} \u0627\u0633\u062A.
\u0645\u0648\u0641\u0642 \u0628\u0627\u0634\u06CC\u062F.` : "\u0628\u0631\u0646\u0627\u0645\u0647\u0654 \u0647\u0641\u062A\u0647\u200C\u0647\u0627\u06CC \u0632\u0648\u062C \u0648 \u0641\u0631\u062F \u0647\u0646\u0648\u0632 \u0634\u0631\u0648\u0639 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
}
async function weekMenu(chat) {
  const [subscriptions, precise] = await Promise.all([query("portal_week_subscriptions", { chat_id: `eq.${chat}`, select: "enabled,weekday,minute_of_day" }), automationReady()]);
  const [subscription] = subscriptions;
  const time = subscription?.minute_of_day ?? 360;
  const status = subscription?.enabled ? `\u0627\u0639\u0644\u0627\u0646 \u0641\u0639\u0627\u0644 \u0627\u0633\u062A. ${weekdays[subscription.weekday]} \u0633\u0627\u0639\u062A ${fa.format(Math.floor(time / 60))}:${fa.format(time % 60).padStart(2, "\u06F0")} \u0628\u0647 \u0648\u0642\u062A \u062A\u0647\u0631\u0627\u0646.` : "\u0627\u0639\u0644\u0627\u0646 \u0647\u0641\u062A\u06AF\u06CC \u0628\u0631\u0627\u06CC \u0634\u0645\u0627 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A.";
  if (!precise) return send(chat, `${subscription?.enabled ? "\u0627\u0639\u0644\u0627\u0646 \u0647\u0641\u062A\u06AF\u06CC \u0641\u0639\u0627\u0644 \u0627\u0633\u062A." : status}
\u0627\u0646\u062A\u062E\u0627\u0628 \u0632\u0645\u0627\u0646 \u067E\u0633 \u0627\u0632 \u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u0632\u0645\u0627\u0646\u200C\u0628\u0646\u062F\u06CC \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u062E\u0648\u0627\u0647\u062F \u0628\u0648\u062F.`, {
    inline_keyboard: [[subscription?.enabled ? { text: "\u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u06A9\u0631\u062F\u0646", callback_data: "week:off" } : { text: "\u0641\u0639\u0627\u0644 \u06A9\u0631\u062F\u0646", callback_data: "week:on" }]]
  });
  return send(chat, status, {
    inline_keyboard: [
      [{ text: "\u062C\u0645\u0639\u0647 \u06F2\u06F1:\u06F0\u06F0 \xB7 \u0647\u0641\u062A\u0647\u0654 \u067E\u06CC\u0634\u200C\u0631\u0648", callback_data: "week:fri" }],
      [{ text: "\u0634\u0646\u0628\u0647 \u06F0\u06F6:\u06F0\u06F0 \xB7 \u0647\u0641\u062A\u0647\u0654 \u062C\u0627\u0631\u06CC", callback_data: "week:sat" }],
      [{ text: "\u0632\u0645\u0627\u0646 \u062F\u0644\u062E\u0648\u0627\u0647", callback_data: "week:custom" }],
      ...subscription?.enabled ? [[{ text: "\u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u06A9\u0631\u062F\u0646", callback_data: "week:off" }]] : []
    ]
  });
}
async function setWeekSubscription(chat, enabled, schedule) {
  await supabase("/rest/v1/portal_week_subscriptions?on_conflict=chat_id", "POST", { chat_id: chat, enabled, ...schedule }, false, void 0, "resolution=merge-duplicates");
}
async function askWeekTime(chat) {
  return send(chat, weekTimePrompt, { force_reply: true });
}
async function setCustomWeekTime(chat, input) {
  const match = /^(.*?)\s+(\d{1,2}):(\d{2})$/.exec(studentNumber(input));
  const weekday = match ? weekdays.findIndex((day) => dayName(day) === dayName(match[1])) : -1;
  if (!match || weekday < 0 || Number(match[2]) > 23 || Number(match[3]) > 59) return askWeekTime(chat);
  await setWeekSubscription(chat, true, { weekday, minute_of_day: Number(match[2]) * 60 + Number(match[3]) });
  return weekMenu(chat);
}
async function setWeekAnchor(chat, input) {
  if (!admins().includes(chat)) return;
  const [date, parity, extra] = input.split(/\s+/);
  const anchor = jalaliToISO(date);
  if (!anchor || !["\u0632\u0648\u062C", "\u0641\u0631\u062F"].includes(parity) || extra) return send(chat, weekPrompt, { force_reply: true });
  await write("portal_week_schedule", "PATCH", { anchor, odd: parity === "\u0641\u0631\u062F" }, { id: "eq.1" });
  await send(chat, `\u0645\u0628\u0646\u0627\u06CC \u0647\u0641\u062A\u0647 \u0631\u0648\u06CC ${date} (${parity}) \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F.`);
}
function currentWeek(anchor, odd, today, includeBeforeAnchor = false) {
  const start = Date.parse(anchor);
  const elapsed = Math.floor((Date.parse(today) - start) / (7 * dayMs));
  if (!Number.isFinite(elapsed) || !includeBeforeAnchor && elapsed < 0) return null;
  return { date: new Date(start + elapsed * 7 * dayMs).toISOString().slice(0, 10), odd: elapsed % 2 === 0 ? odd : !odd };
}
async function deliverWeekNotices(request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (request.method !== "GET") return reply({ error: "Unauthorized" }, 401);
  const daily = Boolean(secret && equalSecret(authorization, `Bearer ${secret}`));
  if (!daily) {
    const key = /^Bearer ([a-f0-9-]{72})$/.exec(authorization)?.[1];
    if (!key || !await rpc("portal_valid_week_worker", { p_key: key }).catch(() => false)) return reply({ error: "Unauthorized" }, 401);
  }
  const announcements = deliverQueuedAnnouncements().catch(() => {
  });
  const precise = !daily || await automationReady();
  let fallback = null;
  if (!precise) {
    const [schedule] = await query("portal_week_schedule", { id: "eq.1", select: "anchor,odd" });
    fallback = schedule && currentWeek(schedule.anchor, schedule.odd, dateFormat.format(/* @__PURE__ */ new Date()));
    if (!fallback) {
      await announcements;
      return reply({ sent: 0 });
    }
  }
  let sent = 0;
  const deadline = Date.now() + 43e3;
  while (Date.now() < deadline) {
    const legacyWeek = fallback;
    const batch = legacyWeek ? await rpc("portal_claim_week", { p_week: legacyWeek.date, p_count: 12 }).then((rows) => rows.map((row) => ({ ...row, week_date: legacyWeek.date, is_odd: legacyWeek.odd, upcoming: false }))) : await rpc("portal_claim_due_weeks", { p_count: 12 });
    if (!batch.length) break;
    await Promise.allSettled(batch.map(async ({ chat_id, week_date, is_odd, upcoming }) => {
      const [current] = await query("portal_week_subscriptions", { chat_id: `eq.${chat_id}`, select: "enabled,weekday,minute_of_day" });
      if (!current?.enabled || fallback && (current.weekday !== 6 || current.minute_of_day !== 360)) return;
      await send(chat_id, `\u062F\u0631\u0648\u062F\u060C
${upcoming ? "\u0647\u0641\u062A\u0647\u0654 \u067E\u06CC\u0634\u200C\u0631\u0648" : "\u0627\u06CC\u0646 \u0647\u0641\u062A\u0647"} ${is_odd ? "\u0641\u0631\u062F" : "\u0632\u0648\u062C"} \u0627\u0633\u062A.
\u0645\u0648\u0641\u0642 \u0628\u0627\u0634\u06CC\u062F.`);
      await write("portal_week_subscriptions", "PATCH", { last_week: week_date, lease_until: null }, { chat_id: `eq.${chat_id}` });
      sent++;
    }));
  }
  await announcements;
  return reply({ sent });
}
export {
  askWeekTime,
  currentWeek,
  deliverWeekNotices,
  legacyUsersLabel,
  listAccounts,
  manageListedUser,
  noticesLabel,
  setCustomWeekTime,
  setWeekAnchor,
  setWeekSubscription,
  showCurrentWeek,
  todayWeekLabel,
  usersLabel,
  weekLabel,
  weekMenu,
  weekPrompt,
  weekSettingsLabel,
  weekTimePrompt
};
