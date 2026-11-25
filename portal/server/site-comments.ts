import {
  currentProfile, field, limit, PortalError, query, reply, uuidPattern, write, type Profile,
} from './portal-store.js';

type Visibility = 'public' | 'private';
type Comment = {
  id: string; author_name: string; visibility: Visibility; message: string; admin_reply: string | null; created_at: string;
};
const fields = 'id,author_name,visibility,message,admin_reply,created_at';
const pageSize = 15;
const owner = (profile: Profile | null) => profile?.telegram_id === '1484056418' && profile.username === 'saleh_2007k';

function message(value: unknown) {
  if (typeof value !== 'string') throw new PortalError(422, 'متن را وارد کنید.');
  const cleaned = value.replace(/\r\n?/g, '\n').trim();
  if (!cleaned || Array.from(cleaned).length > 1200 || /[\p{Cc}\p{Cs}]/u.test(cleaned.replaceAll('\n', '').replaceAll('\t', ''))) {
    throw new PortalError(422, 'متن باید بین ۱ تا ۱۲۰۰ نویسهٔ معتبر باشد.');
  }
  return cleaned;
}

export async function readSiteComments(request: Request) {
  const params = new URL(request.url).searchParams;
  const scope = params.get('scope') ?? 'public';
  const page = Number(params.get('page') ?? 1);
  if (!['public', 'mine', 'manage'].includes(scope) || !Number.isInteger(page) || page < 1 || page > 1000) {
    throw new PortalError(400, 'صفحه یا فهرست نظرات معتبر نیست.');
  }
  const profile = await currentProfile(request);
  const canManage = owner(profile);
  if (scope === 'manage' && !canManage) throw new PortalError(403, 'دسترسی مدیریت نظرات لازم است.');
  if (scope === 'mine' && !profile) throw new PortalError(401, 'ابتدا وارد حساب IEAUM شوید.');
  const filters: Record<string, string> = {
    select: fields, order: 'created_at.desc,id.desc', limit: String(pageSize + 1), offset: String((page - 1) * pageSize),
  };
  if (scope === 'public') filters.visibility = 'eq.public';
  if (scope === 'mine' && profile) {
    filters.visibility = 'eq.private';
    filters.author_id = 'eq.' + profile.id;
  }
  const records = await query<Comment[]>('portal_site_comments', filters);
  return reply({
    comments: records.slice(0, pageSize),
    hasNext: records.length > pageSize && page < 1000,
    canComment: Boolean(profile), canManage: Boolean(canManage),
  });
}

export async function changeSiteComments(request: Request, body: Record<string, unknown>) {
  const profile = await currentProfile(request);
  if (!profile) throw new PortalError(401, 'برای ارسال نظر وارد حساب IEAUM شوید.');
  const action = field(body, 'action');
  if (action === 'submit') {
    const visibility = field(body, 'visibility');
    if (visibility !== 'public' && visibility !== 'private') throw new PortalError(422, 'شیوهٔ ارسال نظر را انتخاب کنید.');
    const text = message(body.message);
    await limit('site-comment:' + profile.id, 5);
    await write('portal_site_comments', 'POST', {
      author_id: profile.id, author_name: profile.username, visibility, message: text,
    }, { select: 'id' });
    return reply({ ok: true }, 201);
  }
  if (!owner(profile)) throw new PortalError(403, 'دسترسی مدیریت نظرات لازم است.');
  const id = field(body, 'id');
  if (!uuidPattern.test(id)) throw new PortalError(422, 'شناسهٔ نظر معتبر نیست.');
  if (action !== 'delete' && action !== 'reply') throw new PortalError(400, 'درخواست معتبر نیست.');
  await limit('site-comment-manage:' + profile.id, 60);
  const [changed] = action === 'delete'
    ? await write<{ id: string }[]>('portal_site_comments', 'DELETE', undefined, { id: 'eq.' + id, select: 'id' })
    : await write<{ id: string }[]>('portal_site_comments', 'PATCH', { admin_reply: message(body.message) }, { id: 'eq.' + id, select: 'id' });
  if (!changed) throw new PortalError(404, 'این نظر دیگر در دسترس نیست.');
  return reply({ ok: true });
}
