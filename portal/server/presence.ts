import { digest, MissingRelationError, query, supabase } from './portal-store.js';
import { telegram } from './telegram-delivery.js';

export const ownerTelegram = '1484056418';
export const ownerAccount = (profile: { telegram_id?: string | null; username: string } | null) =>
  profile?.telegram_id === ownerTelegram && profile.username === 'saleh_2007k';

export type DepartureService = 'presentation' | 'quiz' | 'livecode';
export const serviceNames: Record<DepartureService, string> = {
  presentation: 'ارائه‌طوری', quiz: 'آزمون', livecode: 'اجرای زنده کد',
};
const dayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
});
export function presenceDay(now = new Date()) {
  const parts = dayFormatter.formatToParts(now);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-');
}

export async function presenceSettings() {
  const [settings] = await query<{ active_day: string | null; mode: 'telegram' | 'report' }[]>('portal_presence_settings',
    { id: 'eq.1', select: 'active_day,mode' }).catch((error) => {
    if (error instanceof MissingRelationError) return [];
    throw error;
  });
  return settings ?? { active_day: null, mode: 'telegram' as const };
}

export async function recordDeparture(service: DepartureService, session: string, person: string, name: string, title: string) {
  const settings = await presenceSettings();
  const now = new Date();
  const day = presenceDay(now);
  const attendee = Array.from(name.trim()).slice(0, 163).join('');
  if (settings.active_day !== day || !attendee) return;
  const sessionTitle = Array.from(title).slice(0, 120).join('');
  const id = digest(JSON.stringify([service, session, person, Math.floor(+now / 60_000)]));
  const inserted = await supabase<{ id: string }[]>('/rest/v1/portal_presence_events?on_conflict=id&select=id', 'POST', {
    id, day, service, session_title: sessionTitle, attendee_name: attendee, mode: settings.mode,
  }, false, undefined, 'resolution=ignore-duplicates');
  if (inserted.length && settings.mode === 'telegram') {
    await telegram('sendMessage', {
      chat_id: ownerTelegram, protect_content: true,
      text: `خروج موقت از صفحهٔ ${serviceNames[service]}\nشرکت‌کننده: ${attendee}\nجلسه: ${sessionTitle}`,
    });
  }
}
