import { admins } from "./account-review.js";
import { randomUUID } from "node:crypto";
import { recordBotContact } from "./bot-contacts.js";
import { PortalError, query, rpc, supabase, uuidPattern, write } from "./portal-store.js";
import { telegram, TelegramDeliveryError } from "./telegram-delivery.js";
const announcementLabel = "\u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC";
const announcementPrompt = "\u0645\u062A\u0646 \u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC \u0631\u0627 \u062F\u0631 \u067E\u0627\u0633\u062E \u0628\u0647 \u0647\u0645\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F \u062A\u0627 \u067E\u06CC\u0634\u200C\u0646\u0645\u0627\u06CC\u0634 \u0631\u0627 \u0628\u0628\u06CC\u0646\u06CC\u062F.";
const link_preview_options = { is_disabled: true };
const send = (chat_id, text, reply_markup) => telegram("sendMessage", { chat_id, text, reply_markup, link_preview_options });
const audienceLabel = { all: "\u0647\u0645\u0647\u0654 \u06A9\u0627\u0631\u0628\u0631\u0627\u0646 \u0631\u0628\u0627\u062A", accounts: "\u062F\u0627\u0631\u0646\u062F\u06AF\u0627\u0646 \u062D\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0645\u062A\u0635\u0644" };
const sendPreview = (chat, draft) => send(chat, `\u067E\u06CC\u0634\u200C\u0646\u0645\u0627\u06CC\u0634 \u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC

${draft.body}

\u06AF\u06CC\u0631\u0646\u062F\u06AF\u0627\u0646 \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F.`, {
  inline_keyboard: [
    [{ text: audienceLabel.all, callback_data: `announce-all:${draft.id}` }],
    [{ text: audienceLabel.accounts, callback_data: `announce-accounts:${draft.id}` }],
    [{ text: "\u0644\u063A\u0648", callback_data: `announce-cancel:${draft.id}` }]
  ]
});
function editAnnouncement(chat, messageId, text, reply_markup = { inline_keyboard: [] }) {
  if (!messageId) return send(chat, text, reply_markup);
  return telegram("editMessageText", { chat_id: chat, message_id: messageId, text, reply_markup, link_preview_options }).catch(() => send(chat, text, reply_markup));
}
async function openAnnouncement(chat) {
  const id = randomUUID();
  await supabase("/rest/v1/portal_announcement_composers?on_conflict=admin_telegram_id", "POST", {
    admin_telegram_id: chat,
    id,
    expires_at: new Date(Date.now() + 9e5).toISOString()
  }, false, void 0, "resolution=merge-duplicates");
  await send(chat, "\u0645\u062A\u0646 \u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC \u0631\u0627 \u062F\u0631 \u0686\u062A \u0628\u0641\u0631\u0633\u062A\u06CC\u062F \u062A\u0627 \u067E\u06CC\u0634\u200C\u0646\u0645\u0627\u06CC\u0634 \u0631\u0627 \u0628\u0628\u06CC\u0646\u06CC\u062F.", {
    inline_keyboard: [[{ text: "\u0644\u063A\u0648", callback_data: `announce-stop:${id}` }]]
  });
}
async function announcementInput(chat, messageId, text, legacyReply) {
  const cancel = text === "/cancel" || text === "\u0644\u063A\u0648";
  if (!cancel && (!text || text.startsWith("/") || !Number.isSafeInteger(messageId))) return false;
  const [pending] = await write("portal_announcement_composers", "DELETE", void 0, {
    admin_telegram_id: `eq.${chat}`,
    expires_at: `gt.${(/* @__PURE__ */ new Date()).toISOString()}`,
    select: "id"
  });
  if (!pending && !legacyReply) return false;
  if (legacyReply) await telegram("deleteMessage", { chat_id: chat, message_id: legacyReply }).catch(() => {
  });
  if (cancel) await send(chat, "\u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC \u0644\u063A\u0648 \u0634\u062F.");
  else await previewAnnouncement(chat, messageId, text);
  return true;
}
async function previewAnnouncement(chat, sourceMessageId, body) {
  if (!body || body.length > 3800) {
    await send(chat, "\u0645\u062A\u0646\u06CC \u062A\u0627 \u06F3\u06F8\u06F0\u06F0 \u0646\u0648\u06CC\u0633\u0647 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
    await openAnnouncement(chat);
    return;
  }
  let draft;
  try {
    [draft] = await write("portal_announcements", "POST", {
      admin_telegram_id: chat,
      source_message_id: sourceMessageId,
      body
    }, { select: "id,body" });
  } catch (error) {
    if (!(error instanceof PortalError) || error.status !== 409) throw error;
    [draft] = await query("portal_announcements", {
      admin_telegram_id: `eq.${chat}`,
      source_message_id: `eq.${sourceMessageId}`,
      state: "eq.draft",
      expires_at: `gt.${(/* @__PURE__ */ new Date()).toISOString()}`,
      select: "id,body"
    });
  }
  if (!draft) return;
  await sendPreview(chat, draft);
}
async function decideAnnouncement(callback) {
  if (typeof callback.id !== "string") return;
  const answer = (text) => telegram("answerCallbackQuery", { callback_query_id: callback.id, text }).catch(() => {
  });
  const [action, id] = (typeof callback.data === "string" ? callback.data : "").split(":");
  const chat = callback.message?.chat;
  if (chat?.type !== "private" || chat.id !== callback.from?.id || !admins().includes(String(chat.id)) || !uuidPattern.test(id ?? "") || !["announce-send", "announce-all", "announce-accounts", "announce-send-all", "announce-send-accounts", "announce-cancel", "announce-stop"].includes(action)) {
    await answer("\u0627\u062C\u0627\u0632\u0647\u0654 \u0627\u0646\u062C\u0627\u0645 \u0627\u06CC\u0646 \u06A9\u0627\u0631 \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F.");
    return;
  }
  const owner = String(chat.id);
  const messageId = callback.message?.message_id;
  const edit = (text) => editAnnouncement(owner, messageId, text);
  const filter = {
    id: `eq.${id}`,
    admin_telegram_id: `eq.${owner}`,
    state: "eq.draft",
    expires_at: `gt.${(/* @__PURE__ */ new Date()).toISOString()}`,
    select: "id,body"
  };
  const stale = "\u0627\u06CC\u0646 \u067E\u06CC\u0634\u200C\u0646\u0645\u0627\u06CC\u0634 \u0642\u0628\u0644\u0627\u064B \u0628\u0631\u0631\u0633\u06CC \u0634\u062F\u0647 \u06CC\u0627 \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A.";
  if (action === "announce-stop") {
    const [removed] = await write("portal_announcement_composers", "DELETE", void 0, { admin_telegram_id: `eq.${owner}`, id: `eq.${id}`, select: "id" });
    if (!removed) return answer(stale);
    await answer("\u0644\u063A\u0648 \u0634\u062F.");
    await edit("\u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC \u0644\u063A\u0648 \u0634\u062F.");
    return;
  }
  if (action === "announce-cancel") {
    const [draft] = await write("portal_announcements", "PATCH", { state: "cancelled" }, filter);
    if (!draft) return answer(stale);
    await answer("\u0644\u063A\u0648 \u0634\u062F.");
    await edit("\u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC \u0644\u063A\u0648 \u0634\u062F.");
    return;
  }
  const audience = action.endsWith("-all") ? "all" : "accounts";
  if (action === "announce-all" || action === "announce-accounts") {
    const [draft] = await query("portal_announcements", filter);
    if (!draft) return answer(stale);
    await answer("\u06AF\u06CC\u0631\u0646\u062F\u06AF\u0627\u0646 \u0627\u0646\u062A\u062E\u0627\u0628 \u0634\u062F\u0646\u062F.");
    await editAnnouncement(owner, messageId, `\u06AF\u06CC\u0631\u0646\u062F\u06AF\u0627\u0646: ${audienceLabel[audience]}

${draft.body}`, {
      inline_keyboard: [[
        { text: "\u062A\u0623\u06CC\u06CC\u062F \u0648 \u0627\u0631\u0633\u0627\u0644", callback_data: `announce-send-${audience}:${id}` },
        { text: "\u0644\u063A\u0648", callback_data: `announce-cancel:${id}` }
      ]]
    });
    return;
  }
  if (typeof messageId !== "number" || !Number.isSafeInteger(messageId) || messageId <= 0) return answer("\u067E\u06CC\u0627\u0645 \u062A\u0623\u06CC\u06CC\u062F \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  const count = await rpc("portal_enqueue_announcement", { p_id: id, p_admin: owner, p_message: messageId, p_audience: audience });
  if (count === null) return answer(stale);
  await answer("\u0627\u0631\u0633\u0627\u0644 \u062F\u0631 \u0635\u0641 \u0642\u0631\u0627\u0631 \u06AF\u0631\u0641\u062A.");
  await edit(`\u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC \u0628\u0631\u0627\u06CC \xAB${audienceLabel[audience]}\xBB \u062F\u0631 \u0635\u0641 \u0627\u0631\u0633\u0627\u0644 \u0627\u0633\u062A.
\u062A\u0639\u062F\u0627\u062F \u06AF\u06CC\u0631\u0646\u062F\u06AF\u0627\u0646: ${count.toLocaleString("fa-IR")}`);
}
async function deliver({ announcement_id, chat_id, body, attempts }) {
  let result = { state: "sent" };
  try {
    await send(chat_id, body);
  } catch (error) {
    result = { state: "failed" };
    if (error instanceof TelegramDeliveryError && error.status === 403) await recordBotContact(chat_id, false).catch(() => {
    });
    if (error instanceof TelegramDeliveryError && error.status === 429 && attempts < 3) {
      const delay = Number.isFinite(error.retryAfter) ? Math.max(1, error.retryAfter) + 1 : 60;
      result = { state: "pending", available_at: new Date(Date.now() + delay * 1e3).toISOString() };
    }
  }
  await write("portal_announcement_deliveries", "PATCH", result, { announcement_id: `eq.${announcement_id}`, chat_id: `eq.${chat_id}`, state: "eq.sending" });
}
async function deliverQueuedAnnouncements() {
  const deadline = Date.now() + 18e3;
  while (Date.now() < deadline) {
    const batch = await rpc("portal_claim_announcement_deliveries", { p_count: 12 });
    if (!batch.length) break;
    await Promise.allSettled(batch.map(deliver));
    await new Promise((resolve) => setTimeout(resolve, 1050));
  }
  const summaries = await rpc("portal_finish_announcements", {});
  await Promise.allSettled(summaries.map(async ({ announcement_id, admin_telegram_id, message_id, delivered, failed }) => {
    const summary = delivered + failed ? `\u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC \u067E\u0627\u06CC\u0627\u0646 \u06CC\u0627\u0641\u062A.
\u0627\u0631\u0633\u0627\u0644 \u0645\u0648\u0641\u0642: ${delivered.toLocaleString("fa-IR")}
\u0627\u0631\u0633\u0627\u0644 \u0646\u0627\u0645\u0648\u0641\u0642: ${failed.toLocaleString("fa-IR")}` : "\u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u06AF\u0631\u0648\u0647 \u06AF\u06CC\u0631\u0646\u062F\u0647\u200C\u0627\u06CC \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.";
    await editAnnouncement(admin_telegram_id, message_id, summary).catch(() => {
    });
    await write("portal_announcement_deliveries", "DELETE", void 0, { announcement_id: `eq.${announcement_id}` });
  }));
}
export {
  announcementInput,
  announcementLabel,
  announcementPrompt,
  decideAnnouncement,
  deliverQueuedAnnouncements,
  openAnnouncement,
  previewAnnouncement
};
