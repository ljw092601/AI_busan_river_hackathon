import { isRiverComplete, type CollectConfig, type RiverView } from '../types';

/**
 * 미션 판정의 순수 로직. UI와 분리해 두면 단위 테스트로 규칙만 따로 검증할 수 있습니다.
 */

/**
 * 정답 비교용 정규화.
 *
 * 아이들이 모바일 키보드로 입력하므로 앞뒤 공백은 거의 항상 붙습니다.
 * 한글은 조합 방식이 IME마다 달라(NFC/NFD) 눈에 같아 보여도 코드포인트가 다를 수 있어
 * NFC로 통일합니다. 알파벳 답도 대소문자를 가리지 않습니다.
 * 다만 괄호·한자 같은 **의미 있는 글자는 지우지 않습니다** (예: '복개(覆蓋)').
 */
export function normalizeAnswer(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** 입력이 허용 답안 중 하나와 같은가. accept가 비어 있으면 언제나 false. */
export function matchesTextAnswer(input: string, accept: string[] | undefined): boolean {
  const needle = normalizeAnswer(input);
  if (!needle) return false;
  return (accept ?? []).some((a) => normalizeAnswer(a) === needle);
}

/** 수집 미션의 목표 개수. target이 없으면 항목 전부를 주워야 합니다. */
export function collectTarget(config: CollectConfig): number {
  const items = config.items ?? [];
  const target = config.target ?? items.length;
  // 설정이 이상해도(0, 음수, 항목보다 큰 값) 화면이 영원히 안 끝나지 않도록 가둡니다.
  return Math.min(Math.max(target, 1), Math.max(items.length, 1));
}

export function isCollectComplete(pickedCount: number, target: number): boolean {
  return pickedCount >= target;
}

/**
 * 하천 완수 판정 — 서버에 저장된 진행 상황 대신 **화면이 지금 알고 있는 값**으로 계산합니다.
 * (미로그인이거나 mutation 응답을 기다리는 동안에도 즉시 축하를 띄우기 위함)
 *
 * ★ 규칙 자체는 절대 다시 쓰지 않고 types.ts의 isRiverComplete에 그대로 넘깁니다.
 *   하천마다 구성이 다릅니다(퀴즈만 / 미션만 / 둘 다). 여기서 "미션 AND 퀴즈"로
 *   따로 판정하면 미션 없는 하천·퀴즈 없는 하천이 영원히 미완수가 되고,
 *   서버(claim_river_badge)와 클라이언트의 판정이 어긋나 배지가 안 나옵니다.
 */
export function isCompleteWith(
  river: RiverView,
  missionDone: boolean,
  solved: Set<string>,
): boolean {
  return isRiverComplete({ ...river, missionDone, quizSolvedIds: solved });
}
