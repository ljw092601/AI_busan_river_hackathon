import { describe, expect, it } from 'vitest';
import { makeRiver } from '@/features/rivers/fixtures';
import { FALLBACK_RADIUS_M, geoSignature, riverMarkersOf, styleSignature } from './markers';

/**
 * 마커 데이터 파생 — 지도가 무엇을 그릴지 결정하는 부분입니다.
 * 잠금 판정 자체는 rivers/types.ts의 lockStateOf가 하고, 여기서는 그 결과를
 * 지도가 쓰는 모양으로 옮기기만 하는지 확인합니다.
 */

// makeRiver의 기본 좌표(온천천 근사값) 기준
const ONCHEON = { lat: 35.2049, lng: 129.0784 };

describe('riverMarkersOf', () => {
  it('위치를 모르면 전부 inside=false, distance=null', () => {
    // 첫 방문자의 기본 상태 — 지도는 그래도 5개 하천을 다 그려야 합니다.
    const [m] = riverMarkersOf([makeRiver()], null);
    expect(m.inside).toBe(false);
    expect(m.distanceM).toBeNull();
  });

  it('반경 안이면 inside=true', () => {
    const [m] = riverMarkersOf([makeRiver({ radiusM: 1500 })], ONCHEON);
    expect(m.inside).toBe(true);
    expect(m.distanceM).toBeCloseTo(0, 3);
  });

  it('반경 밖이면 inside=false지만 거리는 알려준다', () => {
    const far = { lat: 35.1723, lng: 129.1289 }; // 수영강 쪽, 약 5km
    const [m] = riverMarkersOf([makeRiver({ radiusM: 1500 })], far);
    expect(m.inside).toBe(false);
    expect(m.distanceM).toBeGreaterThan(1500);
  });

  it('좌표가 없는 하천은 지도에서 제외한다', () => {
    // (0,0)을 그리면 지도 전체가 대서양까지 축소되어 나머지가 뭉갭니다.
    const markers = riverMarkersOf(
      [makeRiver({ id: 'a' }), makeRiver({ id: 'b', lat: 0, lng: 0 })],
      null,
    );
    expect(markers.map((m) => m.id)).toEqual(['a']);
  });

  it('radiusM이 비정상이면 기본 반경으로 대체한다', () => {
    const [zero] = riverMarkersOf([makeRiver({ radiusM: 0 })], null);
    const [nan] = riverMarkersOf([makeRiver({ radiusM: Number.NaN })], null);
    expect(zero.radiusM).toBe(FALLBACK_RADIUS_M);
    expect(nan.radiusM).toBe(FALLBACK_RADIUS_M);
  });

  it('아이콘이 비어 있으면 물방울로 대체한다', () => {
    const [m] = riverMarkersOf([makeRiver({ icon: '' })], null);
    expect(m.icon).toBe('💧');
  });

  it('선택된 하천만 selected=true', () => {
    const markers = riverMarkersOf([makeRiver({ id: 'a' }), makeRiver({ id: 'b' })], null, 'b');
    expect(markers.map((m) => m.selected)).toEqual([false, true]);
  });

  it('selectedRiverId가 null이면 아무것도 선택되지 않는다', () => {
    const markers = riverMarkersOf([makeRiver({ id: 'a' })], null, null);
    expect(markers[0].selected).toBe(false);
  });
});

describe('signatures', () => {
  const near = { lat: ONCHEON.lat, lng: ONCHEON.lng };
  const far = { lat: 35.1723, lng: 129.1289 };

  it('geoSignature는 반경 진입에 흔들리지 않는다', () => {
    // 흔들리면 아이가 걸어서 반경에 들어가는 순간 지도가 제멋대로 다시 튑니다.
    const outside = riverMarkersOf([makeRiver()], far);
    const inside = riverMarkersOf([makeRiver()], near);
    expect(geoSignature(outside)).toBe(geoSignature(inside));
  });

  it('geoSignature는 선택 변화에도 흔들리지 않는다', () => {
    const none = riverMarkersOf([makeRiver({ id: 'a' })], null, null);
    const picked = riverMarkersOf([makeRiver({ id: 'a' })], null, 'a');
    expect(geoSignature(none)).toBe(geoSignature(picked));
  });

  it('geoSignature는 하천 구성이 바뀌면 달라진다', () => {
    const one = riverMarkersOf([makeRiver({ id: 'a' })], null);
    const two = riverMarkersOf([makeRiver({ id: 'a' }), makeRiver({ id: 'b' })], null);
    expect(geoSignature(one)).not.toBe(geoSignature(two));
  });

  it('styleSignature는 반경 진입과 선택 변화를 잡아낸다', () => {
    const outside = riverMarkersOf([makeRiver()], far);
    const inside = riverMarkersOf([makeRiver()], near);
    expect(styleSignature(outside)).not.toBe(styleSignature(inside));

    const picked = riverMarkersOf([makeRiver({ id: 'river-1' })], far, 'river-1');
    expect(styleSignature(outside)).not.toBe(styleSignature(picked));
  });

  it('GPS가 미세하게 흔들려도 styleSignature는 그대로다', () => {
    // 매 초 다시 그리면 마커가 깜빡입니다. 반경 안/밖이 그대로면 다시 그릴 이유가 없습니다.
    const a = riverMarkersOf([makeRiver()], { lat: 35.2049, lng: 129.0784 });
    const b = riverMarkersOf([makeRiver()], { lat: 35.20491, lng: 129.07841 });
    expect(styleSignature(a)).toBe(styleSignature(b));
  });
});
