import { contactLimits, contactUrl, defaultContacts, type ContactContent } from '../contact-content.js';
import { siteAdmin } from './home-content.js';
import { limit, MissingRelationError, PortalError, query, reply, supabase } from './portal-store.js';

const validText = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0
  && value.trim().length <= max && !/\p{Cc}/u.test(value) ? value.trim() : null;

function contacts(value: unknown): ContactContent {
  const record = value as Partial<ContactContent> | null;
  const title = validText(record?.title, contactLimits.title);
  const invalid = () => new PortalError(422, 'عنوان‌ها و لینک‌های ارتباطی را کامل وارد کنید.');
  if (!title || !Array.isArray(record?.groups) || !record.groups.length || record.groups.length > contactLimits.groups) throw invalid();
  const groups = record.groups.map((group) => {
    const title = validText(group?.title, contactLimits.title);
    if (!title || !Array.isArray(group?.links) || !group.links.length || group.links.length > contactLimits.links) throw invalid();
    const links = group.links.map((link) => {
      const label = validText(link?.label, contactLimits.label);
      const url = typeof link?.url === 'string' ? contactUrl(link.url.trim()) : null;
      if (!label || !url) throw invalid();
      return { label, url };
    });
    return { title, links };
  });
  return { title, groups };
}

export async function readSiteContacts(request: Request) {
  const [records, admin] = await Promise.all([
    query<{ body: ContactContent }[]>('portal_site_contacts', { id: 'eq.1', select: 'body' })
      .catch((error) => {
        if (error instanceof MissingRelationError) return null;
        throw error;
      }),
    siteAdmin(request),
  ]);
  return reply({ content: records?.[0]?.body ?? defaultContacts, canEdit: Boolean(records && admin) });
}

export async function replaceSiteContacts(request: Request, submitted: unknown) {
  const admin = await siteAdmin(request);
  if (!admin) return reply({ error: 'دسترسی مدیریت محتوا لازم است.' }, 403);
  await limit('site-contacts:' + admin, 12);
  const body = contacts(submitted);
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 47_000) {
    return reply({ error: 'حجم عنوان‌ها و لینک‌های ارتباطی بیش از حد مجاز است.' }, 422);
  }
  await supabase('/rest/v1/portal_site_contacts?on_conflict=id', 'POST', { id: 1, body },
    false, undefined, 'resolution=merge-duplicates');
  return reply({ content: body, canEdit: true });
}
