import { describe, expect, it } from 'vitest';
import { POINT_VALUES, TIER_POINTS } from '../../types/domain';
import type { PointReason, Tier } from '../../types/domain';
import { ALL_POINT_REASONS, pointsFor, pointsForSpeciesFound } from './calculate';

describe('pointsForSpeciesFound', () => {
  it('등급별 포인트가 TIER_POINTS와 정확히 일치한다', () => {
    const tiers: Tier[] = [1, 2, 3, 4, 5];
    for (const tier of tiers) {
      expect(pointsForSpeciesFound(tier)).toBe(TIER_POINTS[tier]);
    }
  });

  it('PLAN.md §7.4 표의 값(20/30/45/60/60)을 그대로 낸다', () => {
    // 상수를 참조하지 않고 리터럴로 못박은 유일한 테스트.
    // 구현이 TIER_POINTS를 참조하므로, 표가 바뀌면 이 테스트가 먼저 깨져
    // "기획 표도 같이 고쳤는가"를 되묻게 하는 장치입니다.
    expect([1, 2, 3, 4, 5].map((t) => pointsForSpeciesFound(t as Tier))).toEqual([
      20, 30, 45, 60, 60,
    ]);
  });

  it('보호종(5)은 ⭐⭐⭐⭐(4)와 같은 점수 — 추적 유인을 만들지 않기 위해', () => {
    expect(pointsForSpeciesFound(5)).toBe(pointsForSpeciesFound(4));
  });
});

describe('pointsFor', () => {
  it('species_found 외의 모든 사유가 POINT_VALUES와 일치한다', () => {
    for (const [reason, value] of Object.entries(POINT_VALUES)) {
      expect(pointsFor(reason as PointReason)).toBe(value);
    }
  });

  it('species_found는 ctx.tier로 계산한다', () => {
    expect(pointsFor('species_found', { tier: 3 })).toBe(TIER_POINTS[3]);
  });

  it('species_found인데 tier가 없으면 0을 조용히 주지 않고 던진다', () => {
    expect(() => pointsFor('species_found')).toThrow();
    expect(() => pointsFor('species_found', {})).toThrow();
  });

  it('퀴즈 오답(5P)이 정답(15P)보다 작다 — 오답이 이득이 되면 안 된다', () => {
    expect(pointsFor('quiz_wrong')).toBeLessThan(pointsFor('quiz_correct'));
  });

  it('모든 사유가 양수다 (적립 규칙에는 음수가 없다)', () => {
    for (const reason of ALL_POINT_REASONS) {
      const value = reason === 'species_found' ? pointsFor(reason, { tier: 1 }) : pointsFor(reason);
      expect(value).toBeGreaterThan(0);
    }
  });

  it('ALL_POINT_REASONS는 PointReason 유니온 전체(8개)를 담는다', () => {
    expect(new Set(ALL_POINT_REASONS).size).toBe(8);
    expect(ALL_POINT_REASONS).toContain('species_found');
  });
});
