import { accountForChat } from './account-actions.js';
import { reviewStatusText, type ReviewCallback } from './account-review.js';
import { deletePresentation, editPresentation, expiration, ownedPresentations, rotatePresentationCode } from './erae-owner.js';
import { issueLoginLink } from './portal-entry.js';
import { limit, uuidPattern } from './portal-store.js';
import { telegram } from './telegram-delivery.js';
import { automationReady } from './weekly-worker.js';

export const myPresentationsLabel = 'ارائه‌های من';
const titlePrompt = 'عنوان جدید ارائه را در پاسخ به همین پیام بنویسید.';
const captionPrompt = 'کپشن جدید ارائه را در پاسخ به همین پیام بنویسید. برای خالی‌کردن، یک خط تیره بفرستید.';
const send = (chat: string, text: string, markup?: object) => telegram('sendMessage', { chat_id: chat, text, reply_markup: markup, protect_content: true });
const button = (text: string, operation: string, id = '') => ({ text, callback_data: `erae:${operation}:${id}` });

function needPresentationAccount(chat: string) {
  return send(chat, 'لطفاً حساب کاربری IEAUM بسازید یا وارد حساب کاربری خود شوید.', {
    inline_keyboard: [[{ text:'ساخت حساب', url:'https://t.me/ieaumbot?start=signup' }, { text:'ورود به حساب', url:'https://ieaum.ir/panel/' }]],
  });
}

type PresentationAccount = { id: string; active: boolean; review_status: keyof typeof reviewStatusText };

function unavailableAccount(chat: string, account?: PresentationAccount) {
  if (!account) return needPresentationAccount(chat);
  return send(chat, account.review_status === 'approved' ? 'حساب در حال حاضر غیرفعال است.' : reviewStatusText[account.review_status]);
}

export async function presentationMenu(chat: string, account?: PresentationAccount) {
  if (!account?.active) return unavailableAccount(chat, account);
  const url = await issueLoginLink(account.id, chat, 'presentation');
  await send(chat, 'ارائه‌طوری', { inline_keyboard:[[{ text:'ایجاد ارائه', url },button(myPresentationsLabel,'list')]] });
}

export async function showPresentations(chat: string) {
  const account = await accountForChat(chat);
  if (!account?.active) return unavailableAccount(chat, account);
  const rooms = await ownedPresentations(account.id);
  await send(chat, rooms.length ? 'ارائهٔ موردنظر را انتخاب کنید.' : 'هنوز ارائه‌ای ندارید.', {
    inline_keyboard: rooms.map((room) => [button(room.moderation_disabled ? 'غیرفعال · ' + room.title : room.title, 'open', room.id)]),
  });
}

export async function handlePresentationCallback(callback: ReviewCallback) {
  const privateChat = callback.message?.chat;
  if (privateChat?.type !== 'private' || !Number.isSafeInteger(privateChat.id) || privateChat.id !== callback.from?.id || typeof callback.id !== 'string') return;
  const chat = String(privateChat.id);
  const answer = (text = '') => telegram('answerCallbackQuery', { callback_query_id: callback.id, text });
  const [, operation, id] = callback.data?.split(':') ?? [];
  if (operation === 'list') { await answer(); return showPresentations(chat); }
  if (!uuidPattern.test(id ?? '')) return answer('ارائه معتبر نیست.');
  const account = await accountForChat(chat);
  const [room] = account?.active ? await ownedPresentations(account.id, id, operation === 'links') : [];
  if (!room) return answer('این ارائه در دسترس نیست.');
  if (room.moderation_disabled && operation !== 'delete' && operation !== 'purge') return answer('این ارائه توسط مدیر IEAUM غیرفعال شده است.');
  if (operation === 'open') {
    const [entry, autoDelete] = await Promise.all([issueLoginLink(account.id, chat, 'presentation'), automationReady()]);
    const url = new URL(entry);
    url.searchParams.set('edit', id);
    await answer();
    await send(chat, room.title, { inline_keyboard: [
      [{ text: 'ویرایش ارائه در سایت', url: url.href }],
      [button('ویرایش عنوان', 'title', id), button('ویرایش کپشن', 'caption', id), button('حذف ارائه', 'delete', id)],
      [button('مدیریت لینک‌های ارائه', 'links', id), button('دریافت کد مدیر', 'code', id)],
      ...(autoDelete ? [[button('حذف بعد از ۳ روز', '3', id), button('حذف بعد از ۵ روز', '5', id), button('حذف خودکار خاموش', 'keep', id)]] : []),
      [button('بازگشت به ارائه‌ها', 'list')],
    ] });
  } else if (operation === 'links') {
    const owner = new URL(await issueLoginLink(account.id, chat, 'presentation'));
    owner.searchParams.set('admin', id);
    const viewer = room.published && room.join_code ? `https://ieaum.ir/erae-tori/?s=${encodeURIComponent(room.join_code)}` : null;
    await answer();
    await send(chat, `لینک‌های «${room.title}»${viewer ? `\n\nلینک شرکت‌کنندگان:\n${viewer}` : '\nلینک شرکت‌کنندگان پس از انتشار آماده می‌شود.'}`, {
      inline_keyboard:[[{text:'باز کردن کنترل ارائه',url:owner.href}],[button('بازگشت','open',id)]],
    });
  } else if (operation === 'code') {
    await answer();
    await send(chat, 'کد مدیر فعلی فقط هنگام صدور نمایش داده می‌شود. صدور کد تازه، کد قبلی را غیرفعال می‌کند.', {
      inline_keyboard:[[button('صدور کد تازه','rotate',id),button('انصراف','open',id)]],
    });
  } else if (operation === 'rotate') {
    await limit(`erae-code:${account.id}`, 15);
    const code = await rotatePresentationCode(account.id, id);
    await answer('کد تازه صادر شد.');
    await send(chat, `کد تازهٔ مدیر برای «${room.title}»\n${code}`);
  } else if (operation === 'title' || operation === 'caption') {
    await answer();
    await send(chat, `${operation === 'title' ? titlePrompt : captionPrompt}\n${id}`, { force_reply: true });
  } else if (operation === 'delete') {
    await answer();
    await send(chat, `«${room.title}» و همهٔ اطلاعات آن حذف شود؟`, { inline_keyboard: [[button('تأیید حذف', 'purge', id), button('انصراف', 'open', id)]] });
  } else if (operation === 'purge') {
    const removed = await deletePresentation(account.id, id);
    await answer(removed.length ? 'ارائه حذف شد.' : 'ارائه پیش‌تر حذف شده است.');
    if (removed.length) await showPresentations(chat);
  } else if (operation === '3' || operation === '5' || operation === 'keep') {
    if (operation !== 'keep' && !await automationReady()) return answer('حذف خودکار هنوز فعال نشده است.');
    const saved = await editPresentation(account.id, id, { expires_at: expiration(operation === 'keep' ? null : operation) });
    await answer(saved.length ? 'زمان حذف خودکار ذخیره شد.' : 'ارائه دیگر در دسترس نیست.');
  } else await answer('درخواست معتبر نیست.');
}

export async function handlePresentationEdit(chat: string, prompt: string | undefined, value: string) {
  const [label, id, extra] = prompt?.split('\n') ?? [];
  if ((label !== titlePrompt && label !== captionPrompt) || extra || !uuidPattern.test(id ?? '')) return false;
  const account = await accountForChat(chat);
  if (!account?.active) { await send(chat, 'حساب فعال پیدا نشد.'); return true; }
  const title = label === titlePrompt;
  if (!value || value.length > (title ? 120 : 800)) {
    await send(chat, `${label}\n${id}`, { force_reply: true });
    return true;
  }
  const saved = await editPresentation(account.id, id, title ? { title: value } : { caption: value === '-' ? '' : value });
  await send(chat, saved.length ? 'تغییر ارائه ذخیره شد.' : 'این ارائه در دسترس نیست.');
  return true;
}
