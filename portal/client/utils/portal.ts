export class PortalRequestError extends Error {
  constructor(message: string, public readonly field?: string, public readonly code?: string) { super(message); }
}

export async function portal<T>(body?: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/portal', body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : undefined).catch(() => { throw new PortalRequestError('ارتباط با نامرالب قطع شد. اتصال اینترنت را بررسی کنید و دوباره بزنید.'); });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new PortalRequestError(data?.error ?? 'اتصال به سامانهٔ حساب‌ها برقرار نشد.', data?.field, data?.code);
  return data as T;
}
