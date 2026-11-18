import {
  AuthAccountExists,
  internalEmail,
  limit,
  PortalError,
  query,
  setting,
  supabase,
  uuidPattern,
  verifyPassword,
  write
} from "./portal-store.js";
import { panelButton, telegram } from "./telegram-delivery.js";
const admins = () => [...new Set(setting("TELEGRAM_ADMIN_IDS").split(",").map((id) => id.trim()).filter((id) => /^[1-9]\d{0,15}$/.test(id)))];
const requestFields = "id,role,first_name,last_name,student_number,course_name,telegram_id";
async function checkRegistrationConflicts(application) {
  const [linked] = await query("portal_profiles", {
    telegram_id: `eq.${application.telegram_id}`,
    select: "username",
    limit: "1"
  });
  if (linked && linked.username !== application.username) {
    throw new PortalError(409, "\u0627\u06CC\u0646 \u062D\u0633\u0627\u0628 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0628\u0647 \u06CC\u06A9 \u062D\u0633\u0627\u0628 \u0646\u0627\u0645\u0631\u0627\u0644\u0628 \u0645\u062A\u0635\u0644 \u0627\u0633\u062A. \u0628\u0631\u0627\u06CC \u0647\u0645\u0627\u0646 \u062D\u0633\u0627\u0628 \u0627\u0632 \u06AF\u0632\u06CC\u0646\u0647\u0654 \u0648\u0631\u0648\u062F \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F.");
  }
  if (application.role === "student") {
    const [registered] = await query("portal_profiles", {
      student_number: `eq.${application.student_number}`,
      select: "username",
      limit: "1"
    });
    if (registered && registered.username !== application.username) {
      throw new PortalError(409, "\u0627\u06CC\u0646 \u0634\u0645\u0627\u0631\u0647\u0654 \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC \u0642\u0628\u0644\u0627\u064B \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A. \u0634\u0645\u0627\u0631\u0647 \u0631\u0627 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F \u06CC\u0627 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 \u0642\u0628\u0644\u06CC \u0634\u0648\u06CC\u062F.", "studentNumber");
    }
  }
}
async function queueAccount(application, password) {
  const { username, role } = application;
  await checkRegistrationConflicts(application);
  let created;
  try {
    created = await supabase("/auth/v1/admin/users", "POST", {
      email: internalEmail(username),
      password,
      email_confirm: true,
      app_metadata: { [`portal_${role}_request`]: application }
    });
  } catch (error) {
    if (!(error instanceof AuthAccountExists)) {
      if (error instanceof PortalError && (error.status === 409 || error.status === 503)) await checkRegistrationConflicts(application);
      throw error;
    }
    await limit(`login:username:${username}`, 10);
    const id = await verifyPassword(username, password).catch((failure) => {
      if (failure instanceof PortalError && failure.status === 401) {
        throw new PortalError(409, "\u0627\u06CC\u0646 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0642\u0628\u0644\u0627\u064B \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A. \u0646\u0627\u0645 \u062F\u06CC\u06AF\u0631\u06CC \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F \u06CC\u0627 \u0627\u06AF\u0631 \u062D\u0633\u0627\u0628 \u0645\u062A\u0639\u0644\u0642 \u0628\u0647 \u0634\u0645\u0627\u0633\u062A\u060C \u0627\u0632 \u0631\u0645\u0632 \u0642\u0628\u0644\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F.", "username");
      }
      throw failure;
    });
    const [existing] = await query("portal_profiles", {
      id: `eq.${id}`,
      select: "role,review_status"
    });
    if (existing?.role === role && existing.review_status === "pending") return null;
    if (existing?.role === role && existing.review_status === "rejected") {
      throw new PortalError(403, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0642\u0628\u0644\u06CC \u0644\u063A\u0648 \u0634\u062F\u0647 \u0627\u0633\u062A. \u0628\u0631\u0627\u06CC \u067E\u06CC\u06AF\u06CC\u0631\u06CC \u0628\u0627 \u0645\u062F\u06CC\u0631 \u06AF\u0631\u0648\u0647 \u062A\u0645\u0627\u0633 \u0628\u06AF\u06CC\u0631\u06CC\u062F.");
    }
    if (existing) throw new PortalError(409, "\u062D\u0633\u0627\u0628 \u0642\u0628\u0644\u0627\u064B \u0633\u0627\u062E\u062A\u0647 \u0634\u062F\u0647 \u0627\u0633\u062A. \u0627\u0632 \u0628\u062E\u0634 \u0648\u0631\u0648\u062F \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F.");
    const [account2] = await write("portal_profiles", "POST", {
      id,
      ...application,
      active: false,
      review_status: "pending"
    }, { select: requestFields });
    return account2;
  }
  const [account] = await query("portal_profiles", { id: `eq.${created.id}`, select: requestFields });
  if (!account) throw new PortalError(503, "\u062B\u0628\u062A \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u06A9\u0627\u0645\u0644 \u0646\u0634\u062F. \u0628\u0627 \u0647\u0645\u0627\u0646 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0648 \u0631\u0645\u0632 \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.");
  return account;
}
const reviewStatusText = {
  approved: "\u062D\u0633\u0627\u0628\u062A\u0627\u0646 \u062A\u0623\u06CC\u06CC\u062F \u0634\u062F. \u0627\u0632 \u0633\u0627\u06CC\u062A \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F.",
  pending: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062B\u0628\u062A\u200C\u0646\u0627\u0645 \u0634\u0645\u0627 \u062F\u0631 \u0627\u0646\u062A\u0638\u0627\u0631 \u062A\u0623\u06CC\u06CC\u062F \u0645\u062F\u06CC\u0631 \u0627\u0633\u062A.",
  rejected: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062D\u0633\u0627\u0628 \u0644\u063A\u0648 \u0634\u062F. \u0628\u0631\u0627\u06CC \u067E\u06CC\u06AF\u06CC\u0631\u06CC \u0628\u0627 \u0645\u062F\u06CC\u0631 \u06AF\u0631\u0648\u0647 \u062A\u0645\u0627\u0633 \u0628\u06AF\u06CC\u0631\u06CC\u062F."
};
function reviewText(account) {
  const teacher = account.role === "teacher";
  const detail = teacher ? `\u0646\u0627\u0645 \u062F\u0631\u0633: ${account.course_name}` : `\u0634\u0645\u0627\u0631\u0647\u0654 \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC: ${account.student_number}`;
  return `\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062D\u0633\u0627\u0628 ${teacher ? "\u0627\u0633\u062A\u0627\u062F" : "\u062F\u0627\u0646\u0634\u062C\u0648"}
\u0646\u0627\u0645: ${account.first_name}
\u0646\u0627\u0645 \u062E\u0627\u0646\u0648\u0627\u062F\u06AF\u06CC: ${account.last_name}
${detail}`;
}
function sendReview(chat, account) {
  return telegram("sendMessage", { chat_id: chat, text: reviewText(account), reply_markup: { inline_keyboard: [[
    { text: "\u062A\u0623\u06CC\u06CC\u062F", callback_data: `approve:${account.id}` },
    { text: "\u0644\u063A\u0648", callback_data: `reject:${account.id}` }
  ]] } });
}
async function notifyReview(account) {
  const deliveries = await Promise.allSettled([
    ...admins().map((id) => sendReview(id, account)),
    ...account.telegram_id ? [telegram("sendMessage", {
      chat_id: account.telegram_id,
      text: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062B\u0628\u062A\u200C\u0646\u0627\u0645 \u0634\u0645\u0627 \u062F\u0631\u06CC\u0627\u0641\u062A \u0634\u062F \u0648 \u062F\u0631 \u0627\u0646\u062A\u0638\u0627\u0631 \u062A\u0623\u06CC\u06CC\u062F \u0645\u062F\u06CC\u0631 \u0627\u0633\u062A."
    })] : []
  ]);
  if (account.telegram_id) deliveries.pop();
  return deliveries.some((delivery) => delivery.status === "fulfilled");
}
async function pendingReviews(chat) {
  if (!admins().includes(chat)) return;
  const accounts = await query("portal_profiles", {
    review_status: "eq.pending",
    select: requestFields,
    order: "requested_at.asc",
    limit: "10"
  });
  if (!accounts.length) await telegram("sendMessage", { chat_id: chat, text: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062F\u0631 \u0627\u0646\u062A\u0638\u0627\u0631 \u062A\u0623\u06CC\u06CC\u062F \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F." });
  else for (const account of accounts) await sendReview(chat, account);
}
async function decideReview(callback) {
  if (typeof callback.id !== "string") return;
  const answer = (text) => telegram("answerCallbackQuery", { callback_query_id: callback.id, text });
  const [decision, id] = (typeof callback.data === "string" ? callback.data : "").split(":");
  const chat = callback.message?.chat;
  if (chat?.type !== "private" || chat.id !== callback.from?.id || !admins().includes(String(chat.id)) || decision !== "approve" && decision !== "reject" || !uuidPattern.test(id ?? "")) {
    await answer("\u0627\u062C\u0627\u0632\u0647\u0654 \u0627\u0646\u062C\u0627\u0645 \u0627\u06CC\u0646 \u06A9\u0627\u0631 \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F.");
    return;
  }
  const approved = decision === "approve";
  const [account] = await write("portal_profiles", "PATCH", {
    active: approved,
    review_status: approved ? "approved" : "rejected"
  }, { id: `eq.${id}`, review_status: "eq.pending", select: requestFields });
  let status = account ? approved ? "\u062D\u0633\u0627\u0628 \u062A\u0623\u06CC\u06CC\u062F \u0634\u062F." : "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0644\u063A\u0648 \u0634\u062F." : "\u0627\u06CC\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0642\u0628\u0644\u0627\u064B \u0628\u0631\u0631\u0633\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A.";
  if (account?.telegram_id) {
    try {
      await telegram("sendMessage", {
        chat_id: account.telegram_id,
        text: reviewStatusText[approved ? "approved" : "rejected"],
        ...approved ? { reply_markup: panelButton() } : {}
      });
    } catch {
      status += " \u0627\u0631\u0633\u0627\u0644 \u067E\u06CC\u0627\u0645 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F. \u06A9\u0627\u0631\u0628\u0631 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u062F \u0648\u0636\u0639\u06CC\u062A \u062D\u0633\u0627\u0628 \u0631\u0627 \u062F\u0631 \u0631\u0628\u0627\u062A \u0628\u0628\u06CC\u0646\u062F.";
    }
  } else if (account) {
    status += " \u062D\u0633\u0627\u0628 \u0628\u0647 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u062A\u0635\u0644 \u0646\u06CC\u0633\u062A.";
  }
  await Promise.allSettled([
    answer(status),
    telegram("editMessageText", {
      chat_id: chat.id,
      message_id: callback.message?.message_id,
      text: account ? `${reviewText(account)}

${status}` : status,
      reply_markup: { inline_keyboard: [] }
    })
  ]);
}
export {
  admins,
  decideReview,
  notifyReview,
  pendingReviews,
  queueAccount,
  reviewStatusText
};
