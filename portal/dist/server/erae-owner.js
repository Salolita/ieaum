import { digest, PortalError, query, rpc, token, write } from "./portal-store.js";
const availableRoom = () => ({ or: `(expires_at.is.null,expires_at.gt.${(/* @__PURE__ */ new Date()).toISOString()})` });
async function ownedPresentations(owner, id, includeLink = false) {
  return query("erae_rooms", {
    ...availableRoom(),
    owner_id: `eq.${owner}`,
    select: `id,title,caption,expires_at,published,page_count,furthest:body->furthest${includeLink ? ",join_code" : ""}`,
    order: "created_at.desc",
    ...id ? { id: `eq.${id}` } : {}
  });
}
async function rotatePresentationCode(owner, id) {
  const code = token();
  if (!await rpc("portal_rotate_presentation_code", { p_owner: owner, p_room: id, p_digest: digest(code) })) {
    throw new PortalError(404, "\u0627\u06CC\u0646 \u0627\u0631\u0627\u0626\u0647 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A.");
  }
  return code;
}
function retention(value) {
  if (value === null || value === void 0 || value === "") return null;
  if (value === 3 || value === "3") return 3;
  if (value === 5 || value === "5") return 5;
  throw new PortalError(422, "\u0632\u0645\u0627\u0646 \u062D\u0630\u0641 \u062E\u0648\u062F\u06A9\u0627\u0631 \u0628\u0627\u06CC\u062F \u06F3 \u06CC\u0627 \u06F5 \u0631\u0648\u0632 \u0628\u0627\u0634\u062F.");
}
function expiration(value) {
  const days = retention(value);
  return days === null ? null : new Date(Date.now() + days * 864e5).toISOString();
}
function editPresentation(owner, id, values) {
  return write("erae_rooms", "PATCH", values, { ...availableRoom(), id: `eq.${id}`, owner_id: `eq.${owner}`, select: "id" });
}
function deletePresentation(owner, id) {
  return write("erae_rooms", "DELETE", void 0, { id: `eq.${id}`, owner_id: `eq.${owner}`, select: "id" });
}
export {
  availableRoom,
  deletePresentation,
  editPresentation,
  expiration,
  ownedPresentations,
  retention,
  rotatePresentationCode
};
