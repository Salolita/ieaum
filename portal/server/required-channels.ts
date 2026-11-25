import { admins, type ReviewCallback } from './account-review.js';
import { limit, MissingRelationError, query, write } from './portal-store.js';
import { telegram } from './telegram-delivery.js';

interface Channel { chat_id: string; title: string; invite_url: string; enabled: boolean }
interface Member { status: string; is_member?: boolean }
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
    chat_id: channel.chat_id, user_id: Number(chat),
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
      ...records.map((record) => [{ text: record.title, callback_data: 'membership:manage:' + record.chat_id }])],
  });
}

async function validateChannel(input: string) {
  const [target, link, extra] = input.trim().split(/\s+/, 3);
  if (!target || extra || (!handle.test(target) && !channelId.test(target)) || (link && !invite.test(link))) {
    throw new Error('شناسهٔ کانال یا لینک دعوت معتبر نیست.');
  }
  const chat = await telegram<{ id: number; title?: string; type: string; username?: string }>('getChat', { chat_id: target });
  if (chat.type !== 'channel' || !Number.isSafeInteger(chat.id) || !channelId.test(String(chat.id))) throw new Error('فقط کانال تلگرام قابل ثبت است.');
  const url = chat.username && handle.test('@' + chat.username) ? 'https://t.me/' + chat.username : link;
  if (!url) throw new Error('برای کانال خصوصی، لینک دعوت لازم است.');
  await assertBotIsAdmin(String(chat.id));
  return { chat_id: String(chat.id), title: (chat.title || target).slice(0, 128), invite_url: url };
}

async function assertBotIsAdmin(chat: string) {
  const bot = await telegram<{ id: number }>('getMe', {});
  const self = await telegram<Member>('getChatMember', { chat_id: chat, user_id: bot.id });
  if (!['administrator', 'creator'].includes(self.status)) throw new Error('ابتدا ربات را مدیر کانال کنید.');
}

export async function handleChannelReply(chat: string, reply: string | undefined, input: string) {
  if (!admins().includes(chat) || !reply) return false;
  const id = reply.startsWith(prompt + '\n') ? reply.slice(prompt.length + 1) : '';
  if (reply !== prompt && !channelId.test(id)) return false;
  try {
    const records = await channels();
    if (!id && records.length >= maxChannels) throw new Error('حداکثر پنج کانال قابل ثبت است.');
    if (id && !records.some((record) => record.chat_id === id)) throw new Error('کانال قبلی دیگر در فهرست نیست.');
    const record = await validateChannel(input);
    if (id) await write(channelTable, 'PATCH', record, { chat_id: 'eq.' + id });
    else await write(channelTable, 'POST', record);
    await channelMenu(chat);
  } catch (error) {
    const message = error instanceof Error && error.message !== 'Telegram delivery failed' ? error.message : 'کانال در دسترس نیست. مدیر بودن ربات را بررسی کنید.';
    await send(chat, message);
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
      catch { await send(id, 'فعال نشد. دسترسی مدیر ربات به کانال را بررسی کنید.'); return; }
    }
    await write(channelTable, 'PATCH', { enabled: action === 'on' }, filters);
    await channelMenu(id);
  }
}
