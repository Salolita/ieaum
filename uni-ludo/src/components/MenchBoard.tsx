import React, { useMemo, useState } from 'react';
import {
  CAMPUS_EVENT_INDICES,
  TEAMS,
  TeamId,
  GridCoord,
  RuleMode,
  SAFE_TRACK_INDICES,
  SEAT_DORM_COORDS,
  SEAT_HOME_COORDS,
  SEAT_START_INDICES,
  TRACK_COORDS,
} from '../../../portal/uniludo/constants';
import { getPawnCoords, LegalMove, PawnState, PlayerState } from '../../../portal/uniludo/rules';
import { toPersianDigits } from '../utils/storage';
import {
  CampusEventIcon,
  TeamSymbol,
  GraduationCapIcon,
  LibraryShieldIcon,
} from './FacultyIcon';

interface MenchBoardProps {
  players: PlayerState[];
  pawns: PawnState[];
  activePlayerId: number;
  legalMoves: LegalMove[];
  ruleMode: RuleMode;
  animatingPawnCoord: { pawnId: string; coord: GridCoord } | null;
  captureFlashCoord: GridCoord | null;
  onSelectMove: (move: LegalMove) => void;
  interactive?: boolean;
}

const START_ARROWS: Record<number, number> = {
  0: 270, // Seat 0 (10,4) moves up
  1: 0, // Seat 1 (4,0) moves right
  2: 90, // Seat 2 (0,6) moves down
  3: 180, // Seat 3 (6,10) moves left
};

const DORM_REGIONS = [
  { seat: 0, top: 7, left: 0 }, // Bottom-Left
  { seat: 1, top: 0, left: 0 }, // Top-Left
  { seat: 2, top: 0, left: 7 }, // Top-Right
  { seat: 3, top: 7, left: 7 }, // Bottom-Right
];

export const MenchBoard: React.FC<MenchBoardProps> = ({
  players,
  pawns,
  activePlayerId,
  legalMoves,
  ruleMode,
  animatingPawnCoord,
  captureFlashCoord,
  onSelectMove,
  interactive = true,
}) => {
  const [hoveredPawnId, setHoveredPawnId] = useState<string | null>(null);

  const playerBySeat = useMemo(() => {
    const map = new Map<number, PlayerState>();
    players.forEach((p) => map.set(p.id, p));
    return map;
  }, [players]);

  const legalMoveByPawnId = useMemo(() => {
    const map = new Map<string, LegalMove>();
    legalMoves.forEach((m) => map.set(m.pawnId, m));
    return map;
  }, [legalMoves]);

  // Determine destination preview coord when hovering a movable pawn (or when exactly 1 move exists)
  const previewMove = useMemo(() => {
    if (!interactive || legalMoves.length === 0) return null;
    if (hoveredPawnId && legalMoveByPawnId.has(hoveredPawnId)) {
      return legalMoveByPawnId.get(hoveredPawnId)!;
    }
    if (legalMoves.length === 1) return legalMoves[0];
    return null;
  }, [hoveredPawnId, interactive, legalMoveByPawnId, legalMoves]);

  const previewCoord = useMemo(() => {
    if (!previewMove) return null;
    const pawn = pawns.find((p) => p.id === previewMove.pawnId);
    if (!pawn) return null;
    return getPawnCoords({ ...pawn, progress: previewMove.toProgress });
  }, [pawns, previewMove]);

  // Compute micro-offsets when multiple pawns occupy the same cell (e.g. Safe Library)
  const pawnRenderList = useMemo(() => {
    const groups = new Map<string, PawnState[]>();
    const coordsMap = new Map<string, GridCoord>();

    for (const pawn of pawns) {
      const coord =
        animatingPawnCoord && animatingPawnCoord.pawnId === pawn.id
          ? animatingPawnCoord.coord
          : getPawnCoords(pawn);
      coordsMap.set(pawn.id, coord);
      const key = `${coord.row.toFixed(2)},${coord.col.toFixed(2)}`;
      const list = groups.get(key) ?? [];
      list.push(pawn);
      groups.set(key, list);
    }

    return pawns.map((pawn) => {
      const coord = coordsMap.get(pawn.id)!;
      const key = `${coord.row.toFixed(2)},${coord.col.toFixed(2)}`;
      const peers = groups.get(key) ?? [pawn];
      const idx = peers.findIndex((p) => p.id === pawn.id);
      let offsetX = 0;
      let offsetY = 0;
      if (peers.length === 2) {
        offsetX = idx === 0 ? -1.4 : 1.4;
        offsetY = idx === 0 ? -0.9 : 0.9;
      } else if (peers.length >= 3) {
        const angle = (idx / peers.length) * Math.PI * 2;
        offsetX = Math.cos(angle) * 1.6;
        offsetY = Math.sin(angle) * 1.6;
      }
      return { pawn, coord, offsetX, offsetY, stacked: peers.length > 1 };
    });
  }, [animatingPawnCoord, pawns]);

  const toPct = (gridVal: number) => `${((gridVal + 0.5) / 11) * 100}%`;

  const getFacultyForSeat = (seat: number): TeamId | null => {
    return playerBySeat.get(seat)?.teamId ?? null;
  };

  return (
    <div
      dir="ltr"
      data-testid="mench-board"
      className="relative aspect-square w-full select-none rounded-[22px] sm:rounded-[26px] p-1.5 sm:p-2.5 bg-[#2A1D15] border-[2.5px] border-[#5C412E] shadow-[0_18px_42px_rgba(4,12,18,0.65)]"
    >
      {/* Inner notebook paper board surface */}
      <div className="relative w-full h-full rounded-[16px] sm:rounded-[18px] board-paper-surface border border-[#D4C8AD] overflow-hidden">
        {/* 4 Corner Dorm Bays (4x4 cells each) */}
        {DORM_REGIONS.map(({ seat, top, left }) => {
          const player = playerBySeat.get(seat);
          const faculty = player ? TEAMS[player.teamId] : null;
          const isTurn = player?.id === activePlayerId;

          return (
            <div
              key={seat}
              className="absolute rounded-[14px] transition-opacity duration-200 flex flex-col justify-between p-1.5"
              style={{
                top: `${(top / 11) * 100 + 1.1}%`,
                left: `${(left / 11) * 100 + 1.1}%`,
                width: `${(4 / 11) * 100 - 2.2}%`,
                height: `${(4 / 11) * 100 - 2.2}%`,
                backgroundColor: faculty ? faculty.colorLight : '#ECE6D6',
                border: faculty
                  ? `2px solid ${isTurn ? faculty.color : faculty.colorSoft}`
                  : '1.5px dashed #C7BCA2',
                boxShadow: isTurn && faculty ? `inset 0 0 0 2px ${faculty.color}40` : undefined,
                opacity: faculty ? 1 : 0.55,
              }}
            >
              {faculty && (
                <div
                  dir="rtl"
                  className="flex items-center justify-between px-1 pt-0.5 text-[9px] sm:text-[11px] font-extrabold leading-none"
                  style={{ color: faculty.colorDark }}
                >
                  <span className="truncate">{faculty.shortName}</span>
                  <TeamSymbol teamId={faculty.id} className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                </div>
              )}
            </div>
          );
        })}

        {/* Dorm Pads (4 recessed circular beds per active corner) */}
        {SEAT_DORM_COORDS.map((pads, seat) => {
          const teamId = getFacultyForSeat(seat);
          const faculty = teamId ? TEAMS[teamId] : null;
          return pads.map((pad, padIdx) => (
            <div
              key={`pad-${seat}-${padIdx}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: toPct(pad.col),
                top: toPct(pad.row),
                width: '7.4%',
                height: '7.4%',
                backgroundColor: faculty ? '#FFFDF8' : '#E5DEC9',
                border: faculty ? `2px solid ${faculty.colorSoft}` : '1.5px solid #CCC1A7',
                boxShadow: 'inset 0 1.5px 3px rgba(15,33,43,0.12)',
              }}
            />
          ));
        })}

        {/* 40 Outer Track Cells */}
        {TRACK_COORDS.map((coord, trackIdx) => {
          const startSeat = SEAT_START_INDICES.indexOf(trackIdx);
          const startFacultyId = startSeat !== -1 ? getFacultyForSeat(startSeat) : null;
          const startFaculty = startFacultyId ? TEAMS[startFacultyId] : null;
          const isSafe = SAFE_TRACK_INDICES.includes(trackIdx);
          const isEvent = ruleMode === 'student' && CAMPUS_EVENT_INDICES.includes(trackIdx);

          return (
            <div
              key={`track-${trackIdx}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center"
              style={{
                left: toPct(coord.col),
                top: toPct(coord.row),
                width: '7.7%',
                height: '7.7%',
                backgroundColor: startFaculty
                  ? startFaculty.color
                  : isSafe
                    ? '#E2ECF5'
                    : isEvent
                      ? '#FEF3C7'
                      : '#FFFDF7',
                border: startFaculty
                  ? `2px solid ${startFaculty.colorDark}`
                  : isSafe
                    ? '2px solid #2A5078'
                    : isEvent
                      ? '2px solid #D97706'
                      : '1.8px solid #354E5E',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
              }}
              title={
                isSafe
                  ? 'کتابخانه (خانه امن)'
                  : isEvent
                    ? 'اتفاق دانشجویی'
                    : startFaculty
                      ? `شروع ${startFaculty.shortName}`
                      : undefined
              }
            >
              {startFaculty && (
                <svg
                  viewBox="0 0 24 24"
                  className="w-[62%] h-[62%] text-white"
                  style={{ transform: `rotate(${START_ARROWS[startSeat]}deg)` }}
                  aria-hidden="true"
                >
                  <path
                    d="M5 12h13M13 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {!startFaculty && isSafe && <LibraryShieldIcon className="w-[68%] h-[68%]" />}
              {!startFaculty && isEvent && <CampusEventIcon className="w-[70%] h-[70%]" />}
            </div>
          );
        })}

        {/* 4 Graduation Home Lanes */}
        {SEAT_HOME_COORDS.map((lane, seat) => {
          const teamId = getFacultyForSeat(seat);
          const faculty = teamId ? TEAMS[teamId] : null;
          return lane.map((coord, slotIdx) => (
            <div
              key={`home-${seat}-${slotIdx}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center text-[9px] sm:text-[11px] font-bold tabular-nums"
              style={{
                left: toPct(coord.col),
                top: toPct(coord.row),
                width: '7.5%',
                height: '7.5%',
                backgroundColor: faculty ? faculty.colorLight : '#EBE4D3',
                border: faculty ? `2px solid ${faculty.color}` : '1.5px dashed #BFB49A',
                color: faculty ? faculty.colorDark : '#9E937B',
              }}
            >
              {faculty ? toPersianDigits(slotIdx + 1) : ''}
            </div>
          ));
        })}

        {/* Center Graduation Crest at (5, 5) */}
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-xl flex items-center justify-center bg-[#152B38] border-2 border-[#EAB308] shadow-sm"
          style={{
            left: toPct(5),
            top: toPct(5),
            width: '9.2%',
            height: '9.2%',
          }}
        >
          <GraduationCapIcon className="w-[68%] h-[68%] text-[#FDE047]" />
        </div>

        {/* Target Destination Ghost Highlight */}
        {previewCoord && previewMove && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full z-20 flex items-center justify-center"
            style={{
              left: toPct(previewCoord.col),
              top: toPct(previewCoord.row),
              width: '8.8%',
              height: '8.8%',
              backgroundColor:
                previewMove.capturedPawnIds.length > 0
                  ? 'rgba(220, 38, 38, 0.28)'
                  : 'rgba(245, 195, 86, 0.36)',
              border:
                previewMove.capturedPawnIds.length > 0
                  ? '2.5px dashed #DC2626'
                  : '2.5px dashed #B45309',
            }}
          >
            {previewMove.capturedPawnIds.length > 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
            )}
          </div>
        )}

        {/* Capture Impact Burst */}
        {captureFlashCoord && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full border-4 border-red-500 animate-capture-burst"
            style={{
              left: toPct(captureFlashCoord.col),
              top: toPct(captureFlashCoord.row),
            }}
          />
        )}

        {/* Interactive Pawns Layer */}
        {pawnRenderList.map(({ pawn, coord, offsetX, offsetY, stacked }) => {
          const player = playerBySeat.get(pawn.playerId);
          if (!player) return null;
          const faculty = TEAMS[player.teamId];
          const move = interactive ? legalMoveByPawnId.get(pawn.id) : undefined;
          const isMovable = Boolean(move);
          const isGraduated = pawn.progress >= 40;

          const leftVal = ((coord.col + 0.5) / 11) * 100 + offsetX;
          const topVal = ((coord.row + 0.5) / 11) * 100 + offsetY;

          const pawnBody = (
            <div className="relative w-full h-full flex items-center justify-center">
              {isMovable && (
                <span
                  className="pointer-events-none absolute inset-[-4px] rounded-full border-[2.5px] border-amber-400 animate-ring-pulse"
                />
              )}
              <svg
                viewBox="0 0 36 36"
                className={`w-full h-full drop-shadow-[0_3px_3px_rgba(10,20,28,0.45)] ${
                  stacked ? 'scale-90' : 'scale-100'
                }`}
                aria-hidden="true"
              >
                {/* Ground base */}
                <circle
                  cx="18"
                  cy="20"
                  r="13.5"
                  fill={faculty.colorDark}
                  stroke="#0F1C24"
                  strokeWidth="2.2"
                />
                {/* Elevated top cap */}
                <circle
                  cx="18"
                  cy="16.5"
                  r="12"
                  fill={faculty.color}
                  stroke="#FFFDF7"
                  strokeWidth={isMovable ? '2.8' : '1.8'}
                />
                {/* Gloss top arc */}
                <ellipse cx="14.5" cy="12" rx="4.2" ry="2.2" fill="#FFFFFF" opacity="0.34" />
                {/* Inner graduation star or pawn number */}
                {isGraduated ? (
                  <path
                    d="M18 10.5l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z"
                    fill="#FDE047"
                  />
                ) : (
                  <circle cx="18" cy="16.5" r="3.6" fill="#FFFDF7" opacity="0.9" />
                )}
              </svg>
            </div>
          );

          if (isMovable && move) {
            return (
              <button
                key={pawn.id}
                type="button"
                data-testid={`pawn-${pawn.id}`}
                data-movable="true"
                aria-label={`حرکت مهره ${toPersianDigits(pawn.pawnIndex + 1)} ${faculty.shortName}${
                  move.capturedPawnIds.length > 0 ? ' (زدن حریف)' : ''
                }`}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setHoveredPawnId(null);
                  onSelectMove(move);
                }}
                onMouseEnter={() => setHoveredPawnId(pawn.id)}
                onMouseLeave={() => setHoveredPawnId(null)}
                onFocus={() => setHoveredPawnId(pawn.id)}
                onBlur={() => setHoveredPawnId(null)}
                className="absolute z-30 flex items-center justify-center rounded-full cursor-pointer animate-pawn-ready focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                style={{
                  left: `${leftVal}%`,
                  top: `${topVal}%`,
                  width: '10.2%',
                  height: '10.2%',
                  minWidth: '36px',
                  minHeight: '36px',
                  padding: '3px',
                  transition: 'left 115ms cubic-bezier(0.16, 1, 0.3, 1), top 115ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                {pawnBody}
              </button>
            );
          }

          return (
            <div
              key={pawn.id}
              data-testid={`pawn-${pawn.id}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center"
              style={{
                left: `${leftVal}%`,
                top: `${topVal}%`,
                width: '8.2%',
                height: '8.2%',
                transition: 'left 115ms cubic-bezier(0.16, 1, 0.3, 1), top 115ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {pawnBody}
            </div>
          );
        })}
      </div>
    </div>
  );
};
