import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CampusEventSpec, TEAMS, GridCoord } from '../../portal/uniludo/constants';
import type { RankedMatch } from '../../portal/uniludo/service';
import backdrop from './assets/campus.jpg';
import { GameError, gameRequest, type GameSession, type GameUpdate } from './api';
import {
  applyMove,
  chooseBotMove,
  createInitialMatch,
  GameConfig,
  getActivePlayer,
  getGraduatedCount,
  getLegalMoves,
  LegalMove,
  MatchState,
  rollDice,
} from '../../portal/uniludo/rules';
import { gameAudio } from './utils/audio';
import { loadStoredStats, saveStoredStats, StoredPlayerStats, toPersianDigits } from './utils/storage';
import { triggerHaptic } from './utils/telegram';
import { DiceWidget } from './components/DiceWidget';
import { PauseModal, RulesModal, VictoryModal } from './components/GameModals';
import { MenchBoard } from './components/MenchBoard';
import { PlayerHudCard } from './components/PlayerHudCard';
import { TitleScreen } from './components/TitleScreen';
import { Ranking } from './Ranking';

type ShellScreen = 'title' | 'playing' | 'paused' | 'gameover';

export default function App({session, onDenied}: {session: GameSession; onDenied: (message: string) => void}) {
  const initialStats = useMemo(() => loadStoredStats(), []);
  const [stats, setStats] = useState<StoredPlayerStats>(initialStats);
  const [config, setConfig] = useState<GameConfig>({
    playerCount: initialStats.lastPlayerCount,
    vsBots: initialStats.lastVsBots,
    ruleMode: initialStats.lastRuleMode,
    humanTeam: initialStats.lastFaculty,
  });

  const [screen, setScreen] = useState<ShellScreen>('title');
  const [showRules, setShowRules] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [rankedMatch, setRankedMatch] = useState<RankedMatch | null>(session.match);
  const [starting, setStarting] = useState(false);
  const [gameError, setGameError] = useState('');
  const requesting = useRef(false);

  const [match, setMatch] = useState<MatchState>(() =>
    createInitialMatch({
      playerCount: initialStats.lastPlayerCount,
      vsBots: initialStats.lastVsBots,
      ruleMode: initialStats.lastRuleMode,
      humanTeam: initialStats.lastFaculty,
    })
  );

  const [displayDice, setDisplayDice] = useState<number>(6);
  const [isRolling, setIsRolling] = useState(false);
  const [isAnimatingMove, setIsAnimatingMove] = useState(false);
  const [animatingPawnCoord, setAnimatingPawnCoord] = useState<{
    pawnId: string;
    coord: GridCoord;
  } | null>(null);
  const [captureFlashCoord, setCaptureFlashCoord] = useState<GridCoord | null>(null);
  const [statusBanner, setStatusBanner] = useState<string>('تاس بنداز تا بازی شروع شه!');
  const [eventToast, setEventToast] = useState<{
    event: CampusEventSpec;
    playerName: string;
  } | null>(null);

  const timersRef = useRef<number[]>([]);
  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  useEffect(() => {
    gameAudio.setMuted(initialStats.muted);
    return () => clearAllTimers();
  }, [clearAllTimers, initialStats.muted]);

  // Mirror state machine to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = screen;
  }, [screen]);

  const updateConfig = useCallback(
    (patch: Partial<GameConfig>) => {
      gameAudio.playClick();
      triggerHaptic('light');
      setConfig((prev) => {
        const next = { ...prev, ...patch };
        setStats((s) => {
          const updated: StoredPlayerStats = {
            ...s,
            lastFaculty: next.humanTeam,
            lastPlayerCount: next.playerCount,
            lastVsBots: next.vsBots,
            lastRuleMode: next.ruleMode,
          };
          saveStoredStats(updated);
          return updated;
        });
        return next;
      });
    },
    []
  );

  const describeError = useCallback((failure: unknown) => {
    const message = failure instanceof Error ? failure.message : 'بازی فعلاً در دسترس نیست.';
    if (failure instanceof GameError && (failure.status === 401 || failure.status === 403)) onDenied(message);
    return message;
  }, [onDenied]);

  const recoverMove = useCallback((failure: unknown) => {
    setGameError(describeError(failure));
    if (!(failure instanceof GameError) || failure.match === undefined) return;
    setRankedMatch(failure.match);
    if (!failure.match) { setScreen('title'); return; }
    setMatch(failure.match.state);
    setDisplayDice(failure.match.state.diceValue ?? 6);
    if (failure.match.state.phase === 'finished') setScreen('gameover');
  }, [describeError]);

  const startNewMatch = useCallback(
    async (restart = false) => {
      if (requesting.current) return;
      requesting.current = true;
      setStarting(true);
      setGameError('');
      gameAudio.playClick();
      triggerHaptic('medium');
      const activeCfg = restart ? match.config : config;
      let fresh: MatchState;
      try {
        if (activeCfg.vsBots) {
          const replacement = restart && rankedMatch ? {matchId: rankedMatch.id, revision: rankedMatch.revision} : {};
          const {match: saved} = await gameRequest<GameUpdate>('start', {config: activeCfg, ...replacement}, session.token);
          setRankedMatch(saved);
          fresh = saved.state;
        } else {
          fresh = createInitialMatch(activeCfg, session.name);
        }
      } catch (failure) {
        setGameError(describeError(failure));
        return;
      } finally {
        requesting.current = false;
        setStarting(false);
      }
      clearAllTimers();
      setMatch(fresh);
      setDisplayDice(fresh.diceValue ?? 6);
      setIsRolling(false);
      setIsAnimatingMove(false);
      setAnimatingPawnCoord(null);
      setCaptureFlashCoord(null);
      setEventToast(null);
      setStatusBanner(fresh.phase === 'awaiting_move' ? 'یکی از مهره‌های روشن را انتخاب کن.' : `نوبت ${getActivePlayer(fresh).name}`);
      setShowRules(false);
      // Immediate state sync for crisp start handshake
      setScreen(fresh.phase === 'finished' ? 'gameover' : 'playing');
    },
    [clearAllTimers, config, describeError, match.config, rankedMatch, session.name, session.token]
  );

  const toggleMute = useCallback(() => {
    setStats((prev) => {
      const nextMuted = !prev.muted;
      gameAudio.setMuted(nextMuted);
      const updated = { ...prev, muted: nextMuted };
      saveStoredStats(updated);
      if (!nextMuted) gameAudio.playClick();
      return updated;
    });
  }, []);

  const activePlayer = getActivePlayer(match);

  const legalMoves = useMemo(() => {
    if (match.phase !== 'awaiting_move' || match.diceValue === null || isRolling || isAnimatingMove) {
      return [];
    }
    return getLegalMoves(match, activePlayer.id, match.diceValue);
  }, [activePlayer.id, isAnimatingMove, isRolling, match]);

  const executeMove = useCallback(
    async (move: LegalMove, currentMatch: MatchState) => {
      if (isAnimatingMove || requesting.current || gameError) return;
      requesting.current = true;
      setIsAnimatingMove(true);
      let outcome: ReturnType<typeof applyMove>;
      try {
        if (currentMatch.config.vsBots) {
          if (!rankedMatch) throw new Error('بازی امتیازی را از منوی بازی دوباره باز کنید.');
          const data = await gameRequest<GameUpdate>('move', {
            matchId: rankedMatch.id, revision: rankedMatch.revision, pawnId: move.pawnId,
          }, session.token);
          setRankedMatch(data.match);
          if (!data.move) throw new Error('حرکت ثبت شد. بازی را دوباره باز کنید.');
          outcome = {...data.move, nextState: data.match.state};
        } else {
          outcome = applyMove(currentMatch, move);
        }
      } catch (failure) {
        recoverMove(failure);
        setIsAnimatingMove(false);
        return;
      } finally {
        requesting.current = false;
      }
      const moved = outcome.move;
      const mover = currentMatch.players.find((p) => p.id === moved.playerId);

      const steps = outcome.pathCoords;
      const hopMs = 110;

      steps.forEach((coord, idx) => {
        schedule(() => {
          setAnimatingPawnCoord({ pawnId: moved.pawnId, coord });
          gameAudio.playPawnHop(idx);
          triggerHaptic('light');
        }, idx * hopMs);
      });

      const finishDelay = Math.max(steps.length * hopMs + 60, 140);
      schedule(() => {
        setAnimatingPawnCoord(null);
        setIsAnimatingMove(false);
        setMatch(outcome.nextState);

        if (outcome.capturedPawns.length > 0) {
          const finalCoord = steps[steps.length - 1];
          if (finalCoord) {
            setCaptureFlashCoord(finalCoord);
            schedule(() => setCaptureFlashCoord(null), 460);
          }
          gameAudio.playCapture();
          triggerHaptic('heavy');
        }

        if (outcome.campusEvent) {
          const positive = outcome.campusEvent.kind !== 'setback';
          gameAudio.playCampusEvent(positive);
          triggerHaptic(positive ? 'success' : 'warning');
          setEventToast({
            event: outcome.campusEvent,
            playerName: mover?.name ?? '',
          });
          schedule(() => setEventToast(null), 2600);
        } else if (moved.isGraduation) {
          gameAudio.playGraduation();
          triggerHaptic('success');
        }

        if (outcome.winnerId !== null) {
          gameAudio.playVictoryFanfare();
          triggerHaptic('success');
          setStatusBanner(`${mover?.name ?? ''} فارغ‌التحصیل شد!`);

          if (!currentMatch.config.vsBots) setStats((prev) => {
            const humanPlayer = outcome.nextState.players.find((p) => p.id === 0);
            const updated: StoredPlayerStats = {
              ...prev,
              matchesPlayed: prev.matchesPlayed + 1,
              wins: prev.wins + (outcome.winnerId === 0 ? 1 : 0),
              totalCaptures: prev.totalCaptures + (humanPlayer?.captures ?? 0),
            };
            saveStoredStats(updated);
            return updated;
          });

          schedule(() => {
            setScreen('gameover');
          }, 520);
          return;
        }

        const nextPl = getActivePlayer(outcome.nextState);
        if (outcome.extraTurnGranted) {
          if (outcome.extraTurnReason === 'capture') {
            setStatusBanner(`مشروطش کردی! ${nextPl.name} یه تاس جایزه داره!`);
          } else if (outcome.extraTurnReason === 'campus_event') {
            setStatusBanner(`${outcome.campusEvent?.title ?? ''} — یه بار دیگه تاس بنداز!`);
          } else {
            setStatusBanner(`شیش آوردی! ${nextPl.name} دوباره تاس می‌ندازه.`);
          }
        } else {
          setStatusBanner(`نوبت ${nextPl.name} — آماده پرتاب تاس`);
        }
      }, finishDelay);
    },
    [gameError, isAnimatingMove, rankedMatch, recoverMove, schedule, session.token]
  );

  const handleRollDice = useCallback(() => {
    if (screen !== 'playing' || match.phase !== 'awaiting_roll' || isRolling || isAnimatingMove || requesting.current || gameError) {
      return;
    }

    setIsRolling(true);
    requesting.current = true;
    gameAudio.playDiceRattle();
    triggerHaptic('medium');

    // Quick tumble ticks before settling
    const tickDelays = [0, 70, 140, 210];
    tickDelays.forEach((delay) => {
      schedule(() => {
        setDisplayDice(Math.floor(Math.random() * 6) + 1);
      }, delay);
    });

    schedule(async () => {
      let result: ReturnType<typeof rollDice>;
      try {
        if (match.config.vsBots) {
          if (!rankedMatch) throw new Error('بازی امتیازی را از منوی بازی دوباره باز کنید.');
          const data = await gameRequest<GameUpdate>('roll', {matchId: rankedMatch.id, revision: rankedMatch.revision}, session.token);
          setRankedMatch(data.match);
          if (!data.roll) throw new Error('تاس ثبت شد. بازی را دوباره باز کنید.');
          result = {...data.roll, nextState: data.match.state};
        } else {
          result = rollDice(match);
        }
      } catch (failure) {
        recoverMove(failure);
        return;
      } finally {
        setIsRolling(false);
        requesting.current = false;
      }
      setDisplayDice(result.diceValue);
      setMatch(result.nextState);

      if (result.diceValue === 6) {
        gameAudio.playSixChime();
        triggerHaptic('success');
      }

      if (result.dormRetryLeft > 0) {
        setStatusBanner(
          `تاس ${toPersianDigits(result.diceValue)} شد · ${toPersianDigits(result.dormRetryLeft)} شانس دیگه برای ۶ داری!`
        );
      } else if (result.autoPassed) {
        const nextPl = getActivePlayer(result.nextState);
        setStatusBanner(
          `تاس ${toPersianDigits(result.diceValue)} شد و حرکتی نبود · نوبت ${nextPl.name}`
        );
      } else {
        const currentPl = getActivePlayer(result.nextState);
        if (currentPl.isBot) {
          setStatusBanner(`${currentPl.name} عدد ${toPersianDigits(result.diceValue)} آورد...`);
        } else if (result.legalMoves.length === 1) {
          setStatusBanner(`تاس ${toPersianDigits(result.diceValue)} شد · روی مهره روشن کلیک کن`);
        } else {
          setStatusBanner(`تاس ${toPersianDigits(result.diceValue)} شد · یکی از مهره‌های روشن رو انتخاب کن`);
        }
      }
    }, 280);
  }, [gameError, isAnimatingMove, isRolling, match, rankedMatch, recoverMove, schedule, screen, session.token]);

  // Automated Bot Turn Driver
  useEffect(() => {
    if (screen !== 'playing' || showRules || isRolling || isAnimatingMove || gameError) return;
    if (match.phase === 'finished') return;
    const current = getActivePlayer(match);
    if (!current.isBot) return;

    if (match.phase === 'awaiting_roll') {
      const id = schedule(() => {
        handleRollDice();
      }, 480);
      return () => window.clearTimeout(id);
    }

    if (match.phase === 'awaiting_move' && match.diceValue !== null) {
      const botMove = chooseBotMove(match, current.id, match.diceValue);
      if (botMove) {
        const id = schedule(() => {
          executeMove(botMove, match);
        }, 420);
        return () => window.clearTimeout(id);
      }
    }
  }, [executeMove, gameError, handleRollDice, isAnimatingMove, isRolling, match, schedule, screen, showRules]);

  // Unified Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || showRanking || (e.target instanceof HTMLElement && e.target.closest('button,a,input,select,textarea'))) return;

      if (screen === 'title' && !showRules) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          void startNewMatch();
        }
        return;
      }

      if (showRules) {
        if (e.code === 'Escape') {
          e.preventDefault();
          setShowRules(false);
        }
        return;
      }

      if (screen === 'playing') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (isRolling || isAnimatingMove || starting) return;
          e.preventDefault();
          clearAllTimers();
          setIsRolling(false);
          setIsAnimatingMove(false);
          setAnimatingPawnCoord(null);
          setScreen('paused');
          return;
        }
        if (e.code === 'KeyM') {
          e.preventDefault();
          toggleMute();
          return;
        }
        if (e.code === 'Space' || e.code === 'Enter') {
          if (!activePlayer.isBot && match.phase === 'awaiting_roll' && !isRolling && !isAnimatingMove) {
            e.preventDefault();
            handleRollDice();
          } else if (!activePlayer.isBot && legalMoves.length === 1) {
            e.preventDefault();
            executeMove(legalMoves[0], match);
          }
          return;
        }
        if (!activePlayer.isBot && legalMoves.length > 0) {
          const numMap: Record<string, number> = {
            Digit1: 0,
            Digit2: 1,
            Digit3: 2,
            Digit4: 3,
          };
          const moveIdx = numMap[e.code];
          if (moveIdx !== undefined && legalMoves[moveIdx]) {
            e.preventDefault();
            executeMove(legalMoves[moveIdx], match);
          }
        }
      } else if (screen === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          setScreen('playing');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activePlayer.isBot,
    clearAllTimers,
    executeMove,
    handleRollDice,
    isAnimatingMove,
    isRolling,
    legalMoves,
    match,
    screen,
    showRules,
    showRanking,
    starting,
    startNewMatch,
    toggleMute,
  ]);

  if (showRanking) return <Ranking token={session.token} onClose={() => setShowRanking(false)} onError={describeError} />;
  if (screen === 'title') {
    return (
      <>
        <TitleScreen
          config={config}
          stats={stats}
          onChangeConfig={updateConfig}
          onStart={() => void startNewMatch()}
          onRanking={() => setShowRanking(true)}
          busy={starting} error={gameError} canResume={Boolean(rankedMatch && rankedMatch.state.phase !== 'finished')}
          onOpenRules={() => {
            gameAudio.playClick();
            setShowRules(true);
          }}
        />
        {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      </>
    );
  }

  const canHumanRoll =
    screen === 'playing' &&
    !activePlayer.isBot &&
    match.phase === 'awaiting_roll' &&
    !isRolling &&
    !isAnimatingMove && !gameError;

  // Spatial alignment: Top row [Left=Seat 1, Right=Seat 2], Bottom row [Left=Seat 0, Right=Seat 3]
  const topPlayers = [1, 2]
    .map((seat) => match.players.find((p) => p.id === seat))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const bottomPlayers = [0, 3]
    .map((seat) => match.players.find((p) => p.id === seat))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="relative w-full h-dvh overflow-hidden flex flex-col bg-[#130F1B]">
      {/* Subtle dorm desk atmosphere */}
      <img
        src={backdrop}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-35"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[#100C17]/75"
      />

      {/* Compact Top Utility Strip (Game Shell — NOT a website navbar) */}
      <div
        className="relative z-20 w-full max-w-6xl mx-auto px-3 sm:px-6 pt-2 pb-1 flex items-center justify-between gap-2 shrink-0"
        style={{ paddingTop: 'max(0.5rem, var(--safe-top))' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-xl sm:text-2xl text-[#FFFDF5] whitespace-nowrap">
            منچ صنایع
          </span>
          <span className="text-xs text-[#C0ADDA] whitespace-nowrap hidden sm:inline">
            · {match.config.ruleMode === 'student' ? 'حالت دانشجویی' : 'کلاسیک'} · نوبت{' '}
            <span className="tabular-nums">{toPersianDigits(match.turnCount)}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              gameAudio.playClick();
              setShowRules(true);
            }}
            aria-label="قوانین بازی"
            className="w-10 h-10 rounded-xl bg-[#281B36] hover:bg-[#38234B] border border-[#533C6A] flex items-center justify-center text-[#E9DDF6] cursor-pointer transition-colors"
          >
            <span aria-hidden="true">؟</span>
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              toggleMute();
            }}
            aria-label={stats.muted ? 'فعال کردن صدا' : 'بی‌صدا کردن'}
            className="w-10 h-10 rounded-xl bg-[#281B36] hover:bg-[#38234B] border border-[#533C6A] flex items-center justify-center text-[#E9DDF6] cursor-pointer transition-colors"
          >
            <span aria-hidden="true">{stats.muted ? '×' : '♪'}</span>
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              void startNewMatch(true);
            }}
            aria-label="شروع مجدد"
            disabled={starting || isRolling || isAnimatingMove || showRules}
            className="w-10 h-10 rounded-xl bg-[#281B36] hover:bg-[#38234B] border border-[#533C6A] flex items-center justify-center text-[#E9DDF6] cursor-pointer transition-colors"
          >
            <span aria-hidden="true">↻</span>
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              clearAllTimers();
              setIsRolling(false);
              setIsAnimatingMove(false);
              setAnimatingPawnCoord(null);
              setScreen('paused');
            }}
            aria-label="توقف بازی"
            disabled={starting || isRolling || isAnimatingMove}
            className="w-10 h-10 rounded-xl bg-[#281B36] hover:bg-[#38234B] border border-[#533C6A] flex items-center justify-center text-[#E9DDF6] cursor-pointer transition-colors"
          >
            <span aria-hidden="true">Ⅱ</span>
          </button>
        </div>
      </div>

      {gameError && screen === 'playing' && <div className="relative z-20 mx-auto flex max-w-[96%] items-center gap-2 rounded-xl bg-[#22182E] p-2">
        <p role="alert" className="game-error text-xs">{gameError}</p>
        <button type="button" className="game-secondary shrink-0" onClick={() => setGameError('')}>ادامه</button>
      </div>}

      {/* Campus Event Toast (non-blocking, above board top edge) */}
      {eventToast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed top-14 left-1/2 -translate-x-1/2 z-40 w-[92vw] max-w-sm rounded-2xl px-4 py-2.5 shadow-[0_14px_34px_rgba(0,0,0,0.55)] border-2 text-center"
          style={{
            backgroundColor:
              eventToast.event.kind === 'setback' ? '#3B181A' : '#14332A',
            borderColor:
              eventToast.event.kind === 'setback' ? '#EF4444' : '#7335E3',
          }}
        >
          <div className="text-sm font-extrabold text-[#FFFDF5]">
            {eventToast.event.title}
          </div>
          <div className="text-xs text-[#E9DDF6] mt-0.5">
            {eventToast.playerName}: {eventToast.event.description}
          </div>
        </div>
      )}

      {/* Main Arena: Mobile Vertical Fit vs Desktop Full 1440px Balanced Arena */}
      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 pb-2 flex flex-col lg:grid lg:grid-cols-12 lg:items-center gap-2 lg:gap-6 min-h-0">
        {/* Desktop Side Column (Players & Dice Dock) */}
        <aside className="hidden lg:flex lg:col-span-4 flex-col gap-3 justify-between h-full max-h-[670px] py-2">
          <div className="space-y-2.5">
            {match.players.map((pl) => (
              <PlayerHudCard
                key={pl.id}
                player={pl}
                graduatedCount={getGraduatedCount(match.pawns, pl.id)}
                isActive={pl.id === activePlayer.id && match.phase !== 'finished'}
              />
            ))}
          </div>

          {/* Desktop Dice & Status Dock */}
          <div className="rounded-3xl bg-[#22182E]/95 border-2 border-[#4C355F] p-4 shadow-[0_14px_32px_rgba(0,0,0,0.4)]">
            <DiceWidget
              value={displayDice}
              rolling={isRolling}
              canRoll={canHumanRoll}
              activeFacultyId={activePlayer.teamId}
              activePlayerName={activePlayer.name}
              isBotTurn={activePlayer.isBot}
              promptText={statusBanner}
              onRoll={handleRollDice}
            />
          </div>
        </aside>

        {/* Mobile Top Players Row — LTR grid so Seat 1 (Top-Left) & Seat 2 (Top-Right) match board corners */}
        <div
          dir="ltr"
          className={`lg:hidden grid gap-2 shrink-0 ${
            topPlayers.length === 1 ? 'grid-cols-1 max-w-[240px] ml-auto w-full' : 'grid-cols-2'
          }`}
        >
          {topPlayers.map((pl) => (
            <PlayerHudCard
              key={pl.id}
              player={pl}
              graduatedCount={getGraduatedCount(match.pawns, pl.id)}
              isActive={pl.id === activePlayer.id && match.phase !== 'finished'}
              compact
            />
          ))}
        </div>

        {/* Center Focal Anchor: Mench Board */}
        <div className="lg:col-span-8 flex-1 flex items-center justify-center min-h-0 w-full">
          <div className="w-full max-w-[min(94vw,52dvh)] sm:max-w-[min(86vw,58dvh)] lg:max-w-[min(80dvh,650px)]">
            <MenchBoard
              players={match.players}
              pawns={match.pawns}
              activePlayerId={activePlayer.id}
              legalMoves={activePlayer.isBot ? [] : legalMoves}
              ruleMode={match.config.ruleMode}
              animatingPawnCoord={animatingPawnCoord}
              captureFlashCoord={captureFlashCoord}
              onSelectMove={(move) => executeMove(move, match)}
              interactive={screen === 'playing' && !activePlayer.isBot && !isAnimatingMove && !gameError && !starting}
            />
          </div>
        </div>

        {/* Mobile Bottom Players Row — LTR grid so Seat 0 (Bottom-Left) & Seat 3 (Bottom-Right) match board corners */}
        <div
          dir="ltr"
          className={`lg:hidden grid gap-2 shrink-0 ${
            bottomPlayers.length === 1 ? 'grid-cols-1 max-w-[240px] mr-auto w-full' : 'grid-cols-2'
          }`}
        >
          {bottomPlayers.map((pl) => (
            <PlayerHudCard
              key={pl.id}
              player={pl}
              graduatedCount={getGraduatedCount(match.pawns, pl.id)}
              isActive={pl.id === activePlayer.id && match.phase !== 'finished'}
              compact
            />
          ))}
        </div>

        {/* Mobile Ergonomic Thumb-Zone Dice Dock */}
        <div
          className="lg:hidden shrink-0 rounded-2xl bg-[#22182E]/95 border border-[#533C6A] px-3.5 py-2.5 shadow-[0_-6px_24px_rgba(0,0,0,0.35)]"
          style={{ marginBottom: 'var(--safe-bottom)' }}
        >
          <DiceWidget
            value={displayDice}
            rolling={isRolling}
            canRoll={canHumanRoll}
            activeFacultyId={activePlayer.teamId}
            activePlayerName={activePlayer.name}
            isBotTurn={activePlayer.isBot}
            promptText={statusBanner}
            onRoll={handleRollDice}
          />
        </div>
      </main>

      {/* Modals */}
      {screen === 'paused' && (
        <PauseModal
          onResume={() => {
            gameAudio.playClick();
            setScreen('playing');
          }}
          onRestart={() => void startNewMatch(true)}
          busy={starting} error={gameError}
          onReturnTitle={() => {
            clearAllTimers();
            gameAudio.playClick();
            setScreen('title');
          }}
        />
      )}

      {screen === 'gameover' && (
        <VictoryModal
          match={match}
          onPlayAgain={() => void startNewMatch(true)}
          onRanking={() => setShowRanking(true)}
          busy={starting} error={gameError}
          onReturnTitle={() => {
            clearAllTimers();
            gameAudio.playClick();
            setScreen('title');
          }}
        />
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}
