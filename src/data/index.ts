/**
 * 시드 데이터 통합 export
 *
 * 개발·목데이터용 TypeScript 시드입니다. 같은 내용의 SQL 판이 `supabase/seed/`에 있습니다.
 * **두 곳을 함께 고치세요.** 한쪽만 바꾸면 개발 환경과 DB가 어긋납니다.
 *
 * ════════════════════════════════════════════════════════════════
 * ⚠️ 이 데이터는 생태 자문 검증 전 초안입니다 (content/oncheoncheon-draft.md)
 *   ❌ 스팟 좌표      전 스팟 lat/lng = 0. Phase 0 현장 답사 후 교체 필요.
 *   ❌ 서식종 목록·등급 미검증. "온천천에 실제로 있는가"를 확인하지 않았습니다.
 *   ❌ 계절(months)   미검증. 일반적 계절성 기준.
 *   🟡 스토리·퀴즈    교사 검수 필요.
 * 그대로 배포하면 아이에게 없는 생물을 찾으라고 시키게 됩니다 (PLAN.md §11).
 * ════════════════════════════════════════════════════════════════
 */

export {
  species,
  speciesById,
  SPECIES_IDS,
  SPECIES_COUNT,
  type SpeciesId,
  type NoMissingSpeciesEntry,
} from './species';

export {
  oncheoncheon,
  spots,
  unsurveyedSpots,
  SPOT_IDS,
  RIVER_ID,
  type SpotId,
  type NoMissingSpotEntry,
} from './oncheoncheon';

export { quizzes, quizzesBySpotId, QUIZ_COUNT } from './quizzes';

export {
  spotSpeciesMap,
  spotSpecies,
  UNMAPPED_SPECIES_IDS,
  type SpotSpecies,
} from './spotSpecies';

import { species } from './species';
import { oncheoncheon, spots } from './oncheoncheon';
import { quizzes } from './quizzes';
import { spotSpecies } from './spotSpecies';

/** 온천천 코스 시드 묶음 */
export const oncheoncheonSeed = {
  river: oncheoncheon,
  spots,
  species,
  quizzes,
  spotSpecies,
};

/**
 * 시드 규모 — 초안과 대조할 때 쓰세요.
 *   species 44 (초안 §3 제목은 "32종"이나 표를 세면 44장 — 초안 확인 필요)
 *   spots    6
 *   quizzes 17 (초안 ①3 ②2 ③3 ④3 ⑤3 ⑥3)
 */
export const SEED_COUNTS = {
  species: species.length,
  spots: spots.length,
  quizzes: quizzes.length,
  spotSpecies: spotSpecies.length,
} as const;
