const TEAMS = {
  optimization: {
    id: "optimization",
    seatIndex: 0,
    // Bottom-Left
    name: "\u062A\u06CC\u0645 \u0628\u0647\u06CC\u0646\u0647\u200C\u0633\u0627\u0632\u06CC",
    shortName: "\u0628\u0647\u06CC\u0646\u0647\u200C\u0633\u0627\u0632\u06CC",
    dormName: "\u0628\u0647\u06CC\u0646\u0647\u200C\u0633\u0627\u0632\u06CC",
    botName: "\u0627\u0645\u06CC\u0631 \xB7 \u0628\u0647\u06CC\u0646\u0647\u200C\u0633\u0627\u0632\u06CC",
    motto: "\u0628\u0647\u062A\u0631\u06CC\u0646 \u0645\u0633\u06CC\u0631 \u0628\u06CC\u0646 \u0647\u0645\u0647\u0654 \u06AF\u0632\u06CC\u0646\u0647\u200C\u0647\u0627",
    color: "#D9383A",
    colorDark: "#991B1B",
    colorLight: "#FDE8E8",
    colorSoft: "#F8B4B4",
    ringColor: "#EF4444",
    textOnColor: "#FFFFFF"
  },
  projects: {
    id: "projects",
    seatIndex: 1,
    // Top-Left
    name: "\u062A\u06CC\u0645 \u06A9\u0646\u062A\u0631\u0644 \u067E\u0631\u0648\u0698\u0647",
    shortName: "\u06A9\u0646\u062A\u0631\u0644 \u067E\u0631\u0648\u0698\u0647",
    dormName: "\u06A9\u0646\u062A\u0631\u0644 \u067E\u0631\u0648\u0698\u0647",
    botName: "\u0633\u0627\u0631\u0627 \xB7 \u06A9\u0646\u062A\u0631\u0644 \u067E\u0631\u0648\u0698\u0647",
    motto: "\u062D\u0648\u0627\u0633\u0645 \u0628\u0647 \u0645\u0633\u06CC\u0631 \u0628\u062D\u0631\u0627\u0646\u06CC \u0647\u0633\u062A",
    color: "#2463EB",
    colorDark: "#1E40AF",
    colorLight: "#E8F0FE",
    colorSoft: "#93C5FD",
    ringColor: "#3B82F6",
    textOnColor: "#FFFFFF"
  },
  analytics: {
    id: "analytics",
    seatIndex: 2,
    // Top-Right
    name: "\u062A\u06CC\u0645 \u062A\u062D\u0644\u06CC\u0644 \u062F\u0627\u062F\u0647",
    shortName: "\u062A\u062D\u0644\u06CC\u0644 \u062F\u0627\u062F\u0647",
    dormName: "\u062A\u062D\u0644\u06CC\u0644 \u062F\u0627\u062F\u0647",
    botName: "\u0646\u06AF\u0627\u0631 \xB7 \u062A\u062D\u0644\u06CC\u0644 \u062F\u0627\u062F\u0647",
    motto: "\u0627\u0648\u0644 \u062F\u0627\u062F\u0647\u200C\u0647\u0627 \u0631\u0627 \u0628\u0631\u0631\u0633\u06CC \u0645\u06CC\u200C\u06A9\u0646\u0645",
    color: "#0D9468",
    colorDark: "#065F46",
    colorLight: "#E6F7F0",
    colorSoft: "#6EE7B7",
    ringColor: "#10B981",
    textOnColor: "#FFFFFF"
  },
  production: {
    id: "production",
    seatIndex: 3,
    // Bottom-Right
    name: "\u062A\u06CC\u0645 \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0631\u06CC\u0632\u06CC \u062A\u0648\u0644\u06CC\u062F",
    shortName: "\u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0631\u06CC\u0632\u06CC",
    dormName: "\u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0631\u06CC\u0632\u06CC",
    botName: "\u0645\u0647\u062F\u06CC \xB7 \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0631\u06CC\u0632\u06CC",
    motto: "\u0638\u0631\u0641\u06CC\u062A \u0647\u0631 \u0627\u06CC\u0633\u062A\u06AF\u0627\u0647 \u0631\u0627 \u062D\u0633\u0627\u0628 \u06A9\u0631\u062F\u0647\u200C\u0627\u0645",
    color: "#D9820B",
    colorDark: "#92400E",
    colorLight: "#FEF5E4",
    colorSoft: "#FCD34D",
    ringColor: "#F59E0B",
    textOnColor: "#FFFFFF"
  }
};
const TEAM_ORDER = [
  "optimization",
  "projects",
  "analytics",
  "production"
];
const TRACK_COORDS = [
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
  { row: 5, col: 0 }
];
const SEAT_START_INDICES = [30, 0, 10, 20];
const SEAT_HOME_COORDS = [
  // Seat 0 (Bottom-Left): enters from (10,5) going up col 5
  [
    { row: 9, col: 5 },
    { row: 8, col: 5 },
    { row: 7, col: 5 },
    { row: 6, col: 5 }
  ],
  // Seat 1 (Top-Left): enters from (5,0) going right row 5
  [
    { row: 5, col: 1 },
    { row: 5, col: 2 },
    { row: 5, col: 3 },
    { row: 5, col: 4 }
  ],
  // Seat 2 (Top-Right): enters from (0,5) going down col 5
  [
    { row: 1, col: 5 },
    { row: 2, col: 5 },
    { row: 3, col: 5 },
    { row: 4, col: 5 }
  ],
  // Seat 3 (Bottom-Right): enters from (5,10) going left row 5
  [
    { row: 5, col: 9 },
    { row: 5, col: 8 },
    { row: 5, col: 7 },
    { row: 5, col: 6 }
  ]
];
const SEAT_DORM_COORDS = [
  // Seat 0: Bottom-Left corner (rows 7..10, cols 0..3)
  [
    { row: 7.75, col: 0.75 },
    { row: 7.75, col: 2.25 },
    { row: 9.25, col: 0.75 },
    { row: 9.25, col: 2.25 }
  ],
  // Seat 1: Top-Left corner (rows 0..3, cols 0..3)
  [
    { row: 0.75, col: 0.75 },
    { row: 0.75, col: 2.25 },
    { row: 2.25, col: 0.75 },
    { row: 2.25, col: 2.25 }
  ],
  // Seat 2: Top-Right corner (rows 0..3, cols 7..10)
  [
    { row: 0.75, col: 7.75 },
    { row: 0.75, col: 9.25 },
    { row: 2.25, col: 7.75 },
    { row: 2.25, col: 9.25 }
  ],
  // Seat 3: Bottom-Right corner (rows 7..10, cols 7..10)
  [
    { row: 7.75, col: 7.75 },
    { row: 7.75, col: 9.25 },
    { row: 9.25, col: 7.75 },
    { row: 9.25, col: 9.25 }
  ]
];
const SAFE_TRACK_INDICES = [4, 14, 24, 34];
const CAMPUS_EVENT_INDICES = [6, 16, 26, 36];
const CAMPUS_EVENTS = [
  {
    id: "espresso",
    title: "\u0627\u0633\u067E\u0631\u0633\u0648 \u062F\u0628\u0644 \u0628\u0648\u0641\u0647!",
    description: "\u0627\u0646\u0631\u0698\u06CC \u06AF\u0631\u0641\u062A\u06CC\u060C \u06CC\u0647 \u0628\u0627\u0631 \u062F\u06CC\u06AF\u0647 \u062A\u0627\u0633 \u0628\u0646\u062F\u0627\u0632.",
    kind: "bonus_roll",
    stepDelta: 0,
    grantsExtraTurn: true
  },
  {
    id: "golden_notes",
    title: "\u062C\u0632\u0648\u0647 \u0637\u0644\u0627\u06CC\u06CC \u0634\u0628 \u0627\u0645\u062A\u062D\u0627\u0646!",
    description: "\u0645\u06CC\u0627\u0646\u200C\u0628\u0631 \u0632\u062F\u06CC \u0648 \u06F2 \u062E\u0627\u0646\u0647 \u062C\u0644\u0648 \u067E\u0631\u06CC\u062F\u06CC.",
    kind: "boost",
    stepDelta: 2,
    grantsExtraTurn: false
  },
  {
    id: "canceled_class",
    title: "\u0627\u0633\u062A\u0627\u062F \u06A9\u0644\u0627\u0633 \u0631\u0648 \u06A9\u0646\u0633\u0644 \u06A9\u0631\u062F!",
    description: "\u06F1 \u062E\u0627\u0646\u0647 \u062C\u0644\u0648 + \u06CC\u0647 \u062A\u0627\u0633 \u062C\u0627\u06CC\u0632\u0647.",
    kind: "bonus_roll",
    stepDelta: 1,
    grantsExtraTurn: true
  },
  {
    id: "morning_class",
    title: "\u06A9\u0644\u0627\u0633 \u06F8 \u0635\u0628\u062D \u062E\u0648\u0627\u0628 \u0645\u0648\u0646\u062F\u06CC!",
    description: "\u062F\u0648 \u062E\u0627\u0646\u0647 \u0628\u0631\u06AF\u0634\u062A\u06CC \u0639\u0642\u0628\u060C \u0639\u062C\u0644\u0647 \u06A9\u0646!",
    kind: "setback",
    stepDelta: -2,
    grantsExtraTurn: false
  },
  {
    id: "dorm_pizza",
    title: "\u067E\u06CC\u062A\u0632\u0627\u06CC \u062F\u0648\u0631\u0647\u0645\u06CC \u062E\u0648\u0627\u0628\u06AF\u0627\u0647!",
    description: "\u062D\u0627\u0644\u200C\u0648\u0647\u0648\u0627 \u0639\u0648\u0636 \u0634\u062F\u061B \u06CC\u0647 \u0628\u0627\u0631 \u062F\u06CC\u06AF\u0647 \u062A\u0627\u0633 \u0628\u0646\u062F\u0627\u0632.",
    kind: "bonus_roll",
    stepDelta: 0,
    grantsExtraTurn: true
  }
];
const PAWNS_PER_PLAYER = 4;
const TRACK_LENGTH = 40;
const HOME_LANE_LENGTH = 4;
const MAX_PROGRESS = TRACK_LENGTH + HOME_LANE_LENGTH - 1;
export {
  CAMPUS_EVENTS,
  CAMPUS_EVENT_INDICES,
  HOME_LANE_LENGTH,
  MAX_PROGRESS,
  PAWNS_PER_PLAYER,
  SAFE_TRACK_INDICES,
  SEAT_DORM_COORDS,
  SEAT_HOME_COORDS,
  SEAT_START_INDICES,
  TEAMS,
  TEAM_ORDER,
  TRACK_COORDS,
  TRACK_LENGTH
};
