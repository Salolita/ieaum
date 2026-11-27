import { availableRoom } from "./erae-owner.js";
import { currentProfile, limit, PortalError, query, reply, uuidPattern, write } from "./portal-store.js";
import { ownerAccount, ownerTelegram, presenceDay, presenceSettings } from "./presence.js";
import { telegram, TelegramDeliveryError } from "./telegram-delivery.js";
const presenceMenuLabel = "\u0627\u0639\u0644\u0627\u0646 \u062E\u0631\u0648\u062C \u0627\u0632 \u062C\u0644\u0633\u0647";
async function presenceMenu(chat, messageId) {
  if (chat !== ownerTelegram) return;
  const setting = await presenceSettings();
  const enabled = setting.active_day === presenceDay();
  const message = {
    chat_id: chat,
    text: `\u0627\u0639\u0644\u0627\u0646 \u062E\u0631\u0648\u062C \u0627\u0632 \u062C\u0644\u0633\u0647 \u0628\u0631\u0627\u06CC \u0627\u0645\u0631\u0648\u0632 ${enabled ? "\u0641\u0639\u0627\u0644" : "\u062E\u0627\u0645\u0648\u0634"} \u0627\u0633\u062A.

\u0634\u06CC\u0648\u0647\u0654 \u0627\u0637\u0644\u0627\u0639\u200C\u0631\u0633\u0627\u0646\u06CC: ${setting.mode === "telegram" ? "\u067E\u06CC\u0627\u0645 \u062A\u0644\u06AF\u0631\u0627\u0645" : "\u06AF\u0632\u0627\u0631\u0634 \u0633\u0627\u06CC\u062A"}
\u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u062A\u0627 \u067E\u0627\u06CC\u0627\u0646 \u0631\u0648\u0632 \u0628\u0647 \u0648\u0642\u062A \u062A\u0647\u0631\u0627\u0646 \u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.`,
    reply_markup: { inline_keyboard: [
      [{ text: "\u0641\u0639\u0627\u0644 \u0628\u0631\u0627\u06CC \u0627\u0645\u0631\u0648\u0632", callback_data: "presence:on" }, { text: "\u063A\u06CC\u0631\u0641\u0639\u0627\u0644", callback_data: "presence:off" }],
      [{ text: "\u067E\u06CC\u0627\u0645 \u062A\u0644\u06AF\u0631\u0627\u0645", callback_data: "presence:telegram" }, { text: "\u06AF\u0632\u0627\u0631\u0634 \u0633\u0627\u06CC\u062A", callback_data: "presence:report" }],
      [{ text: "\u0645\u0634\u0627\u0647\u062F\u0647\u0654 \u06AF\u0632\u0627\u0631\u0634 \u062E\u0631\u0648\u062C", url: "https://ieaum.ir/management/?view=report" }]
    ] }
  };
  if (messageId) await telegram("editMessageText", { ...message, message_id: messageId }).catch((error) => {
    if (!(error instanceof TelegramDeliveryError && error.status === 400)) throw error;
  });
  else await telegram("sendMessage", message);
}
async function updatePresence(chat, action, messageId) {
  if (chat !== ownerTelegram || !["on", "off", "telegram", "report"].includes(action)) return;
  await limit("presence-setting:" + chat, 30);
  const values = action === "on" || action === "off" ? { active_day: action === "on" ? presenceDay() : null } : { mode: action };
  await write("portal_presence_settings", "PATCH", values, { id: "eq.1" });
  await presenceMenu(chat, messageId);
}
async function manageSite(request, body) {
  const profile = await currentProfile(request);
  const manager = ownerAccount(profile);
  const params = new URL(request.url).searchParams;
  if (!body && params.get("scope") === "access") return reply({ canManage: manager });
  if (!profile || !manager) throw new PortalError(403, "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631 IEAUM \u0644\u0627\u0632\u0645 \u0627\u0633\u062A.");
  if (body) {
    const id = typeof body.id === "string" ? body.id : "";
    if (!uuidPattern.test(id) || !["delete", "disable", "enable"].includes(String(body.action))) {
      throw new PortalError(422, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u062F\u06CC\u0631\u06CC\u062A \u0627\u0631\u0627\u0626\u0647 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    }
    await limit("site-presentations:" + profile.id, 50);
    const [room] = body.action === "delete" ? await write("erae_rooms", "DELETE", void 0, { id: "eq." + id, select: "id" }) : await write(
      "erae_rooms",
      "PATCH",
      { moderation_disabled: body.action === "disable" },
      { ...availableRoom(), id: "eq." + id, select: "id" }
    );
    if (!room) throw new PortalError(404, "\u0627\u0631\u0627\u0626\u0647 \u062F\u06CC\u06AF\u0631 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A.");
    return reply({ ok: true });
  }
  const scope = params.get("scope");
  const page = Number(params.get("page") ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 1e3) throw new PortalError(422, "\u0634\u0645\u0627\u0631\u0647\u0654 \u0635\u0641\u062D\u0647 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  if (scope === "report") {
    const day = params.get("day") ?? presenceDay();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) throw new PortalError(422, "\u062A\u0627\u0631\u06CC\u062E \u06AF\u0632\u0627\u0631\u0634 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    const rows = await query("portal_presence_events", {
      day: "eq." + day,
      mode: "eq.report",
      select: "service,session_title,attendee_name,created_at",
      limit: "26",
      offset: String((page - 1) * 25),
      order: "created_at.desc,id.desc"
    });
    return reply({ rows: rows.slice(0, 25), more: rows.length > 25 && page < 1e3, day });
  }
  if (scope !== "rooms") throw new PortalError(404, "\u0627\u06CC\u0646 \u0628\u062E\u0634 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A.");
  const rooms = await query("erae_rooms", {
    ...availableRoom(),
    select: "id,title,published,moderation_disabled,owner:portal_profiles(first_name,last_name)",
    limit: "26",
    offset: String((page - 1) * 25),
    order: "created_at.desc,id.desc"
  });
  return reply({ rooms: rooms.slice(0, 25), more: rooms.length > 25 && page < 1e3 });
}
export {
  manageSite,
  presenceMenu,
  presenceMenuLabel,
  updatePresence
};
