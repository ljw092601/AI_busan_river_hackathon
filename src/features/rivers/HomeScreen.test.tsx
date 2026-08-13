/**
 * HomeScreen 통합 테스트.
 *
 * @testing-library가 없는 프로젝트라 react-dom/client + act로 직접 렌더합니다
 * (QuizRunner.test.tsx와 같은 방식).
 *
 * 데이터 계층(queries.ts)과 세션은 목으로 갈아끼웁니다 — 여기서 확인하려는 것은
 * "미로그인에서도 5장이 0 진행률로 뜨는가", "모달 seam이 prop으로 열리는가",
 * "에러/로딩이 빈 화면이 되지 않는가" 세 가지입니다.
 */

import { act } from 'react';
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
  refetchCount: 0,
  badges: [] as { id: string; code: string; name: string; description: string; earnedAt: string | null }[],
  badgesPending: false,
  loggedIn: false,
}));

vi.mock('./queries', () => ({
  useRivers: () => ({
    rivers: state.rivers,
    isLoading: state.isLoading,
    error: state.error,
    refetch: () => {
      state.refetchCount += 1;
    },
  }),
  useBadges: () => ({ data: state.badges, isPending: state.badgesPending, error: null }),
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
import { HomeScreen } from './HomeScreen';

/**
 * 하천마다 구성이 다릅니다 (실제 콘텐츠 기준).
 *   수영강·부전천  퀴즈만  (hasMission=false)
 *   동천          미션만  (퀴즈 0문항)
 *   온천천·대천천  둘 다
 * 기본 픽스처는 "둘 다"이고, 아래 defaultRivers()가 실제 조합을 재현합니다.
 */
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

/** 퀴즈만 있는 하천 (수영강·부전천) */
function quizOnlyRiver(i: number, over: Partial<RiverView> = {}): RiverView {
  return makeRiver(i, { hasMission: false, missionKind: null, ...over });
}

/** 미션만 있는 하천 (동천) */
function missionOnlyRiver(i: number, over: Partial<RiverView> = {}): RiverView {
  return makeRiver(i, { quizzes: [], ...over });
}

/** 실제 5대 하천 구성: 1·2 퀴즈만 / 3 둘 다 / 4 미션만 / 5 둘 다 */
function defaultRivers(): RiverView[] {
  return [
    quizOnlyRiver(1),
    quizOnlyRiver(2),
    makeRiver(3),
    missionOnlyRiver(4),
    makeRiver(5),
  ];
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  state.rivers = defaultRivers();
  state.isLoading = false;
  state.error = null;
  state.refetchCount = 0;
  state.badges = [];
  state.badgesPending = false;
  state.loggedIn = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.style.overflow = '';
});

function render(node: React.ReactElement) {
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

function riverCards(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[data-river-card]'));
}

function cardOf(slug: string): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(`button[data-river-card="${slug}"]`)!;
}

describe('HomeScreen', () => {
  it('미로그인이어도 5개 카드를 0 진행률로 그린다', () => {
    render(<HomeScreen />);

    expect(riverCards()).toHaveLength(5);
    expect(container.textContent).toContain('0%');
    expect(container.textContent).toContain('0/5');
    // 로그인 유도는 안내일 뿐, 화면을 막지 않습니다
    expect(container.textContent).toContain('둘러보기');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('상태 칩은 그 하천에 실제로 있는 단계만 보여준다', () => {
    render(<HomeScreen />);

    // 퀴즈만 있는 하천 — '미션 ❌'가 붙으면 영원히 미완수처럼 보입니다
    const quizOnly = cardOf('river-1').textContent ?? '';
    expect(quizOnly).toContain('퀴즈 0/1');
    expect(quizOnly).not.toContain('미션');
    expect(quizOnly).toContain('생태·역사 퀴즈 도전');

    // 미션만 있는 하천 — '퀴즈 0/0'을 붙이지 않습니다
    const missionOnly = cardOf('river-4').textContent ?? '';
    expect(missionOnly).toContain('미션 ❌');
    expect(missionOnly).not.toContain('퀴즈 0/0');
    expect(missionOnly).toContain('체험 미션 도전');

    // 둘 다 있는 하천
    const both = cardOf('river-3').textContent ?? '';
    expect(both).toContain('미션 ❌ | 퀴즈 0/1');
    expect(both).toContain('미션 & 퀴즈 도전');
  });

  it('없는 단계는 통과로 보고 완수 완료를 표시한다 (isRiverComplete 규칙)', () => {
    state.rivers = [
      // 퀴즈만 있는 하천: 퀴즈 1문항을 풀면 끝
      quizOnlyRiver(1, { quizSolvedIds: new Set(['q1-1']) }),
      quizOnlyRiver(2),
      makeRiver(3),
      // 미션만 있는 하천: 미션만 끝내면 끝
      missionOnlyRiver(4, { missionDone: true }),
      makeRiver(5),
    ];
    render(<HomeScreen />);

    expect(cardOf('river-1').textContent).toContain('완수 완료');
    expect(cardOf('river-4').textContent).toContain('완수 완료');
    expect(cardOf('river-3').textContent).not.toContain('완수 완료');
    expect(container.textContent).toContain('40%');
    expect(container.textContent).toContain('2/5');
    expect(buttonWith('탐험 다시보기')).toBeTruthy();
  });

  it('카드를 누르면 renderMissionModal이 해당 하천으로 호출된다 (직접 import 없음)', () => {
    const opened: string[] = [];
    render(
      <HomeScreen
        renderMissionModal={(river, onClose) => (
          <div data-testid="mission-modal">
            {river.name} 모달
            <button onClick={onClose}>모달닫기</button>
          </div>
        )}
      />,
    );

    expect(container.querySelector('[data-testid="mission-modal"]')).toBeNull();

    click(riverCards()[2]);
    opened.push(container.querySelector('[data-testid="mission-modal"]')!.textContent!);
    expect(opened[0]).toContain('하천3 모달');

    click(buttonWith('모달닫기')!);
    expect(container.querySelector('[data-testid="mission-modal"]')).toBeNull();
  });

  it('renderMissionModal이 없으면 카드를 눌러도 조용히 아무것도 그리지 않는다', () => {
    render(<HomeScreen />);
    click(riverCards()[0]);
    expect(container.textContent).toContain('부산 5대 하천 미션');
  });

  it('대백과 탭에서 역사/생태 패널을 보여준다', () => {
    render(<HomeScreen />);
    click(buttonWith('하천 대백과')!);

    expect(container.textContent).toContain('역사 이야기');
    expect(container.textContent).toContain('생태 환경 & 특징');
    expect(container.textContent).toContain('역사이야기3');
    expect(container.textContent).toContain('생태이야기5');
  });

  it('로딩 중에도 빈 화면이 아니라 골격을 그린다', () => {
    state.isLoading = true;
    state.rivers = [];
    render(<HomeScreen />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('부산 하천 탐험대');
  });

  it('아무것도 못 받았을 때는 에러 화면과 다시 시도 버튼을 보여준다', () => {
    state.error = new Error('network down');
    state.rivers = [];
    render(<HomeScreen />);

    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(container.textContent).toContain('하천 정보를 불러오지 못했어요');
    click(buttonWith('다시 시도')!);
    expect(state.refetchCount).toBe(1);
  });

  it('진행 상황만 실패했을 때는 카드를 버리지 않고 경고 띠만 붙인다', () => {
    // useRivers().error는 콘텐츠/진행 둘 중 하나만 깨져도 채워집니다.
    state.error = new Error('rpc river_progress failed');
    render(<HomeScreen />);

    expect(riverCards()).toHaveLength(5);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('진행 상황');
  });
});

describe('BadgeModal (HomeScreen에서 열기)', () => {
  it('5개 배지를 모두 보여주고 획득한 것만 날짜를 붙인다', () => {
    state.rivers = defaultRivers().map((r, idx) =>
      idx === 1 ? { ...r, badgeEarned: true } : r,
    );
    state.badges = [
      {
        id: 'b2',
        code: 'river_badge_2',
        name: '복개천 비밀 탐정 배지',
        description: '',
        earnedAt: '2026-05-04T09:00:00.000Z',
      },
      { id: 'bx', code: 'dex_set_x', name: '도감 배지', description: '', earnedAt: null },
    ];
    render(<HomeScreen />);
    click(buttonWith('탐험 배지')!);

    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('복개천 비밀 탐정 배지');
    expect(dialog.textContent).toContain('획득');
    // 하천과 무관한 배지는 섞이지 않습니다
    expect(dialog.textContent).not.toContain('도감 배지');
    // 배지 이름이 없는 하천도 줄은 생깁니다 (5줄)
    expect(dialog.querySelectorAll('h5')).toHaveLength(5);
  });

  it('Escape로 닫히고 뒤 페이지 스크롤 잠금이 해제된다', () => {
    render(<HomeScreen />);
    click(buttonWith('탐험 배지')!);

    expect(document.body.style.overflow).toBe('hidden');

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('백드롭을 누르면 닫힌다', () => {
    render(<HomeScreen />);
    click(buttonWith('탐험 배지')!);

    const backdrop = container.querySelector('[role="dialog"]')!.parentElement!;
    act(() => {
      backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
