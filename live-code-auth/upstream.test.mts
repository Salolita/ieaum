import assert from 'node:assert/strict';
import {test} from 'node:test';
import {forward} from './upstream.js';

test('grant proxy is production-only and sends only the session cookie and bounded offer', async () => {
  const site = 'https://ieaum.ir';
  const env = {VERCEL_ENV: 'production', LIVECODE_PORTAL_ORIGIN: site, LIVECODE_GRANT_UPSTREAM: 'https://numeralab.ieaum.ir'};
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const priorFetch = globalThis.fetch;
  const offer = {transaction: 'a'.repeat(43), boot: 'b'.repeat(43), challenge: 'c'.repeat(43)};
  let calls = 0;
  const create = (origin = site, host = site, data = JSON.stringify({...offer, unrelated: 'discard'})) =>
    new Request(host + '/api/live-code/grant', {
      method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json',
        Cookie: 'unrelated=fixture; __Host-ieaum=' + 'c'.repeat(32)}, body: data,
    });
  globalThis.fetch = (async (url, opts) => {
    calls++;
    assert.equal(String(url), 'https://numeralab.ieaum.ir/api/live-code-grant');
    assert.equal(new Headers(opts?.headers).get('cookie'), '__Host-ieaum=' + 'c'.repeat(32));
    assert.equal(opts?.redirect, 'error');
    assert.deepEqual(JSON.parse(String(opts?.body)), offer);
    return Response.json({ok: true}, {headers: {'Set-Cookie': 'ignored=fixture', Location: 'https://example.invalid'}});
  }) as typeof fetch;

  try {
    assert.equal((await forward(create('https://elsewhere.preview.test'))).status, 403);
    assert.equal((await forward(create(site, 'https://site.preview.test'))).status, 503);
    assert.equal((await forward(create(site, site, '{'))).status, 400);
    process.env.VERCEL_ENV = 'preview';
    assert.equal((await forward(create())).status, 503);
    process.env.VERCEL_ENV = 'production';
    process.env.LIVECODE_GRANT_UPSTREAM = 'https://solver.preview.test';
    assert.equal((await forward(create())).status, 503);
    process.env.LIVECODE_GRANT_UPSTREAM = env.LIVECODE_GRANT_UPSTREAM;
    assert.equal(calls, 0);
    const reply = await forward(create());
    assert.equal(reply.status, 200);
    assert.equal(reply.headers.get('set-cookie'), null);
    assert.equal(reply.headers.get('location'), null);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = priorFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
