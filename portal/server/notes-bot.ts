import { type ReviewCallback } from './account-review.js';
import { ownerTelegram } from './presence.js';
import { limit, query, write } from './portal-store.js';
import { telegram } from './telegram-delivery.js';

export const notesLabel = 'جزوات';
const notesPrompt = 'لینک گروه جزوات را در پاسخ به همین پیام بفرستید. برای حذف لینک، یک خط تیره بفرستید.';

function groupUrl(value: string) {
  if (value.length > 240 || !/^https:\/\/t\.me\/(?:[a-zA-Z][a-zA-Z0-9_]{3,31}|\+[A-Za-z0-9_-]{6,}|joinchat\/[A-Za-z0-9_-]{6,})\/?$/.test(value)) return null;
  return value;
}

export async function notesMenu(chat: string) {
  const [settings] = await query<{ notes_group_url: string | null }[]>('portal_bot_preferences', {
    id: 'eq.1', select: 'notes_group_url', limit: '1',
  });
  const url = settings?.notes_group_url ? groupUrl(settings.notes_group_url) : null;
  const rows = url ? [[{ text: 'ورود به گروه جزوات', url }]] : [];
  await telegram('sendMessage', {
    chat_id: chat,
    text: url ? 'برای دسترسی به جزوات، گروه تلگرام را باز کنید.' : 'لینک گروه جزوات هنوز تنظیم نشده است.',
    reply_markup: { inline_keyboard: [...rows, ...(chat === ownerTelegram ? [[{ text: 'تنظیم لینک گروه', callback_data: 'notes:link' }]] : [])] },
    link_preview_options: { is_disabled: true },
  });
}

export async function openNotesSettings(callback: ReviewCallback) {
  const chat = callback.message?.chat;
  if (typeof callback.id !== 'string' || chat?.type !== 'private' || chat.id !== callback.from?.id || String(chat.id) !== ownerTelegram) return;
  await telegram('answerCallbackQuery', { callback_query_id: callback.id });
  await telegram('sendMessage', { chat_id: ownerTelegram, text: notesPrompt, reply_markup: { force_reply: true },
    link_preview_options: { is_disabled: true } });
}

export async function saveNotesLink(chat: string, replyTo: string | undefined, value: string) {
  if (chat !== ownerTelegram || replyTo !== notesPrompt) return false;
  await limit('notes-link:' + chat, 15);
  const url = groupUrl(value);
  if (!url && value !== '-') {
    await telegram('sendMessage', { chat_id: chat, text: 'نشانی لینک گروه معتبر نیست. از یک لینک https://t.me استفاده کنید.' });
    await telegram('sendMessage', { chat_id: chat, text: notesPrompt, reply_markup: { force_reply: true } });
    return true;
  }
  await write('portal_bot_preferences', 'PATCH', { notes_group_url: url }, { id: 'eq.1' });
  await notesMenu(chat);
  return true;
}
