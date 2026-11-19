import { redeemSiteTicket, takeSiteTicket } from './portal/client/utils/site-session';

async function updateEntry() {
  const ticket = takeSiteTicket();
  const status = document.querySelector<HTMLElement>('#account-status');
  if (ticket) {
    if (status) { status.hidden = false; status.textContent = 'در حال ورود…'; }
    try { await redeemSiteTicket(ticket); if (status) status.textContent = 'وارد حساب IEAUM شدید.'; }
    catch (error) { if (status) status.textContent = (error as Error).message; }
  }
  const response = await fetch('/api/account', { cache: 'no-store' });
  if (!response.ok) return;
  const { profile } = await response.json();
  document.querySelectorAll('[data-panel-label]').forEach((label) => { label.textContent = profile ? 'نمایه من' : 'ورود به پنل'; });
}
void updateEntry().catch(() => {});
window.addEventListener('pageshow', (event) => { if (event.persisted) void updateEntry().catch(() => {}); });
