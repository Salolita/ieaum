import { admins, type ReviewCallback } from './account-review.js';
import { query, rpc, write } from './portal-store.js';
import { telegram, TelegramDeliveryError } from './telegram-delivery.js';
import { usernamePattern, usernameRules } from '../client/utils/account-fields.js';
import { jalaliParts } from '../client/utils/jalali.js';

export const birthdayLabel = 'تبریک تولد';
export const birthdayPrompt = 'متن جدید را در پاسخ به همین پیام بفرستید. برای جای نام کاربر، عبارت {name} را در متن قرار دهید.';
const timeZone = 'Asia/Tehran';
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' });
const localHour = new Intl.DateTimeFormat('en-GB', { timeZone, hour:'2-digit', hourCycle:'h23' });
const send = (chat_id: string, text: string, reply_markup?: object) => telegram('sendMessage', { chat_id, text, reply_markup, protect_content: true });

interface Preferences { menu_ready: boolean; usernames_queued: boolean; birthday_enabled: boolean; birthday_template: string; birthdays_queued_on: string | null }
interface Notice { profile_id: string; kind: 'username' | 'birthday'; event_date: string; attempts: number }
const preferenceKey = { id: 'eq.1' };

async function preferences() {
  const [item] = await query<Preferences[]>('portal_bot_preferences', { ...preferenceKey,
    select: 'menu_ready,usernames_queued,birthday_enabled,birthday_template,birthdays_queued_on' });
  return item;
}

export async function birthdayMenu(chat: string) {
  if (!admins().includes(chat)) return;
  const item = await preferences();
  await send(chat, `${birthdayLabel} ${item.birthday_enabled ? 'فعال است' : 'غیرفعال است'}. زمان ارسال: ۹ صبح به وقت تهران.\n\nمتن پیام:\n${item.birthday_template}`, {
    inline_keyboard: [[{ text: 'ویرایش متن', callback_data: 'birthday:edit' }],
      [{ text: item.birthday_enabled ? 'غیرفعال‌سازی' : 'فعال‌سازی', callback_data: item.birthday_enabled ? 'birthday:off' : 'birthday:on' }]],
  });
}

export async function handleBirthdayCallback(callback: ReviewCallback) {
  const chat = callback.message?.chat;
  if (chat?.type !== 'private' || chat.id !== callback.from?.id || typeof callback.id !== 'string' || !admins().includes(String(chat.id))) return;
  const recipient = String(chat.id);
  const operation = callback.data?.split(':')[1];
  await telegram('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => {});
  if (operation === 'edit') return send(recipient, birthdayPrompt, { force_reply: true });
  if (operation !== 'on' && operation !== 'off') return;
  await write('portal_bot_preferences', 'PATCH', { birthday_enabled: operation === 'on' }, preferenceKey);
  await birthdayMenu(recipient);
}

export async function saveBirthdayTemplate(chat: string, text: string) {
  if (!admins().includes(chat)) return;
  if (!text.includes('{name}') || text.length > 800) {
    await send(chat, 'متن باید حداکثر ۸۰۰ نویسه داشته باشد و شامل {name} باشد.');
    return send(chat, birthdayPrompt, { force_reply: true });
  }
  await write('portal_bot_preferences', 'PATCH', { birthday_template: text }, preferenceKey);
  await birthdayMenu(chat);
}

export function matchesBirthday(iso: string | null, today: string) {
  if (!iso) return false;
  const birth = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(birth.getTime())) return false;
  const current = jalaliParts(new Date(`${today}T12:00:00Z`));
  const original = jalaliParts(birth);
  return original.month === current.month && original.day === current.day;
}

async function birthdayProfiles(today: string) {
  const matches: string[] = [];
  let after: string | undefined;
  while (true) {
    const rows: { id: string; birth_date: string }[] = await query('portal_profiles', { ...(after ? { id: `gt.${after}` } : {}),
      active: 'eq.true', telegram_id: 'not.is.null', birth_date: 'not.is.null', select: 'id,birth_date', order: 'id.asc', limit: '500' });
    for (const { id, birth_date } of rows) if (matchesBirthday(birth_date, today)) matches.push(id);
    if (rows.length < 500) return matches;
    after = rows.at(-1)!.id;
  }
}

async function configureMenu() {
  await telegram('setMyCommands', { scope: { type: 'all_private_chats' }, commands: [
    { command:'menu', description:'منوی اصلی ربات' }, { command:'panel', description:'ورود به پنل IEAUM' },
    { command:'services', description:'سرویس‌ها' }, { command:'profile', description:'نمایه من' },
    { command:'presentation', description:'ارائه‌طوری' }, { command:'week', description:'اعلان هفتهٔ زوج و فرد' },
  ] });
  await telegram('setChatMenuButton', { menu_button: { type: 'commands' } });
  await write('portal_bot_preferences', 'PATCH', { menu_ready: true }, preferenceKey);
}

async function deliverNotice(notice: Notice, item: Preferences, today: string) {
  const match = { profile_id: `eq.${notice.profile_id}`, kind: `eq.${notice.kind}`, event_date: `eq.${notice.event_date}`, state: 'eq.sending' };
  const [profile] = await query<{ telegram_id: string; username: string; first_name: string; last_name: string; birth_date: string | null }[]>('portal_profiles', {
    id: `eq.${notice.profile_id}`, active: 'eq.true', telegram_id: 'not.is.null', select: 'telegram_id,username,first_name,last_name,birth_date', limit:'1',
  });
  let state = 'skipped';
  try {
    if (profile && notice.kind === 'username' && !usernamePattern.test(profile.username)) {
      await send(profile.telegram_id, `کاربر گرامی،\nنام کاربری فعلی شما «${profile.username}» با قوانین جدید IEAUM سازگار نیست. لطفاً ظرف ۲۴ تا ۴۸ ساعت آینده از بخش «نمایه من» نام کاربری‌تان را تغییر دهید.\n\n${usernameRules}`, {
        inline_keyboard: [[{ text:'ویرایش نام کاربری', web_app:{ url:'https://ieaum.ir/account/?mode=profile' } }]],
      });
      state = 'sent';
    } else if (profile && notice.kind === 'birthday' && item.birthday_enabled && matchesBirthday(profile.birth_date, today)) {
      await send(profile.telegram_id, item.birthday_template.replaceAll('{name}', () => `${profile.first_name} ${profile.last_name}`.trim()));
      state = 'sent';
    }
  } catch (error) {
    if (error instanceof TelegramDeliveryError && error.status === 429 && notice.attempts < 3) {
      const delay = Number.isFinite(error.retryAfter) ? Math.max(1, error.retryAfter!) + 1 : 60;
      await write('portal_personal_notices', 'PATCH', { state:'pending', available_at:new Date(Date.now() + delay * 1000).toISOString() }, match);
      return;
    }
    state = 'failed';
  }
  await write('portal_personal_notices', 'PATCH', { state }, match);
}

export async function deliverPersonalNotices(now = new Date()) {
  const item = await preferences();
  if (!item) return;
  const today = localDate.format(now);
  if (!item.menu_ready) await configureMenu().catch(() => {});
  if (!item.usernames_queued) await rpc('portal_prepare_personal_notices', { p_kind:'username', p_date:today, p_profiles:[] });
  if (item.birthday_enabled && Number(localHour.format(now)) === 9 && item.birthdays_queued_on !== today) {
    await rpc('portal_prepare_personal_notices', { p_kind:'birthday', p_date:today, p_profiles:await birthdayProfiles(today) });
  }
  const batch = await rpc<Notice[]>('portal_claim_personal_notices', { p_date:today });
  await Promise.allSettled(batch.map((notice) => deliverNotice(notice, item, today)));
}
