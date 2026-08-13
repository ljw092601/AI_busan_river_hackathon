/**
 * 스팟별 관찰 후보 매핑 (PLAN.md §7.9 `spot_species`)
 *
 * 출처: content/oncheoncheon-draft.md §3 도감 표의 「스팟」 열
 * 대응: supabase/seed/0004_spot_species.sql (동일 내용 — 순서까지 맞춰 두었습니다)
 * 근거: PLAN.md §7.5 ① 후보 압축 — `spot_species × 현재 월` 로 후보를 수십 종으로 줄입니다.
 *       여기에 없는 종은 그 스팟에서 아이에게 제시되지도, 판별 후보에 들어가지도 않습니다.
 *
 * ⚠️ 초안의 두 출처를 대조했습니다.
 *    (a) 각 스팟의 「관찰 후보」 줄 — 살아 있는 동물·식물만. 장소 카드 제외.
 *    (b) §3 도감 표의 「스팟」 열   — 흔적·시설 포함. 전 종 대조 결과 (a)의 상위집합.
 *    → **(b)를 기준**으로 삼았습니다. 두 출처가 어긋나는 종은 없었습니다.
 *
 * ⚠️ 미검증: 초안 §3은 "온천천에 실제로 서식/도래하는가"를 확인하지 않았습니다.
 *    이 매핑을 그대로 쓰면 아이에게 없는 생물을 찾으라고 시키게 됩니다.
 *    Phase 0 답사 + 생태 자문 후 재확정하세요.
 */

import type { SpeciesId } from './species';
import type { SpotId } from './oncheoncheon';

/**
 * PLAN.md §7.9 `spot_species (spot_id, species_id)`.
 * `autoGrant`는 DB 스키마(supabase/migrations/0004_dex.sql)에 있는 컬럼이라 함께 둡니다.
 */
export interface SpotSpecies {
  spotId: SpotId;
  speciesId: SpeciesId;
  /** 표시 순서 (1부터) */
  seq: number;
  /** 체크인만 하면 확정 지급되는 장소 카드인지 (PLAN.md §2.3, §7.2 헛걸음 방지) */
  autoGrant: boolean;
}

/**
 * 체크인 시 확정 지급되는 장소 카드.
 * 초안 §2의 「장소 카드」 중 §3 도감 표에도 행이 있는 것만 넣었습니다.
 *
 * ⚠️ 스팟 ①·③에는 auto_grant 카드가 하나도 없습니다 — 헛걸음 방지 장치(§7.2)가
 *    빠진 스팟입니다. 초안 §2에는 장소 카드가 적혀 있지만 §3 도감 표에 해당 행이
 *    없어서 시드할 수 없었습니다 (카드를 지어내지 않았습니다):
 *      ① 🏞️ 상류의 물길        → 도감 표에 없음
 *      ③ 🐦 새들의 사냥터       → 도감 표에 없음
 *      ⑤ 🏙️ 도심을 지나는 물길  → 도감 표에 없음 (⑤는 📜 복원 기록 표지가 있어 커버됨)
 *    → 초안 §3 도감 표에 이 3장을 추가할지 콘텐츠 결정이 필요합니다.
 */
const AUTO_GRANT_IDS: ReadonlySet<string> = new Set<SpeciesId>([
  'species-facility-stepping-stones', // ② 🪨 징검다리
  'species-facility-riffle', // ② 🌊 여울
  'species-facility-water-quality-station', // ④ 🔬 수질측정소
  'species-facility-restoration-marker', // ⑤ 📜 복원 기록
  'species-facility-confluence', // ⑥ 🔀 합류점
]);

/**
 * 스팟 → 관찰 후보 종 (표시 순서대로).
 * Record<SpotId, ...> 이므로 스팟을 하나라도 빠뜨리면 컴파일 에러가 납니다.
 */
export const spotSpeciesMap = {
  // ① 물이 시작되는 곳 — 발원 · 물의 순환
  'spot-oncheon-01': [
    'species-runner-reed', // 달뿌리풀 ①②
    'species-gomari', // 고마리 ①
    'species-sparrow', // 참새 (초안 스팟 열: "전체")
    'species-daurian-redstart', // 딱새 ①
    'species-willow-minnow', // 버들치 ①
    'species-demoiselle-damselfly', // 물잠자리 ①
  ],

  // ② 여울과 징검다리 — 여울과 소 · 물살 · 물속 산소
  'spot-oncheon-02': [
    'species-facility-stepping-stones', // 장소 카드 🪨 징검다리
    'species-facility-riffle', // 장소 카드 🌊 여울
    'species-runner-reed', // 달뿌리풀 ①②
    'species-korean-willow', // 왕버들 ②⑤
    'species-trace-dasulgi-shell', // 다슬기 껍데기 ②④
    'species-sparrow', // 참새 (전체)
    'species-white-wagtail', // 알락할미새 ②③
    'species-kingfisher', // 물총새 ②③
    'species-pale-chub', // 피라미 ②
    'species-dark-chub', // 갈겨니 ②
    'species-water-strider', // 소금쟁이 ②
    'species-skimmer-dragonfly', // 밀잠자리 ②⑤
    'species-dasulgi', // 다슬기 ②④
  ],

  // ③ 새들의 식당 — 먹이사슬 · 조류 관찰   ⚠️ auto_grant 카드 없음
  'spot-oncheon-03': [
    'species-trace-bird-footprint', // 새 발자국 ③⑥
    'species-trace-feather', // 깃털 ③
    'species-sparrow', // 참새 (전체)
    'species-spot-billed-duck', // 흰뺨검둥오리 ③⑤⑥
    'species-egret-great', // 중대백로 ③
    'species-egret-little', // 쇠백로 ③
    'species-grey-heron', // 왜가리 ③
    'species-great-cormorant', // 민물가마우지 ③⑥
    'species-white-wagtail', // 알락할미새 ②③
    'species-kingfisher', // 물총새 ②③
    'species-carp', // 잉어 ③⑤
  ],

  // ④ 물의 건강검진소 — 수질 · 지표생물 ★ 코스의 핵심
  'spot-oncheon-04': [
    'species-facility-water-quality-station', // 장소 카드 🔬 수질측정소
    'species-trace-dasulgi-shell', // 다슬기 껍데기 ②④
    'species-sparrow', // 참새 (전체)
    'species-dasulgi', // 다슬기 ②④
    'species-pond-snail', // 물달팽이 ④
    'species-mayfly', // 하루살이류 ④
    'species-amphipod', // 🔒 옆새우 ④ (expert_only)
    'species-planaria', // 🔒 플라나리아 ④ (expert_only)
    'species-caddisfly', // 🔒 날도래류 ④ (expert_only)
  ],

  // ⑤ 되살아난 물길 — 하천 복원사 · 지역사
  'spot-oncheon-05': [
    'species-facility-restoration-marker', // 장소 카드 📜 복원 기록
    'species-reed', // 갈대 ⑤⑥
    'species-korean-willow', // 왕버들 ②⑤
    'species-cherry-tree', // 벚나무 ⑤
    'species-japanese-hop', // 🚫 환삼덩굴 ⑤ (생태교란)
    'species-sparrow', // 참새 (전체)
    'species-spot-billed-duck', // 흰뺨검둥오리 ③⑤⑥
    'species-brown-eared-bulbul', // 직박구리 ⑤
    'species-carp', // 잉어 ③⑤
    'species-crucian-carp', // 붕어 ⑤
    'species-skimmer-dragonfly', // 밀잠자리 ②⑤
  ],

  // ⑥ 두 물이 만나는 곳 — 합류 · 유역 · 바다로
  'spot-oncheon-06': [
    'species-facility-confluence', // 장소 카드 🔀 합류점
    'species-reed', // 갈대 ⑤⑥
    'species-silver-grass', // 물억새 ⑥
    'species-cattail', // 부들 ⑥
    'species-trace-bird-footprint', // 새 발자국 ③⑥
    'species-sparrow', // 참새 (전체)
    'species-spot-billed-duck', // 흰뺨검둥오리 ③⑤⑥
    'species-mallard', // 청둥오리 ⑥
    'species-great-cormorant', // 민물가마우지 ③⑥
    'species-mullet', // 숭어 ⑥
  ],
} satisfies Record<SpotId, SpeciesId[]>;

/**
 * 어느 스팟에도 매핑되지 않은 종 — 의도된 공백입니다. 지어내지 않았습니다.
 *
 *  · species-bur-cucumber (가시박)
 *      초안 스팟 열이 "—" 이고 `[온천천 분포 확인]` 표시가 붙어 있습니다.
 *      답사에서 분포가 확인되면 해당 스팟에 추가하세요.
 *
 *  · species-otter (수달)
 *      초안 §3 「특별 기록 — 보호종」 표에는 스팟 열 자체가 없습니다.
 *      report_only(목격 보고만)라 특정 스팟에 묶지 않는 편이 설계에 맞을 수 있으나,
 *      현재 구조에서는 spot_species에 없으면 관찰 후보로 뜨지 않습니다.
 *      → 보호종을 코스 전체 단위로 다룰지 스팟에 묶을지 설계 결정 필요.
 */
export const UNMAPPED_SPECIES_IDS: SpeciesId[] = ['species-bur-cucumber', 'species-otter'];

/** DB의 spot_species 행과 1:1로 대응하는 평면 배열 (SQL 시드와 동일한 내용·순서) */
export const spotSpecies: SpotSpecies[] = Object.entries(spotSpeciesMap).flatMap(
  ([spotId, speciesIds]) =>
    speciesIds.map((speciesId, i) => ({
      spotId: spotId as SpotId,
      speciesId,
      seq: i + 1,
      autoGrant: AUTO_GRANT_IDS.has(speciesId),
    })),
);
