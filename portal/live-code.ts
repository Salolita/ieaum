export const liveCodeLabel = 'اجرای زنده کد';
export const liveCodeUrl = 'https://livecode.ieaum.ir';
export const liveCodeOffline = 'این بخش توسط مدیر غیرفعال شده است.';

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
