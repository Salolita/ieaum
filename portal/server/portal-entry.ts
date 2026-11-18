import { digest, setting, token, write, type Profile } from './portal-store.js';

export async function issueLoginLink(profileId: string, chat: string, target: string) {
  const code = token();
  await write('portal_tickets', 'POST', {
    token_hash: digest(code), profile_id: profileId, telegram_id: chat,
    expires_at: new Date(Date.now() + 180_000).toISOString(),
  });
  const handoff = new URL('/continue.html', setting('PORTAL_ORIGIN'));
  handoff.searchParams.set('to', ['home', 'solver', 'presentation'].includes(target) ? target : 'panel');
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
