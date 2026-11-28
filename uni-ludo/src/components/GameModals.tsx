import React, { useState } from 'react';
import { TEAMS } from '../../../portal/uniludo/constants';
import { getStandings, MatchState } from '../../../portal/uniludo/rules';
import { toPersianDigits } from '../utils/storage';
import { shareMatchResult } from '../utils/telegram';
import { CampusEventIcon, GraduationCapIcon, LibraryShieldIcon } from './FacultyIcon';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
  busy: boolean;
  error: string;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onReturnTitle,
  busy,
  error,
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#07131A]/75"
    role="dialog"
    aria-modal="true"
    aria-labelledby="pause-modal-title"
  >
    <div className="w-full max-w-sm rounded-3xl bg-[#22182E] border-2 border-[#4C355F] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.6)] text-center">
      <h2 id="pause-modal-title" className="font-display text-3xl text-[#FFFDF5]">
        توقف بازی
      </h2>
      <p className="text-sm text-[#D3C2E5] mt-1.5">
        یه استراحت کوتاه بین ترم‌ها!
      </p>

      <div className="mt-6 flex flex-col gap-2.5">
        {error && <p role="alert" className="game-error">{error}</p>}
        <button
          type="button"
          onClick={onResume} disabled={busy}
          className="w-full min-h-[48px] rounded-2xl bg-[#7335E3] hover:bg-[#8850EE] text-[#FFFDF5] font-extrabold text-sm cursor-pointer transition-transform active:scale-[0.98]"
        >
          ادامه بازی
        </button>
        <button
          type="button"
          onClick={onRestart} disabled={busy}
          className="w-full min-h-[46px] rounded-2xl bg-[#322145] hover:bg-[#442A60] text-[#FFFDF5] font-bold text-sm border border-[#5B4277] cursor-pointer transition-colors"
        >
          شروع مجدد این دست
        </button>
        <button
          type="button"
          onClick={onReturnTitle} disabled={busy}
          className="w-full min-h-[44px] rounded-2xl text-[#A8C1CF] hover:text-white font-medium text-sm cursor-pointer transition-colors"
        >
          بازگشت به صفحه اصلی
        </button>
      </div>
    </div>
  </div>
);

interface VictoryModalProps {
  match: MatchState;
  onPlayAgain: () => void;
  onReturnTitle: () => void;
  onRanking: () => void;
  busy: boolean;
  error: string;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  match,
  onPlayAgain,
  onReturnTitle,
  onRanking,
  busy,
  error,
}) => {
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const standings = getStandings(match);
  const winner = standings[0]?.player;
  const winnerFaculty = winner ? TEAMS[winner.teamId] : TEAMS.optimization;
  const humanWon = winner && !winner.isBot && winner.id === 0;

  const handleShare = async () => {
    const shareText = humanWon
      ? `در منچ صنایع با تیم ${winnerFaculty.shortName} در ${toPersianDigits(match.turnCount)} نوبت برنده شدم.`
      : `${winner?.name} با تیم ${winnerFaculty.shortName} برندهٔ منچ صنایع شد.`;
    const res = await shareMatchResult(shareText);
    if (res === 'copied') {
      setShareStatus('متن نتیجه کپی شد — تو گروه دانشگاه بفرست!');
    } else if (res === 'telegram' || res === 'share') {
      setShareStatus('پنجره اشتراک‌گذاری باز شد!');
    } else {
      setShareStatus('امکان اشتراک‌گذاری در این مرورگر نبود.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#07131A]/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="victory-modal-title"
    >
      <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl bg-[#22182E] border-2 border-[#594070] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.65)] text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-[#7335E3]/15 border-2 border-[#7335E3] flex items-center justify-center text-[#FDE047]">
          <GraduationCapIcon className="w-9 h-9" />
        </div>

        <h2 id="victory-modal-title" className="font-display text-3xl sm:text-4xl text-[#FFFDF5] mt-3">
          {humanWon ? 'فارغ‌التحصیل شدی!' : 'پایان ترم!'}
        </h2>
        <p className="text-sm text-[#E9DDF6] mt-1">
          <span className="font-bold text-[#DEC6FF]">{winner?.name}</span> با تیم{' '}
          {winnerFaculty.name} قهرمان این دست شد.
        </p>

        {/* Mastery metrics */}
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-[#1D1228] p-3 border border-[#294759]">
          <div>
            <div className="text-lg font-extrabold text-[#FFFDF5] tabular-nums">
              {toPersianDigits(match.turnCount)}
            </div>
            <div className="text-[11px] text-[#94B3C4]">تعداد نوبت</div>
          </div>
          <div>
            <div className="text-lg font-extrabold text-[#DEC6FF] tabular-nums">
              {toPersianDigits(winner?.captures ?? 0)}
            </div>
            <div className="text-[11px] text-[#94B3C4]">حذف حریف</div>
          </div>
          <div>
            <div className="text-lg font-extrabold text-[#6EE7B7] tabular-nums">
              {toPersianDigits(winner?.eventsTriggered ?? 0)}
            </div>
            <div className="text-[11px] text-[#94B3C4]">اتفاق ترم</div>
          </div>
        </div>

        {/* Standings list */}
        <div className="mt-4 space-y-1.5 text-right">
          {standings.map((entry, idx) => {
            const fac = TEAMS[entry.player.teamId];
            return (
              <div
                key={entry.player.id}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#0E202B] border border-[#244050]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-extrabold text-[#DEC6FF] w-5 tabular-nums">
                    {toPersianDigits(idx + 1)}.
                  </span>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: fac.color }}
                  />
                  <span className="text-xs sm:text-sm font-bold text-[#FFFDF5] truncate">
                    {entry.player.name}
                  </span>
                </div>
                <span className="text-xs text-[#A4BDCB] tabular-nums shrink-0">
                  {toPersianDigits(entry.graduated)}/۴ فارغ‌التحصیل
                </span>
              </div>
            );
          })}
        </div>

        {shareStatus && (
          <p className="mt-3 text-xs text-[#DEC6FF]">{shareStatus}</p>
        )}

        <div className="mt-5 flex flex-col gap-2.5">
          {error && <p role="alert" className="game-error">{error}</p>}
          {match.config.vsBots && <button type="button" onClick={onRanking} disabled={busy} className="game-secondary">نمایش رنکینگ</button>}
          <button
            type="button"
            data-start="true"
            onClick={onPlayAgain} disabled={busy}
            className="w-full min-h-[48px] rounded-2xl bg-[#7335E3] hover:bg-[#8850EE] text-[#FFFDF5] font-extrabold text-sm cursor-pointer transition-transform active:scale-[0.98]"
          >
            دوباره بازی کن
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="min-h-[44px] rounded-2xl bg-[#342046] hover:bg-[#452767] text-[#FFFDF5] font-bold text-xs sm:text-sm border border-[#604781] cursor-pointer transition-colors"
            >
              اشتراک در تلگرام
            </button>
            <button
              type="button"
              onClick={onReturnTitle} disabled={busy}
              className="min-h-[44px] rounded-2xl bg-[#0F232F] hover:bg-[#173242] text-[#D3C2E5] font-bold text-xs sm:text-sm border border-[#453253] cursor-pointer transition-colors"
            >
              تغییر تنظیمات
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface RulesModalProps {
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ onClose }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#07131A]/75"
    role="dialog"
    aria-modal="true"
    aria-labelledby="rules-modal-title"
  >
    <div className="w-full max-w-md rounded-3xl bg-[#22182E] border-2 border-[#4C355F] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.6)] text-right">
      <h2 id="rules-modal-title" className="font-display text-3xl text-[#FFFDF5]">
        قوانین منچ صنایع
      </h2>

      <ul className="mt-4 space-y-3 text-sm text-[#E9DDF6] leading-relaxed">
        <li className="flex items-start gap-2.5">
          <span className="font-extrabold text-[#7335E3] mt-0.5">۱.</span>
          <span>
            برای بیرون آوردن مهره از خوابگاه باید <strong className="text-white">۶</strong> بیاری (وقتی هیچ مهره‌ای تو مسیر نداری، تا <strong className="text-white">۳ بار</strong> شانس تاس انداختن داری!). آوردن ۶ و یا زدن مهره حریف، یه <strong className="text-white">تاس اضافه</strong> می‌ده.
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <LibraryShieldIcon className="w-5 h-5 shrink-0 mt-0.5" />
          <span>
            <strong className="text-white">خانه‌های کتابخانه:</strong> امن هستن و هیچ‌کس نمی‌تونه اونجا مهره‌ات رو بزنه.
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <CampusEventIcon className="w-5 h-5 shrink-0 mt-0.5" />
          <span>
            <strong className="text-white">خانه‌های اتفاق ترم (حالت دانشجویی):</strong> با نشستن روشون یه اتفاق تصادفی دانشجویی مثل اسپرسو بوفه، جزوه طلایی یا خواب موندن کلاس ۸ صبح می‌افته!
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <GraduationCapIcon className="w-5 h-5 shrink-0 mt-0.5 text-[#FDE047]" />
          <span>
            هر کس زودتر هر <strong className="text-white">۴ مهره</strong> رو با عدد دقیق وارد خط فارغ‌التحصیلی وسط صفحه کنه، قهرمان ترم می‌شه.
          </span>
        </li>
      </ul>

      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full min-h-[46px] rounded-2xl bg-[#7335E3] hover:bg-[#8850EE] text-[#FFFDF5] font-extrabold text-sm cursor-pointer transition-transform active:scale-[0.98]"
      >
        فهمیدم، بزن بریم!
      </button>
    </div>
  </div>
);
