/**
 * DB row → 도메인 타입 변환.
 *
 * 왜 queries.ts와 분리했나: queries.ts는 `lib/supabase`를 import하고,
 * 그 모듈은 로드 시점에 VITE_SUPABASE_* 환경변수를 검사해 없으면 throw합니다.
 * 변환 함수는 순수 함수라 env 없이 테스트할 수 있어야 하므로 여기 따로 둡니다.
 *
 * 방어적으로 값을 좁히는 이유:
 *   `Row<'species'>`의 tier/water_grade는 그냥 `number`입니다(smallint의 투영).
 *   실제 범위는 DB의 check 제약(0004_dex.sql)이 지키지만, 타입 시스템은 모릅니다.
 *   여기서 한 번 좁혀두면 화면 쪽 Record<Tier, …> 조회가 undefined를 만나지 않습니다.
 */

import type { Row } from '../../types/database';
import type { DexEntry, Species, Tier, WaterGrade } from '../../types/domain';

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** 1~5 밖의 값은 데이터 오류입니다. 화면을 깨뜨리는 대신 '흔한 친구'로 떨어뜨립니다. */
export function toTier(value: number): Tier {
  const n = Math.trunc(value);
  return n >= 1 && n <= 5 ? (n as Tier) : 1;
}

/** 1~4 밖이면 "지표종이 아님"으로 봅니다 (수질 판정에서 조용히 빠집니다). */
export function toWaterGrade(value: number | null): WaterGrade | null {
  if (value === null) return null;
  const n = Math.trunc(value);
  return n >= 1 && n <= 4 ? (n as WaterGrade) : null;
}

/**
 * 관찰 월 정규화.
 * season.ts의 isYearRound/formatMonths가 **오름차순 + 중복 없음**을 전제로 하므로
 * DB 배열 순서에 기대지 않고 여기서 정리합니다.
 * 빈 배열이면 연중으로 봅니다 — 비어 있다고 카드를 영영 비시즌으로 잠그면
 * "없는 걸 찾으라고 하지 않기"(PLAN.md §7.7)와 반대 방향의 사고가 됩니다.
 */
export function toMonths(value: number[] | null): number[] {
  if (!value || value.length === 0) return [...ALL_MONTHS];
  const set = new Set(value.map((m) => Math.trunc(m)).filter((m) => m >= 1 && m <= 12));
  if (set.size === 0) return [...ALL_MONTHS];
  return [...set].sort((a, b) => a - b);
}

export function toSpecies(row: Row<'species'>): Species {
  return {
    id: row.id,
    code: row.code,
    commonName: row.common_name,
    ...(row.scientific_name ? { scientificName: row.scientific_name } : {}),
    category: row.category,
    tier: toTier(row.tier),
    track: row.track,
    waterGrade: toWaterGrade(row.water_grade),
    months: toMonths(row.months),
    idHint: row.id_hint,
    fact: row.fact,
    ethicsFlag: row.ethics_flag,
    ...(row.illustration_url ? { illustrationUrl: row.illustration_url } : {}),
  };
}

export function toDexEntry(row: Row<'dex_entries'>): DexEntry {
  return {
    userId: row.user_id,
    speciesId: row.species_id,
    firstObservedAt: row.first_observed_at,
    bestPhotoId: row.best_photo_id,
    count: row.count,
  };
}

/**
 * 도감 표시 순서.
 *
 * 그리드는 카테고리로 다시 묶으므로(DexGrid) 여기서는 **카테고리 안의 순서**만 정합니다.
 * 등급 낮은 것 → 높은 것: 아이가 실제로 만날 가능성이 큰 카드를 먼저 보여줍니다.
 * 맨 앞이 ⭐⭐⭐⭐ 실루엣이면 도감 첫인상이 "못 모은 것투성이"가 됩니다.
 *
 * DB의 ORDER BY에 맡기지 않는 이유: 한글 이름 정렬은 서버 로케일에 따라 달라집니다.
 */
export function sortForDisplay(species: Species[]): Species[] {
  return [...species].sort(
    (a, b) => a.tier - b.tier || a.commonName.localeCompare(b.commonName, 'ko'),
  );
}
