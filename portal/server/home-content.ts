import { homeFieldKeys, homeFieldLimit, type HomeContent } from '../home-fields.js';
import { admins } from './account-review.js';
import { currentProfile, limit, query, reply, supabase } from './portal-store.js';

async function siteAdmin(request: Request) {
  const profile = await currentProfile(request);
  return profile?.telegram_id && admins().includes(String(profile.telegram_id)) ? profile.id : undefined;
}

export async function readHomeContent(request: Request) {
  const [[record], admin] = await Promise.all([
    query<{ body: HomeContent }[]>('portal_home_content', { id: 'eq.1', select: 'body' }), siteAdmin(request),
  ]);
  return reply({ content: record?.body ?? {}, canEdit: Boolean(admin) });
}

export async function replaceHomeContent(request: Request, submitted: unknown) {
  const admin = await siteAdmin(request);
  if (!admin) return reply({ error: 'دسترسی مدیریت محتوا لازم است.' }, 403);
  await limit('site-content:' + admin, 12);
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) {
    return reply({ error: 'محتوا معتبر نیست.' }, 422);
  }
  const fields = submitted as Record<string, unknown>;
  const body: HomeContent = {};
  for (const key of homeFieldKeys) {
    const value = fields[key];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > homeFieldLimit(key)) {
      return reply({ error: 'همهٔ فیلدها را در محدودهٔ مشخص تکمیل کنید.' }, 422);
    }
    body[key] = value.trim();
  }
  await supabase('/rest/v1/portal_home_content?on_conflict=id', 'POST', { id: 1, body },
    false, undefined, 'resolution=merge-duplicates');
  return reply({ content: body, canEdit: true });
}
