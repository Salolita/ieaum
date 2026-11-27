import { equalSecret, limit, PortalError, query, readBody, reply, setting } from './portal-store.js';
import { admins, decideReview, notifyMembershipLogin, pendingReviews, reviewStatusText, type ReviewCallback } from './account-review.js';
import { telegram } from './telegram-delivery.js';
import { liveCodeContactUrl, liveCodeLabel, liveCodeOffline, liveCodeOnline, liveCodeUrl } from '../live-code.js';
import { issueLoginLink, issueResetCode } from './portal-entry.js';
import { announcementInput, announcementLabel, announcementPrompt, announcementStatusLabel, decideAnnouncement, openAnnouncement, showAnnouncementStatus } from './admin-announcements.js';
import { askWeekTime, legacyUsersLabel, listAccounts, sendAccountsCsv, manageListedUser, noticesLabel, setCustomWeekTime, setWeekAnchor, setWeekSubscription, showCurrentWeek, todayWeekLabel, usersLabel, weekLabel, weekMenu, weekPrompt, weekSettingsLabel, weekTimePrompt } from './bot-services.js';
import { accountForChat, handleAccountCallback, handleAccountReason, profileLabel, showProfile, statusMessage } from './account-actions.js';
import { handlePresentationCallback, handlePresentationEdit, myPresentationsLabel, presentationMenu, showPresentations } from './erae-bot.js';
import { presenceMenu, presenceMenuLabel, updatePresence } from './site-management.js';
import { ownerTelegram } from './presence.js';
import { notesLabel, notesMenu, openNotesSettings, saveNotesLink } from './notes-bot.js';
import { recordBotContact } from './bot-contacts.js';
import { channelCallback, channelMenu, channelsLabel, handleChannelReply, handleSharedChannel, requireMembership } from './required-channels.js';
import { birthdayLabel, birthdayMenu, birthdayPrompt, handleBirthdayCallback, saveBirthdayTemplate } from './bot-features.js';

const labels = {
  home: 'ورود به پنل', solver: 'نامرالب', quizzes: 'آزمون‌ها', student: 'ساخت حساب دانشجو', teacher: 'ساخت حساب استاد',
  status: 'وضعیت حساب و اتصال تلگرام', about: 'درباره ما', sizing: 'انداز برانداز', talent: 'استعدادتو', requests: 'درخواست‌های ثبت‌نام',
  reset: 'فراموشی رمز عبور', services: 'سرویس‌ها', presentation: 'ارائه‌طوری', back: 'منوی اصلی',
};

const replyKeyboard = (rows: string[][]) => ({ keyboard: rows.map((row) => row.map((text) => ({ text }))),
  resize_keyboard: true, is_persistent: true, one_time_keyboard: false });

const link = (text: string, url: string) => ({ text, url });
const miniApp = (text: string, params: string) => ({
  text, web_app: { url: new URL('/account/?' + params, 'https://ieaum.ir').href },
});

function keyboard(chat: string, hasAccount: boolean) {
  const rows = [[labels.home, labels.services], [labels.quizzes, profileLabel], [noticesLabel, labels.about]];
  if (!hasAccount) rows.push([labels.student, labels.teacher]);
  if (admins().includes(chat)) rows.push([labels.requests, usersLabel], [channelsLabel]);
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
  return telegram('sendMessage', { chat_id: chat, text: 'از منو می‌توانید وارد سایت شوید یا سرویس‌ها را انتخاب کنید.',
    reply_markup: keyboard(chat, hasAccount) });
}

export async function telegramWebhook(request: Request) {
  if (!equalSecret(request.headers.get('x-telegram-bot-api-secret-token') ?? '', setting('TELEGRAM_WEBHOOK_SECRET'))) {
    throw new PortalError(403, 'درخواست معتبر نیست.');
  }
  const update = await readBody(request);
  if (update.my_chat_member) {
    const membership = update.my_chat_member as { chat?: { type?: string; id?: number }; date?: number; new_chat_member?: { status?: string } };
    const chat = membership.chat;
    const status = membership.new_chat_member?.status;
    if (chat?.type === 'private' && typeof chat.id === 'number' && Number.isSafeInteger(chat.id) && chat.id > 0 && (status === 'member' || status === 'kicked')) {
      await recordBotContact(chat.id, status === 'member', membership.date);
    }
    return reply({ ok: true });
  }
  if (update.callback_query) {
    const callback = update.callback_query as ReviewCallback;
    const channel = callback.message?.chat;
    if (typeof callback.data === 'string' && callback.data.startsWith('membership:')) {
      try { await channelCallback(callback, async (chat) => refreshPortalMenu(chat, Boolean(await accountForChat(chat)))); }
      catch (error) {
        if (!(error instanceof PortalError) || error.status !== 429) throw error;
      }
      return reply({ ok: true });
    }
    if (channel?.type === 'private' && channel.id === callback.from?.id && typeof callback.id === 'string'
      && !await requireMembership(String(channel.id), admins().includes(String(channel.id)))) {
      await telegram('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => {});
      return reply({ ok: true });
    }
    if (typeof callback.data === 'string' && /^presence:(on|off|telegram|report)$/.test(callback.data)) {
      if (channel?.type === 'private' && String(channel.id) === ownerTelegram && channel.id === callback.from?.id && typeof callback.id === 'string') {
        await telegram('answerCallbackQuery', { callback_query_id: callback.id });
        await updatePresence(ownerTelegram, callback.data.slice('presence:'.length), callback.message?.message_id);
      }
    } else if (callback.data === 'notes:link') await openNotesSettings(callback);
    else if (callback.data === 'accounts:csv') {
      if (channel?.type === 'private' && Number.isSafeInteger(channel.id) && channel.id === callback.from?.id && typeof callback.id === 'string') {
        const chat = String(channel.id);
        const allowed = admins().includes(chat);
        await telegram('answerCallbackQuery', { callback_query_id: callback.id, ...(allowed ? {} : { text: 'دسترسی مدیر لازم است.' }) });
        if (allowed) await sendAccountsCsv(chat).catch((error) =>
          telegram('sendMessage', { chat_id: chat, text: error instanceof PortalError ? error.message : 'ارسال فایل اعضا ممکن نشد. دوباره تلاش کنید.' }));
      }
    } else if (typeof callback.data === 'string' && callback.data.startsWith('acct:')) await handleAccountCallback(callback, refreshPortalMenu, sendReset);
    else if (typeof callback.data === 'string' && callback.data.startsWith('birthday:')) await handleBirthdayCallback(callback);
    else if (typeof callback.data === 'string' && callback.data.startsWith('erae:')) await handlePresentationCallback(callback);
    else if (typeof callback.data === 'string' && /^week:(on|off|fri|sat|custom)$/.test(callback.data)) {
      const chat = callback.message?.chat;
      if (chat?.type === 'private' && Number.isSafeInteger(chat.id) && chat.id === callback.from?.id && typeof callback.id === 'string') {
        const recipient = String(chat.id);
        await telegram('answerCallbackQuery', { callback_query_id: callback.id });
        if (callback.data === 'week:custom') await askWeekTime(recipient);
        else {
          const schedule = callback.data === 'week:fri' ? { weekday: 5, minute_of_day: 1260 }
            : callback.data === 'week:sat' ? { weekday: 6, minute_of_day: 360 } : undefined;
          await setWeekSubscription(recipient, callback.data !== 'week:off', schedule);
          await weekMenu(recipient);
        }
      }
    } else if (typeof callback.data === 'string' && callback.data.startsWith('announce-')) await decideAnnouncement(callback);
    else await decideReview(callback);
    return reply({ ok: true });
  }
  const message = update.message as {
    message_id?: number;
    date?: number;
    chat?: { id?: number; type?: string };
    from?: { id?: number };
    text?: string;
    chat_shared?: unknown;
    reply_to_message?: { message_id?: number; text?: string; from?: { is_bot?: boolean } };
  } | undefined;
  if (message?.chat?.type !== 'private' || !message.from || typeof message.from.id !== 'number' || !Number.isSafeInteger(message.from.id)
    || message.from.id <= 0 || message.chat.id !== message.from.id) return reply({ ok: true });

  const chat = String(message.from.id);
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  const [command, input] = text.split(/\s+/, 2);
  const send = (text: string, reply_markup?: object) => telegram('sendMessage', { chat_id: chat, text, reply_markup, link_preview_options: { is_disabled: true } });
  try {
    await recordBotContact(chat, true, message.date).catch(() => {});
    const isAdmin = admins().includes(chat);
    if (isAdmin && message.chat_shared) {
      await limit(`telegram:${chat}`, 25);
      await handleSharedChannel(chat, message.chat_shared, async () => {
        await refreshPortalMenu(chat, Boolean(await accountForChat(chat)));
      });
      return reply({ ok: true });
    }
    const replied = message.reply_to_message?.from?.is_bot === true ? message.reply_to_message : undefined;
    if (isAdmin && (text === announcementLabel || command === '/announce')) {
      await limit(`telegram:${chat}`, 25);
      await openAnnouncement(chat);
      return reply({ ok: true });
    }
    if (!text) return reply({ ok: true });
    await limit(`telegram:${chat}`, 25);
    if (!await requireMembership(chat, isAdmin)) return reply({ ok: true });
    if (replied && await saveNotesLink(chat, replied.text, text)) return reply({ ok: true });
    if (isAdmin && (text === announcementStatusLabel || command === '/announcement_status')) {
      await showAnnouncementStatus(chat);
      return reply({ ok: true });
    }
    if (isAdmin && (text === channelsLabel || command === '/channels')) { await channelMenu(chat); return reply({ ok: true }); }
    if (replied && await handleChannelReply(chat, replied.text, text)) return reply({ ok: true });
    if (isAdmin && (text === birthdayLabel || command === '/birthday')) { await birthdayMenu(chat); return reply({ ok: true }); }
    if (isAdmin && replied?.text === birthdayPrompt) { await saveBirthdayTemplate(chat, text); return reply({ ok: true }); }
    if (message.reply_to_message?.from?.is_bot && await handleAccountReason(chat, message.reply_to_message.text, text)) return reply({ ok: true });
    if (message.reply_to_message?.from?.is_bot && await handlePresentationEdit(chat, message.reply_to_message.text, text)) return reply({ ok: true });
    if (message.reply_to_message?.from?.is_bot && message.reply_to_message.text === weekTimePrompt) {
      await setCustomWeekTime(chat, text); return reply({ ok: true });
    }
    if (text === myPresentationsLabel || command === '/presentations') { await showPresentations(chat); return reply({ ok: true }); }
    if (chat === ownerTelegram && (text === presenceMenuLabel || command === '/presence')) {
      await presenceMenu(chat);
      return reply({ ok: true });
    }
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
      const rows = [[weekLabel, todayWeekLabel]];
      if (isAdmin) rows.push([announcementLabel, announcementStatusLabel], [weekSettingsLabel, birthdayLabel]);
      if (chat === ownerTelegram) rows.push([presenceMenuLabel]);
      rows.push([labels.back]);
      await send('نوع اعلان را انتخاب کنید.', replyKeyboard(rows));
      return reply({ ok: true });
    }
    if (text === todayWeekLabel) {
      await showCurrentWeek(chat);
      return reply({ ok: true });
    }
    if (isAdmin && text !== labels.back && await announcementInput(chat, message.message_id, text, replied?.text === announcementPrompt ? replied.message_id : undefined)) return reply({ ok: true });
    if (text === notesLabel || command === '/notes') { await notesMenu(chat); return reply({ ok: true }); }
    const [account] = await query<{ id: string; active: boolean; review_status: keyof typeof reviewStatusText }[]>('portal_profiles', {
      telegram_id: `eq.${chat}`, select: 'id,active,review_status', limit: '1',
    });
    const menu = keyboard(chat, Boolean(account));
    const login = async (target: 'panel' | 'solver', linkAccount = false) => {
      if (command === '/start') await refreshPortalMenu(chat, Boolean(account)).catch(() => {});
      if (account?.review_status === 'pending' && !linkAccount) await notifyMembershipLogin(account.id).catch(() => {});
      if (account?.active && !linkAccount) {
        const button = target === 'solver' ? 'ورود به نامرالب' : labels.home;
        const url = await issueLoginLink(account.id, chat, target);
        await send('برای ورود کلیک نمایید.', { inline_keyboard: [[link(button, url)]] });
        return;
      }
      if (account && !account.active) {
        await send(account.review_status === 'approved' ? 'حساب در حال حاضر غیرفعال است.' : reviewStatusText[account.review_status], menu);
        return;
      }
      const route = target === 'solver' ? setting('PORTAL_ORIGIN') : 'https://ieaum.ir/panel/';
      const button = link('ورود', route);
      await send('برای ورود کلیک نمایید.', { inline_keyboard: [[linkAccount ? miniApp('اتصال حساب تلگرام', 'mode=link&to=panel') : button]] });
    };
    const signup = async (role: 'student' | 'teacher') => {
      if (account) {
        await send('قبلاً حساب IEAUM ساخته‌اید. از گزینهٔ ورود استفاده کنید.', menu);
        return;
      }
      if (command === '/start') await refreshPortalMenu(chat, false).catch(() => {});
      await send('فرم ساخت حساب را در مینی‌اپ باز کنید.', { inline_keyboard: [[miniApp(labels[role], 'role=' + role)]] });
    };

    if (isAdmin && (command === '/requests' || text === labels.requests || text === 'دعوت دانشجو' || command === '/student')) {
      await pendingReviews(chat);
    } else if (command === '/start' && input === 'signup') {
      if (account) await send('قبلاً حساب IEAUM ساخته‌اید. از گزینهٔ ورود استفاده کنید.', menu);
      else {
        await refreshPortalMenu(chat, false).catch(() => {});
        await send('نوع حساب را انتخاب کنید تا فرم مستقیم در تلگرام باز شود.', {
          inline_keyboard: [[miniApp(labels.student, 'role=student')], [miniApp(labels.teacher, 'role=teacher')]],
        });
      }
    } else if (text === labels.teacher || text === 'فعال‌سازی حساب استاد' || text === 'دعوت استاد' || command === '/teacher' || (command === '/start' && input === 'teacher')) {
      await signup('teacher');
    } else if (text === labels.student || (command === '/start' && input === 'student')) {
      await signup('student');
    } else if (text === labels.home || text === 'ورود به سایت' || command === '/site' || (command === '/start' && input === 'home')) {
      await login('panel');
    } else if (text === labels.services || command === '/services') {
      await send('یک سرویس را انتخاب کنید.', replyKeyboard([[labels.solver, labels.presentation], [labels.sizing, labels.talent], [liveCodeLabel, notesLabel], [labels.back]]));
    } else if (text === liveCodeLabel) {
      if (await liveCodeOnline()) await send(liveCodeLabel, {inline_keyboard: [[link('ورود به اجرای زنده کد', liveCodeUrl)]]});
      else await telegram('sendMessage', { chat_id: chat, parse_mode: 'HTML',
        text: `${liveCodeOffline}\n\nبرای فعال‌سازی این بخش با <a href="${liveCodeContactUrl}">مدیر</a> هماهنگ کنید.`,
        link_preview_options: { is_disabled: true },
      });
    } else if (text === labels.presentation || command === '/presentation' || (command === '/start' && input === 'presentation')) {
      if (command === '/start') await refreshPortalMenu(chat, Boolean(account)).catch(() => {});
      await presentationMenu(chat, account);
    } else if ([labels.solver, 'نامرالَب'].includes(text) || command === '/numralab' || (command === '/start' && input === 'solver')) {
      await login('solver');
    } else if (chat === ownerTelegram && account?.active && (text === labels.quizzes || command === '/quizzes')) {
      const panel = new URL(await issueLoginLink(account.id, chat, 'panel'));
      panel.searchParams.set('quizzes', 'manage');
      await send('مدیریت آزمون‌ها در پنل IEAUM در دسترس است.', { inline_keyboard: [[link('مدیریت آزمون‌ها', panel.href)]] });
    } else if ([labels.quizzes, 'ورود به پنل'].includes(text) || ['/panel', '/quizzes'].includes(command) || (command === '/start' && input === 'login')) {
      await login('panel');
    } else if (text === labels.reset || command === '/reset' || (command === '/start' && input === 'reset')) {
      if (command === '/start') await refreshPortalMenu(chat, Boolean(account)).catch(() => {});
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
        if (command === '/start') await refreshPortalMenu(chat, true).catch(() => {});
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
