import {
  currentProfile,
  field,
  limit,
  PortalError,
  query,
  reply,
  uuidPattern,
  write
} from "./portal-store.js";
const fields = "id,author_name,visibility,message,admin_reply,created_at";
const pageSize = 15;
const owner = (profile) => profile?.telegram_id === "1484056418" && profile.username === "saleh_2007k";
function message(value) {
  if (typeof value !== "string") throw new PortalError(422, "\u0645\u062A\u0646 \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
  const cleaned = value.replace(/\r\n?/g, "\n").trim();
  if (!cleaned || Array.from(cleaned).length > 1200 || /[\p{Cc}\p{Cs}]/u.test(cleaned.replaceAll("\n", "").replaceAll("	", ""))) {
    throw new PortalError(422, "\u0645\u062A\u0646 \u0628\u0627\u06CC\u062F \u0628\u06CC\u0646 \u06F1 \u062A\u0627 \u06F1\u06F2\u06F0\u06F0 \u0646\u0648\u06CC\u0633\u0647\u0654 \u0645\u0639\u062A\u0628\u0631 \u0628\u0627\u0634\u062F.");
  }
  return cleaned;
}
async function readSiteComments(request) {
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope") ?? "public";
  const page = Number(params.get("page") ?? 1);
  if (!["public", "mine", "manage"].includes(scope) || !Number.isInteger(page) || page < 1 || page > 1e3) {
    throw new PortalError(400, "\u0635\u0641\u062D\u0647 \u06CC\u0627 \u0641\u0647\u0631\u0633\u062A \u0646\u0638\u0631\u0627\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  }
  const profile = await currentProfile(request);
  const canManage = owner(profile);
  if (scope === "manage" && !canManage) throw new PortalError(403, "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631\u06CC\u062A \u0646\u0638\u0631\u0627\u062A \u0644\u0627\u0632\u0645 \u0627\u0633\u062A.");
  if (scope === "mine" && !profile) throw new PortalError(401, "\u0627\u0628\u062A\u062F\u0627 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 IEAUM \u0634\u0648\u06CC\u062F.");
  const filters = {
    select: fields,
    order: "created_at.desc,id.desc",
    limit: String(pageSize + 1),
    offset: String((page - 1) * pageSize)
  };
  if (scope === "public") filters.visibility = "eq.public";
  if (scope === "mine" && profile) {
    filters.visibility = "eq.private";
    filters.author_id = "eq." + profile.id;
  }
  const records = await query("portal_site_comments", filters);
  return reply({
    comments: records.slice(0, pageSize),
    hasNext: records.length > pageSize && page < 1e3,
    canComment: Boolean(profile),
    canManage: Boolean(canManage)
  });
}
async function changeSiteComments(request, body) {
  const profile = await currentProfile(request);
  if (!profile) throw new PortalError(401, "\u0628\u0631\u0627\u06CC \u0627\u0631\u0633\u0627\u0644 \u0646\u0638\u0631 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 IEAUM \u0634\u0648\u06CC\u062F.");
  const action = field(body, "action");
  if (action === "submit") {
    const visibility = field(body, "visibility");
    if (visibility !== "public" && visibility !== "private") throw new PortalError(422, "\u0634\u06CC\u0648\u0647\u0654 \u0627\u0631\u0633\u0627\u0644 \u0646\u0638\u0631 \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F.");
    const text = message(body.message);
    await limit("site-comment:" + profile.id, 5);
    await write("portal_site_comments", "POST", {
      author_id: profile.id,
      author_name: profile.username,
      visibility,
      message: text
    }, { select: "id" });
    return reply({ ok: true }, 201);
  }
  if (!owner(profile)) throw new PortalError(403, "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631\u06CC\u062A \u0646\u0638\u0631\u0627\u062A \u0644\u0627\u0632\u0645 \u0627\u0633\u062A.");
  const id = field(body, "id");
  if (!uuidPattern.test(id)) throw new PortalError(422, "\u0634\u0646\u0627\u0633\u0647\u0654 \u0646\u0638\u0631 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  if (action !== "delete" && action !== "reply") throw new PortalError(400, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  await limit("site-comment-manage:" + profile.id, 60);
  const [changed] = action === "delete" ? await write("portal_site_comments", "DELETE", void 0, { id: "eq." + id, select: "id" }) : await write("portal_site_comments", "PATCH", { admin_reply: message(body.message) }, { id: "eq." + id, select: "id" });
  if (!changed) throw new PortalError(404, "\u0627\u06CC\u0646 \u0646\u0638\u0631 \u062F\u06CC\u06AF\u0631 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A.");
  return reply({ ok: true });
}
export {
  changeSiteComments,
  readSiteComments
};
