import { createHmac } from "node:crypto";
import { equalSecret, PortalError, setting } from "./portal-store.js";
function telegramIdentity(initData, now = Date.now()) {
  const invalid = () => new PortalError(401, "\u062A\u0644\u06AF\u0631\u0627\u0645 \u0646\u062A\u0648\u0627\u0646\u0633\u062A \u0647\u0648\u06CC\u062A \u0627\u06CC\u0646 \u0646\u0634\u0633\u062A \u0631\u0627 \u062A\u0623\u06CC\u06CC\u062F \u06A9\u0646\u062F. \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u0627\u0632 \u062F\u06A9\u0645\u0647\u0654 \u062F\u0627\u062E\u0644 \u06AF\u0641\u062A\u200C\u0648\u06AF\u0648\u06CC \u062E\u0635\u0648\u0635\u06CC \u0631\u0628\u0627\u062A \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F.", void 0, "telegram_invalid");
  if (!initData) throw new PortalError(401, "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0647\u0648\u06CC\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u062F\u0631\u06CC\u0627\u0641\u062A \u0646\u0634\u062F. \u0641\u0631\u0645 \u0631\u0627 \u0627\u0632 \u062F\u06A9\u0645\u0647\u0654 \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u062F\u0627\u062E\u0644 \u06AF\u0641\u062A\u200C\u0648\u06AF\u0648\u06CC \u062E\u0635\u0648\u0635\u06CC \u0631\u0628\u0627\u062A \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F.", void 0, "telegram_missing");
  if (initData.length > 8192) throw invalid();
  const data = new URLSearchParams(initData);
  if (new Set(data.keys()).size !== [...data.keys()].length) throw invalid();
  const signature = data.get("hash") ?? "";
  const issuedAt = Number(data.get("auth_date"));
  const age = now / 1e3 - issuedAt;
  if (!/^[a-f0-9]{64}$/.test(signature) || !Number.isSafeInteger(issuedAt) || age < -30) throw invalid();
  data.delete("hash");
  data.sort();
  const check = [...data].map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(setting("TELEGRAM_BOT_TOKEN")).digest();
  if (!equalSecret(signature, createHmac("sha256", secret).update(check).digest("hex"))) throw invalid();
  if (age > 900) throw new PortalError(401, "\u0646\u0634\u0633\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A. \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u0628\u0628\u0646\u062F\u06CC\u062F \u0648 \u0627\u0632 \u0647\u0645\u0627\u0646 \u06AF\u0641\u062A\u200C\u0648\u06AF\u0648 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F.", void 0, "telegram_expired");
  let id;
  try {
    id = JSON.parse(data.get("user") ?? "null")?.id;
  } catch {
    throw invalid();
  }
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) throw invalid();
  return String(id);
}
export {
  telegramIdentity
};
