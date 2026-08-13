/**
 * 적립 규칙 — "이 행동에 몇 점인가"만 계산하는 순수 함수.
 *
 * ⚠️ 숫자를 이 파일에 다시 적지 않습니다.
 *    포인트 값의 진실 원천(single source of truth)은 `src/types/domain.ts`의
 *    `TIER_POINTS` / `POINT_VALUES` 하나뿐입니다. 여기서 복제하면
 *    기획이 20P → 25P로 바뀌었을 때 두 곳이 갈라지고, 그 순간부터
 *    "앱이 준 점수"와 "표에 적힌 점수"가 다른 버그가 시작됩니다.
 *
 * 근거 문서: PLAN.md §6.1 (포인트 배분), §7.4 (등급 체계)
 */

import { POINT_VALUES, TIER_POINTS } from '../../types/domain';
import type { PointReason, Tier } from '../../types/domain';

/** 원장에 존재할 수 있는 모든 적립 사유. 통계 집계의 기준 축입니다. */
export const ALL_POINT_REASONS: readonly PointReason[] = [
  ...(Object.keys(POINT_VALUES) as Exclude<PointReason, 'species_found'>[]),
  'species_found',
];

/**
 * 생물 발견 포인트 — 등급별 20/30/45/60/60.
 *
 * PLAN.md §7.4: 등급은 "희귀도"가 아니라 **수질 지표 등급**입니다.
 * 그래서 ⭐⭐⭐(1급수 지표)가 ⭐(어디서나)보다 높고,
 * 🏅(보호종)은 ⭐⭐⭐⭐와 같은 60P입니다 — 보호종을 더 비싸게 만들면
 * 아이가 수달을 쫓아다니게 되므로 의도적으로 올리지 않았습니다.
 * (보호종의 차별점은 포인트가 아니라 '특별 뱃지'로 줍니다. badges.ts 참고)
 */
export function pointsForSpeciesFound(tier: Tier): number {
  return TIER_POINTS[tier];
}

/** `pointsFor`가 사유별로 필요로 하는 부가 정보 */
export interface PointContext {
  /** reason이 'species_found'일 때 필수 */
  tier?: Tier;
}

/**
 * 사유별 적립 포인트.
 *
 * 'species_found'만 등급 의존이라 컨텍스트를 요구하고,
 * 나머지는 고정값(`POINT_VALUES`)입니다.
 *
 * 등급 없이 'species_found'를 계산하려는 건 호출측 버그이므로
 * 0을 조용히 돌려주지 않고 던집니다 — 0P 카드가 발급되면
 * 아이 화면에서는 "찾았는데 점수가 없다"로 보이고, 원인 추적이 어렵습니다.
 */
export function pointsFor(reason: PointReason, ctx?: PointContext): number {
  if (reason === 'species_found') {
    if (ctx?.tier === undefined) {
      throw new Error(
        "pointsFor('species_found')에는 ctx.tier가 필요합니다 (등급별 포인트).",
      );
    }
    return pointsForSpeciesFound(ctx.tier);
  }
  return POINT_VALUES[reason];
}
