import portal from "./portal.js";
import { createLoginTicket } from "../server/portal-entry.js";
import { currentProfile, field, limit, PortalError, readBody, reply, setting } from "../server/portal-store.js";
const site = "https://ieaum.ir";
const cors = {
  "Access-Control-Allow-Origin": site,
  "Access-Control-Allow-Credentials": "true",
  Vary: "Origin"
};
var erae_session_default = {
  async fetch(request) {
    if (request.headers.get("origin") !== site) return reply({ error: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." }, 403);
    const transfer = new URL(request.url).searchParams.get("transfer") === "1";
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
        const response = profile ? await (async () => {
          await limit(`erae-session:${profile.id}`, 20);
          return reply({ ticket: await createLoginTicket(profile.id, profile.telegram_id ?? "0") });
        })() : reply({ error: "\u0627\u0628\u062A\u062F\u0627 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 IEAUM \u0634\u0648\u06CC\u062F." }, 401);
        for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
        return response;
      }
      const input = await readBody(request, 2500);
      const action = input.action;
      let body;
      if (action === "redeem-login") body = { action, ticket: field(input, "ticket") };
      else if (action === "login") body = { action, username: field(input, "username"), password: field(input, "password") };
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
