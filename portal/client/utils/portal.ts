export class PortalRequestError extends Error {
  constructor(message: string, public readonly field?: string, public readonly code?: string) { super(message); }
}

export async function portal<T>(body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(location.pathname.startsWith('/account/') || location.pathname.startsWith('/panel/')
    ? '/api/account' : '/api/portal', body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : undefined).catch(() => { throw new PortalRequestError('ارتباط با سامانهٔ حساب‌ها قطع شد. اتصال اینترنت را بررسی و دوباره تلاش کنید.'); });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new PortalRequestError(data?.error ?? 'اتصال به سامانهٔ حساب‌ها برقرار نشد.', data?.field, data?.code);
  return data as T;
}
