import type { MatchState, MoveOutcome, rollDice } from './rules';
import type { TeamId } from './constants';

export const uniLudoLabel = 'منچ صنایع';
export const uniLudoUrl = 'https://ieaum.ir/uni-ludo/';
export const uniLudoBot = 'https://t.me/ieaumbot?start=uniludo';
export const uniLudoTelegramOnly = 'برای ورود از ربات تلگرام اقدام نمایید.\nاین بازی در قالب مینی‌اپ تلگرام ارائه شده است.';

export interface RankedMatch { id: string; revision: number; state: MatchState }
export interface RankingRow { rank: number; name: string; points: number; games: number; wins: number; mine: boolean }
export type RankingSort = 'points' | 'wins' | 'games';
export type RoomMode = 'casual' | 'ranked';
export interface RoomSummary {
  id: string; title: string; capacity: 2 | 3 | 4; mode: RoomMode;
  status: 'waiting' | 'playing' | 'finished' | 'closed'; count: number; owner: boolean; joined: boolean;
}
export interface RoomMember { team: TeamId; name: string }
export interface OnlineRoom extends RoomSummary {
  team: TeamId | null; members: RoomMember[]; state: MatchState | null; revision: number;
}
export const roomIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
export type RankedRoll = Omit<ReturnType<typeof rollDice>, 'nextState'>;
export type RankedMove = Omit<MoveOutcome, 'nextState'>;
