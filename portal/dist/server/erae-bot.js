import { accountForChat } from "./account-actions.js";
import { reviewStatusText } from "./account-review.js";
import { deletePresentation, editPresentation, expiration, ownedPresentations, rotatePresentationCode } from "./erae-owner.js";
import { issueLoginLink } from "./portal-entry.js";
import { limit, uuidPattern } from "./portal-store.js";
import { telegram } from "./telegram-delivery.js";
import { automationReady } from "./weekly-worker.js";
const myPresentationsLabel = "\u0627\u0631\u0627\u0626\u0647\u200C\u0647\u0627\u06CC \u0645\u0646";
const titlePrompt = "\u0639\u0646\u0648\u0627\u0646 \u062C\u062F\u06CC\u062F \u0627\u0631\u0627\u0626\u0647 \u0631\u0627 \u062F\u0631 \u067E\u0627\u0633\u062E \u0628\u0647 \u0647\u0645\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F.";
const captionPrompt = "\u06A9\u067E\u0634\u0646 \u062C\u062F\u06CC\u062F \u0627\u0631\u0627\u0626\u0647 \u0631\u0627 \u062F\u0631 \u067E\u0627\u0633\u062E \u0628\u0647 \u0647\u0645\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F. \u0628\u0631\u0627\u06CC \u062E\u0627\u0644\u06CC\u200C\u06A9\u0631\u062F\u0646\u060C \u06CC\u06A9 \u062E\u0637 \u062A\u06CC\u0631\u0647 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F.";
const send = (chat, text, markup) => telegram("sendMessage", { chat_id: chat, text, reply_markup: markup, protect_content: true });
const button = (text, operation, id = "") => ({ text, callback_data: `erae:${operation}:${id}` });
function needPresentationAccount(chat) {
  return send(chat, "\u0644\u0637\u0641\u0627\u064B \u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC IEAUM \u0628\u0633\u0627\u0632\u06CC\u062F \u06CC\u0627 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC \u062E\u0648\u062F \u0634\u0648\u06CC\u062F.", {
    inline_keyboard: [[{ text: "\u0633\u0627\u062E\u062A \u062D\u0633\u0627\u0628", url: "https://t.me/ieaumbot?start=signup" }, { text: "\u0648\u0631\u0648\u062F \u0628\u0647 \u062D\u0633\u0627\u0628", url: "https://ieaum.ir/panel/" }]]
  });
}
function unavailableAccount(chat, account) {
  if (!account) return needPresentationAccount(chat);
  return send(chat, account.review_status === "approved" ? "\u062D\u0633\u0627\u0628 \u062F\u0631 \u062D\u0627\u0644 \u062D\u0627\u0636\u0631 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A." : reviewStatusText[account.review_status]);
}
async function presentationMenu(chat, account) {
  if (!account?.active) return unavailableAccount(chat, account);
  const url = await issueLoginLink(account.id, chat, "presentation");
  await send(chat, "\u0627\u0631\u0627\u0626\u0647\u200C\u0637\u0648\u0631\u06CC", { inline_keyboard: [[{ text: "\u0627\u06CC\u062C\u0627\u062F \u0627\u0631\u0627\u0626\u0647", url }, button(myPresentationsLabel, "list")]] });
}
async function showPresentations(chat) {
  const account = await accountForChat(chat);
  if (!account?.active) return unavailableAccount(chat, account);
  const rooms = await ownedPresentations(account.id);
  await send(chat, rooms.length ? "\u0627\u0631\u0627\u0626\u0647\u0654 \u0645\u0648\u0631\u062F\u0646\u0638\u0631 \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F." : "\u0647\u0646\u0648\u0632 \u0627\u0631\u0627\u0626\u0647\u200C\u0627\u06CC \u0646\u062F\u0627\u0631\u06CC\u062F.", {
    inline_keyboard: rooms.map((room) => [button(room.moderation_disabled ? "\u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \xB7 " + room.title : room.title, "open", room.id)])
  });
}
async function handlePresentationCallback(callback) {
  const privateChat = callback.message?.chat;
  if (privateChat?.type !== "private" || !Number.isSafeInteger(privateChat.id) || privateChat.id !== callback.from?.id || typeof callback.id !== "string") return;
  const chat = String(privateChat.id);
  const answer = (text = "") => telegram("answerCallbackQuery", { callback_query_id: callback.id, text });
  const [, operation, id] = callback.data?.split(":") ?? [];
  if (operation === "list") {
    await answer();
    return showPresentations(chat);
  }
  if (!uuidPattern.test(id ?? "")) return answer("\u0627\u0631\u0627\u0626\u0647 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  const account = await accountForChat(chat);
  const [room] = account?.active ? await ownedPresentations(account.id, id, operation === "links") : [];
  if (!room) return answer("\u0627\u06CC\u0646 \u0627\u0631\u0627\u0626\u0647 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A.");
  if (room.moderation_disabled && operation !== "delete" && operation !== "purge") return answer("\u0627\u06CC\u0646 \u0627\u0631\u0627\u0626\u0647 \u062A\u0648\u0633\u0637 \u0645\u062F\u06CC\u0631 IEAUM \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0634\u062F\u0647 \u0627\u0633\u062A.");
  if (operation === "open") {
    const [entry, autoDelete] = await Promise.all([issueLoginLink(account.id, chat, "presentation"), automationReady()]);
    const url = new URL(entry);
    url.searchParams.set("edit", id);
    await answer();
    await send(chat, room.title, { inline_keyboard: [
      [{ text: "\u0648\u06CC\u0631\u0627\u06CC\u0634 \u0627\u0631\u0627\u0626\u0647 \u062F\u0631 \u0633\u0627\u06CC\u062A", url: url.href }],
      [button("\u0648\u06CC\u0631\u0627\u06CC\u0634 \u0639\u0646\u0648\u0627\u0646", "title", id), button("\u0648\u06CC\u0631\u0627\u06CC\u0634 \u06A9\u067E\u0634\u0646", "caption", id), button("\u062D\u0630\u0641 \u0627\u0631\u0627\u0626\u0647", "delete", id)],
      [button("\u0645\u062F\u06CC\u0631\u06CC\u062A \u0644\u06CC\u0646\u06A9\u200C\u0647\u0627\u06CC \u0627\u0631\u0627\u0626\u0647", "links", id), button("\u062F\u0631\u06CC\u0627\u0641\u062A \u06A9\u062F \u0645\u062F\u06CC\u0631", "code", id)],
      ...autoDelete ? [[button("\u062D\u0630\u0641 \u0628\u0639\u062F \u0627\u0632 \u06F3 \u0631\u0648\u0632", "3", id), button("\u062D\u0630\u0641 \u0628\u0639\u062F \u0627\u0632 \u06F5 \u0631\u0648\u0632", "5", id), button("\u062D\u0630\u0641 \u062E\u0648\u062F\u06A9\u0627\u0631 \u062E\u0627\u0645\u0648\u0634", "keep", id)]] : [],
      [button("\u0628\u0627\u0632\u06AF\u0634\u062A \u0628\u0647 \u0627\u0631\u0627\u0626\u0647\u200C\u0647\u0627", "list")]
    ] });
  } else if (operation === "links") {
    const owner = new URL(await issueLoginLink(account.id, chat, "presentation"));
    owner.searchParams.set("admin", id);
    const viewer = room.published && room.join_code ? `https://ieaum.ir/erae-tori/?s=${encodeURIComponent(room.join_code)}` : null;
    await answer();
    await send(chat, `\u0644\u06CC\u0646\u06A9\u200C\u0647\u0627\u06CC \xAB${room.title}\xBB${viewer ? `

\u0644\u06CC\u0646\u06A9 \u0634\u0631\u06A9\u062A\u200C\u06A9\u0646\u0646\u062F\u06AF\u0627\u0646:
${viewer}` : "\n\u0644\u06CC\u0646\u06A9 \u0634\u0631\u06A9\u062A\u200C\u06A9\u0646\u0646\u062F\u06AF\u0627\u0646 \u067E\u0633 \u0627\u0632 \u0627\u0646\u062A\u0634\u0627\u0631 \u0622\u0645\u0627\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F."}`, {
      inline_keyboard: [[{ text: "\u0628\u0627\u0632 \u06A9\u0631\u062F\u0646 \u06A9\u0646\u062A\u0631\u0644 \u0627\u0631\u0627\u0626\u0647", url: owner.href }], [button("\u0628\u0627\u0632\u06AF\u0634\u062A", "open", id)]]
    });
  } else if (operation === "code") {
    await answer();
    await send(chat, "\u06A9\u062F \u0645\u062F\u06CC\u0631 \u0641\u0639\u0644\u06CC \u0641\u0642\u0637 \u0647\u0646\u06AF\u0627\u0645 \u0635\u062F\u0648\u0631 \u0646\u0645\u0627\u06CC\u0634 \u062F\u0627\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F. \u0635\u062F\u0648\u0631 \u06A9\u062F \u062A\u0627\u0632\u0647\u060C \u06A9\u062F \u0642\u0628\u0644\u06CC \u0631\u0627 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0645\u06CC\u200C\u06A9\u0646\u062F.", {
      inline_keyboard: [[button("\u0635\u062F\u0648\u0631 \u06A9\u062F \u062A\u0627\u0632\u0647", "rotate", id), button("\u0627\u0646\u0635\u0631\u0627\u0641", "open", id)]]
    });
  } else if (operation === "rotate") {
    await limit(`erae-code:${account.id}`, 15);
    const code = await rotatePresentationCode(account.id, id);
    await answer("\u06A9\u062F \u062A\u0627\u0632\u0647 \u0635\u0627\u062F\u0631 \u0634\u062F.");
    await send(chat, `\u06A9\u062F \u062A\u0627\u0632\u0647\u0654 \u0645\u062F\u06CC\u0631 \u0628\u0631\u0627\u06CC \xAB${room.title}\xBB
${code}`);
  } else if (operation === "title" || operation === "caption") {
    await answer();
    await send(chat, `${operation === "title" ? titlePrompt : captionPrompt}
${id}`, { force_reply: true });
  } else if (operation === "delete") {
    await answer();
    await send(chat, `\xAB${room.title}\xBB \u0648 \u0647\u0645\u0647\u0654 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0622\u0646 \u062D\u0630\u0641 \u0634\u0648\u062F\u061F`, { inline_keyboard: [[button("\u062A\u0623\u06CC\u06CC\u062F \u062D\u0630\u0641", "purge", id), button("\u0627\u0646\u0635\u0631\u0627\u0641", "open", id)]] });
  } else if (operation === "purge") {
    const removed = await deletePresentation(account.id, id);
    await answer(removed.length ? "\u0627\u0631\u0627\u0626\u0647 \u062D\u0630\u0641 \u0634\u062F." : "\u0627\u0631\u0627\u0626\u0647 \u067E\u06CC\u0634\u200C\u062A\u0631 \u062D\u0630\u0641 \u0634\u062F\u0647 \u0627\u0633\u062A.");
    if (removed.length) await showPresentations(chat);
  } else if (operation === "3" || operation === "5" || operation === "keep") {
    if (operation !== "keep" && !await automationReady()) return answer("\u062D\u0630\u0641 \u062E\u0648\u062F\u06A9\u0627\u0631 \u0647\u0646\u0648\u0632 \u0641\u0639\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
    const saved = await editPresentation(account.id, id, { expires_at: expiration(operation === "keep" ? null : operation) });
    await answer(saved.length ? "\u0632\u0645\u0627\u0646 \u062D\u0630\u0641 \u062E\u0648\u062F\u06A9\u0627\u0631 \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F." : "\u0627\u0631\u0627\u0626\u0647 \u062F\u06CC\u06AF\u0631 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A.");
  } else await answer("\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
}
async function handlePresentationEdit(chat, prompt, value) {
  const [label, id, extra] = prompt?.split("\n") ?? [];
  if (label !== titlePrompt && label !== captionPrompt || extra || !uuidPattern.test(id ?? "")) return false;
  const account = await accountForChat(chat);
  if (!account?.active) {
    await send(chat, "\u062D\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    return true;
  }
  const title = label === titlePrompt;
  if (!value || value.length > (title ? 120 : 800)) {
    await send(chat, `${label}
${id}`, { force_reply: true });
    return true;
  }
  const saved = await editPresentation(account.id, id, title ? { title: value } : { caption: value === "-" ? "" : value });
  await send(chat, saved.length ? "\u062A\u063A\u06CC\u06CC\u0631 \u0627\u0631\u0627\u0626\u0647 \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F." : "\u0627\u06CC\u0646 \u0627\u0631\u0627\u0626\u0647 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A.");
  return true;
}
export {
  handlePresentationCallback,
  handlePresentationEdit,
  myPresentationsLabel,
  presentationMenu,
  showPresentations
};
