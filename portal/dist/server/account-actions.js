import { admins, reviewStatusText } from "./account-review.js";
import { query, rpc, uuidPattern, write } from "./portal-store.js";
import { telegram } from "./telegram-delivery.js";
const profileLabel = "\u0646\u0645\u0627\u06CC\u0647 \u0645\u0646";
const statusLabel = "\u0648\u0636\u0639\u06CC\u062A \u062D\u0633\u0627\u0628 \u0648 \u0627\u062A\u0635\u0627\u0644 \u062A\u0644\u06AF\u0631\u0627\u0645";
const resetLabel = "\u0641\u0631\u0627\u0645\u0648\u0634\u06CC \u0631\u0645\u0632 \u0639\u0628\u0648\u0631";
const withdrawalLabel = "\u062D\u0630\u0641 \u062D\u0633\u0627\u0628";
const reasons = {
  disable: "\u0639\u0644\u062A \u063A\u06CC\u0631\u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u062D\u0633\u0627\u0628 \u0631\u0627 \u062F\u0631 \u067E\u0627\u0633\u062E \u0628\u0647 \u0647\u0645\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F.",
  purge: "\u0639\u0644\u062A \u062D\u0630\u0641 \u062F\u0627\u0626\u0645\u06CC \u062D\u0633\u0627\u0628 \u0631\u0627 \u062F\u0631 \u067E\u0627\u0633\u062E \u0628\u0647 \u0647\u0645\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F.",
  withdraw: "\u0639\u0644\u062A \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062D\u0630\u0641 \u062D\u0633\u0627\u0628\u062A\u0627\u0646 \u0631\u0627 \u062F\u0631 \u067E\u0627\u0633\u062E \u0628\u0647 \u0647\u0645\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F."
};
const operationLabels = { disable: "\u063A\u06CC\u0631\u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC", enable: "\u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC", purge: "\u062D\u0630\u0641 \u062F\u0627\u0626\u0645\u06CC", withdraw: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062D\u0630\u0641" };
const profileFields = "id,username,first_name,last_name,role,active,review_status,approved_at,telegram_id,former_telegram_id,phone,birth_date,student_number,course_name";
const actionFields = "id,actor_chat,profile_id,operation,reason";
const formatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", dateStyle: "long" });
const dateText = (date) => formatter.format(new Date(date));
const fullName = (account) => `${account.first_name} ${account.last_name} (${account.username})`;
const send = (chat, text, reply_markup) => telegram("sendMessage", { chat_id: chat, text, reply_markup, protect_content: true });
async function accountForChat(chat) {
  const [account] = await query("portal_profiles", { telegram_id: `eq.${chat}`, select: profileFields, limit: "1" });
  return account;
}
async function accountById(id) {
  const [account] = await query("portal_profiles", { id: `eq.${id}`, select: profileFields, limit: "1" });
  return account;
}
function statusMessage(account) {
  if (!account.active) return account.review_status === "approved" ? "\u062D\u0633\u0627\u0628 \u062F\u0631 \u062D\u0627\u0644 \u062D\u0627\u0636\u0631 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A." : reviewStatusText[account.review_status];
  return account.approved_at ? `\u062D\u0633\u0627\u0628 \u0634\u0645\u0627 \u0628\u0627 \u0622\u06CC\u062F\u06CC \u0639\u062F\u062F\u06CC (${account.telegram_id}) \u062A\u0648\u0633\u0637 \u0645\u062F\u06CC\u0631 \u062F\u0631 \u062A\u0627\u0631\u06CC\u062E (${dateText(account.approved_at)}) \u062A\u0623\u06CC\u06CC\u062F \u0634\u062F\u0647 \u0627\u0633\u062A\u060C \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u0627\u0632 \u0633\u0631\u0648\u06CC\u0633\u200C\u0647\u0627 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0646\u0645\u0627\u06CC\u06CC\u062F.` : `\u062D\u0633\u0627\u0628 \u0634\u0645\u0627 \u0628\u0627 \u0622\u06CC\u062F\u06CC \u0639\u062F\u062F\u06CC (${account.telegram_id}) \u062A\u0623\u06CC\u06CC\u062F \u0634\u062F\u0647 \u0627\u0633\u062A \u0648 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u0627\u0632 \u0633\u0631\u0648\u06CC\u0633\u200C\u0647\u0627 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0646\u0645\u0627\u06CC\u06CC\u062F. \u062A\u0627\u0631\u06CC\u062E \u062A\u0623\u06CC\u06CC\u062F \u0627\u06CC\u0646 \u062D\u0633\u0627\u0628 \u062F\u0631 \u0633\u0648\u0627\u0628\u0642 \u0642\u0628\u0644\u06CC \u062B\u0628\u062A \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.`;
}
async function showProfile(chat, account, editUrl) {
  const details = [
    profileLabel,
    `\u0646\u0627\u0645 \u0648 \u0646\u0627\u0645 \u062E\u0627\u0646\u0648\u0627\u062F\u06AF\u06CC: ${account.first_name} ${account.last_name}`,
    `\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC: ${account.username}`,
    `\u0646\u0648\u0639 \u062D\u0633\u0627\u0628: ${account.role === "student" ? "\u062F\u0627\u0646\u0634\u062C\u0648" : "\u0627\u0633\u062A\u0627\u062F"}`,
    `\u0634\u0645\u0627\u0631\u0647\u0654 \u062A\u0645\u0627\u0633: ${account.phone ?? "\u062B\u0628\u062A \u0646\u0634\u062F\u0647"}`,
    `\u062A\u0627\u0631\u06CC\u062E \u062A\u0648\u0644\u062F: ${account.birth_date ? dateText(`${account.birth_date}T12:00:00Z`) : "\u062B\u0628\u062A \u0646\u0634\u062F\u0647"}`,
    account.role === "student" ? `\u0634\u0645\u0627\u0631\u0647\u0654 \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC: ${account.student_number ?? "\u062B\u0628\u062A \u0646\u0634\u062F\u0647"}` : `\u0646\u0627\u0645 \u062F\u0631\u0633: ${account.course_name ?? "\u062B\u0628\u062A \u0646\u0634\u062F\u0647"}`,
    "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631: \u0641\u0642\u0637 \u0642\u0627\u0628\u0644 \u062A\u063A\u06CC\u06CC\u0631",
    statusMessage(account)
  ];
  const items = [{ text: statusLabel, callback_data: "acct:status" }];
  await send(chat, details.join("\n"), { inline_keyboard: [
    ...account.active ? [[{ text: "\u0648\u06CC\u0631\u0627\u06CC\u0634 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u062D\u0633\u0627\u0628", web_app: { url: editUrl } }, { text: withdrawalLabel, callback_data: "acct:withdraw" }]] : [],
    items,
    ...account.active ? [[{ text: resetLabel, callback_data: "acct:reset" }]] : []
  ] });
}
async function manageAccountRow(chat, id) {
  if (!admins().includes(chat) || !uuidPattern.test(id)) return;
  const account = await accountById(id);
  if (!account) return send(chat, "\u0627\u06CC\u0646 \u062D\u0633\u0627\u0628 \u062F\u06CC\u06AF\u0631 \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F. \u0641\u0647\u0631\u0633\u062A \u062D\u0633\u0627\u0628\u200C\u0647\u0627 \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F.");
  if (account.telegram_id && admins().includes(account.telegram_id)) return send(chat, "\u062D\u0633\u0627\u0628 \u0645\u062F\u06CC\u0631 \u0627\u0632 \u0627\u06CC\u0646 \u0645\u0646\u0648 \u0642\u0627\u0628\u0644 \u062A\u063A\u06CC\u06CC\u0631 \u0646\u06CC\u0633\u062A.");
  const operation = account.active ? "disable" : "enable";
  await send(chat, `\u0645\u062F\u06CC\u0631\u06CC\u062A \u062D\u0633\u0627\u0628 ${fullName(account)}`, { inline_keyboard: [[
    { text: operationLabels[operation], callback_data: `acct:${operation}:${account.id}` },
    { text: "\u062D\u0630\u0641 \u062F\u0627\u0626\u0645\u06CC", callback_data: `acct:purge:${account.id}` }
  ]] });
}
async function queueAction(chat, target, operation, reason) {
  const relevant = { actor_chat: `eq.${chat}`, profile_id: `eq.${target.id}`, operation: `eq.${operation}` };
  await write("portal_account_actions", "DELETE", void 0, { ...relevant, expires_at: `lte.${(/* @__PURE__ */ new Date()).toISOString()}` });
  const [existing] = await query("portal_account_actions", { ...relevant, select: actionFields, limit: "1" });
  const [created] = existing ? [existing] : await write("portal_account_actions", "POST", {
    actor_chat: chat,
    profile_id: target.id,
    operation,
    reason,
    expires_at: new Date(Date.now() + (operation === "withdraw" ? 7 * 864e5 : 9e5)).toISOString()
  }, { select: actionFields });
  const message = `${operationLabels[operation]} \u062D\u0633\u0627\u0628 ${fullName(target)}${created.reason ? `
\u0639\u0644\u062A: ${created.reason}` : ""}` + (operation === "purge" ? "\n\u062D\u0633\u0627\u0628 \u0648 \u062F\u0627\u062F\u0647\u200C\u0647\u0627\u06CC \u0648\u0627\u0628\u0633\u062A\u0647\u0654 \u0622\u0646 \u0628\u0631\u0627\u06CC \u0647\u0645\u06CC\u0634\u0647 \u062D\u0630\u0641 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F." : "");
  const keyboard = { inline_keyboard: [[
    { text: operation === "purge" ? "\u062A\u0623\u06CC\u06CC\u062F \u062D\u0630\u0641 \u062F\u0627\u0626\u0645\u06CC" : "\u062A\u0623\u06CC\u06CC\u062F", callback_data: `acct:yes:${created.id}` },
    { text: "\u0644\u063A\u0648", callback_data: `acct:no:${created.id}` }
  ]] };
  if (operation !== "withdraw") {
    await send(chat, message, keyboard);
    return;
  }
  const deliveries = await Promise.allSettled(admins().map((admin) => send(admin, message, keyboard)));
  await send(chat, deliveries.some((delivery) => delivery.status === "fulfilled") ? "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062B\u0628\u062A \u0634\u062F \u0648 \u062F\u0631 \u0627\u0646\u062A\u0638\u0627\u0631 \u0628\u0631\u0631\u0633\u06CC \u0627\u0633\u062A." : "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062B\u0628\u062A \u0634\u062F\u060C \u0627\u0645\u0627 \u0627\u0639\u0644\u0627\u0646 \u0628\u0647 \u0645\u062F\u06CC\u0631 \u0646\u0631\u0633\u06CC\u062F. \u0628\u0639\u062F\u0627\u064B \u062F\u0648\u0628\u0627\u0631\u0647 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0631\u0627 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F.");
}
function reasonPrompt(operation, id) {
  return `${reasons[operation]}
${id}`;
}
async function handleAccountReason(chat, prompt, text) {
  if (!prompt) return false;
  const [label, id, extra] = prompt.split("\n");
  const operation = Object.keys(reasons).find((key) => reasons[key] === label);
  if (!operation || extra || !uuidPattern.test(id ?? "")) return false;
  const target = await accountById(id);
  if (!target || target.telegram_id && admins().includes(target.telegram_id) || (operation === "withdraw" ? !target.active || target.telegram_id !== chat : !admins().includes(chat))) {
    await send(chat, "\u0627\u06CC\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    return true;
  }
  if (!text || text.length > 600) await send(chat, reasonPrompt(operation, id), { force_reply: true, selective: true });
  else await queueAction(chat, target, operation, text);
  return true;
}
async function handleAccountCallback(callback, refresh, reset) {
  const privateChat = callback.message?.chat;
  if (privateChat?.type !== "private" || !privateChat.id || privateChat.id !== callback.from?.id || typeof callback.id !== "string") return;
  const chat = String(privateChat.id);
  const answer = (text) => telegram("answerCallbackQuery", { callback_query_id: callback.id, text });
  const [, operation, id] = callback.data?.split(":") ?? [];
  const isAdmin = admins().includes(chat);
  if (operation === "status" || operation === "withdraw" || operation === "reset") {
    const account = await accountForChat(chat);
    if (!account) return answer("\u062D\u0633\u0627\u0628 \u0645\u062A\u0635\u0644 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    await answer("");
    if (operation === "status") await send(chat, statusMessage(account));
    else if (operation === "reset") await reset(chat);
    else if (account.active && !isAdmin) await send(chat, reasonPrompt("withdraw", account.id), { force_reply: true, selective: true });
    else await send(chat, "\u0627\u06CC\u0646 \u062D\u0633\u0627\u0628 \u0627\u0645\u06A9\u0627\u0646 \u0627\u0631\u0633\u0627\u0644 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062D\u0630\u0641 \u0646\u062F\u0627\u0631\u062F.");
    return;
  }
  if (!uuidPattern.test(id ?? "")) return answer("\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  if (operation === "yes" || operation === "no") {
    if (!isAdmin) return answer("\u0627\u062C\u0627\u0632\u0647\u0654 \u0628\u0631\u0631\u0633\u06CC \u0627\u06CC\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F.");
    const [task] = await query("portal_account_actions", { id: `eq.${id}`, expires_at: `gt.${(/* @__PURE__ */ new Date()).toISOString()}`, select: actionFields });
    if (!task) return answer("\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0642\u0628\u0644\u0627\u064B \u0628\u0631\u0631\u0633\u06CC \u0634\u062F\u0647 \u06CC\u0627 \u0645\u0647\u0644\u062A\u0634 \u06AF\u0630\u0634\u062A\u0647 \u0627\u0633\u062A.");
    if (task.operation !== "withdraw" && task.actor_chat !== chat) return answer("\u0627\u062C\u0627\u0632\u0647\u0654 \u0628\u0631\u0631\u0633\u06CC \u0627\u06CC\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F.");
    const target2 = await accountById(task.profile_id);
    const outcome = await rpc("portal_decide_account_action", { p_request: id, p_accept: operation === "yes", p_protected: admins() });
    if (outcome === "gone" || outcome === "protected") return answer("\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062F\u06CC\u06AF\u0631 \u0642\u0627\u0628\u0644 \u0627\u0646\u062C\u0627\u0645 \u0646\u06CC\u0633\u062A.");
    const recipient = task.operation === "withdraw" ? task.actor_chat : target2?.telegram_id ?? (task.operation === "purge" ? target2?.former_telegram_id : null);
    const notice = outcome === "purge" ? `\u062D\u0633\u0627\u0628 \u0634\u0645\u0627 \u0628\u0647\u200C\u0637\u0648\u0631 \u06A9\u0627\u0645\u0644 \u062D\u0630\u0641 \u0634\u062F.
\u0639\u0644\u062A: ${task.reason}
\u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u062D\u0633\u0627\u0628 \u062C\u062F\u06CC\u062F\u060C \u0627\u0632 \u0645\u0646\u0648\u06CC \u0631\u0628\u0627\u062A \u0627\u0642\u062F\u0627\u0645 \u06A9\u0646\u06CC\u062F.` : outcome === "disable" ? `\u062D\u0633\u0627\u0628 \u0634\u0645\u0627 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0634\u062F.
\u0639\u0644\u062A: ${task.reason}` : outcome === "enable" ? "\u062D\u0633\u0627\u0628 \u0634\u0645\u0627 \u0641\u0639\u0627\u0644 \u0634\u062F. \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u062F\u0648\u0628\u0627\u0631\u0647 \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F." : outcome === "withdraw" ? "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062D\u0630\u0641 \u062A\u0623\u06CC\u06CC\u062F \u0634\u062F. \u062D\u0633\u0627\u0628\u062A\u0627\u0646 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0648 \u0627\u062A\u0635\u0627\u0644 \u0622\u0646 \u0628\u0647 \u0631\u0628\u0627\u062A \u0642\u0637\u0639 \u0634\u062F." : task.operation === "withdraw" ? "\u0645\u062F\u06CC\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062D\u0630\u0641 \u062D\u0633\u0627\u0628\u062A\u0627\u0646 \u0631\u0627 \u0644\u063A\u0648 \u06A9\u0631\u062F." : "";
    await answer(outcome === "cancelled" ? "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0644\u063A\u0648 \u0634\u062F." : "\u062A\u063A\u06CC\u06CC\u0631 \u062D\u0633\u0627\u0628 \u062B\u0628\u062A \u0634\u062F.");
    if (recipient && notice) {
      const [delivery] = await Promise.allSettled([send(recipient, notice)]);
      if (delivery.status === "rejected") await send(chat, "\u062A\u063A\u06CC\u06CC\u0631 \u062D\u0633\u0627\u0628 \u062B\u0628\u062A \u0634\u062F\u060C \u0627\u0645\u0627 \u067E\u06CC\u0627\u0645 \u0628\u0647 \u06A9\u0627\u0631\u0628\u0631 \u0646\u0631\u0633\u06CC\u062F.");
      if (outcome === "purge" || outcome === "withdraw" || outcome === "disable" || outcome === "enable") {
        const current = await accountForChat(recipient).catch(() => void 0);
        await refresh(recipient, Boolean(current)).catch(() => {
        });
      }
    }
    return;
  }
  if (!isAdmin || operation !== "disable" && operation !== "purge" && operation !== "enable") return answer("\u0627\u062C\u0627\u0632\u0647\u0654 \u0627\u0646\u062C\u0627\u0645 \u0627\u06CC\u0646 \u06A9\u0627\u0631 \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F.");
  const target = await accountById(id);
  if (!target || target.telegram_id && admins().includes(target.telegram_id)) return answer("\u0627\u06CC\u0646 \u062D\u0633\u0627\u0628 \u0642\u0627\u0628\u0644 \u062A\u063A\u06CC\u06CC\u0631 \u0646\u06CC\u0633\u062A.");
  await answer("");
  if (operation === "enable") await queueAction(chat, target, operation, "");
  else await send(chat, reasonPrompt(operation, target.id), { force_reply: true, selective: true });
}
export {
  accountForChat,
  handleAccountCallback,
  handleAccountReason,
  manageAccountRow,
  profileLabel,
  resetLabel,
  showProfile,
  statusLabel,
  statusMessage,
  withdrawalLabel
};
