import React, { useMemo } from 'react';
import { createInitialMatch, GameConfig } from '../../../portal/uniludo/rules';
import { StoredPlayerStats, toPersianDigits } from '../utils/storage';
import {
  CampusEventIcon,
  TeamSymbol,
  GraduationCapIcon,
  LibraryShieldIcon,
} from './FacultyIcon';
import { MenchBoard } from './MenchBoard';
import { GameBrand } from './GameBrand';
import { TeamPicker } from './TeamPicker';

interface TitleScreenProps {
  config: GameConfig;
  stats: StoredPlayerStats;
  onChangeConfig: (patch: Partial<GameConfig>) => void;
  onStart: () => void;
  onOpenRules: () => void;
  onRanking: () => void;
  onBack: () => void;
  error: string;

}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  config,
  stats,
  onChangeConfig,
  onStart,
  onOpenRules,
  onRanking,
  onBack,
  error,

}) => {
  // Live preview match staged with a couple of pawns on track for authentic visual appeal
  const previewMatch = useMemo(() => {
    const match = createInitialMatch(config);
    match.pawns.forEach((p, idx) => {
      if (idx % 4 === 0) p.progress = 4;
      if (idx % 4 === 1) p.progress = 12;
    });
    return match;
  }, [config]);

  return (
    <div className="game-setup">
      {/* Main Content Grid: Full 1440px 2-column showcase on desktop, balanced portrait stack on mobile */}
      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-4 sm:py-6 flex flex-col lg:grid lg:grid-cols-12 lg:items-center gap-4 lg:gap-10 ">
        {/* Right column in RTL: Title Emblem + Setup Controls + Primary Start CTA */}
        <section className="game-setup-card lg:col-span-6 flex flex-col items-center lg:items-stretch justify-center gap-4 sm:gap-5">
          <div className="flex flex-col items-center">
            <GameBrand />
            <p className="text-xs sm:text-sm text-[#D9CDEA] text-center -mt-1">برای دانشجویان مهندسی صنایع دانشگاه آزاد مشهد</p>
          </div>

          {/* Faculty Selector */}
          <div className="w-full max-w-md mx-auto space-y-3.5">
            <TeamPicker selected={config.humanTeam} onSelect={team => onChangeConfig({humanTeam:team})} />

            <label className="block text-sm font-bold">
              سطح حریف‌های رباتی
              <select className="game-field" value={config.botDifficulty ?? 'normal'}
                onChange={event => onChangeConfig({botDifficulty: event.target.value as GameConfig['botDifficulty']})}>
                <option value="easy">ضعیف</option>
                <option value="normal">متوسط</option>
                <option value="hard">قوی</option>
              </select>
            </label>

            {/* Player Count */}
            <div className="p-1 rounded-2xl bg-[#100C17]/90 border border-[#49345E] grid grid-cols-3 gap-1">
              {([2, 3, 4] as const).map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => onChangeConfig({ playerCount: count })}
                  aria-pressed={config.playerCount === count}
                  className={`min-h-[42px] rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    config.playerCount === count
                      ? 'bg-[#542D81] text-[#FFFDF5]'
                      : 'text-[#D3C2E5] hover:text-white'
                  }`}
                >
                  {toPersianDigits(count)} نفره
                </button>
              ))}
            </div>

            {/* Primary Start CTA + Secondary Rules button (<= 2 actions) */}
            <div className="pt-1 flex items-center gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={onStart}
                className="flex-1 min-h-[54px] rounded-2xl bg-[#7335E3] hover:bg-[#8850EE] active:scale-[0.98] text-[#FFFDF5] font-extrabold text-base sm:text-lg shadow-[0_6px_0_#401991,0_14px_28px_rgba(0,0,0,0.45)] transition-transform cursor-pointer flex items-center justify-center gap-2"
              >
                <TeamSymbol teamId={config.humanTeam} className="w-5 h-5" />
                <span>شروع بازی</span>
              </button>
              <button
                type="button"
                onClick={onOpenRules}
                aria-label="قوانین بازی"
                className="min-h-[54px] px-4 rounded-2xl bg-[#2C1C3A] hover:bg-[#3C2550] text-[#F1E8FC] font-bold text-sm border border-[#594070] cursor-pointer transition-colors whitespace-nowrap"
              >
                قوانین
              </button>
            </div>

            <button type="button" onClick={onRanking} className="game-secondary w-full">رنکینگ</button>
            {error && <p role="alert" className="game-error">{error}</p>}

            {/* Compact Campus Board Key (Clean unboxed legend matching real in-game icons) */}
            <div className="pt-2 border-t border-[#49345E]/60 flex items-center justify-around text-[11px] text-[#D3C2E5]">
              <div className="flex items-center gap-1.5">
                <LibraryShieldIcon className="w-4 h-4 shrink-0" />
                <span>کتابخانه امن</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CampusEventIcon className="w-4 h-4 shrink-0" />
                <span>اتفاق ترم</span>
              </div>
              <div className="flex items-center gap-1.5">
                <GraduationCapIcon className="w-4 h-4 shrink-0 text-[#FDE047]" />
                <span>فارغ‌التحصیلی</span>
              </div>
            </div>

            {/* Quiet unboxed career metadata if player has history */}
            {stats.matchesPlayed > 0 && (
              <div className="flex items-center justify-center gap-2 text-xs text-[#C1ADD9] tabular-nums">
                <span>بازی با ربات: {toPersianDigits(stats.matchesPlayed)}</span>
                <span aria-hidden="true">·</span>
                <span>برد: {toPersianDigits(stats.wins)}</span>
                <span aria-hidden="true">·</span>
                <span>حذف حریف: {toPersianDigits(stats.totalCaptures)}</span>
              </div>
            )}
            <button type="button" onClick={onBack} className="game-secondary w-full">بازگشت</button>
          </div>
        </section>

        {/* Left column in RTL (Desktop Showcase): Live Mench Board Centerpiece */}
        <section className="hidden lg:flex lg:col-span-6 items-center justify-center">
          <div className="w-full max-w-[490px] transform -rotate-1 hover:rotate-0 transition-transform duration-300">
            <MenchBoard
              players={previewMatch.players}
              pawns={previewMatch.pawns}
              activePlayerId={0}
              legalMoves={[]}
              ruleMode={config.ruleMode}
              animatingPawnCoord={null}
              captureFlashCoord={null}
              onSelectMove={() => {}}
              interactive={false}
            />
          </div>
        </section>
      </main>

      {/* Single flat, borderless control-hint line in bottom safe margin */}
      <p
        className="relative z-10 w-full text-center px-4 pb-3 pt-1 text-[11px] sm:text-xs text-[#C0ADDA]"
        style={{ paddingBottom: 'max(0.75rem, var(--safe-bottom))' }}
      >
        تاس: Space یا کلیک · حرکت: کلیک روی مهره روشن · توقف: Esc
      </p>
    </div>
  );
};
