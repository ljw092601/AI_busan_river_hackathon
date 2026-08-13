import { hasCoordinates, lockNote } from './location';
import { themeOf } from './theme';
import { isRiverComplete, solvedCount, type LockState, type RiverView } from './types';

/**
 * 하천 한 곳 카드.
 *
 * 카드 전체가 하나의 버튼입니다 — 아이 손가락 기준 탭 타깃을 최대한 크게 잡고,
 * 카드 안에 버튼을 또 넣어 중첩 인터랙티브 요소가 생기는 것을 피했습니다.
 * 아래 CTA는 버튼처럼 보이는 <span>입니다.
 *
 * ⚠️ 상태 칩은 **있는 단계만** 씁니다. 미션이 없는 수영강에 '미션 ❌'를 붙이면
 *    영원히 못 끝내는 하천처럼 보입니다. 완수 판정은 types.ts의 isRiverComplete만 씁니다.
 *
 * ★ 잠금(위치)
 *   잠겨 있어도 카드는 **누를 수 있습니다**. 모달을 열면 하천 대백과를 읽을 수 있고,
 *   잠긴 것은 그 안의 미션/퀴즈뿐입니다. 여기서 눌리지 않게 막으면 아이 입장에서는
 *   "고장난 카드"가 되고, 왜 안 되는지도 알 수 없습니다.
 *   대신 카드를 흐리게 하고 🔒과 남은 거리를 붙여 "가까이 가면 열린다"를 보여 줍니다.
 */

export interface RiverCardProps {
  river: RiverView;
  onOpen: (river: RiverView) => void;
  /** 위치 잠금 상태. 없으면 잠그지 않습니다(위치 기능이 붙기 전과 동일). */
  lock?: LockState | null;
  /** 위치를 받았을 때 가장 가까운 하천이면 true. */
  nearest?: boolean;
  /** 기기가 보고한 오차 반경(m). 크면 거리를 단정하지 않습니다. */
  accuracy?: number | null;
}

export function RiverCard({ river, onOpen, lock = null, nearest = false, accuracy = null }: RiverCardProps) {
  const theme = themeOf(river.theme);
  const done = isRiverComplete(river) || river.badgeEarned;
  const totalQuizzes = river.quizzes.length;

  const locked = lock?.locked ?? false;
  const note = lock ? lockNote(lock, accuracy, hasCoordinates(river)) : null;

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
      data-locked={locked ? 'true' : 'false'}
      onClick={() => onOpen(river)}
      className={`text-left bg-white rounded-2xl border shadow-sm p-5 flex flex-col justify-between card-hover relative overflow-hidden w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
        locked ? 'border-slate-200 opacity-70 grayscale-[35%]' : 'border-slate-100'
      } ${nearest ? 'ring-2 ring-emerald-400' : ''}`}
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
        {nearest ? (
          <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full mb-2">
            <span aria-hidden="true">📍</span> 가장 가까워요
          </span>
        ) : null}

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
        {/* 백과 성격의 요약은 잠겨 있어도 흐리지 않고 그대로 읽힙니다. */}
        <span className="block text-slate-600 text-xs leading-relaxed mb-3 break-keep">
          {river.summary}
        </span>
      </span>

      <span className="block">
        {note ? (
          <span
            className={`flex items-center gap-1.5 text-[11px] font-bold mb-2 break-keep rounded-xl px-2.5 py-1.5 ${
              locked
                ? 'bg-slate-100 text-slate-600'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            <span aria-hidden="true">{locked ? '🔒' : '✅'}</span>
            <span>{note}</span>
          </span>
        ) : null}

        <span
          className={`w-full min-h-[44px] py-3 px-4 ${
            locked ? 'bg-slate-400' : theme.button
          } text-white font-bold text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2`}
        >
          {locked ? (
            <span aria-hidden="true" className="text-xs">
              🔒
            </span>
          ) : null}
          <span>{cta}</span>
          <span aria-hidden="true" className="text-xs">
            →
          </span>
        </span>
      </span>
    </button>
  );
}
