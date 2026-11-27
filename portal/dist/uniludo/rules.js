import {
  CAMPUS_EVENTS,
  CAMPUS_EVENT_INDICES,
  TEAMS,
  TEAM_ORDER,
  MAX_PROGRESS,
  PAWNS_PER_PLAYER,
  SAFE_TRACK_INDICES,
  SEAT_DORM_COORDS,
  SEAT_HOME_COORDS,
  SEAT_START_INDICES,
  TRACK_COORDS,
  TRACK_LENGTH
} from "./constants.js";
function getGlobalTrackIndex(seatIndex, progress) {
  if (progress < 0 || progress >= TRACK_LENGTH) return null;
  return (SEAT_START_INDICES[seatIndex] + progress) % TRACK_LENGTH;
}
function getPawnCoords(pawn) {
  if (pawn.progress === -1) {
    return SEAT_DORM_COORDS[pawn.playerId][pawn.pawnIndex];
  }
  if (pawn.progress >= TRACK_LENGTH) {
    const homeIdx = Math.min(pawn.progress - TRACK_LENGTH, 3);
    return SEAT_HOME_COORDS[pawn.playerId][homeIdx];
  }
  const trackIdx = getGlobalTrackIndex(pawn.playerId, pawn.progress);
  return TRACK_COORDS[trackIdx];
}
function isSafeTrackIndex(trackIndex) {
  return SAFE_TRACK_INDICES.includes(trackIndex);
}
function isCampusEventIndex(trackIndex, ruleMode) {
  return ruleMode === "student" && CAMPUS_EVENT_INDICES.includes(trackIndex);
}
function createInitialMatch(config, customHumanName) {
  const chosenFaculty = config.humanTeam;
  const remainingFaculties = TEAM_ORDER.filter((f) => f !== chosenFaculty);
  const facultySequence = [chosenFaculty, ...remainingFaculties];
  const activeSeats = config.playerCount === 2 ? [0, 2] : config.playerCount === 3 ? [0, 1, 2] : [0, 1, 2, 3];
  const players = activeSeats.map((seatId, idx) => {
    const teamId = facultySequence[idx];
    const meta = TEAMS[teamId];
    const isHuman = idx === 0 || !config.vsBots;
    let displayName;
    if (idx === 0 && customHumanName && customHumanName.trim().length > 0) {
      displayName = customHumanName.trim();
    } else if (isHuman) {
      displayName = config.vsBots ? "\u0634\u0645\u0627" : `\u0628\u0627\u0632\u06CC\u06A9\u0646 ${idx + 1} (${meta.shortName})`;
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
      finishRank: null
    };
  });
  const pawns = [];
  for (const player of players) {
    for (let i = 0; i < PAWNS_PER_PLAYER; i++) {
      pawns.push({
        id: `p${player.id}_pawn${i}`,
        playerId: player.id,
        pawnIndex: i,
        progress: -1
      });
    }
  }
  return {
    config,
    players,
    pawns,
    activePlayerIndex: 0,
    phase: "awaiting_roll",
    diceValue: null,
    consecutiveSixes: 0,
    dormRollAttempts: 0,
    turnCount: 1,
    winnerId: null,
    lastEvent: null
  };
}
function getActivePlayer(state) {
  return state.players[state.activePlayerIndex];
}
function getGraduatedCount(pawns, playerId) {
  return pawns.filter((p) => p.playerId === playerId && p.progress >= TRACK_LENGTH).length;
}
function hasNoActiveTrackPawns(pawns, playerId) {
  const owned = pawns.filter((p) => p.playerId === playerId);
  const onTrack = owned.some((p) => p.progress >= 0 && p.progress < TRACK_LENGTH);
  const inDorm = owned.some((p) => p.progress === -1);
  return !onTrack && inDorm;
}
function getLegalMoves(state, playerId, diceValue) {
  const playerPawns = state.pawns.filter((p) => p.playerId === playerId);
  const moves = [];
  for (const pawn of playerPawns) {
    let targetProgress = null;
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
    const occupiedBySelf = playerPawns.some(
      (other) => other.id !== pawn.id && other.progress === targetProgress
    );
    if (occupiedBySelf) continue;
    let capturedPawnIds = [];
    let triggersEventTile = false;
    let landsOnSafeTile = false;
    if (targetProgress < TRACK_LENGTH) {
      const targetTrackIdx = getGlobalTrackIndex(playerId, targetProgress);
      landsOnSafeTile = isSafeTrackIndex(targetTrackIdx);
      triggersEventTile = isCampusEventIndex(targetTrackIdx, state.config.ruleMode);
      if (!landsOnSafeTile) {
        capturedPawnIds = state.pawns.filter((other) => {
          if (other.playerId === playerId) return false;
          if (other.progress < 0 || other.progress >= TRACK_LENGTH) return false;
          return getGlobalTrackIndex(other.playerId, other.progress) === targetTrackIdx;
        }).map((p) => p.id);
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
      landsOnSafeTile
    });
  }
  return moves;
}
function rollDice(state, forcedValue, rng = Math.random) {
  if (state.phase !== "awaiting_roll") {
    return {
      nextState: state,
      diceValue: state.diceValue ?? 1,
      legalMoves: [],
      autoPassed: false,
      dormRetryLeft: 0
    };
  }
  const diceValue = forcedValue !== void 0 ? Math.max(1, Math.min(6, Math.round(forcedValue))) : Math.floor(rng() * 6) + 1;
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
          phase: "awaiting_roll",
          dormRollAttempts: nextAttempt
        },
        diceValue,
        legalMoves: [],
        autoPassed: false,
        dormRetryLeft: 3 - nextAttempt
      };
    }
    const nextIdx = (state.activePlayerIndex + 1) % state.players.length;
    return {
      nextState: {
        ...state,
        diceValue,
        activePlayerIndex: nextIdx,
        phase: "awaiting_roll",
        consecutiveSixes: 0,
        dormRollAttempts: 0,
        turnCount: state.turnCount + 1
      },
      diceValue,
      legalMoves: [],
      autoPassed: true,
      dormRetryLeft: 0
    };
  }
  return {
    nextState: {
      ...state,
      diceValue,
      phase: "awaiting_move",
      consecutiveSixes: diceValue === 6 ? state.consecutiveSixes + 1 : 0,
      dormRollAttempts: 0
    },
    diceValue,
    legalMoves,
    autoPassed: false,
    dormRetryLeft: 0
  };
}
function buildMovePath(pawn, toProgress) {
  if (pawn.progress === -1) {
    return [getPawnCoords({ ...pawn, progress: 0 })];
  }
  const coords = [];
  const step = toProgress >= pawn.progress ? 1 : -1;
  for (let p = pawn.progress + step; step > 0 ? p <= toProgress : p >= toProgress; p += step) {
    coords.push(getPawnCoords({ ...pawn, progress: p }));
  }
  return coords;
}
function applyMove(state, move, rng = Math.random) {
  const movingPawn = state.pawns.find((p) => p.id === move.pawnId);
  if (!movingPawn) {
    throw new Error(`Pawn not found: ${move.pawnId}`);
  }
  const pathCoords = buildMovePath(movingPawn, move.toProgress);
  const capturedPawns = [];
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
  let campusEvent = null;
  if (move.triggersEventTile && state.config.ruleMode === "student") {
    const eventIdx = Math.floor(rng() * CAMPUS_EVENTS.length) % CAMPUS_EVENTS.length;
    campusEvent = CAMPUS_EVENTS[eventIdx];
    if (campusEvent.stepDelta !== 0) {
      const currentPawn = updatedPawns.find((p) => p.id === move.pawnId);
      const adjusted = Math.max(0, Math.min(TRACK_LENGTH - 1, currentPawn.progress + campusEvent.stepDelta));
      const blockedBySelf = updatedPawns.some(
        (other) => other.id !== currentPawn.id && other.playerId === currentPawn.playerId && other.progress === adjusted
      );
      if (!blockedBySelf && adjusted !== currentPawn.progress) {
        const extraPath = buildMovePath(currentPawn, adjusted);
        pathCoords.push(...extraPath);
        const adjTrackIdx = getGlobalTrackIndex(currentPawn.playerId, adjusted);
        const adjSafe = isSafeTrackIndex(adjTrackIdx);
        updatedPawns = updatedPawns.map((p) => {
          if (p.id === currentPawn.id) {
            return { ...p, progress: adjusted };
          }
          if (!adjSafe && p.playerId !== currentPawn.playerId && p.progress >= 0 && p.progress < TRACK_LENGTH && getGlobalTrackIndex(p.playerId, p.progress) === adjTrackIdx) {
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
      eventsTriggered: pl.eventsTriggered + (campusEvent ? 1 : 0)
    };
  });
  const graduatedCount = getGraduatedCount(updatedPawns, move.playerId);
  if (graduatedCount === PAWNS_PER_PLAYER) {
    const rankedPlayers = updatedPlayers.map(
      (pl) => pl.id === move.playerId ? { ...pl, finishRank: 1 } : pl
    );
    return {
      nextState: {
        ...state,
        players: rankedPlayers,
        pawns: updatedPawns,
        phase: "finished",
        winnerId: move.playerId,
        lastEvent: campusEvent ? { event: campusEvent, playerId: move.playerId, turn: state.turnCount } : state.lastEvent
      },
      move,
      pathCoords,
      capturedPawns,
      campusEvent,
      extraTurnGranted: false,
      extraTurnReason: null,
      winnerId: move.playerId
    };
  }
  let extraTurnReason = null;
  if (capturedPawns.length > 0) {
    extraTurnReason = "capture";
  } else if (campusEvent?.grantsExtraTurn) {
    extraTurnReason = "campus_event";
  } else if (state.diceValue === 6 && state.consecutiveSixes < 3) {
    extraTurnReason = "six";
  }
  const extraTurnGranted = extraTurnReason !== null;
  const nextPlayerIndex = extraTurnGranted ? state.activePlayerIndex : (state.activePlayerIndex + 1) % state.players.length;
  return {
    nextState: {
      ...state,
      players: updatedPlayers,
      pawns: updatedPawns,
      activePlayerIndex: nextPlayerIndex,
      phase: "awaiting_roll",
      diceValue: extraTurnGranted ? state.diceValue : null,
      consecutiveSixes: extraTurnGranted ? state.consecutiveSixes : 0,
      turnCount: state.turnCount + 1,
      lastEvent: campusEvent ? { event: campusEvent, playerId: move.playerId, turn: state.turnCount } : state.lastEvent
    },
    move,
    pathCoords,
    capturedPawns,
    campusEvent,
    extraTurnGranted,
    extraTurnReason,
    winnerId: null
  };
}
function countThreatsBehind(state, playerId, trackIndex) {
  if (isSafeTrackIndex(trackIndex)) return 0;
  let threats = 0;
  for (const pawn of state.pawns) {
    if (pawn.playerId === playerId) continue;
    if (pawn.progress < 0 || pawn.progress >= TRACK_LENGTH) continue;
    const oppTrack = getGlobalTrackIndex(pawn.playerId, pawn.progress);
    const dist = (trackIndex - oppTrack + TRACK_LENGTH) % TRACK_LENGTH;
    if (dist >= 1 && dist <= 6) {
      threats++;
    }
  }
  return threats;
}
function chooseBotMove(state, playerId, diceValue) {
  const moves = getLegalMoves(state, playerId, diceValue);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];
  let bestMove = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    let score = 0;
    if (move.isGraduation) score += 120;
    if (move.fromProgress >= TRACK_LENGTH) score += 28 + (move.toProgress - TRACK_LENGTH) * 6;
    if (move.capturedPawnIds.length > 0) score += 105 * move.capturedPawnIds.length;
    if (move.isExitDorm) score += 72;
    if (move.landsOnSafeTile) score += 36;
    if (move.triggersEventTile) score += 24;
    if (move.fromProgress >= 0 && move.fromProgress < TRACK_LENGTH) {
      const fromIdx = getGlobalTrackIndex(playerId, move.fromProgress);
      score += countThreatsBehind(state, playerId, fromIdx) * 26;
    }
    if (move.toProgress >= 0 && move.toProgress < TRACK_LENGTH) {
      const toIdx = getGlobalTrackIndex(playerId, move.toProgress);
      score -= countThreatsBehind(state, playerId, toIdx) * 20;
    }
    score += move.toProgress * 0.9;
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}
function getStandings(state) {
  return [...state.players].map((player) => {
    const playerPawns = state.pawns.filter((p) => p.playerId === player.id);
    const graduated = playerPawns.filter((p) => p.progress >= TRACK_LENGTH).length;
    const totalProgress = playerPawns.reduce(
      (sum, p) => sum + (p.progress < 0 ? 0 : p.progress + 1),
      0
    );
    return { player, graduated, totalProgress };
  }).sort((a, b) => {
    if (a.player.finishRank === 1) return -1;
    if (b.player.finishRank === 1) return 1;
    if (b.graduated !== a.graduated) return b.graduated - a.graduated;
    if (b.totalProgress !== a.totalProgress) return b.totalProgress - a.totalProgress;
    return b.player.captures - a.player.captures;
  });
}
export {
  applyMove,
  chooseBotMove,
  createInitialMatch,
  getActivePlayer,
  getGlobalTrackIndex,
  getGraduatedCount,
  getLegalMoves,
  getPawnCoords,
  getStandings,
  hasNoActiveTrackPawns,
  isCampusEventIndex,
  isSafeTrackIndex,
  rollDice
};
