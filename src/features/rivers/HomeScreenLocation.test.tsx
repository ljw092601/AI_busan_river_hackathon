/**
 * HomeScreen 위치 잠금해제 통합 테스트.
 *
 * @testing-library가 없는 프로젝트라 react-dom/client + act로 직접 렌더합니다
 * (HomeScreen.test.tsx와 같은 방식).
 *
 * jsdom에는 navigator.geolocation이 아예 없으므로 직접 심고, 성공/실패 콜백을
 * 손으로 흘려보냅니다 — 여기서 확인하려는 것은 "권한 흐름의 여섯 가지 상태에서
 * 화면이 각각 무엇을 말하는가"입니다.
 */

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RiverView } from './types';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const state = vi.hoisted(() => ({
  rivers: [] as RiverView[],
  isLoading: false,
  error: null as unknown,
  badges: [] as { id: string; code: string; name: string; description: string; earnedAt: string | null }[],
  loggedIn: false,
}));

vi.mock('./queries', () => ({
  useRivers: () => ({
    rivers: state.rivers,
    isLoading: state.isLoading,
    error: state.error,
    refetch: () => {},
  }),
  useBadges: () => ({ data: state.badges, isPending: false, error: null }),
}));

vi.mock('@/lib/session', () => ({
  useSession: () => ({
    session: null,
    userId: null,
    isLoading: false,
    isLoggedIn: state.loggedIn,
  }),
}));

// eslint-disable-next-line import/first
import { HomeScreen, type HomeScreenProps } from './HomeScreen';

type MapArgs = Parameters<NonNullable<HomeScreenProps['renderMap']>>[0];

/* ── 위치 하네스 ─────────────────────────────────────────────── */

interface GeoHarness {
  watchCalls: number;
  clearCalls: number;
  success: ((p: unknown) => void) | null;
  failure: ((e: unknown) => void) | null;
}

const geo: GeoHarness = { watchCalls: 0, clearCalls: 0, success: null, failure: null };

function installGeolocation() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    writable: true,
    value: {
      watchPosition: (ok: (p: unknown) => void, err: (e: unknown) => void) => {
        geo.watchCalls += 1;
        geo.success = ok;
        geo.failure = err;
        return 7;
      },
      clearWatch: () => {
        geo.clearCalls += 1;
      },
    },
  });
}

function removeGeolocation() {
  // 'geolocation' in navigator 자체가 false여야 미지원 분기를 탑니다.
  delete (navigator as unknown as Record<string, unknown>).geolocation;
}

function setSecure(secure: boolean) {
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    writable: true,
    value: secure,
  });
}

function emitPosition(lat: number, lng: number, accuracy = 20) {
  act(() => {
    geo.success?.({
      coords: { latitude: lat, longitude: lng, accuracy },
      timestamp: 1_700_000_000_000,
    });
  });
}

/** GeolocationPositionError 흉내 — geo.ts가 err.PERMISSION_DENIED와 비교합니다. */
function emitError(code: number) {
  act(() => {
    geo.failure?.({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: '' });
  });
}

/* ── 픽스처 (HomeScreen.test.tsx와 같은 좌표 규칙) ─────────────── */

function makeRiver(i: number, over: Partial<RiverView> = {}): RiverView {
  return {
    id: `river-${i}`,
    slug: `river-${i}`,
    name: `하천${i}`,
    subtitle: `부제${i}`,
    summary: `요약${i}`,
    icon: '💧',
    theme: 'blue',
    badgeCode: `river_badge_${i}`,
    detailedHistory: `역사이야기${i}`,
    detailedEcology: `생태이야기${i}`,
    lat: 35.15 + i * 0.02,
    lng: 129.05 + i * 0.02,
    radiusM: 1000,
    missionKind: 'acknowledge',
    missionTitle: `미션${i}`,
    missionBody: '본문',
    missionConfig: {},
    quizzes: [
      { id: `q${i}-1`, seq: 1, question: 'Q1', options: ['a', 'b'], answerIdx: 0, explanation: 'e' },
    ],
    hasMission: true,
    missionDone: false,
    quizSolvedIds: new Set<string>(),
    badgeEarned: false,
    ...over,
  };
}

/** 하천 i의 대표 좌표 위에 서 있는 위치. */
function atRiver(i: number): [number, number] {
  return [35.15 + i * 0.02, 129.05 + i * 0.02];
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  state.rivers = [1, 2, 3, 4, 5].map((i) => makeRiver(i));
  state.isLoading = false;
  state.error = null;
  state.loggedIn = false;
  geo.watchCalls = 0;
  geo.clearCalls = 0;
  geo.success = null;
  geo.failure = null;
  installGeolocation();
  setSecure(true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.style.overflow = '';
});

function render(node: ReactElement) {
  act(() => {
    root.render(node);
  });
}

function click(el: Element) {
  act(() => {
    (el as HTMLElement).click();
  });
}

function buttonWith(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  );
}

function cards(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[data-river-card]'));
}

function cardOf(slug: string): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(`button[data-river-card="${slug}"]`)!;
}

/* ── idle ────────────────────────────────────────────────────── */

describe('위치 요청 — idle', () => {
  it('페이지를 열자마자 권한 창을 띄우지 않는다', () => {
    render(<HomeScreen />);
    expect(geo.watchCalls).toBe(0);
  });

  it('권한 창보다 먼저 "왜 위치가 필요한지"를 설명한다', () => {
    render(<HomeScreen />);
    expect(container.textContent).toContain('가까운 하천 찾기');
    expect(container.textContent).toContain('가까이에 있을 때');
    expect(container.textContent).toContain('저장하지 않아요');
  });

  it('위치가 없으면 모든 하천이 잠기고 거리를 지어내지 않는다', () => {
    render(<HomeScreen />);
    expect(cards()).toHaveLength(5);
    expect(cards().every((c) => c.dataset.locked === 'true')).toBe(true);
    expect(cardOf('river-1').textContent).toContain('하천 근처에 가면 열려요');
    expect(container.textContent).not.toContain('더 가야 해요');
  });

  it('위치가 없을 때는 카드 순서를 흔들지 않는다', () => {
    render(<HomeScreen />);
    expect(cards().map((c) => c.dataset.riverCard)).toEqual([
      'river-1',
      'river-2',
      'river-3',
      'river-4',
      'river-5',
    ]);
    expect(container.textContent).not.toContain('가장 가까워요');
  });

  it('잠겨 있어도 하천 요약과 대백과는 그대로 읽힌다', () => {
    render(<HomeScreen />);
    expect(container.textContent).toContain('요약3');

    click(buttonWith('하천 대백과')!);
    expect(container.textContent).toContain('역사이야기3');
    expect(container.textContent).toContain('생태이야기5');
  });

  it('CTA를 눌러야(사용자 제스처) 위치를 요청한다', () => {
    render(<HomeScreen />);
    click(buttonWith('가까운 하천 찾기')!);
    expect(geo.watchCalls).toBe(1);
  });
});

/* ── prompting ───────────────────────────────────────────────── */

describe('위치 요청 — prompting', () => {
  it('권한 창이 떠 있는 동안 무엇을 눌러야 하는지 알려준다', () => {
    render(<HomeScreen />);
    click(buttonWith('가까운 하천 찾기')!);

    expect(container.textContent).toContain('허용');
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    // 아직 좌표가 없으므로 여전히 전부 잠겨 있습니다.
    expect(cards().every((c) => c.dataset.locked === 'true')).toBe(true);
  });
});

/* ── watching ────────────────────────────────────────────────── */

describe('위치 요청 — watching', () => {
  function start() {
    render(<HomeScreen />);
    click(buttonWith('가까운 하천 찾기')!);
  }

  it('반경 안 하천만 열리고 나머지는 남은 거리를 보여준다', () => {
    start();
    emitPosition(...atRiver(3));

    expect(cardOf('river-3').dataset.locked).toBe('false');
    expect(cardOf('river-3').textContent).toContain('지금 도전할 수 있어요');

    expect(cardOf('river-1').dataset.locked).toBe('true');
    expect(cardOf('river-1').textContent).toContain('더 가야 해요');
    expect(cardOf('river-1').textContent).toContain('약 ');
  });

  it('열린 하천 수와 가장 가까운 하천을 배너에 요약한다', () => {
    start();
    emitPosition(...atRiver(3));

    expect(container.textContent).toContain('도전할 수 있는 하천이 1곳');
    expect(container.textContent).toContain('가장 가까운 하천은');
    expect(container.textContent).toContain('하천3');
  });

  it('반경 밖이라도 화면을 막지 않고 얼마나 남았는지 말한다', () => {
    start();
    emitPosition(35.05, 128.95); // 5개 모두 반경 밖

    expect(cards()).toHaveLength(5);
    expect(cards().every((c) => c.dataset.locked === 'true')).toBe(true);
    expect(container.textContent).toContain('아직 하천 반경 안이 아니에요');
    expect(container.textContent).toContain('더 가면 열려요');
  });

  it('위치를 받은 뒤에는 가까운 순으로 정렬하고 가장 가까운 하천에 표를 붙인다', () => {
    start();
    emitPosition(...atRiver(5));

    expect(cards()[0].dataset.riverCard).toBe('river-5');
    expect(cards().map((c) => c.dataset.riverCard)).toEqual([
      'river-5',
      'river-4',
      'river-3',
      'river-2',
      'river-1',
    ]);
    expect(cardOf('river-5').textContent).toContain('가장 가까워요');
    expect(cardOf('river-4').textContent).not.toContain('가장 가까워요');
  });

  it('위치가 움직이면 잠금도 따라 바뀐다', () => {
    start();
    emitPosition(...atRiver(1));
    expect(cardOf('river-1').dataset.locked).toBe('false');
    expect(cardOf('river-5').dataset.locked).toBe('true');

    emitPosition(...atRiver(5));
    expect(cardOf('river-1').dataset.locked).toBe('true');
    expect(cardOf('river-5').dataset.locked).toBe('false');
  });

  it('오차가 크면 거리를 단정하지 않고 그 사실을 먼저 말한다', () => {
    start();
    emitPosition(35.05, 128.95, 900);

    expect(container.textContent).toContain('±900m');
    expect(container.textContent).toContain('실제와 많이 다를 수 있어요');
    expect(cardOf('river-1').textContent).toContain('정확하지 않아요');
  });

  it('"인증"이라고 말하지 않는다 (클라이언트 판정이므로)', () => {
    start();
    emitPosition(...atRiver(3));

    expect(container.textContent).not.toContain('인증');
    expect(container.textContent).not.toContain('확인 완료');
  });
});

/* ── 실패 상태 ───────────────────────────────────────────────── */

describe('위치 요청 — 실패해도 앱은 그대로 쓸 수 있다', () => {
  it('denied: 이유를 그대로 보여주고 다시 시도할 수 있다', () => {
    render(<HomeScreen />);
    click(buttonWith('가까운 하천 찾기')!);
    emitError(1);

    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('위치 권한이 거부되어 있어요');
    expect(alert.textContent).toContain('자물쇠');
    // 화면은 살아 있습니다
    expect(cards()).toHaveLength(5);
    expect(container.textContent).toContain('하천 대백과');

    click(buttonWith('위치 다시 시도')!);
    expect(geo.watchCalls).toBe(2);
  });

  it('unavailable: 신호가 없을 때도 안내와 재시도를 남긴다', () => {
    render(<HomeScreen />);
    click(buttonWith('가까운 하천 찾기')!);
    emitError(2);

    expect(container.querySelector('[role="alert"]')!.textContent).toContain(
      '위치를 찾지 못했어요',
    );
    expect(buttonWith('위치 다시 시도')).toBeTruthy();
    expect(cards()).toHaveLength(5);
  });

  it('unavailable: 기기가 Geolocation 자체를 지원하지 않아도 죽지 않는다', () => {
    removeGeolocation();
    render(<HomeScreen />);
    click(buttonWith('가까운 하천 찾기')!);

    expect(container.querySelector('[role="alert"]')!.textContent).toContain(
      '위치를 찾지 못했어요',
    );
    expect(cards()).toHaveLength(5);
    installGeolocation(); // 언마운트 정리용
  });

  it('insecure: https가 아니면 원인을 정확히 짚고 헛된 재시도를 권하지 않는다', () => {
    setSecure(false);
    render(<HomeScreen />);
    click(buttonWith('가까운 하천 찾기')!);

    expect(geo.watchCalls).toBe(0);
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('https');
    expect(buttonWith('위치 다시 시도')).toBeUndefined();
    expect(cards()).toHaveLength(5);
  });

  it('실패해도 잠긴 이유를 정직하게 적는다', () => {
    render(<HomeScreen />);
    click(buttonWith('가까운 하천 찾기')!);
    emitError(1);

    expect(container.textContent).toContain('하천 대백과');
    expect(container.textContent).toContain('미션과 퀴즈만 하천 근처에서 열려요');
    expect(cardOf('river-2').textContent).toContain('하천 근처에 가면 열려요');
  });
});

/* ── 지도 seam ───────────────────────────────────────────────── */

describe('지도 seam (renderMap)', () => {
  it('prop이 없으면 아무것도 그리지 않는다', () => {
    render(<HomeScreen />);
    expect(container.querySelector('[data-testid="map"]')).toBeNull();
  });

  it('prop이 있으면 하천 그리드 위에 그린다', () => {
    render(<HomeScreen renderMap={() => <div data-testid="map">지도</div>} />);

    const map = container.querySelector('[data-testid="map"]')!;
    const firstCard = cards()[0];
    expect(map).toBeTruthy();
    // 그리드보다 앞(위)에 있어야 합니다
    expect(map.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('하천 목록·위치·선택 상태를 넘기고, 위치 요청도 지도에서 걸 수 있다', () => {
    // 객체에 담아 두는 이유: let 변수는 콜백 안 대입을 TS가 좁힘에 반영하지 못합니다.
    const seen: { args: MapArgs | null } = { args: null };

    render(
      <HomeScreen
        renderMap={(args) => {
          seen.args = args;
          return <div data-testid="map">지도</div>;
        }}
        renderMissionModal={(river) => <div data-testid="mission-modal">{river.name} 모달</div>}
      />,
    );

    expect(seen.args?.rivers).toHaveLength(5);
    expect(seen.args?.position).toBeNull();
    expect(seen.args?.selectedRiverId).toBeNull();

    // 지도에서 위치 요청
    act(() => seen.args?.onRequestLocation());
    expect(geo.watchCalls).toBe(1);
    emitPosition(...atRiver(3));
    expect(seen.args?.position?.lat).toBeCloseTo(35.21, 5);

    // 지도에서 하천 선택 → 모달이 열리고 selectedRiverId가 따라옵니다
    act(() => seen.args?.onSelectRiver('river-2'));
    expect(container.querySelector('[data-testid="mission-modal"]')!.textContent).toContain(
      '하천2 모달',
    );
    expect(seen.args?.selectedRiverId).toBe('river-2');
  });
});
