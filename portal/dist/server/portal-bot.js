import { equalSecret, limit, PortalError, query, readBody, reply, setting } from "./portal-store.js";
import { admins, decideReview, pendingReviews, reviewStatusText } from "./account-review.js";
import { telegram } from "./telegram-delivery.js";
import { issueLoginLink, issueResetCode } from "./portal-entry.js";
import { announcementLabel, announcementPrompt, decideAnnouncement, openAnnouncement, previewAnnouncement } from "./admin-announcements.js";
const labels = {
  home: "\u0648\u0631\u0648\u062F \u0628\u0647 \u0633\u0627\u06CC\u062A",
  solver: "\u0646\u0627\u0645\u0631\u0627\u0644\u0628",
  quizzes: "\u0622\u0632\u0645\u0648\u0646\u200C\u0647\u0627",
  student: "\u0633\u0627\u062E\u062A \u062D\u0633\u0627\u0628 \u062F\u0627\u0646\u0634\u062C\u0648",
  teacher: "\u0633\u0627\u062E\u062A \u062D\u0633\u0627\u0628 \u0627\u0633\u062A\u0627\u062F",
  status: "\u0648\u0636\u0639\u06CC\u062A \u062D\u0633\u0627\u0628 \u0648 \u0627\u062A\u0635\u0627\u0644 \u062A\u0644\u06AF\u0631\u0627\u0645",
  about: "\u062F\u0631\u0628\u0627\u0631\u0647 \u0645\u0627",
  sizing: "\u0627\u0646\u062F\u0627\u0632 \u0628\u0631\u0627\u0646\u062F\u0627\u0632",
  talent: "\u0627\u0633\u062A\u0639\u062F\u0627\u062F\u062A\u0648",
  requests: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A\u200C\u0647\u0627\u06CC \u062B\u0628\u062A\u200C\u0646\u0627\u0645",
  reset: "\u0641\u0631\u0627\u0645\u0648\u0634\u06CC \u0631\u0645\u0632 \u0639\u0628\u0648\u0631"
};
const link = (text, url) => ({ text, url });
const miniApp = (text, params) => ({
  text,
  web_app: { url: new URL("/register.html?" + params, setting("PORTAL_ORIGIN")).href }
});
function keyboard(chat, hasAccount) {
  const rows = [[labels.home, labels.solver], [labels.quizzes, labels.status]];
  if (!hasAccount) rows.push([labels.student, labels.teacher]);
  else rows.push([labels.reset]);
  rows.push([labels.sizing, labels.talent], [labels.about]);
  if (admins().includes(chat)) rows.push([labels.requests, announcementLabel]);
  return { keyboard: rows.map((row) => row.map((text) => ({ text }))), resize_keyboard: true, is_persistent: true };
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
  if (update.callback_query) {
    const callback = update.callback_query;
    if (typeof callback.data === "string" && callback.data.startsWith("announce-")) await decideAnnouncement(callback);
    else await decideReview(callback);
    return reply({ ok: true });
  }
  const message = update.message;
  if (message?.chat?.type !== "private" || !message.from || !Number.isSafeInteger(message.from.id) || message.chat.id !== message.from.id) return reply({ ok: true });
  const chat = String(message.from.id);
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const [command, input] = text.split(/\s+/, 2);
  const send = (text2, reply_markup) => telegram("sendMessage", { chat_id: chat, text: text2, reply_markup, link_preview_options: { is_disabled: true } });
  try {
    const isAdmin = admins().includes(chat);
    const repliesToAnnouncement = message.reply_to_message?.from?.is_bot === true && message.reply_to_message.text === announcementPrompt;
    if (isAdmin && (repliesToAnnouncement || text === announcementLabel || command === "/announce")) {
      await limit(`telegram:${chat}`, 25);
      if (repliesToAnnouncement && typeof message.message_id === "number" && Number.isSafeInteger(message.message_id)) {
        await previewAnnouncement(chat, message.message_id, text);
      } else {
        await openAnnouncement(chat);
      }
      return reply({ ok: true });
    }
    if (!text) return reply({ ok: true });
    await limit(`telegram:${chat}`, 25);
    const [account] = await query("portal_profiles", {
      telegram_id: `eq.${chat}`,
      select: "id,active,review_status",
      limit: "1"
    });
    const menu = keyboard(chat, Boolean(account));
    const login = async (target, linkAccount = false) => {
      if (command === "/start") await refreshPortalMenu(chat, Boolean(account)).catch(() => {
      });
      if (account?.active && !linkAccount) {
        const button = target === "home" ? labels.home : target === "solver" ? "\u0648\u0631\u0648\u062F \u0628\u0647 \u0646\u0627\u0645\u0631\u0627\u0644\u0628" : "\u0628\u0627\u0632 \u06A9\u0631\u062F\u0646 \u067E\u0646\u0644 \u0648 \u0622\u0632\u0645\u0648\u0646\u200C\u0647\u0627";
        const url = await issueLoginLink(account.id, chat, target);
        await send("\u0627\u06CC\u0646 \u0644\u06CC\u0646\u06A9 \u0627\u062E\u062A\u0635\u0627\u0635\u06CC \u062A\u0627 \u06F3 \u062F\u0642\u06CC\u0642\u0647 \u0648 \u0628\u0631\u0627\u06CC \u06CC\u06A9 \u0648\u0631\u0648\u062F \u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.", { inline_keyboard: [[link(button, url)]] });
        return;
      }
      if (account && !account.active) {
        await send(account.review_status === "approved" ? "\u062D\u0633\u0627\u0628 \u062F\u0631 \u062D\u0627\u0644 \u062D\u0627\u0636\u0631 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A." : reviewStatusText[account.review_status], menu);
        return;
      }
      const buttons = [miniApp("\u0648\u0631\u0648\u062F \u0628\u0627 \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u062A\u0644\u06AF\u0631\u0627\u0645", "mode=login&to=" + target)];
      const rows = target === "home" ? [[link(labels.home, "https://ieaum.ir/")], buttons] : [buttons];
      await send("\u0628\u0631\u0627\u06CC \u0648\u0631\u0648\u062F \u0628\u0647 \u062D\u0633\u0627\u0628\u060C \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u062A\u0644\u06AF\u0631\u0627\u0645 \u0631\u0627 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F.", { inline_keyboard: rows });
    };
    const signup = async (role) => {
      if (account) {
        await send("\u0642\u0628\u0644\u0627\u064B \u062D\u0633\u0627\u0628 \u0646\u0627\u0645\u0631\u0627\u0644\u0628 \u0633\u0627\u062E\u062A\u0647\u200C\u0627\u06CC\u062F. \u0627\u0632 \u06AF\u0632\u06CC\u0646\u0647\u0654 \u0648\u0631\u0648\u062F \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F.", menu);
        return;
      }
      await send("\u0641\u0631\u0645 \u0633\u0627\u062E\u062A \u062D\u0633\u0627\u0628 \u0631\u0627 \u062F\u0631 \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F.", { inline_keyboard: [[miniApp(labels[role], "role=" + role)]] });
    };
    if (isAdmin && (command === "/requests" || text === labels.requests || text === "\u062F\u0639\u0648\u062A \u062F\u0627\u0646\u0634\u062C\u0648" || command === "/student")) {
      await pendingReviews(chat);
    } else if (command === "/start" && input === "signup") {
      if (account) await send("\u0642\u0628\u0644\u0627\u064B \u062D\u0633\u0627\u0628 \u0646\u0627\u0645\u0631\u0627\u0644\u0628 \u0633\u0627\u062E\u062A\u0647\u200C\u0627\u06CC\u062F. \u0627\u0632 \u06AF\u0632\u06CC\u0646\u0647\u0654 \u0648\u0631\u0648\u062F \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F.", menu);
      else await send("\u0646\u0648\u0639 \u062D\u0633\u0627\u0628 \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F \u062A\u0627 \u0641\u0631\u0645 \u0645\u0633\u062A\u0642\u06CC\u0645 \u062F\u0631 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0628\u0627\u0632 \u0634\u0648\u062F.", {
        inline_keyboard: [[miniApp(labels.student, "role=student")], [miniApp(labels.teacher, "role=teacher")]]
      });
    } else if (text === labels.teacher || text === "\u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u062D\u0633\u0627\u0628 \u0627\u0633\u062A\u0627\u062F" || text === "\u062F\u0639\u0648\u062A \u0627\u0633\u062A\u0627\u062F" || command === "/teacher" || command === "/start" && input === "teacher") {
      await signup("teacher");
    } else if (text === labels.student || command === "/start" && input === "student") {
      await signup("student");
    } else if (text === labels.home || command === "/site" || command === "/start" && input === "home") {
      await login("home");
    } else if (text === labels.solver || command === "/numralab" || command === "/start" && input === "solver") {
      await login("solver");
    } else if ([labels.quizzes, "\u0648\u0631\u0648\u062F \u0628\u0647 \u067E\u0646\u0644"].includes(text) || ["/panel", "/quizzes"].includes(command) || command === "/start" && input === "login") {
      await login("panel");
    } else if (text === labels.reset || command === "/reset" || command === "/start" && input === "reset") {
      if (!account?.active) {
        await send("\u0628\u0631\u0627\u06CC \u0628\u0627\u0632\u06CC\u0627\u0628\u06CC \u0631\u0645\u0632\u060C \u0627\u0632 \u0647\u0645\u0627\u0646 \u062D\u0633\u0627\u0628 \u062A\u0644\u06AF\u0631\u0627\u0645\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F \u06A9\u0647 \u0628\u0647 \u062D\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u0627\u0645\u0631\u0627\u0644\u0628 \u0645\u062A\u0635\u0644 \u0627\u0633\u062A.", menu);
      } else {
        const code = await issueResetCode(account.id, chat);
        await send("\u0628\u0631\u0627\u06CC \u062A\u0639\u06CC\u06CC\u0646 \u0631\u0645\u0632 \u062C\u062F\u06CC\u062F\u060C \u0641\u0631\u0645 \u0628\u0627\u0632\u06CC\u0627\u0628\u06CC \u0631\u0627 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F. \u062F\u06A9\u0645\u0647 \u062A\u0627 \u06F1\u06F0 \u062F\u0642\u06CC\u0642\u0647 \u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.", {
          inline_keyboard: [[miniApp("\u062A\u0639\u06CC\u06CC\u0646 \u0631\u0645\u0632 \u062C\u062F\u06CC\u062F", "mode=reset&code=" + code)]]
        });
      }
    } else if (text === labels.sizing || text === labels.talent) {
      await send("\u0627\u06CC\u0646 \u0633\u0631\u0648\u06CC\u0633 \u0628\u0647 \u0632\u0648\u062F\u06CC \u0627\u0631\u0627\u0626\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F.", menu);
    } else if (text === labels.about || text === "\u0631\u0627\u0647\u0646\u0645\u0627" || command === "/about") {
      await send("\u062F\u0633\u062A\u06CC\u0627\u0631 \u0645\u0647\u0646\u062F\u0633\u0627\u0646 \u0635\u0646\u0627\u06CC\u0639 \u062F\u0627\u0646\u0634\u06AF\u0627\u0647 \u0622\u0632\u0627\u062F \u0645\u0634\u0647\u062F", { inline_keyboard: [[link("\u0648\u0631\u0648\u062F \u0628\u0647 \u06A9\u0627\u0646\u0627\u0644 \u062A\u0644\u06AF\u0631\u0627\u0645", "https://t.me/ieaum_club")]] });
    } else if (command === "/status" || text === labels.status || command === "/start" && input === "link") {
      if (!account) await login("panel", true);
      else await send(account.review_status === "approved" && !account.active ? "\u062D\u0633\u0627\u0628 \u062F\u0631 \u062D\u0627\u0644 \u062D\u0627\u0636\u0631 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A." : reviewStatusText[account.review_status], menu);
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
