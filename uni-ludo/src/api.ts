import type { RankedMatch, RankedMove, RankedRoll, RankingRow } from '../../portal/uniludo/service';

export interface GameSession { token: string; name: string; match: RankedMatch | null; student: boolean }
export interface GameUpdate { match: RankedMatch; roll?: RankedRoll; move?: RankedMove }
export interface GameRanking { ranking: RankingRow[] }

export class GameError extends Error {
  constructor(message: string, readonly status: number, readonly match?: RankedMatch | null) { super(message); }
}

export async function gameRequest<T>(action: string, input: Record<string, unknown> = {}, token?: string, keepalive = false): Promise<T> {
  const response = await fetch('/uni-ludo/api', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})},
    credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000), keepalive,
    body: JSON.stringify({action, ...input}),
  }).catch(() => { throw new GameError('ارتباط با بازی برقرار نشد. دوباره تلاش کنید.', 503); });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new GameError(data?.error ?? 'بازی فعلاً در دسترس نیست.', response.status, data?.match);
  return data as T;
}
