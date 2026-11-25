import {
  cookieValue,
  digest,
  field,
  limit,
  PortalError,
  query,
  reply,
  supabase,
  uuidPattern,
  write
} from "./portal-store.js";
const fields = "id,author_name,visibility,message,admin_reply,created_at";
const pageSize = 15;
const owner = (profile) => profile?.telegram_id === "1484056418" && profile.username === "saleh_2007k";
async function commentProfile(request) {
  const cookie = cookieValue(request);
  if (!cookie) return null;
  const [session] = await query("portal_sessions", {
    token_hash: "eq." + digest(cookie),
    expires_at: "gt." + (/* @__PURE__ */ new Date()).toISOString(),
    "profile.active": "eq.true",
    limit: "1",
    select: "profile:portal_profiles!inner(id,username,telegram_id)"
  });
  return session?.profile ?? null;
}
function message(value) {
  if (typeof value !== "string") throw new PortalError(422, "\u0645\u062A\u0646 \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
  const cleaned = value.replace(/\r\n?/g, "\n").trim();
  if (!cleaned || Array.from(cleaned).length > 1200 || /[\p{Cc}\p{Cs}]/u.test(cleaned.replaceAll("\n", "").replaceAll("	", ""))) {
    throw new PortalError(422, "\u0645\u062A\u0646 \u0628\u0627\u06CC\u062F \u0628\u06CC\u0646 \u06F1 \u062A\u0627 \u06F1\u06F2\u06F0\u06F0 \u0646\u0648\u06CC\u0633\u0647\u0654 \u0645\u0639\u062A\u0628\u0631 \u0628\u0627\u0634\u062F.");
  }
  return cleaned;
}
async function readPage(scope, page, profile) {
  const filters = {
    select: fields,
    order: "created_at.desc,id.desc",
    limit: String(pageSize + 1),
    offset: String((page - 1) * pageSize)
  };
  if (scope === "public") filters.visibility = "eq.public";
  if (scope === "mine") {
    if (!profile) throw new PortalError(401, "\u0627\u0628\u062A\u062F\u0627 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 IEAUM \u0634\u0648\u06CC\u062F.");
    filters.visibility = "eq.private";
    filters.author_id = "eq." + profile.id;
  }
  const records = await query("portal_site_comments", filters);
  return { comments: records.slice(0, pageSize), hasNext: records.length > pageSize && page < 1e3 };
}
function canUse(profile) {
  return { canComment: Boolean(profile), canManage: owner(profile) };
}
async function receipt(profile, id) {
  const [comment] = await query("portal_site_comments", {
    id: "eq." + id,
    author_id: "eq." + profile.id,
    select: fields,
    limit: "1"
  });
  return comment;
}
async function readSiteComments(request) {
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope") ?? "public";
  const page = Number(params.get("page") ?? 1);
  if (scope === "bootstrap") {
    const profileTask = commentProfile(request);
    const publicTask = readPage("public", 1);
    const privateTask = profileTask.then(async (profile3) => {
      if (!profile3) return {};
      const [mine, manage] = await Promise.all([readPage("mine", 1, profile3), owner(profile3) ? readPage("manage", 1) : void 0]);
      return { mine, manage };
    });
    const [profile2, publicPage, privatePages] = await Promise.all([profileTask, publicTask, privateTask]);
    return reply({ ...canUse(profile2), lists: { public: publicPage, ...privatePages } });
  }
  if (scope === "receipt") {
    const id = params.get("id") ?? "";
    if (!uuidPattern.test(id)) throw new PortalError(422, "\u0634\u0646\u0627\u0633\u0647\u0654 \u0646\u0638\u0631 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    const profile2 = await commentProfile(request);
    if (!profile2) throw new PortalError(401, "\u0627\u0628\u062A\u062F\u0627 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 IEAUM \u0634\u0648\u06CC\u062F.");
    const comment = await receipt(profile2, id);
    if (!comment) throw new PortalError(404, "\u062B\u0628\u062A \u0646\u0638\u0631 \u0647\u0646\u0648\u0632 \u062A\u0623\u06CC\u06CC\u062F \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
    return reply({ comment });
  }
  if (scope !== "public" && scope !== "mine" && scope !== "manage" || !Number.isInteger(page) || page < 1 || page > 1e3) {
    throw new PortalError(400, "\u0635\u0641\u062D\u0647 \u06CC\u0627 \u0641\u0647\u0631\u0633\u062A \u0646\u0638\u0631\u0627\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  }
  if (scope === "public") {
    const [profile2, result] = await Promise.all([commentProfile(request), readPage(scope, page)]);
    return reply({ ...result, ...canUse(profile2) });
  }
  const profile = await commentProfile(request);
  if (!profile) throw new PortalError(scope === "manage" ? 403 : 401, "\u0627\u0628\u062A\u062F\u0627 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 IEAUM \u0634\u0648\u06CC\u062F.");
  if (scope === "manage" && !owner(profile)) throw new PortalError(403, "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631\u06CC\u062A \u0646\u0638\u0631\u0627\u062A \u0644\u0627\u0632\u0645 \u0627\u0633\u062A.");
  return reply({ ...await readPage(scope, page, profile), ...canUse(profile) });
}
async function changeSiteComments(request, body) {
  const profile = await commentProfile(request);
  if (!profile) throw new PortalError(401, "\u0628\u0631\u0627\u06CC \u0627\u0631\u0633\u0627\u0644 \u0646\u0638\u0631 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 IEAUM \u0634\u0648\u06CC\u062F.");
  const action = field(body, "action");
  if (action === "submit") {
    const visibility = field(body, "visibility");
    if (visibility !== "public" && visibility !== "private") throw new PortalError(422, "\u0634\u06CC\u0648\u0647\u0654 \u0627\u0631\u0633\u0627\u0644 \u0646\u0638\u0631 \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F.");
    const text = message(body.message);
    const id2 = field(body, "id");
    if (body.id !== void 0 && !uuidPattern.test(id2)) throw new PortalError(422, "\u0634\u0646\u0627\u0633\u0647\u0654 \u0646\u0638\u0631 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    await limit("site-comment:" + profile.id, 5);
    const values = { author_id: profile.id, author_name: profile.username, visibility, message: text };
    const [created] = id2 ? await supabase(
      "/rest/v1/portal_site_comments?" + new URLSearchParams({ on_conflict: "id", select: fields }),
      "POST",
      { ...values, id: id2 },
      false,
      void 0,
      "resolution=ignore-duplicates"
    ) : await write("portal_site_comments", "POST", values, { select: fields });
    const comment2 = created ?? (id2 ? await receipt(profile, id2) : void 0);
    if (!comment2 || comment2.visibility !== visibility || comment2.message !== text) {
      throw new PortalError(409, "\u0627\u06CC\u0646 \u0634\u0646\u0627\u0633\u0647 \u0628\u0631\u0627\u06CC \u0646\u0638\u0631 \u062F\u06CC\u06AF\u0631\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0634\u062F\u0647 \u0627\u0633\u062A.");
    }
    return reply({ ok: true, comment: comment2 }, created ? 201 : 200);
  }
  if (!owner(profile)) throw new PortalError(403, "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631\u06CC\u062A \u0646\u0638\u0631\u0627\u062A \u0644\u0627\u0632\u0645 \u0627\u0633\u062A.");
  const id = field(body, "id");
  if (!uuidPattern.test(id)) throw new PortalError(422, "\u0634\u0646\u0627\u0633\u0647\u0654 \u0646\u0638\u0631 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  if (action !== "delete" && action !== "reply") throw new PortalError(400, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  await limit("site-comment-manage:" + profile.id, 60);
  if (action === "delete") {
    const [removed] = await write("portal_site_comments", "DELETE", void 0, { id: "eq." + id, select: "id" });
    if (!removed) throw new PortalError(404, "\u0627\u06CC\u0646 \u0646\u0638\u0631 \u062F\u06CC\u06AF\u0631 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A.");
    return reply({ ok: true });
  }
  const [comment] = await write("portal_site_comments", "PATCH", { admin_reply: message(body.message) }, { id: "eq." + id, select: fields });
  if (!comment) throw new PortalError(404, "\u0627\u06CC\u0646 \u0646\u0638\u0631 \u062F\u06CC\u06AF\u0631 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A.");
  return reply({ ok: true, comment });
}
export {
  changeSiteComments,
  readSiteComments
};
