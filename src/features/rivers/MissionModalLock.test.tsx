/**
 * MissionModal 위치 잠금 테스트.
 *
 * 여기서 보려는 것은 "잠겼을 때 무엇을 감추고 무엇을 남기는가"입니다.
 *   · STEP 1/STEP 2는 **숨기지 않고** 잠근 채로 자리를 남긴다 (동기 유지)
 *   · 하천 이야기는 그대로 읽힌다 (현장까지 못 가는 아이도 배울 수 있어야 함)
 *   · 잠긴 동안에는 아무것도 기록되지 않는다
 *
 * 잠금은 prop(override)으로도, HomeScreen이 깔아 주는 provider로도 들어옵니다.
 * 둘 다 확인합니다.
 */

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRiver } from './fixtures';
import { RiverLocationProvider, type RiverLocationValue } from './LocationContext';
import type { LockState } from './types';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const state = vi.hoisted(() => ({
  missionCalls: [] as string[],
  quizCalls: [] as unknown[],
  claimCalls: [] as string[],
}));

vi.mock('@/lib/session', () => ({
  useSession: () => ({ session: null, userId: 'user-1', isLoading: false, isLoggedIn: true }),
}));

vi.mock('./queries', () => ({
  useCompleteMission: () => ({
    mutateAsync: async (riverId: string) => {
      state.missionCalls.push(riverId);
      return true;
    },
  }),
  useAnswerQuiz: () => ({
    mutateAsync: async (v: unknown) => {
      state.quizCalls.push(v);
      return true;
    },
  }),
  useClaimBadge: () => ({
    mutateAsync: async (riverId: string) => {
      state.claimCalls.push(riverId);
      return { ok: true, is_new: true };
    },
  }),
}));

vi.mock('./celebrate', () => ({ celebrate: () => {}, prefersReducedMotion: () => false }));

// eslint-disable-next-line import/first
import { MissionModal } from './MissionModal';

const LOCKED_NO_POSITION: LockState = { locked: true, remainingM: null, distanceM: null };
const LOCKED_FAR: LockState = { locked: true, remainingM: 1234, distanceM: 2734 };
const UNLOCKED: LockState = { locked: false, remainingM: 0, distanceM: 300 };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  state.missionCalls = [];
  state.quizCalls = [];
  state.claimCalls = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.style.overflow = '';
});

async function render(node: ReactElement) {
  await act(async () => {
    root.render(node);
  });
}

function byText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  );
}

const river = () =>
  makeRiver({
    missionKind: 'acknowledge',
    detailedHistory: '온천천은 예전에 이랬어요.',
    detailedEcology: '지금은 수달이 살아요.',
  });

describe('MissionModal — 잠김(위치 없음)', () => {
  it('STEP을 감추지 않고 잠근 채로 남겨 둔다', async () => {
    await render(<MissionModal river={river()} onClose={() => {}} lock={LOCKED_NO_POSITION} />);

    expect(container.textContent).toContain('STEP 1');
    expect(container.textContent).toContain('STEP 2');
    expect(container.textContent).toContain('🔒');
    expect(container.textContent).toContain('하천 가까이에 가면 열려요');
  });

  it('거리를 모를 때는 숫자를 지어내지 않는다', async () => {
    await render(<MissionModal river={river()} onClose={() => {}} lock={LOCKED_NO_POSITION} />);

    expect(container.textContent).toContain('하천 근처에 가면 열려요');
    expect(container.textContent).not.toContain('더 가야 해요');
  });

  it('미션 버튼과 퀴즈 선택지는 아예 눌 수 없다', async () => {
    await render(<MissionModal river={river()} onClose={() => {}} lock={LOCKED_NO_POSITION} />);

    expect(byText('탐방 인증하기')).toBeUndefined();
    expect(byText('수달')).toBeUndefined();
    expect(state.missionCalls).toEqual([]);
    expect(state.quizCalls).toEqual([]);
  });

  it('하천 이야기는 그대로 읽힌다', async () => {
    await render(<MissionModal river={river()} onClose={() => {}} lock={LOCKED_NO_POSITION} />);

    expect(container.textContent).toContain('역사 이야기');
    expect(container.textContent).toContain('온천천은 예전에 이랬어요.');
    expect(container.textContent).toContain('생태 환경');
    expect(container.textContent).toContain('지금은 수달이 살아요.');
  });

  it('"인증"이라고 말하지 않는다 (클라이언트 판정이므로)', async () => {
    await render(<MissionModal river={river()} onClose={() => {}} lock={LOCKED_NO_POSITION} />);
    expect(container.textContent).not.toContain('위치 인증');
    expect(container.textContent).not.toContain('인증됨');
  });
});

describe('MissionModal — 잠김(거리 있음)', () => {
  it('반경까지 남은 거리를 "약"으로 보여준다', async () => {
    await render(<MissionModal river={river()} onClose={() => {}} lock={LOCKED_FAR} />);

    expect(container.textContent).toContain('약 1.2km 더 가야 해요');
    expect(container.textContent).toContain('온천천');
  });

  it('이미 끝낸 단계는 기록이 남아 있다고 알려준다', async () => {
    const done = makeRiver({
      missionKind: 'acknowledge',
      missionDone: true,
      quizSolvedIds: new Set(['q1']),
    });
    await render(<MissionModal river={done} onClose={() => {}} lock={LOCKED_FAR} />);

    expect(container.textContent).toContain('이미 끝낸 단계예요');
    expect(container.textContent).toContain('STEP 1 체험 미션: 완료');
  });
});

describe('MissionModal — 열림', () => {
  it('반경 안이면 평소대로 미션과 퀴즈를 할 수 있다', async () => {
    await render(<MissionModal river={river()} onClose={() => {}} lock={UNLOCKED} />);

    expect(container.textContent).not.toContain('하천 가까이에 가면 열려요');
    expect(byText('탐방 인증하기')).toBeTruthy();

    await act(async () => byText('탐방 인증하기')!.click());
    await act(async () => {});
    expect(state.missionCalls).toEqual(['river-1']);
  });

  it('잠금 정보를 주지 않으면(단독 렌더) 잠그지 않는다', async () => {
    await render(<MissionModal river={river()} onClose={() => {}} />);
    expect(byText('탐방 인증하기')).toBeTruthy();
  });
});

describe('MissionModal — provider로 들어오는 잠금', () => {
  function value(over: Partial<RiverLocationValue> = {}): RiverLocationValue {
    return {
      status: 'watching',
      position: null,
      message: null,
      accuracyPoor: false,
      requestLocation: () => {},
      ...over,
    };
  }

  it('HomeScreen이 깔아 준 위치로 잠기고, 가까워지면 열린다', async () => {
    // 온천천에서 한참 떨어진 위치 → 잠김
    await render(
      <RiverLocationProvider
        value={value({ position: { lat: 35.10, lng: 128.95, accuracy: 20, at: 0 } })}
      >
        <MissionModal river={river()} onClose={() => {}} />
      </RiverLocationProvider>,
    );
    expect(byText('탐방 인증하기')).toBeUndefined();
    expect(container.textContent).toContain('더 가야 해요');

    // 하천 위 → 열림
    await render(
      <RiverLocationProvider
        value={value({ position: { lat: 35.2049, lng: 129.0784, accuracy: 20, at: 0 } })}
      >
        <MissionModal river={river()} onClose={() => {}} />
      </RiverLocationProvider>,
    );
    expect(byText('탐방 인증하기')).toBeTruthy();
  });

  it('위치를 아직 요청하지 않았으면 모달 안에서도 요청할 수 있다', async () => {
    let asked = 0;
    await render(
      <RiverLocationProvider value={value({ status: 'idle', requestLocation: () => (asked += 1) })}>
        <MissionModal river={river()} onClose={() => {}} />
      </RiverLocationProvider>,
    );

    const cta = byText('가까운 하천 찾기')!;
    expect(cta).toBeTruthy();
    await act(async () => cta.click());
    expect(asked).toBe(1);
  });

  it('거부된 상태면 모달에서도 다시 시도할 수 있다', async () => {
    let asked = 0;
    await render(
      <RiverLocationProvider
        value={value({ status: 'denied', requestLocation: () => (asked += 1) })}
      >
        <MissionModal river={river()} onClose={() => {}} />
      </RiverLocationProvider>,
    );

    await act(async () => byText('위치 다시 시도')!.click());
    expect(asked).toBe(1);
  });

  it('오차가 크면 거리를 단정하지 않는다', async () => {
    await render(
      <RiverLocationProvider
        value={value({
          position: { lat: 35.10, lng: 128.95, accuracy: 900, at: 0 },
          accuracyPoor: true,
        })}
      >
        <MissionModal river={river()} onClose={() => {}} />
      </RiverLocationProvider>,
    );

    expect(container.textContent).toContain('정확하지 않아요');
  });
});
