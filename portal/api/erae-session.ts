import portal from './portal.js';
import { manageSite } from '../server/site-management.js';
import { readHomeContent, replaceHomeContent } from '../server/home-content.js';
import { changeSiteComments, readSiteComments } from '../server/site-comments.js';
import { readSiteContacts, replaceSiteContacts } from '../server/site-contacts.js';
import { createLoginTicket } from '../server/portal-entry.js';
import { currentProfile, field, limit, PortalError, readBody, reply, setting } from '../server/portal-store.js';

const site = 'https://ieaum.ir';

export default {
  async fetch(request: Request) {
    const params = new URL(request.url).searchParams;
    const mode = params.get('transfer');
    const transfer = mode === '1' || mode === 'site';
    const origin = mode === 'site' ? setting('PORTAL_ORIGIN') : site;
    const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' };
    if (request.method === 'GET' && !transfer) {
      if (params.get('siteManagement') === '1') {
        try { return await manageSite(request); }
        catch (error) { return error instanceof PortalError ? reply({ error: error.message }, error.status) : reply({ error: 'اطلاعات مدیریت در دسترس نیست.' }, 503); }
      }
      if (params.get('siteComments') === '1') {
        try { return await readSiteComments(request); }
        catch (error) {
          return error instanceof PortalError ? reply({ error: error.message }, error.status)
            : reply({ error: 'فهرست نظرات در دسترس نیست.' }, 503);
        }
      }
      const content = params.get('siteContent');
      if (content !== '1' && content !== 'contacts') return portal.fetch(request);
      try { return await (content === 'contacts' ? readSiteContacts(request) : readHomeContent(request)); }
      catch { return reply({ error: 'ارتباط با سامانهٔ محتوا برقرار نشد.' }, 503); }
    }
    if (request.headers.get('origin') !== origin) return reply({ error: 'درخواست معتبر نیست.' }, 403);
    if (request.method === 'OPTIONS' && transfer) {
      return new Response(null, { status: 204, headers: {
        ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type',
      } });
    }
    if (request.method !== 'POST') return reply({ error: 'درخواست معتبر نیست.' }, 405);
    try {
      if (transfer) {
        const profile = await currentProfile(request);
        if (!profile) throw new PortalError(401, 'ابتدا وارد حساب IEAUM شوید.');
        await limit(`erae-session:${profile.id}`, 20);
        const response = reply({ ticket: await createLoginTicket(profile.id, profile.telegram_id ?? null) });
        for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
        return response;
      }
      const content = params.get('siteContent');
      const input = await readBody(request, content === 'contacts' || content === '1' ? 50_000 : undefined);
      if (params.get('siteComments') === '1') return await changeSiteComments(request, input);
      if (params.get('siteManagement') === '1') return await manageSite(request, input);
      const action = input.action;
      if (action === 'site-contacts:replace' && content === 'contacts') return await replaceSiteContacts(request, input.content);
      if (action === 'site-content:replace') return await replaceHomeContent(request, input.content);
      let body;
      if (action === 'redeem-login') body = { action, ticket: field(input, 'ticket') };
      else if (action === 'logout' || action === 'login' || action === 'service:opened' || action === 'link-telegram' || action === 'register'
        || action === 'reset-password' || action === 'profile:get' || action === 'profile:save' || action === 'profile:password'
        || (typeof action === 'string' && action.startsWith('quiz:'))) body = input;
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
