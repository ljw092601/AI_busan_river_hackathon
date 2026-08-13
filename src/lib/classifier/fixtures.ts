/**
 * 테스트용 종 픽스처.
 *
 * 실제 콘텐츠(content/oncheoncheon-draft.md)의 값을 축약해 옮겼습니다.
 * 계절 경계·등급 경계·윤리 플래그가 모두 한 번씩 나오도록 골랐습니다.
 *
 * 프로덕션 코드에서 import 하지 마세요 (index.ts에서 재export 하지 않습니다).
 */

import type { Species } from '@/types/domain';

export const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function makeSpecies(overrides: Partial<Species> & Pick<Species, 'id'>): Species {
  return {
    code: overrides.id,
    commonName: overrides.id,
    category: 'waterbird',
    tier: 1,
    track: 'challenge',
    waterGrade: null,
    months: ALL_MONTHS,
    idHint: '테스트용 힌트',
    fact: '테스트용 설명',
    ethicsFlag: 'none',
    ...overrides,
  };
}

/** ⭐ 연중 · 도전 트랙 — 자동 확정이 가능한 기본형 */
export const heunPpyam = makeSpecies({
  id: 'heunppyam-duck',
  commonName: '흰뺨검둥오리',
  tier: 1,
  idHint: '뺨이 하얗고 부리 끝이 노란 오리',
});

/** ⭐ 겨울철새 (11~3월) — 계절 필터 검증용 */
export const cheongdung = makeSpecies({
  id: 'cheongdung-duck',
  commonName: '청둥오리',
  tier: 1,
  months: [11, 12, 1, 2, 3],
  idHint: '수컷은 머리가 초록빛으로 반짝임',
});

/** ⭐⭐ 여름 (4~10월) — 자동 확정 상한(tier 2) 경계 */
export const soebaengno = makeSpecies({
  id: 'soebaengno',
  commonName: '쇠백로',
  tier: 2,
  waterGrade: 2,
  months: [4, 5, 6, 7, 8, 9, 10],
  idHint: '부리 검정 + 발가락 노랑 — 노란 양말!',
});

/** ⭐⭐ 여름 — 쇠백로와 혼동되는 종 (불일치 시나리오용) */
export const jungdaebaengno = makeSpecies({
  id: 'jungdaebaengno',
  commonName: '중대백로',
  tier: 2,
  waterGrade: 2,
  months: [4, 5, 6, 7, 8, 9, 10],
  idHint: '하얗고 큼. 부리가 노란색',
});

/** ⭐⭐⭐ 1급수 지표 · 전문가 동반 전용 — 항상 pending, 일반 모드에선 후보 제외 */
export const nalDorae = makeSpecies({
  id: 'naldorae',
  commonName: '날도래류',
  category: 'benthos',
  tier: 3,
  waterGrade: 1,
  ethicsFlag: 'expert_only',
  idHint: '모래·나뭇조각으로 집을 지어 들고 다님',
});

/** 🏅 보호종 — 목격 보고만. 등급과 무관하게 항상 전문가 검수 */
export const sudal = makeSpecies({
  id: 'sudal',
  commonName: '수달',
  tier: 5,
  ethicsFlag: 'report_only',
  idHint: '접근·추적 금지. 보았다는 사실만 기록',
});

/** ⭐ 보장 트랙 식물 · 가을 한정 (8~11월) — 계절 폴백 검증용 */
export const galdae = makeSpecies({
  id: 'galdae',
  commonName: '갈대',
  category: 'plant',
  track: 'guaranteed',
  tier: 1,
  months: [8, 9, 10, 11],
  idHint: '키가 사람보다 크고, 끝에 부드러운 빗자루 모양 이삭',
});

/** ⭐ 보장 트랙 시설 · 연중 */
export const jinggeomdari = makeSpecies({
  id: 'jinggeomdari',
  commonName: '징검다리',
  category: 'facility',
  track: 'guaranteed',
  tier: 1,
  idHint: '물을 건너는 돌다리',
});

export const ALL_SPECIES: Species[] = [
  heunPpyam,
  cheongdung,
  soebaengno,
  jungdaebaengno,
  nalDorae,
  sudal,
  galdae,
  jinggeomdari,
];
