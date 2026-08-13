/**
 * 종 오판정 정정 — **차감하지 않습니다.**
 *
 * ─────────────────────────────────────────────────────────────
 * ★ 나중에 누군가 "정정인데 왜 차감을 안 하지?"라고 물으면, 답은 여기 있습니다.
 * ─────────────────────────────────────────────────────────────
 *
 * 근거: PLAN.md §7.5
 *   "오판정이 확인되면 카드를 회수하지 않고 '다시 살펴보니 ○○였어!'로 정정 처리합니다
 *    (포인트 원장에 정정 항목을 남기되 차감하지 않음 — 아이를 처벌하지 않습니다).
 *    오히려 정정 경험 자체를 학습 콘텐츠로 씁니다 — '쇠백로와 중대백로는 이렇게 달라!'"
 *
 * 왜 그런가 — 네 가지 이유:
 *
 *  1) **아이가 한 일은 틀린 게 아닙니다.** 이 앱에서 보상하는 행위는 '정답 맞히기'가 아니라
 *     '하천에 나가서 생물을 찾아 관찰하고 스스로 골라보기'입니다(PLAN.md §7.5 Insight).
 *     그 행위는 이미 완료됐고, 판정이 나중에 바뀌었다고 해서 사라지지 않습니다.
 *
 *  2) **차감은 관찰을 줄입니다.** 게임 디자인에서 보상은 곧 지시문입니다(PLAN.md §7.6).
 *     헷갈리는 종을 신고했다가 점수를 잃는 규칙이라면, 아이는 확실한 참새만 찍고
 *     애매한 걸 피합니다. 정확히 반대 행동을 유도하게 됩니다.
 *
 *  3) **판정 주체가 아이가 아닙니다.** 정정은 검수자·모델이 하는 일이고,
 *     오판정의 상당 부분은 시스템 쪽 원인(흐린 사진, 식별 힌트 부족, 모델 약점)입니다.
 *     시스템 오차를 아이 잔액에서 빼는 건 책임 소재가 어긋납니다.
 *
 *  4) **잔액이 흔들리면 신뢰가 깨집니다.** 굿즈 교환을 앞둔 아이의 점수가
 *     사후 검수로 줄어드는 경험은, 원장을 도입해 얻으려던 '추적 가능성'의 반대편 효과입니다.
 *     회수는 부정 적립(치팅) 대응 수단으로 남겨두고, 정직한 오식별에는 쓰지 않습니다.
 *
 * 대칭 규칙 — **상향 정정도 추가 지급하지 않습니다.**
 *   ⭐ → ⭐⭐⭐ 로 정정돼도 delta는 0입니다.
 *   (a) 하향은 안 깎고 상향만 더 주면 "일단 낮은 등급으로 신고하고 정정을 노린다"는
 *       역인센티브가 생기고,
 *   (b) "정정은 포인트에 영향이 없다"는 한 줄 규칙이 아이에게 설명하기도 쉽습니다.
 *   추가 성취가 필요하면 포인트가 아니라 뱃지·카드 연출로 줍니다.
 *
 * 그래서 정정은 **delta 0 원장 항목 + 메타데이터**로 남깁니다.
 * 잔액(SUM(delta))은 불변이지만 "언제, 무엇이, 무엇으로 바뀌었는가"는 원장에 그대로 남습니다.
 */

import { createEntry } from './ledger';
import type { PointsLedgerEntry, Tier } from '../../types/domain';

/**
 * 정정 항목의 refType.
 * 일반 적립(refType: 'species' 등)과 문자열이 겹치지 않게 접두사를 둡니다 —
 * 원장 한 줄만 봐도 "이건 적립이 아니라 정정"임을 알 수 있어야 하고,
 * 중복 판정(ledger.dedupeKey)에서도 적립 항목과 섞이지 않아야 합니다.
 */
export const CORRECTION_REF_TYPE = 'correction:observation';

/** 정정 이력 — 원장 항목에 담기지 않는 메타데이터 */
export interface SpeciesCorrection {
  observationId: string;
  userId: string;
  /** 아이가 처음 고른 종 */
  fromSpeciesId: string;
  /** 검수 후 확정된 종 */
  toSpeciesId: string;
  /** 처음 적립의 근거가 된 등급 */
  fromTier: Tier;
  /** 정정 후 등급 */
  toTier: Tier;
  /** 아이에게 보여줄 문구의 근거가 되는 설명 (예: "쇠백로와 중대백로는 부리 색이 달라!") */
  note?: string;
  correctedAt: string;
}

/** 원장 항목 + 메타데이터 한 쌍 */
export interface CorrectionRecord {
  /** delta 0 — 원장에 남지만 잔액은 변하지 않습니다 */
  entry: PointsLedgerEntry;
  correction: SpeciesCorrection;
}

/**
 * 정정으로 인한 포인트 증감. **항상 0입니다.**
 *
 * 이 함수가 존재하는 이유는 단 하나 — 회귀 방지용 훅입니다.
 * 나중에 "정정하면 차감해야 하지 않나"라는 변경이 들어오면 여기서 막히고,
 * corrections.test.ts가 즉시 빨간불을 냅니다. 등급 인자를 받지만 쓰지 않는 것도
 * "등급 차이를 알고도 0을 선택했다"는 걸 시그니처로 드러내기 위함입니다.
 */
export function pointsDeltaForCorrection(_fromTier: Tier, _toTier: Tier): 0 {
  return 0;
}

/**
 * 정정을 감사(監査)하기 위한 회계 메모.
 * 만약 차감 정책이었다면 얼마였을지(`hypotheticalDelta`)를 함께 남깁니다.
 * 잔액에는 절대 반영하지 않고, "무차감 정책의 비용이 얼마인가"를
 * 운영이 나중에 확인할 수 있게 하기 위한 통계용 값입니다.
 */
export function correctionAccountingNote(
  fromTier: Tier,
  toTier: Tier,
  tierPoints: Record<Tier, number>,
): {
  awardedTier: Tier;
  correctedTier: Tier;
  hypotheticalDelta: number;
  appliedDelta: 0;
} {
  return {
    awardedTier: fromTier,
    correctedTier: toTier,
    hypotheticalDelta: tierPoints[toTier] - tierPoints[fromTier],
    appliedDelta: pointsDeltaForCorrection(fromTier, toTier),
  };
}

export interface CorrectSpeciesInput {
  observationId: string;
  userId: string;
  fromSpeciesId: string;
  toSpeciesId: string;
  fromTier: Tier;
  toTier: Tier;
  note?: string;
  /** 생략하면 현재 시각 */
  correctedAt?: string;
  /** 생략하면 crypto.randomUUID() */
  entryId?: string;
}

/**
 * 정정 기록을 만듭니다. 포인트 증감은 없습니다(delta 0).
 *
 * reason은 'species_found'를 그대로 씁니다 — PointReason에 'correction'이 없고,
 * 정정은 "그 종 발견 건에 대한 후속 기록"이므로 같은 사유 축에 두는 게
 * `balanceByReason` 통계에서도 일관됩니다(0을 더하므로 합계는 그대로).
 */
export function correctSpecies(input: CorrectSpeciesInput): CorrectionRecord {
  const correctedAt = input.correctedAt ?? new Date().toISOString();

  const entry = createEntry({
    userId: input.userId,
    reason: 'species_found',
    refType: CORRECTION_REF_TYPE,
    refId: input.observationId,
    // ★ 등급이 내려가도 음수를 만들지 않습니다. 위 주석 참고.
    delta: pointsDeltaForCorrection(input.fromTier, input.toTier),
    createdAt: correctedAt,
    ...(input.entryId !== undefined ? { id: input.entryId } : {}),
  });

  return {
    entry,
    correction: {
      observationId: input.observationId,
      userId: input.userId,
      fromSpeciesId: input.fromSpeciesId,
      toSpeciesId: input.toSpeciesId,
      fromTier: input.fromTier,
      toTier: input.toTier,
      ...(input.note !== undefined ? { note: input.note } : {}),
      correctedAt,
    },
  };
}

/** 원장에 정정 항목을 덧붙입니다(원본 불변). 잔액은 변하지 않습니다. */
export function applyCorrection(
  entries: readonly PointsLedgerEntry[],
  input: CorrectSpeciesInput,
): { entries: PointsLedgerEntry[]; record: CorrectionRecord } {
  const record = correctSpecies(input);
  return { entries: [...entries, record.entry], record };
}

/** 원장 항목이 정정 기록인가 */
export function isCorrectionEntry(entry: PointsLedgerEntry): boolean {
  return entry.refType === CORRECTION_REF_TYPE;
}

/** 원장에서 정정 항목만 골라냅니다 (검수 이력 화면·통계용) */
export function correctionEntries(
  entries: readonly PointsLedgerEntry[],
): PointsLedgerEntry[] {
  return entries.filter(isCorrectionEntry);
}
