import { describe, expect, it } from 'vitest';
import { TIER_POINTS } from '../../types/domain';
import type { PointsLedgerEntry, Tier } from '../../types/domain';
import {
  applyCorrection,
  CORRECTION_REF_TYPE,
  correctionAccountingNote,
  correctionEntries,
  correctSpecies,
  isCorrectionEntry,
  pointsDeltaForCorrection,
} from './corrections';
import { balance, balanceByReason, createEntry, isDuplicate } from './ledger';

const ALL_TIERS: Tier[] = [1, 2, 3, 4, 5];

function awardEntry(tier: Tier): PointsLedgerEntry {
  return createEntry({
    id: 'award-1',
    createdAt: '2026-05-10T02:00:00.000Z',
    userId: 'u1',
    reason: 'species_found',
    refType: 'species',
    refId: 'sp-big-egret',
    tier,
  });
}

function correctionInput(fromTier: Tier, toTier: Tier) {
  return {
    observationId: 'obs-1',
    userId: 'u1',
    fromSpeciesId: 'sp-big-egret',
    toSpeciesId: 'sp-little-egret',
    fromTier,
    toTier,
    note: '쇠백로와 중대백로는 부리 색이 달라!',
    correctedAt: '2026-05-12T02:00:00.000Z',
    entryId: 'corr-1',
  };
}

describe('★ 회귀 방지 — 정정은 절대 차감하지 않는다 (PLAN.md §7.5)', () => {
  it('모든 (from, to) 등급 조합에서 delta가 0이다', () => {
    for (const from of ALL_TIERS) {
      for (const to of ALL_TIERS) {
        expect(pointsDeltaForCorrection(from, to)).toBe(0);
        expect(correctSpecies(correctionInput(from, to)).entry.delta).toBe(0);
      }
    }
  });

  it('상위 → 하위 등급으로 정정돼도 음수 delta가 생기지 않는다', () => {
    // ⭐⭐⭐⭐(60P) 로 적립됐다가 ⭐(20P)로 정정 — 차감 정책이었다면 -40P
    const { entry } = correctSpecies(correctionInput(4, 1));
    expect(entry.delta).toBe(0);
    expect(entry.delta).not.toBeLessThan(0);
  });

  it('정정 후에도 잔액이 그대로다', () => {
    const ledger = [awardEntry(4)];
    const before = balance(ledger);
    const { entries } = applyCorrection(ledger, correctionInput(4, 1));
    expect(balance(entries)).toBe(before);
    expect(balance(entries)).toBe(TIER_POINTS[4]);
  });

  it('상향 정정도 추가 지급하지 않는다 (역인센티브 방지 — 대칭 규칙)', () => {
    const ledger = [awardEntry(1)];
    const { entries } = applyCorrection(ledger, correctionInput(1, 4));
    expect(balance(entries)).toBe(TIER_POINTS[1]);
  });

  it('원장 전체에 음수 delta가 하나도 없다', () => {
    let entries: PointsLedgerEntry[] = [awardEntry(5)];
    entries = applyCorrection(entries, correctionInput(5, 1)).entries;
    entries = applyCorrection(entries, { ...correctionInput(1, 2), entryId: 'corr-2', observationId: 'obs-2' }).entries;
    expect(entries.every((e) => e.delta >= 0)).toBe(true);
  });
});

describe('정정 이력은 남는다', () => {
  it('원장에 delta 0 항목이 추가된다', () => {
    const ledger = [awardEntry(4)];
    const { entries, record } = applyCorrection(ledger, correctionInput(4, 2));
    expect(entries).toHaveLength(2);
    expect(entries[1]).toBe(record.entry);
    expect(record.entry.refType).toBe(CORRECTION_REF_TYPE);
    expect(record.entry.refId).toBe('obs-1');
    expect(isCorrectionEntry(record.entry)).toBe(true);
  });

  it('메타데이터로 무엇이 무엇으로 바뀌었는지 되짚을 수 있다', () => {
    const record = correctSpecies(correctionInput(4, 2));
    expect(record.correction).toMatchObject({
      observationId: 'obs-1',
      userId: 'u1',
      fromSpeciesId: 'sp-big-egret',
      toSpeciesId: 'sp-little-egret',
      fromTier: 4,
      toTier: 2,
      correctedAt: '2026-05-12T02:00:00.000Z',
    });
    expect(record.correction.note).toContain('부리');
  });

  it('correctionEntries로 검수 이력만 골라낼 수 있다', () => {
    const ledger = [awardEntry(3)];
    const { entries } = applyCorrection(ledger, correctionInput(3, 1));
    expect(correctionEntries(entries)).toHaveLength(1);
    expect(isCorrectionEntry(entries[0]!)).toBe(false);
  });

  it('적립 항목과 refType이 겹치지 않는다', () => {
    expect(awardEntry(3).refType).not.toBe(CORRECTION_REF_TYPE);
  });
});

describe('정정이 다른 로직을 오염시키지 않는다', () => {
  it('사유별 집계가 정정 때문에 바뀌지 않는다', () => {
    const ledger = [awardEntry(2)];
    const { entries } = applyCorrection(ledger, correctionInput(2, 1));
    expect(balanceByReason(entries).species_found).toBe(TIER_POINTS[2]);
  });

  it('정정 항목이 이후의 정당한 적립을 중복으로 막지 않는다', () => {
    const { entries } = applyCorrection([], correctionInput(2, 1));
    const nextAward = createEntry({
      id: 'award-2',
      createdAt: '2026-05-13T02:00:00.000Z',
      userId: 'u1',
      reason: 'species_found',
      refType: 'species',
      refId: 'sp-little-egret',
      tier: 1,
    });
    expect(isDuplicate(entries, nextAward)).toBe(false);
  });

  it('applyCorrection은 원본 배열을 변경하지 않는다', () => {
    const ledger = [awardEntry(2)];
    applyCorrection(ledger, correctionInput(2, 1));
    expect(ledger).toHaveLength(1);
  });
});

describe('correctionAccountingNote', () => {
  it('차감 정책이었다면 얼마였을지를 기록하되 적용은 0이다', () => {
    const note = correctionAccountingNote(4, 1, TIER_POINTS);
    expect(note.hypotheticalDelta).toBe(TIER_POINTS[1] - TIER_POINTS[4]);
    expect(note.hypotheticalDelta).toBeLessThan(0);
    expect(note.appliedDelta).toBe(0);
  });
});
