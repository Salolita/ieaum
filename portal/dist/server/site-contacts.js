import { contactLimits, contactUrl, defaultContacts } from "../contact-content.js";
import { siteAdmin } from "./home-content.js";
import { limit, MissingRelationError, PortalError, query, reply, supabase } from "./portal-store.js";
const validText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max && !/\p{Cc}/u.test(value) ? value.trim() : null;
function contacts(value) {
  const record = value;
  const title = validText(record?.title, contactLimits.title);
  const invalid = () => new PortalError(422, "\u0639\u0646\u0648\u0627\u0646\u200C\u0647\u0627 \u0648 \u0644\u06CC\u0646\u06A9\u200C\u0647\u0627\u06CC \u0627\u0631\u062A\u0628\u0627\u0637\u06CC \u0631\u0627 \u06A9\u0627\u0645\u0644 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
  if (!title || !Array.isArray(record?.groups) || !record.groups.length || record.groups.length > contactLimits.groups) throw invalid();
  const groups = record.groups.map((group) => {
    const title2 = validText(group?.title, contactLimits.title);
    if (!title2 || !Array.isArray(group?.links) || !group.links.length || group.links.length > contactLimits.links) throw invalid();
    const links = group.links.map((link) => {
      const label = validText(link?.label, contactLimits.label);
      const url = typeof link?.url === "string" ? contactUrl(link.url.trim()) : null;
      if (!label || !url) throw invalid();
      return { label, url };
    });
    return { title: title2, links };
  });
  return { title, groups };
}
async function readSiteContacts(request) {
  const [records, admin] = await Promise.all([
    query("portal_site_contacts", { id: "eq.1", select: "body" }).catch((error) => {
      if (error instanceof MissingRelationError) return null;
      throw error;
    }),
    siteAdmin(request)
  ]);
  return reply({ content: records?.[0]?.body ?? defaultContacts, canEdit: Boolean(records && admin) });
}
async function replaceSiteContacts(request, submitted) {
  const admin = await siteAdmin(request);
  if (!admin) return reply({ error: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631\u06CC\u062A \u0645\u062D\u062A\u0648\u0627 \u0644\u0627\u0632\u0645 \u0627\u0633\u062A." }, 403);
  await limit("site-contacts:" + admin, 12);
  const body = contacts(submitted);
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 47e3) {
    return reply({ error: "\u062D\u062C\u0645 \u0639\u0646\u0648\u0627\u0646\u200C\u0647\u0627 \u0648 \u0644\u06CC\u0646\u06A9\u200C\u0647\u0627\u06CC \u0627\u0631\u062A\u0628\u0627\u0637\u06CC \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0645\u062C\u0627\u0632 \u0627\u0633\u062A." }, 422);
  }
  await supabase(
    "/rest/v1/portal_site_contacts?on_conflict=id",
    "POST",
    { id: 1, body },
    false,
    void 0,
    "resolution=merge-duplicates"
  );
  return reply({ content: body, canEdit: true });
}
export {
  readSiteContacts,
  replaceSiteContacts
};
