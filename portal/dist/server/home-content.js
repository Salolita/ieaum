import { homeFieldKeys, homeFieldLimit } from "../home-fields.js";
import { admins } from "./account-review.js";
import { currentProfile, limit, query, reply, supabase } from "./portal-store.js";
async function siteAdmin(request) {
  const profile = await currentProfile(request);
  return profile?.telegram_id && admins().includes(String(profile.telegram_id)) ? profile.id : void 0;
}
async function readHomeContent(request) {
  const [[record], admin] = await Promise.all([
    query("portal_home_content", { id: "eq.1", select: "body" }),
    siteAdmin(request)
  ]);
  return reply({ content: record?.body ?? {}, canEdit: Boolean(admin) });
}
async function replaceHomeContent(request, submitted) {
  const admin = await siteAdmin(request);
  if (!admin) return reply({ error: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631\u06CC\u062A \u0645\u062D\u062A\u0648\u0627 \u0644\u0627\u0632\u0645 \u0627\u0633\u062A." }, 403);
  await limit("site-content:" + admin, 12);
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) {
    return reply({ error: "\u0645\u062D\u062A\u0648\u0627 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." }, 422);
  }
  const fields = submitted;
  const body = {};
  for (const key of homeFieldKeys) {
    const value = fields[key];
    if (typeof value !== "string" || !value.trim() || value.trim().length > homeFieldLimit(key)) {
      return reply({ error: "\u0647\u0645\u0647\u0654 \u0641\u06CC\u0644\u062F\u0647\u0627 \u0631\u0627 \u062F\u0631 \u0645\u062D\u062F\u0648\u062F\u0647\u0654 \u0645\u0634\u062E\u0635 \u062A\u06A9\u0645\u06CC\u0644 \u06A9\u0646\u06CC\u062F." }, 422);
    }
    body[key] = value.trim();
  }
  await supabase(
    "/rest/v1/portal_home_content?on_conflict=id",
    "POST",
    { id: 1, body },
    false,
    void 0,
    "resolution=merge-duplicates"
  );
  return reply({ content: body, canEdit: true });
}
export {
  readHomeContent,
  replaceHomeContent
};
