import { createHmac } from 'node:crypto';
import { equalSecret, PortalError, setting } from './portal-store.js';

export function telegramIdentity(initData: string, now = Date.now()) {
  const invalid = () => new PortalError(401, 'تلگرام نتوانست هویت این نشست را تأیید کند. مینی‌اپ را از دکمهٔ داخل گفت‌وگوی خصوصی ربات دوباره باز کنید.', undefined, 'telegram_invalid');
  if (!initData) throw new PortalError(401, 'اطلاعات هویت تلگرام دریافت نشد. فرم را از دکمهٔ مینی‌اپ داخل گفت‌وگوی خصوصی ربات باز کنید.', undefined, 'telegram_missing');
  if (initData.length > 8192) throw invalid();
  const data = new URLSearchParams(initData);
  if (new Set(data.keys()).size !== [...data.keys()].length) throw invalid();
  const signature = data.get('hash') ?? '';
  const issuedAt = Number(data.get('auth_date'));
  const age = now / 1000 - issuedAt;
  if (!/^[a-f0-9]{64}$/.test(signature) || !Number.isSafeInteger(issuedAt) || age < -30) throw invalid();

  data.delete('hash');
  data.sort();
  const check = [...data].map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(setting('TELEGRAM_BOT_TOKEN')).digest();
  if (!equalSecret(signature, createHmac('sha256', secret).update(check).digest('hex'))) throw invalid();
  if (age > 900) throw new PortalError(401, 'نشست تلگرام منقضی شده است. مینی‌اپ را ببندید و از همان گفت‌وگو دوباره باز کنید.', undefined, 'telegram_expired');

  let id: unknown;
  try { id = JSON.parse(data.get('user') ?? 'null')?.id; }
  catch { throw invalid(); }
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) throw invalid();
  return String(id);
}
