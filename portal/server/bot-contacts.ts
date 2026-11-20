import { rpc } from './portal-store.js';

export function recordBotContact(id: number | string, active: boolean, unixDate?: number) {
  const timestamp = typeof unixDate === 'number' && Number.isSafeInteger(unixDate) && unixDate > 0 && unixDate <= Date.now() / 1000 + 60
    ? unixDate * 1000 : Date.now();
  return rpc<null>('portal_record_bot_contact', { p_chat: String(id), p_active: active, p_observed: new Date(timestamp).toISOString() });
}
