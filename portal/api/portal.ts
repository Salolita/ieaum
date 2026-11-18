import {
  cookieValue, currentProfile, digest, field, limit, PortalError,
  query, readBody, reply, rpc, setting, studentNumber, supabase, token, tokenPattern, verifyPassword, write,
} from '../server/portal-store.js';
import { eligibleStudent, refreshPortalMenu, telegramWebhook } from '../server/portal-bot.js';
import { quizAction } from '../server/portal-quizzes.js';
import { telegramIdentity } from '../server/telegram-identity.js';
import { admins, notifyReview, queueAccount, reviewStatusText } from '../server/account-review.js';
import { welcomeText } from '../client/utils/entry.js';
import { panelButton, telegram as sendTelegram } from '../server/telegram-delivery.js';
import { issueLoginLink, resetDigest } from '../server/portal-entry.js';

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

export default {
  async fetch(request: Request) {
    try {
      if (request.method === 'GET') {
        const enabled = process.env.PORTAL_ENABLED === 'true';
        const profile = enabled ? await currentProfile(request) : null;
        if (!profile) return reply({ profile: null, enabled });
        const { telegram_id, ...safe } = profile;
        return reply({ profile: { ...safe, telegramConnected: Boolean(telegram_id) }, enabled });
      }
      if (request.method !== 'POST') return reply({ error: 'درخواست معتبر نیست.' }, 405);
      const url = new URL(request.url);
      if (setting('PORTAL_ENABLED') !== 'true') throw new PortalError(503, 'سامانهٔ حساب‌ها هنوز راه‌اندازی نشده است.');
      if (url.searchParams.get('telegram') === '1') return await telegramWebhook(request);
      if (request.headers.get('origin') !== setting('PORTAL_ORIGIN')) throw new PortalError(403, 'درخواست معتبر نیست.');
      const body = await readBody(request);
      const action = field(body, 'action');
      const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
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

      const username = field(body, 'username').trim().toLowerCase();
      const password = field(body, 'password');
      if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) {
        throw new PortalError(422, 'نام کاربری باید ۳ تا ۳۲ نویسه باشد، با حرف انگلیسی یا عدد شروع شود و فقط از حروف انگلیسی، اعداد، نقطه، خط تیره یا زیرخط تشکیل شود.', 'username');
      }
      checkPassword(password);

      if (action === 'register' && chat) {
        const role = field(body, 'role');
        if (role !== 'student' && role !== 'teacher') throw new PortalError(400, 'نوع حساب معتبر نیست.');
        const first = persianName(field(body, 'firstName'), 'نام', 'firstName');
        const last = persianName(field(body, 'lastName'), 'نام خانوادگی', 'lastName');
        if (!admins().length) throw new PortalError(503, 'مدیر ثبت‌نام هنوز تنظیم نشده است.');
        const phone = studentNumber(field(body, 'phone')).replace(/[\s()-]/g, '');
        if (!/^\+?[0-9]{10,15}$/.test(phone)) throw new PortalError(422, 'شمارهٔ تماس باید ۱۰ تا ۱۵ رقم داشته باشد. برای شمارهٔ بین‌المللی، علامت + را اول شماره بگذارید.', 'phone');
        const profile = { username, first_name: first, last_name: last, phone, telegram_id: chat };
        let application: Parameters<typeof queueAccount>[0];
        if (role === 'student') {
          const number = studentNumber(field(body, 'studentNumber'));
          const date = field(body, 'birthDate');
          const parsedDate = new Date(date + 'T00:00:00Z');
          const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsedDate.getTime())
            && parsedDate.toISOString().slice(0, 10) === date && date >= '1900-01-01' && date < new Date().toISOString().slice(0, 10);
          if (!/^[0-9]{6,20}$/.test(number)) throw new PortalError(422, 'شمارهٔ دانشجویی را با ۶ تا ۲۰ رقم و بدون فاصله وارد کنید.', 'studentNumber');
          if (!eligibleStudent(number)) throw new PortalError(422, 'ثبت‌نام دانشجویی فقط برای ورودی‌های ۴۰۴ دانشگاه آزاد مشهد است. شمارهٔ دانشجویی‌تان را بررسی کنید.', 'studentNumber');
          if (!validDate) throw new PortalError(422, 'تاریخ تولد میلادی معتبر وارد کنید. تاریخ تولد باید قبل از امروز باشد.', 'birthDate');
          application = { ...profile, role, student_number: number, birth_date: date };
        } else {
          const course = field(body, 'courseName').trim();
          if (!course || course.length > 120 || /[\p{Cc}\p{Cf}]/u.test(course.replaceAll('\u200c', ''))) {
            throw new PortalError(422, 'نام درس را با حداکثر ۱۲۰ نویسه وارد کنید.', 'courseName');
          }
          application = { ...profile, role, course_name: course };
        }
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
      if (chat && expected && expected.telegram_id !== chat) {
        if (expected.telegram_id) throw new PortalError(409, 'این حساب قبلاً به یک تلگرام متصل شده است.');
        const [linked] = await write<LoginProfile[]>('portal_profiles', 'PATCH', { telegram_id: chat }, {
          id: `eq.${id}`, telegram_id: 'is.null', select: 'id,active,review_status,telegram_id',
        });
        if (!linked) throw new PortalError(409, 'اتصال هم‌زمان انجام شد. وضعیت حساب را در ربات بررسی کنید.');
        expected = linked;
      }
      if (!expected?.active) {
        if (expected?.review_status === 'pending') throw new PortalError(403, 'درخواست شما در انتظار تأیید مدیر است.');
        if (expected?.review_status === 'rejected') throw new PortalError(403, 'درخواست شما لغو شده است. با مدیر گروه تماس بگیرید.');
        throw new PortalError(401, invalid);
      }
      if (!chat) {
        const session = token();
        await write('portal_sessions', 'POST', { token_hash: digest(session), profile_id: id });
        await endPreviousSession(request);
        if (expected.telegram_id) await sendTelegram('sendMessage', { chat_id: expected.telegram_id, text: welcomeText,
          reply_markup: panelButton('بزن بریم!') }).catch(() => {});
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
