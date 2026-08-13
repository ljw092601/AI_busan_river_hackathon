/**
 * 포인트 원장 모듈 — 공개 API.
 *
 * 순수 TypeScript입니다. React·Supabase·DOM 의존성이 없고, IO도 없습니다.
 * 모든 함수는 인자를 받아 값을 반환할 뿐이며, 실제 INSERT는 서버가 합니다.
 *
 * 설계의 두 축:
 *   1) 잔액은 컬럼이 아니라 `SUM(delta)` — ledger.ts 상단 주석 (PLAN.md §4.2)
 *   2) 정정은 차감하지 않는다 — corrections.ts 상단 주석 (PLAN.md §7.5)
 *
 * 리더보드·랭킹은 의도적으로 제공하지 않습니다 (PLAN.md §6.3).
 */

// ── 적립 규칙 ────────────────────────────────────────────────
export { ALL_POINT_REASONS, pointsFor, pointsForSpeciesFound } from './calculate';
export type { PointContext } from './calculate';

// ── 원장 연산 ────────────────────────────────────────────────
export {
  appendIfNew,
  balance,
  balanceByReason,
  balanceOf,
  cohortTotal,
  createEntry,
  dedupeKey,
  isDuplicate,
  kstDateKey,
} from './ledger';
export type { CreateEntryInput, DedupeCandidate } from './ledger';

// ── 정정 (무차감) ────────────────────────────────────────────
export {
  applyCorrection,
  CORRECTION_REF_TYPE,
  correctionAccountingNote,
  correctionEntries,
  correctSpecies,
  isCorrectionEntry,
  pointsDeltaForCorrection,
} from './corrections';
export type {
  CorrectionRecord,
  CorrectSpeciesInput,
  SpeciesCorrection,
} from './corrections';

// ── 뱃지 · 진척도 ────────────────────────────────────────────
export {
  ALL_SEASONS,
  collectionProgress,
  evaluateBadges,
  isCourseComplete,
  isCoursePartial,
  isDexSetComplete,
  PARTIAL_COURSE_MIN_SPOTS,
  pointReasonForBadge,
  RIVER_MILESTONE_COUNT,
  seasonOf,
} from './badges';
export type {
  BadgeCode,
  BadgeState,
  CollectionProgress,
  CourseProgress,
  DexSetDefinition,
  Season,
} from './badges';
