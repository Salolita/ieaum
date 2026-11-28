import React, { useMemo } from 'react';
import { TEAMS, TEAM_ORDER } from '../../../portal/uniludo/constants';
import backdrop from '../assets/campus.jpg';
import { createInitialMatch, GameConfig } from '../../../portal/uniludo/rules';
import { StoredPlayerStats, toPersianDigits } from '../utils/storage';
import {
  CampusEventIcon,
  TeamSymbol,
  GraduationCapIcon,
  LibraryShieldIcon,
} from './FacultyIcon';
import { MenchBoard } from './MenchBoard';
import { TitleEmblem } from './TitleEmblem';

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

  const selectedFaculty = TEAMS[config.humanTeam];

  return (
    <div className="relative w-full h-dvh overflow-hidden flex flex-col justify-between bg-[#130F1B]">
      {/* Atmospheric dorm desk backdrop with measured scrim */}
      <img
        src={backdrop}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-55"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#110B19]/80 via-[#1D1228]/65 to-[#100C17]/92"
      />

      {/* Main Content Grid: Full 1440px 2-column showcase on desktop, balanced portrait stack on mobile */}
      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-4 sm:py-6 flex flex-col lg:grid lg:grid-cols-12 lg:items-center gap-4 lg:gap-10 overflow-y-auto">
        {/* Right column in RTL: Title Emblem + Setup Controls + Primary Start CTA */}
        <section className="lg:col-span-6 flex flex-col items-center lg:items-stretch justify-center gap-4 sm:gap-5">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 font-semibold">
              <img src="/ieaum-shell-mark.png" width={32} height={32} alt="" className="rounded-lg" /><bdi>IEAUM</bdi>
            </div>
            <TitleEmblem />
            <p className="text-xs sm:text-sm text-[#D9CDEA] text-center -mt-1">برای دانشجویان مهندسی صنایع دانشگاه آزاد مشهد</p>
          </div>

          {/* Faculty Selector */}
          <div className="w-full max-w-md mx-auto space-y-3.5">
            <div>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <span className="text-xs font-bold text-[#D3C2E5]">تیم خودت را انتخاب کن</span>
                <span className="text-xs text-[#DEC6FF] font-medium">{selectedFaculty.name}</span>
              </div>
              <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="انتخاب تیم">
                {TEAM_ORDER.map((facId) => {
                  const fac = TEAMS[facId];
                  const active = config.humanTeam === facId;
                  return (
                    <button
                      key={facId}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onChangeConfig({ humanTeam: facId })}
                      className={`group flex flex-col items-center gap-1.5 p-1.5 rounded-2xl border-2 transition-transform duration-150 cursor-pointer active:scale-95 ${
                        active ? 'bg-[#322145] scale-[1.03]' : 'bg-[#1D1429]/85 hover:bg-[#30213E]'
                      }`}
                      style={{
                        borderColor: active ? '#7335E3' : 'rgba(148,179,196,0.2)',
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl grid place-items-center border-2"
                        style={{ borderColor: fac.color, backgroundColor: fac.colorDark }}
                      >
                        <TeamSymbol teamId={facId} className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-bold text-[#FFFDF5] text-center">
                        {fac.shortName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

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

            <button type="button" onClick={onBack} className="game-secondary w-full">بازگشت</button>
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
      <footer
        className="relative z-10 w-full text-center px-4 pb-3 pt-1 text-[11px] sm:text-xs text-[#C0ADDA]"
        style={{ paddingBottom: 'max(0.75rem, var(--safe-bottom))' }}
      >
        تاس: Space یا کلیک · حرکت: کلیک روی مهره روشن · توقف: Esc
      </footer>
    </div>
  );
};
