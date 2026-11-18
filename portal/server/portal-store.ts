import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(24).toString('base64url');
export const tokenPattern = /^[A-Za-z0-9_-]{32}$/;
export const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export const internalEmail = (username: string) => `${digest(username).slice(0, 40)}@accounts.numeralab.ieaum.ir`;
export const studentNumber = (value: string) => value.trim().replace(/[۰-۹٠-٩]/g, (digit) => String(digit.charCodeAt(0) - (digit >= '۰' ? 0x6f0 : 0x660)));

export class PortalError extends Error {
  constructor(public readonly status: number, message: string, public readonly field?: string, public readonly code?: string) { super(message); }
}

export class AuthAccountExists extends PortalError {
  constructor() { super(409, 'این نام کاربری قبلاً ثبت شده است.'); }
}

export function setting(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new PortalError(503, 'سامانهٔ حساب‌ها هنوز راه‌اندازی نشده است.');
  return value;
}

export function equalSecret(left: string, right: string) {
  return timingSafeEqual(Buffer.from(digest(left)), Buffer.from(digest(right)));
}

export async function supabase<T>(path: string, method = 'GET', body?: unknown, publicKey = false, userToken?: string, preference?: string): Promise<T> {
  const key = setting(publicKey ? 'SUPABASE_PUBLIC_KEY' : 'SUPABASE_SECRET_KEY');
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (preference) headers.Prefer += `, ${preference}`;
  if (userToken || key.startsWith('eyJ')) headers.Authorization = `Bearer ${userToken ?? key}`;
  const response = await fetch(setting('SUPABASE_URL').replace(/\/$/, '') + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) {
    if (response.status === 409) throw new PortalError(409, 'این درخواست قبلاً ثبت شده یا یکی از مشخصات تکراری است.');
    if (response.status === 429) throw new PortalError(429, 'تعداد تلاش‌ها زیاد است. چند دقیقه دیگر دوباره امتحان کنید.');
    if (path.startsWith('/auth/v1/token?') && [400, 401].includes(response.status)) throw new PortalError(401, 'نام کاربری یا رمز عبور معتبر نیست.');
    if (path.startsWith('/auth/v1/admin/users') && [400, 422].includes(response.status)) {
      const failure = await response.json().catch(() => null);
      const code = failure?.error_code ?? failure?.code;
      if (code === 'email_exists' || code === 'user_already_exists') throw new AuthAccountExists();
      if (code === 'weak_password') throw new PortalError(422, 'سامانهٔ حساب‌ها این رمز را ضعیف تشخیص داد. رمز دیگری انتخاب کنید.', 'password');
      throw new PortalError(422, 'اطلاعات حساب پذیرفته نشد. نام کاربری و رمز را بررسی کنید.');
    }
    throw new PortalError(503, 'ارتباط با سامانهٔ حساب‌ها برقرار نشد.');
  }
  return (await response.text().then((value) => value ? JSON.parse(value) : null)) as T;
}

export function query<T>(table: string, filters: Record<string, string> = {}) {
  return supabase<T>(`/rest/v1/${table}?${new URLSearchParams(filters)}`);
}

export function write<T>(table: string, method: string, body?: unknown, filters: Record<string, string> = {}) {
  return supabase<T>(`/rest/v1/${table}?${new URLSearchParams(filters)}`, method, body);
}

export const rpc = <T>(name: string, body: unknown) => supabase<T>(`/rest/v1/rpc/${name}`, 'POST', body);

export async function limit(bucket: string, max: number) {
  if (!await rpc<boolean>('portal_rate_limit', { p_bucket: digest(bucket), p_limit: max })) {
    throw new PortalError(429, 'تعداد تلاش‌ها زیاد است. چند دقیقه دیگر دوباره امتحان کنید.');
  }
}

export async function verifyPassword(username: string, password: string) {
  const email = await rpc<string | null>('portal_auth_email', { p_username: username });
  const auth = await supabase<{ user: { id: string }; access_token: string }>('/auth/v1/token?grant_type=password', 'POST', {
    email: email ?? internalEmail(username), password,
  }, true);
  // The portal manages its own sessions, so revoke the Supabase refresh token.
  await supabase('/auth/v1/logout?scope=local', 'POST', undefined, true, auth.access_token);
  return auth.user.id;
}

export interface Profile {
  id: string;
  username: string;
  role: 'student' | 'teacher';
  first_name: string;
  last_name: string;
  active: boolean;
  course_name?: string | null;
  telegram_id?: string | null;
}

export function cookieValue(request: Request) {
  const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-ieaum=([A-Za-z0-9_-]{32})(?:;|$)/)?.[1];
  return cookie ?? null;
}

export async function currentProfile(request: Request) {
  const cookie = cookieValue(request);
  if (!cookie) return null;
  const [session] = await query<{ profile_id: string }[]>('portal_sessions', {
    token_hash: `eq.${digest(cookie)}`, expires_at: `gt.${new Date().toISOString()}`, select: 'profile_id', limit: '1',
  });
  if (!session) return null;
  const [profile] = await query<Profile[]>('portal_profiles', {
    id: `eq.${session.profile_id}`, active: 'eq.true',
    select: 'id,username,role,first_name,last_name,active,course_name,telegram_id', limit: '1',
  });
  return profile ?? null;
}

export function reply(body: unknown, status = 200, session?: string | null) {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  if (session !== undefined) headers['Set-Cookie'] = `__Host-ieaum=${session ?? ''}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${session ? 2_592_000 : 0}`;
  return Response.json(body, { status, headers });
}

export async function readBody(request: Request, maxBytes = 30_000): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new PortalError(415, 'قالب درخواست معتبر نیست.');
  const stream = request.body?.getReader();
  if (!stream) throw new PortalError(400, 'درخواست معتبر نیست.');
  let length = 0;
  let input = '';
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await stream.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > maxBytes) {
      await stream.cancel();
      throw new PortalError(413, 'درخواست بیش از حد بزرگ است.');
    }
    input += decoder.decode(chunk.value, { stream: true });
  }
  try {
    const body = JSON.parse(input + decoder.decode());
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch { /* Invalid JSON is reported below. */ }
  throw new PortalError(400, 'درخواست معتبر نیست.');
}

export const field = (body: Record<string, unknown>, name: string) => typeof body[name] === 'string' ? body[name] as string : '';
