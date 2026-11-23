import assert from 'node:assert/strict';
import {test} from 'node:test';
import {forward} from './upstream.js';

test('the same-origin proxy isolates preview and forwards only the existing host cookie', async () => {
  const site = 'https://portal.preview.test';
  const priorFetch = globalThis.fetch;
  const priorSite = process.env.LIVECODE_PORTAL_ORIGIN;
  const priorSigner = process.env.LIVECODE_GRANT_UPSTREAM;
  let calls = 0;
  const create = (origin: string, data = {transaction: 'fixture'}) => new Request(site + '/api/live-code/grant', {
    method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json',
      Cookie: 'unrelated=fixture; __Host-ieaum=' + 'c'.repeat(32)}, body: JSON.stringify(data),
  });
  try {
    process.env.LIVECODE_PORTAL_ORIGIN = site;
    process.env.LIVECODE_GRANT_UPSTREAM = 'https://numeralab.ieaum.ir';
    globalThis.fetch = (async (url, opts) => {
      calls++;
      assert.equal(String(url), 'https://solver.preview.test/api/live-code-grant');
      assert.equal(new Headers(opts?.headers).get('cookie'), '__Host-ieaum=' + 'c'.repeat(32));
      assert.equal(opts?.redirect, 'error');
      return Response.json({ok: true});
    }) as typeof fetch;
    assert.equal((await forward(create(site))).status, 503);
    process.env.LIVECODE_GRANT_UPSTREAM = 'https://solver.preview.test';
    assert.equal((await forward(create('https://elsewhere.preview.test'))).status, 403);
    assert.equal((await forward(create(site, {action: 'logout'} as any), true)).status, 400);
    assert.equal(calls, 0);
    assert.equal((await forward(create(site))).status, 200);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorSite === undefined) delete process.env.LIVECODE_PORTAL_ORIGIN; else process.env.LIVECODE_PORTAL_ORIGIN = priorSite;
    if (priorSigner === undefined) delete process.env.LIVECODE_GRANT_UPSTREAM; else process.env.LIVECODE_GRANT_UPSTREAM = priorSigner;
  }
});
