/**
 * 도감 시드 — 온천천 코스
 *
 * 출처: content/oncheoncheon-draft.md §3 「도감 카드 초안」
 * 근거: PLAN.md §7 (도감 시스템), src/types/domain.ts (Species)
 *
 * ════════════════════════════════════════════════════════════════
 * ⚠️ 미검증 데이터 — 생태 자문 전 초안입니다
 * ════════════════════════════════════════════════════════════════
 * 초안이 명시한 검증 상태를 그대로 옮깁니다.
 *
 *   ❌ 서식종 목록·등급  — 미검증. 사전 지식 기반 추정.
 *                          "온천천에 실제로 서식/도래하는가"를 확인하지 않았습니다.
 *                          생태 자문 없이 사용 금지.
 *   ❌ 계절 캘린더(months) — 미검증. 일반적 계절성 기준.
 *                          온천천 실제 관측 기록으로 교체 필요.
 *   ❌ 학명(scientificName) — 초안에 없습니다. 전 종 미기재.
 *                          국립생물자원관 국가생물종목록 API로 확보 예정 (PLAN.md §7.5 각주).
 *   ❌ fact(카드 뒷면 설명) — 초안에 해당 항목이 없습니다. 원칙적으로 빈 문자열.
 *                          예외: 초안 퀴즈 해설에 종 단위 서술이 있는 2종(다슬기·옆새우)만
 *                          그 문장을 그대로 옮겼습니다. 나머지는 생태 자문 후 작성.
 *
 * 그대로 배포하면 아이에게 "없는 생물을 찾으라"고 시키게 됩니다 (PLAN.md §11 리스크).
 * Phase 0 현장 답사 + 생태 자문의 **입력 양식**으로 쓰세요.
 * ════════════════════════════════════════════════════════════════
 *
 * ── 초안 → 타입 변환 규칙 ────────────────────────────────────────
 *  등급   ⭐ 개수 → tier 1~4, 🏅(보호종) → tier 5
 *  트랙   초안 표의 "보장 트랙" → 'guaranteed', "도전 트랙" → 'challenge'
 *  윤리   🔒(전문가 동반) → 'expert_only'
 *         보호종(수달)   → 'report_only'
 *         새 전체        → 'no_approach'  (초안 ③ 스팟 「근접 촬영은 감점」 + PLAN.md §7.6-1)
 *         그 외          → 'none'
 *  수질   tier 2 → waterGrade 2 (2급수 지표), tier 3 → waterGrade 1 (1급수 지표).
 *         단, **수생 분류군(fish·insect·benthos)에만** 부여합니다.
 *         새·식물·흔적·시설은 수질 지표종이 아니므로 tier와 무관하게 null.
 *         (초안 ④ 스팟 요약 화면이 지표종으로 든 예시도 다슬기·피라미·물달팽이뿐입니다)
 *  월     "연중" → 1~12 전체. "10~4"처럼 해를 넘기는 구간은 오름차순으로 펼칩니다.
 *         흔적·시설 표에는 관찰 월 열이 없어 연중으로 두었습니다.
 * ────────────────────────────────────────────────────────────────
 *
 * ── id 와 code 의 역할 ─────────────────────────────────────────
 *  supabase/migrations의 `public.species.id`는 uuid(자동 생성)이고,
 *  **안정적인 자연키는 `code`** 입니다 (`unique`, `^[a-z0-9_]{2,50}$`).
 *
 *   · `id`   'species-*' 슬러그. 이 TS 시드(개발·목데이터) 안에서만 쓰는 식별자.
 *            런타임에 DB를 붙이면 여기에 uuid가 들어옵니다.
 *   · `code` DB와 SQL 시드(`supabase/seed/0001_species.sql`)를 잇는 키.
 *            **두 시드에서 반드시 같은 값이어야 합니다.**
 * ────────────────────────────────────────────────────────────────
 */

import type { Species } from '../types/domain';

/** 관찰 월 전개. from > to 이면 해를 넘기는 구간으로 보고 오름차순으로 펼칩니다. */
function months(from: number, to: number): number[] {
  const out: number[] = [];
  if (from <= to) {
    for (let m = from; m <= to; m++) out.push(m);
  } else {
    for (let m = 1; m <= to; m++) out.push(m);
    for (let m = from; m <= 12; m++) out.push(m);
  }
  return out;
}

/** 연중 관찰 가능. 호출마다 새 배열을 만들어 공유 참조를 피합니다. */
const yearRound = (): number[] => months(1, 12);

/**
 * 도감에 실려야 하는 종 id 목록 = 누락 검사용 체크리스트.
 * 초안 §3의 표에 실린 카드 전부입니다. 아래 `species` 배열이 이 목록을
 * 하나라도 빠뜨리면 `NoMissingSpeciesEntry` 타입이 컴파일 에러를 냅니다.
 *
 * ⚠️ 초안 §3의 제목은 "32종"이지만 표를 실제로 세면 44장입니다.
 *    (식물 9 + 흔적·시설 8 + 새 11 + 물고기 6 + 곤충·저서 9 + 보호종 1)
 *    "표에 있는 종을 누락하지 않는다"를 우선해 44장 전부를 옮겼습니다.
 *    제목의 32라는 숫자가 무엇을 세는 것인지 초안 작성자 확인이 필요합니다.
 */
export const SPECIES_IDS = [
  // 보장 트랙 — 식물 (9)
  'species-reed',
  'species-silver-grass',
  'species-runner-reed',
  'species-gomari',
  'species-cattail',
  'species-korean-willow',
  'species-cherry-tree',
  'species-japanese-hop',
  'species-bur-cucumber',
  // 보장 트랙 — 흔적·시설 (8)
  'species-trace-bird-footprint',
  'species-trace-feather',
  'species-trace-dasulgi-shell',
  'species-facility-stepping-stones',
  'species-facility-riffle',
  'species-facility-water-quality-station',
  'species-facility-restoration-marker',
  'species-facility-confluence',
  // 도전 트랙 — 새 (11)
  'species-spot-billed-duck',
  'species-sparrow',
  'species-brown-eared-bulbul',
  'species-mallard',
  'species-egret-great',
  'species-egret-little',
  'species-grey-heron',
  'species-great-cormorant',
  'species-white-wagtail',
  'species-daurian-redstart',
  'species-kingfisher',
  // 도전 트랙 — 물고기 (6)
  'species-carp',
  'species-crucian-carp',
  'species-pale-chub',
  'species-dark-chub',
  'species-willow-minnow',
  'species-mullet',
  // 도전 트랙 — 곤충·저서생물 (9)
  'species-water-strider',
  'species-skimmer-dragonfly',
  'species-demoiselle-damselfly',
  'species-dasulgi',
  'species-pond-snail',
  'species-mayfly',
  'species-amphipod',
  'species-planaria',
  'species-caddisfly',
  // 특별 기록 — 보호종 (1)
  'species-otter',
] as const;

export type SpeciesId = (typeof SPECIES_IDS)[number];

/** id가 SpeciesId 목록 안의 값이어야 한다는 제약을 얹은 Species */
type SpeciesSeed = Species & { id: SpeciesId };

export const species = [
  // ══════════════════════════════════════════════════════════════
  // 보장 트랙 — 식물 (항상 그 자리에 있음)
  // ══════════════════════════════════════════════════════════════
  {
    id: 'species-reed',
    code: 'reed',
    commonName: '갈대',
    category: 'plant',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: months(8, 11),
    idHint: '키가 사람보다 크고, 끝에 부드러운 빗자루 모양 이삭',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-silver-grass',
    code: 'silver_grass',
    commonName: '물억새',
    category: 'plant',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: months(9, 11),
    idHint: '갈대와 비슷하나 이삭이 더 하얗고 은빛',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-runner-reed',
    code: 'runner_reed',
    commonName: '달뿌리풀',
    category: 'plant',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: months(6, 10),
    idHint: '물가에 낮게 깔려 자라고 줄기가 옆으로 뻗음',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-gomari',
    code: 'gomari',
    commonName: '고마리',
    category: 'plant',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: months(8, 10),
    idHint: '작은 분홍·흰 꽃이 뭉쳐 핌. 잎이 방패 모양',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-cattail',
    code: 'cattail',
    commonName: '부들',
    category: 'plant',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: months(7, 10),
    idHint: '핫도그처럼 생긴 갈색 이삭 — 한 번 보면 안 잊음',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-korean-willow',
    code: 'korean_willow',
    commonName: '왕버들',
    category: 'plant',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: yearRound(),
    idHint: '물가에 서 있는 굵은 나무, 가지가 늘어짐',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    // 초안 관찰 월: "연중(꽃 4월)" — months는 연중, 개화기는 표시 계층에서 별도 처리 필요
    id: 'species-cherry-tree',
    code: 'cherry_tree',
    commonName: '벚나무',
    category: 'plant',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: yearRound(),
    idHint: '봄에 분홍 꽃, 껍질에 가로줄 무늬',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    // 🚫 생태교란종 — "이건 왜 문제일까?" 카드 (PLAN.md §7.3)
    id: 'species-japanese-hop',
    code: 'japanese_hop',
    commonName: '환삼덩굴',
    category: 'invasive',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: months(6, 10),
    idHint: '까끌까끌한 줄기 — 다른 식물을 덮어버림 (생태교란)',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    // 🚫 생태교란종. TODO: 초안 「[온천천 분포 확인]」 — 답사에서 분포 확인 전까지
    //    스팟 매핑 없음(spotSpecies.ts 참조). 분포 미확인 시 도감에서 제외 검토.
    id: 'species-bur-cucumber',
    code: 'bur_cucumber',
    commonName: '가시박',
    category: 'invasive',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: months(7, 10),
    idHint: '넓은 잎으로 나무까지 뒤덮음 (생태교란)',
    fact: '',
    ethicsFlag: 'none',
  },

  // ══════════════════════════════════════════════════════════════
  // 보장 트랙 — 흔적·시설
  // 초안 표에 관찰 월 열이 없습니다 → 전부 연중으로 두었습니다.
  // ══════════════════════════════════════════════════════════════
  {
    id: 'species-trace-bird-footprint',
    code: 'trace_bird_footprint',
    commonName: '새 발자국',
    category: 'trace',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: yearRound(),
    idHint: '젖은 흙이나 모래를 살펴봐. 물갈퀴 자국이 있으면 오리!',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-trace-feather',
    code: 'trace_feather',
    commonName: '깃털',
    category: 'trace',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: yearRound(),
    idHint: '물가에 떨어진 깃털. 줍지 말고 사진만',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-trace-dasulgi-shell',
    code: 'trace_dasulgi_shell',
    commonName: '다슬기 껍데기',
    category: 'trace',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: yearRound(),
    idHint: '뾰족한 원뿔 모양 빈 껍데기',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    // TODO: 초안 식별 힌트 열이 공란입니다 — 콘텐츠 작성 필요
    id: 'species-facility-stepping-stones',
    code: 'facility_stepping_stones',
    commonName: '징검다리',
    category: 'facility',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: yearRound(),
    idHint: '',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-facility-riffle',
    code: 'facility_riffle',
    commonName: '여울',
    category: 'facility',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: yearRound(),
    idHint: '물이 하얗게 부서지며 소리 나는 곳',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    // TODO: 초안 식별 힌트 열이 공란입니다 — 콘텐츠 작성 필요
    id: 'species-facility-water-quality-station',
    code: 'facility_water_quality_station',
    commonName: '수질측정소',
    category: 'facility',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: yearRound(),
    idHint: '',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    // TODO: 초안 식별 힌트 열이 공란입니다 — 콘텐츠 작성 필요
    //       초안 ⑤ 「[제작 시 확인]」 복원 사업 연도·주체·사업명 확정 후 fact 작성
    id: 'species-facility-restoration-marker',
    code: 'facility_restoration_marker',
    commonName: '복원 기록 표지',
    category: 'facility',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: yearRound(),
    idHint: '',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-facility-confluence',
    code: 'facility_confluence',
    commonName: '합류점',
    category: 'facility',
    tier: 1,
    track: 'guaranteed',
    waterGrade: null,
    months: yearRound(),
    idHint: '두 물줄기가 만나 하나가 되는 곳',
    fact: '',
    ethicsFlag: 'none',
  },

  // ══════════════════════════════════════════════════════════════
  // 도전 트랙 — 새
  // 전 종 ethicsFlag: 'no_approach' (초안 ③ 「근접 촬영은 감점」, PLAN.md §7.6-1)
  // 새는 수질 지표종이 아니므로 tier 2여도 waterGrade는 null입니다.
  // ══════════════════════════════════════════════════════════════
  {
    id: 'species-spot-billed-duck',
    code: 'spot_billed_duck',
    commonName: '흰뺨검둥오리',
    category: 'waterbird',
    tier: 1,
    track: 'challenge',
    waterGrade: null,
    months: yearRound(),
    idHint: '뺨이 하얗고 부리 끝이 노란 오리. 연중 볼 수 있음',
    fact: '',
    ethicsFlag: 'no_approach',
  },
  {
    id: 'species-sparrow',
    code: 'sparrow',
    commonName: '참새',
    category: 'smallbird',
    tier: 1,
    track: 'challenge',
    waterGrade: null,
    months: yearRound(),
    idHint: '뺨에 검은 점',
    fact: '',
    ethicsFlag: 'no_approach',
  },
  {
    id: 'species-brown-eared-bulbul',
    code: 'brown_eared_bulbul',
    commonName: '직박구리',
    category: 'smallbird',
    tier: 1,
    track: 'challenge',
    waterGrade: null,
    months: yearRound(),
    idHint: '회갈색, 시끄럽게 "삐이익" 울며 날아감',
    fact: '',
    ethicsFlag: 'no_approach',
  },
  {
    // 초안 관찰 월 "11~3" → 해를 넘기는 구간
    id: 'species-mallard',
    code: 'mallard',
    commonName: '청둥오리',
    category: 'waterbird',
    tier: 1,
    track: 'challenge',
    waterGrade: null,
    months: months(11, 3),
    idHint: '수컷은 머리가 초록빛으로 반짝임. 겨울 손님',
    fact: '',
    ethicsFlag: 'no_approach',
  },
  {
    id: 'species-egret-great',
    code: 'egret_great',
    commonName: '중대백로',
    category: 'waterbird',
    tier: 2,
    track: 'challenge',
    waterGrade: null,
    months: months(4, 10),
    idHint: '하얗고 큼. 부리가 노란색(여름엔 검게 변함)',
    fact: '',
    ethicsFlag: 'no_approach',
  },
  {
    id: 'species-egret-little',
    code: 'egret_little',
    commonName: '쇠백로',
    category: 'waterbird',
    tier: 2,
    track: 'challenge',
    waterGrade: null,
    months: months(4, 10),
    idHint: '하얗고 작음. 부리 검정 + 발가락 노랑 — 노란 양말!',
    fact: '',
    ethicsFlag: 'no_approach',
  },
  {
    id: 'species-grey-heron',
    code: 'grey_heron',
    commonName: '왜가리',
    category: 'waterbird',
    tier: 2,
    track: 'challenge',
    waterGrade: null,
    months: yearRound(),
    idHint: '회색빛, 백로보다 큼. 목을 S자로 접고 서 있음',
    fact: '',
    ethicsFlag: 'no_approach',
  },
  {
    // 초안 관찰 월 "10~4" → 해를 넘기는 구간
    id: 'species-great-cormorant',
    code: 'great_cormorant',
    commonName: '민물가마우지',
    category: 'waterbird',
    tier: 2,
    track: 'challenge',
    waterGrade: null,
    months: months(10, 4),
    idHint: '검고 목이 김. 날개를 펼쳐 말리는 자세가 특징',
    fact: '',
    ethicsFlag: 'no_approach',
  },
  {
    id: 'species-white-wagtail',
    code: 'white_wagtail',
    commonName: '알락할미새',
    category: 'smallbird',
    tier: 2,
    track: 'challenge',
    waterGrade: null,
    months: months(3, 10),
    idHint: '흑백 무늬, 꼬리를 위아래로 까딱까딱',
    fact: '',
    ethicsFlag: 'no_approach',
  },
  {
    // 초안 관찰 월 "10~4" → 해를 넘기는 구간
    id: 'species-daurian-redstart',
    code: 'daurian_redstart',
    commonName: '딱새',
    category: 'smallbird',
    tier: 2,
    track: 'challenge',
    waterGrade: null,
    months: months(10, 4),
    idHint: '수컷 배가 주황색, 날개에 흰 점',
    fact: '',
    ethicsFlag: 'no_approach',
  },
  {
    // ⭐⭐⭐⭐ 귀한 손님 — 계절·서식 조건이 까다로움 (PLAN.md §7.4)
    id: 'species-kingfisher',
    code: 'kingfisher',
    commonName: '물총새',
    category: 'smallbird',
    tier: 4,
    track: 'challenge',
    waterGrade: null,
    months: months(4, 9),
    idHint: '파란 등 + 주황 배. 물가를 쏜살같이 지나감',
    fact: '',
    ethicsFlag: 'no_approach',
  },

  // ══════════════════════════════════════════════════════════════
  // 도전 트랙 — 물고기
  // ══════════════════════════════════════════════════════════════
  {
    id: 'species-carp',
    code: 'carp',
    commonName: '잉어',
    category: 'fish',
    tier: 1,
    track: 'challenge',
    waterGrade: null,
    months: months(4, 10),
    idHint: '크고 통통함. 입가에 수염',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-crucian-carp',
    code: 'crucian_carp',
    commonName: '붕어',
    category: 'fish',
    tier: 1,
    track: 'challenge',
    waterGrade: null,
    months: months(4, 10),
    idHint: '잉어와 비슷하나 수염이 없음',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-pale-chub',
    code: 'pale_chub',
    commonName: '피라미',
    category: 'fish',
    tier: 2,
    track: 'challenge',
    waterGrade: 2,
    months: months(5, 10),
    idHint: '손바닥보다 작고 은빛. 여울에서 무리지어 다님',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-dark-chub',
    code: 'dark_chub',
    commonName: '갈겨니',
    category: 'fish',
    tier: 2,
    track: 'challenge',
    waterGrade: 2,
    months: months(5, 10),
    idHint: '피라미와 비슷, 눈 위쪽이 붉음',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-willow-minnow',
    code: 'willow_minnow',
    commonName: '버들치',
    category: 'fish',
    tier: 3,
    track: 'challenge',
    waterGrade: 1,
    months: months(4, 10),
    idHint: '상류의 맑고 찬 물에만 삶. 작고 갈색',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    // ⚠️ 자문 확인 필요: 초안이 ⭐⭐로 두어 변환 규칙상 waterGrade 2가 되지만,
    //    숭어는 하류·기수역 어종이라 2급수 지표종으로 보기 어렵습니다.
    //    등급이 "수질"이 아니라 "만나기 어려움"을 뜻한 것인지 확인 필요.
    id: 'species-mullet',
    code: 'mullet',
    commonName: '숭어',
    category: 'fish',
    tier: 2,
    track: 'challenge',
    waterGrade: 2,
    months: months(4, 10),
    idHint: '하류·기수역. 가끔 물 위로 튀어오름',
    fact: '',
    ethicsFlag: 'none',
  },

  // ══════════════════════════════════════════════════════════════
  // 도전 트랙 — 곤충·저서생물
  // 🔒 = 전문가 동반 프로그램에서만 해금 (PLAN.md §7.6-4)
  //      돌을 뒤집어야 보이는 생물이라 아이가 임의로 하면 서식지가 훼손됩니다.
  // ══════════════════════════════════════════════════════════════
  {
    id: 'species-water-strider',
    code: 'water_strider',
    commonName: '소금쟁이',
    category: 'insect',
    tier: 1,
    track: 'challenge',
    waterGrade: null,
    months: months(4, 10),
    idHint: '물 위를 미끄러지듯 걸어다님',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-skimmer-dragonfly',
    code: 'skimmer_dragonfly',
    commonName: '밀잠자리',
    category: 'insect',
    tier: 1,
    track: 'challenge',
    waterGrade: null,
    months: months(5, 9),
    idHint: '몸이 하늘색 가루를 뿌린 듯함',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    // ⚠️ 자문 확인 필요: 초안 ⭐⭐⭐ → 변환 규칙상 waterGrade 1.
    //    초안 힌트가 "맑은 물가"라 지표성을 전제하나, 물잠자리를 1급수 지표로
    //    확정할 수 있는지는 자문 확인이 필요합니다.
    id: 'species-demoiselle-damselfly',
    code: 'demoiselle_damselfly',
    commonName: '물잠자리',
    category: 'insect',
    tier: 3,
    track: 'challenge',
    waterGrade: 1,
    months: months(5, 8),
    idHint: '날개 전체가 검고 몸이 금속빛 초록. 맑은 물가',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-dasulgi',
    code: 'dasulgi',
    commonName: '다슬기',
    category: 'benthos',
    tier: 2,
    track: 'challenge',
    waterGrade: 2,
    months: months(4, 10),
    idHint: '뾰족한 원뿔, 돌에 붙어 있음',
    // 출처: 초안 ④ 스팟 퀴즈 3번 해설 (그대로 옮김)
    fact: '다슬기는 2급수 정도의 물에서 삽니다. 아주 더러운 물에서는 살 수 없어요.',
    ethicsFlag: 'none',
  },
  {
    id: 'species-pond-snail',
    code: 'pond_snail',
    commonName: '물달팽이',
    category: 'benthos',
    tier: 2,
    track: 'challenge',
    waterGrade: 2,
    months: months(4, 10),
    idHint: '둥근 껍데기, 수초에 붙음',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-mayfly',
    code: 'mayfly',
    commonName: '하루살이류',
    category: 'benthos',
    tier: 2,
    track: 'challenge',
    waterGrade: 2,
    months: months(4, 9),
    idHint: '꼬리가 2~3가닥으로 길게 나옴',
    fact: '',
    ethicsFlag: 'none',
  },
  {
    id: 'species-amphipod',
    code: 'amphipod',
    commonName: '옆새우',
    category: 'benthos',
    tier: 3,
    track: 'challenge',
    waterGrade: 1,
    months: yearRound(),
    idHint: '옆으로 누워 헤엄침. 1급수 지표',
    // 출처: 초안 ④ 스팟 퀴즈 2번 해설 (앞 문장만 그대로 옮김)
    fact: '옆새우는 아주 맑은 물(1급수)에서 살아요.',
    ethicsFlag: 'expert_only',
  },
  {
    id: 'species-planaria',
    code: 'planaria',
    commonName: '플라나리아',
    category: 'benthos',
    tier: 3,
    track: 'challenge',
    waterGrade: 1,
    months: yearRound(),
    idHint: '납작하고 눈이 사시처럼 두 개. 1급수 지표',
    fact: '',
    ethicsFlag: 'expert_only',
  },
  {
    id: 'species-caddisfly',
    code: 'caddisfly',
    commonName: '날도래류',
    category: 'benthos',
    tier: 3,
    track: 'challenge',
    waterGrade: 1,
    months: yearRound(),
    idHint: '모래·나뭇조각으로 집을 지어 들고 다님. 1급수 지표',
    fact: '',
    ethicsFlag: 'expert_only',
  },

  // ══════════════════════════════════════════════════════════════
  // 특별 기록 — 보호종
  // ══════════════════════════════════════════════════════════════
  {
    // ✅ 해결됨: domain.ts SpeciesCategory + species_category ENUM에 'mammal'이 추가되어
    //    category를 'mammal'로 바로잡았습니다.
    //
    // ⚠️⚠️ 남은 블로커 (DB 시드 실패) — supabase/migrations/0004_dex.sql
    //    `species_track_matches_category` CHECK가 아직 'mammal'을 모릅니다:
    //      (track = 'challenge' and category in ('waterbird','smallbird','fish','insect','benthos'))
    //    'mammal'이 목록에 없어 supabase/seed/0001_species.sql의 수달 INSERT가
    //    제약 위반으로 실패합니다. 마이그레이션 트랙에서 'mammal'을 challenge 쪽에
    //    추가해야 합니다. (TS 시드는 이 제약을 검사하지 않으므로 여기서는 통과합니다)
    //
    // TODO: 초안 「[온천천 서식 확인 필요]」 — 서식 미확인 시 도감에서 제외.
    // TODO: 식별 힌트 없음(초안 표에 해당 열이 없음). 다만 report_only라
    //       사진 식별이 필요 없어 우선순위는 낮습니다.
    // 관찰 월: 초안 표에 열이 없어 연중으로 두었습니다.
    id: 'species-otter',
    code: 'otter',
    commonName: '수달',
    category: 'mammal',
    tier: 5,
    track: 'challenge',
    waterGrade: null,
    months: yearRound(),
    idHint: '',
    // 출처: 초안 §3 「특별 기록 — 보호종」 표의 비고 (그대로 옮김)
    fact: '접근·추적 금지. 발견 시 앱이 위치 없이 "보았다"만 기록',
    ethicsFlag: 'report_only',
  },
] satisfies SpeciesSeed[];

// ─────────────────────────────────────────────────────────────
// 컴파일 타임 검증
// ─────────────────────────────────────────────────────────────

type AssertNever<T extends never> = T;

/**
 * SPECIES_IDS에 있는데 `species` 배열에 빠진 항목이 있으면 여기서 컴파일 에러가 납니다.
 * (에러 메시지에 빠진 id가 그대로 찍힙니다)
 */
export type NoMissingSpeciesEntry = AssertNever<
  Exclude<SpeciesId, (typeof species)[number]['id']>
>;

/** 도감 카드 총 장수 */
export const SPECIES_COUNT = species.length;

/** id로 빠르게 찾기 */
export const speciesById: Record<string, Species> = Object.fromEntries(
  species.map((s) => [s.id, s]),
);
