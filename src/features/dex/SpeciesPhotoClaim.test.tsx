/**
 * 사진으로 도감 카드 얻기 — 화면 동작 고정.
 *
 * @testing-library가 프로젝트에 없어 react-dom으로 직접 렌더합니다
 * (MissionPhoto.test.tsx와 같은 방식).
 *
 * jsdom에는 카메라도 Storage도 없으므로 captureAndUpload와 supabase.rpc만 갈아 끼웁니다.
 * 대신 **직접 settle**하는 promise를 돌려주어 "촬영 중 / 등록 중" 구간을 실제로
 * 붙잡아 볼 수 있게 했습니다. PhotoError와 describePhotoError, claim.ts의 문구는
 * 진짜를 씁니다 — 아이가 보게 될 문구가 실제 문구와 같은지 확인하는 것이 목적입니다.
 *
 * 이 파일이 지키는 계약 세 가지:
 *   ① 제스처 안에서 카메라가 열린다 (앞에 await 가 끼면 iOS에서 조용히 막힙니다)
 *   ② 미로그인은 카메라를 열지 않되, 조용히 넘기지도 않는다
 *   ③ "지금은 사진을 그대로 등록한다"는 정직한 한 줄이 화면에 남아 있다
 */

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhotoError, type UploadedPhoto } from '@/lib/photos';
import type { Species } from '@/types/domain';
import { PHOTO_UNVERIFIED_NOTE, parseClaimResult } from './claim';
import { SpeciesPhotoClaim } from './SpeciesPhotoClaim';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

interface CaptureCall {
  userId: string | null;
  spotId?: string | null;
  missionTag?: string | null;
}

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

const state = vi.hoisted(() => ({
  userId: 'user-1' as string | null,
  calls: [] as CaptureCall[],
  rpcCalls: [] as RpcCall[],
  settle: null as {
    resolve: (v: UploadedPhoto | null) => void;
    reject: (e: unknown) => void;
  } | null,
  rpcSettle: null as {
    resolve: (v: { data: unknown; error: unknown }) => void;
  } | null,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      return new Promise((resolve) => {
        state.rpcSettle = { resolve: resolve as (v: { data: unknown; error: unknown }) => void };
      });
    },
  },
}));

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

function makeSpecies(overrides: Partial<Species> = {}): Species {
  return {
    id: 'sp-sparrow',
    code: 'sparrow',
    commonName: '참새',
    category: 'smallbird',
    tier: 1,
    track: 'challenge',
    waterGrade: null,
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    idHint: '볼에 까만 점이 있어',
    fact: '',
    ethicsFlag: 'none',
    ...overrides,
  };
}

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
  state.rpcCalls = [];
  state.settle = null;
  state.rpcSettle = null;
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

function renderClaim(
  opts: { species?: Species; owned?: boolean; onAcquired?: () => void } = {},
) {
  return render(
    <SpeciesPhotoClaim
      species={opts.species ?? makeSpecies()}
      owned={opts.owned ?? false}
      onAcquired={opts.onAcquired ?? (() => {})}
    />,
  );
}

function buttons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'));
}

function byText(text: string): HTMLButtonElement | undefined {
  return buttons().find((b) => (b.textContent ?? '').includes(text));
}

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

async function failCapture(error: unknown) {
  const settle = state.settle;
  expect(settle).not.toBeNull();
  await act(async () => {
    settle!.reject(error);
  });
  await act(async () => {});
}

/** 진행 중이던 claim_species_photo 호출을 끝냅니다. */
async function finishClaim(data: unknown, error: unknown = null) {
  const settle = state.rpcSettle;
  expect(settle).not.toBeNull();
  await act(async () => {
    settle!.resolve({ data, error });
  });
  await act(async () => {});
}

/** 촬영 성공 → 서버 응답까지 한 번에. */
async function claimWith(data: unknown, error: unknown = null) {
  await click(byText('사진 찍어 등록하기')!);
  await finishCapture(makePhoto());
  await finishClaim(data, error);
}

const NEW_CARD = {
  ok: true,
  is_new: true,
  tier: 1,
  points: 20,
  species_id: 'sp-sparrow',
  observation_id: 'obs-1',
};

/* ══ 제스처 · 진행 상태 ═══════════════════════════════════════ */

describe('SpeciesPhotoClaim — 촬영 시작', () => {
  it('★ 누르는 순간(제스처가 살아 있는 동안) 곧바로 촬영을 시작한다', async () => {
    await renderClaim();
    const cta = byText('사진 찍어 등록하기')!;

    await act(async () => {
      cta.click();
      // await 뒤로 미루면 iOS Safari 가 카메라를 조용히 막습니다 —
      // 클릭 핸들러가 끝나기 전에 이미 호출돼 있어야 합니다.
      expect(state.calls).toHaveLength(1);
    });

    expect(state.calls[0]).toEqual({
      userId: 'user-1',
      spotId: null,
      missionTag: 'dex_species',
    });
  });

  it('촬영·등록 중에는 진행 상태를 보여 주고, 연타해도 사진은 한 장만 올린다', async () => {
    await renderClaim();

    await click(byText('사진 찍어 등록하기')!);
    expect(container.textContent).toContain('사진을 준비하고 있어요');
    expect(byText('사진 준비 중…')!.getAttribute('aria-disabled')).toBe('true');

    await click(byText('사진 준비 중…')!);
    await click(byText('사진 준비 중…')!);
    expect(state.calls).toHaveLength(1);

    // 업로드가 끝나도 서버 등록이 남아 있습니다 — 여기서도 잠겨 있어야 합니다.
    await finishCapture(makePhoto());
    expect(container.textContent).toContain('도감에 등록하는 중이에요');
    await click(byText('도감에 등록하는 중…')!);
    expect(state.calls).toHaveLength(1);
    expect(state.rpcCalls).toHaveLength(1);
  });

  it('업로드가 끝나야 서버에 등록을 요청한다 (사진 id 를 그대로 넘긴다)', async () => {
    await renderClaim();

    await click(byText('사진 찍어 등록하기')!);
    expect(state.rpcCalls).toEqual([]); // 아직 사진이 없습니다

    await finishCapture(makePhoto({ photoId: 'photo-9' }));
    expect(state.rpcCalls).toEqual([
      { fn: 'claim_species_photo', args: { p_species_id: 'sp-sparrow', p_photo_id: 'photo-9' } },
    ]);
  });
});

/* ══ 결과별 안내 ══════════════════════════════════════════════ */

describe('SpeciesPhotoClaim — 서버 결과', () => {
  it('새 카드를 얻으면 획득 연출을 띄우고 서버가 준 포인트를 그대로 보여 준다', async () => {
    const acquired: unknown[] = [];
    await renderClaim({ onAcquired: () => acquired.push('yes') });

    await claimWith(NEW_CARD);

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('새 카드를 얻었어!');
    expect(dialog?.textContent).toContain('참새');
    expect(dialog?.textContent).toContain('+20P');
    // 컨테이너가 도감을 다시 불러오도록 알립니다.
    expect(acquired).toEqual(['yes']);
  });

  it('★ 획득 연출은 "AI가 확인했다"고 말하지 않는다', async () => {
    await renderClaim();
    await claimWith(NEW_CARD);

    const text = container.textContent ?? '';
    for (const lie of ['AI가 확인', '판별 완료', '정확히 맞혔', '판별했']) {
      expect(text).not.toContain(lie);
    }
  });

  it('이미 가진 종이면 실패로 그리지 않고, 점수가 안 나가는 이유까지 말한다', async () => {
    await renderClaim();
    await claimWith({ ok: true, is_new: false, reason: 'already_owned' });

    expect(container.querySelector('[role="alert"]')).toBeNull();
    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain('이미 도감에 있어');
    expect(status?.textContent).toContain('처음 만났을 때만');
    // 방금 찍은 사진은 그래도 보여 줍니다.
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:preview-1');
  });

  it('expert_only 로 거절되면 "선생님과 함께하는 프로그램" 으로 안내하고 재시도를 권하지 않는다', async () => {
    // 화면은 expert_only 종에 버튼을 아예 두지 않지만, 종의 플래그가 바뀐 뒤라면
    // 서버 거절이 도착할 수 있습니다. 그때도 아이에게 헛수고를 시키지 않습니다.
    await renderClaim();
    await claimWith({ ok: false, reason: 'expert_only' });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '선생님과 함께하는 프로그램에서 만날 수 있어요',
    );
    expect(byText('다시 찍기')).toBeUndefined();
  });

  it.each([
    ['photo_not_found', '사진을 찾지 못했어요'],
    ['no_spot', '등록할 장소를 찾지 못했어요'],
  ] as const)('%s 는 이유를 말하고 다시 찍을 길을 준다', async (reason, message) => {
    await renderClaim();
    await claimWith({ ok: false, reason });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(message);
    await click(byText('다시 찍기')!);
    expect(state.calls).toHaveLength(2);
  });

  it('species_not_found 는 알리되 다시 찍기를 권하지 않는다 (몇 번 찍어도 같은 답)', async () => {
    await renderClaim();
    await claimWith({ ok: false, reason: 'species_not_found' });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '지금은 등록할 수 없는 카드예요',
    );
    expect(byText('다시 찍기')).toBeUndefined();
  });

  it('서버에 닿지 못하면 인터넷을 확인하라고 말하고 다시 시도할 수 있다', async () => {
    await renderClaim();
    await claimWith(null, { message: 'network down' });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '인터넷 연결을 확인하고',
    );
    expect(byText('다시 찍기')).toBeDefined();
  });

  it('처음 보는 reason 이 와도 화면이 죽지 않는다', async () => {
    await renderClaim();
    await claimWith({ ok: false, reason: 'some_future_reason' });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('등록하지 못했어요');
  });
});

/* ══ 촬영 실패 · 취소 ═════════════════════════════════════════ */

describe('SpeciesPhotoClaim — 촬영이 실패하거나 취소될 때', () => {
  it.each([
    ['prepare_failed', '사진을 처리하지 못했어요. 다른 사진으로 다시 시도해 주세요.'],
    ['upload_failed', '사진을 올리지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'],
    ['record_failed', '사진은 올라갔는데 기록에 실패했어요. 한 번 더 눌러 주세요.'],
  ] as const)('%s 로 실패하면 이유를 말하고 다시 찍을 수 있다', async (kind, message) => {
    await renderClaim();

    await click(byText('사진 찍어 등록하기')!);
    await failCapture(new PhotoError(kind, 'boom'));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(state.rpcCalls).toEqual([]); // 사진이 없는데 등록을 주장하지 않습니다

    await click(byText('다시 찍기')!);
    expect(state.calls).toHaveLength(2);
    expect(container.textContent).toContain('사진을 준비하고 있어요');
  });

  it('PhotoError가 아닌 예외도 화면을 멈추지 않는다', async () => {
    await renderClaim();
    await click(byText('사진 찍어 등록하기')!);
    await failCapture(new TypeError('네트워크가 이상함'));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '사진 처리 중 문제가 생겼어요',
    );
  });

  it('촬영을 취소하면(null) 오류가 아니라 조용히 원래대로 돌아온다', async () => {
    await renderClaim();

    await click(byText('사진 찍어 등록하기')!);
    await finishCapture(null);

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain('사진을 준비하고 있어요');
    expect(state.rpcCalls).toEqual([]);

    // 다시 누르면 또 열립니다.
    await click(byText('사진 찍어 등록하기')!);
    expect(state.calls).toHaveLength(2);
  });
});

/* ══ 미로그인 ═════════════════════════════════════════════════ */

describe('SpeciesPhotoClaim — 미로그인', () => {
  it('★ 카메라를 열지 않고, 그렇다고 조용히 넘기지도 않는다', async () => {
    state.userId = null;
    await renderClaim();

    await click(byText('사진 찍어 등록하기')!);

    // 열어 놓고 not_signed_in 으로 실패시키지 않습니다.
    expect(state.calls).toEqual([]);
    expect(state.rpcCalls).toEqual([]);
    // ★ 아무 말 없이 넘기지도 않습니다. 그러면 기능이 아예 없는 것처럼 보입니다.
    expect(container.textContent).toContain('로그인이 필요해요');
    expect(container.textContent).toContain('로그인');
  });

  it('미로그인이어도 진입점은 남겨 둔다 (감추면 왜 안 되는지 말할 자리가 없어진다)', async () => {
    state.userId = null;
    await renderClaim();
    expect(byText('사진 찍어 등록하기')).toBeDefined();
  });
});

/* ══ 윤리 · 정직 ══════════════════════════════════════════════ */

describe('SpeciesPhotoClaim — 무엇을 보여주지 않는가', () => {
  it('★ expert_only 종에는 촬영 버튼을 아예 두지 않는다 (§7.6-4)', async () => {
    await renderClaim({
      species: makeSpecies({ id: 'sp-planaria', commonName: '플라나리아', ethicsFlag: 'expert_only' }),
    });

    expect(buttons()).toEqual([]);
    expect(container.textContent).toContain('선생님과 함께하는 프로그램에서 만날 수 있어요');
  });

  it('★ report_only 보호종에는 촬영을 요구하지 않고 목격 기록만 받는다 (§7.6)', async () => {
    // 수달 카드에 "사진 찍어 등록하기" 를 띄우면 **플래그가 막으려던 바로 그 행동**
    // (접근·추적)을 앱이 유도하게 됩니다. 이 규칙은 되돌아가면 안 됩니다.
    await renderClaim({
      species: makeSpecies({ id: 'sp-otter', commonName: '수달', ethicsFlag: 'report_only' }),
    });

    const labels = buttons().map((b) => b.textContent ?? '');
    expect(labels.some((l) => l.includes('보았다고 기록하기'))).toBe(true);
    expect(labels.some((l) => l.includes('사진 찍어'))).toBe(false);
    expect(container.textContent).toContain('가까이 가지 말고');
    // 카메라를 열지 않아야 합니다.
    await click(buttons()[0]!);
    expect(state.calls).toEqual([]);
  });

  it('이미 가진 카드에는 진입점을 두지 않는다', async () => {
    await renderClaim({ owned: true });
    expect(container.innerHTML).toBe('');
  });

  it('접근 금지 종에는 관찰 약속을 등록 자리에서 한 번 더 말한다', async () => {
    await renderClaim({ species: makeSpecies({ ethicsFlag: 'no_approach' }) });
    expect(container.textContent).toContain('가까이 가지 말고 멀리서');
  });

  it('★ "지금은 사진을 그대로 등록한다"는 사실이 화면에 남아 있다', async () => {
    await renderClaim();
    // 이 문장이 사라지면 화면이 하지 않는 일(자동 판별)을 하는 척하게 됩니다.
    expect(container.textContent).toContain(PHOTO_UNVERIFIED_NOTE);
    expect(PHOTO_UNVERIFIED_NOTE).toContain('자동 판별은 준비 중');
  });

  it('★ 미로그인 상태에서도 같은 사실을 말한다', async () => {
    state.userId = null;
    await renderClaim();
    expect(container.textContent).toContain(PHOTO_UNVERIFIED_NOTE);
  });
});

/* ══ 미리보기 URL 정리 ════════════════════════════════════════ */

describe('SpeciesPhotoClaim — Blob URL', () => {
  it('언마운트하면 미리보기 Blob URL을 놓아 준다', async () => {
    await renderClaim();
    await claimWith({ ok: true, is_new: false, reason: 'already_owned' });
    expect(revoked).toEqual([]);

    await act(async () => root.unmount());
    expect(revoked).toEqual(['blob:preview-1']);
    root = createRoot(container); // afterEach의 unmount용
  });

  it('화면이 닫힌 뒤 업로드가 끝나도 Blob URL이 새지 않는다', async () => {
    await renderClaim();
    await click(byText('사진 찍어 등록하기')!);
    await act(async () => root.unmount());

    await finishCapture(makePhoto({ previewUrl: 'blob:late' }));
    expect(revoked).toEqual(['blob:late']);
    expect(state.rpcCalls).toEqual([]); // 닫힌 화면이 서버에 쓰지 않습니다
    root = createRoot(container);
  });

  it('다시 찍으면 앞 사진의 Blob URL을 놓아 준다', async () => {
    await renderClaim();
    await claimWith({ ok: false, reason: 'photo_not_found' });

    await click(byText('다시 찍기')!);
    await finishCapture(makePhoto({ photoId: 'photo-2', previewUrl: 'blob:preview-2' }));
    expect(revoked).toEqual(['blob:preview-1']);
  });
});

/* ══ 응답 파싱 (순수 함수) ════════════════════════════════════ */

describe('parseClaimResult', () => {
  it('새 카드 응답을 그대로 옮긴다', () => {
    expect(parseClaimResult(NEW_CARD, 'fallback')).toEqual({
      ok: true,
      isNew: true,
      speciesId: 'sp-sparrow',
      tier: 1,
      points: 20,
      observationId: 'obs-1',
    });
  });

  it('이미 가진 종은 실패가 아니다', () => {
    expect(parseClaimResult({ ok: true, is_new: false, reason: 'already_owned' }, 'sp-1')).toEqual({
      ok: true,
      isNew: false,
      speciesId: 'sp-1',
      reason: 'already_owned',
    });
  });

  it.each(['expert_only', 'photo_not_found', 'species_not_found', 'no_spot'] as const)(
    '%s 를 아는 사유로 옮긴다',
    (reason) => {
      expect(parseClaimResult({ ok: false, reason }, 'sp-1')).toEqual({ ok: false, reason });
    },
  );

  it('모르는 응답에도 던지지 않는다 (하천변에서 화면이 죽는 것보다 낫습니다)', () => {
    expect(parseClaimResult(null, 'sp-1').ok).toBe(false);
    expect(parseClaimResult('그냥 문자열', 'sp-1').ok).toBe(false);
    expect(parseClaimResult({ ok: false, reason: 'brand_new' }, 'sp-1')).toEqual({
      ok: false,
      reason: 'unknown',
      detail: 'brand_new',
    });
  });
});
