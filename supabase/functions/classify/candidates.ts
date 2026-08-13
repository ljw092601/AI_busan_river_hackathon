/**
 * 후보 압축 (서버 사본) — PLAN.md §7.5 ①, §7.7
 *
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║ ★ `src/lib/classifier/candidates.ts`의 **의도적 복제본**입니다.       ║
 * ║   Deno는 Vite 앱의 TS를 import할 수 없어 재구현했습니다. 대신         ║
 * ║   **필터·폴백·정렬이 완전히 같은 결정을 내려야 합니다.**              ║
 * ║   한쪽만 고치지 마세요:                                               ║
 * ║     src/lib/classifier/candidates.ts ←→ supabase/functions/classify/candidates.ts
 * ║                                                                       ║
 * ║   차이는 입력 형태뿐입니다: 브라우저는 domain.ts의 camelCase `Species`,║
 * ║   여기서는 DB 행(snake_case)을 그대로 받습니다.                       ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 *
 * ★ 후보를 서버에서 다시 계산하는 이유 (브라우저가 보낸 목록을 쓰지 않습니다)
 *
 * 이 후보 목록이 곧 모델이 고를 수 있는 답의 전부입니다. 클라이언트가 보낸 목록을
 * 그대로 믿으면, 후보를 1종으로 줄여 보내는 것만으로 모델이 그 종을 고를 수밖에
 * 없게 만들 수 있습니다 — §7.5의 앵커링 금지를 **클라이언트가 우회**하는 셈입니다.
 * 그래서 후보는 항상 서버가 spot_species × 촬영 월로 다시 만듭니다.
 */

// ─────────────────────────────────────────────────────────────
// DB 행 타입 (public.species)
// ─────────────────────────────────────────────────────────────

export interface SpeciesRow {
  id: string;
  code: string;
  common_name: string;
  category: string;
  tier: number;
  track: 'guaranteed' | 'challenge';
  months: number[];
  id_hint: string;
  ethics_flag: 'none' | 'no_approach' | 'report_only' | 'expert_only';
  is_active: boolean;
}

// ─────────────────────────────────────────────────────────────
// 튜닝 지점 — 브라우저의 DEFAULT_CANDIDATE_CONFIG와 값이 같아야 합니다
// ─────────────────────────────────────────────────────────────

export interface CandidateConfig {
  /** 전문가 동반 프로그램에서만 해금되는 윤리 플래그 (PLAN.md §7.6 ④) */
  expertOnlyFlags: string[];
  /** 후보가 0개일 때 보장 트랙에 한해 계절 필터를 완화할지 */
  fallbackToGuaranteedTrack: boolean;
}

export const DEFAULT_CANDIDATE_CONFIG: CandidateConfig = {
  expertOnlyFlags: ['expert_only'],
  fallbackToGuaranteedTrack: true,
};

export type CandidateFallback = 'none' | 'guaranteed_track_all_season' | 'empty';

export interface CandidateNarrowing {
  candidates: SpeciesRow[];
  fallback: CandidateFallback;
  inSeasonCount: number;
}

export interface NarrowOptions {
  expertAccompanied?: boolean;
  config?: CandidateConfig;
}

// ─────────────────────────────────────────────────────────────
// 핵심 함수
// ─────────────────────────────────────────────────────────────

/** 스팟 후보 × 촬영 월 → 후보 N종. 0개일 수 있습니다. */
export function narrowCandidates(
  spotSpecies: readonly SpeciesRow[],
  month: number,
  options: NarrowOptions = {},
): SpeciesRow[] {
  const config = options.config ?? DEFAULT_CANDIDATE_CONFIG;
  const expertAccompanied = options.expertAccompanied ?? false;

  return sortForDisplay(
    spotSpecies.filter(
      (s) =>
        s.is_active &&
        isInSeason(s, month) &&
        isEthicallyAvailable(s, expertAccompanied, config),
    ),
  );
}

/**
 * narrowCandidates + 빈손 방지 폴백.
 *
 * 아이에게 보여준 목록과 모델에게 준 후보가 **같아야** 채점이 의미를 가지므로,
 * 화면과 판별 양쪽 모두 이쪽을 씁니다.
 */
export function narrowCandidatesWithFallback(
  spotSpecies: readonly SpeciesRow[],
  month: number,
  options: NarrowOptions = {},
): CandidateNarrowing {
  const config = options.config ?? DEFAULT_CANDIDATE_CONFIG;
  const expertAccompanied = options.expertAccompanied ?? false;

  const inSeason = narrowCandidates(spotSpecies, month, options);
  if (inSeason.length > 0) {
    return { candidates: inSeason, fallback: 'none', inSeasonCount: inSeason.length };
  }

  if (config.fallbackToGuaranteedTrack) {
    // 계절만 풀고 윤리 필터는 유지합니다.
    // expert_only를 여기서 풀면 "겨울이라 후보가 없다"는 이유로 저서생물 채집을
    // 유도하게 됩니다 — 절대 하면 안 되는 완화입니다.
    const guaranteed = sortForDisplay(
      spotSpecies.filter(
        (s) =>
          s.is_active &&
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

  return { candidates: [], fallback: 'empty', inSeasonCount: 0 };
}

/** 이 종을 이번 달에 만날 수 있는가 (PLAN.md §7.7) */
export function isInSeason(species: SpeciesRow, month: number): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  return Array.isArray(species.months) && species.months.includes(month);
}

/** 판별 요청에 실을 최소 필드만 남깁니다 (외부로 나가는 페이로드를 여기서 한 번 좁힘) */
export function toClassifyCandidates(
  species: readonly SpeciesRow[],
): { id: string; commonName: string; idHint: string; category: string }[] {
  return species.map((s) => ({
    id: s.id,
    commonName: s.common_name,
    idHint: s.id_hint,
    category: s.category,
  }));
}

/**
 * 촬영 시각 → 한국 기준 월(1~12).
 *
 * DB의 spot_candidate_species()가 `now() at time zone 'Asia/Seoul'`을 쓰므로
 * 여기서도 같은 시간대를 씁니다. UTC로 계산하면 자정 전후 촬영 건이
 * 브라우저·DB와 다른 달로 갈라집니다.
 */
export function seoulMonth(iso: string | null | undefined): number {
  const d = iso ? new Date(iso) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
  }).formatToParts(d);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return Number.isInteger(month) ? month : new Date().getUTCMonth() + 1;
}

// ─────────────────────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────────────────────

function isEthicallyAvailable(
  species: SpeciesRow,
  expertAccompanied: boolean,
  config: CandidateConfig,
): boolean {
  if (expertAccompanied) return true;
  return !config.expertOnlyFlags.includes(species.ethics_flag);
}

/**
 * 표시·전송 순서: 등급 오름차순 → id 오름차순.
 *
 * 브라우저의 sortForDisplay와 **완전히 같은 비교자**여야 합니다.
 * 순서가 다르면 (a) 아이가 본 목록과 모델이 받은 목록이 어긋나고
 * (b) 프롬프트 바이트가 달라져 프롬프트 캐시가 걸리지 않습니다.
 */
function sortForDisplay(species: SpeciesRow[]): SpeciesRow[] {
  return [...species].sort(
    (a, b) => a.tier - b.tier || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
