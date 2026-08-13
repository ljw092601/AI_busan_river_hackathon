import { approxDistance, type RiverWithLock } from './location';
import type { RiverLocationValue } from './LocationContext';

/**
 * 위치 권한을 **사용자 동작으로** 요청하는 배너.
 *
 * ★ 왜 버튼인가
 *   페이지가 열리자마자 권한 창을 띄우면 맥락을 모르는 사용자는 거의 거부하고,
 *   한 번 거부되면 브라우저 설정에서 직접 풀어야 합니다(되돌리기가 아주 번거롭습니다).
 *   그래서 "왜 필요한지" 한 줄을 **권한 창보다 먼저** 보여 주고, 버튼을 누른 직후에 묻습니다.
 *
 * ★ 실패해도 화면을 막지 않습니다
 *   거부/미지원/비보안 어느 쪽이든 하천 카드와 대백과는 그대로 보입니다.
 *   여기서는 "왜 미션이 잠겼는지"를 정직하게 적고 다시 시도할 길만 남깁니다.
 *
 * ⚠️ 문구 원칙: 이 잠금은 클라이언트 판정이라 우회할 수 있습니다.
 *    "위치 인증 완료" 같은 말은 쓰지 않습니다 — 우리가 아는 건 "가까이 있다"까지입니다.
 */

export interface LocationBannerProps {
  location: RiverLocationValue;
  /** 위치를 받았을 때 가장 가까운 하천. 없으면 null. */
  nearest: RiverWithLock | null;
  /** 반경 안에 들어와 열린 하천 수. */
  unlocked: number;
}

const CARD = 'mb-5 rounded-2xl border px-4 py-4 break-keep';
const CTA =
  'min-h-[44px] px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2';

export function LocationBanner({ location, nearest, unlocked }: LocationBannerProps) {
  const { status, position, message, accuracyPoor, requestLocation } = location;

  /* ── 아직 물어보지 않았습니다 ─────────────────────────────── */
  if (status === 'idle') {
    return (
      <section className={`${CARD} bg-emerald-50 border-emerald-200`}>
        <h3 className="font-bold text-sm text-emerald-900 flex items-center gap-2">
          <span aria-hidden="true">🧭</span> 가까운 하천을 찾아볼까요?
        </h3>
        <p className="text-xs text-emerald-900/80 mt-1 leading-relaxed">
          미션과 퀴즈는 그 하천 <strong>가까이에 있을 때</strong> 열려요. 위치는 하천까지 거리를
          재는 데에만 쓰고 어디에도 저장하지 않아요.
        </p>
        <button type="button" onClick={requestLocation} className={`${CTA} mt-3 w-full sm:w-auto`}>
          가까운 하천 찾기
        </button>
      </section>
    );
  }

  /* ── 권한 창이 떠 있거나 첫 좌표를 기다리는 중 ────────────── */
  if (status === 'prompting') {
    return (
      <section className={`${CARD} bg-slate-50 border-slate-200`} aria-busy="true">
        <p className="text-xs text-slate-700 leading-relaxed">
          <span aria-hidden="true">📍</span> 브라우저에 뜬 창에서 <strong>허용</strong>을 눌러
          주세요. 위치를 잡는 중이에요…
        </p>
      </section>
    );
  }

  /* ── 받는 중 ───────────────────────────────────────────────── */
  if (status === 'watching') {
    return (
      <section className={`${CARD} bg-emerald-50 border-emerald-200`} role="status">
        <p className="text-sm font-bold text-emerald-900 flex items-center gap-2">
          <span aria-hidden="true">{unlocked > 0 ? '🔓' : '🧭'}</span>
          {unlocked > 0
            ? `지금 도전할 수 있는 하천이 ${unlocked}곳 있어요!`
            : '아직 하천 반경 안이 아니에요'}
        </p>

        {nearest ? (
          <p className="text-xs text-emerald-900/80 mt-1 leading-relaxed">
            가장 가까운 하천은 <strong>{nearest.river.name}</strong> —{' '}
            {nearest.lock.locked
              ? `${approxDistance(nearest.lock.remainingM)} 더 가면 열려요.`
              : `${approxDistance(nearest.lock.distanceM)} 거리에 있어요.`}
          </p>
        ) : null}

        {accuracyPoor && position ? (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2 leading-relaxed">
            <span aria-hidden="true">⚠️</span> 지금 위치 오차가 ±{Math.round(position.accuracy)}m로
            커서 거리가 실제와 많이 다를 수 있어요. 실내라면 창가나 야외로 나가 보세요.
          </p>
        ) : null}

        <p className="text-[11px] text-emerald-900/60 mt-2 leading-relaxed">
          하천은 길게 이어져 있어서 거리는 대략적인 값이에요.
        </p>
      </section>
    );
  }

  /* ── 실패: 거부 / 미지원 / 비보안 ──────────────────────────── */
  const canRetry = status !== 'insecure';
  return (
    <section className={`${CARD} bg-amber-50 border-amber-200`} role="alert">
      <p className="text-xs text-amber-900 leading-relaxed">
        <span aria-hidden="true">📍</span>{' '}
        {message ?? '위치를 사용할 수 없어요.'}
      </p>
      <p className="text-xs text-amber-900/80 mt-2 leading-relaxed">
        위치를 못 받아도 하천 카드와 <strong>하천 대백과</strong>는 그대로 볼 수 있어요. 미션과
        퀴즈만 하천 근처에서 열려요.
      </p>
      {canRetry ? (
        <button
          type="button"
          onClick={requestLocation}
          className="min-h-[44px] mt-3 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm transition-all shadow-sm w-full sm:w-auto"
        >
          위치 다시 시도
        </button>
      ) : null}
    </section>
  );
}
