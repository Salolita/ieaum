import { randomInt } from "node:crypto";
import { applyMove, createInitialMatch, getActivePlayer, getLegalMoves, rollDice } from "../uniludo/rules.js";
import { TEAM_ORDER } from "../uniludo/constants.js";
import { roomIdPattern } from "../uniludo/service.js";
import { limit, PortalError, reply, rpc } from "./portal-store.js";
const roomActions = ["view", "join", "leave", "rename", "delete", "start", "reset", "roll", "move"];
const random = () => randomInt(0, 1e6) / 1e6;
function roomCommand(profile, id, action, data = {}) {
  return rpc("portal_uniludo_room", { p_profile: profile, p_room: id, p_action: action, p_data: data });
}
function display(result) {
  if ("error" in result) return reply(result, 409);
  return reply("ok" in result ? result : { room: result });
}
function title(value) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value) || !value.trim() || [...value.trim()].length > 60) {
    throw new PortalError(422, "\u0628\u0631\u0627\u06CC \u062C\u0644\u0633\u0647 \u0646\u0627\u0645\u06CC \u0628\u06CC\u0646 \u06F1 \u062A\u0627 \u06F6\u06F0 \u0646\u0648\u06CC\u0633\u0647 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
  }
  return value.trim();
}
async function onlineGame(profile, action, input) {
  if (action === "room-list") return reply({ rooms: await rpc("portal_uniludo_lobbies", { p_profile: profile }) });
  if (action === "room-create") {
    const name = title(input.title);
    if (input.capacity !== 2 && input.capacity !== 3 && input.capacity !== 4) throw new PortalError(422, "\u062A\u0639\u062F\u0627\u062F \u0628\u0627\u0632\u06CC\u06A9\u0646\u0627\u0646 \u0628\u0627\u06CC\u062F \u06F2 \u062A\u0627 \u06F4 \u0646\u0641\u0631 \u0628\u0627\u0634\u062F.");
    if (input.mode !== "casual" && input.mode !== "ranked") throw new PortalError(422, "\u0646\u0648\u0639 \u0628\u0627\u0632\u06CC \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    await limit("uniludo:room-create:" + profile, 30);
    return display(await roomCommand(profile, null, "create", { title: name, capacity: input.capacity, mode: input.mode }));
  }
  const command = action.slice("room-".length);
  const id = input.roomId;
  if (!roomActions.includes(command) || typeof id !== "string" || !roomIdPattern.test(id)) throw new PortalError(422, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062C\u0644\u0633\u0647 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  if (command === "join") {
    if (!TEAM_ORDER.includes(input.team)) throw new PortalError(422, "\u0646\u0642\u0634 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    return display(await roomCommand(profile, id, command, { team: input.team }));
  }
  if (command === "rename") return display(await roomCommand(profile, id, command, { title: title(input.title) }));
  if (command === "view" || command === "leave" || command === "delete") return display(await roomCommand(profile, id, command));
  const snapshot = await roomCommand(profile, id, "view");
  if (!("state" in snapshot)) return display(snapshot);
  const { state, members, capacity, revision, team, owner, status } = snapshot;
  if (revision !== input.revision) throw new PortalError(409, "\u0648\u0636\u0639\u06CC\u062A \u0628\u0627\u0632\u06CC \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F\u0647 \u0627\u0633\u062A. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.");
  if (command === "start" || command === "reset") {
    if (!owner) throw new PortalError(403, "\u0627\u06CC\u0646 \u06AF\u0632\u06CC\u0646\u0647 \u062F\u0631 \u0627\u062E\u062A\u06CC\u0627\u0631 \u0645\u062F\u06CC\u0631 \u062C\u0644\u0633\u0647 \u0627\u0633\u062A.");
    if (members.length !== capacity || status !== (command === "start" ? "waiting" : "playing")) {
      throw new PortalError(409, "\u0628\u0627\u0632\u06CC \u062F\u0631 \u0627\u06CC\u0646 \u0645\u0631\u062D\u0644\u0647 \u0622\u0645\u0627\u062F\u0647\u0654 \u0634\u0631\u0648\u0639 \u0646\u06CC\u0633\u062A.");
    }
    const next = createInitialMatch({ playerCount: capacity, ruleMode: "student", humanTeam: members[0].team, vsBots: false });
    next.playForPlaces = true;
    next.players = next.players.map((player, index) => ({ ...player, teamId: members[index].team, name: members[index].name }));
    return display(await roomCommand(profile, id, command, { revision, state: next }));
  }
  if (status !== "playing" || !state || !team || getActivePlayer(state).teamId !== team) {
    throw new PortalError(403, "\u0646\u0648\u0628\u062A \u0634\u0645\u0627 \u0646\u06CC\u0633\u062A.");
  }
  if (command === "roll" && state.phase === "awaiting_roll") {
    const result = rollDice(state, randomInt(1, 7));
    const saved = await roomCommand(profile, id, "play", { revision, state: result.nextState });
    return "state" in saved ? reply({ room: saved, dice: result.diceValue }) : display(saved);
  }
  if (command === "move" && state.phase === "awaiting_move" && state.diceValue !== null) {
    const move = getLegalMoves(state, getActivePlayer(state).id, state.diceValue).find((item) => item.pawnId === input.pawnId);
    if (move) return display(await roomCommand(profile, id, "play", { revision, state: applyMove(state, move, random).nextState }));
  }
  throw new PortalError(422, "\u0627\u06CC\u0646 \u062D\u0631\u06A9\u062A \u062F\u0631 \u0646\u0648\u0628\u062A \u0641\u0639\u0644\u06CC \u0645\u0645\u06A9\u0646 \u0646\u06CC\u0633\u062A.");
}
export {
  onlineGame
};
