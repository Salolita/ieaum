import { availableRoom } from './erae-owner.js';
import { currentProfile, limit, PortalError, query, reply, uuidPattern, write } from './portal-store.js';
import { ownerAccount, ownerTelegram, presenceDay, presenceSettings } from './presence.js';
import { telegram } from './telegram-delivery.js';

export const presenceMenuLabel = 'اعلان خروج از جلسه';

export async function presenceMenu(chat: string) {
  if (chat !== ownerTelegram) return;
  const setting = await presenceSettings();
  const enabled = setting.active_day === presenceDay();
  await telegram('sendMessage', {
    chat_id: chat,
    text: `اعلان خروج از جلسه برای امروز ${enabled ? 'فعال' : 'خاموش'} است.\nشیوهٔ اطلاع‌رسانی: ${setting.mode === 'telegram' ? 'پیام تلگرام' : 'گزارش سایت'}\nفعال‌سازی تا پایان روز به وقت تهران معتبر است.`,
    reply_markup: { inline_keyboard: [
      [{ text: 'فعال برای امروز', callback_data: 'presence:on' }, { text: 'غیرفعال', callback_data: 'presence:off' }],
      [{ text: 'پیام تلگرام', callback_data: 'presence:telegram' }, { text: 'گزارش سایت', callback_data: 'presence:report' }],
      [{ text: 'مدیریت ارائه‌ها و گزارش خروج', url: 'https://ieaum.ir/management/' }],
    ] },
  });
}

export async function updatePresence(chat: string, action: string) {
  if (chat !== ownerTelegram || !['on', 'off', 'telegram', 'report'].includes(action)) return;
  await limit('presence-setting:' + chat, 30);
  const values = action === 'on' || action === 'off'
    ? { active_day: action === 'on' ? presenceDay() : null }
    : { mode: action };
  await write('portal_presence_settings', 'PATCH', values, { id: 'eq.1' });
  await presenceMenu(chat);
}

export async function manageSite(request: Request, body?: Record<string, unknown>) {
  const profile = await currentProfile(request);
  const manager = ownerAccount(profile);
  const params = new URL(request.url).searchParams;
  if (!body && params.get('scope') === 'access') return reply({ canManage: manager });
  if (!profile || !manager) throw new PortalError(403, 'دسترسی مدیر IEAUM لازم است.');
  if (body) {
    const id = typeof body.id === 'string' ? body.id : '';
    if (!uuidPattern.test(id) || !['delete', 'disable', 'enable'].includes(String(body.action))) {
      throw new PortalError(422, 'درخواست مدیریت ارائه معتبر نیست.');
    }
    await limit('site-presentations:' + profile.id, 50);
    const [room] = body.action === 'delete'
      ? await write<{ id: string }[]>('erae_rooms', 'DELETE', undefined, { id: 'eq.' + id, select: 'id' })
      : await write<{ id: string }[]>('erae_rooms', 'PATCH', { moderation_disabled: body.action === 'disable' },
        { ...availableRoom(), id: 'eq.' + id, select: 'id' });
    if (!room) throw new PortalError(404, 'ارائه دیگر در دسترس نیست.');
    return reply({ ok: true });
  }
  const scope = params.get('scope');
  const page = Number(params.get('page') ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 1000) throw new PortalError(422, 'شمارهٔ صفحه معتبر نیست.');
  if (scope === 'report') {
    const day = params.get('day') ?? presenceDay();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) ||
        new Date(day).toISOString().slice(0, 10) !== day) throw new PortalError(422, 'تاریخ گزارش معتبر نیست.');
    const rows = await query('portal_presence_events', {
      day: 'eq.' + day, mode: 'eq.report', select: 'service,session_title,attendee_name,created_at',
      limit: '26', offset: String((page - 1) * 25), order: 'created_at.desc,id.desc',
    }) as unknown[];
    return reply({ rows: rows.slice(0, 25), more: rows.length > 25 && page < 1000, day });
  }
  if (scope !== 'rooms') throw new PortalError(404, 'این بخش در دسترس نیست.');
  const rooms = await query('erae_rooms', {
    ...availableRoom(), select: 'id,title,published,moderation_disabled,owner:portal_profiles(first_name,last_name)',
    limit: '26', offset: String((page - 1) * 25), order: 'created_at.desc,id.desc',
  }) as unknown[];
  return reply({ rooms: rooms.slice(0, 25), more: rooms.length > 25 && page < 1000 });
}
