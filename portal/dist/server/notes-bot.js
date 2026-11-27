import { ownerTelegram } from "./presence.js";
import { limit, query, write } from "./portal-store.js";
import { telegram } from "./telegram-delivery.js";
const notesLabel = "\u062C\u0632\u0648\u0627\u062A";
const notesPrompt = "\u0644\u06CC\u0646\u06A9 \u06AF\u0631\u0648\u0647 \u062C\u0632\u0648\u0627\u062A \u0631\u0627 \u062F\u0631 \u067E\u0627\u0633\u062E \u0628\u0647 \u0647\u0645\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F. \u0628\u0631\u0627\u06CC \u062D\u0630\u0641 \u0644\u06CC\u0646\u06A9\u060C \u06CC\u06A9 \u062E\u0637 \u062A\u06CC\u0631\u0647 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F.";
function groupUrl(value) {
  if (value.length > 240 || !/^https:\/\/t\.me\/(?:[a-zA-Z][a-zA-Z0-9_]{3,31}|\+[A-Za-z0-9_-]{6,}|joinchat\/[A-Za-z0-9_-]{6,})\/?$/.test(value)) return null;
  return value;
}
async function notesMenu(chat) {
  const [settings] = await query("portal_bot_preferences", {
    id: "eq.1",
    select: "notes_group_url",
    limit: "1"
  });
  const url = settings?.notes_group_url ? groupUrl(settings.notes_group_url) : null;
  const rows = url ? [[{ text: "\u0648\u0631\u0648\u062F \u0628\u0647 \u06AF\u0631\u0648\u0647 \u062C\u0632\u0648\u0627\u062A", url }]] : [];
  await telegram("sendMessage", {
    chat_id: chat,
    text: url ? "\u0628\u0631\u0627\u06CC \u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u062C\u0632\u0648\u0627\u062A\u060C \u06AF\u0631\u0648\u0647 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0631\u0627 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F." : "\u0644\u06CC\u0646\u06A9 \u06AF\u0631\u0648\u0647 \u062C\u0632\u0648\u0627\u062A \u0647\u0646\u0648\u0632 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.",
    reply_markup: { inline_keyboard: [...rows, ...chat === ownerTelegram ? [[{ text: "\u062A\u0646\u0638\u06CC\u0645 \u0644\u06CC\u0646\u06A9 \u06AF\u0631\u0648\u0647", callback_data: "notes:link" }]] : []] },
    link_preview_options: { is_disabled: true }
  });
}
async function openNotesSettings(callback) {
  const chat = callback.message?.chat;
  if (typeof callback.id !== "string" || chat?.type !== "private" || chat.id !== callback.from?.id || String(chat.id) !== ownerTelegram) return;
  await telegram("answerCallbackQuery", { callback_query_id: callback.id });
  await telegram("sendMessage", {
    chat_id: ownerTelegram,
    text: notesPrompt,
    reply_markup: { force_reply: true },
    link_preview_options: { is_disabled: true }
  });
}
async function saveNotesLink(chat, replyTo, value) {
  if (chat !== ownerTelegram || replyTo !== notesPrompt) return false;
  await limit("notes-link:" + chat, 15);
  const url = groupUrl(value);
  if (!url && value !== "-") {
    await telegram("sendMessage", { chat_id: chat, text: "\u0646\u0634\u0627\u0646\u06CC \u0644\u06CC\u0646\u06A9 \u06AF\u0631\u0648\u0647 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \u0627\u0632 \u06CC\u06A9 \u0644\u06CC\u0646\u06A9 https://t.me \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F." });
    await telegram("sendMessage", { chat_id: chat, text: notesPrompt, reply_markup: { force_reply: true } });
    return true;
  }
  await write("portal_bot_preferences", "PATCH", { notes_group_url: url }, { id: "eq.1" });
  await notesMenu(chat);
  return true;
}
export {
  notesLabel,
  notesMenu,
  openNotesSettings,
  saveNotesLink
};
