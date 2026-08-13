/**
 * 생물 도감(dex) 트랙 공개 API.
 *
 * 이 배럴 밖의 파일은 내부 구현으로 봅니다.
 *
 * ── 무엇을 라우트에 꽂아야 하나 ────────────────────────────────
 *   `/dex` 라우트에는 **DexContainer**를 꽂으세요. 필수 prop이 없습니다.
 *   DexScreen 이하는 데이터 페칭을 하지 않는 표시 전용 컴포넌트라
 *   species/entries를 직접 넘겨줘야 합니다(코스 종료 요약 등 다른 문맥용).
 */

// ─── 컨테이너 (데이터 연결) ─────────────────────────────────────
export { DexContainer } from './DexContainer';
export type { DexContainerProps } from './DexContainer';

// ─── 화면 (표시 전용 — 페칭 없음) ───────────────────────────────
export { DexScreen } from './DexScreen';
export type { DexScreenProps } from './DexScreen';

export { DexGrid } from './DexGrid';
export type { DexGridProps } from './DexGrid';

export { DexCard, resolveCardState } from './DexCard';
export type { DexCardProps, DexCardState } from './DexCard';

export { DexCardSheet } from './DexCardSheet';
export type { DexCardSheetProps } from './DexCardSheet';

export { DexProgress } from './DexProgress';
export type { DexProgressProps } from './DexProgress';

export { WaterGradeSummary } from './WaterGradeSummary';
export type { WaterGradeSummaryProps } from './WaterGradeSummary';

export { CardAcquired } from './CardAcquired';
export type { CardAcquiredProps } from './CardAcquired';

// ─── 로직 (테스트·재사용용) ─────────────────────────────────────
export { judgeWaterGrade, waterGradeMessage } from './waterGrade';
export type { WaterGradeJudgement, WaterGradeRow } from './waterGrade';

export {
  comebackHint,
  currentMonth,
  formatMonths,
  isInSeason,
  isYearRound,
  monthSeason,
  nextAvailableMonth,
  seasonsOf,
} from './season';
export type { SeasonName } from './season';

export {
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  ETHICS_ICON,
  ETHICS_NOTE,
  TIER_LABEL,
  TIER_NOTE,
  TIER_STARS,
  TRACK_ICON,
  TRACK_LABEL,
  TRACK_NOTE,
  formatDate,
  tierAria,
  tierColor,
} from './display';

// ─── 데이터 조회 (다른 화면이 도감 데이터를 재사용할 때) ────────
export { dexKeys, fetchDexEntries, fetchSpecies } from './queries';
export { sortForDisplay, toDexEntry, toSpecies } from './mappers';

// mockData.ts는 더 이상 공개 API가 아닙니다.
// 실제 데이터는 Supabase(queries.ts)에서 옵니다. 남아 있는 이유는 waterGrade.test.ts가
// 44종 규모의 고정 픽스처로 쓰기 때문입니다 — 화면 코드에서는 import하지 마세요.
