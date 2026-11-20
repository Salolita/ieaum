import { rpc } from "./portal-store.js";
function recordBotContact(id, active, unixDate) {
  const timestamp = typeof unixDate === "number" && Number.isSafeInteger(unixDate) && unixDate > 0 && unixDate <= Date.now() / 1e3 + 60 ? unixDate * 1e3 : Date.now();
  return rpc("portal_record_bot_contact", { p_chat: String(id), p_active: active, p_observed: new Date(timestamp).toISOString() });
}
export {
  recordBotContact
};
