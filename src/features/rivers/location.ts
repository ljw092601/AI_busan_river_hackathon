import { distanceMeters, formatDistance, type GeoPosition } from '@/lib/geo';
import { lockStateOf, type LockState, type RiverView } from './types';

/**
 * 위치 잠금해제의 **표시용 규칙**들.
 *
 * ⚠️ 판정 자체는 types.ts의 lockStateOf, 거리 계산은 lib/geo.ts의 distanceMeters만 씁니다.
 *    여기 있는 것은 "그 결과를 아이에게 어떤 말로 보여줄까"에 대한 규칙뿐입니다.
 *
 * ⚠️ 이 잠금은 전부 클라이언트 판정입니다 — 개발자도구로 우회할 수 있습니다.
 *    그래서 화면 어디에도 "인증", "확인됨" 같은 말을 쓰지 않습니다.
 *    우리가 아는 것은 "기기가 스스로 보고한 위치가 가깝다"는 것뿐입니다.
 */

/**
 * 기기가 보고한 오차 반경이 이보다 크면 거리를 단정해서 말하지 않습니다.
 * 하천 반경이 1000~1500m라 오차 300m면 "반경 안/밖"이 뒤집힐 수 있는 크기입니다.
 * (실내 wifi 측위는 수백 m, 기지국 측위는 1km를 넘기도 합니다.)
 */
export const POOR_ACCURACY_M = 300;

export function isAccuracyPoor(accuracy: number | null | undefined): boolean {
  return accuracy != null && Number.isFinite(accuracy) && accuracy > POOR_ACCURACY_M;
}

/**
 * "약 1.2km".
 * DB 좌표가 미검증 근사값이고(0015) 하천은 점이 아니라 선이라, 거리는 항상 '약'으로 말합니다.
 */
export function approxDistance(m: number | null | undefined): string {
  return m == null ? '거리를 아직 몰라요' : `약 ${formatDistance(m)}`;
}

/**
 * 좌표가 실제로 설정된 하천인가.
 *
 * ⚠️ queries.ts는 spot이 없는 하천을 `lat: 0, lng: 0`으로 떨어뜨립니다.
 *    (0, 0)은 기니만 앞바다(널 아일랜드)라 부산에서 재면 1만 km 가까이 나오고,
 *    "약 9,700km 더 가야 해요"라는 말도 안 되는 안내가 나옵니다.
 *    거리를 아예 모른다고 말하는 편이 정직합니다.
 */
export function hasCoordinates(r: { lat: number; lng: number }): boolean {
  return Number.isFinite(r.lat) && Number.isFinite(r.lng) && !(r.lat === 0 && r.lng === 0);
}

/** 한 하천의 잠금 상태. 거리 계산은 lib/geo.ts 것만 씁니다. */
export function lockOf(river: RiverView, position: GeoPosition | null): LockState {
  // 좌표를 모르는 하천에 가짜 거리를 붙이지 않습니다(위 주석 참고).
  if (!hasCoordinates(river)) return { locked: true, remainingM: null, distanceM: null };
  return lockStateOf(river, position, distanceMeters);
}

export interface RiverWithLock {
  river: RiverView;
  lock: LockState;
  /** 위치를 받았을 때 **가장 가까운 하천 하나**에만 true. */
  nearest: boolean;
}

/**
 * 하천 목록에 잠금 상태를 붙입니다.
 *
 * 위치를 받은 뒤에만 가까운 순으로 재정렬합니다 — 위치가 없을 때는 전부 잠겨 있고
 * 거리도 모르므로, 순서를 흔들어 봐야 "왜 순서가 바뀌었지"만 남습니다.
 */
export function withLocks(rivers: RiverView[], position: GeoPosition | null): RiverWithLock[] {
  const list: RiverWithLock[] = rivers.map((river) => ({
    river,
    lock: lockOf(river, position),
    nearest: false,
  }));
  if (!position || list.length === 0) return list;

  list.sort((a, b) => (a.lock.distanceM ?? Infinity) - (b.lock.distanceM ?? Infinity));
  list[0].nearest = true;
  return list;
}

/** 반경 안에 들어와 열린 하천 수. */
export function unlockedCount(list: RiverWithLock[]): number {
  return list.filter((x) => !x.lock.locked).length;
}

/**
 * 카드/모달에 공통으로 쓰는 한 줄 안내.
 * @param hasCoords 하천 좌표가 설정돼 있는가. false면 거리를 말하지 않습니다.
 */
export function lockNote(
  lock: LockState,
  accuracy: number | null | undefined,
  hasCoords = true,
): string {
  if (!hasCoords) return '이 하천은 위치 정보가 아직 없어요';
  if (!lock.locked) return '지금 도전할 수 있어요';
  if (lock.remainingM == null) return '하천 근처에 가면 열려요';
  const base = `${approxDistance(lock.remainingM)} 더 가야 해요`;
  return isAccuracyPoor(accuracy) ? `${base} (위치가 흔들려서 정확하지 않아요)` : base;
}
