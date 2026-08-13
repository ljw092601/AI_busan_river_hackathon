import { distanceMeters } from '@/lib/geo';
import { lockStateOf, type RiverView } from '@/features/rivers/types';
import { isUsablePoint, type MapPoint } from './viewport';

/**
 * RiverView[] → 지도가 실제로 그리는 최소한의 데이터.
 *
 * ★ 잠금 판정을 여기서 새로 짜지 않습니다.
 *   반경 안/밖 판정은 rivers/types.ts의 lockStateOf 하나만 씁니다. 지도와 카드가
 *   각자 계산하면 "카드는 열렸는데 지도 원은 회색"처럼 서로 다른 말을 하게 됩니다.
 *
 * ⚠️ 여기 distanceM은 **대략적인 안내용**입니다. DB 좌표가 미검증 근사값이고,
 *    하천이라는 '선'을 점 하나로 줄여 놓은 값이라 실제 하천변까지의 거리와 다릅니다.
 */

/** radiusM이 비어 있거나 이상할 때 쓰는 값. 하천을 점으로 근사하므로 넉넉하게 잡습니다. */
export const FALLBACK_RADIUS_M = 1000;

export interface RiverMarker {
  id: string;
  name: string;
  icon: string;
  lat: number;
  lng: number;
  radiusM: number;
  /** 반경 안인가(표시용 판정). 위치를 아직 모르면 false. */
  inside: boolean;
  /** 대략적인 거리(m). 위치를 모르면 null. */
  distanceM: number | null;
  selected: boolean;
}

function safeRadius(m: number): number {
  return Number.isFinite(m) && m > 0 ? m : FALLBACK_RADIUS_M;
}

/**
 * 좌표가 쓸모없는 하천은 **아예 빼 버립니다.**
 * (0,0)이나 NaN이 섞이면 지도 전체가 그 점까지 축소되어 나머지 4개가 뭉갭니다.
 * 목록 카드에는 그대로 남으므로 사용자가 잃는 것은 없습니다.
 */
export function riverMarkersOf(
  rivers: readonly RiverView[],
  position: MapPoint | null,
  selectedRiverId?: string | null,
): RiverMarker[] {
  return rivers
    .filter((r) => isUsablePoint({ lat: r.lat, lng: r.lng }))
    .map((r) => {
      const lock = lockStateOf(r, position, distanceMeters);
      return {
        id: r.id,
        name: r.name,
        icon: r.icon || '💧',
        lat: r.lat,
        lng: r.lng,
        radiusM: safeRadius(r.radiusM),
        inside: position != null && !lock.locked,
        distanceM: lock.distanceM,
        selected: selectedRiverId != null && selectedRiverId === r.id,
      };
    });
}

/**
 * 지도를 **다시 맞춰야 하는가**를 판단하는 열쇠 — 좌표만 담습니다.
 *
 * 여기에 inside/selected를 섞으면, 아이가 걸어서 반경에 들어가는 순간 지도가
 * 제멋대로 다시 튀어 사용자가 보던 화면을 빼앗습니다. 시야 재조정은
 * "볼 대상이 바뀌었을 때"만 해야 합니다.
 */
export function geoSignature(markers: readonly RiverMarker[]): string {
  return markers.map((m) => `${m.id}@${m.lat.toFixed(5)},${m.lng.toFixed(5)}`).join('|');
}

/** 오버레이를 **다시 그려야 하는가** — 모양에 영향을 주는 값 전부. */
export function styleSignature(markers: readonly RiverMarker[]): string {
  return markers
    .map((m) => `${m.id}@${m.lat.toFixed(5)},${m.lng.toFixed(5)}:${m.radiusM}:${m.inside ? 1 : 0}:${m.selected ? 1 : 0}`)
    .join('|');
}
