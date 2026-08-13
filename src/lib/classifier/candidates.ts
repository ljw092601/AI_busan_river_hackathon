/**
 * 후보 압축 — 정확도의 핵심 (PLAN.md §7.5 ①, §7.7)
 *
 * ─────────────────────────────────────────────────────────────
 * 왜 이 파일이 판별 정확도를 좌우하는가
 *
 * 일반 판별 앱은 "전 세계 10만 종 중 무엇인가?"라는 **열린 문제**를 풉니다.
 * 우리는 스팟 좌표와 촬영 월(月)을 이미 알고 있으므로,
 *   spot_species(그 스팟의 관찰 후보) × 현재 월(계절 필터)
 * 을 적용하면 후보가 보통 3~10종으로 압축됩니다.
 *
 * 10만 분류 문제가 5분류 문제가 됩니다 — 모델을 바꾸는 것보다
 * 여기서 얻는 정확도 이득이 훨씬 큽니다.
 * (iNaturalist Geomodel이 하는 일이 정확히 이것이고, 우리는 더 좁은 사전확률을 가집니다.)
 *
 * 그리고 이 목록은 판별 프롬프트에만 쓰이는 게 아니라
 * 아이에게 보여주는 "지금 만날 수 있는 친구들" 목록 그 자체이기도 합니다.
 * ─────────────────────────────────────────────────────────────
 *
 * 전부 순수 함수입니다. React·네트워크·시계에 의존하지 않습니다
 * (현재 월조차 인자로 받습니다 — 테스트 재현성과 "1월 1일 자정" 경계 버그 방지).
 */

import type { EthicsFlag, Species } from '@/types/domain';
import type { CandidateSpecies } from './types';

// ─────────────────────────────────────────────────────────────
// 튜닝 지점 — 후보 압축 상수
// ─────────────────────────────────────────────────────────────

export interface CandidateConfig {
  /**
   * 전문가 동반 프로그램에서만 해금되는 윤리 플래그 (PLAN.md §7.6 ④).
   *
   * 저서생물(옆새우·플라나리아·날도래)은 채집·돌 뒤집기를 유발하므로
   * 일반 모드에서는 후보로 **제시조차 하지 않습니다.**
   * 보상이 곧 지시문이기 때문에, 목록에 올리는 순간 아이는 돌을 뒤집습니다.
   */
  expertOnlyFlags: EthicsFlag[];
  /**
   * 후보가 0개일 때 계절 필터를 완화할지 여부.
   *
   * 겨울에 여름종만 매핑된 스팟에서 "만날 수 있는 친구 0종"을 띄우면
   * 그 스팟은 그냥 빈 화면이 됩니다 — §7.2 빈손 방지 설계와 정면으로 충돌합니다.
   * 그래서 **보장 트랙(식물·흔적·시설)에 한해** 계절 필터를 풀어줍니다.
   * 갈대는 겨울에도 그 자리에 서 있고, 징검다리는 계절이 없습니다.
   */
  fallbackToGuaranteedTrack: boolean;
}

export const DEFAULT_CANDIDATE_CONFIG: CandidateConfig = {
  expertOnlyFlags: ['expert_only'],
  fallbackToGuaranteedTrack: true,
};

// ─────────────────────────────────────────────────────────────
// 옵션 · 결과 타입
// ─────────────────────────────────────────────────────────────

export interface NarrowCandidatesOptions {
  /**
   * 전문가 동반 프로그램 진행 중인가.
   * `true`면 `expert_only` 종도 후보에 포함됩니다 (PLAN.md §7.6 ④).
   */
  expertAccompanied?: boolean;
  config?: CandidateConfig;
}

/** 후보 압축이 어떤 경로로 결정됐는지 — UI 문구와 운영 지표에 씁니다 */
export type CandidateFallback =
  /** 계절 필터를 그대로 통과한 정상 결과 */
  | 'none'
  /** 계절 결과가 0개라 보장 트랙만 계절 무시하고 노출 */
  | 'guaranteed_track_all_season'
  /** 그래도 0개 — 스팟 매핑 자체가 비었거나 전부 expert_only */
  | 'empty';

export interface CandidateNarrowing {
  candidates: Species[];
  fallback: CandidateFallback;
  /** 계절 필터를 적용했을 때의 개수 (fallback 발동 여부와 무관하게 원본 지표) */
  inSeasonCount: number;
}

// ─────────────────────────────────────────────────────────────
// 핵심 함수
// ─────────────────────────────────────────────────────────────

/**
 * 스팟 후보 목록 × 현재 월 → 후보 N종.
 *
 * @param allSpecies    전체 도감 종 (마스터 데이터)
 * @param spotSpeciesIds 이 스팟의 관찰 후보 종 id (spot_species 매핑)
 * @param month         촬영 월 (1~12). **호출자가 명시적으로 넘깁니다**
 * @returns 계절·윤리 필터를 통과한 종. **0개일 수 있습니다** (엣지 케이스는 호출자 책임)
 *
 * 0개가 되는 경우를 사전에 막지 않는 이유: "지금은 만날 수 있는 게 없다"도
 * 사실이고, 그걸 어떻게 보여줄지는 화면마다 다릅니다.
 * 폴백이 필요하면 {@link narrowCandidatesWithFallback}를 쓰세요.
 */
export function narrowCandidates(
  allSpecies: readonly Species[],
  spotSpeciesIds: readonly string[],
  month: number,
  options: NarrowCandidatesOptions = {},
): Species[] {
  const config = options.config ?? DEFAULT_CANDIDATE_CONFIG;
  const expertAccompanied = options.expertAccompanied ?? false;

  const inSpot = filterBySpot(allSpecies, spotSpeciesIds);

  return sortForDisplay(
    inSpot.filter(
      (s) =>
        isInSeason(s, month) && isEthicallyAvailable(s, expertAccompanied, config),
    ),
  );
}

/**
 * {@link narrowCandidates} + 빈손 방지 폴백.
 *
 * 스팟 화면과 관찰 등록 플로우는 이쪽을 쓰세요.
 * 판별 프롬프트에도 이쪽 결과를 넣습니다 — 아이에게 보여준 목록과
 * 모델에게 준 후보가 **같아야** 채점이 의미를 가집니다.
 */
export function narrowCandidatesWithFallback(
  allSpecies: readonly Species[],
  spotSpeciesIds: readonly string[],
  month: number,
  options: NarrowCandidatesOptions = {},
): CandidateNarrowing {
  const config = options.config ?? DEFAULT_CANDIDATE_CONFIG;
  const expertAccompanied = options.expertAccompanied ?? false;

  const inSeason = narrowCandidates(allSpecies, spotSpeciesIds, month, options);
  if (inSeason.length > 0) {
    return { candidates: inSeason, fallback: 'none', inSeasonCount: inSeason.length };
  }

  if (config.fallbackToGuaranteedTrack) {
    // 계절만 풀고 윤리 필터는 그대로 유지합니다.
    // expert_only를 여기서 풀어주면 "겨울이라 후보가 없다"는 이유로
    // 저서생물 채집을 유도하게 됩니다 — 절대 하면 안 되는 완화입니다.
    const guaranteed = sortForDisplay(
      filterBySpot(allSpecies, spotSpeciesIds).filter(
        (s) =>
          s.track === 'guaranteed' &&
          isEthicallyAvailable(s, expertAccompanied, config),
      ),
    );
    if (guaranteed.length > 0) {
      return {
        candidates: guaranteed,
        fallback: 'guaranteed_track_all_season',
        inSeasonCount: 0,
      };
    }
  }

  // 여기까지 오면 스팟 매핑 자체가 비었거나 전부 잠긴 상태입니다.
  // 화면은 "오늘은 관찰 일지를 써보자"(§7.2 빈손 방지)로 넘겨야 합니다.
  return { candidates: [], fallback: 'empty', inSeasonCount: 0 };
}

/**
 * 판별 요청에 실을 최소 필드만 남깁니다.
 *
 * 외부로 나가는 페이로드를 여기서 한 번 좁히는 것이 요점입니다.
 * `Species`를 통째로 보내면 나중에 누군가 필드를 추가했을 때
 * 조용히 함께 유출됩니다.
 */
export function toClassifyCandidates(species: readonly Species[]): CandidateSpecies[] {
  return species.map((s) => ({
    id: s.id,
    commonName: s.commonName,
    idHint: s.idHint,
    category: s.category,
  }));
}

/** 이 종을 이번 달에 만날 수 있는가 (PLAN.md §7.7 계절 필터) */
export function isInSeason(species: Species, month: number): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  return species.months.includes(month);
}

// ─────────────────────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────────────────────

function filterBySpot(
  allSpecies: readonly Species[],
  spotSpeciesIds: readonly string[],
): Species[] {
  const wanted = new Set(spotSpeciesIds);
  // allSpecies를 순회해 중복 id·미존재 id를 자연히 걸러냅니다
  // (spot_species 매핑에 오타가 있어도 후보가 유령처럼 늘어나지 않습니다).
  return allSpecies.filter((s) => wanted.has(s.id));
}

function isEthicallyAvailable(
  species: Species,
  expertAccompanied: boolean,
  config: CandidateConfig,
): boolean {
  if (expertAccompanied) return true;
  return !config.expertOnlyFlags.includes(species.ethicsFlag);
}

/**
 * 표시·전송 순서: 등급 오름차순 → id 오름차순.
 *
 * - 등급 오름차순: 아이에게 쉬운 종(⭐)부터 보여줍니다. 희귀종을 위에 두면
 *   아이는 희귀종부터 쫓습니다 (§7.4 — 보상은 곧 지시문).
 * - id 오름차순 타이브레이크: 순서가 **결정론적**이어야 테스트가 재현되고,
 *   판별 프롬프트가 요청마다 바이트 단위로 같아져 프롬프트 캐시가 걸립니다.
 */
function sortForDisplay(species: Species[]): Species[] {
  return [...species].sort((a, b) => a.tier - b.tier || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
