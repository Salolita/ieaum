import { redeemSiteTicket, takeSiteTicket } from './portal/client/utils/site-session';

const ticket = takeSiteTicket();
if (ticket) {
  const status = document.querySelector<HTMLElement>('#account-status');
  if (status) { status.hidden = false; status.textContent = 'در حال ورود…'; }
  redeemSiteTicket(ticket).then(() => {
    if (status) status.textContent = 'وارد حساب IEAUM شدید.';
    const panel = document.querySelector<HTMLAnchorElement>('.header-link');
    if (panel) panel.textContent = 'پنل من ↗';
  }).catch((error: Error) => { if (status) status.textContent = error.message; });
}
