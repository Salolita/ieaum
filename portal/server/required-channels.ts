import { admins, type ReviewCallback } from './account-review.js';
import { limit, MissingRelationError, query, write } from './portal-store.js';
import { telegram, TelegramDeliveryError } from './telegram-delivery.js';

interface Channel { chat_id: string; title: string; invite_url: string; enabled: boolean }
interface Member { status: string; is_member?: boolean }
interface SharedChannel { request_id?: unknown; chat_id?: unknown; title?: unknown; username?: unknown }
const channelPickerId = 52017;
const chatUnavailable = 'تلگرام این کانال را با شناسهٔ واردشده به ربات نشان نمی‌دهد. می‌توانید کانال عمومی را از فهرست انتخاب کنید.';
const addBotAsAdmin = 'ابتدا @ieaumbot را در بخش مدیران همان کانال اضافه کنید و سپس دوباره «فعال‌سازی» را بزنید.';
const temporaryTelegramError = 'بررسی کانال در تلگرام فعلاً ممکن نیست. کمی بعد دوباره تلاش کنید.';
const unavailableChat = (error: unknown) => error instanceof TelegramDeliveryError && [400, 403, 404].includes(error.status);
const channelTable = 'portal_required_channels';
const maxChannels = 5;
const channelId = /^-[0-9]{5,16}$/;
const handle = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;
const invite = /^https:\/\/t\.me\/(?:\+[A-Za-z0-9_-]+|joinchat\/[A-Za-z0-9_-]+)$/;
export const channelsLabel = 'عضویت اجباری';
const prompt = 'شناسهٔ @کانال را در پاسخ به همین پیام بفرستید. برای کانال خصوصی، شناسهٔ عددی و سپس لینک دعوت را بفرستید.';
const checkButton = { text: 'عضو شدم، بررسی کن', callback_data: 'membership:check' };
const send = (chat_id: string, text: string, reply_markup?: object) => telegram('sendMessage', { chat_id, text,
  reply_markup, link_preview_options: { is_disabled: true } });
const channels = (enabled = false) => query<Channel[]>(channelTable, {
  order: 'chat_id.asc', select: 'chat_id,title,invite_url,enabled', ...(enabled ? { enabled: 'eq.true' } : {}),
});

function member(status: Member) {
  return ['creator', 'administrator', 'member'].includes(status.status) || (status.status === 'restricted' && status.is_member === true);
}

export async function requireMembership(chat: string, isAdmin: boolean) {
  if (isAdmin) return true;
  const required = await channels(true).catch((error) => {
    if (error instanceof MissingRelationError) return [];
    throw error;
  });
  if (!required.length) return true;
  const results = await Promise.allSettled(required.map(async (channel) => member(await telegram<Member>('getChatMember', {
    chat_id: Number(channel.chat_id), user_id: Number(chat),
  }))));
  if (results.every((result) => result.status === 'fulfilled' && result.value)) return true;
  const missing = required.filter((_, index) => {
    const result = results[index];
    return result.status === 'rejected' || !result.value;
  });
  await send(chat, results.some((result) => result.status === 'rejected')
    ? 'بررسی عضویت در تلگرام فعلاً ممکن نیست. کمی بعد دوباره بررسی کنید.'
    : 'برای استفاده از ربات، در کانال‌های زیر عضو شوید و عضویت را دوباره بررسی کنید.', {
    inline_keyboard: [...missing.map((record) => [{ text: record.title, url: record.invite_url }]), [checkButton]],
  });
  return false;
}

export async function channelMenu(chat: string) {
  if (!admins().includes(chat)) return;
  const records = await channels().catch((error) => {
    if (error instanceof MissingRelationError) return null;
    throw error;
  });
  if (!records) { await send(chat, 'تنظیم عضویت اجباری پس از آماده‌شدن پایگاه داده در دسترس است.'); return; }
  await send(chat, records.length ? records.map((record) => record.title + ' · ' + (record.enabled ? 'فعال' : 'غیرفعال')).join('\n')
    : 'عضویت اجباری غیرفعال است. می‌توانید یک کانال اضافه کنید.', {
    inline_keyboard: [[{ text: 'افزودن کانال', callback_data: 'membership:add' }],
      [{ text: 'انتخاب کانال عمومی از تلگرام', callback_data: 'membership:select' }],
      ...records.map((record) => [{ text: record.title, callback_data: 'membership:manage:' + record.chat_id }])],
  });
}

async function validateChannel(input: string) {
  const [identifier, link, extra] = input.trim().split(/\s+/, 3);
  const username = identifier?.match(/^https:\/\/t\.me\/([A-Za-z][A-Za-z0-9_]{4,31})\/?$/i)?.[1];
  const target = username ? '@' + username : identifier;
  const numericId = channelId.test(target ?? '') ? Number(target) : undefined;
  if (!target || extra || (!handle.test(target) && !Number.isSafeInteger(numericId)) || (link && !invite.test(link))) {
    throw new Error('شناسهٔ کانال یا لینک دعوت معتبر نیست.');
  }
  const chat = await telegram<{ id: number; title?: string; type: string; username?: string }>('getChat', {
    chat_id: numericId ?? target,
  }).catch((error) => {
    if (unavailableChat(error)) throw new Error(chatUnavailable);
    throw new Error(temporaryTelegramError);
  });
  if (chat.type !== 'channel' || !Number.isSafeInteger(chat.id) || !channelId.test(String(chat.id))) throw new Error('فقط کانال تلگرام قابل ثبت است.');
  const url = chat.username && handle.test('@' + chat.username) ? 'https://t.me/' + chat.username : link;
  if (!url) throw new Error('برای کانال خصوصی، لینک دعوت لازم است.');
  return { chat_id: String(chat.id), title: (chat.title || target).slice(0, 128), invite_url: url };
}

async function assertBotIsAdmin(chat: string) {
  const bot = await telegram<{ id: number }>('getMe', {}).catch(() => { throw new Error(temporaryTelegramError); });
  if (!Number.isSafeInteger(bot?.id) || bot.id <= 0) throw new Error(temporaryTelegramError);
  const self = await telegram<Member>('getChatMember', { chat_id: Number(chat), user_id: bot.id }).catch((error) => {
    throw new Error(unavailableChat(error) ? addBotAsAdmin : temporaryTelegramError);
  });
  if (!self || !['administrator', 'creator'].includes(self.status)) throw new Error(addBotAsAdmin);
}

function openChannelPicker(chat: string) {
  return send(chat, 'کانال عمومی را از فهرست تلگرام انتخاب کنید. پس از ثبت، کانال را از منوی عضویت اجباری فعال کنید.', {
    keyboard: [[{ text: 'انتخاب کانال عمومی', request_chat: {
      request_id: channelPickerId, chat_is_channel: true, chat_has_username: true, request_title: true, request_username: true,
    } }], [{ text: 'منوی اصلی' }]],
    resize_keyboard: true, one_time_keyboard: true,
  });
}

export async function handleSharedChannel(chat: string, data: unknown, restoreMenu: () => Promise<unknown>) {
  const shared = data as SharedChannel | null;
  if (!admins().includes(chat) || shared?.request_id !== channelPickerId) return;
  try {
    const id = shared.chat_id;
    const username = typeof shared.username === 'string' ? shared.username : '';
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || !channelId.test(String(id)) || !handle.test('@' + username)) {
      throw new Error('این کانال عمومی قابل ثبت نیست. دوباره انتخاب کنید.');
    }
    const records = await channels();
    if (!records.some((record) => record.chat_id === String(id))) {
      if (records.length >= maxChannels) throw new Error('حداکثر پنج کانال قابل ثبت است.');
      const title = typeof shared.title === 'string' ? shared.title.trim() : '';
      await write(channelTable, 'POST', { chat_id: String(id), title: (title || '@' + username).slice(0, 128), invite_url: 'https://t.me/' + username });
    }
    await channelMenu(chat);
  } catch (error) {
    await send(chat, error instanceof Error ? error.message : 'ثبت کانال انجام نشد.');
  } finally {
    await restoreMenu().catch(() => {});
  }
}

export async function handleChannelReply(chat: string, reply: string | undefined, input: string) {
  if (!admins().includes(chat) || !reply) return false;
  const id = reply.startsWith(prompt + '\n') ? reply.slice(prompt.length + 1) : '';
  if (reply !== prompt && !channelId.test(id)) return false;
  try {
    const records = await channels();
    if (!id && records.length >= maxChannels) throw new Error('حداکثر پنج کانال قابل ثبت است.');
    const previous = records.find((record) => record.chat_id === id);
    if (id && !previous) throw new Error('کانال قبلی دیگر در فهرست نیست.');
    const record = await validateChannel(input);
    if (previous) {
      if (previous.enabled) await assertBotIsAdmin(record.chat_id);
      const [saved] = await write<Channel[]>(channelTable, 'PATCH', record, {
        chat_id: 'eq.' + id, enabled: 'eq.' + previous.enabled,
      });
      if (!saved) throw new Error('وضعیت کانال تغییر کرده است. دوباره ویرایش را باز کنید.');
    } else await write(channelTable, 'POST', record);
    await channelMenu(chat);
  } catch (error) {
    const message = error instanceof Error && error.message !== 'Telegram delivery failed' ? error.message : 'کانال در دسترس نیست. مدیر بودن ربات را بررسی کنید.';
    if (!id && message === chatUnavailable) await openChannelPicker(chat);
    else await send(chat, message);
  }
  return true;
}

export async function channelCallback(callback: ReviewCallback, onMember: (chat: string) => Promise<unknown>) {
  const chat = callback.message?.chat;
  if (chat?.type !== 'private' || chat.id !== callback.from?.id || typeof callback.id !== 'string') return;
  const id = String(chat.id);
  const isAdmin = admins().includes(id);
  const [, action, channel] = (callback.data ?? '').split(':');
  if (action !== 'check' && !isAdmin) return;
  await telegram('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => {});
  await limit('telegram:' + id, 25);
  if (action === 'check') {
    if (await requireMembership(id, isAdmin)) await onMember(id);
    return;
  }
  if (action === 'add') { await send(id, prompt, { force_reply: true }); return; }
  if (action === 'select') { await openChannelPicker(id); return; }
  if (action === 'list') { await channelMenu(id); return; }
  if (!channelId.test(channel ?? '')) return;
  const filters = { chat_id: 'eq.' + channel };
  const [record] = await query<Channel[]>(channelTable, filters);
  if (!record) { await channelMenu(id); return; }
  if (action === 'manage') {
    const button = (text: string, next: string) => ({ text, callback_data: 'membership:' + next + ':' + channel });
    await send(id, record.title + ' · ' + (record.enabled ? 'فعال' : 'غیرفعال'), {
      inline_keyboard: [[button(record.enabled ? 'غیرفعال‌سازی' : 'فعال‌سازی', record.enabled ? 'off' : 'on')],
        [button('تغییر کانال', 'edit'), button('حذف کانال', 'delete')], [{ text: 'فهرست کانال‌ها', callback_data: 'membership:list' }]],
    });
  } else if (action === 'edit') {
    await send(id, prompt + '\n' + channel, { force_reply: true });
  } else if (action === 'delete') {
    await write(channelTable, 'DELETE', undefined, filters);
    await channelMenu(id);
  } else if (action === 'on' || action === 'off') {
    if (action === 'on') {
      try { await assertBotIsAdmin(channel); }
      catch (error) {
        await send(id, error instanceof Error ? error.message : temporaryTelegramError);
        return;
      }
    }
    await write(channelTable, 'PATCH', { enabled: action === 'on' }, filters);
    await channelMenu(id);
  }
}
