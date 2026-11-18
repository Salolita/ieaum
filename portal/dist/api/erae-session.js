import portal from "./portal.js";
import { createLoginTicket } from "../server/portal-entry.js";
import { currentProfile, field, limit, PortalError, readBody, reply, setting } from "../server/portal-store.js";
const site = "https://ieaum.ir";
var erae_session_default = {
  async fetch(request) {
    const mode = new URL(request.url).searchParams.get("transfer");
    const transfer = mode === "1" || mode === "site";
    const origin = mode === "site" ? setting("PORTAL_ORIGIN") : site;
    const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", Vary: "Origin" };
    if (request.method === "GET" && !transfer) return portal.fetch(request);
    if (request.headers.get("origin") !== origin) return reply({ error: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." }, 403);
    if (request.method === "OPTIONS" && transfer) {
      return new Response(null, { status: 204, headers: {
        ...cors,
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type"
      } });
    }
    if (request.method !== "POST") return reply({ error: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." }, 405);
    try {
      if (transfer) {
        const profile = await currentProfile(request);
        if (!profile?.telegram_id) throw new PortalError(401, "\u0627\u0628\u062A\u062F\u0627 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 IEAUM \u0634\u0648\u06CC\u062F.");
        await limit(`erae-session:${profile.id}`, 20);
        const response = reply({ ticket: await createLoginTicket(profile.id, profile.telegram_id) });
        for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
        return response;
      }
      const input = await readBody(request);
      const action = input.action;
      let body;
      if (action === "redeem-login") body = { action, ticket: field(input, "ticket") };
      else if (action === "logout" || action === "login" || action === "link-telegram" || action === "register" || action === "reset-password" || action === "profile:get" || action === "profile:save" || action === "profile:password" || typeof action === "string" && action.startsWith("quiz:")) body = input;
      else return reply({ error: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." }, 400);
      const headers = new Headers(request.headers);
      headers.delete("Content-Length");
      headers.set("Origin", setting("PORTAL_ORIGIN"));
      return await portal.fetch(new Request(setting("PORTAL_ORIGIN") + "/api/portal", { method: "POST", headers, body: JSON.stringify(body) }));
    } catch (error) {
      const response = error instanceof PortalError ? reply({ error: error.message }, error.status) : reply({ error: "\u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u0627 \u0633\u0627\u0645\u0627\u0646\u0647\u0654 \u062D\u0633\u0627\u0628\u200C\u0647\u0627 \u0628\u0631\u0642\u0631\u0627\u0631 \u0646\u0634\u062F." }, 503);
      if (transfer) for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
      return response;
    }
  }
};
export {
  erae_session_default as default
};
