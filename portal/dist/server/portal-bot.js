import { equalSecret, limit, PortalError, query, readBody, reply, setting } from "./portal-store.js";
import { admins, decideReview, notifyMembershipLogin, pendingReviews, reviewStatusText } from "./account-review.js";
import { telegram } from "./telegram-delivery.js";
import { liveCodeLabel, liveCodeOffline, liveCodeOnline, liveCodeUrl } from "../live-code.js";
import { issueLoginLink, issueResetCode } from "./portal-entry.js";
import { announcementInput, announcementLabel, announcementPrompt, decideAnnouncement, openAnnouncement } from "./admin-announcements.js";
import { askWeekTime, legacyUsersLabel, listAccounts, sendAccountsCsv, manageListedUser, noticesLabel, setCustomWeekTime, setWeekAnchor, setWeekSubscription, showCurrentWeek, todayWeekLabel, usersLabel, weekLabel, weekMenu, weekPrompt, weekSettingsLabel, weekTimePrompt } from "./bot-services.js";
import { accountForChat, handleAccountCallback, handleAccountReason, profileLabel, showProfile, statusMessage } from "./account-actions.js";
import { handlePresentationCallback, handlePresentationEdit, myPresentationsLabel, presentationMenu, showPresentations } from "./erae-bot.js";
import { presenceMenu, presenceMenuLabel, updatePresence } from "./site-management.js";
import { ownerTelegram } from "./presence.js";
import { recordBotContact } from "./bot-contacts.js";
import { channelCallback, channelMenu, channelsLabel, handleChannelReply, handleSharedChannel, requireMembership } from "./required-channels.js";
import { birthdayLabel, birthdayMenu, birthdayPrompt, handleBirthdayCallback, saveBirthdayTemplate } from "./bot-features.js";
const labels = {
  home: "\u0648\u0631\u0648\u062F \u0628\u0647 \u067E\u0646\u0644",
  solver: "\u0646\u0627\u0645\u0631\u0627\u0644\u0628",
  quizzes: "\u0622\u0632\u0645\u0648\u0646\u200C\u0647\u0627",
  student: "\u0633\u0627\u062E\u062A \u062D\u0633\u0627\u0628 \u062F\u0627\u0646\u0634\u062C\u0648",
  teacher: "\u0633\u0627\u062E\u062A \u062D\u0633\u0627\u0628 \u0627\u0633\u062A\u0627\u062F",
  status: "\u0648\u0636\u0639\u06CC\u062A \u062D\u0633\u0627\u0628 \u0648 \u0627\u062A\u0635\u0627\u0644 \u062A\u0644\u06AF\u0631\u0627\u0645",
  about: "\u062F\u0631\u0628\u0627\u0631\u0647 \u0645\u0627",
  sizing: "\u0627\u0646\u062F\u0627\u0632 \u0628\u0631\u0627\u0646\u062F\u0627\u0632",
  talent: "\u0627\u0633\u062A\u0639\u062F\u0627\u062F\u062A\u0648",
  requests: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A\u200C\u0647\u0627\u06CC \u062B\u0628\u062A\u200C\u0646\u0627\u0645",
  reset: "\u0641\u0631\u0627\u0645\u0648\u0634\u06CC \u0631\u0645\u0632 \u0639\u0628\u0648\u0631",
  services: "\u0633\u0631\u0648\u06CC\u0633\u200C\u0647\u0627",
  presentation: "\u0627\u0631\u0627\u0626\u0647\u200C\u0637\u0648\u0631\u06CC",
  back: "\u0645\u0646\u0648\u06CC \u0627\u0635\u0644\u06CC"
};
const replyKeyboard = (rows) => ({
  keyboard: rows.map((row) => row.map((text) => ({ text }))),
  resize_keyboard: true,
  is_persistent: true,
  one_time_keyboard: false
});
const link = (text, url) => ({ text, url });
const miniApp = (text, params) => ({
  text,
  web_app: { url: new URL("/account/?" + params, "https://ieaum.ir").href }
});
function keyboard(chat, hasAccount) {
  const rows = [[labels.home, labels.services], [labels.quizzes, profileLabel], [noticesLabel, labels.about]];
  if (!hasAccount) rows.push([labels.student, labels.teacher]);
  if (admins().includes(chat)) rows.push([labels.requests, announcementLabel], [usersLabel, weekSettingsLabel], [birthdayLabel, channelsLabel]);
  if (chat === ownerTelegram) rows.push([presenceMenuLabel]);
  return replyKeyboard(rows);
}
async function sendReset(chat) {
  const account = await accountForChat(chat);
  if (!account?.active) {
    await telegram("sendMessage", { chat_id: chat, text: "\u0628\u0631\u0627\u06CC \u0628\u0627\u0632\u06CC\u0627\u0628\u06CC \u0631\u0645\u0632\u060C \u0627\u0632 \u062A\u0644\u06AF\u0631\u0627\u0645\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F \u06A9\u0647 \u0628\u0647 \u062D\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 IEAUM \u0645\u062A\u0635\u0644 \u0627\u0633\u062A." });
    return;
  }
  const code = await issueResetCode(account.id, chat);
  await telegram("sendMessage", {
    chat_id: chat,
    text: "\u0628\u0631\u0627\u06CC \u062A\u0639\u06CC\u06CC\u0646 \u0631\u0645\u0632 \u062C\u062F\u06CC\u062F\u060C \u0641\u0631\u0645 \u0628\u0627\u0632\u06CC\u0627\u0628\u06CC \u0631\u0627 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F. \u062F\u06A9\u0645\u0647 \u062A\u0627 \u06F1\u06F0 \u062F\u0642\u06CC\u0642\u0647 \u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.",
    reply_markup: { inline_keyboard: [[miniApp("\u062A\u0639\u06CC\u06CC\u0646 \u0631\u0645\u0632 \u062C\u062F\u06CC\u062F", "mode=reset&code=" + code)]] }
  });
}
function refreshPortalMenu(chat, hasAccount) {
  return telegram("sendMessage", {
    chat_id: chat,
    text: "\u0627\u0632 \u0645\u0646\u0648 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u0648\u0627\u0631\u062F \u0633\u0627\u06CC\u062A \u0634\u0648\u06CC\u062F \u06CC\u0627 \u0633\u0631\u0648\u06CC\u0633\u200C\u0647\u0627 \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F.",
    reply_markup: keyboard(chat, hasAccount)
  });
}
async function telegramWebhook(request) {
  if (!equalSecret(request.headers.get("x-telegram-bot-api-secret-token") ?? "", setting("TELEGRAM_WEBHOOK_SECRET"))) {
    throw new PortalError(403, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  }
  const update = await readBody(request);
  if (update.my_chat_member) {
    const membership = update.my_chat_member;
    const chat2 = membership.chat;
    const status = membership.new_chat_member?.status;
    if (chat2?.type === "private" && typeof chat2.id === "number" && Number.isSafeInteger(chat2.id) && chat2.id > 0 && (status === "member" || status === "kicked")) {
      await recordBotContact(chat2.id, status === "member", membership.date);
    }
    return reply({ ok: true });
  }
  if (update.callback_query) {
    const callback = update.callback_query;
    const channel = callback.message?.chat;
    if (typeof callback.data === "string" && callback.data.startsWith("membership:")) {
      try {
        await channelCallback(callback, async (chat2) => refreshPortalMenu(chat2, Boolean(await accountForChat(chat2))));
      } catch (error) {
        if (!(error instanceof PortalError) || error.status !== 429) throw error;
      }
      return reply({ ok: true });
    }
    if (channel?.type === "private" && channel.id === callback.from?.id && typeof callback.id === "string" && !await requireMembership(String(channel.id), admins().includes(String(channel.id)))) {
      await telegram("answerCallbackQuery", { callback_query_id: callback.id }).catch(() => {
      });
      return reply({ ok: true });
    }
    if (typeof callback.data === "string" && /^presence:(on|off|telegram|report)$/.test(callback.data)) {
      if (channel?.type === "private" && String(channel.id) === ownerTelegram && channel.id === callback.from?.id && typeof callback.id === "string") {
        await telegram("answerCallbackQuery", { callback_query_id: callback.id });
        await updatePresence(ownerTelegram, callback.data.slice("presence:".length));
      }
    } else if (callback.data === "accounts:csv") {
      if (channel?.type === "private" && Number.isSafeInteger(channel.id) && channel.id === callback.from?.id && typeof callback.id === "string") {
        const chat2 = String(channel.id);
        const allowed = admins().includes(chat2);
        await telegram("answerCallbackQuery", { callback_query_id: callback.id, ...allowed ? {} : { text: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631 \u0644\u0627\u0632\u0645 \u0627\u0633\u062A." } });
        if (allowed) await sendAccountsCsv(chat2).catch((error) => telegram("sendMessage", { chat_id: chat2, text: error instanceof PortalError ? error.message : "\u0627\u0631\u0633\u0627\u0644 \u0641\u0627\u06CC\u0644 \u0627\u0639\u0636\u0627 \u0645\u0645\u06A9\u0646 \u0646\u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F." }));
      }
    } else if (typeof callback.data === "string" && callback.data.startsWith("acct:")) await handleAccountCallback(callback, refreshPortalMenu, sendReset);
    else if (typeof callback.data === "string" && callback.data.startsWith("birthday:")) await handleBirthdayCallback(callback);
    else if (typeof callback.data === "string" && callback.data.startsWith("erae:")) await handlePresentationCallback(callback);
    else if (typeof callback.data === "string" && /^week:(on|off|fri|sat|custom)$/.test(callback.data)) {
      const chat2 = callback.message?.chat;
      if (chat2?.type === "private" && Number.isSafeInteger(chat2.id) && chat2.id === callback.from?.id && typeof callback.id === "string") {
        const recipient = String(chat2.id);
        await telegram("answerCallbackQuery", { callback_query_id: callback.id });
        if (callback.data === "week:custom") await askWeekTime(recipient);
        else {
          const schedule = callback.data === "week:fri" ? { weekday: 5, minute_of_day: 1260 } : callback.data === "week:sat" ? { weekday: 6, minute_of_day: 360 } : void 0;
          await setWeekSubscription(recipient, callback.data !== "week:off", schedule);
          await weekMenu(recipient);
        }
      }
    } else if (typeof callback.data === "string" && callback.data.startsWith("announce-")) await decideAnnouncement(callback);
    else await decideReview(callback);
    return reply({ ok: true });
  }
  const message = update.message;
  if (message?.chat?.type !== "private" || !message.from || typeof message.from.id !== "number" || !Number.isSafeInteger(message.from.id) || message.from.id <= 0 || message.chat.id !== message.from.id) return reply({ ok: true });
  const chat = String(message.from.id);
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const [command, input] = text.split(/\s+/, 2);
  const send = (text2, reply_markup) => telegram("sendMessage", { chat_id: chat, text: text2, reply_markup, link_preview_options: { is_disabled: true } });
  try {
    await recordBotContact(chat, true, message.date).catch(() => {
    });
    const isAdmin = admins().includes(chat);
    if (isAdmin && message.chat_shared) {
      await limit(`telegram:${chat}`, 25);
      await handleSharedChannel(chat, message.chat_shared, async () => {
        await refreshPortalMenu(chat, Boolean(await accountForChat(chat)));
      });
      return reply({ ok: true });
    }
    const replied = message.reply_to_message?.from?.is_bot === true ? message.reply_to_message : void 0;
    if (isAdmin && (text === announcementLabel || command === "/announce")) {
      await limit(`telegram:${chat}`, 25);
      await openAnnouncement(chat);
      return reply({ ok: true });
    }
    if (!text) return reply({ ok: true });
    await limit(`telegram:${chat}`, 25);
    if (!await requireMembership(chat, isAdmin)) return reply({ ok: true });
    if (isAdmin && (text === channelsLabel || command === "/channels")) {
      await channelMenu(chat);
      return reply({ ok: true });
    }
    if (replied && await handleChannelReply(chat, replied.text, text)) return reply({ ok: true });
    if (isAdmin && (text === birthdayLabel || command === "/birthday")) {
      await birthdayMenu(chat);
      return reply({ ok: true });
    }
    if (isAdmin && replied?.text === birthdayPrompt) {
      await saveBirthdayTemplate(chat, text);
      return reply({ ok: true });
    }
    if (message.reply_to_message?.from?.is_bot && await handleAccountReason(chat, message.reply_to_message.text, text)) return reply({ ok: true });
    if (message.reply_to_message?.from?.is_bot && await handlePresentationEdit(chat, message.reply_to_message.text, text)) return reply({ ok: true });
    if (message.reply_to_message?.from?.is_bot && message.reply_to_message.text === weekTimePrompt) {
      await setCustomWeekTime(chat, text);
      return reply({ ok: true });
    }
    if (text === myPresentationsLabel || command === "/presentations") {
      await showPresentations(chat);
      return reply({ ok: true });
    }
    if (chat === ownerTelegram && (text === presenceMenuLabel || command === "/presence")) {
      await presenceMenu(chat);
      return reply({ ok: true });
    }
    if (isAdmin && (text === usersLabel || text === legacyUsersLabel || command === "/users")) {
      await listAccounts(chat);
      return reply({ ok: true });
    }
    if (isAdmin && /^\d{1,8}$/.test(text.replace(/[۰-۹٠-٩]/g, "0"))) {
      await manageListedUser(chat, text);
      return reply({ ok: true });
    }
    if (isAdmin && (text === weekSettingsLabel || command === "/week_settings")) {
      await send(weekPrompt, { force_reply: true });
      return reply({ ok: true });
    }
    if (isAdmin && message.reply_to_message?.from?.is_bot && message.reply_to_message.text === weekPrompt) {
      await setWeekAnchor(chat, text);
      return reply({ ok: true });
    }
    if (isAdmin && await announcementInput(chat, message.message_id, text, replied?.text === announcementPrompt ? replied.message_id : void 0)) return reply({ ok: true });
    if (text === weekLabel || command === "/week") {
      await weekMenu(chat);
      return reply({ ok: true });
    }
    if (text === noticesLabel) {
      await send("\u06CC\u06A9\u06CC \u0627\u0632 \u06AF\u0632\u06CC\u0646\u0647\u200C\u0647\u0627\u06CC \u0627\u0639\u0644\u0627\u0646 \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F.", replyKeyboard([[weekLabel, todayWeekLabel], [labels.back]]));
      return reply({ ok: true });
    }
    if (text === todayWeekLabel) {
      await showCurrentWeek(chat);
      return reply({ ok: true });
    }
    const [account] = await query("portal_profiles", {
      telegram_id: `eq.${chat}`,
      select: "id,active,review_status",
      limit: "1"
    });
    const menu = keyboard(chat, Boolean(account));
    const login = async (target, linkAccount = false) => {
      if (command === "/start") await refreshPortalMenu(chat, Boolean(account)).catch(() => {
      });
      if (account?.review_status === "pending" && !linkAccount) await notifyMembershipLogin(account.id).catch(() => {
      });
      if (account?.active && !linkAccount) {
        const button2 = target === "solver" ? "\u0648\u0631\u0648\u062F \u0628\u0647 \u0646\u0627\u0645\u0631\u0627\u0644\u0628" : labels.home;
        const url = await issueLoginLink(account.id, chat, target);
        await send("\u0628\u0631\u0627\u06CC \u0648\u0631\u0648\u062F \u06A9\u0644\u06CC\u06A9 \u0646\u0645\u0627\u06CC\u06CC\u062F.", { inline_keyboard: [[link(button2, url)]] });
        return;
      }
      if (account && !account.active) {
        await send(account.review_status === "approved" ? "\u062D\u0633\u0627\u0628 \u062F\u0631 \u062D\u0627\u0644 \u062D\u0627\u0636\u0631 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A." : reviewStatusText[account.review_status], menu);
        return;
      }
      const route = target === "solver" ? setting("PORTAL_ORIGIN") : "https://ieaum.ir/panel/";
      const button = link("\u0648\u0631\u0648\u062F", route);
      await send("\u0628\u0631\u0627\u06CC \u0648\u0631\u0648\u062F \u06A9\u0644\u06CC\u06A9 \u0646\u0645\u0627\u06CC\u06CC\u062F.", { inline_keyboard: [[linkAccount ? miniApp("\u0627\u062A\u0635\u0627\u0644 \u062D\u0633\u0627\u0628 \u062A\u0644\u06AF\u0631\u0627\u0645", "mode=link&to=panel") : button]] });
    };
    const signup = async (role) => {
      if (account) {
        await send("\u0642\u0628\u0644\u0627\u064B \u062D\u0633\u0627\u0628 IEAUM \u0633\u0627\u062E\u062A\u0647\u200C\u0627\u06CC\u062F. \u0627\u0632 \u06AF\u0632\u06CC\u0646\u0647\u0654 \u0648\u0631\u0648\u062F \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F.", menu);
        return;
      }
      if (command === "/start") await refreshPortalMenu(chat, false).catch(() => {
      });
      await send("\u0641\u0631\u0645 \u0633\u0627\u062E\u062A \u062D\u0633\u0627\u0628 \u0631\u0627 \u062F\u0631 \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F.", { inline_keyboard: [[miniApp(labels[role], "role=" + role)]] });
    };
    if (isAdmin && (command === "/requests" || text === labels.requests || text === "\u062F\u0639\u0648\u062A \u062F\u0627\u0646\u0634\u062C\u0648" || command === "/student")) {
      await pendingReviews(chat);
    } else if (command === "/start" && input === "signup") {
      if (account) await send("\u0642\u0628\u0644\u0627\u064B \u062D\u0633\u0627\u0628 IEAUM \u0633\u0627\u062E\u062A\u0647\u200C\u0627\u06CC\u062F. \u0627\u0632 \u06AF\u0632\u06CC\u0646\u0647\u0654 \u0648\u0631\u0648\u062F \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F.", menu);
      else {
        await refreshPortalMenu(chat, false).catch(() => {
        });
        await send("\u0646\u0648\u0639 \u062D\u0633\u0627\u0628 \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F \u062A\u0627 \u0641\u0631\u0645 \u0645\u0633\u062A\u0642\u06CC\u0645 \u062F\u0631 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0628\u0627\u0632 \u0634\u0648\u062F.", {
          inline_keyboard: [[miniApp(labels.student, "role=student")], [miniApp(labels.teacher, "role=teacher")]]
        });
      }
    } else if (text === labels.teacher || text === "\u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u062D\u0633\u0627\u0628 \u0627\u0633\u062A\u0627\u062F" || text === "\u062F\u0639\u0648\u062A \u0627\u0633\u062A\u0627\u062F" || command === "/teacher" || command === "/start" && input === "teacher") {
      await signup("teacher");
    } else if (text === labels.student || command === "/start" && input === "student") {
      await signup("student");
    } else if (text === labels.home || text === "\u0648\u0631\u0648\u062F \u0628\u0647 \u0633\u0627\u06CC\u062A" || command === "/site" || command === "/start" && input === "home") {
      await login("panel");
    } else if (text === labels.services || command === "/services") {
      await send("\u06CC\u06A9 \u0633\u0631\u0648\u06CC\u0633 \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F.", replyKeyboard([[labels.solver, labels.presentation], [labels.sizing, labels.talent], [liveCodeLabel], [labels.back]]));
    } else if (text === liveCodeLabel) {
      if (await liveCodeOnline()) await send(liveCodeLabel, { inline_keyboard: [[link("\u0648\u0631\u0648\u062F \u0628\u0647 \u0627\u062C\u0631\u0627\u06CC \u0632\u0646\u062F\u0647 \u06A9\u062F", liveCodeUrl)]] });
      else await send(liveCodeOffline);
    } else if (text === labels.presentation || command === "/presentation" || command === "/start" && input === "presentation") {
      if (command === "/start") await refreshPortalMenu(chat, Boolean(account)).catch(() => {
      });
      await presentationMenu(chat, account);
    } else if ([labels.solver, "\u0646\u0627\u0645\u0631\u0627\u0644\u064E\u0628"].includes(text) || command === "/numralab" || command === "/start" && input === "solver") {
      await login("solver");
    } else if ([labels.quizzes, "\u0648\u0631\u0648\u062F \u0628\u0647 \u067E\u0646\u0644"].includes(text) || ["/panel", "/quizzes"].includes(command) || command === "/start" && input === "login") {
      await login("panel");
    } else if (text === labels.reset || command === "/reset" || command === "/start" && input === "reset") {
      if (command === "/start") await refreshPortalMenu(chat, Boolean(account)).catch(() => {
      });
      await sendReset(chat);
    } else if (text === labels.sizing || text === labels.talent) {
      await send("\u0627\u06CC\u0646 \u0633\u0631\u0648\u06CC\u0633 \u0628\u0647 \u0632\u0648\u062F\u06CC \u0627\u0631\u0627\u0626\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F.");
    } else if (text === labels.about || text === "\u0631\u0627\u0647\u0646\u0645\u0627" || command === "/about") {
      await send("\u062F\u0633\u062A\u06CC\u0627\u0631 \u0645\u0647\u0646\u062F\u0633\u0627\u0646 \u0635\u0646\u0627\u06CC\u0639 \u062F\u0627\u0646\u0634\u06AF\u0627\u0647 \u0622\u0632\u0627\u062F \u0645\u0634\u0647\u062F", { inline_keyboard: [[link("\u0648\u0631\u0648\u062F \u0628\u0647 \u06A9\u0627\u0646\u0627\u0644 \u062A\u0644\u06AF\u0631\u0627\u0645", "https://t.me/ieaum_club")]] });
    } else if (text === profileLabel || command === "/profile") {
      const profile = await accountForChat(chat);
      if (profile) await showProfile(chat, profile, miniApp("", "mode=profile").web_app.url);
      else await send("\u0647\u0646\u0648\u0632 \u062D\u0633\u0627\u0628\u06CC \u0628\u0647 \u0627\u06CC\u0646 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u062A\u0635\u0644 \u0646\u06CC\u0633\u062A.", { inline_keyboard: [
        [miniApp("\u0648\u0631\u0648\u062F \u0648 \u0627\u062A\u0635\u0627\u0644 \u062D\u0633\u0627\u0628", "mode=link&to=panel")],
        [miniApp(labels.student, "role=student"), miniApp(labels.teacher, "role=teacher")]
      ] });
    } else if (command === "/status" || text === labels.status || command === "/start" && input === "link") {
      if (!account) await login("panel", true);
      else {
        if (command === "/start") await refreshPortalMenu(chat, true).catch(() => {
        });
        const profile = await accountForChat(chat);
        if (profile) await send(statusMessage(profile));
      }
    } else if (command === "/id" || text === "\u0634\u0646\u0627\u0633\u0647\u0654 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u0646") {
      await send(`\u0634\u0646\u0627\u0633\u0647\u0654 \u0639\u062F\u062F\u06CC \u062A\u0644\u06AF\u0631\u0627\u0645 \u0634\u0645\u0627: ${chat}`, menu);
    } else {
      await send("\u0628\u0647 \u0631\u0628\u0627\u062A \u062F\u0633\u062A\u06CC\u0627\u0631 \u0645\u0647\u0646\u062F\u0633\u0627\u0646 \u0635\u0646\u0627\u06CC\u0639 \u062E\u0648\u0634 \u0622\u0645\u062F\u06CC\u062F.", menu);
    }
  } catch (error) {
    if (error instanceof PortalError && error.status === 429) await send(error.message);
    else throw error;
  }
  return reply({ ok: true });
}
function eligibleStudent(number) {
  return /^[0-9]{6,20}$/.test(number) && number.startsWith(setting("STUDENT_NUMBER_PREFIX"));
}
export {
  eligibleStudent,
  refreshPortalMenu,
  telegramWebhook
};
