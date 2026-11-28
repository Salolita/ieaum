import { createHmac, randomInt } from "node:crypto";
import { accountForChat } from "../server/account-actions.js";
import { equalSecret, field, limit, PortalError, query, readBody, reply, rpc, setting, uuidPattern } from "../server/portal-store.js";
import { telegramIdentity } from "../server/telegram-identity.js";
import { TEAM_ORDER } from "../uniludo/constants.js";
import { applyMove, chooseBotMove, createInitialMatch, getActivePlayer, getLegalMoves, rollDice } from "../uniludo/rules.js";
import { onlineGame } from "../server/uniludo-online.js";
const origin = "https://ieaum.ir";
const noAccount = "\u0628\u0631\u0627\u06CC \u0628\u0627\u0632\u06CC\u060C \u062D\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 IEAUM \u0631\u0627 \u0628\u0647 \u0647\u0645\u06CC\u0646 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u062A\u0635\u0644 \u06A9\u0646\u06CC\u062F.";
const stale = "\u0648\u0636\u0639\u06CC\u062A \u0628\u0627\u0632\u06CC \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F. \u0628\u0627\u0632\u06CC \u0631\u0627 \u0627\u0632 \u0647\u0645\u06CC\u0646 \u0645\u0631\u062D\u0644\u0647 \u0627\u062F\u0627\u0645\u0647 \u062F\u0647\u06CC\u062F.";
const sessionPattern = /^([1-9][0-9]{0,15})\.([0-9a-f-]{36})\.([0-9]{10})\.([a-f0-9]{64})$/i;
const lifetimeSeconds = 8 * 60 * 60;
const now = () => Math.floor(Date.now() / 1e3);
function sign(payload) {
  return createHmac("sha256", setting("TELEGRAM_BOT_TOKEN")).update("IEAUM-UniLudo-session:v1:" + payload).digest("hex");
}
function openSession(chat, profile) {
  const payload = [chat, profile, now() + lifetimeSeconds].join(".");
  return payload + "." + sign(payload);
}
function readSession(request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.{1,150})$/)?.[1] ?? "";
  const claims = sessionPattern.exec(token);
  if (!claims || !uuidPattern.test(claims[2]) || Number(claims[3]) <= now() || !equalSecret(claims[4], sign(token.slice(0, -65)))) {
    throw new PortalError(401, "\u0646\u0634\u0633\u062A \u0628\u0627\u0632\u06CC \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A. \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0627\u0632 \u0631\u0628\u0627\u062A \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F.");
  }
  return { chat: claims[1], profileId: claims[2] };
}
function gameConfig(value) {
  const config = value;
  if (!config || config.playerCount !== 2 && config.playerCount !== 3 && config.playerCount !== 4 || config.ruleMode !== "student" && config.ruleMode !== "classic" || !TEAM_ORDER.includes(config.humanTeam)) {
    throw new PortalError(422, "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0628\u0627\u0632\u06CC \u0631\u0627 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F.");
  }
  return { playerCount: config.playerCount, ruleMode: config.ruleMode, humanTeam: config.humanTeam, vsBots: true };
}
function matchVersion(body) {
  if (typeof body.matchId !== "string" || !uuidPattern.test(body.matchId) || typeof body.revision !== "number" || !Number.isInteger(body.revision) || body.revision < 0 || body.revision > 2147483646) {
    throw new PortalError(422, "\u0634\u0646\u0627\u0633\u0647 \u06CC\u0627 \u0646\u0633\u062E\u0647\u0654 \u0628\u0627\u0632\u06CC \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  }
  return { p_match: body.matchId, p_revision: body.revision };
}
async function current(profileId) {
  const [match] = await query("portal_uniludo_matches", {
    profile_id: "eq." + profileId,
    select: "id,revision,state",
    limit: "1"
  });
  return match ?? null;
}
var uniludo_default = {
  async fetch(request) {
    try {
      if (request.method !== "POST") return reply({ error: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." }, 405);
      if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") {
        return reply({ error: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." }, 403);
      }
      if (setting("PORTAL_ENABLED") !== "true") return reply({ error: "\u0628\u0627\u0632\u06CC \u0641\u0639\u0644\u0627\u064B \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A." }, 503);
      const body = await readBody(request, 1e4);
      const action = field(body, "action");
      if (action === "session") {
        const chat2 = telegramIdentity(field(body, "initData"));
        const account2 = await accountForChat(chat2);
        if (!account2?.active) return reply({ error: noAccount }, 403);
        await limit("uniludo:session:" + account2.id, 18);
        return reply({
          token: openSession(chat2, account2.id),
          name: `${account2.first_name} ${account2.last_name}`.trim(),
          match: await current(account2.id),
          student: account2.role === "student"
        });
      }
      const { chat, profileId } = readSession(request);
      const account = await accountForChat(chat);
      if (!account?.active || account.id !== profileId) return reply({ error: noAccount }, 403);
      if (action === "ranking") {
        const sort = body.sort === "wins" || body.sort === "games" ? body.sort : "points";
        const ranking = await rpc("portal_uniludo_leaderboard", { p_profile: profileId, p_sort: sort });
        return reply({ ranking: body.sort === void 0 ? ranking.map((row) => ({ ...row, username: row.name })) : ranking });
      }
      if (action.startsWith("room-")) {
        if (account.role !== "student") throw new PortalError(403, "\u0627\u06CC\u0646 \u0627\u0645\u06A9\u0627\u0646 \u0628\u0631\u0627\u06CC \u062D\u0633\u0627\u0628 \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC \u0641\u0639\u0627\u0644 \u0627\u0633\u062A.");
        return await onlineGame(profileId, action, body);
      }
      if (action === "current") return reply({ match: await current(profileId) });
      if (action === "start") {
        const config = gameConfig(body.config);
        const replacement = body.matchId === void 0 ? null : matchVersion(body);
        if (replacement) await limit("uniludo:restart:" + profileId, 12);
        const match2 = await rpc("portal_uniludo_start", {
          p_profile: profileId,
          p_state: createInitialMatch(config, `${account.first_name} ${account.last_name}`.trim()),
          p_replace: replacement?.p_match ?? null,
          p_revision: replacement?.p_revision ?? null
        });
        if (!match2?.id) return reply({ error: noAccount }, 403);
        return reply({ match: { id: match2.id, revision: match2.revision, state: match2.state } });
      }
      if (action !== "roll" && action !== "move") return reply({ error: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." }, 400);
      const version = matchVersion(body);
      const match = await current(profileId);
      if (!match || match.id !== version.p_match || match.revision !== version.p_revision) return reply({ error: stale, match }, 409);
      const state = match.state;
      if (action === "roll" && state.phase !== "awaiting_roll" || action === "move" && (state.phase !== "awaiting_move" || state.diceValue === null)) {
        return reply({ error: "\u0627\u06CC\u0646 \u062D\u0631\u06A9\u062A \u062F\u0631 \u0646\u0648\u0628\u062A \u0641\u0639\u0644\u06CC \u0645\u0645\u06A9\u0646 \u0646\u06CC\u0633\u062A." }, 422);
      }
      const result = action === "roll" ? rollDice(state, randomInt(1, 7)) : (() => {
        const active = getActivePlayer(state);
        const move = active.isBot ? chooseBotMove(state, active.id, state.diceValue) : getLegalMoves(state, active.id, state.diceValue).find((candidate) => candidate.pawnId === body.pawnId);
        if (!move) throw new PortalError(422, "\u0627\u06CC\u0646 \u0645\u0647\u0631\u0647 \u0646\u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u062F \u062D\u0631\u06A9\u062A \u06A9\u0646\u062F.");
        return applyMove(state, move, () => randomInt(0, 1e6) / 1e6);
      })();
      const { nextState, ...animation } = result;
      const saved = await rpc("portal_uniludo_move", { p_profile: profileId, ...version, p_state: nextState });
      if (!saved?.id) return reply({ error: stale, match: await current(profileId) }, 409);
      return reply({
        match: { id: saved.id, revision: saved.revision, state: saved.state },
        ...action === "roll" ? { roll: animation } : { move: animation }
      });
    } catch (error) {
      return error instanceof PortalError ? reply({ error: error.message }, error.status) : reply({ error: "\u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u0627 \u0628\u0627\u0632\u06CC \u0628\u0631\u0642\u0631\u0627\u0631 \u0646\u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F." }, 503);
    }
  }
};
export {
  uniludo_default as default
};
