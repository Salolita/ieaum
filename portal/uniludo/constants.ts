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

export const TEAMS: Record<TeamId, TeamMeta> = {
  optimization: {
    id: 'optimization',
    seatIndex: 0, // Bottom-Left
    name: 'تیم بهینه‌سازی',
    shortName: 'بهینه‌سازی',
    dormName: 'بهینه‌سازی',
    botName: 'امیر · بهینه‌سازی',
    motto: 'بهترین مسیر بین همهٔ گزینه‌ها',
    color: '#D9383A',
    colorDark: '#991B1B',
    colorLight: '#FDE8E8',
    colorSoft: '#F8B4B4',
    ringColor: '#EF4444',
    textOnColor: '#FFFFFF',
  },
  projects: {
    id: 'projects',
    seatIndex: 1, // Top-Left
    name: 'تیم کنترل پروژه',
    shortName: 'کنترل پروژه',
    dormName: 'کنترل پروژه',
    botName: 'سارا · کنترل پروژه',
    motto: 'حواسم به مسیر بحرانی هست',
    color: '#2463EB',
    colorDark: '#1E40AF',
    colorLight: '#E8F0FE',
    colorSoft: '#93C5FD',
    ringColor: '#3B82F6',
    textOnColor: '#FFFFFF',
  },
  analytics: {
    id: 'analytics',
    seatIndex: 2, // Top-Right
    name: 'تیم تحلیل داده',
    shortName: 'تحلیل داده',
    dormName: 'تحلیل داده',
    botName: 'نگار · تحلیل داده',
    motto: 'اول داده‌ها را بررسی می‌کنم',
    color: '#0D9468',
    colorDark: '#065F46',
    colorLight: '#E6F7F0',
    colorSoft: '#6EE7B7',
    ringColor: '#10B981',
    textOnColor: '#FFFFFF',
  },
  production: {
    id: 'production',
    seatIndex: 3, // Bottom-Right
    name: 'تیم برنامه‌ریزی تولید',
    shortName: 'برنامه‌ریزی',
    dormName: 'برنامه‌ریزی',
    botName: 'مهدی · برنامه‌ریزی',
    motto: 'ظرفیت هر ایستگاه را حساب کرده‌ام',
    color: '#D9820B',
    colorDark: '#92400E',
    colorLight: '#FEF5E4',
    colorSoft: '#FCD34D',
    ringColor: '#F59E0B',
    textOnColor: '#FFFFFF',
  },
};

export const TEAM_ORDER: TeamId[] = [
  'optimization',
  'projects',
  'analytics',
  'production',
];

/**
 * 11x11 Classic Iranian Mench outer track (40 unique cells, clockwise).
 * Index 0 starts at Top-Left arm (4, 0) and loops clockwise back to (5, 0) at index 39.
 */
export const TRACK_COORDS: readonly GridCoord[] = [
  // 0..4: Top-Left horizontal arm going right
  { row: 4, col: 0 },
  { row: 4, col: 1 },
  { row: 4, col: 2 },
  { row: 4, col: 3 },
  { row: 4, col: 4 },
  // 5..8: Top arm left column going up
  { row: 3, col: 4 },
  { row: 2, col: 4 },
  { row: 1, col: 4 },
  { row: 0, col: 4 },
  // 9..10: Top edge going right
  { row: 0, col: 5 },
  { row: 0, col: 6 },
  // 11..14: Top arm right column going down
  { row: 1, col: 6 },
  { row: 2, col: 6 },
  { row: 3, col: 6 },
  { row: 4, col: 6 },
  // 15..18: Right arm top row going right
  { row: 4, col: 7 },
  { row: 4, col: 8 },
  { row: 4, col: 9 },
  { row: 4, col: 10 },
  // 19..20: Right edge going down
  { row: 5, col: 10 },
  { row: 6, col: 10 },
  // 21..24: Right arm bottom row going left
  { row: 6, col: 9 },
  { row: 6, col: 8 },
  { row: 6, col: 7 },
  { row: 6, col: 6 },
  // 25..28: Bottom arm right column going down
  { row: 7, col: 6 },
  { row: 8, col: 6 },
  { row: 9, col: 6 },
  { row: 10, col: 6 },
  // 29..30: Bottom edge going left
  { row: 10, col: 5 },
  { row: 10, col: 4 },
  // 31..34: Bottom arm left column going up
  { row: 9, col: 4 },
  { row: 8, col: 4 },
  { row: 7, col: 4 },
  { row: 6, col: 4 },
  // 35..38: Left arm bottom row going left
  { row: 6, col: 3 },
  { row: 6, col: 2 },
  { row: 6, col: 1 },
  { row: 6, col: 0 },
  // 39: Left edge going up
  { row: 5, col: 0 },
];

/**
 * Seat index -> starting global track index:
 * Seat 0 (Bottom-Left / Human primary): index 30 at (10, 4)
 * Seat 1 (Top-Left): index 0 at (4, 0)
 * Seat 2 (Top-Right): index 10 at (0, 6)
 * Seat 3 (Bottom-Right): index 20 at (6, 10)
 */
export const SEAT_START_INDICES: readonly number[] = [30, 0, 10, 20];

/**
 * Seat index -> 4 graduation home-lane coordinates (progress 40..43).
 */
export const SEAT_HOME_COORDS: readonly (readonly GridCoord[])[] = [
  // Seat 0 (Bottom-Left): enters from (10,5) going up col 5
  [
    { row: 9, col: 5 },
    { row: 8, col: 5 },
    { row: 7, col: 5 },
    { row: 6, col: 5 },
  ],
  // Seat 1 (Top-Left): enters from (5,0) going right row 5
  [
    { row: 5, col: 1 },
    { row: 5, col: 2 },
    { row: 5, col: 3 },
    { row: 5, col: 4 },
  ],
  // Seat 2 (Top-Right): enters from (0,5) going down col 5
  [
    { row: 1, col: 5 },
    { row: 2, col: 5 },
    { row: 3, col: 5 },
    { row: 4, col: 5 },
  ],
  // Seat 3 (Bottom-Right): enters from (5,10) going left row 5
  [
    { row: 5, col: 9 },
    { row: 5, col: 8 },
    { row: 5, col: 7 },
    { row: 5, col: 6 },
  ],
];

/**
 * Seat index -> 4 dorm base pad coordinates (progress === -1).
 */
export const SEAT_DORM_COORDS: readonly (readonly GridCoord[])[] = [
  // Seat 0: Bottom-Left corner (rows 7..10, cols 0..3)
  [
    { row: 7.75, col: 0.75 },
    { row: 7.75, col: 2.25 },
    { row: 9.25, col: 0.75 },
    { row: 9.25, col: 2.25 },
  ],
  // Seat 1: Top-Left corner (rows 0..3, cols 0..3)
  [
    { row: 0.75, col: 0.75 },
    { row: 0.75, col: 2.25 },
    { row: 2.25, col: 0.75 },
    { row: 2.25, col: 2.25 },
  ],
  // Seat 2: Top-Right corner (rows 0..3, cols 7..10)
  [
    { row: 0.75, col: 7.75 },
    { row: 0.75, col: 9.25 },
    { row: 2.25, col: 7.75 },
    { row: 2.25, col: 9.25 },
  ],
  // Seat 3: Bottom-Right corner (rows 7..10, cols 7..10)
  [
    { row: 7.75, col: 7.75 },
    { row: 7.75, col: 9.25 },
    { row: 9.25, col: 7.75 },
    { row: 9.25, col: 9.25 },
  ],
];

/**
 * Safe Library squares (کتابخانه) where pawns cannot be captured.
 * Located symmetrically at the 4 inner corners: (4,4), (4,6), (6,6), (6,4).
 */
export const SAFE_TRACK_INDICES: readonly number[] = [4, 14, 24, 34];

/**
 * Campus Event squares (اتفاق ترم) active in 'student' rule mode.
 * Located symmetrically mid-arm: (2,4), (4,8), (8,6), (6,2).
 */
export const CAMPUS_EVENT_INDICES: readonly number[] = [6, 16, 26, 36];

export interface CampusEventSpec {
  id: string;
  title: string;
  description: string;
  kind: 'bonus_roll' | 'boost' | 'setback';
  stepDelta: number;
  grantsExtraTurn: boolean;
}

export const CAMPUS_EVENTS: readonly CampusEventSpec[] = [
  {
    id: 'espresso',
    title: 'اسپرسو دبل بوفه!',
    description: 'انرژی گرفتی، یه بار دیگه تاس بنداز.',
    kind: 'bonus_roll',
    stepDelta: 0,
    grantsExtraTurn: true,
  },
  {
    id: 'golden_notes',
    title: 'جزوه طلایی شب امتحان!',
    description: 'میان‌بر زدی و ۲ خانه جلو پریدی.',
    kind: 'boost',
    stepDelta: 2,
    grantsExtraTurn: false,
  },
  {
    id: 'canceled_class',
    title: 'استاد کلاس رو کنسل کرد!',
    description: '۱ خانه جلو + یه تاس جایزه.',
    kind: 'bonus_roll',
    stepDelta: 1,
    grantsExtraTurn: true,
  },
  {
    id: 'morning_class',
    title: 'کلاس ۸ صبح خواب موندی!',
    description: 'دو خانه برگشتی عقب، عجله کن!',
    kind: 'setback',
    stepDelta: -2,
    grantsExtraTurn: false,
  },
  {
    id: 'dorm_pizza',
    title: 'پیتزای دورهمی خوابگاه!',
    description: 'حال‌وهوا عوض شد؛ یه بار دیگه تاس بنداز.',
    kind: 'bonus_roll',
    stepDelta: 0,
    grantsExtraTurn: true,
  },
];

export const PAWNS_PER_PLAYER = 4;
export const TRACK_LENGTH = 40;
export const HOME_LANE_LENGTH = 4;
export const MAX_PROGRESS = TRACK_LENGTH + HOME_LANE_LENGTH - 1; // 43
