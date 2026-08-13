import { createContext, useContext, type ReactNode } from 'react';
import type { GeoPosition, GeoStatus } from '@/lib/geo';
import { isAccuracyPoor, lockOf } from './location';
import type { LockState, RiverView } from './types';

/**
 * 위치를 화면 전체에 나눠 주는 통로.
 *
 * ★ 왜 context인가
 *   useGeolocation()은 **HomeScreen에서 딱 한 번** 부릅니다. watchPosition을 두 번 걸면
 *   배터리가 두 배로 닳고, 두 구독이 서로 다른 좌표를 들고 있으면 카드와 모달의 거리가
 *   어긋납니다. 그런데 MissionModal은 renderMissionModal prop으로 **주입**되기 때문에
 *   (HomeScreen이 모달을 import 하지 않는 구조) prop으로 위치를 내려보낼 자리가 없습니다.
 *   그래서 HomeScreen이 provider가 되고, 모달은 훅으로 꺼내 씁니다.
 *   → 배선하는 쪽(App.tsx)은 아무것도 더 넘길 필요가 없습니다.
 *
 * ★ provider가 없으면 잠그지 않습니다
 *   모달만 단독으로 띄우는 테스트/스토리에서 위치 때문에 아무것도 못 하게 되는 편보다,
 *   "잠금은 HomeScreen이 붙인다"가 덜 놀랍습니다.
 */

export interface RiverLocationValue {
  status: GeoStatus;
  position: GeoPosition | null;
  /** 실패 상태의 한국어 안내 (lib/geo.ts가 만들어 줍니다). */
  message: string | null;
  /** 기기가 보고한 오차가 커서 거리를 단정하면 안 되는 상태인가. */
  accuracyPoor: boolean;
  /** 사용자 제스처 안에서만 부르세요 — 권한 창이 뜹니다. */
  requestLocation: () => void;
}

const RiverLocationContext = createContext<RiverLocationValue | null>(null);

/** provider 없이 훅을 쓴 경우의 값. 위치를 "아직 요청하지 않은" 상태로 취급합니다. */
const NO_PROVIDER: RiverLocationValue = {
  status: 'idle',
  position: null,
  message: null,
  accuracyPoor: false,
  requestLocation: () => {},
};

/** provider 밖에서는 잠그지 않습니다(위 주석 참고). */
const UNLOCKED: LockState = { locked: false, remainingM: 0, distanceM: null };

export interface RiverLocationProviderProps {
  value: RiverLocationValue;
  children: ReactNode;
}

export function RiverLocationProvider({ value, children }: RiverLocationProviderProps) {
  return <RiverLocationContext.Provider value={value}>{children}</RiverLocationContext.Provider>;
}

export function useRiverLocation(): RiverLocationValue {
  return useContext(RiverLocationContext) ?? NO_PROVIDER;
}

/**
 * 하천 하나의 잠금 상태.
 * @param override 명시적으로 넘긴 값이 있으면 그것을 그대로 씁니다(테스트/미리보기용).
 */
export function useRiverLock(river: RiverView, override?: LockState | null): LockState {
  const ctx = useContext(RiverLocationContext);
  if (override) return override;
  if (!ctx) return UNLOCKED;
  return lockOf(river, ctx.position);
}

/** 훅을 쓸 수 없는 자리(값 계산)에서 쓰는 동일 규칙. */
export function accuracyPoorOf(position: GeoPosition | null): boolean {
  return isAccuracyPoor(position?.accuracy);
}
