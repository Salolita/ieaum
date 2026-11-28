import type { MatchState, MoveOutcome, rollDice } from './rules';
import type { TeamId } from './constants';
export declare const uniLudoLabel = "\u0645\u0646\u0686 \u0635\u0646\u0627\u06CC\u0639";
export declare const uniLudoUrl = "https://ieaum.ir/uni-ludo/";
export declare const uniLudoBot = "https://t.me/ieaumbot?start=uniludo";
export declare const uniLudoTelegramOnly = "\u0628\u0631\u0627\u06CC \u0648\u0631\u0648\u062F \u0627\u0632 \u0631\u0628\u0627\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u0627\u0642\u062F\u0627\u0645 \u0646\u0645\u0627\u06CC\u06CC\u062F.\n\u0627\u06CC\u0646 \u0628\u0627\u0632\u06CC \u062F\u0631 \u0642\u0627\u0644\u0628 \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u062A\u0644\u06AF\u0631\u0627\u0645 \u0627\u0631\u0627\u0626\u0647 \u0634\u062F\u0647 \u0627\u0633\u062A.";
export interface RankedMatch {
    id: string;
    revision: number;
    state: MatchState;
}
export interface RankingRow {
    rank: number;
    name: string;
    points: number;
    games: number;
    wins: number;
    mine: boolean;
}
export type RankingSort = 'points' | 'wins' | 'games';
export type RoomMode = 'casual' | 'ranked';
export interface RoomSummary {
    id: string;
    title: string;
    capacity: 2 | 3 | 4;
    mode: RoomMode;
    status: 'waiting' | 'playing' | 'finished' | 'closed';
    count: number;
    owner: boolean;
    joined: boolean;
}
export interface RoomMember {
    team: TeamId;
    name: string;
}
export interface OnlineRoom extends RoomSummary {
    team: TeamId | null;
    members: RoomMember[];
    state: MatchState | null;
    revision: number;
}
export declare const roomIdPattern: RegExp;
export type RankedRoll = Omit<ReturnType<typeof rollDice>, 'nextState'>;
export type RankedMove = Omit<MoveOutcome, 'nextState'>;
