/**
 * 표시 계층 유틸 — 도메인의 숫자/코드 값을 아이가 읽을 수 있는 말로 바꿉니다.
 *
 * ⚠️ 어휘 원칙 (PLAN.md §2.3 · 초등 3학년 어휘 수준)
 *    '저서성 대형무척추동물', '서식', '개체' 같은 한자어를 쓰지 않습니다.
 *    '물속 바닥 친구', '사는 곳', '마리' 로 씁니다.
 */

import type { EthicsFlag, SpeciesCategory, Tier, Track } from '../../types/domain';

// ─── 등급 (PLAN.md §7.4) ────────────────────────────────────────

/** 등급 → 별. 숫자 Tier는 도메인, 별은 표시 계층에만 존재합니다. */
export const TIER_STARS: Record<Tier, string> = {
  1: '⭐',
  2: '⭐⭐',
  3: '⭐⭐⭐',
  4: '⭐⭐⭐⭐',
  5: '🏅',
};

export const TIER_LABEL: Record<Tier, string> = {
  1: '흔한 친구',
  2: '물이 맑아야',
  3: '아주 맑아야',
  4: '귀한 손님',
  5: '특별 기록',
};

export const TIER_NOTE: Record<Tier, string> = {
  1: '어디서나 만날 수 있어.',
  2: '물이 어느 정도 맑아야 살 수 있어.',
  3: '아주 맑은 물에서만 살 수 있어.',
  4: '계절과 장소가 딱 맞아야 만날 수 있어.',
  5: '보호받는 친구야. 멀리서 보기만 하자.',
};

/** global.css의 --c-tier-N 토큰을 씁니다. */
export function tierColor(tier: Tier): string {
  return `var(--c-tier-${tier})`;
}

/** 스크린리더용 — 별 이모지는 읽히지 않으므로 말로 풀어줍니다. */
export function tierAria(tier: Tier): string {
  return tier === 5 ? '특별 기록 등급' : `${tier}단계 등급, ${TIER_LABEL[tier]}`;
}

// ─── 트랙 (PLAN.md §7.2 이원 트랙) ──────────────────────────────

export const TRACK_LABEL: Record<Track, string> = {
  guaranteed: '언제나 있어',
  challenge: '찾아야 만나',
};

export const TRACK_ICON: Record<Track, string> = {
  guaranteed: '📍',
  challenge: '🔍',
};

export const TRACK_NOTE: Record<Track, string> = {
  guaranteed: '도망가지 않아. 그 자리에 가면 꼭 만날 수 있어!',
  challenge: '움직이는 친구라 운도 필요해. 못 만나도 괜찮아.',
};

// ─── 카테고리 ───────────────────────────────────────────────────

export const CATEGORY_LABEL: Record<SpeciesCategory, string> = {
  waterbird: '물새',
  smallbird: '작은 새',
  fish: '물고기',
  mammal: '귀한 손님',
  insect: '물가 곤충',
  benthos: '물속 바닥 친구',
  plant: '물가 식물',
  invasive: '조심할 식물',
  trace: '남겨진 흔적',
  facility: '하천의 장소',
};

/** 일러스트가 없을 때 쓰는 자리지킴이. 실루엣 처리의 원본이기도 합니다. */
export const CATEGORY_EMOJI: Record<SpeciesCategory, string> = {
  waterbird: '🦆',
  smallbird: '🐦',
  fish: '🐟',
  mammal: '🦦',
  insect: '🦗',
  benthos: '🐚',
  plant: '🌿',
  invasive: '🌱',
  trace: '🐾',
  facility: '🪧',
};

/** 도감 기본 정렬 — 아이가 실제로 만나는 순서(눈에 띄는 것 → 자세히 봐야 하는 것) */
export const CATEGORY_ORDER: SpeciesCategory[] = [
  'waterbird',
  'smallbird',
  'fish',
  // 포유류(수달)는 거의 만날 수 없지만 동물 무리에 함께 둡니다.
  // 맨 앞에 두면 영영 실루엣인 카드가 도감 첫 화면을 차지해 낙담하기 쉽습니다.
  'mammal',
  'insect',
  'benthos',
  'plant',
  'invasive',
  'trace',
  'facility',
];

// ─── 관찰 윤리 (PLAN.md §7.6) ───────────────────────────────────

/** 획득 조건에 내장된 약속. 안내문이 아니라 규칙입니다. */
export const ETHICS_NOTE: Record<EthicsFlag, string | null> = {
  none: null,
  no_approach: '가까이 가지 말고 멀리서 찍어보자. 화면에 작게 나와도 괜찮아!',
  report_only: '사진을 찍지 않아도 돼. "봤어요"만 눌러줘. 따라가는 건 절대 안 돼!',
  expert_only: '선생님과 함께하는 관찰 시간에만 만날 수 있어. 돌은 뒤집지 않기로 약속!',
};

export const ETHICS_ICON: Record<EthicsFlag, string | null> = {
  none: null,
  no_approach: '🔭',
  report_only: '🏅',
  expert_only: '🔒',
};

// ─── 날짜 ───────────────────────────────────────────────────────

/** ISO 문자열 → "2026년 5월 3일". Intl 로케일에 기대지 않습니다. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}
