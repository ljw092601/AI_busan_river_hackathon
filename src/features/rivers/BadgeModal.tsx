import { useEffect, useRef } from 'react';
import { useBadges } from './queries';
import { isRiverComplete, type RiverView } from './types';
import { useBackdropClose, useModalBehavior } from './useModalBehavior';

/**
 * 나의 탐험 배지 수첩.
 *
 * 하천 5곳을 기준으로 줄을 그립니다 — badges 테이블에는 도감/코스 배지도 함께 있어서
 * 그대로 다 뿌리면 하천과 무관한 배지가 섞입니다. river.badgeCode로 매칭하고,
 * 매칭이 안 되면 하천 정보만으로 잠긴 줄을 보여줍니다.
 */

export interface BadgeModalProps {
  rivers: RiverView[];
  onClose: () => void;
}

function formatEarnedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

export function BadgeModal({ rivers, onClose }: BadgeModalProps) {
  const { data: badges, isPending, error } = useBadges();
  const closeRef = useRef<HTMLButtonElement>(null);

  useModalBehavior(onClose);
  const backdrop = useBackdropClose(onClose);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const byCode = new Map((badges ?? []).map((b) => [b.code, b]));
  const rows = rivers.map((river) => {
    const badge = river.badgeCode ? byCode.get(river.badgeCode) : undefined;
    const earnedAt = badge?.earnedAt ?? null;
    return {
      key: river.id,
      title: badge?.name ?? `${river.name} 에코 탐험 배지`,
      riverName: river.name,
      earned: Boolean(earnedAt) || river.badgeEarned || isRiverComplete(river),
      earnedAt,
    };
  });

  const earnedCount = rows.filter((r) => r.earned).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      {...backdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-modal-title"
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-5 sm:p-6 max-h-[90vh] flex flex-col"
      >
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl" aria-hidden="true">
              🏅
            </span>
            <h3 id="badge-modal-title" className="text-lg sm:text-xl font-bold text-slate-800 break-keep">
              나의 탐험 배지 수첩
            </h3>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="배지 수첩 닫기"
            className="w-11 h-11 -mr-2 shrink-0 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center text-lg transition-all"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-4 break-keep">
          하천별 미션과 퀴즈를 모두 해결해 5대 하천 배지를 완성해보세요!{' '}
          <span className="font-bold text-amber-600">
            {earnedCount}/{rows.length} 획득
          </span>
        </p>

        <div className="space-y-3 overflow-y-auto flex-grow">
          {error ? (
            <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-2xl p-4">
              배지 정보를 불러오지 못했어요. 잠시 후 다시 열어주세요.
            </p>
          ) : isPending && rows.length === 0 ? (
            <p className="text-xs text-slate-500 p-4 text-center">배지를 불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-slate-500 p-4 text-center">아직 등록된 배지가 없어요.</p>
          ) : (
            rows.map((row) => (
              <div
                key={row.key}
                className={`flex items-center gap-3 p-3 rounded-2xl border ${
                  row.earned ? 'bg-amber-50/50 border-amber-200' : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <span
                  className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-lg ${
                    row.earned ? 'bg-amber-500 text-white shadow-md' : 'bg-slate-200 text-slate-400'
                  }`}
                  aria-hidden="true"
                >
                  {row.earned ? '🏅' : '🔒'}
                </span>
                <div className="flex-grow min-w-0">
                  <h5
                    className={`font-bold text-xs break-keep ${
                      row.earned ? 'text-amber-900' : 'text-slate-600'
                    }`}
                  >
                    {row.title}
                  </h5>
                  <p className="text-[10px] text-slate-500 break-keep">
                    {row.riverName} 미션 &amp; 퀴즈{' '}
                    {row.earned
                      ? row.earnedAt
                        ? `완전 달성! (${formatEarnedAt(row.earnedAt)} 획득)`
                        : '완전 달성!'
                      : '진행 필요'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full min-h-[44px] py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-2xl text-sm transition-all shadow-md"
        >
          확인
        </button>
      </div>
    </div>
  );
}
