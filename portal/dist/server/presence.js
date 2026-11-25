import { digest, MissingRelationError, query, supabase } from "./portal-store.js";
import { telegram } from "./telegram-delivery.js";
const ownerTelegram = "1484056418";
const ownerAccount = (profile) => profile?.telegram_id === ownerTelegram && profile.username === "saleh_2007k";
const serviceNames = {
  presentation: "\u0627\u0631\u0627\u0626\u0647\u200C\u0637\u0648\u0631\u06CC",
  quiz: "\u0622\u0632\u0645\u0648\u0646",
  livecode: "\u0627\u062C\u0631\u0627\u06CC \u0632\u0646\u062F\u0647 \u06A9\u062F"
};
const dayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
function presenceDay(now = /* @__PURE__ */ new Date()) {
  const parts = dayFormatter.formatToParts(now);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}
async function presenceSettings() {
  const [settings] = await query(
    "portal_presence_settings",
    { id: "eq.1", select: "active_day,mode" }
  ).catch((error) => {
    if (error instanceof MissingRelationError) return [];
    throw error;
  });
  return settings ?? { active_day: null, mode: "telegram" };
}
async function recordDeparture(service, session, person, name, title) {
  const settings = await presenceSettings();
  const now = /* @__PURE__ */ new Date();
  const day = presenceDay(now);
  const attendee = Array.from(name.trim()).slice(0, 163).join("");
  if (settings.active_day !== day || !attendee) return;
  const sessionTitle = Array.from(title).slice(0, 120).join("");
  const id = digest(JSON.stringify([service, session, person, Math.floor(+now / 6e4)]));
  const inserted = await supabase("/rest/v1/portal_presence_events?on_conflict=id&select=id", "POST", {
    id,
    day,
    service,
    session_title: sessionTitle,
    attendee_name: attendee,
    mode: settings.mode
  }, false, void 0, "resolution=ignore-duplicates");
  if (inserted.length && settings.mode === "telegram") {
    await telegram("sendMessage", {
      chat_id: ownerTelegram,
      protect_content: true,
      text: `\u062E\u0631\u0648\u062C \u0645\u0648\u0642\u062A \u0627\u0632 \u0635\u0641\u062D\u0647\u0654 ${serviceNames[service]}
\u0634\u0631\u06A9\u062A\u200C\u06A9\u0646\u0646\u062F\u0647: ${attendee}
\u062C\u0644\u0633\u0647: ${sessionTitle}`
    });
  }
}
export {
  ownerAccount,
  ownerTelegram,
  presenceDay,
  presenceSettings,
  recordDeparture,
  serviceNames
};
