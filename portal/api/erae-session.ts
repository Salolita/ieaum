import portal from './portal.js';
import { createLoginTicket } from '../server/portal-entry.js';
import { currentProfile, field, limit, PortalError, readBody, reply, setting } from '../server/portal-store.js';

const site = 'https://ieaum.ir';
const cors = {
  'Access-Control-Allow-Origin': site,
  'Access-Control-Allow-Credentials': 'true',
  Vary: 'Origin',
};

export default {
  async fetch(request: Request) {
    if (request.headers.get('origin') !== site) return reply({ error: 'درخواست معتبر نیست.' }, 403);
    const transfer = new URL(request.url).searchParams.get('transfer') === '1';
    if (request.method === 'OPTIONS' && transfer) {
      return new Response(null, { status: 204, headers: {
        ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type',
      } });
    }
    if (request.method !== 'POST') return reply({ error: 'درخواست معتبر نیست.' }, 405);
    try {
      if (transfer) {
        const profile = await currentProfile(request);
        const response = profile
          ? await (async () => {
            await limit(`erae-session:${profile.id}`, 20);
            return reply({ ticket: await createLoginTicket(profile.id, profile.telegram_id ?? '0') });
          })()
          : reply({ error: 'ابتدا وارد حساب IEAUM شوید.' }, 401);
        for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
        return response;
      }
      const input = await readBody(request, 2500);
      const action = input.action;
      let body;
      if (action === 'redeem-login') body = { action, ticket: field(input, 'ticket') };
      else if (action === 'login') body = { action, username: field(input, 'username'), password: field(input, 'password') };
      else return reply({ error: 'درخواست معتبر نیست.' }, 400);

      const headers = new Headers(request.headers);
      headers.delete('Content-Length');
      headers.set('Origin', setting('PORTAL_ORIGIN'));
      return await portal.fetch(new Request(setting('PORTAL_ORIGIN') + '/api/portal', { method: 'POST', headers, body: JSON.stringify(body) }));
    } catch (error) {
      const response = error instanceof PortalError ? reply({ error: error.message }, error.status) : reply({ error: 'ارتباط با سامانهٔ حساب‌ها برقرار نشد.' }, 503);
      if (transfer) for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
      return response;
    }
  },
};
