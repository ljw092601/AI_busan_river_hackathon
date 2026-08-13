import { describe, expect, it } from 'vitest';
import {
  BUSAN_CENTER,
  DEFAULT_LEVEL,
  FOCUS_LEVEL,
  boundsOf,
  centerOf,
  isUsablePoint,
  padBounds,
  viewportOf,
} from './viewport';

/**
 * 시야 계산은 지도에서 유일하게 SDK 없이 검증할 수 있는 부분입니다.
 * jsdom에는 카카오 SDK가 없어 실제 지도 렌더는 테스트하지 않습니다.
 */

const SUYEONG = { lat: 35.1723, lng: 129.1289 };
const DAECHEON = { lat: 35.2417, lng: 128.9932 };

describe('isUsablePoint', () => {
  it('정상 좌표를 통과시킨다', () => {
    expect(isUsablePoint(SUYEONG)).toBe(true);
  });

  it('(0,0)은 좌표 미입력으로 보고 버린다', () => {
    // 통과시키면 지도가 대서양까지 축소되어 부산 하천이 점 하나로 뭉갭니다.
    expect(isUsablePoint({ lat: 0, lng: 0 })).toBe(false);
  });

  it('NaN·범위 밖·null을 버린다', () => {
    expect(isUsablePoint({ lat: Number.NaN, lng: 129 })).toBe(false);
    expect(isUsablePoint({ lat: 35, lng: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isUsablePoint({ lat: 91, lng: 129 })).toBe(false);
    expect(isUsablePoint({ lat: 35, lng: 181 })).toBe(false);
    expect(isUsablePoint(null)).toBe(false);
    expect(isUsablePoint(undefined)).toBe(false);
  });
});

describe('boundsOf', () => {
  it('모든 점을 담는 사각형을 만든다', () => {
    const b = boundsOf([SUYEONG, DAECHEON]);
    expect(b).not.toBeNull();
    expect(b!.sw).toEqual({ lat: 35.1723, lng: 128.9932 });
    expect(b!.ne).toEqual({ lat: 35.2417, lng: 129.1289 });
  });

  it('쓸 수 없는 점은 빼고 계산한다', () => {
    const b = boundsOf([SUYEONG, { lat: 0, lng: 0 }, DAECHEON]);
    expect(b!.sw.lng).toBeCloseTo(128.9932, 6);
  });

  it('쓸 수 있는 점이 없으면 null', () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([{ lat: 0, lng: 0 }])).toBeNull();
  });
});

describe('padBounds', () => {
  it('가장자리에 여백을 더한다', () => {
    const padded = padBounds({ sw: { lat: 35, lng: 129 }, ne: { lat: 36, lng: 130 } }, 0.1, 0.001);
    expect(padded.sw.lat).toBeCloseTo(34.9, 6);
    expect(padded.ne.lat).toBeCloseTo(36.1, 6);
    expect(padded.sw.lng).toBeCloseTo(128.9, 6);
    expect(padded.ne.lng).toBeCloseTo(130.1, 6);
  });

  it('폭이 0이어도 최소 여백은 남는다', () => {
    const padded = padBounds({ sw: SUYEONG, ne: SUYEONG }, 0.1, 0.002);
    expect(padded.ne.lat - padded.sw.lat).toBeCloseTo(0.004, 6);
  });
});

describe('centerOf', () => {
  it('사각형의 한가운데', () => {
    expect(centerOf({ sw: { lat: 35, lng: 129 }, ne: { lat: 36, lng: 130 } })).toEqual({
      lat: 35.5,
      lng: 129.5,
    });
  });
});

describe('viewportOf', () => {
  it('점이 없으면 부산 전역을 보여준다', () => {
    expect(viewportOf([])).toEqual({
      kind: 'center',
      center: BUSAN_CENTER,
      level: DEFAULT_LEVEL,
    });
  });

  it('점이 하나면 setBounds 대신 중심+레벨을 쓴다', () => {
    // setBounds로는 카카오가 최대 확대까지 들어가 건물 하나만 보이게 됩니다.
    const vp = viewportOf([SUYEONG]);
    expect(vp.kind).toBe('center');
    if (vp.kind !== 'center') throw new Error('unreachable');
    expect(vp.level).toBe(FOCUS_LEVEL);
    expect(vp.center.lat).toBeCloseTo(SUYEONG.lat, 6);
  });

  it('같은 자리에 여러 점이 겹쳐도 중심+레벨로 떨어진다', () => {
    expect(viewportOf([SUYEONG, { ...SUYEONG }]).kind).toBe('center');
  });

  it('서로 다른 점이 둘 이상이면 여백을 둔 bounds', () => {
    const vp = viewportOf([SUYEONG, DAECHEON]);
    expect(vp.kind).toBe('bounds');
    if (vp.kind !== 'bounds') throw new Error('unreachable');
    // 원본보다 항상 넓어야 이름표가 화면 끝에서 잘리지 않습니다.
    expect(vp.bounds.sw.lat).toBeLessThan(SUYEONG.lat);
    expect(vp.bounds.ne.lat).toBeGreaterThan(DAECHEON.lat);
    expect(vp.bounds.sw.lng).toBeLessThan(DAECHEON.lng);
    expect(vp.bounds.ne.lng).toBeGreaterThan(SUYEONG.lng);
  });

  it('내 위치가 하천 밖에 있어도 함께 담긴다', () => {
    const me = { lat: 35.3, lng: 129.3 };
    const vp = viewportOf([SUYEONG, DAECHEON, me]);
    if (vp.kind !== 'bounds') throw new Error('unreachable');
    expect(vp.bounds.ne.lat).toBeGreaterThan(me.lat);
    expect(vp.bounds.ne.lng).toBeGreaterThan(me.lng);
  });
});
