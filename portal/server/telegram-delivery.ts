import { setting } from './portal-store.js';

export class TelegramDeliveryError extends Error {
  constructor(readonly status: number, readonly retryAfter?: number) { super('Telegram delivery failed'); }
}

export async function telegram(method: string, body: object) {
  const response = await fetch(`https://api.telegram.org/bot${setting('TELEGRAM_BOT_TOKEN')}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) throw new TelegramDeliveryError(result?.error_code ?? response.status, result?.parameters?.retry_after);
}

export const panelButton = (text = 'ورود به پنل IEAUM') => ({
  inline_keyboard: [[{ text, url: 'https://ieaum.ir/panel/' }]],
});
