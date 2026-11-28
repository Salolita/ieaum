import {
  CAMPUS_EVENTS,
  CAMPUS_EVENT_INDICES,
  CampusEventSpec,
  TEAMS,
  TEAM_ORDER,
  TeamId,
  GridCoord,
  MAX_PROGRESS,
  PAWNS_PER_PLAYER,
  RuleMode,
  SAFE_TRACK_INDICES,
  SEAT_DORM_COORDS,
  SEAT_HOME_COORDS,
  SEAT_START_INDICES,
  TRACK_COORDS,
  TRACK_LENGTH,
} from './constants.js';

export interface GameConfig {
  playerCount: 2 | 3 | 4;
  vsBots: boolean;
  ruleMode: RuleMode;
  humanTeam: TeamId;
  botDifficulty?: 'easy' | 'normal' | 'hard';
}

export interface PawnState {
  id: string;
  playerId: number; // 0..3 (matches seatIndex)
  pawnIndex: number; // 0..3
  /**
   * -1 = in dorm (خوابگاه)
   * 0..39 = on main outer track (0 is player's start cell, 39 is last cell before home)
   * 40..43 = in graduation home lane (فارغ‌التحصیلی)
   */
  progress: number;
}

export interface PlayerState {
  id: number; // seat index 0..3
  teamId: TeamId;
  name: string;
  isBot: boolean;
  captures: number;
  eventsTriggered: number;
  finishRank: number | null; // 1 = winner
}

export interface MatchState {
  config: GameConfig;
  playForPlaces?: boolean;
  players: PlayerState[];
  pawns: PawnState[];
  activePlayerIndex: number; // index into `players` array
  phase: 'awaiting_roll' | 'awaiting_move' | 'finished';
  diceValue: number | null;
  consecutiveSixes: number;
  dormRollAttempts: number; // authentic Iranian Mench: up to 3 tries when all ungraduated pawns are in dorm
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
export function getGlobalTrackIndex(seatIndex: number, progress: number): number | null {
  if (progress < 0 || progress >= TRACK_LENGTH) return null;
  return (SEAT_START_INDICES[seatIndex] + progress) % TRACK_LENGTH;
}

/**
 * Returns visual 11x11 grid coordinates for any pawn state.
 */
export function getPawnCoords(pawn: PawnState): GridCoord {
  if (pawn.progress === -1) {
    return SEAT_DORM_COORDS[pawn.playerId][pawn.pawnIndex];
  }
  if (pawn.progress >= TRACK_LENGTH) {
    const homeIdx = Math.min(pawn.progress - TRACK_LENGTH, 3);
    return SEAT_HOME_COORDS[pawn.playerId][homeIdx];
  }
  const trackIdx = getGlobalTrackIndex(pawn.playerId, pawn.progress)!;
  return TRACK_COORDS[trackIdx];
}

export function isSafeTrackIndex(trackIndex: number): boolean {
  return SAFE_TRACK_INDICES.includes(trackIndex);
}

export function isCampusEventIndex(trackIndex: number, ruleMode: RuleMode): boolean {
  return ruleMode === 'student' && CAMPUS_EVENT_INDICES.includes(trackIndex);
}

/**
 * Builds seat-ordered players so Human is always at Seat 0 (Bottom-Left) with their chosen faculty.
 * For 2 players, opponent sits diagonally opposite at Seat 2 (Top-Right).
 */
export function createInitialMatch(
  config: GameConfig,
  customHumanName?: string
): MatchState {
  const chosenFaculty = config.humanTeam;
  const remainingFaculties = TEAM_ORDER.filter((f) => f !== chosenFaculty);
  const facultySequence: TeamId[] = [chosenFaculty, ...remainingFaculties];

  const activeSeats: number[] =
    config.playerCount === 2
      ? [0, 2]
      : config.playerCount === 3
        ? [0, 1, 2]
        : [0, 1, 2, 3];

  const players: PlayerState[] = activeSeats.map((seatId, idx) => {
    const teamId = facultySequence[idx];
    const meta = TEAMS[teamId];
    const isHuman = idx === 0 || !config.vsBots;
    let displayName: string;
    if (idx === 0 && customHumanName && customHumanName.trim().length > 0) {
      displayName = customHumanName.trim();
    } else if (isHuman) {
      displayName = config.vsBots ? 'شما' : `بازیکن ${idx + 1} (${meta.shortName})`;
    } else {
      displayName = meta.botName;
    }

    return {
      id: seatId,
      teamId,
      name: displayName,
      isBot: !isHuman,
      captures: 0,
      eventsTriggered: 0,
      finishRank: null,
    };
  });

  const pawns: PawnState[] = [];
  for (const player of players) {
    for (let i = 0; i < PAWNS_PER_PLAYER; i++) {
      pawns.push({
        id: `p${player.id}_pawn${i}`,
        playerId: player.id,
        pawnIndex: i,
        progress: -1,
      });
    }
  }

  return {
    config,
    players,
    pawns,
    activePlayerIndex: 0,
    phase: 'awaiting_roll',
    diceValue: null,
    consecutiveSixes: 0,
    dormRollAttempts: 0,
    turnCount: 1,
    winnerId: null,
    lastEvent: null,
  };
}

export function getActivePlayer(state: MatchState): PlayerState {
  return state.players[state.activePlayerIndex];
}

function nextUnfinished(players: PlayerState[], active: number) {
  for (let step = 1; step <= players.length; step++) {
    const index = (active + step) % players.length;
    if (!players[index].finishRank) return index;
  }
  return active;
}

export function getGraduatedCount(pawns: PawnState[], playerId: number): number {
  return pawns.filter((p) => p.playerId === playerId && p.progress >= TRACK_LENGTH).length;
}

export function hasNoActiveTrackPawns(pawns: PawnState[], playerId: number): boolean {
  const owned = pawns.filter((p) => p.playerId === playerId);
  const onTrack = owned.some((p) => p.progress >= 0 && p.progress < TRACK_LENGTH);
  const inDorm = owned.some((p) => p.progress === -1);
  return !onTrack && inDorm;
}

/**
 * Computes all legal moves for `playerId` given `diceValue` (1..6).
 * Rules:
 * - Dorm exit requires a 6 (progress -1 -> 0).
 * - Cannot overshoot MAX_PROGRESS (43).
 * - Cannot land on a cell already occupied by your own pawn (both track & home lane).
 * - Landing on an opponent on a non-safe track cell captures them.
 */
export function getLegalMoves(
  state: MatchState,
  playerId: number,
  diceValue: number
): LegalMove[] {
  const playerPawns = state.pawns.filter((p) => p.playerId === playerId);
  const moves: LegalMove[] = [];

  for (const pawn of playerPawns) {
    let targetProgress: number | null = null;
    let isExitDorm = false;

    if (pawn.progress === -1) {
      if (diceValue === 6) {
        targetProgress = 0;
        isExitDorm = true;
      }
    } else {
      const candidate = pawn.progress + diceValue;
      if (candidate <= MAX_PROGRESS) {
        targetProgress = candidate;
      }
    }

    if (targetProgress === null) continue;

    // Cannot land on own pawn
    const occupiedBySelf = playerPawns.some(
      (other) => other.id !== pawn.id && other.progress === targetProgress
    );
    if (occupiedBySelf) continue;

    let capturedPawnIds: string[] = [];
    let triggersEventTile = false;
    let landsOnSafeTile = false;

    if (targetProgress < TRACK_LENGTH) {
      const targetTrackIdx = getGlobalTrackIndex(playerId, targetProgress)!;
      landsOnSafeTile = isSafeTrackIndex(targetTrackIdx);
      triggersEventTile = isCampusEventIndex(targetTrackIdx, state.config.ruleMode);

      if (!landsOnSafeTile) {
        capturedPawnIds = state.pawns
          .filter((other) => {
            if (other.playerId === playerId) return false;
            if (other.progress < 0 || other.progress >= TRACK_LENGTH) return false;
            return getGlobalTrackIndex(other.playerId, other.progress) === targetTrackIdx;
          })
          .map((p) => p.id);
      }
    }

    moves.push({
      pawnId: pawn.id,
      playerId,
      fromProgress: pawn.progress,
      toProgress: targetProgress,
      isExitDorm,
      isGraduation: pawn.progress < TRACK_LENGTH && targetProgress >= TRACK_LENGTH,
      capturedPawnIds,
      triggersEventTile,
      landsOnSafeTile,
    });
  }

  return moves;
}

/**
 * Rolls the die and transitions state to 'awaiting_move' or auto-passes turn if no legal move exists.
 * Follows authentic Iranian Mench: if all remaining ungraduated pawns are in the dorm,
 * the player gets up to 3 rolls in a turn to roll a 6.
 */
export function rollDice(
  state: MatchState,
  forcedValue?: number,
  rng: () => number = Math.random
): {
  nextState: MatchState;
  diceValue: number;
  legalMoves: LegalMove[];
  autoPassed: boolean;
  dormRetryLeft: number;
} {
  if (state.phase !== 'awaiting_roll') {
    return {
      nextState: state,
      diceValue: state.diceValue ?? 1,
      legalMoves: [],
      autoPassed: false,
      dormRetryLeft: 0,
    };
  }

  const diceValue =
    forcedValue !== undefined
      ? Math.max(1, Math.min(6, Math.round(forcedValue)))
      : Math.floor(rng() * 6) + 1;

  const activePlayer = getActivePlayer(state);
  const legalMoves = getLegalMoves(state, activePlayer.id, diceValue);

  if (legalMoves.length === 0) {
    const eligibleForDormRetry = hasNoActiveTrackPawns(state.pawns, activePlayer.id);
    const nextAttempt = state.dormRollAttempts + 1;

    if (eligibleForDormRetry && nextAttempt < 3) {
      return {
        nextState: {
          ...state,
          diceValue,
          phase: 'awaiting_roll',
          dormRollAttempts: nextAttempt,
        },
        diceValue,
        legalMoves: [],
        autoPassed: false,
        dormRetryLeft: 3 - nextAttempt,
      };
    }

    // No legal moves left: pass turn
    const nextIdx = nextUnfinished(state.players, state.activePlayerIndex);
    return {
      nextState: {
        ...state,
        diceValue,
        activePlayerIndex: nextIdx,
        phase: 'awaiting_roll',
        consecutiveSixes: 0,
        dormRollAttempts: 0,
        turnCount: state.turnCount + 1,
      },
      diceValue,
      legalMoves: [],
      autoPassed: true,
      dormRetryLeft: 0,
    };
  }

  return {
    nextState: {
      ...state,
      diceValue,
      phase: 'awaiting_move',
      consecutiveSixes: diceValue === 6 ? state.consecutiveSixes + 1 : 0,
      dormRollAttempts: 0,
    },
    diceValue,
    legalMoves,
    autoPassed: false,
    dormRetryLeft: 0,
  };
}

/**
 * Builds step-by-step grid coordinates for smooth hop animation.
 */
function buildMovePath(pawn: PawnState, toProgress: number): GridCoord[] {
  if (pawn.progress === -1) {
    return [getPawnCoords({ ...pawn, progress: 0 })];
  }
  const coords: GridCoord[] = [];
  const step = toProgress >= pawn.progress ? 1 : -1;
  for (let p = pawn.progress + step; step > 0 ? p <= toProgress : p >= toProgress; p += step) {
    coords.push(getPawnCoords({ ...pawn, progress: p }));
  }
  return coords;
}

/**
 * Applies a chosen legal move, resolves captures and Campus Events, checks victory, and sets next turn.
 */
export function applyMove(
  state: MatchState,
  move: LegalMove,
  rng: () => number = Math.random
): MoveOutcome {
  const movingPawn = state.pawns.find((p) => p.id === move.pawnId);
  if (!movingPawn) {
    throw new Error(`Pawn not found: ${move.pawnId}`);
  }

  const pathCoords = buildMovePath(movingPawn, move.toProgress);
  const capturedPawns: PawnState[] = [];

  let updatedPawns = state.pawns.map((p) => {
    if (p.id === move.pawnId) {
      return { ...p, progress: move.toProgress };
    }
    if (move.capturedPawnIds.includes(p.id)) {
      capturedPawns.push(p);
      return { ...p, progress: -1 };
    }
    return p;
  });

  // Resolve Campus Event if landed on one in Student mode
  let campusEvent: CampusEventSpec | null = null;
  if (move.triggersEventTile && state.config.ruleMode === 'student') {
    const eventIdx = Math.floor(rng() * CAMPUS_EVENTS.length) % CAMPUS_EVENTS.length;
    campusEvent = CAMPUS_EVENTS[eventIdx];

    if (campusEvent.stepDelta !== 0) {
      const currentPawn = updatedPawns.find((p) => p.id === move.pawnId)!;
      const adjusted = Math.max(0, Math.min(TRACK_LENGTH - 1, currentPawn.progress + campusEvent.stepDelta));
      const blockedBySelf = updatedPawns.some(
        (other) => other.id !== currentPawn.id && other.playerId === currentPawn.playerId && other.progress === adjusted
      );
      if (!blockedBySelf && adjusted !== currentPawn.progress) {
        const extraPath = buildMovePath(currentPawn, adjusted);
        pathCoords.push(...extraPath);

        const adjTrackIdx = getGlobalTrackIndex(currentPawn.playerId, adjusted)!;
        const adjSafe = isSafeTrackIndex(adjTrackIdx);

        updatedPawns = updatedPawns.map((p) => {
          if (p.id === currentPawn.id) {
            return { ...p, progress: adjusted };
          }
          if (
            !adjSafe &&
            p.playerId !== currentPawn.playerId &&
            p.progress >= 0 &&
            p.progress < TRACK_LENGTH &&
            getGlobalTrackIndex(p.playerId, p.progress) === adjTrackIdx
          ) {
            capturedPawns.push(p);
            return { ...p, progress: -1 };
          }
          return p;
        });
      }
    }
  }

  const updatedPlayers = state.players.map((pl) => {
    if (pl.id !== move.playerId) return pl;
    return {
      ...pl,
      captures: pl.captures + capturedPawns.length,
      eventsTriggered: pl.eventsTriggered + (campusEvent ? 1 : 0),
    };
  });

  // Check if active player graduated all 4 pawns
  const graduatedCount = getGraduatedCount(updatedPawns, move.playerId);
  if (graduatedCount === PAWNS_PER_PLAYER) {
    const place = updatedPlayers.filter(player => player.finishRank).length + 1;
    let rankedPlayers = updatedPlayers.map(player => player.id === move.playerId ? {...player, finishRank: place} : player);
    const done = !state.playForPlaces || place >= rankedPlayers.length - 1;
    if (done && state.playForPlaces) {
      rankedPlayers = rankedPlayers.map(player => player.finishRank ? player : {...player, finishRank: place + 1});
    }
    const winnerId = rankedPlayers.find(player => player.finishRank === 1)!.id;
    return {
      nextState: {
        ...state,
        players: rankedPlayers,
        pawns: updatedPawns,
        phase: done ? 'finished' : 'awaiting_roll',
        winnerId: done ? winnerId : null,
        activePlayerIndex: done ? state.activePlayerIndex : nextUnfinished(rankedPlayers, state.activePlayerIndex),
        consecutiveSixes: 0,
        dormRollAttempts: 0,
        turnCount: done ? state.turnCount : state.turnCount + 1,
        lastEvent: campusEvent
          ? { event: campusEvent, playerId: move.playerId, turn: state.turnCount }
          : state.lastEvent,
      },
      move,
      pathCoords,
      capturedPawns,
      campusEvent,
      extraTurnGranted: false,
      extraTurnReason: null,
      winnerId: done ? winnerId : null,
    };
  }

  // Determine bonus roll: rolled 6, captured opponent, or campus event bonus
  let extraTurnReason: 'six' | 'capture' | 'campus_event' | null = null;
  if (capturedPawns.length > 0) {
    extraTurnReason = 'capture';
  } else if (campusEvent?.grantsExtraTurn) {
    extraTurnReason = 'campus_event';
  } else if (state.diceValue === 6 && state.consecutiveSixes < 3) {
    extraTurnReason = 'six';
  }

  const extraTurnGranted = extraTurnReason !== null;
  const nextPlayerIndex = extraTurnGranted
    ? state.activePlayerIndex
    : nextUnfinished(state.players, state.activePlayerIndex);

  return {
    nextState: {
      ...state,
      players: updatedPlayers,
      pawns: updatedPawns,
      activePlayerIndex: nextPlayerIndex,
      phase: 'awaiting_roll',
      diceValue: extraTurnGranted ? state.diceValue : null,
      consecutiveSixes: extraTurnGranted ? state.consecutiveSixes : 0,
      turnCount: state.turnCount + 1,
      lastEvent: campusEvent
        ? { event: campusEvent, playerId: move.playerId, turn: state.turnCount }
        : state.lastEvent,
    },
    move,
    pathCoords,
    capturedPawns,
    campusEvent,
    extraTurnGranted,
    extraTurnReason,
    winnerId: null,
  };
}

/**
 * Checks whether an opponent is within 1..6 cells behind a given track position.
 */
function countThreatsBehind(state: MatchState, playerId: number, trackIndex: number): number {
  if (isSafeTrackIndex(trackIndex)) return 0;
  let threats = 0;
  for (const pawn of state.pawns) {
    if (pawn.playerId === playerId) continue;
    if (pawn.progress < 0 || pawn.progress >= TRACK_LENGTH) continue;
    const oppTrack = getGlobalTrackIndex(pawn.playerId, pawn.progress)!;
    const dist = (trackIndex - oppTrack + TRACK_LENGTH) % TRACK_LENGTH;
    if (dist >= 1 && dist <= 6) {
      threats++;
    }
  }
  return threats;
}

/**
 * Tactical AI heuristic for university bot opponents.
 */
export function chooseBotMove(
  state: MatchState,
  playerId: number,
  diceValue: number
): LegalMove | null {
  const moves = getLegalMoves(state, playerId, diceValue);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];
  if (state.config.botDifficulty === 'easy') return moves[Math.floor(Math.random() * moves.length)];

  let bestMove = moves[0];
  let bestScore = -Infinity;

  for (const move of moves) {
    let score = 0;

    // Graduating a pawn into safe home lane is top priority
    if (move.isGraduation) score += 120;
    // Advancing further inside home lane to clear room for teammates
    if (move.fromProgress >= TRACK_LENGTH) score += 28 + (move.toProgress - TRACK_LENGTH) * 6;
    // Capturing an opponent is huge + gives bonus roll
    if (move.capturedPawnIds.length > 0) score += 105 * move.capturedPawnIds.length;
    // Exiting dorm on a 6 gets more pieces active
    if (move.isExitDorm) score += 72;
    // Landing on safe Library tile
    if (move.landsOnSafeTile) score += 36;
    // Landing on Campus Event tile in student mode (net positive EV!)
    if (move.triggersEventTile) score += 24;

    // Escape danger if currently threatened
    if (move.fromProgress >= 0 && move.fromProgress < TRACK_LENGTH) {
      const fromIdx = getGlobalTrackIndex(playerId, move.fromProgress)!;
      score += countThreatsBehind(state, playerId, fromIdx) * 26;
    }

    // Penalize moving into opponent capture range
    if (move.toProgress >= 0 && move.toProgress < TRACK_LENGTH) {
      const toIdx = getGlobalTrackIndex(playerId, move.toProgress)!;
      score -= countThreatsBehind(state, playerId, toIdx) * 20;
    }

    // Prefer advancing pawns closer to graduation
    score += move.toProgress * 0.9;

    if (state.config.botDifficulty === 'hard') {
      const simulated = applyMove(state, move, () => 0.5).nextState;
      const vulnerableRolls = [1, 2, 3, 4, 5, 6].filter(die =>
        simulated.players.some(opponent => opponent.id !== playerId &&
          getLegalMoves(simulated, opponent.id, die).some(reply => reply.capturedPawnIds.includes(move.pawnId))));
      score -= vulnerableRolls.length * 25;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

/**
 * Computes leaderboard standings sorted by graduated pawns, total progress, and captures.
 */
export function getStandings(state: MatchState): Array<{
  player: PlayerState;
  graduated: number;
  totalProgress: number;
}> {
  return [...state.players]
    .map((player) => {
      const playerPawns = state.pawns.filter((p) => p.playerId === player.id);
      const graduated = playerPawns.filter((p) => p.progress >= TRACK_LENGTH).length;
      const totalProgress = playerPawns.reduce(
        (sum, p) => sum + (p.progress < 0 ? 0 : p.progress + 1),
        0
      );
      return { player, graduated, totalProgress };
    })
    .sort((a, b) => {
      if (a.player.finishRank === 1) return -1;
      if (b.player.finishRank === 1) return 1;
      if (b.graduated !== a.graduated) return b.graduated - a.graduated;
      if (b.totalProgress !== a.totalProgress) return b.totalProgress - a.totalProgress;
      return b.player.captures - a.player.captures;
    });
}
