import {
  cookieValue, currentProfile, digest, field, limit, PortalError,
  query, readBody, reply, rpc, setting, studentNumber, supabase, token, tokenPattern, verifyPassword, write,
} from '../server/portal-store.js';
import { eligibleStudent, refreshPortalMenu, telegramWebhook } from '../server/portal-bot.js';
import { quizAction } from '../server/portal-quizzes.js';
import { telegramIdentity } from '../server/telegram-identity.js';
import { admins, notifyMembershipLogin, notifyReview, queueAccount, reviewStatusText } from '../server/account-review.js';
import { welcomeText } from '../client/utils/entry.js';
import { telegram as sendTelegram } from '../server/telegram-delivery.js';
import { issueLoginLink, resetDigest } from '../server/portal-entry.js';
import { jalaliToISO } from '../client/utils/jalali.js';
import { accountForChat, type AccountDetails } from '../server/account-actions.js';

async function endPreviousSession(request: Request) {
  const previous = cookieValue(request);
  if (previous) await write('portal_sessions', 'DELETE', undefined, { token_hash: `eq.${digest(previous)}` });
}

function checkPassword(password: string) {
  if (Array.from(password).length < 8) throw new PortalError(422, 'رمز عبور باید دست‌کم ۸ نویسه داشته باشد.', 'password');
  if (new TextEncoder().encode(password).length > 72) throw new PortalError(422, 'رمز عبور بیش از حد طولانی است. رمز کوتاه‌تری انتخاب کنید.', 'password');
}

function persianName(value: string, label: string, name: string) {
  const cleaned = value.trim();
  if (!cleaned) throw new PortalError(422, `${label} را وارد کنید.`, name);
  if (cleaned.length > 80) throw new PortalError(422, `${label} باید حداکثر ۸۰ نویسه باشد.`, name);
  if (!/^[آاأإبپتثجچحخدذرزژسشصضطظعغفقکكگلمنوهۀیيىؤئءـ\u064B-\u0655]+(?:[ \u200c]+[آاأإبپتثجچحخدذرزژسشصضطظعغفقکكگلمنوهۀیيىؤئءـ\u064B-\u0655]+)*$/u.test(cleaned)
    || !/\p{L}/u.test(cleaned.replaceAll('ـ', ''))) throw new PortalError(422, `${label} را با حروف فارسی وارد کنید.`, name);
  return cleaned;
}

function usernameField(body: Record<string, unknown>) {
  const username = field(body, 'username').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) {
    throw new PortalError(422, 'نام کاربری باید ۳ تا ۳۲ نویسه باشد، با حرف انگلیسی یا عدد شروع شود و فقط از حروف انگلیسی، اعداد، نقطه، خط تیره یا زیرخط تشکیل شود.', 'username');
  }
  return username;
}

function profileFields(body: Record<string, unknown>, role: AccountDetails['role'], existingStudentNumber?: string | null) {
  const username = usernameField(body);
  const first_name = persianName(field(body, 'firstName'), 'نام', 'firstName');
  const last_name = persianName(field(body, 'lastName'), 'نام خانوادگی', 'lastName');
  const phone = studentNumber(field(body, 'phone')).replace(/[\s()-]/g, '');
  if (!/^\+?[0-9]{10,15}$/.test(phone)) throw new PortalError(422, 'شمارهٔ تماس باید ۱۰ تا ۱۵ رقم داشته باشد.', 'phone');
  const student_number = studentNumber(field(body, 'studentNumber'));
  if (role === 'student') {
    if (!/^[0-9]{6,20}$/.test(student_number)) throw new PortalError(422, 'شمارهٔ دانشجویی را با ۶ تا ۲۰ رقم و بدون فاصله وارد کنید.', 'studentNumber');
    if (student_number !== existingStudentNumber && !eligibleStudent(student_number)) throw new PortalError(422, 'شمارهٔ دانشجویی باید متعلق به ورودی‌های ۴۰۴ دانشگاه آزاد مشهد باشد.', 'studentNumber');
  }
  const enteredBirthDate = field(body, body.birthDateJalali !== undefined ? 'birthDateJalali' : 'birthDate');
  const birth_date = (body.birthDateJalali !== undefined ? jalaliToISO(enteredBirthDate) : enteredBirthDate) || null;
  if (role === 'student' || enteredBirthDate) {
    const date = new Date(`${birth_date}T00:00:00Z`);
    if (!birth_date || !/^\d{4}-\d{2}-\d{2}$/.test(birth_date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== birth_date
      || birth_date < '1900-01-01' || birth_date >= new Date().toISOString().slice(0, 10)) {
      throw new PortalError(422, 'تاریخ تولد شمسی معتبر و قبل از امروز وارد کنید.', 'birthDate');
    }
  }
  const base = { username, first_name, last_name, phone };
  if (role === 'teacher') {
    const course_name = field(body, 'courseName').trim();
    if (!course_name || course_name.length > 120 || /[\p{Cc}\p{Cf}]/u.test(course_name.replaceAll('\u200c', ''))) {
      throw new PortalError(422, 'نام درس را با حداکثر ۱۲۰ نویسه وارد کنید.', 'courseName');
    }
    return { ...base, role, course_name, birth_date } as const;
  }
  return { ...base, role, student_number, birth_date: birth_date! } as const;
}

export default {
  async fetch(request: Request) {
    try {
      const url = new URL(request.url);
      if (request.method === 'GET') {
        const enabled = process.env.PORTAL_ENABLED === 'true';
        const profile = enabled ? await currentProfile(request) : null;
        if (!profile) return reply({ profile: null, enabled });
        const { telegram_id, ...safe } = profile;
        return reply({ profile: { ...safe, telegramConnected: Boolean(telegram_id) }, enabled });
      }
      if (request.method !== 'POST') return reply({ error: 'درخواست معتبر نیست.' }, 405);
      if (setting('PORTAL_ENABLED') !== 'true') throw new PortalError(503, 'سامانهٔ حساب‌ها هنوز راه‌اندازی نشده است.');
      if (url.searchParams.get('telegram') === '1') return await telegramWebhook(request);
      if (request.headers.get('origin') !== setting('PORTAL_ORIGIN')) throw new PortalError(403, 'درخواست معتبر نیست.');
      const body = await readBody(request);
      const action = field(body, 'action');
      const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      if (action === 'service:opened') {
        const target = field(body, 'target');
        const name = target === 'solver' ? 'نامرالب' : target === 'presentation' ? 'ارائه‌طوری' : target === 'panel' ? 'پنل IEAUM' : null;
        if (!name) throw new PortalError(400, 'سرویس معتبر نیست.');
        const profile = await currentProfile(request);
        if (!profile) throw new PortalError(401, 'ابتدا وارد حساب IEAUM شوید.');
        if (profile.telegram_id) {
          await limit(`service:opened:${profile.id}:${target}`, 1);
          await sendTelegram('sendMessage', { chat_id: profile.telegram_id, text: `از سایت وارد «${name}» شدید.` }).catch(() => {});
        }
        return reply({ ok: true });
      }
      if (action === 'profile:get' || action === 'profile:save' || action === 'profile:password') {
        const chat = telegramIdentity(field(body, 'telegramInitData'));
        await limit(`profile:${chat}`, 24);
        const profile = await accountForChat(chat);
        if (!profile?.active) throw new PortalError(403, 'برای ویرایش، حساب فعال باید به همین تلگرام متصل باشد.');
        if (action === 'profile:get') {
          const { id, telegram_id, former_telegram_id, review_status, approved_at, active, ...details } = profile;
          return reply({ profile: details });
        }
        if (action === 'profile:password') {
          const password = field(body, 'password');
          checkPassword(password);
          if (password !== field(body, 'confirmPassword')) throw new PortalError(422, 'تکرار رمز جدید یکسان نیست.', 'confirmPassword');
          await limit(`profile:password:${chat}`, 5);
          if (await verifyPassword(profile.username, field(body, 'currentPassword')) !== profile.id) throw new PortalError(401, 'رمز عبور فعلی معتبر نیست.', 'currentPassword');
          await supabase(`/auth/v1/admin/users/${profile.id}`, 'PUT', { password });
          return reply({ updated: true }, 200, null);
        }
        const values = profileFields(body, profile.role, profile.student_number);
        if (!await rpc<boolean>('portal_edit_profile', { p_id: profile.id, p_chat: chat, p_values: values })) {
          throw new PortalError(403, 'حساب دیگر به این تلگرام متصل نیست یا غیرفعال شده است.');
        }
        return reply({ updated: true });
      }
      if (action === 'redeem-login') {
        await limit(`redeem:ip:${ip}`, 200);
        const ticket = field(body, 'ticket');
        if (!tokenPattern.test(ticket)) throw new PortalError(401, 'لینک ورود معتبر نیست. دوباره از ربات اقدام کنید.');
        const ticketHash = digest(ticket);
        const [issued] = await query<{ profile_id: string }[]>('portal_tickets', {
          token_hash: `eq.${ticketHash}`, expires_at: `gt.${new Date().toISOString()}`, profile_id: 'not.is.null', select: 'profile_id',
        });
        const session = token();
        if (!issued || !await rpc<boolean>('portal_open_session', { p_ticket: ticketHash, p_user: issued.profile_id, p_session: digest(session) })) {
          throw new PortalError(401, 'لینک ورود منقضی شده یا قبلاً استفاده شده است. دوباره از ربات اقدام کنید.');
        }
        await endPreviousSession(request);
        return reply({ loggedIn: true }, 200, session);
      }
      if (action === 'logout') {
        const session = cookieValue(request);
        if (session) await write('portal_sessions', 'DELETE', undefined, { token_hash: `eq.${digest(session)}` });
        return reply({ ok: true }, 200, null);
      }
      if (action.startsWith('quiz:')) {
        const profile = await currentProfile(request);
        if (!profile) throw new PortalError(401, 'ابتدا وارد پنل شوید.');
        return reply(await quizAction(action, body, profile));
      }
      if (action === 'reset-password') {
        const chat = telegramIdentity(field(body, 'telegramInitData'));
        await limit(`reset:telegram:${chat}`, 5);
        const password = field(body, 'password');
        checkPassword(password);
        if (password !== field(body, 'confirmPassword')) {
          throw new PortalError(422, 'رمز جدید و تکرار آن یکسان نیستند.', 'confirmPassword');
        }
        const resetCode = field(body, 'resetCode');
        if (!tokenPattern.test(resetCode)) throw new PortalError(401, 'از داخل ربات دوباره درخواست بازیابی رمز بدهید.');
        const [account] = await query<{ id: string }[]>('portal_profiles', {
          telegram_id: `eq.${chat}`, active: 'eq.true', select: 'id', limit: '1',
        });
        if (!account) throw new PortalError(403, 'این تلگرام به حساب فعال نامرالب متصل نیست.');
        const [ticket] = await write<unknown[]>('portal_tickets', 'DELETE', undefined, {
          token_hash: `eq.${resetDigest(resetCode)}`, profile_id: `eq.${account.id}`,
          telegram_id: `eq.${chat}`, expires_at: `gt.${new Date().toISOString()}`, select: 'profile_id',
        });
        if (!ticket) throw new PortalError(401, 'لینک بازیابی منقضی شده یا قبلاً استفاده شده است. از ربات دوباره درخواست بدهید.');
        await supabase(`/auth/v1/admin/users/${account.id}`, 'PUT', { password });
        return reply({ reset: true }, 200, null);
      }
      if (action !== 'register' && action !== 'login' && action !== 'link-telegram') throw new PortalError(400, 'درخواست معتبر نیست.');
      const initData = field(body, 'telegramInitData');
      const chat = action !== 'login' || initData ? telegramIdentity(initData) : null;

      const username = usernameField(body);
      const password = field(body, 'password');
      checkPassword(password);

      if (action === 'register' && chat) {
        const role = field(body, 'role');
        if (role !== 'student' && role !== 'teacher') throw new PortalError(400, 'نوع حساب معتبر نیست.');
        if (!admins().length) throw new PortalError(503, 'مدیر ثبت‌نام هنوز تنظیم نشده است.');
        const application = { ...profileFields(body, role), telegram_id: chat };
        await limit(`register:ip:${ip}`, 12);
        await limit(`register:telegram:${chat}`, 8);
        const account = await queueAccount(application, password);
        const notified = account ? await notifyReview(account) : true;
        if (account) await refreshPortalMenu(chat, true).catch(() => {});
        return reply({ registered: true, pending: true, notified }, account ? 201 : 200);
      }

      await limit(`login:ip:${ip}`, 35);
      await limit(`login:username:${username}`, 10);
      if (chat) await limit(`login:telegram:${chat}`, 18);
      const invalid = 'نام کاربری یا رمز عبور معتبر نیست.';
      const id = await verifyPassword(username, password);
      type LoginProfile = { id: string; active: boolean; review_status: keyof typeof reviewStatusText; telegram_id: string | null };
      let [expected] = await query<LoginProfile[]>('portal_profiles', {
        id: `eq.${id}`, username: `eq.${username}`, select: 'id,active,review_status,telegram_id', limit: '1',
      });
      if (chat && expected?.active && expected.telegram_id !== chat) {
        if (expected.telegram_id) throw new PortalError(409, 'این حساب قبلاً به یک تلگرام متصل شده است.');
        const [linked] = await write<LoginProfile[]>('portal_profiles', 'PATCH', { telegram_id: chat }, {
          id: `eq.${id}`, telegram_id: 'is.null', active: 'eq.true', select: 'id,active,review_status,telegram_id',
        });
        if (!linked) throw new PortalError(409, 'اتصال هم‌زمان انجام شد. وضعیت حساب را در ربات بررسی کنید.');
        expected = linked;
      }
      if (!expected?.active) {
        if (expected?.review_status === 'pending') {
          if (action === 'login' && (!chat || expected.telegram_id === chat)) await notifyMembershipLogin(id).catch(() => {});
          throw new PortalError(403, 'درخواست شما در انتظار تأیید مدیر است.');
        }
        if (expected?.review_status === 'rejected') throw new PortalError(403, 'درخواست شما لغو شده است. با مدیر گروه تماس بگیرید.');
        throw new PortalError(401, invalid);
      }
      if (!chat) {
        const session = token();
        await write('portal_sessions', 'POST', { token_hash: digest(session), profile_id: id });
        await endPreviousSession(request);
        return reply({ loggedIn: true }, 200, session);
      }
      const nextUrl = await issueLoginLink(id, chat, field(body, 'target'));
      await sendTelegram('sendMessage', { chat_id: chat, text: welcomeText, reply_markup: { inline_keyboard: [[{
        text: 'بزن بریم!', url: nextUrl,
      }]] } }).catch(() => {});
      await refreshPortalMenu(chat, true).catch(() => {});
      return reply({ nextUrl });
    } catch (error) {
      if (error instanceof PortalError) return reply({ error: error.message, field: error.field, code: error.code }, error.status);
      return reply({ error: 'درخواست انجام نشد. دوباره تلاش کنید.' }, 503);
    }
  },
};
