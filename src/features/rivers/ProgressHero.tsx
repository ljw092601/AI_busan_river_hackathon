/**
 * 전체 탐험 달성도 배너.
 *
 * example_html.html의 gradient hero를 그대로 옮겼습니다.
 * FontAwesome 대신 이모지를 씁니다.
 */

export interface ProgressHeroProps {
  /** 미션 + 퀴즈를 모두 끝낸 하천 수 */
  completed: number;
  /** 전체 하천 수 (보통 5) */
  total: number;
}

export function ProgressHero({ completed, total }: ProgressHeroProps) {
  const safeTotal = total > 0 ? total : 0;
  const percent = safeTotal > 0 ? Math.round((completed / safeTotal) * 100) : 0;

  return (
    <section className="mb-8 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-10 pointer-events-none select-none"
        aria-hidden="true"
      >
        <span className="text-[8rem] leading-none absolute -bottom-10 -right-6">🌊</span>
      </div>

      <div className="relative z-10 max-w-2xl">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-semibold backdrop-blur-md mb-3">
          <span aria-hidden="true">🗺️</span> 미션 + 퀴즈 완수형 에듀테인먼트
        </span>
        <h2 className="text-2xl sm:text-3xl font-black mb-2 leading-tight break-keep">
          부산 하천에 숨겨진 비밀을 풀고
          <br />
          에코 탐험가 배지를 모두 모아보세요!
        </h2>
        <p className="text-emerald-100 text-xs sm:text-sm mb-5 font-light break-keep">
          각 하천별 <strong>[체험 미션]</strong>과 <strong>[생태·역사 퀴즈]</strong>를 모두 완수하면
          해당 하천의 에코 탐험 배지가 수여됩니다!
        </p>

        <div className="bg-black/20 backdrop-blur-md p-4 rounded-2xl border border-white/10">
          <div className="flex justify-between items-center text-xs font-bold mb-2">
            <span>
              전체 탐험 달성도{' '}
              <span className="font-medium text-emerald-100">
                ({completed}/{safeTotal} 하천)
              </span>
            </span>
            <span className="text-amber-300 font-extrabold text-sm">{percent}%</span>
          </div>
          <div
            className="w-full bg-black/30 rounded-full h-3 overflow-hidden p-0.5"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={safeTotal}
            aria-valuenow={completed}
            aria-label="전체 탐험 달성도"
          >
            <div
              className="bg-gradient-to-r from-amber-400 to-amber-300 h-full rounded-full transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
