/**
 * 뱃지 판정 — 상태를 받아 획득한 뱃지 코드 목록을 돌려주는 순수 함수.
 *
 * ⚠️ 리더보드·랭킹 로직은 **의도적으로 없습니다** (PLAN.md §6.3).
 *    초등 대상 전체 랭킹은 (a) 상위권 소수만 남기고 나머지를 이탈시키고,
 *    (b) 부정 체크인의 가장 큰 유인이 되며, (c) 보호자 대리 참여를 부릅니다.
 *    대신 **개인 컬렉션 진척도**(`collectionProgress`)와
 *    **코호트 합산**(`ledger.cohortTotal`, 운영자 통계용)만 제공합니다.
 *    "사용자별 점수를 정렬해 순위를 매기는" 함수를 여기에 추가하지 마세요.
 *
 * 근거 문서: PLAN.md §2.2(부분 뱃지), §6.1(뱃지 보상), §7.4(보호종 특별 뱃지), §7.7(계절 완주)
 */

import type { PointReason } from '../../types/domain';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/**
 * 뱃지 코드.
 *   course_complete:<riverSlug>   코스 완주
 *   course_partial:<riverSlug>    부분 완주 (스팟 3개 이상) — PLAN.md §2.2 "완주 강박은 이탈을 부릅니다"
 *   dex_set:<setCode>             도감 세트 완성 (예: 물새 5종)
 *   season:<riverSlug>:<season>   계절 완주 ("온천천의 봄")
 *   season_master:<riverSlug>     사계절 완주
 *   river_milestone_3             하천 3개 완주
 *   special_record                🏅 보호종 발견 특별 기록
 */
export type BadgeCode =
  | `course_complete:${string}`
  | `course_partial:${string}`
  | `dex_set:${string}`
  | `season:${string}:${Season}`
  | `season_master:${string}`
  | 'river_milestone_3'
  | 'special_record';

/** 부분 완주 뱃지 최소 스팟 수 (PLAN.md §2.2 "3개만 찍어도 부분 뱃지") */
export const PARTIAL_COURSE_MIN_SPOTS = 3;

/** 하천 완주 마일스톤 기준 (PLAN.md §6.1 "하천 3개 완주 300P + 특별 뱃지") */
export const RIVER_MILESTONE_COUNT = 3;

export interface CourseProgress {
  riverSlug: string;
  /** 이 코스의 전체 스팟 수 */
  totalSpots: number;
  /** 체크인 완료한 스팟 id (중복이 들어와도 됩니다 — 내부에서 유일화) */
  visitedSpotIds: readonly string[];
  /** 이 코스를 완주한 계절들. 계절 완주 뱃지 판정에만 씁니다 */
  completedSeasons?: readonly Season[];
}

export interface DexSetDefinition {
  /** 뱃지 코드에 들어갈 식별자 (예: 'waterbird_5') */
  code: string;
  name: string;
  /** 세트를 이루는 종 id */
  speciesIds: readonly string[];
  /** 이 수만큼 모으면 완성. 생략하면 speciesIds 전부 */
  requiredCount?: number;
}

export interface BadgeState {
  courses: readonly CourseProgress[];
  /** 보유 도감 종 id (DexEntry.speciesId) */
  ownedSpeciesIds: readonly string[];
  /** 도감 세트 정의 */
  dexSets?: readonly DexSetDefinition[];
  /** 도감 전체 종 수 — 진척도 표시용 */
  totalSpeciesCount?: number;
  /** 🏅 등급 5(보호종)를 발견한 적이 있는가 */
  protectedSpeciesFound?: boolean;
}

/** 코스를 완주했는가 */
export function isCourseComplete(course: CourseProgress): boolean {
  if (course.totalSpots <= 0) return false;
  return uniqueCount(course.visitedSpotIds) >= course.totalSpots;
}

/** 부분 완주(3개 이상)인가. 완주한 코스는 부분 뱃지를 따로 주지 않습니다 */
export function isCoursePartial(course: CourseProgress): boolean {
  if (isCourseComplete(course)) return false;
  return uniqueCount(course.visitedSpotIds) >= PARTIAL_COURSE_MIN_SPOTS;
}

/** 도감 세트를 완성했는가 */
export function isDexSetComplete(
  set: DexSetDefinition,
  ownedSpeciesIds: readonly string[],
): boolean {
  const owned = new Set(ownedSpeciesIds);
  const need = set.requiredCount ?? set.speciesIds.length;
  if (need <= 0) return false;
  let have = 0;
  for (const id of new Set(set.speciesIds)) {
    if (owned.has(id)) have += 1;
  }
  return have >= need;
}

/**
 * 획득한 뱃지 코드 목록.
 *
 * 이미 지급된 뱃지를 걸러내지 않습니다 — "지금 상태에서 성립하는 뱃지"를 모두 돌려주고,
 * 신규 여부는 호출측이 기존 `user_badges`와 차집합으로 판단합니다.
 * 판정(순수)과 지급(부작용)을 분리해두면 재계산·백필이 안전해집니다.
 */
export function evaluateBadges(state: BadgeState): BadgeCode[] {
  const badges: BadgeCode[] = [];

  let completedRivers = 0;
  for (const course of state.courses) {
    if (isCourseComplete(course)) {
      completedRivers += 1;
      badges.push(`course_complete:${course.riverSlug}`);
    } else if (isCoursePartial(course)) {
      badges.push(`course_partial:${course.riverSlug}`);
    }

    // 계절 완주 — 같은 장소를 계절마다 다시 걷게 만드는 장치 (PLAN.md §7.7)
    const seasons = new Set(course.completedSeasons ?? []);
    for (const season of ALL_SEASONS) {
      if (seasons.has(season)) badges.push(`season:${course.riverSlug}:${season}`);
    }
    if (ALL_SEASONS.every((s) => seasons.has(s))) {
      badges.push(`season_master:${course.riverSlug}`);
    }
  }

  if (completedRivers >= RIVER_MILESTONE_COUNT) badges.push('river_milestone_3');

  for (const set of state.dexSets ?? []) {
    if (isDexSetComplete(set, state.ownedSpeciesIds)) badges.push(`dex_set:${set.code}`);
  }

  if (state.protectedSpeciesFound) badges.push('special_record');

  return dedupe(badges);
}

/**
 * 뱃지에 딸린 포인트 사유. 없으면 null(뱃지만 주는 것).
 *
 * 부분 완주·계절 뱃지에 포인트를 붙이지 않은 이유:
 * PLAN.md §6.1의 포인트 표에 없는 항목이며, 여기서 임의로 점수를 만들면
 * 기획 문서와 코드가 갈라집니다. 이런 뱃지의 보상은 '수집 자체'입니다.
 */
export function pointReasonForBadge(code: BadgeCode): PointReason | null {
  if (code.startsWith('course_complete:')) return 'course_complete';
  if (code.startsWith('dex_set:')) return 'dex_set_complete';
  if (code === 'river_milestone_3') return 'river_milestone';
  return null;
}

/**
 * 개인 컬렉션 진척도 — 리더보드 대신 쓰는 지표 (PLAN.md §6.3).
 * "도감 12/40장", "물길 지도 3/7 구간" 같은 화면의 원본 데이터입니다.
 * 비교 대상은 다른 아이가 아니라 **어제의 자신**입니다.
 */
export interface CollectionProgress {
  dexOwned: number;
  dexTotal: number;
  /** 0..1. dexTotal이 0이면 0 */
  dexRatio: number;
  spotsVisited: number;
  spotsTotal: number;
  coursesCompleted: number;
  setsCompleted: number;
}

export function collectionProgress(state: BadgeState): CollectionProgress {
  const dexOwned = uniqueCount(state.ownedSpeciesIds);
  const dexTotal = state.totalSpeciesCount ?? 0;
  let spotsVisited = 0;
  let spotsTotal = 0;
  let coursesCompleted = 0;
  for (const c of state.courses) {
    spotsVisited += Math.min(uniqueCount(c.visitedSpotIds), c.totalSpots);
    spotsTotal += c.totalSpots;
    if (isCourseComplete(c)) coursesCompleted += 1;
  }
  const setsCompleted = (state.dexSets ?? []).filter((s) =>
    isDexSetComplete(s, state.ownedSpeciesIds),
  ).length;

  return {
    dexOwned,
    dexTotal,
    dexRatio: dexTotal > 0 ? dexOwned / dexTotal : 0,
    spotsVisited,
    spotsTotal,
    coursesCompleted,
    setsCompleted,
  };
}

// ─────────────────────────────────────────────────────────────
// 계절 유틸
// ─────────────────────────────────────────────────────────────

export const ALL_SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * ISO 시각 → 계절 (KST 기준, 3~5 봄 / 6~8 여름 / 9~11 가을 / 12~2 겨울).
 * 도감의 `months` 메타데이터가 월(月) 기반이므로 계절도 월로 자릅니다.
 */
export function seasonOf(iso: string): Season {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`시각으로 해석할 수 없습니다: ${iso}`);
  const month = new Date(t + KST_OFFSET_MS).getUTCMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

// ─────────────────────────────────────────────────────────────

function uniqueCount(ids: readonly string[]): number {
  return new Set(ids).size;
}

function dedupe(codes: readonly BadgeCode[]): BadgeCode[] {
  return [...new Set(codes)];
}
