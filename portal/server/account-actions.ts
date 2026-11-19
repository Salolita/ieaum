import { admins, reviewStatusText, type ReviewCallback } from './account-review.js';
import { query, rpc, uuidPattern, write } from './portal-store.js';
import { telegram } from './telegram-delivery.js';

export const profileLabel = 'نمایه من';
export const statusLabel = 'وضعیت حساب و اتصال تلگرام';
export const resetLabel = 'فراموشی رمز عبور';
export const withdrawalLabel = 'حذف حساب';
const reasons = { disable: 'علت غیرفعال‌سازی حساب را در پاسخ به همین پیام بنویسید.',
  purge: 'علت حذف دائمی حساب را در پاسخ به همین پیام بنویسید.',
  withdraw: 'علت درخواست حذف حسابتان را در پاسخ به همین پیام بنویسید.' };
const operationLabels = { disable: 'غیرفعال‌سازی', enable: 'فعال‌سازی', purge: 'حذف دائمی', withdraw: 'درخواست حذف' };
type Operation = keyof typeof operationLabels;
type ReasonOperation = keyof typeof reasons;

export interface AccountDetails {
  id: string; username: string; first_name: string; last_name: string; role: 'student' | 'teacher';
  active: boolean; review_status: keyof typeof reviewStatusText; approved_at: string | null;
  telegram_id: string | null; former_telegram_id: string | null; phone: string | null; birth_date: string | null; student_number: string | null; course_name: string | null;
}
interface ActionRequest { id: string; actor_chat: string; profile_id: string; operation: Operation; reason: string }
const profileFields = 'id,username,first_name,last_name,role,active,review_status,approved_at,telegram_id,former_telegram_id,phone,birth_date,student_number,course_name';
const actionFields = 'id,actor_chat,profile_id,operation,reason';
const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', dateStyle: 'long' });
const dateText = (date: string) => formatter.format(new Date(date));
const fullName = (account: AccountDetails) => `${account.first_name} ${account.last_name} (${account.username})`;
const send = (chat: string, text: string, reply_markup?: object) => telegram('sendMessage', { chat_id: chat, text, reply_markup, protect_content: true });

export async function accountForChat(chat: string) {
  const [account] = await query<AccountDetails[]>('portal_profiles', { telegram_id: `eq.${chat}`, select: profileFields, limit: '1' });
  return account;
}

async function accountById(id: string) {
  const [account] = await query<AccountDetails[]>('portal_profiles', { id: `eq.${id}`, select: profileFields, limit: '1' });
  return account;
}

export function statusMessage(account: AccountDetails) {
  if (!account.active) return account.review_status === 'approved' ? 'حساب در حال حاضر غیرفعال است.' : reviewStatusText[account.review_status];
  return account.approved_at
    ? `حساب شما با آیدی عددی (${account.telegram_id}) توسط مدیر در تاریخ (${dateText(account.approved_at)}) تأیید شده است، می‌توانید از سرویس‌ها استفاده نمایید.`
    : `حساب شما با آیدی عددی (${account.telegram_id}) تأیید شده است و می‌توانید از سرویس‌ها استفاده نمایید. تاریخ تأیید این حساب در سوابق قبلی ثبت نشده است.`;
}

export async function showProfile(chat: string, account: AccountDetails, editUrl: string) {
  const details = [profileLabel, `نام و نام خانوادگی: ${account.first_name} ${account.last_name}`, `نام کاربری: ${account.username}`,
    `نوع حساب: ${account.role === 'student' ? 'دانشجو' : 'استاد'}`, `شمارهٔ تماس: ${account.phone ?? 'ثبت نشده'}`,
    `تاریخ تولد: ${account.birth_date ? dateText(`${account.birth_date}T12:00:00Z`) : 'ثبت نشده'}`,
    account.role === 'student' ? `شمارهٔ دانشجویی: ${account.student_number ?? 'ثبت نشده'}` : `نام درس: ${account.course_name ?? 'ثبت نشده'}`,
    'رمز عبور: فقط قابل تغییر', statusMessage(account)];
  const items = [{ text: statusLabel, callback_data: 'acct:status' }];
  await send(chat, details.join('\n'), { inline_keyboard: [
    ...(account.active ? [[{ text: 'ویرایش اطلاعات حساب', web_app: { url: editUrl } }, { text: withdrawalLabel, callback_data: 'acct:withdraw' }]] : []),
    items,
    ...(account.active ? [[{ text: resetLabel, callback_data: 'acct:reset' }]] : []),
  ] });
}

export async function manageAccountRow(chat: string, id: string) {
  if (!admins().includes(chat) || !uuidPattern.test(id)) return;
  const account = await accountById(id);
  if (!account) return send(chat, 'این حساب دیگر وجود ندارد. فهرست حساب‌ها را دوباره باز کنید.');
  if (account.telegram_id && admins().includes(account.telegram_id)) return send(chat, 'حساب مدیر از این منو قابل تغییر نیست.');
  const operation = account.active ? 'disable' : 'enable';
  await send(chat, `مدیریت حساب ${fullName(account)}`, { inline_keyboard: [[
    { text: operationLabels[operation], callback_data: `acct:${operation}:${account.id}` },
    { text: 'حذف دائمی', callback_data: `acct:purge:${account.id}` },
  ]] });
}

async function queueAction(chat: string, target: AccountDetails, operation: Operation, reason: string) {
  const relevant = { actor_chat: `eq.${chat}`, profile_id: `eq.${target.id}`, operation: `eq.${operation}` };
  await write('portal_account_actions', 'DELETE', undefined, { ...relevant, expires_at: `lte.${new Date().toISOString()}` });
  const [existing] = await query<ActionRequest[]>('portal_account_actions', { ...relevant, select: actionFields, limit: '1' });
  const [created] = existing ? [existing] : await write<ActionRequest[]>('portal_account_actions', 'POST', {
    actor_chat: chat, profile_id: target.id, operation, reason,
    expires_at: new Date(Date.now() + (operation === 'withdraw' ? 7 * 86_400_000 : 900_000)).toISOString(),
  }, { select: actionFields });
  const message = `${operationLabels[operation]} حساب ${fullName(target)}${created.reason ? `\nعلت: ${created.reason}` : ''}`
    + (operation === 'purge' ? '\nحساب و داده‌های وابستهٔ آن برای همیشه حذف می‌شوند.' : '');
  const keyboard = { inline_keyboard: [[{ text: operation === 'purge' ? 'تأیید حذف دائمی' : 'تأیید', callback_data: `acct:yes:${created.id}` },
    { text: 'لغو', callback_data: `acct:no:${created.id}` }]] };
  if (operation !== 'withdraw') { await send(chat, message, keyboard); return; }
  const deliveries = await Promise.allSettled(admins().map((admin) => send(admin, message, keyboard)));
  await send(chat, deliveries.some((delivery) => delivery.status === 'fulfilled')
    ? 'درخواست ثبت شد و در انتظار بررسی است.' : 'درخواست ثبت شد، اما اعلان به مدیر نرسید. بعداً دوباره درخواست را باز کنید.');
}

function reasonPrompt(operation: ReasonOperation, id: string) {
  return `${reasons[operation]}\n${id}`;
}

export async function handleAccountReason(chat: string, prompt: string | undefined, text: string) {
  if (!prompt) return false;
  const [label, id, extra] = prompt.split('\n');
  const operation = (Object.keys(reasons) as ReasonOperation[]).find((key) => reasons[key] === label);
  if (!operation || extra || !uuidPattern.test(id ?? '')) return false;
  const target = await accountById(id);
  if (!target || (target.telegram_id && admins().includes(target.telegram_id))
    || (operation === 'withdraw' ? !target.active || target.telegram_id !== chat : !admins().includes(chat))) {
    await send(chat, 'این درخواست معتبر نیست.'); return true;
  }
  if (!text || text.length > 600) await send(chat, reasonPrompt(operation, id), { force_reply: true, selective: true });
  else await queueAction(chat, target, operation, text);
  return true;
}

export async function handleAccountCallback(callback: ReviewCallback, refresh: (chat: string, hasAccount: boolean) => Promise<void>, reset: (chat: string) => Promise<void>) {
  const privateChat = callback.message?.chat;
  if (privateChat?.type !== 'private' || !privateChat.id || privateChat.id !== callback.from?.id || typeof callback.id !== 'string') return;
  const chat = String(privateChat.id);
  const answer = (text: string) => telegram('answerCallbackQuery', { callback_query_id: callback.id, text });
  const [, operation, id] = callback.data?.split(':') ?? [];
  const isAdmin = admins().includes(chat);
  if (operation === 'status' || operation === 'withdraw' || operation === 'reset') {
    const account = await accountForChat(chat);
    if (!account) return answer('حساب متصل پیدا نشد.');
    await answer('');
    if (operation === 'status') await send(chat, statusMessage(account));
    else if (operation === 'reset') await reset(chat);
    else if (account.active && !isAdmin) await send(chat, reasonPrompt('withdraw', account.id), { force_reply: true, selective: true });
    else await send(chat, 'این حساب امکان ارسال درخواست حذف ندارد.');
    return;
  }

  if (!uuidPattern.test(id ?? '')) return answer('درخواست معتبر نیست.');
  if (operation === 'yes' || operation === 'no') {
    if (!isAdmin) return answer('اجازهٔ بررسی این درخواست را ندارید.');
    const [task] = await query<ActionRequest[]>('portal_account_actions', { id: `eq.${id}`, expires_at: `gt.${new Date().toISOString()}`, select: actionFields });
    if (!task) return answer('درخواست قبلاً بررسی شده یا مهلتش گذشته است.');
    if (task.operation !== 'withdraw' && task.actor_chat !== chat) return answer('اجازهٔ بررسی این درخواست را ندارید.');
    const target = await accountById(task.profile_id);
    const outcome = await rpc<string>('portal_decide_account_action', { p_request: id, p_accept: operation === 'yes', p_protected: admins() });
    if (outcome === 'gone' || outcome === 'protected') return answer('درخواست دیگر قابل انجام نیست.');
    const recipient = task.operation === 'withdraw' ? task.actor_chat
      : target?.telegram_id ?? (task.operation === 'purge' ? target?.former_telegram_id : null);
    const notice = outcome === 'purge' ? `حساب شما به‌طور کامل حذف شد.\nعلت: ${task.reason}\nبرای ساخت حساب جدید، از منوی ربات اقدام کنید.`
      : outcome === 'disable' ? `حساب شما غیرفعال شد.\nعلت: ${task.reason}`
        : outcome === 'enable' ? 'حساب شما فعال شد. می‌توانید دوباره وارد شوید.'
          : outcome === 'withdraw' ? 'درخواست حذف تأیید شد. حسابتان غیرفعال و اتصال آن به ربات قطع شد.'
            : task.operation === 'withdraw' ? 'مدیر درخواست حذف حسابتان را لغو کرد.' : '';
    await answer(outcome === 'cancelled' ? 'درخواست لغو شد.' : 'تغییر حساب ثبت شد.');
    if (recipient && notice) {
      const [delivery] = await Promise.allSettled([send(recipient, notice)]);
      if (delivery.status === 'rejected') await send(chat, 'تغییر حساب ثبت شد، اما پیام به کاربر نرسید.');
      if (outcome === 'purge' || outcome === 'withdraw' || outcome === 'disable' || outcome === 'enable') {
        const current = await accountForChat(recipient).catch(() => undefined);
        await refresh(recipient, Boolean(current)).catch(() => {});
      }
    }
    return;
  }

  if (!isAdmin || (operation !== 'disable' && operation !== 'purge' && operation !== 'enable')) return answer('اجازهٔ انجام این کار را ندارید.');
  const target = await accountById(id);
  if (!target || (target.telegram_id && admins().includes(target.telegram_id))) return answer('این حساب قابل تغییر نیست.');
  await answer('');
  if (operation === 'enable') await queueAction(chat, target, operation, '');
  else await send(chat, reasonPrompt(operation, target.id), { force_reply: true, selective: true });
}
