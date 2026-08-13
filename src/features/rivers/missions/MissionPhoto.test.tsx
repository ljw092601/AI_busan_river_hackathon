/**
 * 사진을 찍는 미션 두 개 — 온천천(tap_target) · 대천천(observe_log).
 *
 * @testing-library가 프로젝트에 없어 react-dom으로 직접 렌더합니다
 * (MissionModal.test.tsx와 같은 방식).
 *
 * jsdom에는 카메라도 Storage도 없으므로 captureAndUpload만 갈아 끼웁니다.
 * 대신 **직접 settle** 하는 promise를 돌려주어 "촬영 중" 구간을 실제로 붙잡아 볼 수 있게
 * 했습니다. PhotoError와 describePhotoError는 진짜를 씁니다 — 아이가 보게 될 문구가
 * 실제 문구와 같은지 확인하는 것이 이 테스트의 목적 중 하나입니다.
 */

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhotoError, type UploadedPhoto } from '@/lib/photos';
import { makeRiver } from '../fixtures';
import { themeOf } from '../theme';
import type { ObserveField } from '../types';
import { ObserveLogMission } from './ObserveLogMission';
import { TapTargetMission } from './TapTargetMission';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

interface CaptureCall {
  userId: string | null;
  spotId?: string | null;
  missionTag?: string | null;
}

const state = vi.hoisted(() => ({
  userId: 'user-1' as string | null,
  calls: [] as CaptureCall[],
  settle: null as {
    resolve: (v: UploadedPhoto | null) => void;
    reject: (e: unknown) => void;
  } | null,
}));

// photos.ts는 로드 시점에 supabase를 끌고 오고, supabase는 env가 없으면 던집니다.
// 이 테스트는 Supabase 왕복을 보지 않으므로 껍데기만 둡니다.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

vi.mock('@/lib/photos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/photos')>();
  return {
    ...actual,
    captureAndUpload: (opts: CaptureCall) => {
      state.calls.push(opts);
      return new Promise<UploadedPhoto | null>((resolve, reject) => {
        state.settle = { resolve, reject };
      });
    },
  };
});

vi.mock('@/lib/session', () => ({
  useSession: () => ({
    session: null,
    userId: state.userId,
    isLoading: false,
    isLoggedIn: Boolean(state.userId),
  }),
}));

let container: HTMLDivElement;
let root: Root;
let revoked: string[];

const theme = themeOf('emerald');

function makePhoto(overrides: Partial<UploadedPhoto> = {}): UploadedPhoto {
  return {
    photoId: 'photo-1',
    storagePath: 'user-1/photo-1.jpg',
    previewUrl: 'blob:preview-1',
    width: 1024,
    height: 768,
    byteSize: 200_000,
    ...overrides,
  };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  state.userId = 'user-1';
  state.calls = [];
  state.settle = null;
  revoked = [];
  // jsdom에는 createObjectURL/revokeObjectURL이 아예 없습니다.
  URL.revokeObjectURL = (url: string) => void revoked.push(url);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(node: ReactElement) {
  await act(async () => {
    root.render(node);
  });
}

function buttons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'));
}

function byText(text: string): HTMLButtonElement | undefined {
  return buttons().find((b) => (b.textContent ?? '').includes(text));
}

/** 클릭 + 이어지는 마이크로태스크까지 흘려보냅니다. */
async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
  await act(async () => {});
}

/** 진행 중이던 촬영을 성공/취소로 끝냅니다. */
async function finishCapture(value: UploadedPhoto | null) {
  const settle = state.settle;
  expect(settle).not.toBeNull();
  await act(async () => {
    settle!.resolve(value);
  });
  await act(async () => {});
}

/** 진행 중이던 촬영을 실패로 끝냅니다. */
async function failCapture(error: unknown) {
  const settle = state.settle;
  expect(settle).not.toBeNull();
  await act(async () => {
    settle!.reject(error);
  });
  await act(async () => {});
}

/* ══ 온천천 — tap_target ═══════════════════════════════════════ */

const otterRiver = () =>
  makeRiver({
    missionKind: 'tap_target',
    missionConfig: { emoji: '🦦', label: '눌러서 찰칵!', done: '📸 촬영 완료!' },
  });

function renderOtter(opts: { done?: boolean; onComplete?: (id?: string | null) => void } = {}) {
  return render(
    <TapTargetMission
      river={otterRiver()}
      theme={theme}
      done={opts.done ?? false}
      onComplete={opts.onComplete ?? (() => {})}
    />,
  );
}

describe('TapTargetMission — 탭이 곧 촬영', () => {
  it('★ 탭하는 순간(제스처가 살아 있는 동안) 곧바로 촬영을 시작한다', async () => {
    await renderOtter();
    const otter = byText('눌러서 찰칵!')!;

    await act(async () => {
      otter.click();
      // await 뒤로 미루면 브라우저가 파일 선택창을 막습니다 —
      // 클릭 핸들러가 끝나기 전에 이미 호출돼 있어야 합니다.
      expect(state.calls).toHaveLength(1);
    });

    expect(state.calls[0]).toEqual({
      userId: 'user-1',
      spotId: null,
      missionTag: 'oncheoncheon_otter',
    });
  });

  it('촬영 중에는 진행 상태를 보여 주고, 연타해도 사진은 한 장만 올린다', async () => {
    await renderOtter();

    await click(byText('눌러서 찰칵!')!);
    expect(container.textContent).toContain('사진을 준비하고 있어요');
    expect(byText('사진 준비 중…')!.getAttribute('aria-disabled')).toBe('true');

    await click(byText('사진 준비 중…')!);
    await click(byText('사진 준비 중…')!);
    expect(state.calls).toHaveLength(1);
  });

  it('업로드가 끝나면 photo id와 함께 완료되고 미리보기를 보여 준다', async () => {
    const completed: (string | null | undefined)[] = [];
    await renderOtter({ onComplete: (id) => completed.push(id) });

    await click(byText('눌러서 찰칵!')!);
    expect(completed).toEqual([]); // 아직 올라가는 중 — 미리 완료시키지 않습니다

    await finishCapture(makePhoto());
    expect(completed).toEqual(['photo-1']);

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('blob:preview-1');
    expect(container.textContent).toContain('촬영 위치와 시각 정보는 지우고');
  });

  it('촬영을 취소하면(null) 오류가 아니라 조용히 원래대로 돌아온다', async () => {
    const completed: (string | null | undefined)[] = [];
    await renderOtter({ onComplete: (id) => completed.push(id) });

    await click(byText('눌러서 찰칵!')!);
    await finishCapture(null);

    expect(completed).toEqual([]);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain('사진 없이 완료하기');
    expect(container.textContent).not.toContain('사진을 준비하고 있어요');

    // 다시 누르면 또 열립니다.
    await click(byText('눌러서 찰칵!')!);
    expect(state.calls).toHaveLength(2);
  });

  it.each([
    ['not_signed_in', '사진을 저장하려면 로그인이 필요해요.'],
    ['prepare_failed', '사진을 처리하지 못했어요. 다른 사진으로 다시 시도해 주세요.'],
    ['upload_failed', '사진을 올리지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'],
    ['record_failed', '사진은 올라갔는데 기록에 실패했어요. 한 번 더 눌러 주세요.'],
  ] as const)('%s 로 실패하면 이유를 말하고 빠져나갈 길을 준다', async (kind, message) => {
    const completed: (string | null | undefined)[] = [];
    await renderOtter({ onComplete: (id) => completed.push(id) });

    await click(byText('눌러서 찰칵!')!);
    await failCapture(new PhotoError(kind, 'boom'));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(completed).toEqual([]); // 실패했는데 완료된 척하지 않습니다
    expect(byText('사진 없이 완료하기')).toBeDefined();
    expect(byText('다시 찍기')).toBeDefined();
  });

  it('PhotoError가 아닌 예외도 화면을 멈추지 않는다', async () => {
    await renderOtter();
    await click(byText('눌러서 찰칵!')!);
    await failCapture(new TypeError('네트워크가 이상함'));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '사진 처리 중 문제가 생겼어요',
    );
    expect(byText('사진 없이 완료하기')).toBeDefined();
  });

  it('실패 후 "사진 없이 완료하기"를 누르면 사진 없이 미션이 끝난다', async () => {
    const completed: (string | null | undefined)[] = [];
    await renderOtter({ onComplete: (id) => completed.push(id) });

    await click(byText('눌러서 찰칵!')!);
    await failCapture(new PhotoError('upload_failed', 'offline'));
    await click(byText('사진 없이 완료하기')!);

    expect(completed).toEqual([undefined]);
  });

  it('실패 후 "다시 찍기"를 누르면 카메라를 다시 연다', async () => {
    await renderOtter();

    await click(byText('눌러서 찰칵!')!);
    await failCapture(new PhotoError('upload_failed', 'offline'));
    await click(byText('다시 찍기')!);

    expect(state.calls).toHaveLength(2);
    expect(container.textContent).toContain('사진을 준비하고 있어요');
  });

  it('미로그인이면 카메라를 열지 않고, 이유를 말한 뒤 사용자가 고르게 한다', async () => {
    state.userId = null;
    const completed: (string | null | undefined)[] = [];
    await renderOtter({ onComplete: (id) => completed.push(id) });

    await click(byText('눌러서 찰칵!')!);

    // 열어 놓고 실패시키지 않습니다.
    expect(state.calls).toEqual([]);
    // ★ 곧바로 완료시키지 않습니다. 그러면 "찰칵"이라고 해놓고 아무 일도 없이
    //   완료 화면으로 넘어가 카메라 기능이 아예 없는 것처럼 보입니다.
    expect(completed).toEqual([]);
    expect(container.textContent).toContain('사진을 저장하려면 로그인이 필요해요');

    // 사용자가 명시적으로 건너뛰면 그때 완료됩니다.
    await click(byText('사진 없이 미션만 완료하기')!);
    expect(completed).toEqual([undefined]);
  });

  it('이미 완료된 미션은 다시 촬영하지 않는다', async () => {
    await renderOtter({ done: true });
    await click(byText('촬영 완료')!);
    expect(state.calls).toEqual([]);
    expect(container.textContent).toContain('📸 촬영 완료!');
  });

  it('언마운트하면 미리보기 Blob URL을 놓아 준다', async () => {
    await renderOtter();
    await click(byText('눌러서 찰칵!')!);
    await finishCapture(makePhoto());
    expect(revoked).toEqual([]);

    await act(async () => root.unmount());
    expect(revoked).toEqual(['blob:preview-1']);
    root = createRoot(container); // afterEach의 unmount용
  });

  it('화면이 닫힌 뒤 업로드가 끝나도 Blob URL이 새지 않는다', async () => {
    await renderOtter();
    await click(byText('눌러서 찰칵!')!);
    await act(async () => root.unmount());

    await finishCapture(makePhoto({ previewUrl: 'blob:late' }));
    expect(revoked).toEqual(['blob:late']);
    root = createRoot(container);
  });
});

/* ══ 대천천 — observe_log ══════════════════════════════════════ */

const FIELDS: ObserveField[] = [
  { key: 'found', label: '무엇을 발견했나요?', options: [{ emoji: '🌱', label: '식물' }] },
  { key: 'clarity', label: '오늘 하천의 상태는?', options: [{ emoji: '💧', label: '맑음' }] },
  { key: 'smell', label: '냄새는 어땠나요?', options: [{ emoji: '🌸', label: '괜찮음' }] },
];

const logRiver = (fields: ObserveField[] = FIELDS) =>
  makeRiver({
    missionKind: 'observe_log',
    name: '대천천',
    missionConfig: {
      fields,
      cta: '📷 현장 사진 촬영 & 일지 등록',
      done: '📷 관찰일지 등록 완료',
    },
  });

function renderLog(
  opts: { done?: boolean; fields?: ObserveField[]; onComplete?: (id?: string | null) => void } = {},
) {
  return render(
    <ObserveLogMission
      river={logRiver(opts.fields)}
      theme={theme}
      done={opts.done ?? false}
      onComplete={opts.onComplete ?? (() => {})}
    />,
  );
}

async function answerAll(labels: string[]) {
  for (const label of labels) {
    await click(byText(label)!);
  }
}

describe('ObserveLogMission — CTA가 실제로 카메라를 연다', () => {
  it('항목이 남아 있으면 촬영도 등록도 하지 않고 몇 개 남았는지 알려 준다', async () => {
    const completed: (string | null | undefined)[] = [];
    await renderLog({ onComplete: (id) => completed.push(id) });

    // 필드 개수를 하드코딩하지 않습니다 — 3개짜리 설정에서도 그대로 셉니다.
    expect(container.textContent).toContain('아직 고르지 않은 항목이 3개 있어요');
    expect(byText('📷 현장 사진 촬영 & 일지 등록')!.getAttribute('aria-disabled')).toBe('true');

    await click(byText('식물')!);
    expect(container.textContent).toContain('아직 고르지 않은 항목이 2개 있어요');

    await click(byText('📷 현장 사진 촬영 & 일지 등록')!);
    expect(state.calls).toEqual([]);
    expect(completed).toEqual([]);
  });

  it('모두 고른 뒤 CTA를 누르면 촬영을 시작하고, 끝나면 photo id와 함께 등록한다', async () => {
    const completed: (string | null | undefined)[] = [];
    await renderLog({ onComplete: (id) => completed.push(id) });

    await answerAll(['식물', '맑음', '괜찮음']);
    const cta = byText('📷 현장 사진 촬영 & 일지 등록')!;
    expect(cta.getAttribute('aria-disabled')).toBe('false');

    await act(async () => {
      cta.click();
      expect(state.calls).toHaveLength(1); // 제스처 안에서 바로
    });
    expect(state.calls[0]).toEqual({
      userId: 'user-1',
      spotId: null,
      missionTag: 'daecheon_log',
    });

    expect(container.textContent).toContain('사진을 올리는 중이에요');
    expect(completed).toEqual([]);

    await finishCapture(makePhoto({ photoId: 'photo-9' }));
    expect(completed).toEqual(['photo-9']);
  });

  it('촬영 중에는 CTA가 잠겨 사진이 두 장 올라가지 않는다', async () => {
    await renderLog();
    await answerAll(['식물', '맑음', '괜찮음']);

    await click(byText('📷 현장 사진 촬영 & 일지 등록')!);
    await click(byText('사진을 올리는 중이에요')!);
    expect(state.calls).toHaveLength(1);
  });

  it('취소하면 오류 없이 원래 화면으로 돌아온다', async () => {
    const completed: (string | null | undefined)[] = [];
    await renderLog({ onComplete: (id) => completed.push(id) });
    await answerAll(['식물', '맑음', '괜찮음']);

    await click(byText('📷 현장 사진 촬영 & 일지 등록')!);
    await finishCapture(null);

    expect(completed).toEqual([]);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(byText('📷 현장 사진 촬영 & 일지 등록')!.getAttribute('aria-disabled')).toBe('false');
  });

  it('촬영이 실패해도 일지는 남길 수 있다', async () => {
    const completed: (string | null | undefined)[] = [];
    await renderLog({ onComplete: (id) => completed.push(id) });
    await answerAll(['식물', '맑음', '괜찮음']);

    await click(byText('📷 현장 사진 촬영 & 일지 등록')!);
    await failCapture(new PhotoError('prepare_failed', 'heic'));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '사진을 처리하지 못했어요',
    );
    expect(completed).toEqual([]);

    await click(byText('사진 없이 완료하기')!);
    expect(completed).toEqual([undefined]);
  });

  it('미로그인이면 카메라를 열지 않고, 이유를 말한 뒤 사용자가 고르게 한다', async () => {
    state.userId = null;
    const completed: (string | null | undefined)[] = [];
    await renderLog({ onComplete: (id) => completed.push(id) });

    await answerAll(['식물', '맑음', '괜찮음']);
    await click(byText('📷 현장 사진 촬영 & 일지 등록')!);

    expect(state.calls).toEqual([]);
    expect(completed).toEqual([]);
    expect(container.textContent).toContain('사진을 저장하려면 로그인이 필요해요');

    await click(byText('사진 없이 미션만 완료하기')!);
    expect(completed).toEqual([undefined]);
  });

  it('문항이 하나뿐인 설정에서도 그대로 동작한다 (개수·key 하드코딩 없음)', async () => {
    await renderLog({
      fields: [{ key: 'trash', label: '쓰레기는?', options: [{ label: '없음' }] }],
    });

    expect(container.textContent).toContain('아직 고르지 않은 항목이 1개 있어요');
    await click(byText('없음')!);
    expect(container.textContent).not.toContain('아직 고르지 않은 항목이');

    await click(byText('📷 현장 사진 촬영 & 일지 등록')!);
    expect(state.calls).toHaveLength(1);
  });
});
