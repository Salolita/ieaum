import { CampusEventSpec, TeamId, GridCoord, RuleMode } from './constants.js';
export interface GameConfig {
    playerCount: 2 | 3 | 4;
    vsBots: boolean;
    ruleMode: RuleMode;
    humanTeam: TeamId;
}
export interface PawnState {
    id: string;
    playerId: number;
    pawnIndex: number;
    /**
     * -1 = in dorm (خوابگاه)
     * 0..39 = on main outer track (0 is player's start cell, 39 is last cell before home)
     * 40..43 = in graduation home lane (فارغ‌التحصیلی)
     */
    progress: number;
}
export interface PlayerState {
    id: number;
    teamId: TeamId;
    name: string;
    isBot: boolean;
    captures: number;
    eventsTriggered: number;
    finishRank: number | null;
}
export interface MatchState {
    config: GameConfig;
    players: PlayerState[];
    pawns: PawnState[];
    activePlayerIndex: number;
    phase: 'awaiting_roll' | 'awaiting_move' | 'finished';
    diceValue: number | null;
    consecutiveSixes: number;
    dormRollAttempts: number;
    turnCount: number;
    winnerId: number | null;
    lastEvent: {
        event: CampusEventSpec;
        playerId: number;
        turn: number;
    } | null;
}
export interface LegalMove {
    pawnId: string;
    playerId: number;
    fromProgress: number;
    toProgress: number;
    isExitDorm: boolean;
    isGraduation: boolean;
    capturedPawnIds: string[];
    triggersEventTile: boolean;
    landsOnSafeTile: boolean;
}
export interface MoveOutcome {
    nextState: MatchState;
    move: LegalMove;
    pathCoords: GridCoord[];
    capturedPawns: PawnState[];
    campusEvent: CampusEventSpec | null;
    extraTurnGranted: boolean;
    extraTurnReason: 'six' | 'capture' | 'campus_event' | null;
    winnerId: number | null;
}
/**
 * Converts a player's seat index and track progress (0..39) to global track index (0..39).
 */
export declare function getGlobalTrackIndex(seatIndex: number, progress: number): number | null;
/**
 * Returns visual 11x11 grid coordinates for any pawn state.
 */
export declare function getPawnCoords(pawn: PawnState): GridCoord;
export declare function isSafeTrackIndex(trackIndex: number): boolean;
export declare function isCampusEventIndex(trackIndex: number, ruleMode: RuleMode): boolean;
/**
 * Builds seat-ordered players so Human is always at Seat 0 (Bottom-Left) with their chosen faculty.
 * For 2 players, opponent sits diagonally opposite at Seat 2 (Top-Right).
 */
export declare function createInitialMatch(config: GameConfig, customHumanName?: string): MatchState;
export declare function getActivePlayer(state: MatchState): PlayerState;
export declare function getGraduatedCount(pawns: PawnState[], playerId: number): number;
export declare function hasNoActiveTrackPawns(pawns: PawnState[], playerId: number): boolean;
/**
 * Computes all legal moves for `playerId` given `diceValue` (1..6).
 * Rules:
 * - Dorm exit requires a 6 (progress -1 -> 0).
 * - Cannot overshoot MAX_PROGRESS (43).
 * - Cannot land on a cell already occupied by your own pawn (both track & home lane).
 * - Landing on an opponent on a non-safe track cell captures them.
 */
export declare function getLegalMoves(state: MatchState, playerId: number, diceValue: number): LegalMove[];
/**
 * Rolls the die and transitions state to 'awaiting_move' or auto-passes turn if no legal move exists.
 * Follows authentic Iranian Mench: if all remaining ungraduated pawns are in the dorm,
 * the player gets up to 3 rolls in a turn to roll a 6.
 */
export declare function rollDice(state: MatchState, forcedValue?: number, rng?: () => number): {
    nextState: MatchState;
    diceValue: number;
    legalMoves: LegalMove[];
    autoPassed: boolean;
    dormRetryLeft: number;
};
/**
 * Applies a chosen legal move, resolves captures and Campus Events, checks victory, and sets next turn.
 */
export declare function applyMove(state: MatchState, move: LegalMove, rng?: () => number): MoveOutcome;
/**
 * Tactical AI heuristic for university bot opponents.
 */
export declare function chooseBotMove(state: MatchState, playerId: number, diceValue: number): LegalMove | null;
/**
 * Computes leaderboard standings sorted by graduated pawns, total progress, and captures.
 */
export declare function getStandings(state: MatchState): Array<{
    player: PlayerState;
    graduated: number;
    totalProgress: number;
}>;
