/**
 * 후보 압축 테스트 (PLAN.md §7.5 ①, §7.7)
 *
 * 여기서 검증하는 것이 곧 판별 정확도의 상한입니다 —
 * 후보 목록이 틀리면 그 뒤의 모든 판정이 틀립니다.
 */

import {
  DEFAULT_CANDIDATE_CONFIG,
  isInSeason,
  narrowCandidates,
  narrowCandidatesWithFallback,
  toClassifyCandidates,
} from './candidates';
import {
  ALL_SPECIES,
  cheongdung,
  galdae,
  heunPpyam,
  jinggeomdari,
  jungdaebaengno,
  nalDorae,
  soebaengno,
  sudal,
} from './fixtures';

const SPOT_ALL = ALL_SPECIES.map((s) => s.id);

describe('narrowCandidates — 계절 필터', () => {
  it('현재 월이 months에 포함된 종만 남긴다', () => {
    // 1월: 청둥오리(11~3)는 있고, 쇠백로(4~10)·갈대(8~11)는 없다
    const ids = narrowCandidates(ALL_SPECIES, SPOT_ALL, 1).map((s) => s.id);

    expect(ids).toContain(cheongdung.id);
    expect(ids).not.toContain(soebaengno.id);
    expect(ids).not.toContain(galdae.id);
  });

  it('연중 종은 어느 달에도 남는다', () => {
    for (const month of [1, 4, 7, 10, 12]) {
      const ids = narrowCandidates(ALL_SPECIES, SPOT_ALL, month).map((s) => s.id);
      expect(ids).toContain(heunPpyam.id);
      expect(ids).toContain(jinggeomdari.id);
    }
  });

  it('7월에는 여름종이 나오고 겨울철새는 빠진다', () => {
    const ids = narrowCandidates(ALL_SPECIES, SPOT_ALL, 7).map((s) => s.id);

    expect(ids).toEqual(expect.arrayContaining([soebaengno.id, jungdaebaengno.id]));
    expect(ids).not.toContain(cheongdung.id);
  });

  it('월 값이 1~12 밖이면 아무것도 통과하지 못한다 (조용히 전체를 통과시키지 않는다)', () => {
    expect(narrowCandidates(ALL_SPECIES, SPOT_ALL, 0)).toHaveLength(0);
    expect(narrowCandidates(ALL_SPECIES, SPOT_ALL, 13)).toHaveLength(0);
    expect(narrowCandidates(ALL_SPECIES, SPOT_ALL, 7.5)).toHaveLength(0);
    expect(narrowCandidates(ALL_SPECIES, SPOT_ALL, NaN)).toHaveLength(0);
  });

  it('isInSeason은 경계 월을 포함한다', () => {
    expect(isInSeason(soebaengno, 4)).toBe(true);
    expect(isInSeason(soebaengno, 10)).toBe(true);
    expect(isInSeason(soebaengno, 3)).toBe(false);
    expect(isInSeason(soebaengno, 11)).toBe(false);
  });
});

describe('narrowCandidates — 스팟 매핑', () => {
  it('스팟에 매핑되지 않은 종은 제외한다', () => {
    const ids = narrowCandidates(ALL_SPECIES, [heunPpyam.id], 7).map((s) => s.id);
    expect(ids).toEqual([heunPpyam.id]);
  });

  it('존재하지 않는 종 id가 매핑에 섞여도 무시한다', () => {
    const ids = narrowCandidates(
      ALL_SPECIES,
      [heunPpyam.id, 'does-not-exist', 'typo-id'],
      7,
    ).map((s) => s.id);
    expect(ids).toEqual([heunPpyam.id]);
  });

  it('중복 id가 있어도 후보가 늘어나지 않는다', () => {
    const ids = narrowCandidates(
      ALL_SPECIES,
      [heunPpyam.id, heunPpyam.id, heunPpyam.id],
      7,
    ).map((s) => s.id);
    expect(ids).toEqual([heunPpyam.id]);
  });
});

describe('narrowCandidates — expert_only 제외 (PLAN.md §7.6 ④)', () => {
  it('일반 모드에서는 expert_only 종을 후보로 제시하지 않는다', () => {
    const ids = narrowCandidates(ALL_SPECIES, SPOT_ALL, 7).map((s) => s.id);
    expect(ids).not.toContain(nalDorae.id);
  });

  it('전문가 동반 모드에서는 expert_only 종이 후보에 포함된다', () => {
    const ids = narrowCandidates(ALL_SPECIES, SPOT_ALL, 7, {
      expertAccompanied: true,
    }).map((s) => s.id);
    expect(ids).toContain(nalDorae.id);
  });

  it('report_only(보호종)는 촬영 대상이 아니어도 후보 목록에는 남는다 — 목격 보고로 획득', () => {
    const ids = narrowCandidates(ALL_SPECIES, SPOT_ALL, 7).map((s) => s.id);
    expect(ids).toContain(sudal.id);
  });
});

describe('narrowCandidates — 정렬', () => {
  it('등급 오름차순으로 정렬한다 (희귀종을 위에 두지 않는다)', () => {
    const tiers = narrowCandidates(ALL_SPECIES, SPOT_ALL, 7).map((s) => s.tier);
    const sorted = [...tiers].sort((a, b) => a - b);
    expect(tiers).toEqual(sorted);
  });

  it('같은 입력이면 항상 같은 순서다 (프롬프트 캐시·테스트 재현성)', () => {
    const a = narrowCandidates(ALL_SPECIES, SPOT_ALL, 7).map((s) => s.id);
    const b = narrowCandidates(ALL_SPECIES, [...SPOT_ALL].reverse(), 7).map((s) => s.id);
    expect(a).toEqual(b);
  });
});

describe('narrowCandidatesWithFallback — 빈 결과 엣지 케이스', () => {
  it('계절 결과가 있으면 폴백하지 않는다', () => {
    const r = narrowCandidatesWithFallback(ALL_SPECIES, SPOT_ALL, 7);
    expect(r.fallback).toBe('none');
    expect(r.inSeasonCount).toBe(r.candidates.length);
    expect(r.candidates.length).toBeGreaterThan(0);
  });

  it('겨울에 여름종만 매핑된 스팟이면 보장 트랙을 계절 무시하고 노출한다', () => {
    // 스팟에 여름종(쇠백로)과 가을 식물(갈대)만 매핑 → 1월에는 계절 결과 0개
    const spot = [soebaengno.id, galdae.id];
    const r = narrowCandidatesWithFallback(ALL_SPECIES, spot, 1);

    expect(r.inSeasonCount).toBe(0);
    expect(r.fallback).toBe('guaranteed_track_all_season');
    // 갈대(보장 트랙)만 살아남고, 쇠백로(도전 트랙)는 여전히 제외
    expect(r.candidates.map((s) => s.id)).toEqual([galdae.id]);
  });

  it('폴백에서도 expert_only는 절대 풀리지 않는다', () => {
    // "후보가 없다"는 이유로 저서생물 채집을 유도하면 안 됩니다 (§7.6 ④)
    const spot = [soebaengno.id, nalDorae.id];
    const r = narrowCandidatesWithFallback(ALL_SPECIES, spot, 1);

    expect(r.candidates.map((s) => s.id)).not.toContain(nalDorae.id);
    expect(r.fallback).toBe('empty');
  });

  it('보장 트랙조차 없으면 empty를 돌려준다 (관찰 일지로 넘길 신호)', () => {
    const r = narrowCandidatesWithFallback(ALL_SPECIES, [soebaengno.id], 1);
    expect(r.candidates).toHaveLength(0);
    expect(r.fallback).toBe('empty');
  });

  it('스팟 매핑 자체가 비어 있어도 던지지 않는다', () => {
    const r = narrowCandidatesWithFallback(ALL_SPECIES, [], 7);
    expect(r.candidates).toHaveLength(0);
    expect(r.fallback).toBe('empty');
  });

  it('폴백을 끄면 계절 결과가 0개일 때 그대로 empty다', () => {
    const r = narrowCandidatesWithFallback(ALL_SPECIES, [galdae.id], 1, {
      config: { ...DEFAULT_CANDIDATE_CONFIG, fallbackToGuaranteedTrack: false },
    });
    expect(r.fallback).toBe('empty');
    expect(r.candidates).toHaveLength(0);
  });
});

describe('toClassifyCandidates — 외부 전송 페이로드', () => {
  it('id · commonName · idHint · category만 남긴다', () => {
    const [payload] = toClassifyCandidates([soebaengno]);

    expect(payload).toEqual({
      id: soebaengno.id,
      commonName: soebaengno.commonName,
      idHint: soebaengno.idHint,
      category: soebaengno.category,
    });
  });

  it('fact·waterGrade·months 같은 내부 필드는 실려 나가지 않는다', () => {
    const [payload] = toClassifyCandidates([soebaengno]);
    expect(Object.keys(payload).sort()).toEqual([
      'category',
      'commonName',
      'id',
      'idHint',
    ]);
  });
});
