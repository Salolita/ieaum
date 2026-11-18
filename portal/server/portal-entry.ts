import { digest, setting, token, write, type Profile } from './portal-store.js';

export async function createLoginTicket(profileId: string, chat: string) {
  const code = token();
  await write('portal_tickets', 'POST', {
    token_hash: digest(code), profile_id: profileId, telegram_id: chat,
    expires_at: new Date(Date.now() + 180_000).toISOString(),
  });
  return code;
}

export async function issueLoginLink(profileId: string, chat: string, target: string) {
  const code = await createLoginTicket(profileId, chat);
  if (target !== 'solver') {
    const route = target === 'home' ? '/' : target === 'presentation' ? '/erae-tori/' : '/panel/';
    const direct = new URL(route, 'https://ieaum.ir');
    direct.hash = new URLSearchParams({ ticket: code }).toString();
    return direct.href;
  }
  const handoff = new URL('/continue.html', setting('PORTAL_ORIGIN'));
  handoff.searchParams.set('to', 'solver');
  handoff.hash = code;
  return handoff.href;
}

export const resetDigest = (code: string) => digest('password-reset:' + code);

export async function issueResetCode(profileId: Profile['id'], chat: string) {
  const code = token();
  await write('portal_tickets', 'POST', {
    token_hash: resetDigest(code), profile_id: profileId, telegram_id: chat,
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  });
  return code;
}
