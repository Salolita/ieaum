import { admins, type ReviewCallback } from './account-review.js';
import { PortalError, query, uuidPattern, write } from './portal-store.js';
import { telegram } from './telegram-delivery.js';

export const announcementLabel = 'اطلاع‌رسانی';
export const announcementPrompt = 'متن اطلاع‌رسانی را در پاسخ به همین پیام بفرستید تا پیش‌نمایش را ببینید.';
const link_preview_options = { is_disabled: true };
const send = (chat_id: string, text: string, reply_markup?: object) =>
  telegram('sendMessage', { chat_id, text, reply_markup, link_preview_options });

interface Draft {
  id: string;
  body: string;
}

export function openAnnouncement(chat: string) {
  return send(chat, announcementPrompt, { force_reply: true, input_field_placeholder: 'متن اطلاع‌رسانی' });
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
  await send(chat, `پیش‌نمایش اطلاع‌رسانی به حساب‌های فعال متصل به تلگرام\n\n${draft.body}`, {
    inline_keyboard: [[
      { text: 'تأیید و ارسال', callback_data: `announce-send:${draft.id}` },
      { text: 'لغو', callback_data: `announce-cancel:${draft.id}` },
    ]],
  });
}

async function recipients() {
  const contacts: string[] = [];
  let after: string | undefined;
  while (true) {
    const page: { telegram_id: string }[] = await query('portal_profiles', {
      active: 'eq.true', telegram_id: after ? `gt.${after}` : 'not.is.null', select: 'telegram_id',
      order: 'telegram_id.asc', limit: '500',
    });
    contacts.push(...page.map(({ telegram_id }) => telegram_id));
    if (page.length < 500) return contacts;
    after = page.at(-1)!.telegram_id;
  }
}

export async function decideAnnouncement(callback: ReviewCallback) {
  const stopAt = Date.now() + 45_000;
  if (typeof callback.id !== 'string') return;
  const answer = (text: string) => telegram('answerCallbackQuery', { callback_query_id: callback.id, text }).catch(() => {});
  const [action, id] = (typeof callback.data === 'string' ? callback.data : '').split(':');
  const chat = callback.message?.chat;
  if (chat?.type !== 'private' || chat.id !== callback.from?.id || !admins().includes(String(chat.id))
    || !uuidPattern.test(id ?? '') || !['announce-send', 'announce-cancel'].includes(action)) {
    await answer('اجازهٔ انجام این کار را ندارید.');
    return;
  }

  const owner = String(chat.id);
  const edit = (text: string) => telegram('editMessageText', {
    chat_id: owner, message_id: callback.message?.message_id, text, reply_markup: { inline_keyboard: [] },
  }).catch(() => send(owner, text));
  const filter = {
    id: `eq.${id}`, admin_telegram_id: `eq.${owner}`, state: 'eq.draft', expires_at: `gt.${new Date().toISOString()}`, select: 'id,body',
  };

  const cancel = action === 'announce-cancel';
  const contacts = cancel ? [] : await recipients();
  const [draft] = await write<Draft[]>('portal_announcements', 'PATCH', { state: cancel ? 'cancelled' : 'sending' }, filter);
  if (!draft) {
    await answer('این پیش‌نمایش قبلاً بررسی شده یا منقضی شده است.');
    return;
  }
  if (cancel) {
    await answer('لغو شد.');
    await edit('اطلاع‌رسانی لغو شد.');
    return;
  }

  await answer('ارسال آغاز شد.');
  let sent = 0;
  let attempted = 0;
  while (attempted < contacts.length && Date.now() < stopAt) {
    if (attempted) await new Promise((resolve) => setTimeout(resolve, 1050));
    const results = await Promise.allSettled(contacts.slice(attempted, attempted + 20).map((id) => send(id, draft.body)));
    sent += results.filter(({ status }) => status === 'fulfilled').length;
    attempted += results.length;
  }
  await write('portal_announcements', 'PATCH', { state: 'sent' }, { id: `eq.${draft.id}`, state: 'eq.sending' });
  const failed = attempted - sent;
  const remaining = contacts.length - attempted;
  const summary = contacts.length
    ? `اطلاع‌رسانی پایان یافت.\nارسال موفق: ${sent.toLocaleString('fa-IR')}\nارسال ناموفق: ${failed.toLocaleString('fa-IR')}`
      + (remaining ? `\nارسال‌نشده به‌دلیل پایان زمان: ${remaining.toLocaleString('fa-IR')}` : '')
    : 'حساب فعالِ متصل به تلگرام برای دریافت این اطلاع‌رسانی پیدا نشد.';
  await edit(summary);
}
