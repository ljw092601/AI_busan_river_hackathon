import { themeOf } from './theme';
import { isRiverComplete, solvedCount, type RiverView } from './types';

/**
 * 하천 한 곳 카드.
 *
 * 카드 전체가 하나의 버튼입니다 — 아이 손가락 기준 탭 타깃을 최대한 크게 잡고,
 * 카드 안에 버튼을 또 넣어 중첩 인터랙티브 요소가 생기는 것을 피했습니다.
 * 아래 CTA는 버튼처럼 보이는 <span>입니다.
 *
 * ⚠️ 상태 칩은 **있는 단계만** 씁니다. 미션이 없는 수영강에 '미션 ❌'를 붙이면
 *    영원히 못 끝내는 하천처럼 보입니다. 완수 판정은 types.ts의 isRiverComplete만 씁니다.
 */

export interface RiverCardProps {
  river: RiverView;
  onOpen: (river: RiverView) => void;
}

export function RiverCard({ river, onOpen }: RiverCardProps) {
  const theme = themeOf(river.theme);
  const done = isRiverComplete(river) || river.badgeEarned;
  const totalQuizzes = river.quizzes.length;

  const statusParts: string[] = [];
  if (river.hasMission) statusParts.push(`미션 ${river.missionDone ? '✅' : '❌'}`);
  if (totalQuizzes > 0) statusParts.push(`퀴즈 ${solvedCount(river)}/${totalQuizzes}`);

  const cta = done
    ? '탐험 다시보기'
    : river.hasMission && totalQuizzes > 0
      ? '미션 & 퀴즈 도전'
      : river.hasMission
        ? '체험 미션 도전'
        : '생태·역사 퀴즈 도전';

  return (
    <button
      type="button"
      data-river-card={river.slug}
      onClick={() => onOpen(river)}
      className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col justify-between card-hover relative overflow-hidden w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
    >
      {done ? (
        <span className="absolute top-3 right-3 bg-amber-500 text-white text-[11px] font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md z-10">
          <span aria-hidden="true">🏅</span> 완수 완료
        </span>
      ) : statusParts.length > 0 ? (
        <span className="absolute top-3 right-3 bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full z-10">
          {statusParts.join(' | ')}
        </span>
      ) : null}

      <span className="block">
        <span
          className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${theme.gradient} text-white flex items-center justify-center text-2xl mb-4 shadow-md`}
          aria-hidden="true"
        >
          {river.icon || '💧'}
        </span>
        <span className="block text-lg font-bold text-slate-800 mb-1 break-keep pr-20">
          {river.name}
        </span>
        <span className={`block text-xs font-semibold ${theme.accent} mb-2 break-keep`}>
          {river.subtitle}
        </span>
        <span className="block text-slate-600 text-xs leading-relaxed mb-4 break-keep">
          {river.summary}
        </span>
      </span>

      <span
        className={`w-full min-h-[44px] py-3 px-4 ${theme.button} text-white font-bold text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2`}
      >
        <span>{cta}</span>
        <span aria-hidden="true" className="text-xs">
          →
        </span>
      </span>
    </button>
  );
}
