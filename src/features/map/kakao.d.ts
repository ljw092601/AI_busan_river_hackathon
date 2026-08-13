/**
 * 카카오맵 JS SDK의 **필요한 부분만** 직접 선언합니다.
 *
 * ★ 왜 @types 패키지를 안 쓰는가
 *   공식 타입 패키지가 없고, 커뮤니티 패키지(@types/kakaomaps 등)는 버전이 뒤처져
 *   실제 SDK와 어긋나면 "타입은 맞는데 런타임에 undefined"가 됩니다.
 *   우리가 실제로 호출하는 API는 아래가 전부라, 좁게 직접 선언하는 편이 안전합니다.
 *   새 API를 쓸 때마다 여기에 한 줄씩 추가하세요.
 *
 * ⚠️ `window.kakao.maps`는 스크립트 onload 시점에 **아직 완성되지 않았습니다**.
 *    `autoload=false`로 받아서 `kakao.maps.load(cb)`의 콜백 안에서만 나머지 생성자가 존재합니다.
 *    그래서 Window에 붙는 타입은 전부 optional 입니다 — loadKakaoMaps()를 거쳐서 쓰세요.
 */

export interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

export interface KakaoLatLngBounds {
  extend(latlng: KakaoLatLng): void;
  isEmpty(): boolean;
  getSouthWest(): KakaoLatLng;
  getNorthEast(): KakaoLatLng;
}

export interface KakaoMapOptions {
  center: KakaoLatLng;
  /** 카카오의 level은 **작을수록 확대**입니다(1이 최대 확대). */
  level?: number;
  draggable?: boolean;
}

export interface KakaoMap {
  setCenter(latlng: KakaoLatLng): void;
  getCenter(): KakaoLatLng;
  setLevel(level: number, options?: { anchor?: KakaoLatLng; animate?: boolean }): void;
  getLevel(): number;
  panTo(target: KakaoLatLng | KakaoLatLngBounds): void;
  /** paddingTop, paddingRight, paddingBottom, paddingLeft (px) */
  setBounds(bounds: KakaoLatLngBounds, ...padding: number[]): void;
  /** 컨테이너 크기가 바뀐 뒤 반드시 호출. 안 하면 지도 절반이 회색으로 남습니다. */
  relayout(): void;
}

/** setMap(null)로 지도에서 떼어낼 수 있는 것들의 공통 모양. */
export interface KakaoOverlay {
  setMap(map: KakaoMap | null): void;
}

export interface KakaoCustomOverlayOptions {
  position: KakaoLatLng;
  content: HTMLElement | string;
  xAnchor?: number;
  yAnchor?: number;
  zIndex?: number;
  /** true여야 content 안의 button이 클릭을 받습니다(기본값은 지도로 통과). */
  clickable?: boolean;
  map?: KakaoMap | null;
}

export interface KakaoCustomOverlay extends KakaoOverlay {
  setPosition(latlng: KakaoLatLng): void;
  getPosition(): KakaoLatLng;
  setZIndex(zIndex: number): void;
}

export interface KakaoCircleOptions {
  center: KakaoLatLng;
  /** m 단위 */
  radius: number;
  strokeWeight?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeStyle?: 'solid' | 'shortdash' | 'dash' | 'dot' | 'longdash';
  fillColor?: string;
  fillOpacity?: number;
  zIndex?: number;
}

export interface KakaoCircle extends KakaoOverlay {
  setPosition(latlng: KakaoLatLng): void;
  setRadius(radius: number): void;
  setOptions(options: Partial<KakaoCircleOptions>): void;
}

export interface KakaoEventNamespace {
  addListener(target: unknown, type: string, handler: (...args: unknown[]) => void): void;
  removeListener(target: unknown, type: string, handler: (...args: unknown[]) => void): void;
}

/** `kakao.maps.load()` 콜백 이후에야 전부 채워지는 네임스페이스. */
export interface KakaoMaps {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new (sw?: KakaoLatLng, ne?: KakaoLatLng) => KakaoLatLngBounds;
  Map: new (container: HTMLElement, options: KakaoMapOptions) => KakaoMap;
  CustomOverlay: new (options: KakaoCustomOverlayOptions) => KakaoCustomOverlay;
  Circle: new (options: KakaoCircleOptions) => KakaoCircle;
  event: KakaoEventNamespace;
  /** autoload=false 로 받은 SDK를 실제로 초기화합니다. */
  load(callback: () => void): void;
}

declare global {
  interface Window {
    /** 스크립트 주입 전에는 없고, load() 콜백 전에는 maps에 load만 있습니다. */
    kakao?: { maps?: Partial<KakaoMaps> & Pick<KakaoMaps, 'load'> };
  }
}
