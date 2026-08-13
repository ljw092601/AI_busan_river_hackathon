import { useEffect, useRef, useState } from 'react';

/**
 * 위치 계층 — 지도 트랙과 잠금해제 트랙이 **공유하는 계약**입니다.
 *
 * ⚠️ 여기 있는 거리 계산은 **화면 표시용**입니다.
 *    "지금 몇 m 남았어요"를 즉시 보여주기 위한 것이고, 클라이언트에서 계산하므로
 *    개발자도구로 얼마든지 조작할 수 있습니다.
 *    실제로 기록이 남는 판정(체크인)은 서버의 verify_checkin/record_checkin이 합니다.
 *    지금 단계에서는 잠금해제도 클라이언트 판정만 씁니다 — 미로그인 방문자도
 *    동작해야 하고, 잠금해제 자체는 아직 아무 기록도 남기지 않기 때문입니다.
 */

const EARTH_RADIUS_M = 6_371_008.8;

/** 두 좌표 사이 거리(m). Haversine. */
export function distanceMeters(
  aLat: number, aLng: number, bLat: number, bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** "1.2km" / "340m" 처럼 사람이 읽을 형태로. */
export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return '—';
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

export type GeoStatus =
  | 'idle'        // 아직 요청하지 않음 — 사용자가 버튼을 눌러야 시작합니다
  | 'prompting'   // 브라우저 권한 창이 떠 있음
  | 'watching'    // 위치를 받는 중
  | 'denied'      // 사용자가 거부
  | 'unavailable' // 기기/브라우저가 지원하지 않거나 신호 없음
  | 'insecure';   // https/localhost가 아니라 API 자체가 막힘

export interface GeoPosition {
  lat: number;
  lng: number;
  /** 기기가 보고한 오차 반경(m). 클수록 실내이거나 신호가 나쁩니다. */
  accuracy: number;
  at: number;
}

export interface GeoState {
  status: GeoStatus;
  position: GeoPosition | null;
  /** 사용자에게 그대로 보여줄 수 있는 한국어 설명. */
  message: string | null;
  /** 위치 추적 시작. 사용자 제스처 안에서 불러야 합니다. */
  start: () => void;
  stop: () => void;
}

const MESSAGES: Record<Exclude<GeoStatus, 'idle' | 'watching' | 'prompting'>, string> = {
  denied:
    '위치 권한이 거부되어 있어요. 브라우저 주소창의 자물쇠 아이콘에서 위치 권한을 허용한 뒤 다시 시도해 주세요.',
  unavailable:
    '위치를 찾지 못했어요. 실내라면 창가나 야외로 나가서 다시 시도해 주세요.',
  insecure:
    '이 주소에서는 위치 기능을 쓸 수 없어요. https 주소 또는 localhost 에서 열어주세요.',
};

/**
 * 위치 추적 훅.
 *
 * ★ 자동으로 시작하지 않습니다. `start()`를 사용자 동작 안에서 불러야 합니다.
 *   페이지 로드와 동시에 권한 창을 띄우면 맥락을 모르는 사용자는 거의 거부하고,
 *   한 번 거부되면 되돌리기가 번거롭습니다(브라우저 설정에서 직접 풀어야 함).
 *   "가까운 하천 찾기" 버튼을 누른 직후에 물어보는 편이 훨씬 잘 허용됩니다.
 */
export function useGeolocation(): GeoState {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const watchId = useRef<number | null>(null);

  const stop = () => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  };

  const start = () => {
    if (watchId.current != null) return;

    // Geolocation API는 보안 컨텍스트(https 또는 localhost)에서만 동작합니다.
    // 이걸 구분해 주지 않으면 사용자는 "권한을 줬는데 왜 안 되지"에서 막힙니다.
    if (!window.isSecureContext) {
      setStatus('insecure');
      return;
    }
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }

    setStatus('prompting');
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          at: p.timestamp,
        });
        setStatus('watching');
      },
      (err) => {
        stop();
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  };

  useEffect(() => stop, []);

  return {
    status,
    position,
    message: status in MESSAGES ? MESSAGES[status as keyof typeof MESSAGES] : null,
    start,
    stop,
  };
}
