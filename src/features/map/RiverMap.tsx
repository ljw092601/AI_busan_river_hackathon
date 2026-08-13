import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDistance, type GeoPosition } from '@/lib/geo';
import type { RiverView } from '@/features/rivers/types';
import type { KakaoCircle, KakaoCustomOverlay, KakaoMap, KakaoMaps, KakaoOverlay } from './kakao';
import { KAKAO_FALLBACK_MESSAGE, KakaoMapsError, loadKakaoMaps } from './loadKakaoMaps';
import { geoSignature, riverMarkersOf, styleSignature, type RiverMarker } from './markers';
import { BUSAN_CENTER, DEFAULT_LEVEL, viewportOf, type MapPoint } from './viewport';
import styles from './RiverMap.module.css';

/**
 * 부산 5대 하천 지도.
 *
 * ★ 위치는 받아쓰기만 합니다 — 여기서 useGeolocation()을 부르지 마세요.
 *   watchPosition 구독이 두 개가 되면 배터리를 두 배로 먹고, 두 구독이 서로 다른
 *   좌표를 들고 있는 순간 "카드는 열렸는데 지도의 내 위치는 아직 밖"처럼
 *   화면이 자기모순에 빠집니다. 위치 훅은 HomeScreen이 하나만 들고,
 *   여기는 position prop과 onRequestLocation 콜백만 받습니다.
 *
 * ★ 지도가 깨져도 홈 화면은 살아 있어야 합니다.
 *   SDK 로딩 실패는 이 컴포넌트 안에서 끝나고(에러 카드 + 다시 시도),
 *   바깥으로 예외를 던지지 않습니다. 지도는 '있으면 좋은 것'이고
 *   하천 목록·미션·퀴즈가 본체이기 때문입니다.
 *
 * ⚠️ 높이는 RiverMap.module.css의 .frame이 정합니다. 컨테이너 높이가 0이면
 *    카카오맵은 아무 에러 없이 빈 화면을 그립니다. className으로 높이를 덮어쓰려면
 *    Tailwind가 아니라 감싸는 요소 쪽에서 조절하세요.
 */

export interface RiverMapProps {
  rivers: RiverView[];
  /** useGeolocation()의 position. 첫 방문자는 null입니다. */
  position: GeoPosition | null;
  selectedRiverId?: string | null;
  onSelectRiver?: (riverId: string) => void;
  /** '내 위치' 버튼이 부를 콜백. HomeScreen의 useGeolocation().start를 그대로 넘기세요. */
  onRequestLocation?: () => void;
  className?: string;
}

type Status = 'loading' | 'ready' | 'error';

/** 반경 원 — 밖/안을 확실히 다르게 보여줘야 "가까이 가면 열린다"가 전달됩니다. */
const CIRCLE_OUTSIDE = {
  strokeWeight: 2,
  strokeColor: '#0284c7',
  strokeOpacity: 0.55,
  strokeStyle: 'shortdash' as const,
  fillColor: '#38bdf8',
  fillOpacity: 0.08,
};
const CIRCLE_INSIDE = {
  strokeWeight: 3,
  strokeColor: '#047857',
  strokeOpacity: 0.9,
  strokeStyle: 'solid' as const,
  fillColor: '#34d399',
  fillOpacity: 0.22,
};

export function RiverMap({
  rivers,
  position,
  selectedRiverId,
  onSelectRiver,
  onRequestLocation,
  className,
}: RiverMapProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState<string>(KAKAO_FALLBACK_MESSAGE);
  const [attempt, setAttempt] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapsRef = useRef<KakaoMaps | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const riverLayerRef = useRef<KakaoOverlay[]>([]);
  const meLayerRef = useRef<{ dot: KakaoCustomOverlay; halo: KakaoCircle } | null>(null);
  const disposersRef = useRef<Array<() => void>>([]);
  const markersRef = useRef<RiverMarker[]>([]);
  const selectHandlerRef = useRef<RiverMapProps['onSelectRiver']>(onSelectRiver);
  const fitKeyRef = useRef<string | null>(null);
  const lastSelectedRef = useRef<string | null>(null);

  const markers = riverMarkersOf(rivers, position, selectedRiverId ?? null);
  const geoSig = geoSignature(markers);
  const styleSig = styleSignature(markers);

  // 원시값으로 풀어서 deps에 넣습니다. position 객체는 GPS가 뛸 때마다 새 참조라
  // 그대로 쓰면 effect가 매초 다시 돕니다.
  const posLat = position?.lat ?? null;
  const posLng = position?.lng ?? null;
  const posAccuracy = position?.accuracy ?? null;
  const hasPosition = position != null;

  const detachRivers = useCallback(() => {
    for (const dispose of disposersRef.current.splice(0)) dispose();
    for (const overlay of riverLayerRef.current.splice(0)) overlay.setMap(null);
  }, []);

  const detachMe = useCallback(() => {
    const me = meLayerRef.current;
    if (!me) return;
    me.dot.setMap(null);
    me.halo.setMap(null);
    meLayerRef.current = null;
  }, []);

  // 최신 값 보관용. 이 effect는 아래 그리기 effect보다 **먼저 선언**되어 있어야
  // 같은 커밋에서 항상 먼저 실행됩니다(React는 선언 순서대로 effect를 돌립니다).
  useEffect(() => {
    markersRef.current = markers;
    selectHandlerRef.current = onSelectRiver;
  });

  // ── 1. SDK 로드 ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    loadKakaoMaps().then(
      (maps) => {
        if (cancelled) return;
        mapsRef.current = maps;
        setStatus('ready');
      },
      (err: unknown) => {
        if (cancelled) return;
        mapsRef.current = null;
        setErrorMessage(err instanceof KakaoMapsError ? err.message : KAKAO_FALLBACK_MESSAGE);
        setStatus('error');
      },
    );

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // ── 2. 지도 생성 / 파기 ────────────────────────────────────
  useEffect(() => {
    const maps = mapsRef.current;
    const el = containerRef.current;
    if (status !== 'ready' || !maps || !el) return;

    const map = new maps.Map(el, {
      center: new maps.LatLng(BUSAN_CENTER.lat, BUSAN_CENTER.lng),
      level: DEFAULT_LEVEL,
    });
    mapRef.current = map;
    fitKeyRef.current = null;

    // 탭 전환·화면 회전·폰트 로드로 컨테이너 크기가 바뀌면 타일이 어긋납니다.
    // relayout()을 안 부르면 지도 절반이 회색으로 남습니다.
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => map.relayout());
      observer.observe(el);
    }

    return () => {
      observer?.disconnect();
      detachRivers();
      detachMe();
      mapRef.current = null;
      // 카카오맵에는 destroy()가 없습니다. 같은 div를 다시 쓸 때 지도가 겹쳐 쌓이지 않도록
      // 남은 DOM을 직접 비웁니다.
      el.innerHTML = '';
    };
  }, [status, detachRivers, detachMe]);

  // ── 3. 하천 마커 + 반경 원 ─────────────────────────────────
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (status !== 'ready' || !maps || !map) return;

    detachRivers();

    for (const marker of markersRef.current) {
      const center = new maps.LatLng(marker.lat, marker.lng);

      const circle = new maps.Circle({
        center,
        radius: marker.radiusM,
        zIndex: marker.inside ? 2 : 1,
        ...(marker.inside ? CIRCLE_INSIDE : CIRCLE_OUTSIDE),
      });
      circle.setMap(map);
      riverLayerRef.current.push(circle);

      const interactive = selectHandlerRef.current != null;
      const pin = buildPin(marker, interactive);
      if (interactive) {
        const onClick = () => selectHandlerRef.current?.(marker.id);
        pin.addEventListener('click', onClick);
        disposersRef.current.push(() => pin.removeEventListener('click', onClick));
      }

      const overlay = new maps.CustomOverlay({
        position: center,
        content: pin,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: marker.selected ? 6 : 4,
        clickable: true, // 없으면 클릭이 지도로 통과해 버튼이 안 눌립니다
      });
      overlay.setMap(map);
      riverLayerRef.current.push(overlay);
    }

    return detachRivers;
  }, [status, styleSig, detachRivers]);

  // ── 4. 내 위치 ─────────────────────────────────────────────
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (status !== 'ready' || !maps || !map) return;

    if (posLat == null || posLng == null) {
      detachMe();
      return;
    }

    const at = new maps.LatLng(posLat, posLng);
    // 오차 반경이 아주 작게 보고되면 원이 점이 되어 의미가 없습니다.
    const accuracy = Math.max(posAccuracy ?? 0, 15);

    const existing = meLayerRef.current;
    if (existing) {
      // 새로 만들지 않고 옮깁니다 — 매 초 다시 만들면 점이 깜빡입니다.
      existing.dot.setPosition(at);
      existing.halo.setPosition(at);
      existing.halo.setRadius(accuracy);
      return;
    }

    const dotEl = document.createElement('div');
    dotEl.className = styles.me;
    dotEl.setAttribute('aria-hidden', 'true');

    const halo = new maps.Circle({
      center: at,
      radius: accuracy,
      strokeWeight: 1,
      strokeColor: '#1d4ed8',
      strokeOpacity: 0.4,
      strokeStyle: 'solid',
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      zIndex: 3,
    });
    halo.setMap(map);

    const dot = new maps.CustomOverlay({
      position: at,
      content: dotEl,
      xAnchor: 0.5,
      yAnchor: 0.5,
      zIndex: 9,
    });
    dot.setMap(map);

    meLayerRef.current = { dot, halo };
  }, [status, posLat, posLng, posAccuracy, detachMe]);

  // ── 5. 시야 맞추기 ─────────────────────────────────────────
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (status !== 'ready' || !maps || !map) return;

    // 하천 구성이나 "내 위치 유무"가 바뀔 때만 다시 맞춥니다.
    // GPS가 뛸 때마다 맞추면 사용자가 보던 화면을 계속 빼앗습니다.
    const key = `${geoSig}#${hasPosition ? 'me' : '-'}`;
    if (fitKeyRef.current === key) return;
    fitKeyRef.current = key;

    const points: MapPoint[] = markersRef.current.map((m) => ({ lat: m.lat, lng: m.lng }));
    if (posLat != null && posLng != null) points.push({ lat: posLat, lng: posLng });

    const viewport = viewportOf(points);
    if (viewport.kind === 'bounds') {
      const { sw, ne } = viewport.bounds;
      map.setBounds(
        new maps.LatLngBounds(new maps.LatLng(sw.lat, sw.lng), new maps.LatLng(ne.lat, ne.lng)),
      );
    } else {
      map.setCenter(new maps.LatLng(viewport.center.lat, viewport.center.lng));
      map.setLevel(viewport.level);
    }
  }, [status, geoSig, hasPosition, posLat, posLng]);

  // ── 6. 선택된 하천으로 이동 ────────────────────────────────
  useEffect(() => {
    const id = selectedRiverId ?? null;
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (status !== 'ready' || !maps || !map) {
      lastSelectedRef.current = id;
      return;
    }
    if (id === lastSelectedRef.current) return;
    lastSelectedRef.current = id;
    if (!id) return;

    const target = markersRef.current.find((m) => m.id === id);
    if (target) map.panTo(new maps.LatLng(target.lat, target.lng));
  }, [status, selectedRiverId, geoSig]);

  const handleLocate = useCallback(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (position && maps && map) {
      map.panTo(new maps.LatLng(position.lat, position.lng));
      return;
    }
    onRequestLocation?.();
  }, [position, onRequestLocation]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const showLocate = hasPosition || onRequestLocation != null;

  return (
    <div className={className ? `${styles.frame} ${className}` : styles.frame}>
      {/* 컨테이너는 상태와 무관하게 항상 DOM에 둡니다.
          로딩이 끝난 뒤에 붙이면 카카오맵이 크기 0인 div를 읽어 빈 지도가 됩니다. */}
      <div
        ref={containerRef}
        className={styles.canvas}
        role="region"
        aria-label="부산 5대 하천 지도"
      />

      {status === 'loading' && <MapLoading />}
      {status === 'error' && <MapError message={errorMessage} onRetry={retry} />}

      {status === 'ready' && (
        <>
          <p className="absolute left-3 bottom-3 z-10 max-w-[62%] rounded-xl bg-white/90 px-2.5 py-1.5 text-[10px] font-semibold leading-snug text-slate-600 shadow-sm break-keep">
            원 안으로 들어가면 미션이 열려요. 위치와 거리는 대략적인 안내예요.
          </p>

          {showLocate && (
            <button
              type="button"
              onClick={handleLocate}
              className="absolute right-3 bottom-3 z-10 flex min-h-[44px] items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-slate-700 shadow-md ring-1 ring-slate-200 transition-all hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <span aria-hidden="true">📍</span>
              {hasPosition ? '내 위치' : '내 위치 켜기'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * 상태 화면 — 어느 것도 빈 사각형으로 두지 않습니다.
 * ──────────────────────────────────────────────────────────── */

function MapLoading() {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-slate-100">
      <div className="h-10 w-10 animate-pulse rounded-2xl bg-slate-300" aria-hidden="true" />
      <p className="text-xs font-semibold text-slate-500">지도를 불러오는 중이에요…</p>
    </div>
  );
}

function MapError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-slate-50 px-4 py-5 text-center"
    >
      <p className="text-2xl" aria-hidden="true">
        🗺️
      </p>
      <h3 className="text-sm font-bold text-slate-800">지도를 표시하지 못했어요</h3>
      <p className="max-w-md whitespace-pre-line break-keep text-[11px] leading-relaxed text-slate-600">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-[44px] rounded-xl bg-slate-800 px-5 text-xs font-bold text-white transition-all hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        다시 시도
      </button>
      <p className="text-[10px] text-slate-400 break-keep">
        지도가 없어도 아래 하천 목록과 미션은 그대로 쓸 수 있어요.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * 커스텀 오버레이 DOM
 * 카카오 기본 마커는 이미지만 받아서 하천 이모지를 못 씁니다.
 * ──────────────────────────────────────────────────────────── */

/** 핀에 붙는 보조 문구. 거리는 근사값이라 '약'을 붙여 단정하지 않습니다. */
function pinNote(marker: RiverMarker): string | null {
  if (marker.inside) return '탐험 구역 안';
  if (marker.distanceM == null) return null;
  return `약 ${formatDistance(marker.distanceM)}`;
}

function buildPin(marker: RiverMarker, interactive: boolean): HTMLElement {
  // 선택 콜백이 없으면 버튼처럼 보이면 안 됩니다 — 눌러도 아무 일이 없으니까요.
  const root = document.createElement(interactive ? 'button' : 'span');
  if (root instanceof HTMLButtonElement) root.type = 'button';

  const note = pinNote(marker);
  root.className = [
    styles.pin,
    marker.inside ? styles.pinInside : '',
    marker.selected ? styles.pinSelected : '',
  ]
    .filter(Boolean)
    .join(' ');
  root.setAttribute(
    'aria-label',
    interactive
      ? `${marker.name} 미션 열기${note ? `, ${note}` : ''}`
      : `${marker.name}${note ? `, ${note}` : ''}`,
  );
  if (marker.selected) root.setAttribute('aria-current', 'true');

  const icon = document.createElement('span');
  icon.className = styles.pinIcon;
  icon.setAttribute('aria-hidden', 'true');
  // ⚠️ textContent 고정. 하천 이름은 DB에서 오므로 innerHTML을 쓰면 안 됩니다.
  icon.textContent = marker.icon;

  const text = document.createElement('span');
  text.className = styles.pinText;

  const name = document.createElement('span');
  name.className = styles.pinName;
  name.textContent = marker.name;
  text.appendChild(name);

  if (note) {
    const noteEl = document.createElement('span');
    noteEl.className = styles.pinNote;
    noteEl.textContent = note;
    text.appendChild(noteEl);
  }

  root.append(icon, text);
  return root;
}
