import { afterEach, describe, expect, it } from 'vitest';
import {
  distanceMeters,
  formatDistance,
  getSimulatedPosition,
  setSimulatedPosition,
} from './geo';

afterEach(() => setSimulatedPosition(null));

describe('distanceMeters', () => {
  it('같은 지점은 0', () => {
    expect(distanceMeters(35.2049, 129.0784, 35.2049, 129.0784)).toBe(0);
  });

  it('온천천 ↔ 대천천 실제 거리 (약 6~8km)', () => {
    const d = distanceMeters(35.2049, 129.0784, 35.2344, 129.0128);
    expect(d).toBeGreaterThan(5_000);
    expect(d).toBeLessThan(9_000);
  });

  it('대칭이다', () => {
    const a = distanceMeters(35.17, 129.12, 35.23, 129.01);
    const b = distanceMeters(35.23, 129.01, 35.17, 129.12);
    expect(Math.abs(a - b)).toBeLessThan(1e-6);
  });

  it('★ (0,0)은 부산에서 9000km 이상 — Null Island를 유효 좌표로 쓰면 안 되는 이유', () => {
    expect(distanceMeters(35.2049, 129.0784, 0, 0)).toBeGreaterThan(9_000_000);
  });
});

describe('formatDistance', () => {
  it('1km 미만은 m 단위 정수', () => {
    expect(formatDistance(340.4)).toBe('340m');
    expect(formatDistance(999)).toBe('999m');
  });

  it('1km 이상은 소수 한 자리 km', () => {
    expect(formatDistance(1000)).toBe('1.0km');
    expect(formatDistance(1234)).toBe('1.2km');
  });

  it('유한하지 않은 값은 —', () => {
    expect(formatDistance(Number.NaN)).toBe('—');
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('시연용 위치 시뮬레이션', () => {
  it('기본값은 비어 있다 (실제 GPS 사용)', () => {
    expect(getSimulatedPosition()).toBeNull();
  });

  it('설정하면 그 좌표가 나온다', () => {
    setSimulatedPosition({ lat: 35.2049, lng: 129.0784 });
    expect(getSimulatedPosition()).toMatchObject({ lat: 35.2049, lng: 129.0784 });
  });

  it('시뮬레이션 좌표는 오차를 작게 보고한다 — "위치가 흔들려요" 경고가 뜨면 안 됨', () => {
    setSimulatedPosition({ lat: 35.2049, lng: 129.0784 });
    expect(getSimulatedPosition()!.accuracy).toBeLessThan(300);
  });

  it('null 로 되돌리면 실제 GPS 로 복귀', () => {
    setSimulatedPosition({ lat: 35.2049, lng: 129.0784 });
    setSimulatedPosition(null);
    expect(getSimulatedPosition()).toBeNull();
  });
});
