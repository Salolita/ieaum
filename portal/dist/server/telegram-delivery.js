import { setting } from "./portal-store.js";
class TelegramDeliveryError extends Error {
  constructor(status, retryAfter) {
    super("Telegram delivery failed");
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${setting("TELEGRAM_BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5e3)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) throw new TelegramDeliveryError(result?.error_code ?? response.status, result?.parameters?.retry_after);
}
const panelButton = (text = "\u0648\u0631\u0648\u062F \u0628\u0647 \u067E\u0646\u0644 IEAUM") => ({
  inline_keyboard: [[{ text, url: "https://ieaum.ir/panel/" }]]
});
export {
  TelegramDeliveryError,
  panelButton,
  telegram
};
