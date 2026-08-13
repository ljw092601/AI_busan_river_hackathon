/**
 * DB row → 도메인 변환 테스트.
 *
 * 여기서 지키려는 것은 "타입이 맞는가"가 아니라
 * **화면이 깨지지 않는가**입니다. tier가 Record<Tier, …>의 키를 벗어나면
 * DexCard의 별 배지가 undefined가 되고, months가 비면 모든 카드가
 * 영원히 비시즌으로 잠깁니다. 둘 다 조용히 실패하는 종류의 버그입니다.
 */

import { describe, expect, it } from 'vitest';
import type { Row } from '../../types/database';
import { sortForDisplay, toDexEntry, toMonths, toSpecies, toTier, toWaterGrade } from './mappers';
import { TIER_STARS } from './display';
import { isInSeason } from './season';

function speciesRow(over: Partial<Row<'species'>> = {}): Row<'species'> {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    code: 'melania_snail',
    common_name: '다슬기',
    scientific_name: null,
    category: 'benthos',
    tier: 2,
    track: 'challenge',
    water_grade: 2,
    months: [4, 5, 6, 7, 8, 9, 10],
    id_hint: '뾰족한 원뿔 모양.',
    fact: '',
    ethics_flag: 'none',
    illustration_url: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00+09:00',
    updated_at: '2026-01-01T00:00:00+09:00',
    ...over,
  };
}

describe('toSpecies', () => {
  it('snake_case 컬럼을 도메인 필드로 옮긴다', () => {
    const s = toSpecies(speciesRow());
    expect(s).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      code: 'melania_snail',
      commonName: '다슬기',
      category: 'benthos',
      tier: 2,
      track: 'challenge',
      waterGrade: 2,
      idHint: '뾰족한 원뿔 모양.',
      ethicsFlag: 'none',
    });
  });

  it('null 컬럼은 선택 필드로 만들지 않는다 (빈 문자열이 화면에 새지 않게)', () => {
    const s = toSpecies(speciesRow({ scientific_name: null, illustration_url: null }));
    expect('scientificName' in s).toBe(false);
    expect('illustrationUrl' in s).toBe(false);
  });

  it('값이 있으면 선택 필드를 채운다', () => {
    const s = toSpecies(
      speciesRow({ scientific_name: 'Semisulcospira libertina', illustration_url: '/i/x.png' }),
    );
    expect(s.scientificName).toBe('Semisulcospira libertina');
    expect(s.illustrationUrl).toBe('/i/x.png');
  });

  it('tier는 언제나 표시 계층이 아는 키다', () => {
    for (const tier of [1, 2, 3, 4, 5]) {
      expect(TIER_STARS[toSpecies(speciesRow({ tier })).tier]).toBeTruthy();
    }
  });
});

describe('toTier', () => {
  it('DB check 제약 안의 값은 그대로 통과시킨다', () => {
    expect(toTier(3)).toBe(3);
  });

  it('범위를 벗어난 값은 화면을 깨뜨리는 대신 1로 떨어뜨린다', () => {
    expect(toTier(0)).toBe(1);
    expect(toTier(9)).toBe(1);
  });
});

describe('toWaterGrade', () => {
  it('null이면 지표종이 아니다', () => {
    expect(toWaterGrade(null)).toBeNull();
  });

  it('1~4만 인정한다', () => {
    expect(toWaterGrade(1)).toBe(1);
    expect(toWaterGrade(4)).toBe(4);
    expect(toWaterGrade(5)).toBeNull();
  });
});

describe('toMonths', () => {
  it('오름차순으로 정렬하고 중복을 없앤다', () => {
    expect(toMonths([10, 4, 4, 7])).toEqual([4, 7, 10]);
  });

  it('범위 밖 월은 버린다', () => {
    expect(toMonths([0, 3, 13])).toEqual([3]);
  });

  it('빈 배열이면 연중으로 본다 — 모든 카드를 비시즌으로 잠그지 않는다', () => {
    const months = toMonths([]);
    expect(months).toHaveLength(12);
    expect(isInSeason(months, 1)).toBe(true);
    expect(isInSeason(months, 12)).toBe(true);
  });
});

describe('toDexEntry', () => {
  it('도감 보유 행을 도메인으로 옮긴다', () => {
    const entry = toDexEntry({
      user_id: 'u-1',
      species_id: 'sp-1',
      first_observed_at: '2026-05-02T10:12:00+09:00',
      best_photo_id: null,
      count: 4,
      updated_at: '2026-05-02T10:12:00+09:00',
    });
    expect(entry).toEqual({
      userId: 'u-1',
      speciesId: 'sp-1',
      firstObservedAt: '2026-05-02T10:12:00+09:00',
      bestPhotoId: null,
      count: 4,
    });
  });
});

describe('sortForDisplay', () => {
  it('낮은 등급을 먼저 둔다 — 첫 화면이 실루엣투성이가 되지 않게', () => {
    const list = [
      toSpecies(speciesRow({ id: 'a', code: 'kingfisher', common_name: '물총새', tier: 4 })),
      toSpecies(speciesRow({ id: 'b', code: 'sparrow', common_name: '참새', tier: 1 })),
      toSpecies(speciesRow({ id: 'c', code: 'melania', common_name: '다슬기', tier: 2 })),
    ];
    expect(sortForDisplay(list).map((s) => s.tier)).toEqual([1, 2, 4]);
  });

  it('원본 배열을 건드리지 않는다', () => {
    const list = [
      toSpecies(speciesRow({ id: 'a', tier: 4 })),
      toSpecies(speciesRow({ id: 'b', tier: 1 })),
    ];
    sortForDisplay(list);
    expect(list.map((s) => s.id)).toEqual(['a', 'b']);
  });
});
