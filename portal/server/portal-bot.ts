import { equalSecret, limit, PortalError, query, readBody, reply, setting } from './portal-store.js';
import { admins, decideReview, isMembershipReviewer, pendingReviews, reviewStatusText, type ReviewCallback } from './account-review.js';
import { telegram } from './telegram-delivery.js';
import { issueLoginLink, issueResetCode } from './portal-entry.js';
import { announcementLabel, announcementPrompt, decideAnnouncement, openAnnouncement, previewAnnouncement } from './admin-announcements.js';
import { legacyUsersLabel, listAccounts, manageListedUser, noticesLabel, setWeekAnchor, setWeekSubscription, showCurrentWeek, todayWeekLabel, usersLabel, weekLabel, weekMenu, weekPrompt, weekSettingsLabel } from './bot-services.js';
import { accountForChat, handleAccountCallback, handleAccountReason, profileLabel, showProfile, statusMessage } from './account-actions.js';

const labels = {
  home: 'ورود به سایت', solver: 'نامرالب', quizzes: 'آزمون‌ها', student: 'ساخت حساب دانشجو', teacher: 'ساخت حساب استاد',
  status: 'وضعیت حساب و اتصال تلگرام', about: 'درباره ما', sizing: 'انداز برانداز', talent: 'استعدادتو', requests: 'درخواست‌های ثبت‌نام',
  reset: 'فراموشی رمز عبور', services: 'سرویس‌ها', presentation: 'ارائه‌طوری', back: 'منوی اصلی',
};

const replyKeyboard = (rows: string[][]) => ({ keyboard: rows.map((row) => row.map((text) => ({ text }))),
  resize_keyboard: true, is_persistent: false, one_time_keyboard: true });

const link = (text: string, url: string) => ({ text, url });
const miniApp = (text: string, params: string) => ({
  text, web_app: { url: new URL('/account/?' + params, 'https://ieaum.ir').href },
});

function keyboard(chat: string, hasAccount: boolean) {
  const rows = [[labels.home, labels.services], [labels.quizzes, profileLabel], [noticesLabel, labels.about]];
  if (!hasAccount) rows.push([labels.student, labels.teacher]);
  if (admins().includes(chat)) rows.push([labels.requests, announcementLabel], [usersLabel, weekSettingsLabel]);
  return replyKeyboard(rows);
}

async function sendReset(chat: string) {
  const account = await accountForChat(chat);
  if (!account?.active) {
    await telegram('sendMessage', { chat_id: chat, text: 'برای بازیابی رمز، از تلگرامی استفاده کنید که به حساب فعال IEAUM متصل است.' });
    return;
  }
  const code = await issueResetCode(account.id, chat);
  await telegram('sendMessage', { chat_id: chat, text: 'برای تعیین رمز جدید، فرم بازیابی را باز کنید. دکمه تا ۱۰ دقیقه معتبر است.',
    reply_markup: { inline_keyboard: [[miniApp('تعیین رمز جدید', 'mode=reset&code=' + code)]] } });
}

export function refreshPortalMenu(chat: string, hasAccount: boolean) {
  if (isMembershipReviewer(chat)) return Promise.resolve();
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
    if (typeof callback.data === 'string' && callback.data.startsWith('acct:')) await handleAccountCallback(callback, refreshPortalMenu, sendReset);
    else if (callback.data === 'week:on' || callback.data === 'week:off') {
      const chat = callback.message?.chat;
      if (chat?.type === 'private' && Number.isSafeInteger(chat.id) && chat.id === callback.from?.id && typeof callback.id === 'string' && !isMembershipReviewer(String(chat.id))) {
        const enabled = callback.data === 'week:on';
        await setWeekSubscription(String(chat.id), enabled);
        await Promise.allSettled([
          telegram('answerCallbackQuery', { callback_query_id: callback.id, text: enabled ? 'اعلان فعال شد.' : 'اعلان غیرفعال شد.' }),
          telegram('editMessageText', { chat_id: chat.id, message_id: callback.message?.message_id,
            text: enabled ? 'اعلان هفتگی برای شما فعال است.' : 'اعلان هفتگی برای شما غیرفعال است.',
            reply_markup: { inline_keyboard: [[enabled ? { text: 'غیرفعال کردن', callback_data: 'week:off' } : { text: 'فعال کردن', callback_data: 'week:on' }]] } }),
        ]);
      }
    } else if (typeof callback.data === 'string' && callback.data.startsWith('announce-')) await decideAnnouncement(callback);
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
  if (isMembershipReviewer(chat)) {
    if (command === '/start') await send('درخواست‌های عضویت در همین گفت‌وگو نمایش داده می‌شوند. برای تأیید، دکمهٔ زیر هر درخواست را بزنید.', { remove_keyboard: true });
    return reply({ ok: true });
  }
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
    if (message.reply_to_message?.from?.is_bot && await handleAccountReason(chat, message.reply_to_message.text, text)) return reply({ ok: true });
    if (isAdmin && (text === usersLabel || text === legacyUsersLabel || command === '/users')) {
      await listAccounts(chat);
      return reply({ ok: true });
    }
    if (isAdmin && /^\d{1,8}$/.test(text.replace(/[۰-۹٠-٩]/g, '0'))) {
      await manageListedUser(chat, text);
      return reply({ ok: true });
    }
    if (isAdmin && (text === weekSettingsLabel || command === '/week_settings')) {
      await send(weekPrompt, { force_reply: true });
      return reply({ ok: true });
    }
    if (isAdmin && message.reply_to_message?.from?.is_bot && message.reply_to_message.text === weekPrompt) {
      await setWeekAnchor(chat, text);
      return reply({ ok: true });
    }
    if (text === weekLabel || command === '/week') {
      await weekMenu(chat);
      return reply({ ok: true });
    }
    if (text === noticesLabel) {
      await send('یکی از گزینه‌های اعلان را انتخاب کنید.', replyKeyboard([[weekLabel, todayWeekLabel], [labels.back]]));
      return reply({ ok: true });
    }
    if (text === todayWeekLabel) {
      await showCurrentWeek(chat);
      return reply({ ok: true });
    }
    const [account] = await query<{ id: string; active: boolean; review_status: keyof typeof reviewStatusText }[]>('portal_profiles', {
      telegram_id: `eq.${chat}`, select: 'id,active,review_status', limit: '1',
    });
    const menu = keyboard(chat, Boolean(account));
    const login = async (target: 'home' | 'panel' | 'solver' | 'presentation', linkAccount = false) => {
      if (command === '/start') await refreshPortalMenu(chat, Boolean(account)).catch(() => {});
      if (account?.active && !linkAccount) {
        const button = target === 'home' ? labels.home : target === 'solver' ? 'ورود به نامرالب'
          : target === 'presentation' ? 'ورود به ارائه‌طوری' : 'باز کردن پنل و آزمون‌ها';
        const url = await issueLoginLink(account.id, chat, target);
        const prompt = target === 'home' ? 'برای ورود کلیک نمایید.' : target === 'presentation' ? 'برای باز کردن ارائه‌طوری، دکمهٔ زیر را بزنید.'
          : 'این لینک اختصاصی تا ۳ دقیقه و برای یک ورود معتبر است.';
        await send(prompt, { inline_keyboard: [[link(button, url)]] });
        return;
      }
      if (target === 'home') {
        await send('برای ورود کلیک نمایید.', { inline_keyboard: [[link(labels.home, 'https://ieaum.ir/')]] });
        return;
      }
      if (account && !account.active) {
        await send(account.review_status === 'approved' ? 'حساب در حال حاضر غیرفعال است.' : reviewStatusText[account.review_status], menu);
        return;
      }
      const buttons = [miniApp('ورود با مینی‌اپ تلگرام', 'mode=login&to=' + target)];
      await send('برای ورود به حساب، مینی‌اپ تلگرام را باز کنید.', { inline_keyboard: [buttons] });
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
    } else if (text === labels.services || command === '/services') {
      await send('یک سرویس را انتخاب کنید.', replyKeyboard([[labels.solver, labels.presentation], [labels.sizing, labels.talent], [labels.back]]));
    } else if (text === labels.presentation || command === '/presentation' || (command === '/start' && input === 'presentation')) {
      await login('presentation');
    } else if ([labels.solver, 'نامرالَب'].includes(text) || command === '/numralab' || (command === '/start' && input === 'solver')) {
      await login('solver');
    } else if ([labels.quizzes, 'ورود به پنل'].includes(text) || ['/panel', '/quizzes'].includes(command) || (command === '/start' && input === 'login')) {
      await login('panel');
    } else if (text === labels.reset || command === '/reset' || (command === '/start' && input === 'reset')) {
      await sendReset(chat);
    } else if (text === labels.sizing || text === labels.talent) {
      await send('این سرویس به زودی ارائه می‌شود.');
    } else if (text === labels.about || text === 'راهنما' || command === '/about') {
      await send('دستیار مهندسان صنایع دانشگاه آزاد مشهد', { inline_keyboard: [[link('ورود به کانال تلگرام', 'https://t.me/ieaum_club')]] });
    } else if (text === profileLabel || command === '/profile') {
      const profile = await accountForChat(chat);
      if (profile) await showProfile(chat, profile, miniApp('', 'mode=profile').web_app.url);
      else await send('هنوز حسابی به این تلگرام متصل نیست.', { inline_keyboard: [[miniApp('ورود و اتصال حساب', 'mode=link&to=panel')],
        [miniApp(labels.student, 'role=student'), miniApp(labels.teacher, 'role=teacher')]] });
    } else if (command === '/status' || text === labels.status || (command === '/start' && input === 'link')) {
      if (!account) await login('panel', true);
      else {
        const profile = await accountForChat(chat);
        if (profile) await send(statusMessage(profile));
      }
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
