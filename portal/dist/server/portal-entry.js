import { digest, setting, token, write } from "./portal-store.js";
async function createLoginTicket(profileId, chat) {
  const code = token();
  await write("portal_tickets", "POST", {
    token_hash: digest(code),
    profile_id: profileId,
    telegram_id: chat ?? "",
    expires_at: new Date(Date.now() + 18e4).toISOString()
  });
  return code;
}
async function issueLoginLink(profileId, chat, target) {
  const code = await createLoginTicket(profileId, chat);
  if (target !== "solver") {
    const route = target === "home" ? "/" : target === "presentation" ? "/erae-tori/" : "/panel/";
    const direct = new URL(route, "https://ieaum.ir");
    direct.hash = new URLSearchParams({ ticket: code }).toString();
    return direct.href;
  }
  const handoff = new URL("/", setting("PORTAL_ORIGIN"));
  handoff.hash = new URLSearchParams({ ticket: code }).toString();
  return handoff.href;
}
const resetDigest = (code) => digest("password-reset:" + code);
async function issueResetCode(profileId, chat) {
  const code = token();
  await write("portal_tickets", "POST", {
    token_hash: resetDigest(code),
    profile_id: profileId,
    telegram_id: chat,
    expires_at: new Date(Date.now() + 6e5).toISOString()
  });
  return code;
}
export {
  createLoginTicket,
  issueLoginLink,
  issueResetCode,
  resetDigest
};
