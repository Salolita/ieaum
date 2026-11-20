import { digest, PortalError, query, rpc, token, write } from './portal-store.js';

export const availableRoom = () => ({ or: `(expires_at.is.null,expires_at.gt.${new Date().toISOString()})` });

export async function ownedPresentations(owner: string, id?: string, includeLink = false) {
  return query<{ id: string; title: string; caption: string; expires_at: string | null; published: boolean; page_count: number; furthest: number; join_code?: string }[]>('erae_rooms', {
    ...availableRoom(), owner_id: `eq.${owner}`, select: `id,title,caption,expires_at,published,page_count,furthest:body->furthest${includeLink ? ',join_code' : ''}`, order: 'created_at.desc',
    ...(id ? { id: `eq.${id}` } : {}),
  });
}

export async function rotatePresentationCode(owner: string, id: string) {
  const code = token();
  if (!await rpc<boolean>('portal_rotate_presentation_code', { p_owner:owner, p_room:id, p_digest:digest(code) })) {
    throw new PortalError(404, 'این ارائه در دسترس نیست.');
  }
  return code;
}

export function retention(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (value === 3 || value === '3') return 3;
  if (value === 5 || value === '5') return 5;
  throw new PortalError(422, 'زمان حذف خودکار باید ۳ یا ۵ روز باشد.');
}

export function expiration(value: unknown) {
  const days = retention(value);
  return days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString();
}

export function editPresentation(owner: string, id: string, values: { title?: string; caption?: string; expires_at?: string | null }) {
  return write<unknown[]>('erae_rooms', 'PATCH', values, { ...availableRoom(), id: `eq.${id}`, owner_id: `eq.${owner}`, select: 'id' });
}

export function deletePresentation(owner: string, id: string) {
  return write<unknown[]>('erae_rooms', 'DELETE', undefined, { id: `eq.${id}`, owner_id: `eq.${owner}`, select: 'id' });
}
