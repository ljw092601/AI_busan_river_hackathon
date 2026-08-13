import { describe, expect, it } from 'vitest';
import {
  ALL_SEASONS,
  collectionProgress,
  evaluateBadges,
  isCourseComplete,
  isCoursePartial,
  isDexSetComplete,
  PARTIAL_COURSE_MIN_SPOTS,
  pointReasonForBadge,
  seasonOf,
} from './badges';
import type { BadgeState, CourseProgress, DexSetDefinition } from './badges';

function course(over: Partial<CourseProgress> = {}): CourseProgress {
  return {
    riverSlug: 'oncheoncheon',
    totalSpots: 6,
    visitedSpotIds: [],
    ...over,
  };
}

const waterbirdSet: DexSetDefinition = {
  code: 'waterbird_5',
  name: '물새 5종',
  speciesIds: ['duck', 'mallard', 'egret', 'heron', 'cormorant'],
};

function state(over: Partial<BadgeState> = {}): BadgeState {
  return { courses: [], ownedSpeciesIds: [], ...over };
}

describe('코스 완주', () => {
  it('전 스팟 체크인이면 완주', () => {
    const c = course({ visitedSpotIds: ['1', '2', '3', '4', '5', '6'] });
    expect(isCourseComplete(c)).toBe(true);
    expect(evaluateBadges(state({ courses: [c] }))).toContain('course_complete:oncheoncheon');
  });

  it('중복 체크인이 섞여도 스팟 수로 센다', () => {
    const c = course({ totalSpots: 3, visitedSpotIds: ['1', '1', '1'] });
    expect(isCourseComplete(c)).toBe(false);
    expect(isCoursePartial(c)).toBe(false);
  });

  it('3개만 찍어도 부분 뱃지 (PLAN.md §2.2 — 완주 강박은 이탈을 부른다)', () => {
    const c = course({ visitedSpotIds: ['1', '2', '3'] });
    expect(PARTIAL_COURSE_MIN_SPOTS).toBe(3);
    expect(isCoursePartial(c)).toBe(true);
    expect(evaluateBadges(state({ courses: [c] }))).toEqual(['course_partial:oncheoncheon']);
  });

  it('2개면 아직 뱃지 없음', () => {
    const c = course({ visitedSpotIds: ['1', '2'] });
    expect(evaluateBadges(state({ courses: [c] }))).toEqual([]);
  });

  it('완주한 코스는 부분 뱃지를 중복으로 주지 않는다', () => {
    const c = course({ totalSpots: 4, visitedSpotIds: ['1', '2', '3', '4'] });
    const badges = evaluateBadges(state({ courses: [c] }));
    expect(badges).toContain('course_complete:oncheoncheon');
    expect(badges).not.toContain('course_partial:oncheoncheon');
  });

  it('totalSpots가 0이면 완주로 보지 않는다', () => {
    expect(isCourseComplete(course({ totalSpots: 0, visitedSpotIds: [] }))).toBe(false);
  });
});

describe('하천 3개 완주 마일스톤', () => {
  const done = (slug: string) =>
    course({ riverSlug: slug, totalSpots: 2, visitedSpotIds: ['a', 'b'] });

  it('3개 완주하면 마일스톤 뱃지', () => {
    const badges = evaluateBadges(
      state({ courses: [done('oncheoncheon'), done('suyeong'), done('haeundae')] }),
    );
    expect(badges).toContain('river_milestone_3');
  });

  it('2개면 아직 아니다', () => {
    const badges = evaluateBadges(state({ courses: [done('oncheoncheon'), done('suyeong')] }));
    expect(badges).not.toContain('river_milestone_3');
  });

  it('부분 완주는 마일스톤에 세지 않는다', () => {
    const badges = evaluateBadges(
      state({
        courses: [
          done('a'),
          done('b'),
          course({ riverSlug: 'c', totalSpots: 6, visitedSpotIds: ['1', '2', '3'] }),
        ],
      }),
    );
    expect(badges).not.toContain('river_milestone_3');
  });
});

describe('도감 세트 완성', () => {
  it('세트 전체를 모으면 완성', () => {
    const owned = ['duck', 'mallard', 'egret', 'heron', 'cormorant', 'reed'];
    expect(isDexSetComplete(waterbirdSet, owned)).toBe(true);
    expect(evaluateBadges(state({ ownedSpeciesIds: owned, dexSets: [waterbirdSet] }))).toContain(
      'dex_set:waterbird_5',
    );
  });

  it('한 종이 빠지면 미완성', () => {
    const owned = ['duck', 'mallard', 'egret', 'heron'];
    expect(isDexSetComplete(waterbirdSet, owned)).toBe(false);
  });

  it('requiredCount가 있으면 부분 수집으로도 완성 가능', () => {
    const partialSet: DexSetDefinition = { ...waterbirdSet, requiredCount: 3 };
    expect(isDexSetComplete(partialSet, ['duck', 'mallard', 'egret'])).toBe(true);
    expect(isDexSetComplete(partialSet, ['duck', 'mallard'])).toBe(false);
  });
});

describe('계절 완주 (PLAN.md §7.7)', () => {
  it('완주한 계절마다 뱃지', () => {
    const c = course({
      totalSpots: 2,
      visitedSpotIds: ['a', 'b'],
      completedSeasons: ['spring', 'winter'],
    });
    const badges = evaluateBadges(state({ courses: [c] }));
    expect(badges).toContain('season:oncheoncheon:spring');
    expect(badges).toContain('season:oncheoncheon:winter');
    expect(badges).not.toContain('season:oncheoncheon:summer');
    expect(badges).not.toContain('season_master:oncheoncheon');
  });

  it('사계절을 모두 완주하면 마스터 뱃지', () => {
    const c = course({ totalSpots: 2, visitedSpotIds: ['a', 'b'], completedSeasons: ALL_SEASONS });
    expect(evaluateBadges(state({ courses: [c] }))).toContain('season_master:oncheoncheon');
  });

  it('seasonOf는 KST 월 기준으로 계절을 자른다', () => {
    expect(seasonOf('2026-03-01T00:00:00.000Z')).toBe('spring');
    expect(seasonOf('2026-07-15T00:00:00.000Z')).toBe('summer');
    expect(seasonOf('2026-10-01T00:00:00.000Z')).toBe('autumn');
    expect(seasonOf('2026-01-05T00:00:00.000Z')).toBe('winter');
    expect(seasonOf('2026-12-31T20:00:00.000Z')).toBe('winter'); // KST 2027-01-01
    // UTC로는 2월 28일이지만 KST로는 3월 1일 → 봄
    expect(seasonOf('2026-02-28T16:00:00.000Z')).toBe('spring');
  });
});

describe('보호종 특별 기록', () => {
  it('🏅 발견 시 special_record 뱃지 (포인트가 아니라 뱃지로 차별화 — §7.4)', () => {
    expect(evaluateBadges(state({ protectedSpeciesFound: true }))).toContain('special_record');
    expect(evaluateBadges(state({ protectedSpeciesFound: false }))).not.toContain('special_record');
  });
});

describe('pointReasonForBadge', () => {
  it('포인트가 붙는 뱃지만 사유를 돌려준다', () => {
    expect(pointReasonForBadge('course_complete:oncheoncheon')).toBe('course_complete');
    expect(pointReasonForBadge('dex_set:waterbird_5')).toBe('dex_set_complete');
    expect(pointReasonForBadge('river_milestone_3')).toBe('river_milestone');
  });

  it('부분·계절·특별 뱃지는 포인트 없음 (PLAN.md §6.1 표에 없는 항목을 만들지 않는다)', () => {
    expect(pointReasonForBadge('course_partial:oncheoncheon')).toBeNull();
    expect(pointReasonForBadge('season:oncheoncheon:spring')).toBeNull();
    expect(pointReasonForBadge('season_master:oncheoncheon')).toBeNull();
    expect(pointReasonForBadge('special_record')).toBeNull();
  });
});

describe('evaluateBadges 전반', () => {
  it('빈 상태면 빈 배열', () => {
    expect(evaluateBadges(state())).toEqual([]);
  });

  it('결과에 중복이 없다', () => {
    const badges = evaluateBadges(
      state({
        courses: [
          course({ totalSpots: 2, visitedSpotIds: ['a', 'b'], completedSeasons: ['spring', 'spring'] }),
        ],
      }),
    );
    expect(badges).toHaveLength(new Set(badges).size);
  });

  it('같은 상태로 다시 평가해도 결과가 같다 (순수 함수 · 재계산 안전)', () => {
    const s = state({
      courses: [course({ totalSpots: 2, visitedSpotIds: ['a', 'b'], completedSeasons: ['summer'] })],
      ownedSpeciesIds: waterbirdSet.speciesIds,
      dexSets: [waterbirdSet],
      protectedSpeciesFound: true,
    });
    expect(evaluateBadges(s)).toEqual(evaluateBadges(s));
  });
});

describe('collectionProgress — 리더보드 대신 쓰는 개인 진척도 (PLAN.md §6.3)', () => {
  it('도감·스팟·코스·세트 진척을 집계한다', () => {
    const p = collectionProgress(
      state({
        courses: [
          course({ totalSpots: 6, visitedSpotIds: ['1', '2', '3'] }),
          course({ riverSlug: 'suyeong', totalSpots: 4, visitedSpotIds: ['a', 'b', 'c', 'd'] }),
        ],
        ownedSpeciesIds: ['duck', 'duck', 'egret'],
        totalSpeciesCount: 40,
        dexSets: [waterbirdSet],
      }),
    );
    expect(p).toEqual({
      dexOwned: 2,
      dexTotal: 40,
      dexRatio: 2 / 40,
      spotsVisited: 7,
      spotsTotal: 10,
      coursesCompleted: 1,
      setsCompleted: 0,
    });
  });

  it('도감 전체 종 수를 모르면 비율은 0 (0으로 나누지 않는다)', () => {
    expect(collectionProgress(state({ ownedSpeciesIds: ['duck'] })).dexRatio).toBe(0);
  });
});
