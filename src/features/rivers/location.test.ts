import { describe, expect, it } from 'vitest';
import { distanceMeters, type GeoPosition } from '@/lib/geo';
import { makeRiver } from './fixtures';
import {
  POOR_ACCURACY_M,
  approxDistance,
  isAccuracyPoor,
  lockNote,
  lockOf,
  unlockedCount,
  withLocks,
} from './location';

/**
 * 표시용 규칙 단위 테스트.
 * 거리 계산 자체(Haversine)는 lib/geo.ts의 책임이라 여기서 다시 검증하지 않고,
 * "그 결과를 어떤 잠금/문구로 바꾸는가"만 봅니다.
 */

/** 온천천 픽스처 좌표(35.2049, 129.0784) 기준으로 위도를 밀어 거리를 만듭니다. */
const METRES_PER_DEG_LAT = 111_194.93;

function pos(lat: number, lng: number, accuracy = 20): GeoPosition {
  return { lat, lng, accuracy, at: 0 };
}

/** 온천천에서 북쪽으로 대략 m 미터 떨어진 좌표. */
function northOf(m: number, accuracy = 20): GeoPosition {
  return pos(35.2049 + m / METRES_PER_DEG_LAT, 129.0784, accuracy);
}

describe('isAccuracyPoor', () => {
  it('오차가 임계값 이하이면 신뢰합니다', () => {
    expect(isAccuracyPoor(20)).toBe(false);
    expect(isAccuracyPoor(POOR_ACCURACY_M)).toBe(false);
  });

  it('오차가 임계값을 넘으면 거리를 단정하지 않습니다', () => {
    expect(isAccuracyPoor(POOR_ACCURACY_M + 1)).toBe(true);
    expect(isAccuracyPoor(1200)).toBe(true);
  });

  it('값이 없거나 비정상이면 "나쁘다"고 단정하지 않습니다', () => {
    expect(isAccuracyPoor(null)).toBe(false);
    expect(isAccuracyPoor(undefined)).toBe(false);
    expect(isAccuracyPoor(Number.NaN)).toBe(false);
  });
});

describe('approxDistance', () => {
  it('DB 좌표가 근사값이라 항상 "약"을 붙입니다', () => {
    expect(approxDistance(340)).toBe('약 340m');
    expect(approxDistance(1234)).toBe('약 1.2km');
  });

  it('거리를 모르면 숫자를 지어내지 않습니다', () => {
    expect(approxDistance(null)).toBe('거리를 아직 몰라요');
  });
});

describe('lockOf', () => {
  it('위치를 모르면 잠긴 채로, 남은 거리는 null 입니다', () => {
    const lock = lockOf(makeRiver(), null);
    expect(lock).toEqual({ locked: true, remainingM: null, distanceM: null });
  });

  it('반경 안이면 열리고 남은 거리는 0 입니다', () => {
    const river = makeRiver(); // radiusM 1500
    const lock = lockOf(river, northOf(500));
    expect(lock.locked).toBe(false);
    expect(lock.remainingM).toBe(0);
    expect(lock.distanceM).toBeGreaterThan(400);
  });

  it('반경 밖이면 잠기고 반경까지 남은 거리를 돌려줍니다', () => {
    const river = makeRiver();
    const lock = lockOf(river, northOf(2500));
    expect(lock.locked).toBe(true);
    // 2500m 지점 - 반경 1500m ≈ 1000m
    expect(lock.remainingM).toBeGreaterThan(900);
    expect(lock.remainingM).toBeLessThan(1100);
  });

  it('반경은 하천마다 다릅니다 — 같은 거리라도 반경이 크면 열립니다', () => {
    const wide = makeRiver({ radiusM: 3000 });
    const narrow = makeRiver({ radiusM: 1000 });
    expect(lockOf(wide, northOf(2500)).locked).toBe(false);
    expect(lockOf(narrow, northOf(2500)).locked).toBe(true);
  });

  it('좌표가 없는 하천(queries.ts가 0,0으로 떨어뜨린 경우)에 가짜 거리를 붙이지 않습니다', () => {
    // (0,0)은 널 아일랜드입니다 — 부산에서 재면 1만 km 가까이 나옵니다.
    const noSpot = makeRiver({ lat: 0, lng: 0 });
    expect(lockOf(noSpot, pos(35.2049, 129.0784))).toEqual({
      locked: true,
      remainingM: null,
      distanceM: null,
    });
    expect(lockNote({ locked: true, remainingM: null, distanceM: null }, 20, false)).toBe(
      '이 하천은 위치 정보가 아직 없어요',
    );
  });

  it('lib/geo.ts의 거리와 같은 값을 씁니다', () => {
    const river = makeRiver();
    const p = northOf(2500);
    expect(lockOf(river, p).distanceM).toBe(
      distanceMeters(p.lat, p.lng, river.lat, river.lng),
    );
  });
});

describe('withLocks', () => {
  const rivers = [
    makeRiver({ id: 'far', slug: 'far', lat: 35.2049 + 0.09, lng: 129.0784 }),
    makeRiver({ id: 'mid', slug: 'mid', lat: 35.2049 + 0.05, lng: 129.0784 }),
    makeRiver({ id: 'near', slug: 'near', lat: 35.2049, lng: 129.0784 }),
  ];

  it('위치가 없으면 순서를 흔들지 않고 전부 잠급니다', () => {
    const list = withLocks(rivers, null);
    expect(list.map((x) => x.river.id)).toEqual(['far', 'mid', 'near']);
    expect(list.every((x) => x.lock.locked)).toBe(true);
    expect(list.every((x) => !x.nearest)).toBe(true);
    expect(unlockedCount(list)).toBe(0);
  });

  it('위치를 받으면 가까운 순으로 정렬하고 첫 하천만 nearest 입니다', () => {
    const list = withLocks(rivers, pos(35.2049, 129.0784));
    expect(list.map((x) => x.river.id)).toEqual(['near', 'mid', 'far']);
    expect(list.map((x) => x.nearest)).toEqual([true, false, false]);
    expect(list[0].lock.locked).toBe(false);
    expect(list[1].lock.locked).toBe(true);
    expect(unlockedCount(list)).toBe(1);
  });

  it('빈 목록에서도 터지지 않습니다', () => {
    expect(withLocks([], pos(35.2, 129.07))).toEqual([]);
  });
});

describe('lockNote', () => {
  it('위치를 아직 모르면 거리를 말하지 않습니다', () => {
    expect(lockNote({ locked: true, remainingM: null, distanceM: null }, null)).toBe(
      '하천 근처에 가면 열려요',
    );
  });

  it('반경 밖이면 남은 거리를 "약"으로 말합니다', () => {
    expect(lockNote({ locked: true, remainingM: 1234, distanceM: 2734 }, 20)).toBe(
      '약 1.2km 더 가야 해요',
    );
  });

  it('오차가 크면 거리를 단정하지 않고 그 사실을 덧붙입니다', () => {
    const note = lockNote({ locked: true, remainingM: 1234, distanceM: 2734 }, 900);
    expect(note).toContain('약 1.2km');
    expect(note).toContain('정확하지 않아요');
  });

  it('반경 안이면 "인증"이 아니라 "도전할 수 있어요"라고 말합니다', () => {
    const note = lockNote({ locked: false, remainingM: 0, distanceM: 300 }, 20);
    expect(note).toBe('지금 도전할 수 있어요');
    expect(note).not.toContain('인증');
  });
});
