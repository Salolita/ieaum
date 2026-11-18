import { portal } from './portal';

export function takeSiteTicket() {
  const ticket = new URLSearchParams(location.hash.slice(1)).get('ticket');
  if (ticket) history.replaceState(null, '', location.pathname + location.search);
  return ticket;
}

export async function redeemSiteTicket(ticket: string) {
  const response = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'redeem-login', ticket }) });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error ?? 'ورود به سایت انجام نشد. دوباره از ربات اقدام کنید.');
  }
}

export async function restoreFromSolver() {
  const response = await fetch('https://numeralab.ieaum.ir/api/erae-session?transfer=1', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) return false;
  const data = await response.json() as { ticket: string };
  await redeemSiteTicket(data.ticket);
  return true;
}

export const loadPanelProfile = <Account>() => portal<{ profile: Account | null }>().then(({ profile }) => profile);
