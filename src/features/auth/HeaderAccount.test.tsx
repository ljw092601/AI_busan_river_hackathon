/**
 * 홈 헤더의 계정 자리 + 로그인 모달 접합부(AuthPromptProvider).
 *
 * 이 트랙이 고치려는 문제는 "인증 기능은 다 있는데 들어가는 문이 없다"였습니다.
 * 그래서 여기서 확인하는 것은 화면 전환이 아니라 **문이 보이는가 / 눌리는가 /
 * 누른 뒤 원래 화면에 그대로 있는가**입니다.
 *
 * AccountMenu·AuthModal은 lazy로 붙으므로, 클릭 뒤에는 동적 import가 정착할 때까지
 * 매크로태스크를 여러 번 흘려보냅니다.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  state: {
    session: null as { user: { id: string; email?: string } } | null,
    profile: null as Record<string, unknown> | null,
    profileError: null as unknown,
    signedOut: 0,
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: h.state.session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => {
        h.state.signedOut += 1;
        return { error: null };
      },
      signInWithPassword: async () => ({ data: {}, error: null }),
      signUp: async () => ({ data: { user: null, session: null }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: h.state.profile, error: h.state.profileError }),
        }),
      }),
    }),
  },
  currentUserId: async () => h.state.session?.user.id ?? null,
}));

const { AuthPromptProvider } = await import('./AuthPrompt');
const { HeaderAccount } = await import('./HeaderAccount');

// lazy()가 여는 두 청크를 미리 등록해 둡니다. 그러지 않으면 클릭 뒤 동적 import가
// (부하가 걸린 워커에서) 수백 ms씩 걸려 단언이 로딩 중에 실행됩니다 — 붙었다 떨어졌다 하는
// 테스트의 전형적인 원인입니다. 같은 모듈 id라 아래 lazy()는 캐시에서 즉시 정착합니다.
await import('./AuthModal');
await import('./AccountMenu');

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  h.state.session = null;
  h.state.profile = null;
  h.state.profileError = null;
  h.state.signedOut = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.style.overflow = '';
});

async function flush(ticks = 8) {
  for (let i = 0; i < ticks; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/**
 * lazy() 청크가 붙을 때까지 기다립니다.
 * 고정 횟수로 흘려보내면 모듈 그래프가 큰 쪽(AuthModal → AuthGate → 세 화면)이
 * 아직 로딩 중인 채로 단언이 실행됩니다 — 조건이 참이 될 때까지 돌립니다.
 */
async function waitFor(check: () => boolean, ticks = 80) {
  for (let i = 0; i < ticks && !check(); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const dialog = () => container.querySelector('[role="dialog"]');

/** 홈 화면의 배선을 그대로 흉내 냅니다 — provider가 위, 헤더가 그 안. */
async function renderHeader() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AuthPromptProvider>
          <header>
            <HeaderAccount />
          </header>
          <main>둘러보는 중인 홈 화면</main>
        </AuthPromptProvider>
      </QueryClientProvider>,
    );
  });
  await flush();
}

function buttonWith(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  );
}

async function click(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush();
}

describe('HeaderAccount (미로그인)', () => {
  it('헤더에 글자가 있는 로그인 버튼을 보여준다 (아이콘만 두지 않습니다)', async () => {
    await renderHeader();

    const login = buttonWith('로그인');
    expect(login).toBeTruthy();
    expect(login!.textContent).toContain('로그인');
  });

  it('누르면 같은 화면 위에 로그인 모달이 열린다 (이동하지 않음)', async () => {
    await renderHeader();
    await click(buttonWith('로그인')!);
    await waitFor(() => dialog() !== null);

    expect(dialog()).toBeTruthy();
    expect(container.querySelector('input[type="email"]')).not.toBeNull();
    // 뒤 화면은 그대로 남아 있어야 합니다 — 라우팅이 아니라 얹기이기 때문입니다.
    expect(container.textContent).toContain('둘러보는 중인 홈 화면');
  });

  it('모달을 닫으면 원래 화면만 남는다', async () => {
    await renderHeader();
    await click(buttonWith('로그인')!);
    await waitFor(() => dialog() !== null);
    await click(buttonWith('✕')!);

    expect(dialog()).toBeNull();
    expect(container.textContent).toContain('둘러보는 중인 홈 화면');
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

describe('HeaderAccount (로그인 후)', () => {
  it('별명과 로그아웃을 계정 메뉴에 보여준다', async () => {
    h.state.session = { user: { id: 'u1', email: 'parent@example.com' } };
    h.state.profile = {
      id: 'u1',
      nickname: '온천천탐험대',
      consent_id: 'c1',
      avatar_seed: 'seed-1',
    };

    await renderHeader();

    // 로그인 버튼은 사라지고 계정 칩이 자리를 대신합니다.
    expect(buttonWith('로그인')).toBeUndefined();
    expect(container.textContent).toContain('온천천탐험대');

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('parent@example.com');

    await click(buttonWith('로그아웃')!);
    expect(h.state.signedOut).toBe(1);
  });

  it('Escape로 계정 메뉴가 닫힌다', async () => {
    h.state.session = { user: { id: 'u1', email: 'parent@example.com' } };
    h.state.profile = { id: 'u1', nickname: '온천천탐험대', consent_id: 'c1' };

    await renderHeader();
    await click(container.querySelector<HTMLButtonElement>('button[aria-expanded]')!);
    expect(container.textContent).toContain('parent@example.com');

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(container.textContent).not.toContain('parent@example.com');
  });

  it('★ 가입하다 끊긴 계정은 "가입 마무리"를 달고, 눌러 동의 화면으로 이어진다', async () => {
    // 세션은 있는데 users 행이 없는 상태 — 통과시키면 체크인이 consent_required로 거부됩니다.
    h.state.session = { user: { id: 'u1', email: 'parent@example.com' } };
    h.state.profile = null;

    await renderHeader();

    expect(container.textContent).toContain('가입 마무리');

    await click(container.querySelector<HTMLButtonElement>('button[aria-expanded]')!);
    await click(buttonWith('이어서 마무리하기')!);
    await waitFor(() => dialog() !== null);

    expect(dialog()).toBeTruthy();
    // 로그인 폼이 아니라 동의 화면에서 이어집니다.
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.textContent).toContain('동의하고 시작하기');
  });

  it('★ users 행은 있어도 consent_id가 비면 마무리를 안내한다', async () => {
    // 이 계정은 로그인된 것처럼 보이지만 record_checkin()이 consent_required로 거부합니다.
    h.state.session = { user: { id: 'u1', email: 'parent@example.com' } };
    h.state.profile = { id: 'u1', nickname: '온천천탐험대', consent_id: null };

    await renderHeader();
    await click(container.querySelector<HTMLButtonElement>('button[aria-expanded]')!);

    expect(container.textContent).toContain('가입이 아직 끝나지 않았어요');
    expect(buttonWith('이어서 마무리하기')).toBeTruthy();
  });
});
