/**
 * 지도 시야(viewport) 계산 — 순수 함수만 있습니다.
 *
 * SDK 없이도 검증할 수 있도록 카카오 객체를 일절 참조하지 않습니다.
 * (jsdom에는 카카오 SDK가 없어서, 지도 관련 로직 중 테스트 가능한 부분은 여기뿐입니다.)
 */

export interface MapPoint {
  lat: number;
  lng: number;
}

export interface MapBounds {
  sw: MapPoint;
  ne: MapPoint;
}

/** 하천 목록조차 없을 때만 쓰는 기본 위치(부산시청 부근). */
export const BUSAN_CENTER: MapPoint = { lat: 35.1799, lng: 129.0752 };

/** 카카오 level은 작을수록 확대입니다. 8이면 부산 전역이 대략 들어옵니다. */
export const DEFAULT_LEVEL = 8;
/** 한 점만 있을 때(하천 하나 또는 내 위치만) 쓰는 확대 수준. */
export const FOCUS_LEVEL = 5;

/**
 * 쓸 수 있는 좌표인가.
 *
 * ⚠️ (0, 0)은 좌표가 아직 안 들어간 행의 기본값일 가능성이 큽니다. 그대로 통과시키면
 *    지도가 대서양 한가운데까지 축소되어 부산 하천이 점 하나로 뭉갭니다.
 *    DB 좌표는 미검증 근사값이므로(0015) 이 정도 방어는 해 둡니다.
 */
export function isUsablePoint(p: MapPoint | null | undefined): p is MapPoint {
  if (!p) return false;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
  if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return false;
  if (p.lat === 0 && p.lng === 0) return false;
  return true;
}

/** 점들을 모두 담는 최소 사각형. 쓸 수 있는 점이 없으면 null. */
export function boundsOf(points: readonly MapPoint[]): MapBounds | null {
  const usable = points.filter(isUsablePoint);
  if (usable.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of usable) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { sw: { lat: minLat, lng: minLng }, ne: { lat: maxLat, lng: maxLng } };
}

/**
 * 가장자리에 여백을 둡니다.
 *
 * 마커를 말풍선(핀)으로 그리기 때문에 좌표에 딱 맞추면 화면 끝 하천의 이름표가 잘립니다.
 * 여백은 "폭의 ratio 배" 또는 "최소 minDeg" 중 큰 쪽 — 점이 한 곳에 몰려 있어
 * 폭이 0에 가까울 때도 최소 여백이 남습니다.
 */
export function padBounds(b: MapBounds, ratio = 0.18, minDeg = 0.0025): MapBounds {
  const latPad = Math.max((b.ne.lat - b.sw.lat) * ratio, minDeg);
  const lngPad = Math.max((b.ne.lng - b.sw.lng) * ratio, minDeg);
  return {
    sw: { lat: b.sw.lat - latPad, lng: b.sw.lng - lngPad },
    ne: { lat: b.ne.lat + latPad, lng: b.ne.lng + lngPad },
  };
}

export function centerOf(b: MapBounds): MapPoint {
  return {
    lat: (b.sw.lat + b.ne.lat) / 2,
    lng: (b.sw.lng + b.ne.lng) / 2,
  };
}

export type Viewport =
  /** setBounds로 맞출 수 있는 경우 — 서로 다른 점이 2개 이상. */
  | { kind: 'bounds'; bounds: MapBounds }
  /** 점이 없거나 전부 같은 자리인 경우 — setBounds는 확대율이 튀므로 중심+레벨로. */
  | { kind: 'center'; center: MapPoint; level: number };

/**
 * 이 점들을 다 보여주려면 지도를 어디에 두어야 하는가.
 *
 * 점이 하나뿐일 때 setBounds를 쓰면 카카오가 최대 확대까지 들어가 버려
 * "건물 하나만 보이는 지도"가 됩니다. 그래서 중심+레벨로 갈라 둡니다.
 */
export function viewportOf(points: readonly MapPoint[]): Viewport {
  const b = boundsOf(points);
  if (!b) return { kind: 'center', center: BUSAN_CENTER, level: DEFAULT_LEVEL };

  const degenerate = b.ne.lat - b.sw.lat < 1e-6 && b.ne.lng - b.sw.lng < 1e-6;
  if (degenerate) return { kind: 'center', center: centerOf(b), level: FOCUS_LEVEL };

  return { kind: 'bounds', bounds: padBounds(b) };
}
