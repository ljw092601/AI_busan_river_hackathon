/**
 * MissionModal 통합 테스트.
 *
 * @testing-library가 프로젝트에 없어 react-dom으로 직접 렌더합니다
 * (src/features/quiz/QuizRunner.test.tsx와 같은 방식).
 *
 * queries/session은 모킹합니다 — 이 테스트가 보려는 것은 "무엇을 언제 기록하는가"이지
 * Supabase 왕복이 아니고, supabase 모듈은 import 시점에 env를 요구하기 때문입니다.
 */

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MissionModal } from './MissionModal';
import { makeRiver } from './fixtures';
import type { ObserveField } from './types';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const state = vi.hoisted(() => ({
  loggedIn: true,
  // ★ 사진 미션은 photoId 를 함께 실어 보냅니다. 문자열만 받던 옛 계약이 아닙니다.
  missionCalls: [] as (string | { riverId: string; photoId?: string | null })[],
  quizCalls: [] as { quizId: string; selectedIdx: number; isCorrect: boolean }[],
  claimCalls: [] as string[],
  claimResult: { ok: true, is_new: true } as { ok: boolean; reason?: string; is_new?: boolean },
  missionThrows: false,
  celebrations: 0,
  photoCalls: [] as { missionTag?: string | null }[],
}));

/**
 * jsdom에는 카메라도, Storage도 없습니다.
 * 온천천(tap_target)·대천천(observe_log)은 이제 실제로 촬영을 시도하므로
 * (@/lib/photos → @/lib/image → <input type=file>, @/lib/supabase)
 * 여기서 막지 않으면 파일 선택창이 영영 응답하지 않아 미션이 끝나지 않습니다.
 * 촬영 자체의 성공·취소·실패 경로는 missions/MissionPhoto.test.tsx가 봅니다.
 */
vi.mock('@/lib/photos', () => ({
  captureAndUpload: async (opts: { missionTag?: string | null }) => {
    state.photoCalls.push({ missionTag: opts.missionTag });
    return {
      photoId: 'photo-1',
      storagePath: 'user-1/photo-1.jpg',
      previewUrl: 'blob:preview',
      width: 800,
      height: 600,
      byteSize: 1234,
    };
  },
  describePhotoError: () => '사진 처리 중 문제가 생겼어요.',
}));

vi.mock('@/lib/session', () => ({
  useSession: () => ({
    session: null,
    userId: state.loggedIn ? 'user-1' : null,
    isLoading: false,
    isLoggedIn: state.loggedIn,
  }),
}));

vi.mock('./queries', () => ({
  useCompleteMission: () => ({
    mutateAsync: async (input: string | { riverId: string; photoId?: string | null }) => {
      if (state.missionThrows) throw new Error('offline');
      state.missionCalls.push(input);
      return state.loggedIn;
    },
  }),
  useAnswerQuiz: () => ({
    mutateAsync: async (v: { quizId: string; selectedIdx: number; isCorrect: boolean }) => {
      state.quizCalls.push(v);
      return state.loggedIn;
    },
  }),
  useClaimBadge: () => ({
    mutateAsync: async (riverId: string) => {
      state.claimCalls.push(riverId);
      return state.claimResult;
    },
  }),
}));

// 색종이는 jsdom에 canvas가 없어 실제로 못 그립니다 — 호출 횟수만 셉니다.
vi.mock('./celebrate', () => ({
  celebrate: () => {
    state.celebrations += 1;
  },
  prefersReducedMotion: () => false,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  state.loggedIn = true;
  state.missionCalls = [];
  state.quizCalls = [];
  state.claimCalls = [];
  state.claimResult = { ok: true, is_new: true };
  state.missionThrows = false;
  state.celebrations = 0;
  state.photoCalls = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function buttons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'));
}

function byText(text: string): HTMLButtonElement | undefined {
  return buttons().find((b) => (b.textContent ?? '').includes(text));
}

/** 클릭 후 record()의 await 사슬(기록 → 배지)까지 흘려보냅니다. */
async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
  await act(async () => {});
}

/**
 * 입력 흉내내기.
 * React는 input 인스턴스의 value 프로퍼티를 가로채 "직전 값"을 기억합니다.
 * 그래서 `input.value = x`로 바로 넣으면 React가 변화를 못 알아채고 onChange가 안 옵니다.
 * 프로토타입의 원본 setter로 넣어야 추적기가 차이를 인식합니다.
 */
async function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function render(node: ReactElement) {
  await act(async () => {
    root.render(node);
  });
}

describe('MissionModal — 공통', () => {
  it('헤더에 하천 이름과 아이콘, 두 STEP 상태를 보여준다', async () => {
    await render(<MissionModal river={makeRiver({ missionKind: 'acknowledge' })} onClose={() => {}} />);

    expect(container.textContent).toContain('온천천');
    expect(container.textContent).toContain('🦦');
    expect(container.textContent).toContain('STEP 1 체험 미션: 진행 필요');
    expect(container.textContent).toContain('생태·역사 퀴즈: 0/1');
  });

  it('Escape와 배경 클릭으로 닫힌다', async () => {
    let closed = 0;
    await render(<MissionModal river={makeRiver()} onClose={() => (closed += 1)} />);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(closed).toBe(1);

    const backdrop = container.firstElementChild as HTMLElement;
    await act(async () => {
      backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(closed).toBe(2);
  });

  it('열려 있는 동안 뒤 페이지 스크롤을 잠그고 닫으면 되돌린다', async () => {
    expect(document.body.style.overflow).toBe('');
    await render(<MissionModal river={makeRiver()} onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('hidden');
    await act(async () => root.unmount());
    expect(document.body.style.overflow).toBe('');
    root = createRoot(container); // afterEach의 unmount용
  });

  it('미로그인이면 저장되지 않는다고 알리고, 배지도 요청하지 않는다', async () => {
    state.loggedIn = false;
    const river = makeRiver({ missionKind: 'acknowledge' });
    await render(<MissionModal river={river} onClose={() => {}} />);

    expect(container.textContent).toContain('로그인하면 진행 상황이 저장돼요');

    await click(byText('탐방 인증하기')!);
    await click(byText('수달')!);

    // 화면상으로는 진행되지만(낙관적) 배지 요청은 나가지 않습니다.
    expect(container.textContent).toContain('STEP 1 체험 미션: 완료');
    expect(state.claimCalls).toEqual([]);
  });

  it('저장에 실패하면 조용히 넘어가지 않고 알린다', async () => {
    state.missionThrows = true;
    await render(<MissionModal river={makeRiver({ missionKind: 'acknowledge' })} onClose={() => {}} />);

    await click(byText('탐방 인증하기')!);
    expect(container.textContent).toContain('저장에 실패했어요');
  });
});

describe('MissionModal — 퀴즈', () => {
  it('오답은 다시 풀 수 있게 두고, 정답은 잠그고 해설을 연다', async () => {
    const river = makeRiver({ missionKind: 'acknowledge' });
    await render(<MissionModal river={river} onClose={() => {}} />);

    await click(byText('삵')!);
    expect(container.textContent).toContain('아직 정답이 아니에요');
    expect(container.textContent).not.toContain('정답입니다!');
    expect(state.quizCalls).toEqual([{ quizId: 'q1', selectedIdx: 1, isCorrect: false }]);

    await click(byText('수달')!);
    expect(container.textContent).toContain('정답입니다!');
    expect(container.textContent).toContain('수달이 돌아왔어요');
    expect(container.textContent).toContain('생태·역사 퀴즈: 1/1');

    // 잠긴 뒤에는 더 이상 기록하지 않습니다.
    await click(byText('삵')!);
    expect(state.quizCalls).toHaveLength(2);
  });
});

describe('MissionModal — 완수와 배지', () => {
  it('미션과 퀴즈를 모두 끝내면 한 번만 축하하고 배지를 수령한다', async () => {
    const river = makeRiver({ missionKind: 'acknowledge' });
    await render(<MissionModal river={river} onClose={() => {}} />);

    await click(byText('탐방 인증하기')!);
    expect(state.celebrations).toBe(0); // 퀴즈가 남아 있으므로 아직

    await click(byText('수달')!);
    expect(state.celebrations).toBe(1);
    expect(state.claimCalls).toEqual(['river-1']);
    expect(container.textContent).toContain('탐험 배지를 받았어요');
  });

  it('이미 완수한 하천을 다시 열면 축하가 또 터지지 않는다', async () => {
    const river = makeRiver({
      missionKind: 'acknowledge',
      missionDone: true,
      quizSolvedIds: new Set(['q1']),
    });
    await render(<MissionModal river={river} onClose={() => {}} />);
    expect(state.celebrations).toBe(0);
  });

  it('서버가 배지를 거절해도(ok:false) 화면이 깨지지 않고 이유를 보여준다', async () => {
    state.claimResult = { ok: false, reason: 'quiz_incomplete' };
    const river = makeRiver({ missionKind: 'acknowledge' });
    await render(<MissionModal river={river} onClose={() => {}} />);

    await click(byText('탐방 인증하기')!);
    await click(byText('수달')!);

    expect(container.textContent).toContain('아직 못 푼 퀴즈가 남아 있어요');
  });
});

describe('MissionModal — 하천마다 다른 구성', () => {
  it('미션이 없는 하천(수영강·부전천)은 STEP 1을 아예 그리지 않고 퀴즈만으로 완수된다', async () => {
    const river = makeRiver({ missionKind: null, hasMission: false, name: '수영강' });
    await render(<MissionModal river={river} onClose={() => {}} />);

    expect(container.textContent).not.toContain('STEP 1');
    expect(container.textContent).toContain('생태·역사 퀴즈: 0/1');

    await click(byText('수달')!);
    expect(state.missionCalls).toEqual([]);
    expect(state.celebrations).toBe(1);
    expect(state.claimCalls).toEqual(['river-1']);
  });

  it('퀴즈가 없는 하천(동천)은 퀴즈 영역을 그리지 않고 미션만으로 완수된다', async () => {
    const river = makeRiver({
      missionKind: 'collect',
      name: '동천',
      quizzes: [],
      missionConfig: { items: ['🥤', '🛍️', '🥫'], target: 3, done: '🧹 수거 완료!' },
    });
    await render(<MissionModal river={river} onClose={() => {}} />);

    expect(container.textContent).not.toContain('생태·역사 퀴즈');
    expect(container.textContent).toContain('STEP 1');
  });
});

describe('STEP 1 미션 — kind별 동작', () => {
  it('tap_target: 대상을 탭하면 촬영이 끝난 뒤 완료된다 (움직임과 무관하게)', async () => {
    const river = makeRiver({
      missionKind: 'tap_target',
      missionConfig: { emoji: '🦦', label: '클릭해서 찰칵!', done: '📸 촬영 완성!' },
    });
    await render(<MissionModal river={river} onClose={() => {}} />);

    await click(byText('클릭해서 찰칵!')!);
    expect(state.photoCalls).toEqual([{ missionTag: 'oncheoncheon_otter' }]);
    // ★ 업로드된 사진 id 가 미션 기록까지 실려 가야 합니다.
    //   여기서 photoId 가 빠지면 사진은 저장되는데 미션에는 안 붙는 상태가 됩니다.
    expect(state.missionCalls).toEqual([{ riverId: 'river-1', photoId: 'photo-1' }]);
    expect(container.textContent).toContain('📸 촬영 완성!');
  });

  it('collect: 목표 개수를 다 주워야 완료된다', async () => {
    const river = makeRiver({
      missionKind: 'collect',
      missionConfig: { items: ['🥤', '🛍️', '🥫'], target: 3, done: '🧹 수거 완료!' },
    });
    await render(<MissionModal river={river} onClose={() => {}} />);

    await click(byText('🥤')!);
    await click(byText('🛍️')!);
    expect(state.missionCalls).toEqual([]);
    expect(container.textContent).toContain('2 / 3');

    await click(byText('🥫')!);
    expect(state.missionCalls).toEqual([{ riverId: 'river-1', photoId: undefined }]);
    expect(container.textContent).toContain('🧹 수거 완료!');
  });

  it('collect: 같은 항목을 두 번 눌러도 개수가 늘지 않는다', async () => {
    const river = makeRiver({
      missionKind: 'collect',
      missionConfig: { items: ['🥤', '🛍️', '🥫'], target: 3 },
    });
    await render(<MissionModal river={river} onClose={() => {}} />);

    await click(byText('🥤')!);
    await click(byText('🥤')!);
    await click(byText('🥤')!);
    expect(state.missionCalls).toEqual([]);
    expect(container.textContent).toContain('1 / 3');
  });

  it('text_answer: 오답이면 alert 없이 힌트를 인라인으로 보여주고 다시 시도할 수 있다', async () => {
    const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
    const river = makeRiver({
      missionKind: 'text_answer',
      missionConfig: {
        prompt: '물길을 덮은 것을 무엇이라 하나요?',
        accept: ['복개', '복개천'],
        hint: "정답은 '복개'입니다!",
      },
    });
    await render(<MissionModal river={river} onClose={() => {}} />);

    const input = container.querySelector('input') as HTMLInputElement;
    await typeInto(input, '복원');
    await click(byText('제출')!);

    expect(alertSpy).not.toHaveBeenCalled();
    expect(container.textContent).toContain("정답은 '복개'입니다!");
    expect(state.missionCalls).toEqual([]);

    // 앞뒤 공백이 붙어도 통과해야 합니다 (모바일 키보드에서 흔합니다).
    await typeInto(input, '  복개천 ');
    await click(byText('제출')!);
    expect(state.missionCalls).toEqual([{ riverId: 'river-1', photoId: undefined }]);
    alertSpy.mockRestore();
  });

  it('observe_log: 모든 항목을 고르기 전에는 제출이 잠기고 몇 개 남았는지 알려준다', async () => {
    const fields: ObserveField[] = [
      { key: 'found', label: '무엇을 발견했나요?', options: [{ emoji: '🌱', label: '식물' }] },
      { key: 'clarity', label: '오늘 하천의 상태는?', options: [{ emoji: '💧', label: '맑음' }] },
    ];
    const river = makeRiver({
      missionKind: 'observe_log',
      missionConfig: { fields, cta: '📷 일지 등록', done: '📷 등록 완료' },
    });
    await render(<MissionModal river={river} onClose={() => {}} />);

    expect(byText('📷 일지 등록')!.getAttribute('aria-disabled')).toBe('true');
    expect(container.textContent).toContain('2개 있어요');

    // 한 항목만 골라도 여전히 잠겨 있고, 눌러도 기록되지 않습니다.
    await click(byText('식물')!);
    expect(container.textContent).toContain('1개 있어요');
    await click(byText('📷 일지 등록')!);
    expect(state.missionCalls).toEqual([]);
  });

  it('observe_log: 모든 항목을 고르면 등록된다', async () => {
    const fields: ObserveField[] = [
      { key: 'found', label: '무엇을 발견했나요?', options: [{ emoji: '🌱', label: '식물' }] },
      { key: 'clarity', label: '오늘 하천의 상태는?', options: [{ emoji: '💧', label: '맑음' }] },
    ];
    const river = makeRiver({
      missionKind: 'observe_log',
      missionConfig: { fields, cta: '📷 일지 등록', done: '📷 등록 완료' },
    });
    await render(<MissionModal river={river} onClose={() => {}} />);

    await click(byText('식물')!);
    await click(byText('맑음')!);
    expect(byText('📷 일지 등록')!.getAttribute('aria-disabled')).toBe('false');

    await click(byText('📷 일지 등록')!);
    expect(state.photoCalls).toEqual([{ missionTag: 'daecheon_log' }]);
    expect(state.missionCalls).toEqual([{ riverId: 'river-1', photoId: 'photo-1' }]);
    expect(container.textContent).toContain('📷 등록 완료');
  });
});
