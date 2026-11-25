import {
  cookieValue, digest, field, limit, PortalError, query, reply, supabase, uuidPattern, write, type Profile,
} from './portal-store.js';

type Visibility = 'public' | 'private';
type Scope = 'public' | 'mine' | 'manage';
type CommentProfile = Pick<Profile, 'id' | 'username' | 'telegram_id' | 'first_name' | 'last_name'>;
type Comment = {
  id: string; author_name: string; visibility: Visibility; message: string; admin_reply: string | null; created_at: string;
};
const fields = 'id,author_name,visibility,message,admin_reply,created_at';
const pageSize = 15;
const owner = (profile: CommentProfile | null) => profile?.telegram_id === '1484056418' && profile.username === 'saleh_2007k';

async function commentProfile(request: Request) {
  const cookie = cookieValue(request);
  if (!cookie) return null;
  const [session] = await query<{ profile: CommentProfile }[]>('portal_sessions', {
    token_hash: 'eq.' + digest(cookie), expires_at: 'gt.' + new Date().toISOString(),
    'profile.active': 'eq.true', limit: '1', select: 'profile:portal_profiles!inner(id,username,telegram_id,first_name,last_name)',
  });
  return session?.profile ?? null;
}

function message(value: unknown) {
  if (typeof value !== 'string') throw new PortalError(422, 'متن را وارد کنید.');
  const cleaned = value.replace(/\r\n?/g, '\n').trim();
  if (!cleaned || Array.from(cleaned).length > 1200 || /[\p{Cc}\p{Cs}]/u.test(cleaned.replaceAll('\n', '').replaceAll('\t', ''))) {
    throw new PortalError(422, 'متن باید بین ۱ تا ۱۲۰۰ نویسهٔ معتبر باشد.');
  }
  return cleaned;
}

async function readPage(scope: Scope, page: number, profile?: CommentProfile) {
  const filters: Record<string, string> = {
    select: fields, order: 'created_at.desc,id.desc', limit: String(pageSize + 1), offset: String((page - 1) * pageSize),
  };
  if (scope === 'public') filters.visibility = 'eq.public';
  if (scope === 'mine') {
    if (!profile) throw new PortalError(401, 'ابتدا وارد حساب IEAUM شوید.');
    filters.visibility = 'eq.private';
    filters.author_id = 'eq.' + profile.id;
  }
  const records = await query<Comment[]>('portal_site_comments', filters);
  return { comments: records.slice(0, pageSize), hasNext: records.length > pageSize && page < 1000 };
}

function canUse(profile: CommentProfile | null) {
  return { canComment: Boolean(profile), canManage: owner(profile) };
}

async function receipt(profile: CommentProfile, id: string) {
  const [comment] = await query<Comment[]>('portal_site_comments', {
    id: 'eq.' + id, author_id: 'eq.' + profile.id, select: fields, limit: '1',
  });
  return comment;
}

export async function readSiteComments(request: Request) {
  const params = new URL(request.url).searchParams;
  const scope = params.get('scope') ?? 'public';
  const page = Number(params.get('page') ?? 1);
  if (scope === 'bootstrap') {
    const profileTask = commentProfile(request);
    const publicTask = readPage('public', 1);
    const privateTask = profileTask.then(async (profile) => {
      if (!profile) return {};
      const [mine, manage] = await Promise.all([readPage('mine', 1, profile), owner(profile) ? readPage('manage', 1) : undefined]);
      return { mine, manage };
    });
    const [profile, publicPage, privatePages] = await Promise.all([profileTask, publicTask, privateTask]);
    return reply({ ...canUse(profile), lists: { public: publicPage, ...privatePages } });
  }
  if (scope === 'receipt') {
    const id = params.get('id') ?? '';
    if (!uuidPattern.test(id)) throw new PortalError(422, 'شناسهٔ نظر معتبر نیست.');
    const profile = await commentProfile(request);
    if (!profile) throw new PortalError(401, 'ابتدا وارد حساب IEAUM شوید.');
    const comment = await receipt(profile, id);
    if (!comment) throw new PortalError(404, 'ثبت نظر هنوز تأیید نشده است.');
    return reply({ comment });
  }
  if ((scope !== 'public' && scope !== 'mine' && scope !== 'manage') || !Number.isInteger(page) || page < 1 || page > 1000) {
    throw new PortalError(400, 'صفحه یا فهرست نظرات معتبر نیست.');
  }
  if (scope === 'public') {
    const [profile, result] = await Promise.all([commentProfile(request), readPage(scope, page)]);
    return reply({ ...result, ...canUse(profile) });
  }
  const profile = await commentProfile(request);
  if (!profile) throw new PortalError(scope === 'manage' ? 403 : 401, 'ابتدا وارد حساب IEAUM شوید.');
  if (scope === 'manage' && !owner(profile)) throw new PortalError(403, 'دسترسی مدیریت نظرات لازم است.');
  return reply({ ...await readPage(scope, page, profile), ...canUse(profile) });
}

export async function changeSiteComments(request: Request, body: Record<string, unknown>) {
  const profile = await commentProfile(request);
  if (!profile) throw new PortalError(401, 'برای ارسال نظر وارد حساب IEAUM شوید.');
  const action = field(body, 'action');
  if (action === 'submit') {
    const visibility = field(body, 'visibility');
    if (visibility !== 'public' && visibility !== 'private') throw new PortalError(422, 'شیوهٔ ارسال نظر را انتخاب کنید.');
    const text = message(body.message);
    const id = field(body, 'id');
    if (body.id !== undefined && !uuidPattern.test(id)) throw new PortalError(422, 'شناسهٔ نظر معتبر نیست.');
    await limit('site-comment:' + profile.id, 5);
    const values = { author_id: profile.id, author_name: (profile.first_name + ' ' + profile.last_name).trim() || profile.username, visibility, message: text };
    const [created] = id
      ? await supabase<Comment[]>('/rest/v1/portal_site_comments?' + new URLSearchParams({ on_conflict: 'id', select: fields }),
        'POST', { ...values, id }, false, undefined, 'resolution=ignore-duplicates')
      : await write<Comment[]>('portal_site_comments', 'POST', values, { select: fields });
    const comment = created ?? (id ? await receipt(profile, id) : undefined);
    if (!comment || comment.visibility !== visibility || comment.message !== text) {
      throw new PortalError(409, 'این شناسه برای نظر دیگری استفاده شده است.');
    }
    return reply({ ok: true, comment }, created ? 201 : 200);
  }
  if (!owner(profile)) throw new PortalError(403, 'دسترسی مدیریت نظرات لازم است.');
  const id = field(body, 'id');
  if (!uuidPattern.test(id)) throw new PortalError(422, 'شناسهٔ نظر معتبر نیست.');
  if (action !== 'delete' && action !== 'reply') throw new PortalError(400, 'درخواست معتبر نیست.');
  await limit('site-comment-manage:' + profile.id, 60);
  if (action === 'delete') {
    const [removed] = await write<{ id: string }[]>('portal_site_comments', 'DELETE', undefined, { id: 'eq.' + id, select: 'id' });
    if (!removed) throw new PortalError(404, 'این نظر دیگر در دسترس نیست.');
    return reply({ ok: true });
  }
  const [comment] = await write<Comment[]>('portal_site_comments', 'PATCH', { admin_reply: message(body.message) }, { id: 'eq.' + id, select: fields });
  if (!comment) throw new PortalError(404, 'این نظر دیگر در دسترس نیست.');
  return reply({ ok: true, comment });
}
