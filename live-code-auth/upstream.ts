const offline = 'این بخش توسط مدیر غیرفعال شده است.';
const headers = {'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'};
const primary = 'https://ieaum.ir';
const solver = 'https://numeralab.ieaum.ir';

function origin(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value) throw new Error('Invalid origin');
  return url.origin;
}

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
    return typeof result === 'object' && result !== null && !Array.isArray(result) ? result : null;
  } finally { reader.releaseLock(); }
}

export async function forward(request: Request, accountPreview = false) {
  try {
    const site = origin(process.env.LIVECODE_PORTAL_ORIGIN ?? '');
    const host = origin(process.env.LIVECODE_GRANT_UPSTREAM ?? '');
    if (new URL(request.url).origin !== site || (site === primary) !== (host === solver)
      || host === primary || accountPreview && site === primary) throw new Error('Invalid deployment routing');
    const get = accountPreview && request.method === 'GET';
    if (!get && request.method !== 'POST') return Response.json({}, {status: 405, headers});
    if (!get && request.headers.get('origin') !== site) return Response.json({}, {status: 403, headers});
    if (request.headers.get('sec-fetch-site') === 'cross-site') return Response.json({}, {status: 403, headers});
    const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-ieaum=([A-Za-z0-9_-]{32})(?:;|$)/)?.[1];
    if (!accountPreview && !cookie) return Response.json({}, {status: 401, headers});
    const data = get ? null : await payload(request);
    if (!get && (!data || (accountPreview && data.action !== 'login'))) return Response.json({}, {status: 400, headers});
    const response = await fetch(host + (accountPreview ? '/api/portal' : '/api/live-code-grant'), {
      method: request.method,
      headers: {
        ...headers, 'Content-Type': 'application/json', Origin: site,
        ...(cookie ? {Cookie: '__Host-ieaum=' + cookie} : {}),
      },
      body: get ? undefined : JSON.stringify(data),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(accountPreview ? 9500 : 5200),
    });
    const out = new Headers({...headers, 'Content-Type': 'application/json'});
    const set = accountPreview && response.headers.get('set-cookie');
    if (set && /^__Host-ieaum=[A-Za-z0-9_-]*; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=\d+$/.test(set)) {
      out.set('Set-Cookie', set);
    }
    return new Response(response.body, {status: response.status, headers: out});
  } catch {
    return Response.json({error: offline}, {status: 503, headers});
  }
}
