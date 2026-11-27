import { TeamId, RuleMode } from '../../../portal/uniludo/constants';

export interface StoredPlayerStats {
  matchesPlayed: number;
  wins: number;
  totalCaptures: number;
  muted: boolean;
  lastFaculty: TeamId;
  lastPlayerCount: 2 | 3 | 4;
  lastVsBots: boolean;
  lastRuleMode: RuleMode;
}

const STORAGE_KEY = 'ieaum-uniludo-settings-v1';

const DEFAULT_STATS: StoredPlayerStats = {
  matchesPlayed: 0,
  wins: 0,
  totalCaptures: 0,
  muted: false,
  lastFaculty: 'optimization',
  lastPlayerCount: 4,
  lastVsBots: true,
  lastRuleMode: 'student',
};

export function loadStoredStats(): StoredPlayerStats {
  if (typeof window === 'undefined') return { ...DEFAULT_STATS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw) as Partial<StoredPlayerStats>;
    return {
      ...DEFAULT_STATS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export function saveStoredStats(stats: StoredPlayerStats): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Ignore storage quota errors
  }
}

export function toPersianDigits(value: number | string): string {
  const map = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(value).replace(/\d/g, (d) => map[Number(d)] ?? d);
}
