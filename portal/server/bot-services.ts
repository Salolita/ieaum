import { admins } from './account-review.js';
import { manageAccountRow } from './account-actions.js';
import { equalSecret, query, reply, rpc, studentNumber, supabase, write } from './portal-store.js';
import { telegram } from './telegram-delivery.js';
import { jalaliToISO } from '../client/utils/jalali.js';

export const usersLabel = 'فهرست حساب‌ها';
export const legacyUsersLabel = 'کاربران واردشده';
export const weekLabel = 'اعلان هفتهٔ زوج و فرد';
export const weekSettingsLabel = 'تنظیم هفتهٔ زوج و فرد';
export const weekPrompt = 'تاریخ شروع هفته و وضعیتش را بفرستید. نمونه: ۱۴۰۵/۰۸/۳۰ فرد';
const fa = new Intl.NumberFormat('fa-IR', { useGrouping: false });
const dayMs = 86_400_000;
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });
const send = (chat: string, text: string, reply_markup?: object, protect_content = false) => telegram('sendMessage', { chat_id: chat, text, reply_markup, protect_content });

interface DirectoryAccount {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  role: 'student' | 'teacher';
  active: boolean;
  review_status: 'approved' | 'pending' | 'rejected';
  last_portal_login_at: string | null;
}

function accountStatus(account: DirectoryAccount) {
  if (account.active) return 'فعال';
  if (account.review_status === 'pending') return 'در انتظار تأیید';
  if (account.review_status === 'rejected') return 'ردشده';
  return 'غیرفعال';
}

export async function listAccounts(chat: string) {
  if (!admins().includes(chat)) return;
  const rows: DirectoryAccount[] = [];
  while (true) {
    const last = rows.at(-1);
    const page = await query<DirectoryAccount[]>('portal_profiles', {
      select: 'id,username,first_name,last_name,role,active,review_status,last_portal_login_at',
      order: 'username.asc', limit: '250', ...(last ? { username: `gt.${last.username}` } : {}),
    });
    rows.push(...page);
    if (page.length < 250) break;
  }
  if (!rows.length) {
    await write('portal_admin_user_lists', 'DELETE', undefined, { chat_id: `eq.${chat}` });
    return send(chat, 'هیچ حسابی ثبت نشده است.');
  }
  await supabase('/rest/v1/portal_admin_user_lists?on_conflict=chat_id', 'POST', {
    chat_id: chat, profile_ids: rows.map(({ id }) => id), expires_at: new Date(Date.now() + 900_000).toISOString(),
  }, false, undefined, 'resolution=merge-duplicates');
  await send(chat, `فهرست حساب‌ها: ${fa.format(rows.length)} حساب\nفعال: ${fa.format(rows.filter((row) => row.active).length)}\nسابقهٔ ورود ثبت‌شده: ${fa.format(rows.filter((row) => row.last_portal_login_at !== null).length)}`, undefined, true);
  for (let i = 0; i < rows.length; i += 12) {
    const lines = rows.slice(i, i + 12).map((row, index) =>
      `${fa.format(i + index + 1)}. ${row.first_name} ${row.last_name} (${row.username}) · ${row.role === 'teacher' ? 'استاد' : 'دانشجو'} · ${accountStatus(row)} · ${row.last_portal_login_at ? 'ورود ثبت شده' : 'بدون سابقهٔ ورود ثبت‌شده'}`);
    await send(chat, lines.join('\n'), undefined, true);
  }
  await send(chat, 'برای مدیریت حساب، شمارهٔ ردیف را بفرستید. این فهرست تا ۱۵ دقیقه معتبر است.', undefined, true);
}

export async function manageListedUser(chat: string, input: string) {
  if (!admins().includes(chat)) return;
  const index = Number(studentNumber(input)) - 1;
  const [list] = await query<{ profile_ids: string[] }[]>('portal_admin_user_lists', {
    chat_id: `eq.${chat}`, expires_at: `gt.${new Date().toISOString()}`, select: 'profile_ids',
  });
  const id = list?.profile_ids[index];
  if (!id) return send(chat, 'ردیف معتبر نیست. «فهرست حساب‌ها» را بزنید و شماره را دوباره بفرستید.');
  await manageAccountRow(chat, id);
}

export const noticesLabel = 'اعلان‌ها';
export const todayWeekLabel = 'این هفته زوج است یا فرد؟';

export async function showCurrentWeek(chat: string) {
  const [schedule] = await query<{ anchor: string; odd: boolean }[]>('portal_week_schedule', { id: 'eq.1', select: 'anchor,odd' });
  const week = schedule && currentWeek(schedule.anchor, schedule.odd, dateFormat.format(new Date()), true);
  return send(chat, week ? `درود،\nاین هفته ${week.odd ? 'فرد' : 'زوج'} است.\nموفق باشید.` : 'برنامهٔ هفته‌های زوج و فرد هنوز شروع نشده است.');
}

export async function weekMenu(chat: string) {
  const [subscription] = await query<{ enabled: boolean }[]>('portal_week_subscriptions', { chat_id: `eq.${chat}`, select: 'enabled' });
  return send(chat, subscription?.enabled ? 'اعلان هفتگی برای شما فعال است.' : 'اعلان هفتگی برای شما غیرفعال است.', {
    inline_keyboard: [[subscription?.enabled ? { text: 'غیرفعال کردن', callback_data: 'week:off' } : { text: 'فعال کردن', callback_data: 'week:on' }]],
  });
}

export async function setWeekSubscription(chat: string, enabled: boolean) {
  await supabase('/rest/v1/portal_week_subscriptions?on_conflict=chat_id', 'POST', { chat_id: chat, enabled }, false, undefined, 'resolution=merge-duplicates');
}

export async function setWeekAnchor(chat: string, input: string) {
  if (!admins().includes(chat)) return;
  const [date, parity, extra] = input.split(/\s+/);
  const anchor = jalaliToISO(date);
  if (!anchor || !['زوج', 'فرد'].includes(parity) || extra) return send(chat, weekPrompt, { force_reply: true });
  await write('portal_week_schedule', 'PATCH', { anchor, odd: parity === 'فرد' }, { id: 'eq.1' });
  await send(chat, `مبنای هفته روی ${date} (${parity}) ذخیره شد.`);
}

export function currentWeek(anchor: string, odd: boolean, today: string, includeBeforeAnchor = false) {
  const start = Date.parse(anchor);
  const elapsed = Math.floor((Date.parse(today) - start) / (7 * dayMs));
  if (!Number.isFinite(elapsed) || (!includeBeforeAnchor && elapsed < 0)) return null;
  return { date: new Date(start + elapsed * 7 * dayMs).toISOString().slice(0, 10), odd: elapsed % 2 === 0 ? odd : !odd };
}

export async function deliverWeekNotices(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (request.method !== 'GET' || !secret || !equalSecret(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) return reply({ error: 'Unauthorized' }, 401);
  const [schedule] = await query<{ anchor: string; odd: boolean }[]>('portal_week_schedule', { id: 'eq.1', select: 'anchor,odd' });
  const week = schedule && currentWeek(schedule.anchor, schedule.odd, dateFormat.format(new Date()));
  if (!week) return reply({ sent: 0 });
  let sent = 0;
  const deadline = Date.now() + 43_000;
  while (Date.now() < deadline) {
    const batch = await rpc<{ chat_id: string }[]>('portal_claim_week', { p_week: week.date, p_count: 12 });
    if (!batch.length) break;
    await Promise.allSettled(batch.map(async ({ chat_id }) => {
      const [current] = await query<{ enabled: boolean }[]>('portal_week_subscriptions', { chat_id: `eq.${chat_id}`, select: 'enabled' });
      if (!current?.enabled) return;
      await send(chat_id, `درود،\nاین هفته ${week.odd ? 'فرد' : 'زوج'} است.\nموفق باشید.`);
      await write('portal_week_subscriptions', 'PATCH', { last_week: week.date, lease_until: null }, { chat_id: `eq.${chat_id}` });
      sent++;
    }));
  }
  return reply({ sent });
}
