export type TeamId = 'optimization' | 'projects' | 'analytics' | 'production';
export type RuleMode = 'student' | 'classic';
export interface GridCoord {
    row: number;
    col: number;
}
export interface TeamMeta {
    id: TeamId;
    seatIndex: number;
    name: string;
    shortName: string;
    dormName: string;
    botName: string;
    motto: string;
    color: string;
    colorDark: string;
    colorLight: string;
    colorSoft: string;
    ringColor: string;
    textOnColor: string;
}
export declare const TEAMS: Record<TeamId, TeamMeta>;
export declare const TEAM_ORDER: TeamId[];
/**
 * 11x11 Classic Iranian Mench outer track (40 unique cells, clockwise).
 * Index 0 starts at Top-Left arm (4, 0) and loops clockwise back to (5, 0) at index 39.
 */
export declare const TRACK_COORDS: readonly GridCoord[];
/**
 * Seat index -> starting global track index:
 * Seat 0 (Bottom-Left / Human primary): index 30 at (10, 4)
 * Seat 1 (Top-Left): index 0 at (4, 0)
 * Seat 2 (Top-Right): index 10 at (0, 6)
 * Seat 3 (Bottom-Right): index 20 at (6, 10)
 */
export declare const SEAT_START_INDICES: readonly number[];
/**
 * Seat index -> 4 graduation home-lane coordinates (progress 40..43).
 */
export declare const SEAT_HOME_COORDS: readonly (readonly GridCoord[])[];
/**
 * Seat index -> 4 dorm base pad coordinates (progress === -1).
 */
export declare const SEAT_DORM_COORDS: readonly (readonly GridCoord[])[];
/**
 * Safe Library squares (کتابخانه) where pawns cannot be captured.
 * Located symmetrically at the 4 inner corners: (4,4), (4,6), (6,6), (6,4).
 */
export declare const SAFE_TRACK_INDICES: readonly number[];
/**
 * Campus Event squares (اتفاق ترم) active in 'student' rule mode.
 * Located symmetrically mid-arm: (2,4), (4,8), (8,6), (6,2).
 */
export declare const CAMPUS_EVENT_INDICES: readonly number[];
export interface CampusEventSpec {
    id: string;
    title: string;
    description: string;
    kind: 'bonus_roll' | 'boost' | 'setback';
    stepDelta: number;
    grantsExtraTurn: boolean;
}
export declare const CAMPUS_EVENTS: readonly CampusEventSpec[];
export declare const PAWNS_PER_PLAYER = 4;
export declare const TRACK_LENGTH = 40;
export declare const HOME_LANE_LENGTH = 4;
export declare const MAX_PROGRESS: number;
