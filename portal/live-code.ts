export const liveCodeLabel = 'اجرای زنده کد';
export const liveCodeUrl = 'https://livecode.ieaum.ir';
export const liveCodeOffline = 'سرور خاموش است یا این بخش توسط مدیر غیرفعال شده است.';
export const liveCodeContactUrl = 'https://ieaum.ir/contact/';

export async function liveCodeOnline() {
  try {
    const response = await fetch(liveCodeUrl + '/api/status', {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    });
    return response.ok && (await response.json())?.status === 'online';
  } catch {
    return false;
  }
}
