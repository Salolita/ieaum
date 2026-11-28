import React from 'react';
import { TEAMS, PAWNS_PER_PLAYER } from '../../../portal/uniludo/constants';
import { PlayerState } from '../../../portal/uniludo/rules';
import { toPersianDigits } from '../utils/storage';
import { TeamSymbol, GraduationCapIcon } from './FacultyIcon';

interface PlayerHudCardProps {
  player: PlayerState;
  graduatedCount: number;
  isActive: boolean;
  compact?: boolean;
}

export const PlayerHudCard: React.FC<PlayerHudCardProps> = ({
  player,
  graduatedCount,
  isActive,
  compact = false,
}) => {
  const faculty = TEAMS[player.teamId];

  return (
    <div
      dir="rtl"
      data-testid={`player-hud-${player.id}`}
      data-active={isActive ? 'true' : 'false'}
      className={`relative flex items-center gap-2.5 rounded-2xl transition-all duration-150 ${
        compact ? 'px-2 py-2' : 'px-3.5 py-2.5'
      }`}
      style={{
        backgroundColor: isActive ? 'rgba(20, 46, 61, 0.94)' : 'rgba(13, 30, 40, 0.78)',
        border: isActive
          ? `2px solid ${faculty.ringColor}`
          : '2px solid rgba(148, 179, 196, 0.18)',
        boxShadow: isActive ? `0 8px 20px rgba(0, 0, 0, 0.35)` : 'none',
      }}
    >
      <div
        className={`relative shrink-0 overflow-hidden rounded-xl border-2 ${
          compact ? 'w-9 h-9' : 'w-12 h-12'
        }`}
        style={{
          borderColor: isActive ? '#7335E3' : faculty.color,
          backgroundColor: faculty.colorDark,
        }}
      >
        <div className="w-full h-full flex items-center justify-center text-white">
          <TeamSymbol teamId={faculty.id} className="w-5 h-5" />
        </div>
      </div>

      {/* Name + Graduation Pips */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-xs sm:text-sm font-bold text-[#FFFDF5] break-words min-w-0">
            {player.name}
          </span>
          <span
            className="text-[11px] font-bold tabular-nums shrink-0"
            style={{ color: isActive ? '#DEC6FF' : '#94B3C4' }}
          >
            {toPersianDigits(graduatedCount)}/{toPersianDigits(PAWNS_PER_PLAYER)}
          </span>
        </div>

        {/* Unboxed quiet metadata line */}
        <div className="flex items-center gap-1.5 text-[11px] text-[#A4BDCB] mt-0.5 truncate">
          <span>{faculty.shortName}</span>
          {player.captures > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                زدن: {toPersianDigits(player.captures)}
              </span>
            </>
          )}
        </div>

        {/* 4 Graduation Mortarboard Sockets */}
        <div className="flex items-center gap-1 mt-1" aria-label={`فارغ‌التحصیلی ${graduatedCount} از ۴`}>
          {Array.from({ length: PAWNS_PER_PLAYER }).map((_, idx) => {
            const filled = idx < graduatedCount;
            return (
              <GraduationCapIcon
                key={idx}
                filled={filled}
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  filled ? 'scale-105' : 'opacity-35'
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
