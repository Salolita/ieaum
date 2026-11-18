import { setting } from './portal-store.js';

export async function telegram(method: string, body: object) {
  const response = await fetch(`https://api.telegram.org/bot${setting('TELEGRAM_BOT_TOKEN')}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok || !(await response.json()).ok) throw new Error('Telegram delivery failed');
}

export const panelButton = (text = 'ورود به پنل IEAUM') => ({
  inline_keyboard: [[{ text, url: 'https://ieaum.ir/panel/' }]],
});
