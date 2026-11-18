import { admins } from "./account-review.js";
import { PortalError, query, uuidPattern, write } from "./portal-store.js";
import { telegram } from "./telegram-delivery.js";
const announcementLabel = "\u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC";
const announcementPrompt = "\u0645\u062A\u0646 \u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC \u0631\u0627 \u062F\u0631 \u067E\u0627\u0633\u062E \u0628\u0647 \u0647\u0645\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F \u062A\u0627 \u067E\u06CC\u0634\u200C\u0646\u0645\u0627\u06CC\u0634 \u0631\u0627 \u0628\u0628\u06CC\u0646\u06CC\u062F.";
const link_preview_options = { is_disabled: true };
const send = (chat_id, text, reply_markup) => telegram("sendMessage", { chat_id, text, reply_markup, link_preview_options });
function openAnnouncement(chat) {
  return send(chat, announcementPrompt, { force_reply: true, input_field_placeholder: "\u0645\u062A\u0646 \u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC" });
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
  await send(chat, `\u067E\u06CC\u0634\u200C\u0646\u0645\u0627\u06CC\u0634 \u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC \u0628\u0647 \u062D\u0633\u0627\u0628\u200C\u0647\u0627\u06CC \u0641\u0639\u0627\u0644 \u0645\u062A\u0635\u0644 \u0628\u0647 \u062A\u0644\u06AF\u0631\u0627\u0645

${draft.body}`, {
    inline_keyboard: [[
      { text: "\u062A\u0623\u06CC\u06CC\u062F \u0648 \u0627\u0631\u0633\u0627\u0644", callback_data: `announce-send:${draft.id}` },
      { text: "\u0644\u063A\u0648", callback_data: `announce-cancel:${draft.id}` }
    ]]
  });
}
async function recipients() {
  const contacts = [];
  let after;
  while (true) {
    const page = await query("portal_profiles", {
      active: "eq.true",
      telegram_id: after ? `gt.${after}` : "not.is.null",
      select: "telegram_id",
      order: "telegram_id.asc",
      limit: "500"
    });
    contacts.push(...page.map(({ telegram_id }) => telegram_id));
    if (page.length < 500) return contacts;
    after = page.at(-1).telegram_id;
  }
}
async function decideAnnouncement(callback) {
  const stopAt = Date.now() + 45e3;
  if (typeof callback.id !== "string") return;
  const answer = (text) => telegram("answerCallbackQuery", { callback_query_id: callback.id, text }).catch(() => {
  });
  const [action, id] = (typeof callback.data === "string" ? callback.data : "").split(":");
  const chat = callback.message?.chat;
  if (chat?.type !== "private" || chat.id !== callback.from?.id || !admins().includes(String(chat.id)) || !uuidPattern.test(id ?? "") || !["announce-send", "announce-cancel"].includes(action)) {
    await answer("\u0627\u062C\u0627\u0632\u0647\u0654 \u0627\u0646\u062C\u0627\u0645 \u0627\u06CC\u0646 \u06A9\u0627\u0631 \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F.");
    return;
  }
  const owner = String(chat.id);
  const edit = (text) => telegram("editMessageText", {
    chat_id: owner,
    message_id: callback.message?.message_id,
    text,
    reply_markup: { inline_keyboard: [] }
  }).catch(() => send(owner, text));
  const filter = {
    id: `eq.${id}`,
    admin_telegram_id: `eq.${owner}`,
    state: "eq.draft",
    expires_at: `gt.${(/* @__PURE__ */ new Date()).toISOString()}`,
    select: "id,body"
  };
  const cancel = action === "announce-cancel";
  const contacts = cancel ? [] : await recipients();
  const [draft] = await write("portal_announcements", "PATCH", { state: cancel ? "cancelled" : "sending" }, filter);
  if (!draft) {
    await answer("\u0627\u06CC\u0646 \u067E\u06CC\u0634\u200C\u0646\u0645\u0627\u06CC\u0634 \u0642\u0628\u0644\u0627\u064B \u0628\u0631\u0631\u0633\u06CC \u0634\u062F\u0647 \u06CC\u0627 \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A.");
    return;
  }
  if (cancel) {
    await answer("\u0644\u063A\u0648 \u0634\u062F.");
    await edit("\u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC \u0644\u063A\u0648 \u0634\u062F.");
    return;
  }
  await answer("\u0627\u0631\u0633\u0627\u0644 \u0622\u063A\u0627\u0632 \u0634\u062F.");
  let sent = 0;
  let attempted = 0;
  while (attempted < contacts.length && Date.now() < stopAt) {
    if (attempted) await new Promise((resolve) => setTimeout(resolve, 1050));
    const results = await Promise.allSettled(contacts.slice(attempted, attempted + 20).map((id2) => send(id2, draft.body)));
    sent += results.filter(({ status }) => status === "fulfilled").length;
    attempted += results.length;
  }
  await write("portal_announcements", "PATCH", { state: "sent" }, { id: `eq.${draft.id}`, state: "eq.sending" });
  const failed = attempted - sent;
  const remaining = contacts.length - attempted;
  const summary = contacts.length ? `\u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC \u067E\u0627\u06CC\u0627\u0646 \u06CC\u0627\u0641\u062A.
\u0627\u0631\u0633\u0627\u0644 \u0645\u0648\u0641\u0642: ${sent.toLocaleString("fa-IR")}
\u0627\u0631\u0633\u0627\u0644 \u0646\u0627\u0645\u0648\u0641\u0642: ${failed.toLocaleString("fa-IR")}` + (remaining ? `
\u0627\u0631\u0633\u0627\u0644\u200C\u0646\u0634\u062F\u0647 \u0628\u0647\u200C\u062F\u0644\u06CC\u0644 \u067E\u0627\u06CC\u0627\u0646 \u0632\u0645\u0627\u0646: ${remaining.toLocaleString("fa-IR")}` : "") : "\u062D\u0633\u0627\u0628 \u0641\u0639\u0627\u0644\u0650 \u0645\u062A\u0635\u0644 \u0628\u0647 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0628\u0631\u0627\u06CC \u062F\u0631\u06CC\u0627\u0641\u062A \u0627\u06CC\u0646 \u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.";
  await edit(summary);
}
export {
  announcementLabel,
  announcementPrompt,
  decideAnnouncement,
  openAnnouncement,
  previewAnnouncement
};
