import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(24).toString("base64url");
const tokenPattern = /^[A-Za-z0-9_-]{32}$/;
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const internalEmail = (username) => `${digest(username).slice(0, 40)}@accounts.numeralab.ieaum.ir`;
const studentNumber = (value) => value.trim().replace(/[۰-۹٠-٩]/g, (digit) => String(digit.charCodeAt(0) - (digit >= "\u06F0" ? 1776 : 1632)));
class PortalError extends Error {
  constructor(status, message, field2, code) {
    super(message);
    this.status = status;
    this.field = field2;
    this.code = code;
  }
}
class AuthAccountExists extends PortalError {
  constructor() {
    super(409, "\u0627\u06CC\u0646 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0642\u0628\u0644\u0627\u064B \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A.");
  }
}
function setting(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new PortalError(503, "\u0633\u0627\u0645\u0627\u0646\u0647\u0654 \u062D\u0633\u0627\u0628\u200C\u0647\u0627 \u0647\u0646\u0648\u0632 \u0631\u0627\u0647\u200C\u0627\u0646\u062F\u0627\u0632\u06CC \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  return value;
}
function equalSecret(left, right) {
  return timingSafeEqual(Buffer.from(digest(left)), Buffer.from(digest(right)));
}
async function supabase(path, method = "GET", body, publicKey = false, userToken) {
  const key = setting(publicKey ? "SUPABASE_PUBLIC_KEY" : "SUPABASE_SECRET_KEY");
  const headers = { apikey: key, "Content-Type": "application/json", Prefer: "return=representation" };
  if (userToken || key.startsWith("eyJ")) headers.Authorization = `Bearer ${userToken ?? key}`;
  const response = await fetch(setting("SUPABASE_URL").replace(/\/$/, "") + path, {
    method,
    headers,
    body: body === void 0 ? void 0 : JSON.stringify(body),
    signal: AbortSignal.timeout(7e3)
  });
  if (!response.ok) {
    if (response.status === 409) throw new PortalError(409, "\u0627\u06CC\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0642\u0628\u0644\u0627\u064B \u062B\u0628\u062A \u0634\u062F\u0647 \u06CC\u0627 \u06CC\u06A9\u06CC \u0627\u0632 \u0645\u0634\u062E\u0635\u0627\u062A \u062A\u06A9\u0631\u0627\u0631\u06CC \u0627\u0633\u062A.");
    if (response.status === 429) throw new PortalError(429, "\u062A\u0639\u062F\u0627\u062F \u062A\u0644\u0627\u0634\u200C\u0647\u0627 \u0632\u06CC\u0627\u062F \u0627\u0633\u062A. \u0686\u0646\u062F \u062F\u0642\u06CC\u0642\u0647 \u062F\u06CC\u06AF\u0631 \u062F\u0648\u0628\u0627\u0631\u0647 \u0627\u0645\u062A\u062D\u0627\u0646 \u06A9\u0646\u06CC\u062F.");
    if (path.startsWith("/auth/v1/token?") && [400, 401].includes(response.status)) throw new PortalError(401, "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u06CC\u0627 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    if (path.startsWith("/auth/v1/admin/users") && [400, 422].includes(response.status)) {
      const failure = await response.json().catch(() => null);
      const code = failure?.error_code ?? failure?.code;
      if (code === "email_exists" || code === "user_already_exists") throw new AuthAccountExists();
      if (code === "weak_password") throw new PortalError(422, "\u0633\u0627\u0645\u0627\u0646\u0647\u0654 \u062D\u0633\u0627\u0628\u200C\u0647\u0627 \u0627\u06CC\u0646 \u0631\u0645\u0632 \u0631\u0627 \u0636\u0639\u06CC\u0641 \u062A\u0634\u062E\u06CC\u0635 \u062F\u0627\u062F. \u0631\u0645\u0632 \u062F\u06CC\u06AF\u0631\u06CC \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F.", "password");
      throw new PortalError(422, "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u062D\u0633\u0627\u0628 \u067E\u0630\u06CC\u0631\u0641\u062A\u0647 \u0646\u0634\u062F. \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0648 \u0631\u0645\u0632 \u0631\u0627 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F.");
    }
    throw new PortalError(503, "\u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u0627 \u0633\u0627\u0645\u0627\u0646\u0647\u0654 \u062D\u0633\u0627\u0628\u200C\u0647\u0627 \u0628\u0631\u0642\u0631\u0627\u0631 \u0646\u0634\u062F.");
  }
  return await response.text().then((value) => value ? JSON.parse(value) : null);
}
function query(table, filters = {}) {
  return supabase(`/rest/v1/${table}?${new URLSearchParams(filters)}`);
}
function write(table, method, body, filters = {}) {
  return supabase(`/rest/v1/${table}?${new URLSearchParams(filters)}`, method, body);
}
const rpc = (name, body) => supabase(`/rest/v1/rpc/${name}`, "POST", body);
async function limit(bucket, max) {
  if (!await rpc("portal_rate_limit", { p_bucket: digest(bucket), p_limit: max })) {
    throw new PortalError(429, "\u062A\u0639\u062F\u0627\u062F \u062A\u0644\u0627\u0634\u200C\u0647\u0627 \u0632\u06CC\u0627\u062F \u0627\u0633\u062A. \u0686\u0646\u062F \u062F\u0642\u06CC\u0642\u0647 \u062F\u06CC\u06AF\u0631 \u062F\u0648\u0628\u0627\u0631\u0647 \u0627\u0645\u062A\u062D\u0627\u0646 \u06A9\u0646\u06CC\u062F.");
  }
}
async function verifyPassword(username, password) {
  const auth = await supabase("/auth/v1/token?grant_type=password", "POST", {
    email: internalEmail(username),
    password
  }, true);
  await supabase("/auth/v1/logout?scope=local", "POST", void 0, true, auth.access_token);
  return auth.user.id;
}
function cookieValue(request) {
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)__Host-ieaum=([A-Za-z0-9_-]{32})(?:;|$)/)?.[1];
  return cookie ?? null;
}
async function currentProfile(request) {
  const cookie = cookieValue(request);
  if (!cookie) return null;
  const [session] = await query("portal_sessions", {
    token_hash: `eq.${digest(cookie)}`,
    expires_at: `gt.${(/* @__PURE__ */ new Date()).toISOString()}`,
    select: "profile_id",
    limit: "1"
  });
  if (!session) return null;
  const [profile] = await query("portal_profiles", {
    id: `eq.${session.profile_id}`,
    active: "eq.true",
    select: "id,username,role,first_name,last_name,active,course_name,telegram_id",
    limit: "1"
  });
  return profile ?? null;
}
function reply(body, status = 200, session) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (session !== void 0) headers["Set-Cookie"] = `__Host-ieaum=${session ?? ""}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${session ? 2592e3 : 0}`;
  return Response.json(body, { status, headers });
}
async function readBody(request, maxBytes = 3e4) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new PortalError(415, "\u0642\u0627\u0644\u0628 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  const stream = request.body?.getReader();
  if (!stream) throw new PortalError(400, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  let length = 0;
  let input = "";
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await stream.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > maxBytes) {
      await stream.cancel();
      throw new PortalError(413, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0628\u0632\u0631\u06AF \u0627\u0633\u062A.");
    }
    input += decoder.decode(chunk.value, { stream: true });
  }
  try {
    const body = JSON.parse(input + decoder.decode());
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {
  }
  throw new PortalError(400, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
}
const field = (body, name) => typeof body[name] === "string" ? body[name] : "";
export {
  AuthAccountExists,
  PortalError,
  cookieValue,
  currentProfile,
  digest,
  equalSecret,
  field,
  internalEmail,
  limit,
  query,
  readBody,
  reply,
  rpc,
  setting,
  studentNumber,
  supabase,
  token,
  tokenPattern,
  uuidPattern,
  verifyPassword,
  write
};
