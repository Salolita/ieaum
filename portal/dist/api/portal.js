import {
  cookieValue,
  currentProfile,
  digest,
  field,
  limit,
  PortalError,
  query,
  readBody,
  reply,
  rpc,
  setting,
  studentNumber,
  supabase,
  token,
  tokenPattern,
  verifyPassword,
  write
} from "../server/portal-store.js";
import { eligibleStudent, refreshPortalMenu, telegramWebhook } from "../server/portal-bot.js";
import { quizAction } from "../server/portal-quizzes.js";
import { telegramIdentity } from "../server/telegram-identity.js";
import { admins, notifyReview, queueAccount } from "../server/account-review.js";
import { welcomeText } from "../client/utils/entry.js";
import { panelButton, telegram as sendTelegram } from "../server/telegram-delivery.js";
import { issueLoginLink, resetDigest } from "../server/portal-entry.js";
async function endPreviousSession(request) {
  const previous = cookieValue(request);
  if (previous) await write("portal_sessions", "DELETE", void 0, { token_hash: `eq.${digest(previous)}` });
}
function checkPassword(password) {
  if (Array.from(password).length < 8) throw new PortalError(422, "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627\u06CC\u062F \u062F\u0633\u062A\u200C\u06A9\u0645 \u06F8 \u0646\u0648\u06CC\u0633\u0647 \u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F.", "password");
  if (new TextEncoder().encode(password).length > 72) throw new PortalError(422, "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0637\u0648\u0644\u0627\u0646\u06CC \u0627\u0633\u062A. \u0631\u0645\u0632 \u06A9\u0648\u062A\u0627\u0647\u200C\u062A\u0631\u06CC \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F.", "password");
}
function persianName(value, label, name) {
  const cleaned = value.trim();
  if (!cleaned) throw new PortalError(422, `${label} \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.`, name);
  if (cleaned.length > 80) throw new PortalError(422, `${label} \u0628\u0627\u06CC\u062F \u062D\u062F\u0627\u06A9\u062B\u0631 \u06F8\u06F0 \u0646\u0648\u06CC\u0633\u0647 \u0628\u0627\u0634\u062F.`, name);
  if (!/^[آاأإبپتثجچحخدذرزژسشصضطظعغفقکكگلمنوهۀیيىؤئءـ\u064B-\u0655]+(?:[ \u200c]+[آاأإبپتثجچحخدذرزژسشصضطظعغفقکكگلمنوهۀیيىؤئءـ\u064B-\u0655]+)*$/u.test(cleaned) || !/\p{L}/u.test(cleaned.replaceAll("\u0640", ""))) throw new PortalError(422, `${label} \u0631\u0627 \u0628\u0627 \u062D\u0631\u0648\u0641 \u0641\u0627\u0631\u0633\u06CC \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.`, name);
  return cleaned;
}
var portal_default = {
  async fetch(request) {
    try {
      if (request.method === "GET") {
        const enabled = process.env.PORTAL_ENABLED === "true";
        const profile = enabled ? await currentProfile(request) : null;
        if (!profile) return reply({ profile: null, enabled });
        const { telegram_id, ...safe } = profile;
        return reply({ profile: { ...safe, telegramConnected: Boolean(telegram_id) }, enabled });
      }
      if (request.method !== "POST") return reply({ error: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." }, 405);
      const url = new URL(request.url);
      if (setting("PORTAL_ENABLED") !== "true") throw new PortalError(503, "\u0633\u0627\u0645\u0627\u0646\u0647\u0654 \u062D\u0633\u0627\u0628\u200C\u0647\u0627 \u0647\u0646\u0648\u0632 \u0631\u0627\u0647\u200C\u0627\u0646\u062F\u0627\u0632\u06CC \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
      if (url.searchParams.get("telegram") === "1") return await telegramWebhook(request);
      if (request.headers.get("origin") !== setting("PORTAL_ORIGIN")) throw new PortalError(403, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
      const body = await readBody(request);
      const action = field(body, "action");
      const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      if (action === "redeem-login") {
        await limit(`redeem:ip:${ip}`, 200);
        const ticket = field(body, "ticket");
        if (!tokenPattern.test(ticket)) throw new PortalError(401, "\u0644\u06CC\u0646\u06A9 \u0648\u0631\u0648\u062F \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \u062F\u0648\u0628\u0627\u0631\u0647 \u0627\u0632 \u0631\u0628\u0627\u062A \u0627\u0642\u062F\u0627\u0645 \u06A9\u0646\u06CC\u062F.");
        const ticketHash = digest(ticket);
        const [issued] = await query("portal_tickets", {
          token_hash: `eq.${ticketHash}`,
          expires_at: `gt.${(/* @__PURE__ */ new Date()).toISOString()}`,
          profile_id: "not.is.null",
          select: "profile_id"
        });
        const session = token();
        if (!issued || !await rpc("portal_open_session", { p_ticket: ticketHash, p_user: issued.profile_id, p_session: digest(session) })) {
          throw new PortalError(401, "\u0644\u06CC\u0646\u06A9 \u0648\u0631\u0648\u062F \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647 \u06CC\u0627 \u0642\u0628\u0644\u0627\u064B \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0634\u062F\u0647 \u0627\u0633\u062A. \u062F\u0648\u0628\u0627\u0631\u0647 \u0627\u0632 \u0631\u0628\u0627\u062A \u0627\u0642\u062F\u0627\u0645 \u06A9\u0646\u06CC\u062F.");
        }
        await endPreviousSession(request);
        return reply({ loggedIn: true }, 200, session);
      }
      if (action === "logout") {
        const session = cookieValue(request);
        if (session) await write("portal_sessions", "DELETE", void 0, { token_hash: `eq.${digest(session)}` });
        return reply({ ok: true }, 200, null);
      }
      if (action.startsWith("quiz:")) {
        const profile = await currentProfile(request);
        if (!profile) throw new PortalError(401, "\u0627\u0628\u062A\u062F\u0627 \u0648\u0627\u0631\u062F \u067E\u0646\u0644 \u0634\u0648\u06CC\u062F.");
        return reply(await quizAction(action, body, profile));
      }
      if (action === "reset-password") {
        const chat2 = telegramIdentity(field(body, "telegramInitData"));
        await limit(`reset:telegram:${chat2}`, 5);
        const password2 = field(body, "password");
        checkPassword(password2);
        if (password2 !== field(body, "confirmPassword")) {
          throw new PortalError(422, "\u0631\u0645\u0632 \u062C\u062F\u06CC\u062F \u0648 \u062A\u06A9\u0631\u0627\u0631 \u0622\u0646 \u06CC\u06A9\u0633\u0627\u0646 \u0646\u06CC\u0633\u062A\u0646\u062F.", "confirmPassword");
        }
        const resetCode = field(body, "resetCode");
        if (!tokenPattern.test(resetCode)) throw new PortalError(401, "\u0627\u0632 \u062F\u0627\u062E\u0644 \u0631\u0628\u0627\u062A \u062F\u0648\u0628\u0627\u0631\u0647 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0628\u0627\u0632\u06CC\u0627\u0628\u06CC \u0631\u0645\u0632 \u0628\u062F\u0647\u06CC\u062F.");
        const [account] = await query("portal_profiles", {
          telegram_id: `eq.${chat2}`,
          active: "eq.true",
          select: "id",
          limit: "1"
        });
        if (!account) throw new PortalError(403, "\u0627\u06CC\u0646 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0628\u0647 \u062D\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u0627\u0645\u0631\u0627\u0644\u0628 \u0645\u062A\u0635\u0644 \u0646\u06CC\u0633\u062A.");
        const [ticket] = await write("portal_tickets", "DELETE", void 0, {
          token_hash: `eq.${resetDigest(resetCode)}`,
          profile_id: `eq.${account.id}`,
          telegram_id: `eq.${chat2}`,
          expires_at: `gt.${(/* @__PURE__ */ new Date()).toISOString()}`,
          select: "profile_id"
        });
        if (!ticket) throw new PortalError(401, "\u0644\u06CC\u0646\u06A9 \u0628\u0627\u0632\u06CC\u0627\u0628\u06CC \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647 \u06CC\u0627 \u0642\u0628\u0644\u0627\u064B \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0634\u062F\u0647 \u0627\u0633\u062A. \u0627\u0632 \u0631\u0628\u0627\u062A \u062F\u0648\u0628\u0627\u0631\u0647 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0628\u062F\u0647\u06CC\u062F.");
        await supabase(`/auth/v1/admin/users/${account.id}`, "PUT", { password: password2 });
        return reply({ reset: true }, 200, null);
      }
      if (action !== "register" && action !== "login" && action !== "link-telegram") throw new PortalError(400, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
      const initData = field(body, "telegramInitData");
      const chat = action !== "login" || initData ? telegramIdentity(initData) : null;
      const username = field(body, "username").trim().toLowerCase();
      const password = field(body, "password");
      if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) {
        throw new PortalError(422, "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0628\u0627\u06CC\u062F \u06F3 \u062A\u0627 \u06F3\u06F2 \u0646\u0648\u06CC\u0633\u0647 \u0628\u0627\u0634\u062F\u060C \u0628\u0627 \u062D\u0631\u0641 \u0627\u0646\u06AF\u0644\u06CC\u0633\u06CC \u06CC\u0627 \u0639\u062F\u062F \u0634\u0631\u0648\u0639 \u0634\u0648\u062F \u0648 \u0641\u0642\u0637 \u0627\u0632 \u062D\u0631\u0648\u0641 \u0627\u0646\u06AF\u0644\u06CC\u0633\u06CC\u060C \u0627\u0639\u062F\u0627\u062F\u060C \u0646\u0642\u0637\u0647\u060C \u062E\u0637 \u062A\u06CC\u0631\u0647 \u06CC\u0627 \u0632\u06CC\u0631\u062E\u0637 \u062A\u0634\u06A9\u06CC\u0644 \u0634\u0648\u062F.", "username");
      }
      checkPassword(password);
      if (action === "register" && chat) {
        const role = field(body, "role");
        if (role !== "student" && role !== "teacher") throw new PortalError(400, "\u0646\u0648\u0639 \u062D\u0633\u0627\u0628 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
        const first = persianName(field(body, "firstName"), "\u0646\u0627\u0645", "firstName");
        const last = persianName(field(body, "lastName"), "\u0646\u0627\u0645 \u062E\u0627\u0646\u0648\u0627\u062F\u06AF\u06CC", "lastName");
        if (!admins().length) throw new PortalError(503, "\u0645\u062F\u06CC\u0631 \u062B\u0628\u062A\u200C\u0646\u0627\u0645 \u0647\u0646\u0648\u0632 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
        const phone = studentNumber(field(body, "phone")).replace(/[\s()-]/g, "");
        if (!/^\+?[0-9]{10,15}$/.test(phone)) throw new PortalError(422, "\u0634\u0645\u0627\u0631\u0647\u0654 \u062A\u0645\u0627\u0633 \u0628\u0627\u06CC\u062F \u06F1\u06F0 \u062A\u0627 \u06F1\u06F5 \u0631\u0642\u0645 \u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F. \u0628\u0631\u0627\u06CC \u0634\u0645\u0627\u0631\u0647\u0654 \u0628\u06CC\u0646\u200C\u0627\u0644\u0645\u0644\u0644\u06CC\u060C \u0639\u0644\u0627\u0645\u062A + \u0631\u0627 \u0627\u0648\u0644 \u0634\u0645\u0627\u0631\u0647 \u0628\u06AF\u0630\u0627\u0631\u06CC\u062F.", "phone");
        const profile = { username, first_name: first, last_name: last, phone, telegram_id: chat };
        let application;
        if (role === "student") {
          const number = studentNumber(field(body, "studentNumber"));
          const date = field(body, "birthDate");
          const parsedDate = /* @__PURE__ */ new Date(date + "T00:00:00Z");
          const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date && date >= "1900-01-01" && date < (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
          if (!/^[0-9]{6,20}$/.test(number)) throw new PortalError(422, "\u0634\u0645\u0627\u0631\u0647\u0654 \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC \u0631\u0627 \u0628\u0627 \u06F6 \u062A\u0627 \u06F2\u06F0 \u0631\u0642\u0645 \u0648 \u0628\u062F\u0648\u0646 \u0641\u0627\u0635\u0644\u0647 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.", "studentNumber");
          if (!eligibleStudent(number)) throw new PortalError(422, "\u062B\u0628\u062A\u200C\u0646\u0627\u0645 \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC \u0641\u0642\u0637 \u0628\u0631\u0627\u06CC \u0648\u0631\u0648\u062F\u06CC\u200C\u0647\u0627\u06CC \u06F4\u06F0\u06F4 \u062F\u0627\u0646\u0634\u06AF\u0627\u0647 \u0622\u0632\u0627\u062F \u0645\u0634\u0647\u062F \u0627\u0633\u062A. \u0634\u0645\u0627\u0631\u0647\u0654 \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC\u200C\u062A\u0627\u0646 \u0631\u0627 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F.", "studentNumber");
          if (!validDate) throw new PortalError(422, "\u062A\u0627\u0631\u06CC\u062E \u062A\u0648\u0644\u062F \u0645\u06CC\u0644\u0627\u062F\u06CC \u0645\u0639\u062A\u0628\u0631 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F. \u062A\u0627\u0631\u06CC\u062E \u062A\u0648\u0644\u062F \u0628\u0627\u06CC\u062F \u0642\u0628\u0644 \u0627\u0632 \u0627\u0645\u0631\u0648\u0632 \u0628\u0627\u0634\u062F.", "birthDate");
          application = { ...profile, role, student_number: number, birth_date: date };
        } else {
          const course = field(body, "courseName").trim();
          if (!course || course.length > 120 || /[\p{Cc}\p{Cf}]/u.test(course.replaceAll("\u200C", ""))) {
            throw new PortalError(422, "\u0646\u0627\u0645 \u062F\u0631\u0633 \u0631\u0627 \u0628\u0627 \u062D\u062F\u0627\u06A9\u062B\u0631 \u06F1\u06F2\u06F0 \u0646\u0648\u06CC\u0633\u0647 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.", "courseName");
          }
          application = { ...profile, role, course_name: course };
        }
        await limit(`register:ip:${ip}`, 12);
        await limit(`register:telegram:${chat}`, 8);
        const account = await queueAccount(application, password);
        const notified = account ? await notifyReview(account) : true;
        if (account) await refreshPortalMenu(chat, true).catch(() => {
        });
        return reply({ registered: true, pending: true, notified }, account ? 201 : 200);
      }
      await limit(`login:ip:${ip}`, 35);
      await limit(`login:username:${username}`, 10);
      if (chat) await limit(`login:telegram:${chat}`, 18);
      const invalid = "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u06CC\u0627 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.";
      const id = await verifyPassword(username, password);
      let [expected] = await query("portal_profiles", {
        id: `eq.${id}`,
        username: `eq.${username}`,
        select: "id,active,review_status,telegram_id",
        limit: "1"
      });
      if (chat && expected && expected.telegram_id !== chat) {
        if (expected.telegram_id) throw new PortalError(409, "\u0627\u06CC\u0646 \u062D\u0633\u0627\u0628 \u0642\u0628\u0644\u0627\u064B \u0628\u0647 \u06CC\u06A9 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u062A\u0635\u0644 \u0634\u062F\u0647 \u0627\u0633\u062A.");
        const [linked] = await write("portal_profiles", "PATCH", { telegram_id: chat }, {
          id: `eq.${id}`,
          telegram_id: "is.null",
          select: "id,active,review_status,telegram_id"
        });
        if (!linked) throw new PortalError(409, "\u0627\u062A\u0635\u0627\u0644 \u0647\u0645\u200C\u0632\u0645\u0627\u0646 \u0627\u0646\u062C\u0627\u0645 \u0634\u062F. \u0648\u0636\u0639\u06CC\u062A \u062D\u0633\u0627\u0628 \u0631\u0627 \u062F\u0631 \u0631\u0628\u0627\u062A \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F.");
        expected = linked;
      }
      if (!expected?.active) {
        if (expected?.review_status === "pending") throw new PortalError(403, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0634\u0645\u0627 \u062F\u0631 \u0627\u0646\u062A\u0638\u0627\u0631 \u062A\u0623\u06CC\u06CC\u062F \u0645\u062F\u06CC\u0631 \u0627\u0633\u062A.");
        if (expected?.review_status === "rejected") throw new PortalError(403, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0634\u0645\u0627 \u0644\u063A\u0648 \u0634\u062F\u0647 \u0627\u0633\u062A. \u0628\u0627 \u0645\u062F\u06CC\u0631 \u06AF\u0631\u0648\u0647 \u062A\u0645\u0627\u0633 \u0628\u06AF\u06CC\u0631\u06CC\u062F.");
        throw new PortalError(401, invalid);
      }
      if (!chat) {
        const session = token();
        await write("portal_sessions", "POST", { token_hash: digest(session), profile_id: id });
        await endPreviousSession(request);
        if (expected.telegram_id) await sendTelegram("sendMessage", {
          chat_id: expected.telegram_id,
          text: welcomeText,
          reply_markup: panelButton("\u0628\u0632\u0646 \u0628\u0631\u06CC\u0645!")
        }).catch(() => {
        });
        return reply({ loggedIn: true }, 200, session);
      }
      const nextUrl = await issueLoginLink(id, chat, field(body, "target"));
      await sendTelegram("sendMessage", { chat_id: chat, text: welcomeText, reply_markup: { inline_keyboard: [[{
        text: "\u0628\u0632\u0646 \u0628\u0631\u06CC\u0645!",
        url: nextUrl
      }]] } }).catch(() => {
      });
      await refreshPortalMenu(chat, true).catch(() => {
      });
      return reply({ nextUrl });
    } catch (error) {
      if (error instanceof PortalError) return reply({ error: error.message, field: error.field, code: error.code }, error.status);
      return reply({ error: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F." }, 503);
    }
  }
};
export {
  portal_default as default
};
