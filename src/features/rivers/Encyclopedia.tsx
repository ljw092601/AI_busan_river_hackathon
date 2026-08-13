import { themeOf } from './theme';
import type { RiverView } from './types';

/**
 * 하천 대백과 탭 — 하천별 역사 이야기 + 생태 환경 & 특징 패널.
 */

export interface EncyclopediaProps {
  rivers: RiverView[];
}

export function Encyclopedia({ rivers }: EncyclopediaProps) {
  if (rivers.length === 0) {
    return (
      <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6 text-center">
        아직 등록된 하천 정보가 없어요.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {rivers.map((river) => {
        const theme = themeOf(river.theme);
        return (
          <article
            key={river.id}
            className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-sm hover:shadow-md transition-all"
          >
            <header className="flex items-center gap-4 mb-4 border-b border-slate-100 pb-3">
              <span
                className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${theme.gradient} text-white flex items-center justify-center text-2xl shadow-md shrink-0`}
                aria-hidden="true"
              >
                {river.icon || '💧'}
              </span>
              <div className="min-w-0">
                <h4 className="text-lg sm:text-xl font-bold text-slate-800 break-keep">
                  {river.name}
                </h4>
                <p className={`text-xs ${theme.accent} font-semibold break-keep`}>
                  {river.subtitle}
                </p>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-700">
              <section className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <h5 className="font-bold text-slate-800 mb-1 text-sm flex items-center gap-1.5">
                  <span aria-hidden="true">🏛️</span> 역사 이야기
                </h5>
                <p className="leading-relaxed break-keep">
                  {river.detailedHistory || '역사 이야기를 준비하고 있어요.'}
                </p>
              </section>
              <section className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100">
                <h5 className="font-bold text-emerald-900 mb-1 text-sm flex items-center gap-1.5">
                  <span aria-hidden="true">🌿</span> 생태 환경 &amp; 특징
                </h5>
                <p className="leading-relaxed text-emerald-950 break-keep">
                  {river.detailedEcology || '생태 이야기를 준비하고 있어요.'}
                </p>
              </section>
            </div>
          </article>
        );
      })}
    </div>
  );
}
