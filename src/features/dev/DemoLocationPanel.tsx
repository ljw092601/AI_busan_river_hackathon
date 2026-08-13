import { useState } from 'react';
import {
  formatDistance,
  distanceMeters,
  getSimulatedPosition,
  isDemoMode,
  setSimulatedPosition,
  useGeolocation,
} from '@/lib/geo';
import { useRivers } from '@/features/rivers/queries';

/**
 * 시연용 위치 이동 패널.
 *
 * 현장에 가지 않고도 각 하천 반경 안으로 "순간이동"해서 잠금해제를 보여줍니다.
 *
 * ── 언제 보이는가 ────────────────────────────────────────────────────────
 *   · 개발 서버(`npm run dev`)에서는 항상
 *   · 배포본에서는 주소 끝에 `?demo=1` 을 붙였을 때만 (그 뒤 세션 동안 유지)
 *   일반 방문자에게는 존재 자체가 보이지 않습니다.
 *
 * ⚠️ 위치를 속이는 도구이므로 **켜져 있는 동안 항상 화면에 표시**됩니다.
 *    잠금 판정은 원래 클라이언트 측이라 이 버튼이 새로운 우회 경로를 만드는 것은
 *    아니지만, 시연 중에 "진짜 GPS로 된 것"처럼 보이면 안 됩니다.
 *    심사·발표에서 이 패널이 열려 있으면 시뮬레이션임을 밝혀 주세요.
 */
export function DemoLocationPanel() {
  const [open, setOpen] = useState(false);
  const { rivers } = useRivers();
  const { position, isSimulated } = useGeolocation();

  if (!isDemoMode()) return null;

  const active = getSimulatedPosition();

  return (
    <div className="fixed bottom-3 right-3 z-[70] flex flex-col items-end gap-2">
      {open && (
        <div className="w-[min(92vw,20rem)] rounded-2xl border border-slate-300 bg-white shadow-2xl p-3 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-bold text-slate-800">🧪 시연용 위치 이동</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-700 text-sm px-1"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-500">
            실제 GPS 대신 아래 위치를 사용합니다. 하천을 누르면 그 하천 반경 안으로
            이동해 잠금이 풀립니다.
          </p>

          <div className="space-y-1">
            {rivers.map((r) => {
              const here =
                active != null &&
                Math.abs(active.lat - r.lat) < 1e-6 &&
                Math.abs(active.lng - r.lng) < 1e-6;
              const away =
                position && !here
                  ? distanceMeters(position.lat, position.lng, r.lat, r.lng)
                  : null;

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSimulatedPosition({ lat: r.lat, lng: r.lng })}
                  className={`min-h-[44px] w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left text-xs transition-all ${
                    here
                      ? 'border-emerald-500 bg-emerald-50 font-bold text-emerald-900'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span>
                    {r.icon} {r.name}
                  </span>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {here ? '여기' : away != null ? formatDistance(away) : `반경 ${r.radiusM}m`}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setSimulatedPosition(null)}
            disabled={!active}
            className="min-h-[44px] w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white font-bold text-xs transition-all"
          >
            실제 GPS로 되돌리기
          </button>

          {rivers.length === 0 && (
            <p className="text-[11px] text-slate-400">하천 목록을 불러오는 중…</p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`min-h-[44px] px-4 py-2 rounded-full shadow-lg font-bold text-xs transition-all border ${
          isSimulated
            ? 'bg-amber-500 border-amber-600 text-white'
            : 'bg-white border-slate-300 text-slate-600'
        }`}
      >
        {isSimulated ? '🧪 위치 시뮬레이션 중' : '🧪 시연 도구'}
      </button>
    </div>
  );
}
