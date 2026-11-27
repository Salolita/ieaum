import React, { useId } from 'react';
import { TEAMS, TeamId } from '../../../portal/uniludo/constants';
import { toPersianDigits } from '../utils/storage';

interface DiceWidgetProps {
  value: number;
  rolling: boolean;
  canRoll: boolean;
  activeFacultyId: TeamId;
  activePlayerName: string;
  isBotTurn: boolean;
  promptText: string;
  onRoll: () => void;
}

const PIP_POSITIONS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 24],
    [72, 24],
    [28, 50],
    [72, 50],
    [28, 76],
    [72, 76],
  ],
};

export const DiceWidget: React.FC<DiceWidgetProps> = ({
  value,
  rolling,
  canRoll,
  activeFacultyId,
  activePlayerName,
  isBotTurn,
  promptText,
  onRoll,
}) => {
  const gradId = useId();
  const faculty = TEAMS[activeFacultyId];
  const pips = PIP_POSITIONS[value] ?? PIP_POSITIONS[1];
  const isSix = value === 6 && !rolling;

  return (
    <div className="flex items-center gap-3 w-full">
      <button
        type="button"
        onClick={(e) => {
          e.currentTarget.blur();
          if (canRoll) onRoll();
        }}
        disabled={!canRoll}
        data-testid="dice-button"
        aria-label={canRoll ? 'انداختن تاس' : `عدد تاس ${toPersianDigits(value)}`}
        className={`relative shrink-0 w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-2xl flex items-center justify-center transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 ${
          canRoll
            ? 'cursor-pointer hover:scale-105 active:scale-95'
            : 'cursor-default opacity-95'
        }`}
        style={{
          backgroundColor: faculty.color,
          boxShadow: canRoll
            ? `0 6px 0 ${faculty.colorDark}, 0 10px 24px rgba(0,0,0,0.42)`
            : `0 4px 0 ${faculty.colorDark}`,
        }}
      >
        {canRoll && (
          <span
            className="pointer-events-none absolute -inset-1 rounded-[20px] border-2 animate-ring-pulse"
            style={{ borderColor: '#DEC6FF' }}
          />
        )}
        <svg
          viewBox="0 0 100 100"
          className={`w-12 h-12 sm:w-14 sm:h-14 ${rolling ? 'animate-dice-tumble' : ''}`}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFFDF7" />
              <stop offset="100%" stopColor="#E6DCC6" />
            </linearGradient>
          </defs>
          <rect
            x="6"
            y="6"
            width="88"
            height="88"
            rx="18"
            fill={`url(#${gradId})`}
            stroke="#1F1A14"
            strokeWidth="5"
          />
          {pips.map(([cx, cy], i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={value === 1 ? 11 : 8.5}
              fill={isSix || value === 1 ? '#D9383A' : '#182A36'}
            />
          ))}
        </svg>
      </button>

      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm sm:text-base font-bold text-[#FFFDF5] truncate">
            {activePlayerName}
          </span>
          <span
            className="text-xs font-bold tabular-nums shrink-0"
            style={{ color: isSix ? '#DEC6FF' : '#CBD5E1' }}
          >
            {rolling ? 'در حال چرخش...' : `تاس: ${toPersianDigits(value)}`}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-[#E9DDF6] truncate mt-0.5">
          {promptText}
        </p>
        {canRoll && !isBotTurn && (
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onRoll();
            }}
            className="mt-1.5 inline-flex items-center justify-center px-3.5 py-1.5 min-h-[36px] rounded-xl text-xs font-bold text-[#FFFDF5] bg-[#7335E3] hover:bg-[#8850EE] active:scale-[0.98] transition-transform cursor-pointer whitespace-nowrap"
          >
            تاس بنداز
          </button>
        )}
      </div>
    </div>
  );
};
