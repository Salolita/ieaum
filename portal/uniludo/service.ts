import type { MatchState, MoveOutcome, rollDice } from './rules';

export const uniLudoLabel = 'منچ صنایع';
export const uniLudoUrl = 'https://ieaum.ir/uni-ludo/';
export const uniLudoBot = 'https://t.me/ieaumbot?start=uniludo';
export const uniLudoTelegramOnly = 'برای ورود از ربات تلگرام اقدام نمایید.\nاین بازی در قالب مینی‌اپ تلگرام ارائه شده است.';

export interface RankedMatch { id: string; revision: number; state: MatchState }
export interface RankingRow { rank: number; username: string; points: number; games: number; wins: number; mine: boolean }
export type RankedRoll = Omit<ReturnType<typeof rollDice>, 'nextState'>;
export type RankedMove = Omit<MoveOutcome, 'nextState'>;
