import { admins, type ReviewCallback } from './account-review.js';
import { randomUUID } from 'node:crypto';
import { recordBotContact } from './bot-contacts.js';
import { PortalError, query, rpc, supabase, uuidPattern, write } from './portal-store.js';
import { telegram, TelegramDeliveryError } from './telegram-delivery.js';

export const announcementLabel = 'اطلاع‌رسانی';
export const announcementPrompt = 'متن اطلاع‌رسانی را در پاسخ به همین پیام بفرستید تا پیش‌نمایش را ببینید.';
const link_preview_options = { is_disabled: true };
const send = (chat_id: string, text: string, reply_markup?: object) =>
  telegram('sendMessage', { chat_id, text, reply_markup, link_preview_options });

interface Draft {
  id: string;
  body: string;
}

const audienceLabel = { all: 'همهٔ کاربران ربات', accounts: 'دارندگان حساب فعال متصل' };
type Audience = keyof typeof audienceLabel;
const sendPreview = (chat: string, draft: Draft) => send(chat, `پیش‌نمایش اطلاع‌رسانی\n\n${draft.body}\n\nگیرندگان را انتخاب کنید.`, {
  inline_keyboard: [[{ text: audienceLabel.all, callback_data: `announce-all:${draft.id}` }],
    [{ text: audienceLabel.accounts, callback_data: `announce-accounts:${draft.id}` }],
    [{ text: 'لغو', callback_data: `announce-cancel:${draft.id}` }]],
});

function editAnnouncement(chat: string, messageId: number | undefined, text: string, reply_markup = { inline_keyboard: [] as { text: string; callback_data: string }[][] }) {
  if (!messageId) return send(chat, text, reply_markup);
  return telegram('editMessageText', { chat_id: chat, message_id: messageId, text, reply_markup, link_preview_options })
    .catch(() => send(chat, text, reply_markup));
}

export async function openAnnouncement(chat: string) {
  const id = randomUUID();
  await supabase('/rest/v1/portal_announcement_composers?on_conflict=admin_telegram_id', 'POST', {
    admin_telegram_id:chat, id, expires_at:new Date(Date.now()+900_000).toISOString(),
  }, false, undefined, 'resolution=merge-duplicates');
  await send(chat, 'متن اطلاع‌رسانی را در چت بفرستید تا پیش‌نمایش را ببینید.', {
    inline_keyboard:[[{text:'لغو',callback_data:`announce-stop:${id}`}]],
  });
}

export async function announcementInput(chat: string, messageId: number | undefined, text: string, legacyReply?: number) {
  const cancel = text === '/cancel' || text === 'لغو';
  if (!cancel && (!text || text.startsWith('/') || !Number.isSafeInteger(messageId))) return false;
  const [pending] = await write<{ id:string }[]>('portal_announcement_composers','DELETE',undefined,{
    admin_telegram_id:`eq.${chat}`, expires_at:`gt.${new Date().toISOString()}`, select:'id',
  });
  if (!pending && !legacyReply) return false;
  if (legacyReply) await telegram('deleteMessage', { chat_id:chat, message_id:legacyReply }).catch(() => {});
  if (cancel) await send(chat, 'اطلاع‌رسانی لغو شد.');
  else await previewAnnouncement(chat, messageId!, text);
  return true;
}

export async function previewAnnouncement(chat: string, sourceMessageId: number, body: string) {
  if (!body || body.length > 3800) {
    await send(chat, 'متنی تا ۳۸۰۰ نویسه وارد کنید.');
    await openAnnouncement(chat);
    return;
  }
  let draft: Draft;
  try {
    [draft] = await write<Draft[]>('portal_announcements', 'POST', {
      admin_telegram_id: chat, source_message_id: sourceMessageId, body,
    }, { select: 'id,body' });
  } catch (error) {
    // Telegram may retry an update. Keep its preview tied to the original draft.
    if (!(error instanceof PortalError) || error.status !== 409) throw error;
    [draft] = await query<Draft[]>('portal_announcements', {
      admin_telegram_id: `eq.${chat}`, source_message_id: `eq.${sourceMessageId}`, state: 'eq.draft',
      expires_at: `gt.${new Date().toISOString()}`, select: 'id,body',
    });
  }
  if (!draft) return;
  await sendPreview(chat, draft);
}

export async function decideAnnouncement(callback: ReviewCallback) {
  if (typeof callback.id !== 'string') return;
  const answer = (text: string) => telegram('answerCallbackQuery', { callback_query_id: callback.id, text }).catch(() => {});
  const [action, id] = (typeof callback.data === 'string' ? callback.data : '').split(':');
  const chat = callback.message?.chat;
  if (chat?.type !== 'private' || chat.id !== callback.from?.id || !admins().includes(String(chat.id))
    || !uuidPattern.test(id ?? '') || !['announce-send', 'announce-all', 'announce-accounts', 'announce-send-all', 'announce-send-accounts', 'announce-cancel', 'announce-stop'].includes(action)) {
    await answer('اجازهٔ انجام این کار را ندارید.');
    return;
  }

  const owner = String(chat.id);
  const messageId = callback.message?.message_id;
  const edit = (text: string) => editAnnouncement(owner, messageId, text);
  const filter = {
    id: `eq.${id}`, admin_telegram_id: `eq.${owner}`, state: 'eq.draft', expires_at: `gt.${new Date().toISOString()}`, select: 'id,body',
  };

  const stale = 'این پیش‌نمایش قبلاً بررسی شده یا منقضی شده است.';
  if (action === 'announce-stop') {
    const [removed] = await write<unknown[]>('portal_announcement_composers', 'DELETE', undefined, { admin_telegram_id:`eq.${owner}`, id:`eq.${id}`, select:'id' });
    if (!removed) return answer(stale);
    await answer('لغو شد.');
    await edit('اطلاع‌رسانی لغو شد.');
    return;
  }
  if (action === 'announce-cancel') {
    const [draft] = await write<Draft[]>('portal_announcements', 'PATCH', { state: 'cancelled' }, filter);
    if (!draft) return answer(stale);
    await answer('لغو شد.');
    await edit('اطلاع‌رسانی لغو شد.');
    return;
  }

  const audience: Audience = action.endsWith('-all') ? 'all' : 'accounts';
  if (action === 'announce-all' || action === 'announce-accounts') {
    const [draft] = await query<Draft[]>('portal_announcements', filter);
    if (!draft) return answer(stale);
    await answer('گیرندگان انتخاب شدند.');
    await editAnnouncement(owner, messageId, `گیرندگان: ${audienceLabel[audience]}\n\n${draft.body}`, {
      inline_keyboard: [[{ text: 'تأیید و ارسال', callback_data: `announce-send-${audience}:${id}` },
        { text: 'لغو', callback_data: `announce-cancel:${id}` }]],
    });
    return;
  }
  if (typeof messageId !== 'number' || !Number.isSafeInteger(messageId) || messageId <= 0) return answer('پیام تأیید معتبر نیست.');
  const count = await rpc<number | null>('portal_enqueue_announcement', { p_id: id, p_admin: owner, p_message: messageId, p_audience: audience });
  if (count === null) return answer(stale);
  await answer('ارسال در صف قرار گرفت.');
  await edit(`اطلاع‌رسانی برای «${audienceLabel[audience]}» در صف ارسال است.\nتعداد گیرندگان: ${count.toLocaleString('fa-IR')}`);
}

interface Delivery { announcement_id: string; chat_id: string; body: string; attempts: number }
interface Summary { announcement_id: string; admin_telegram_id: string; message_id: number; delivered: number; failed: number }

async function deliver({ announcement_id, chat_id, body, attempts }: Delivery) {
  let result: { state: 'sent' | 'failed' | 'pending'; available_at?: string } = { state: 'sent' };
  try {
    await send(chat_id, body);
  } catch (error) {
    result = { state: 'failed' };
    if (error instanceof TelegramDeliveryError && error.status === 403) await recordBotContact(chat_id, false).catch(() => {});
    if (error instanceof TelegramDeliveryError && error.status === 429 && attempts < 3) {
      const delay = Number.isFinite(error.retryAfter) ? Math.max(1, error.retryAfter!) + 1 : 60;
      result = { state: 'pending', available_at: new Date(Date.now() + delay * 1000).toISOString() };
    }
  }
  await write('portal_announcement_deliveries', 'PATCH', result, { announcement_id: `eq.${announcement_id}`, chat_id: `eq.${chat_id}`, state: 'eq.sending' });
}

export async function deliverQueuedAnnouncements() {
  const deadline = Date.now() + 18_000;
  while (Date.now() < deadline) {
    const batch = await rpc<Delivery[]>('portal_claim_announcement_deliveries', { p_count: 12 });
    if (!batch.length) break;
    await Promise.allSettled(batch.map(deliver));
    await new Promise((resolve) => setTimeout(resolve, 1050));
  }
  const summaries = await rpc<Summary[]>('portal_finish_announcements', {});
  await Promise.allSettled(summaries.map(async ({ announcement_id, admin_telegram_id, message_id, delivered, failed }) => {
    const summary = delivered + failed
      ? `اطلاع‌رسانی پایان یافت.\nارسال موفق: ${delivered.toLocaleString('fa-IR')}\nارسال ناموفق: ${failed.toLocaleString('fa-IR')}`
      : 'برای این گروه گیرنده‌ای پیدا نشد.';
    await editAnnouncement(admin_telegram_id, message_id, summary).catch(() => {});
    await write('portal_announcement_deliveries', 'DELETE', undefined, { announcement_id: `eq.${announcement_id}` });
  }));
}
