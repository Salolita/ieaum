import { setting } from "./portal-store.js";
async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${setting("TELEGRAM_BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5e3)
  });
  if (!response.ok || !(await response.json()).ok) throw new Error("Telegram delivery failed");
}
const panelButton = (text = "\u0648\u0631\u0648\u062F \u0628\u0647 \u067E\u0646\u0644 IEAUM") => ({
  inline_keyboard: [[{ text, url: "https://ieaum.ir/panel/" }]]
});
export {
  panelButton,
  telegram
};
