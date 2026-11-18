import { equalSecret, limit, PortalError, query, readBody, reply, setting } from './portal-store.js';
import { admins, decideReview, pendingReviews, reviewStatusText, type ReviewCallback } from './account-review.js';
import { telegram } from './telegram-delivery.js';
import { issueLoginLink, issueResetCode } from './portal-entry.js';
import { announcementLabel, announcementPrompt, decideAnnouncement, openAnnouncement, previewAnnouncement } from './admin-announcements.js';

const labels = {
  home: 'ورود به سایت', solver: 'نامرالب', quizzes: 'آزمون‌ها', student: 'ساخت حساب دانشجو', teacher: 'ساخت حساب استاد',
  status: 'وضعیت حساب و اتصال تلگرام', about: 'درباره ما', sizing: 'انداز برانداز', talent: 'استعدادتو', requests: 'درخواست‌های ثبت‌نام',
  reset: 'فراموشی رمز عبور',
};

const link = (text: string, url: string) => ({ text, url });
const miniApp = (text: string, params: string) => ({
  text, web_app: { url: new URL('/register.html?' + params, setting('PORTAL_ORIGIN')).href },
});

function keyboard(chat: string, hasAccount: boolean) {
  const rows = [[labels.home, labels.solver], [labels.quizzes, labels.status]];
  if (!hasAccount) rows.push([labels.student, labels.teacher]);
  else rows.push([labels.reset]);
  rows.push([labels.sizing, labels.talent], [labels.about]);
  if (admins().includes(chat)) rows.push([labels.requests, announcementLabel]);
  return { keyboard: rows.map((row) => row.map((text) => ({ text }))), resize_keyboard: true, is_persistent: true };
}

export function refreshPortalMenu(chat: string, hasAccount: boolean) {
  return telegram('sendMessage', { chat_id: chat, text: 'از منو می‌توانید وارد سایت شوید یا سرویس‌ها را انتخاب کنید.',
    reply_markup: keyboard(chat, hasAccount) });
}

export async function telegramWebhook(request: Request) {
  if (!equalSecret(request.headers.get('x-telegram-bot-api-secret-token') ?? '', setting('TELEGRAM_WEBHOOK_SECRET'))) {
    throw new PortalError(403, 'درخواست معتبر نیست.');
  }
  const update = await readBody(request);
  if (update.callback_query) {
    const callback = update.callback_query as ReviewCallback;
    if (typeof callback.data === 'string' && callback.data.startsWith('announce-')) await decideAnnouncement(callback);
    else await decideReview(callback);
    return reply({ ok: true });
  }
  const message = update.message as {
    message_id?: number;
    chat?: { id?: number; type?: string };
    from?: { id?: number };
    text?: string;
    reply_to_message?: { text?: string; from?: { is_bot?: boolean } };
  } | undefined;
  if (message?.chat?.type !== 'private' || !message.from || !Number.isSafeInteger(message.from.id) || message.chat.id !== message.from.id) return reply({ ok: true });

  const chat = String(message.from.id);
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  const [command, input] = text.split(/\s+/, 2);
  const send = (text: string, reply_markup?: object) => telegram('sendMessage', { chat_id: chat, text, reply_markup, link_preview_options: { is_disabled: true } });
  try {
    const isAdmin = admins().includes(chat);
    const repliesToAnnouncement = message.reply_to_message?.from?.is_bot === true
      && message.reply_to_message.text === announcementPrompt;
    if (isAdmin && (repliesToAnnouncement || text === announcementLabel || command === '/announce')) {
      await limit(`telegram:${chat}`, 25);
      if (repliesToAnnouncement && typeof message.message_id === 'number' && Number.isSafeInteger(message.message_id)) {
        await previewAnnouncement(chat, message.message_id, text);
      } else {
        await openAnnouncement(chat);
      }
      return reply({ ok: true });
    }
    if (!text) return reply({ ok: true });
    await limit(`telegram:${chat}`, 25);
    const [account] = await query<{ id: string; active: boolean; review_status: keyof typeof reviewStatusText }[]>('portal_profiles', {
      telegram_id: `eq.${chat}`, select: 'id,active,review_status', limit: '1',
    });
    const menu = keyboard(chat, Boolean(account));
    const login = async (target: 'home' | 'panel' | 'solver', linkAccount = false) => {
      if (command === '/start') await refreshPortalMenu(chat, Boolean(account)).catch(() => {});
      if (account?.active && !linkAccount) {
        const button = target === 'home' ? labels.home : target === 'solver' ? 'ورود به نامرالب' : 'باز کردن پنل و آزمون‌ها';
        const url = await issueLoginLink(account.id, chat, target);
        await send('این لینک اختصاصی تا ۳ دقیقه و برای یک ورود معتبر است.', { inline_keyboard: [[link(button, url)]] });
        return;
      }
      if (account && !account.active) {
        await send(account.review_status === 'approved' ? 'حساب در حال حاضر غیرفعال است.' : reviewStatusText[account.review_status], menu);
        return;
      }
      const buttons = [miniApp('ورود با مینی‌اپ تلگرام', 'mode=login&to=' + target)];
      const rows = target === 'home' ? [[link(labels.home, 'https://ieaum.ir/')], buttons] : [buttons];
      await send('برای ورود به حساب، مینی‌اپ تلگرام را باز کنید.', { inline_keyboard: rows });
    };
    const signup = async (role: 'student' | 'teacher') => {
      if (account) {
        await send('قبلاً حساب نامرالب ساخته‌اید. از گزینهٔ ورود استفاده کنید.', menu);
        return;
      }
      await send('فرم ساخت حساب را در مینی‌اپ باز کنید.', { inline_keyboard: [[miniApp(labels[role], 'role=' + role)]] });
    };

    if (isAdmin && (command === '/requests' || text === labels.requests || text === 'دعوت دانشجو' || command === '/student')) {
      await pendingReviews(chat);
    } else if (command === '/start' && input === 'signup') {
      if (account) await send('قبلاً حساب نامرالب ساخته‌اید. از گزینهٔ ورود استفاده کنید.', menu);
      else await send('نوع حساب را انتخاب کنید تا فرم مستقیم در تلگرام باز شود.', {
        inline_keyboard: [[miniApp(labels.student, 'role=student')], [miniApp(labels.teacher, 'role=teacher')]],
      });
    } else if (text === labels.teacher || text === 'فعال‌سازی حساب استاد' || text === 'دعوت استاد' || command === '/teacher' || (command === '/start' && input === 'teacher')) {
      await signup('teacher');
    } else if (text === labels.student || (command === '/start' && input === 'student')) {
      await signup('student');
    } else if (text === labels.home || command === '/site' || (command === '/start' && input === 'home')) {
      await login('home');
    } else if (text === labels.solver || command === '/numralab' || (command === '/start' && input === 'solver')) {
      await login('solver');
    } else if ([labels.quizzes, 'ورود به پنل'].includes(text) || ['/panel', '/quizzes'].includes(command) || (command === '/start' && input === 'login')) {
      await login('panel');
    } else if (text === labels.reset || command === '/reset' || (command === '/start' && input === 'reset')) {
      if (!account?.active) {
        await send('برای بازیابی رمز، از همان حساب تلگرامی استفاده کنید که به حساب فعال نامرالب متصل است.', menu);
      } else {
        const code = await issueResetCode(account.id, chat);
        await send('برای تعیین رمز جدید، فرم بازیابی را باز کنید. دکمه تا ۱۰ دقیقه معتبر است.', {
          inline_keyboard: [[miniApp('تعیین رمز جدید', 'mode=reset&code=' + code)]],
        });
      }
    } else if (text === labels.sizing || text === labels.talent) {
      await send('این سرویس به زودی ارائه می‌شود.', menu);
    } else if (text === labels.about || text === 'راهنما' || command === '/about') {
      await send('دستیار مهندسان صنایع دانشگاه آزاد مشهد', { inline_keyboard: [[link('ورود به کانال تلگرام', 'https://t.me/ieaum_club')]] });
    } else if (command === '/status' || text === labels.status || (command === '/start' && input === 'link')) {
      if (!account) await login('panel', true);
      else await send(account.review_status === 'approved' && !account.active
        ? 'حساب در حال حاضر غیرفعال است.' : reviewStatusText[account.review_status], menu);
    } else if (command === '/id' || text === 'شناسهٔ تلگرام من') {
      await send(`شناسهٔ عددی تلگرام شما: ${chat}`, menu);
    } else {
      await send('به ربات دستیار مهندسان صنایع خوش آمدید.', menu);
    }
  } catch (error) {
    if (error instanceof PortalError && error.status === 429) await send(error.message);
    else throw error;
  }
  return reply({ ok: true });
}

export function eligibleStudent(number: string) {
  return /^[0-9]{6,20}$/.test(number) && number.startsWith(setting('STUDENT_NUMBER_PREFIX'));
}
