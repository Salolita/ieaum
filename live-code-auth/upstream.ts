const offline = 'این بخش توسط مدیر غیرفعال شده است.';
const headers = {'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'};
const primary = 'https://ieaum.ir';
const solver = 'https://numeralab.ieaum.ir';
const nonce = /^[A-Za-z0-9_-]{43}$/;

async function payload(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json' || !request.body) return null;
  const reader = request.body.getReader();
  let size = 0;
  const bytes: Uint8Array[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 2048) { void reader.cancel(); return null; }
      bytes.push(chunk.value);
    }
    const result = JSON.parse(Buffer.concat(bytes).toString('utf8'));
    if (!result || Array.isArray(result) || typeof result !== 'object') return null;
    const {transaction, boot, challenge} = result;
    if (![transaction, boot, challenge].every(value => typeof value === 'string' && nonce.test(value))) return null;
    return {transaction, boot, challenge};
  } catch {
    return null;
  } finally { reader.releaseLock(); }
}

export async function forward(request: Request) {
  if (process.env.VERCEL_ENV !== 'production' || process.env.LIVECODE_PORTAL_ORIGIN !== primary
      || process.env.LIVECODE_GRANT_UPSTREAM !== solver || new URL(request.url).origin !== primary) {
    return Response.json({error: offline}, {status: 503, headers});
  }
  if (request.method !== 'POST') return Response.json({}, {status: 405, headers});
  if (request.headers.get('origin') !== primary || request.headers.get('sec-fetch-site') === 'cross-site') {
    return Response.json({}, {status: 403, headers});
  }
  const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-ieaum=([A-Za-z0-9_-]{32})(?:;|$)/)?.[1];
  if (!cookie) return Response.json({}, {status: 401, headers});
  const data = await payload(request);
  if (!data) return Response.json({}, {status: 400, headers});
  try {
    const response = await fetch(solver + '/api/live-code-grant', {
      method: 'POST',
      headers: {...headers, 'Content-Type': 'application/json', Origin: primary, Cookie: '__Host-ieaum=' + cookie},
      body: JSON.stringify(data), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5200),
    });
    const out = new Headers({...headers, 'Content-Type': 'application/json'});
    return new Response(response.body, {status: response.status, headers: out});
  } catch {
    return Response.json({error: offline}, {status: 503, headers});
  }
}
