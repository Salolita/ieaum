import { admins } from "./account-review.js";
import { limit, MissingRelationError, query, write } from "./portal-store.js";
import { telegram } from "./telegram-delivery.js";
const channelTable = "portal_required_channels";
const maxChannels = 5;
const channelId = /^-[0-9]{5,16}$/;
const handle = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;
const invite = /^https:\/\/t\.me\/(?:\+[A-Za-z0-9_-]+|joinchat\/[A-Za-z0-9_-]+)$/;
const channelsLabel = "\u0639\u0636\u0648\u06CC\u062A \u0627\u062C\u0628\u0627\u0631\u06CC";
const prompt = "\u0634\u0646\u0627\u0633\u0647\u0654 @\u06A9\u0627\u0646\u0627\u0644 \u0631\u0627 \u062F\u0631 \u067E\u0627\u0633\u062E \u0628\u0647 \u0647\u0645\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F. \u0628\u0631\u0627\u06CC \u06A9\u0627\u0646\u0627\u0644 \u062E\u0635\u0648\u0635\u06CC\u060C \u0634\u0646\u0627\u0633\u0647\u0654 \u0639\u062F\u062F\u06CC \u0648 \u0633\u067E\u0633 \u0644\u06CC\u0646\u06A9 \u062F\u0639\u0648\u062A \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F.";
const checkButton = { text: "\u0639\u0636\u0648 \u0634\u062F\u0645\u060C \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646", callback_data: "membership:check" };
const send = (chat_id, text, reply_markup) => telegram("sendMessage", {
  chat_id,
  text,
  reply_markup,
  link_preview_options: { is_disabled: true }
});
const channels = (enabled = false) => query(channelTable, {
  order: "chat_id.asc",
  select: "chat_id,title,invite_url,enabled",
  ...enabled ? { enabled: "eq.true" } : {}
});
function member(status) {
  return ["creator", "administrator", "member"].includes(status.status) || status.status === "restricted" && status.is_member === true;
}
async function requireMembership(chat, isAdmin) {
  if (isAdmin) return true;
  const required = await channels(true).catch((error) => {
    if (error instanceof MissingRelationError) return [];
    throw error;
  });
  if (!required.length) return true;
  const results = await Promise.allSettled(required.map(async (channel) => member(await telegram("getChatMember", {
    chat_id: channel.chat_id,
    user_id: Number(chat)
  }))));
  if (results.every((result) => result.status === "fulfilled" && result.value)) return true;
  const missing = required.filter((_, index) => {
    const result = results[index];
    return result.status === "rejected" || !result.value;
  });
  await send(chat, results.some((result) => result.status === "rejected") ? "\u0628\u0631\u0631\u0633\u06CC \u0639\u0636\u0648\u06CC\u062A \u062F\u0631 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0641\u0639\u0644\u0627\u064B \u0645\u0645\u06A9\u0646 \u0646\u06CC\u0633\u062A. \u06A9\u0645\u06CC \u0628\u0639\u062F \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F." : "\u0628\u0631\u0627\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0627\u0632 \u0631\u0628\u0627\u062A\u060C \u062F\u0631 \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC \u0632\u06CC\u0631 \u0639\u0636\u0648 \u0634\u0648\u06CC\u062F \u0648 \u0639\u0636\u0648\u06CC\u062A \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F.", {
    inline_keyboard: [...missing.map((record) => [{ text: record.title, url: record.invite_url }]), [checkButton]]
  });
  return false;
}
async function channelMenu(chat) {
  if (!admins().includes(chat)) return;
  const records = await channels().catch((error) => {
    if (error instanceof MissingRelationError) return null;
    throw error;
  });
  if (!records) {
    await send(chat, "\u062A\u0646\u0638\u06CC\u0645 \u0639\u0636\u0648\u06CC\u062A \u0627\u062C\u0628\u0627\u0631\u06CC \u067E\u0633 \u0627\u0632 \u0622\u0645\u0627\u062F\u0647\u200C\u0634\u062F\u0646 \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0627\u0633\u062A.");
    return;
  }
  await send(chat, records.length ? records.map((record) => record.title + " \xB7 " + (record.enabled ? "\u0641\u0639\u0627\u0644" : "\u063A\u06CC\u0631\u0641\u0639\u0627\u0644")).join("\n") : "\u0639\u0636\u0648\u06CC\u062A \u0627\u062C\u0628\u0627\u0631\u06CC \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A. \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u06CC\u06A9 \u06A9\u0627\u0646\u0627\u0644 \u0627\u0636\u0627\u0641\u0647 \u06A9\u0646\u06CC\u062F.", {
    inline_keyboard: [
      [{ text: "\u0627\u0641\u0632\u0648\u062F\u0646 \u06A9\u0627\u0646\u0627\u0644", callback_data: "membership:add" }],
      ...records.map((record) => [{ text: record.title, callback_data: "membership:manage:" + record.chat_id }])
    ]
  });
}
async function validateChannel(input) {
  const [target, link, extra] = input.trim().split(/\s+/, 3);
  if (!target || extra || !handle.test(target) && !channelId.test(target) || link && !invite.test(link)) {
    throw new Error("\u0634\u0646\u0627\u0633\u0647\u0654 \u06A9\u0627\u0646\u0627\u0644 \u06CC\u0627 \u0644\u06CC\u0646\u06A9 \u062F\u0639\u0648\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  }
  const chat = await telegram("getChat", { chat_id: target });
  if (chat.type !== "channel" || !Number.isSafeInteger(chat.id) || !channelId.test(String(chat.id))) throw new Error("\u0641\u0642\u0637 \u06A9\u0627\u0646\u0627\u0644 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0642\u0627\u0628\u0644 \u062B\u0628\u062A \u0627\u0633\u062A.");
  const url = chat.username && handle.test("@" + chat.username) ? "https://t.me/" + chat.username : link;
  if (!url) throw new Error("\u0628\u0631\u0627\u06CC \u06A9\u0627\u0646\u0627\u0644 \u062E\u0635\u0648\u0635\u06CC\u060C \u0644\u06CC\u0646\u06A9 \u062F\u0639\u0648\u062A \u0644\u0627\u0632\u0645 \u0627\u0633\u062A.");
  await assertBotIsAdmin(String(chat.id));
  return { chat_id: String(chat.id), title: (chat.title || target).slice(0, 128), invite_url: url };
}
async function assertBotIsAdmin(chat) {
  const bot = await telegram("getMe", {});
  const self = await telegram("getChatMember", { chat_id: chat, user_id: bot.id });
  if (!["administrator", "creator"].includes(self.status)) throw new Error("\u0627\u0628\u062A\u062F\u0627 \u0631\u0628\u0627\u062A \u0631\u0627 \u0645\u062F\u06CC\u0631 \u06A9\u0627\u0646\u0627\u0644 \u06A9\u0646\u06CC\u062F.");
}
async function handleChannelReply(chat, reply, input) {
  if (!admins().includes(chat) || !reply) return false;
  const id = reply.startsWith(prompt + "\n") ? reply.slice(prompt.length + 1) : "";
  if (reply !== prompt && !channelId.test(id)) return false;
  try {
    const records = await channels();
    if (!id && records.length >= maxChannels) throw new Error("\u062D\u062F\u0627\u06A9\u062B\u0631 \u067E\u0646\u062C \u06A9\u0627\u0646\u0627\u0644 \u0642\u0627\u0628\u0644 \u062B\u0628\u062A \u0627\u0633\u062A.");
    if (id && !records.some((record2) => record2.chat_id === id)) throw new Error("\u06A9\u0627\u0646\u0627\u0644 \u0642\u0628\u0644\u06CC \u062F\u06CC\u06AF\u0631 \u062F\u0631 \u0641\u0647\u0631\u0633\u062A \u0646\u06CC\u0633\u062A.");
    const record = await validateChannel(input);
    if (id) await write(channelTable, "PATCH", record, { chat_id: "eq." + id });
    else await write(channelTable, "POST", record);
    await channelMenu(chat);
  } catch (error) {
    const message = error instanceof Error && error.message !== "Telegram delivery failed" ? error.message : "\u06A9\u0627\u0646\u0627\u0644 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A. \u0645\u062F\u06CC\u0631 \u0628\u0648\u062F\u0646 \u0631\u0628\u0627\u062A \u0631\u0627 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F.";
    await send(chat, message);
  }
  return true;
}
async function channelCallback(callback, onMember) {
  const chat = callback.message?.chat;
  if (chat?.type !== "private" || chat.id !== callback.from?.id || typeof callback.id !== "string") return;
  const id = String(chat.id);
  const isAdmin = admins().includes(id);
  const [, action, channel] = (callback.data ?? "").split(":");
  if (action !== "check" && !isAdmin) return;
  await telegram("answerCallbackQuery", { callback_query_id: callback.id }).catch(() => {
  });
  await limit("telegram:" + id, 25);
  if (action === "check") {
    if (await requireMembership(id, isAdmin)) await onMember(id);
    return;
  }
  if (action === "add") {
    await send(id, prompt, { force_reply: true });
    return;
  }
  if (action === "list") {
    await channelMenu(id);
    return;
  }
  if (!channelId.test(channel ?? "")) return;
  const filters = { chat_id: "eq." + channel };
  const [record] = await query(channelTable, filters);
  if (!record) {
    await channelMenu(id);
    return;
  }
  if (action === "manage") {
    const button = (text, next) => ({ text, callback_data: "membership:" + next + ":" + channel });
    await send(id, record.title + " \xB7 " + (record.enabled ? "\u0641\u0639\u0627\u0644" : "\u063A\u06CC\u0631\u0641\u0639\u0627\u0644"), {
      inline_keyboard: [
        [button(record.enabled ? "\u063A\u06CC\u0631\u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC" : "\u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC", record.enabled ? "off" : "on")],
        [button("\u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0627\u0646\u0627\u0644", "edit"), button("\u062D\u0630\u0641 \u06A9\u0627\u0646\u0627\u0644", "delete")],
        [{ text: "\u0641\u0647\u0631\u0633\u062A \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627", callback_data: "membership:list" }]
      ]
    });
  } else if (action === "edit") {
    await send(id, prompt + "\n" + channel, { force_reply: true });
  } else if (action === "delete") {
    await write(channelTable, "DELETE", void 0, filters);
    await channelMenu(id);
  } else if (action === "on" || action === "off") {
    if (action === "on") {
      try {
        await assertBotIsAdmin(channel);
      } catch {
        await send(id, "\u0641\u0639\u0627\u0644 \u0646\u0634\u062F. \u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631 \u0631\u0628\u0627\u062A \u0628\u0647 \u06A9\u0627\u0646\u0627\u0644 \u0631\u0627 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F.");
        return;
      }
    }
    await write(channelTable, "PATCH", { enabled: action === "on" }, filters);
    await channelMenu(id);
  }
}
export {
  channelCallback,
  channelMenu,
  channelsLabel,
  handleChannelReply,
  requireMembership
};
