import {
  AuthAccountExists, internalEmail, limit, PortalError, query, setting, supabase, uuidPattern, verifyPassword, write,
} from './portal-store.js';
import { panelButton, telegram, TelegramDeliveryError } from './telegram-delivery.js';

type AccountRole = 'student' | 'teacher';

interface AccountRequest {
  id: string;
  role: AccountRole;
  first_name: string;
  last_name: string;
  student_number: string | null;
  course_name: string | null;
  telegram_id: string | null;
}
const membershipReviewer = '8592192595';
export const admins = () => [...new Set(setting('TELEGRAM_ADMIN_IDS').split(',').map((id) => id.trim()).filter((id) => /^[1-9]\d{0,15}$/.test(id) && id !== membershipReviewer))];
const requestFields = 'id,role,first_name,last_name,student_number,course_name,telegram_id';

type Application = Pick<AccountRequest, 'first_name' | 'last_name' | 'telegram_id'> & { username: string; phone: string } & (
  { role: 'student'; student_number: string; birth_date: string } | { role: 'teacher'; course_name: string }
);

async function checkRegistrationConflicts(application: Application) {
  const [linked] = await query<{ username: string }[]>('portal_profiles', {
    telegram_id: `eq.${application.telegram_id}`, select: 'username', limit: '1',
  });
  if (linked && linked.username !== application.username) {
    throw new PortalError(409, 'این حساب تلگرام به یک حساب نامرالب متصل است. برای همان حساب از گزینهٔ ورود استفاده کنید.');
  }
  if (application.role === 'student') {
    const [registered] = await query<{ username: string }[]>('portal_profiles', {
      student_number: `eq.${application.student_number}`, select: 'username', limit: '1',
    });
    if (registered && registered.username !== application.username) {
      throw new PortalError(409, 'این شمارهٔ دانشجویی قبلاً ثبت شده است. شماره را بررسی کنید یا وارد حساب قبلی شوید.', 'studentNumber');
    }
  }
}

export async function queueAccount(application: Application, password: string) {
  const { username, role } = application;
  await checkRegistrationConflicts(application);
  let created: { id: string };
  try {
    created = await supabase('/auth/v1/admin/users', 'POST', {
      email: internalEmail(username), password, email_confirm: true,
      app_metadata: { [`portal_${role}_request`]: application },
    });
  } catch (error) {
    if (!(error instanceof AuthAccountExists)) {
      // A concurrent signup may have claimed the number or Telegram account.
      if (error instanceof PortalError && (error.status === 409 || error.status === 503)) await checkRegistrationConflicts(application);
      throw error;
    }
    await limit(`login:username:${username}`, 10);
    const id = await verifyPassword(username, password).catch((failure) => {
      if (failure instanceof PortalError && failure.status === 401) {
        throw new PortalError(409, 'این نام کاربری قبلاً ثبت شده است. نام دیگری انتخاب کنید یا اگر حساب متعلق به شماست، از رمز قبلی استفاده کنید.', 'username');
      }
      throw failure;
    });
    const [existing] = await query<{ role: string; review_status: string }[]>('portal_profiles', {
      id: `eq.${id}`, select: 'role,review_status',
    });
    if (existing?.role === role && existing.review_status === 'pending') return null;
    if (existing?.role === role && existing.review_status === 'rejected') {
      throw new PortalError(403, 'درخواست قبلی لغو شده است. برای پیگیری با مدیر گروه تماس بگیرید.');
    }
    if (existing) throw new PortalError(409, 'حساب قبلاً ساخته شده است. از بخش ورود استفاده کنید.');
    // Complete older sign-ups only after proving ownership of the existing credentials.
    const [account] = await write<AccountRequest[]>('portal_profiles', 'POST', {
      id, ...application, active: false, review_status: 'pending',
    }, { select: requestFields });
    return account;
  }
  const [account] = await query<AccountRequest[]>('portal_profiles', { id: `eq.${created.id}`, select: requestFields });
  if (!account) throw new PortalError(503, 'ثبت درخواست کامل نشد. با همان نام کاربری و رمز دوباره تلاش کنید.');
  return account;
}

export const reviewStatusText = {
  approved: 'حسابتان تأیید شد. از سایت وارد شوید.',
  pending: 'درخواست ثبت‌نام شما در انتظار تأیید مدیر است.',
  rejected: 'درخواست حساب لغو شد. برای پیگیری با مدیر گروه تماس بگیرید.',
};

function reviewText(account: AccountRequest) {
  const teacher = account.role === 'teacher';
  const detail = teacher ? `نام درس: ${account.course_name}` : `شمارهٔ دانشجویی: ${account.student_number}`;
  return `درخواست حساب ${teacher ? 'استاد' : 'دانشجو'}\nنام: ${account.first_name}\nنام خانوادگی: ${account.last_name}\n${detail}`;
}
function sendReview(chat: string, account: AccountRequest) {
  return telegram('sendMessage', { chat_id: chat, text: reviewText(account), protect_content: chat === membershipReviewer, reply_markup: { inline_keyboard: [[
    { text: 'تأیید', callback_data: `approve:${account.id}` },
    { text: chat === membershipReviewer ? 'رد عضویت' : 'لغو', callback_data: `reject:${account.id}` },
  ]] } });
}
export async function notifyReview(account: AccountRequest) {
  const deliveries = await Promise.allSettled([
    ...admins().map((id) => sendReview(id, account)),
    ...(account.telegram_id ? [telegram('sendMessage', { chat_id: account.telegram_id,
      text: 'درخواست ثبت‌نام شما دریافت شد و در انتظار تأیید مدیر است.' })] : []),
  ]);
  if (account.telegram_id) deliveries.pop();
  return deliveries.some((delivery) => delivery.status === 'fulfilled');
}

export async function notifyMembershipLogin(id: string) {
  const now = Date.now();
  const claim = new Date(now + 30_000).toISOString();
  const filters = { id: `eq.${id}`, review_status: 'eq.pending', active: 'eq.false' };
  const [account] = await write<AccountRequest[]>('portal_profiles', 'PATCH', { membership_review_retry_at: claim }, {
    ...filters, select: requestFields,
    and: `(or(telegram_id.is.null,telegram_id.neq.${membershipReviewer}),or(membership_review_retry_at.is.null,membership_review_retry_at.lte.${new Date(now).toISOString()}))`,
  });
  if (!account) return;
  let retryAt = new Date(now + 15 * 60_000).toISOString();
  try {
    await sendReview(membershipReviewer, account);
  } catch (error) {
    const status = error instanceof TelegramDeliveryError ? error.status : undefined;
    const waitSeconds = status === 429 && error instanceof TelegramDeliveryError ? (error.retryAfter ?? 30) : status === undefined ? 30 : 5;
    retryAt = new Date(Date.now() + waitSeconds * 1000).toISOString();
    console.warn('Delegated membership notification failed', status ?? 'transport');
  }
  await write('portal_profiles', 'PATCH', { membership_review_retry_at: retryAt }, {
    ...filters, membership_review_retry_at: `eq.${claim}`, select: 'id',
  });
}

export async function pendingReviews(chat: string) {
  if (!admins().includes(chat)) return;
  const accounts = await query<AccountRequest[]>('portal_profiles', {
    review_status: 'eq.pending', select: requestFields, order: 'requested_at.asc', limit: '10',
  });
  if (!accounts.length) await telegram('sendMessage', { chat_id: chat, text: 'درخواست در انتظار تأیید وجود ندارد.' });
  else for (const account of accounts) await sendReview(chat, account);
}

export interface ReviewCallback {
  id?: string;
  from?: { id?: number };
  data?: string;
  message?: { message_id?: number; chat?: { id?: number; type?: string } };
}
export async function decideReview(callback: ReviewCallback) {
  if (typeof callback.id !== 'string') return;
  const answer = (text: string) => telegram('answerCallbackQuery', { callback_query_id: callback.id, text });
  const [decision, id] = (typeof callback.data === 'string' ? callback.data : '').split(':');
  const chat = callback.message?.chat;
  const delegated = String(chat?.id) === membershipReviewer;
  if (chat?.type !== 'private' || chat.id !== callback.from?.id
    || !(admins().includes(String(chat.id)) || delegated)
    || (decision !== 'approve' && decision !== 'reject') || !uuidPattern.test(id ?? '')) {
    await answer('اجازهٔ انجام این کار را ندارید.');
    return;
  }
  const approved = decision === 'approve';
  const [account] = await write<AccountRequest[]>('portal_profiles', 'PATCH', {
    active: approved, review_status: approved ? 'approved' : 'rejected',
  }, { id: `eq.${id}`, review_status: 'eq.pending', select: requestFields,
    ...(delegated ? { or: `(telegram_id.is.null,telegram_id.neq.${membershipReviewer})` } : {}),
  });
  let status = account ? approved ? 'حساب تأیید شد.' : 'درخواست لغو شد.' : 'این درخواست قبلاً بررسی شده است.';
  if (account?.telegram_id) {
    try {
      await telegram('sendMessage', {
        chat_id: account.telegram_id, text: reviewStatusText[approved ? 'approved' : 'rejected'],
        ...(approved ? { reply_markup: panelButton() } : {}),
      });
    } catch {
      status += ' ارسال پیام تلگرام ناموفق بود. کاربر می‌تواند وضعیت حساب را در ربات ببیند.';
    }
  } else if (account) {
    status += ' حساب به تلگرام متصل نیست.';
  }
  await Promise.allSettled([
    answer(status),
    telegram('editMessageText', {
      chat_id: chat.id, message_id: callback.message?.message_id,
      text: account ? `${reviewText(account)}\n\n${status}` : status, reply_markup: { inline_keyboard: [] },
    }),
  ]);
}
