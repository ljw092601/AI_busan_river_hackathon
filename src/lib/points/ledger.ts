/**
 * 포인트 원장(ledger) 연산 — append-only 장부 위의 순수 함수들.
 *
 * ── 왜 잔액 컬럼이 아니라 원장인가 (PLAN.md §4.2 설계 노트) ──
 * `users.points` 같은 정수 컬럼은
 *   (1) 동시 업데이트에서 유실되기 쉽고 (읽고-더하고-쓰는 사이에 다른 적립이 끼어듦),
 *   (2) "이 포인트가 왜 생겼지?"를 되짚을 수 없습니다.
 * 원장이면 잔액은 그냥 `SUM(delta)`이고,
 * 굿즈 교환 분쟁·부정 적립 회수·통계가 전부 같은 테이블에서 해결됩니다.
 * 회계가 수백 년간 이 방식을 쓰는 데는 이유가 있습니다.
 *
 * 이 파일에는 IO가 없습니다. 원장 배열을 인자로 받아 값을 반환할 뿐이며,
 * 실제 INSERT는 서버(Edge Function)가 합니다.
 */

import { ALL_POINT_REASONS, pointsFor } from './calculate';
import type { PointContext } from './calculate';
import type { PointReason, PointsLedgerEntry, Tier } from '../../types/domain';

// ─────────────────────────────────────────────────────────────
// 잔액 · 집계
// ─────────────────────────────────────────────────────────────

/**
 * 잔액 = SUM(delta).
 *
 * 정정 항목(delta 0)이 섞여 있어도 잔액에 영향이 없습니다 — 그게 설계 의도입니다.
 * (corrections.ts 참고)
 */
export function balance(entries: readonly PointsLedgerEntry[]): number {
  return entries.reduce((sum, e) => sum + e.delta, 0);
}

/** 특정 사용자의 잔액. 여러 사용자의 원장이 섞인 배열에서도 안전하게 씁니다. */
export function balanceOf(
  entries: readonly PointsLedgerEntry[],
  userId: string,
): number {
  return balance(entries.filter((e) => e.userId === userId));
}

/**
 * 사유별 집계 — 통계·리포트용.
 * 모든 사유를 0으로 채워서 돌려줍니다. 화면에서 `?? 0` 분기를 하지 않아도 되고,
 * "체크인만 하고 관찰은 안 하는 아이"처럼 0인 항목 자체가 지표가 되기 때문입니다.
 */
export function balanceByReason(
  entries: readonly PointsLedgerEntry[],
): Record<PointReason, number> {
  const acc = Object.fromEntries(
    ALL_POINT_REASONS.map((r) => [r, 0]),
  ) as Record<PointReason, number>;
  for (const e of entries) acc[e.reason] += e.delta;
  return acc;
}

/**
 * 코호트 합산 — PLAN.md §6.3.
 *
 * v0.5(보호자 계정 전환)로 학급 개념이 사라졌습니다. 한 계정 = 한 가족 = 하나의 도감이라
 * "가족 합산"은 그냥 `balance()`입니다. 이 함수는 **운영자 통계용**으로만 남깁니다
 * (파일럿 참여 가족 전체의 총합·팀 수).
 *
 * 개인/가족 랭킹을 만들지 않기 위해 **총합과 팀 수만** 돌려줍니다.
 * 정렬된 사용자별 순위를 반환하는 함수는 이 모듈에 의도적으로 없습니다.
 */
export function cohortTotal(entries: readonly PointsLedgerEntry[]): {
  total: number;
  teamCount: number;
} {
  return {
    total: balance(entries),
    teamCount: new Set(entries.map((e) => e.userId)).size,
  };
}

// ─────────────────────────────────────────────────────────────
// 항목 생성
// ─────────────────────────────────────────────────────────────

export interface CreateEntryInput {
  userId: string;
  reason: PointReason;
  /** 무엇에 대한 적립인지 (예: 'spot' | 'quiz' | 'species' | 'river') */
  refType?: string | null;
  refId?: string | null;
  /** reason이 'species_found'일 때 필수 */
  tier?: Tier;
  /**
   * 규칙 계산을 덮어씁니다. 정정 항목(0P) 같은 특수 케이스 전용이며,
   * 일반 적립에는 쓰지 마세요 — 규칙이 코드 밖으로 새어나갑니다.
   */
  delta?: number;
  /** 생략하면 crypto.randomUUID(). DB가 채운다면 ''를 넘기세요 */
  id?: string;
  /** 생략하면 현재 시각. 테스트·재현성을 위해 주입할 수 있습니다 */
  createdAt?: string;
}

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  throw new Error(
    'crypto.randomUUID를 쓸 수 없는 환경입니다. createEntry에 id를 명시하세요.',
  );
}

/**
 * 원장 항목 생성 헬퍼.
 * delta는 규칙(calculate.ts)에서 유도합니다 — 호출측이 점수를 직접 적지 않게 하려는 것입니다.
 */
export function createEntry(input: CreateEntryInput): PointsLedgerEntry {
  const ctx: PointContext = { tier: input.tier };
  return {
    id: input.id ?? newId(),
    userId: input.userId,
    delta: input.delta ?? pointsFor(input.reason, ctx),
    reason: input.reason,
    refType: input.refType ?? null,
    refId: input.refId ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// 중복 적립 방지
// ─────────────────────────────────────────────────────────────

/**
 * 중복 판정 단위(family).
 *
 * ★ 판단이 필요했던 지점 — 퀴즈:
 *   `reason`을 그대로 키에 넣으면 'quiz_wrong'(5P)과 'quiz_correct'(15P)가
 *   서로 다른 키가 되어, **일부러 틀린 뒤 다시 맞히면 20P**를 먹습니다.
 *   정답만 눌렀을 때(15P)보다 이득이 되는 규칙은 그 자체로 버그입니다.
 *   그래서 두 사유를 같은 'quiz' family로 묶어 **퀴즈 1문항당 1회**만 적립합니다.
 *   (오답 5P의 목적은 이탈 방지이지 재도전 보상이 아닙니다 — PLAN.md §6.1)
 */
type DedupeFamily =
  | 'checkin'
  | 'quiz'
  | 'species_found'
  | 'observation_log'
  | 'course_complete'
  | 'dex_set_complete'
  | 'river_milestone';

const DEDUPE_FAMILY: Record<PointReason, DedupeFamily> = {
  checkin: 'checkin',
  species_found: 'species_found',
  observation_log: 'observation_log',
  quiz_correct: 'quiz',
  quiz_wrong: 'quiz',
  course_complete: 'course_complete',
  dex_set_complete: 'dex_set_complete',
  river_milestone: 'river_milestone',
};

/**
 * 중복 판정 범위.
 *   'once'  — (사용자, family, ref) 조합당 평생 1회
 *   'daily' — 같은 조합이라도 날짜(KST)가 다르면 다시 적립 가능
 */
type DedupeScope = 'once' | 'daily';

/**
 * ★ 판단이 필요했던 지점 — 관찰 일지(observation_log):
 *
 *   관찰 일지는 "아무것도 못 찾은 아이"를 위한 빈손 방지 장치입니다(PLAN.md §7.2).
 *   그래서 두 가지를 동시에 만족해야 합니다.
 *     (a) 무한 포인트 펌프가 되면 안 된다 — 한 스팟에서 일지를 10번 쓰면 100P가 되는 규칙은 무너집니다.
 *     (b) 계절 재방문을 막으면 안 된다 — 앱 전체가 "같은 하천을 계절마다 다시 걷기"를
 *         핵심 리텐션으로 삼고 있습니다(PLAN.md §7.7). 봄에 일지를 썼다고
 *         겨울에 다시 온 아이에게 0P를 주면 설계가 서로 싸웁니다.
 *
 *   그래서 단위를 **(사용자, 스팟, 그날)** 로 잡았습니다 = 스팟당 하루 1회.
 *   하루에 같은 스팟에서 여러 장 쓰는 건 자유이되 포인트는 첫 장에만 붙고,
 *   계절이 바뀌어 다시 오면 새로 적립됩니다.
 *
 *   나머지 사유(체크인·퀴즈·종 발견·완주·세트)는 전부 'once'입니다.
 *   특히 종 발견은 도감 카드가 종당 1장이므로(DexEntry) 포인트도 종당 1회여야
 *   "카드는 안 늘었는데 점수만 오른다"는 모순이 생기지 않습니다.
 */
const DEDUPE_SCOPE: Record<DedupeFamily, DedupeScope> = {
  checkin: 'once',
  quiz: 'once',
  species_found: 'once',
  observation_log: 'daily',
  course_complete: 'once',
  dex_set_complete: 'once',
  river_milestone: 'once',
};

/** 중복 판정에 필요한 최소 정보 */
export type DedupeCandidate = Pick<
  PointsLedgerEntry,
  'userId' | 'reason' | 'refType' | 'refId' | 'createdAt'
>;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * ISO 시각 → KST 기준 'YYYY-MM-DD'.
 *
 * Intl/타임존 DB에 의존하지 않고 +9h 오프셋을 직접 더합니다.
 * 한국 표준시는 서머타임이 없어 고정 오프셋이 정확하고, 이 함수가 순수하게 유지됩니다.
 * UTC 날짜를 그냥 쓰면 아침 8시 활동이 '전날'로 집계돼 하루 경계가 어긋납니다.
 */
export function kstDateKey(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    throw new Error(`createdAt을 시각으로 해석할 수 없습니다: ${iso}`);
  }
  return new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 중복 판정 키. 같은 키를 가진 적립 항목은 원장에 하나만 존재해야 합니다.
 * DB에서도 이 키로 UNIQUE 인덱스를 걸면 동시 요청까지 막을 수 있습니다
 * (클라이언트 판정만으로는 더블탭·오프라인 큐 재전송을 못 막습니다).
 */
export function dedupeKey(candidate: DedupeCandidate): string {
  const family = DEDUPE_FAMILY[candidate.reason];
  const day = DEDUPE_SCOPE[family] === 'daily' ? kstDateKey(candidate.createdAt) : '';
  return [candidate.userId, family, candidate.refType ?? '', candidate.refId ?? '', day].join(
    '|',
  );
}

/**
 * 이미 적립된 항목인가?
 *
 * 정정 항목(delta 0, corrections.ts)은 검사 대상에서 제외합니다.
 * 정정은 '적립 사실'이 아니라 '기록 수정'이므로,
 * 이후의 정당한 적립을 가로막아선 안 됩니다.
 */
export function isDuplicate(
  entries: readonly PointsLedgerEntry[],
  candidate: DedupeCandidate,
): boolean {
  const key = dedupeKey(candidate);
  return entries.some(
    (e) => !isNonAwardEntry(e) && dedupeKey(e) === key,
  );
}

/** 적립이 아닌 항목(정정 등 delta 0 기록) 판별 */
function isNonAwardEntry(entry: PointsLedgerEntry): boolean {
  return entry.delta === 0;
}

/**
 * 중복이 아니면 항목을 만들어 덧붙이고, 중복이면 원장을 그대로 돌려줍니다.
 * 원본 배열을 변경하지 않습니다(append-only 장부를 코드에서도 지킵니다).
 */
export function appendIfNew(
  entries: readonly PointsLedgerEntry[],
  input: CreateEntryInput,
): { entries: PointsLedgerEntry[]; entry: PointsLedgerEntry | null; skipped: boolean } {
  const entry = createEntry(input);
  if (isDuplicate(entries, entry)) {
    return { entries: [...entries], entry: null, skipped: true };
  }
  return { entries: [...entries, entry], entry, skipped: false };
}
