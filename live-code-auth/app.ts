const status = document.querySelector<HTMLParagraphElement>('#status')!;
const guidance = document.querySelector<HTMLElement>('#offline-guidance')!;
function offline() {
  status.textContent = 'سرور خاموش است یا این بخش توسط مدیر غیرفعال شده است.';
  guidance.hidden = false;
}
const form = document.querySelector<HTMLFormElement>('#login')!;
const allow = document.querySelector<HTMLButtonElement>('#allow')!;
const submit = form.querySelector<HTMLButtonElement>('button')!;
const openerWindow = window.opener;
const configured = import.meta.env.VITE_LIVECODE_AUTH_ORIGIN ?? '';
const accountApi = location.origin === 'https://ieaum.ir' ? '/api/account' : '/api/live-code/account';
function isExactHttpsOrigin(value: string) {
  try { return new URL(value).protocol === 'https:' && new URL(value).origin === value; }
  catch { return false; }
}
const validOrigin = isExactHttpsOrigin(configured)
  && ((location.origin === 'https://ieaum.ir') === (configured === 'https://livecode.ieaum.ir'));
const signIn = validOrigin && location.origin === 'https://ieaum.ir'
  && location.search === '?mode=signin' && location.hash === '';
const token = /^[A-Za-z0-9_-]{43}$/;
type Offer = {transaction: string; boot: string; challenge: string};
let offer: Offer | undefined;
let ready = false;
let busy = false;

document.querySelector('#close')?.addEventListener('click', () => {
  if (signIn) location.replace(configured + '/');
  else window.close();
});

async function checkSession() {
  const response = await fetch(accountApi, {cache: 'no-store', signal: AbortSignal.timeout(5000)});
  const profile = response.ok ? (await response.json()).profile : null;
  if (profile) {
    if (signIn) {
      location.replace(configured + '/?account=ieaum');
      return;
    }
    form.hidden = true;
    allow.hidden = false;
    status.textContent = 'برای اتصال این حساب به اجرای زنده کد تأیید کنید.';
  } else {
    form.hidden = false;
    status.textContent = 'با حساب فعلی IEAUM وارد شوید.';
  }
}

if (signIn) {
  document.querySelector('#close')!.textContent = 'بازگشت به اجرای زنده کد';
  void checkSession().catch(() => { status.textContent = 'ارتباط با حساب IEAUM برقرار نشد.'; });
} else if (validOrigin && openerWindow && location.hash === '' && location.search === '') {
  window.addEventListener('message', event => {
    const data = event.data;
    if (ready || event.origin !== configured || event.source !== openerWindow || data?.type !== 'ieaum-live-code:offer') return;
    if (![data.transaction, data.boot, data.challenge].every(value => typeof value === 'string' && token.test(value))) return;
    ready = true;
    offer = {transaction: data.transaction, boot: data.boot, challenge: data.challenge};
    void checkSession().catch(() => { status.textContent = 'ارتباط با حساب IEAUM برقرار نشد.'; });
  });
  openerWindow.postMessage({type: 'ieaum-live-code:ready'}, configured);
  setTimeout(() => { if (!ready) status.textContent = 'ورود را از صفحهٔ اجرای زنده کد آغاز کنید.'; }, 5000);
} else status.textContent = 'ورود را از صفحهٔ اجرای زنده کد آغاز کنید.';

form.addEventListener('submit', async event => {
  event.preventDefault();
  if ((!offer && !signIn) || busy) return;
  busy = submit.disabled = true;
  try {
    const fields = new FormData(form);
    const response = await fetch(accountApi, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, signal: AbortSignal.timeout(12000),
      body: JSON.stringify({action: 'login', username: fields.get('username'), password: fields.get('password')}),
    });
    form.reset();
    if (!response.ok) {
      status.textContent = (await response.json()).error ?? 'ورود به حساب کامل نشد.';
      return;
    }
    await checkSession();
  } catch { status.textContent = 'ارتباط با حساب IEAUM برقرار نشد.'; }
  finally { busy = submit.disabled = false; }
});

allow.addEventListener('click', async event => {
  if (!event.isTrusted || !offer || busy) return;
  busy = allow.disabled = true;
  guidance.hidden = true;
  try {
    const response = await fetch('/api/live-code/grant', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(offer),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      if (response.status === 503 || response.status === 502 || response.status === 504) offline();
      else status.textContent = 'مجوز صادر نشد. از صفحهٔ اجرای زنده کد دوباره اقدام کنید.';
      return;
    }
    openerWindow.postMessage({type: 'ieaum-live-code:authorized', transaction: offer.transaction}, configured);
    window.close();
  } catch { offline(); }
  finally { busy = allow.disabled = false; }
});
