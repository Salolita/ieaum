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

test('only the same-site Live Code origin can check IEAUM sessions or request a credentialed grant', async () => {
  const site = 'https://ieaum.ir';
  const live = 'https://livecode.ieaum.ir';
  const solver = 'https://numeralab.ieaum.ir';
  const env = {VERCEL_ENV: 'production', LIVECODE_PORTAL_ORIGIN: site, LIVECODE_GRANT_UPSTREAM: solver};
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const priorFetch = globalThis.fetch;
  const cookie = '__Host-ieaum=' + 'c'.repeat(32);
  const offer = {transaction: 'a'.repeat(43), boot: 'b'.repeat(43), challenge: 'c'.repeat(43)};
  const request = (method: string, origin = live, fetchSite = 'same-site', session = cookie) =>
    new Request(site + '/api/live-code/grant', {
      method, headers: {Origin: origin, 'Sec-Fetch-Site': fetchSite, Cookie: session, 'Content-Type': 'application/json'},
      ...(method === 'POST' ? {body: JSON.stringify(offer)} : {}),
    });
  let signedIn = true;
  let calls = 0;
  globalThis.fetch = (async (url, opts) => {
    calls++;
    const received = new Headers(opts?.headers);
    assert.equal(received.get('cookie'), cookie);
    assert.equal(opts?.redirect, 'error');
    if (opts?.method !== 'POST') {
      assert.equal(String(url), solver + '/api/erae-session');
      return Response.json({enabled: true, profile: signedIn ? {username: 'private-test-profile'} : null},
        {headers: {'Set-Cookie': 'ignored=fixture'}});
    }
    assert.equal(String(url), solver + '/api/live-code-grant');
    assert.equal(received.get('origin'), site);
    assert.deepEqual(JSON.parse(String(opts?.body)), offer);
    return Response.json({ok: true}, {headers: {'Set-Cookie': 'ignored=fixture'}});
  }) as typeof fetch;

  try {
    for (const bad of [request('GET', solver), request('POST', 'https://elsewhere.test'), request('GET', live, 'cross-site')]) {
      const rejected = await forward(bad);
      assert.equal(rejected.status, 403);
      assert.equal(rejected.headers.get('access-control-allow-origin'), null);
    }
    const preflight = await forward(request('OPTIONS', live, 'same-site', ''));
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), live);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(preflight.headers.get('vary'), 'Origin');
    assert.deepEqual(await (await forward(request('GET', live, 'same-site', ''))).json(), {signedIn: false});
    assert.equal((await forward(request('POST', live, 'same-site', ''))).status, 401);
    assert.equal(calls, 0);
    const check = await forward(request('GET'));
    assert.deepEqual(await check.json(), {signedIn: true});
    assert.equal(check.headers.get('set-cookie'), null);
    signedIn = false;
    assert.deepEqual(await (await forward(request('GET'))).json(), {signedIn: false});
    const grant = await forward(request('POST'));
    assert.equal(grant.status, 200);
    assert.equal(grant.headers.get('access-control-allow-origin'), live);
    assert.equal(grant.headers.get('set-cookie'), null);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = priorFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
