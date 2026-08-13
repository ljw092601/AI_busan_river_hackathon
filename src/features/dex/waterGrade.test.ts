/**
 * 수질 판정·계절 로직 테스트.
 *
 * 특히 "낮은 등급을 실패로 표현하지 않는다"(PLAN.md §7.4)는
 * 문구가 조용히 무너지기 쉬운 규칙이라 테스트로 잠가둡니다.
 */

import { describe, expect, it } from 'vitest';
import { judgeWaterGrade } from './waterGrade';
import { comebackHint, formatMonths, isInSeason } from './season';
import { MOCK_ENTRIES, MOCK_SPECIES } from './mockData';

/** 아이에게 절대 보이면 안 되는 표현 */
const BLAME = /실패|밖에 안|부족|나쁨|더러운 물이에요|오염됐어/;

function foundFromEntries() {
  const owned = new Set(MOCK_ENTRIES.map((e) => e.speciesId));
  return MOCK_SPECIES.filter((s) => owned.has(s.id));
}

describe('formatMonths', () => {
  it('연중·구간·해를 넘기는 구간을 읽을 수 있게 바꾼다', () => {
    expect(formatMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('연중');
    expect(formatMonths([4, 5, 6, 7, 8, 9, 10])).toBe('4~10월');
    expect(formatMonths([11, 12, 1, 2, 3])).toBe('11~3월');
    expect(formatMonths([5])).toBe('5월');
  });
});

describe('comebackHint', () => {
  it('비시즌 카드에 다시 올 때를 알려준다', () => {
    expect(isInSeason([11, 12, 1, 2, 3], 7)).toBe(false);
    expect(comebackHint([11, 12, 1, 2, 3], 7)).toBe('가을에 다시 와줘!');
    expect(comebackHint([11, 12, 1, 2, 3], 10)).toBe('다음 달에 다시 와줘!');
  });
});

describe('judgeWaterGrade', () => {
  it('찾은 지표생물 중 가장 맑은 등급으로 판정한다', () => {
    const j = judgeWaterGrade(MOCK_SPECIES, foundFromEntries());
    expect(j.estimated).toBe(2); // 피라미·다슬기·물달팽이
    expect(j.indicatorCount).toBe(3);
    expect(j.headline).toContain('2급수');
  });

  it('1급수 줄은 0종이어도 남겨서 다음 목표로 보이게 한다', () => {
    const j = judgeWaterGrade(MOCK_SPECIES, foundFromEntries());
    const g1 = j.rows.find((r) => r.grade === 1);
    expect(g1).toBeDefined();
    expect(g1?.found).toHaveLength(0);
  });

  it('한 단계 맑아지면 올 수 있는 친구를 이름으로 제시한다', () => {
    const j = judgeWaterGrade(MOCK_SPECIES, foundFromEntries());
    expect(j.hopeText).toMatch(/조금 더 맑아지면/);
    expect(j.hopeSpecies.length).toBeGreaterThan(0);
    expect(j.hopeSpecies.every((s) => s.waterGrade === 1)).toBe(true);
  });

  it('지표생물을 하나도 못 찾아도 아이를 탓하지 않는다', () => {
    const j = judgeWaterGrade(MOCK_SPECIES, []);
    expect(j.estimated).toBeNull();
    expect(`${j.headline} ${j.body} ${j.hopeText}`).not.toMatch(BLAME);
  });

  it('어떤 등급이 나와도 비난 표현이 없다', () => {
    for (const grade of [1, 2, 3, 4] as const) {
      const found = MOCK_SPECIES.filter((s) => s.waterGrade === grade);
      if (found.length === 0) continue;
      const j = judgeWaterGrade(MOCK_SPECIES, found);
      expect(j.estimated).toBe(grade);
      expect(`${j.headline} ${j.body} ${j.hopeText}`).not.toMatch(BLAME);
    }
  });

  it('가장 맑은 1급수에서는 지켜주자는 문구로 끝난다', () => {
    const g1 = MOCK_SPECIES.filter((s) => s.waterGrade === 1);
    const j = judgeWaterGrade(MOCK_SPECIES, g1);
    expect(j.estimated).toBe(1);
    expect(j.hopeText).toContain('지켜주자');
  });

  it('지표생물 1종만 찾았으면 단정하지 않는다', () => {
    const one = MOCK_SPECIES.filter((s) => s.id === 'sp-melania');
    const j = judgeWaterGrade(MOCK_SPECIES, one);
    expect(j.tentative).toBe(true);
    expect(j.headline).toContain('쯤');
  });
});
