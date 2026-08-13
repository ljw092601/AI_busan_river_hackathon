/**
 * AuthModal — 홈 위에 얹히는 로그인 모달.
 *
 * 확인하려는 것은 네트워크가 아니라 **어떤 상태에서 어떤 단계가 나오고, 언제 닫히는가**입니다.
 * `@/lib/supabase`를 통째로 mock 하는 이유는 AuthGate.test.tsx 상단 주석과 같습니다.
 * @testing-library가 없어 react-dom/client + act로 직접 렌더합니다.
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
    signInResult: { data: {}, error: null } as { data: unknown; error: unknown },
    signUpResult: { data: { user: null, session: null }, error: null } as {
      data: { user: unknown; session: unknown };
      error: unknown;
    },
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: h.state.session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => h.state.signInResult,
      signUp: async () => h.state.signUpResult,
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

const { AuthModal } = await import('./AuthModal');

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
  h.state.signInResult = { data: {}, error: null };
  h.state.signUpResult = { data: { user: null, session: null }, error: null };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.style.overflow = '';
});

/** 세션 → 프로필로 이어지는 두 단계를 모두 흘려보냅니다(react-query는 마이크로태스크로 정착하지 않음). */
async function flush() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function render(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => {
    root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  });
  await flush();
}

function buttonWith(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  );
}

/** 제어 컴포넌트에 값을 넣습니다 — value를 직접 대입하면 React가 변화를 못 봅니다. */
function type(selector: string, value: string) {
  const el = container.querySelector<HTMLInputElement>(selector)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submitForm() {
  const form = container.querySelector('form')!;
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await flush();
}

describe('AuthModal', () => {
  it('미로그인이면 이메일 + 비밀번호 입력을 dialog 안에 보여준다', async () => {
    await render(<AuthModal onClose={() => {}} />);

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
    expect(container.querySelector('input[type="email"]')).not.toBeNull();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    // 계정 주체가 보호자(어른)라는 사실은 모달에서도 첫 화면에 있어야 합니다.
    expect(container.textContent).toContain('보호자');
  });

  it('호출한 쪽의 이유를 그대로 한 줄 붙인다', async () => {
    await render(<AuthModal onClose={() => {}} reason="이 미션 기록을 저장하려면" />);
    expect(container.textContent).toContain('이 미션 기록을 저장하려면');
  });

  it('★ 로그인은 됐지만 users 행이 없으면 동의 단계에서 이어서 시작한다', async () => {
    h.state.session = { user: { id: 'u1', email: 'parent@example.com' } };
    h.state.profile = null;

    const onClose = vi.fn();
    await render(<AuthModal onClose={onClose} />);

    expect(container.textContent).toContain('동의하고 시작하기');
    expect(container.textContent).toContain('받지 않는 것');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('★ users 행은 있어도 consent_id가 비어 있으면 동의 단계로 돌려보낸다', async () => {
    // 통과시키면 record_checkin()이 consent_required로 거부해 아무것도 저장되지 않습니다.
    h.state.session = { user: { id: 'u1' } };
    h.state.profile = { id: 'u1', nickname: '온천천탐험대', consent_id: null };

    const onClose = vi.fn();
    await render(<AuthModal onClose={onClose} />);

    expect(container.textContent).toContain('동의하고 시작하기');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('세션 + 동의까지 끝난 계정이면 스스로 닫는다 (원래 화면으로 돌려보냄)', async () => {
    h.state.session = { user: { id: 'u1' } };
    h.state.profile = { id: 'u1', nickname: '온천천탐험대', consent_id: 'c1' };

    const onClose = vi.fn();
    await render(<AuthModal onClose={onClose} />);

    expect(onClose).toHaveBeenCalled();
  });

  it('프로필 조회가 실패하면 온보딩으로 보내지 않고 재시도를 제안한다', async () => {
    h.state.session = { user: { id: 'u1' } };
    h.state.profileError = { code: '42501', message: 'row-level security' };

    const onClose = vi.fn();
    await render(<AuthModal onClose={onClose} />);

    expect(container.textContent).not.toContain('동의하고 시작하기');
    expect(container.textContent).toContain('다시 시도');
    expect(container.textContent).not.toContain('row-level security');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape·백드롭·닫기 버튼 셋 다 닫고, 뒤 페이지 스크롤 잠금을 되돌린다', async () => {
    const onClose = vi.fn();
    await render(<AuthModal onClose={onClose} />);

    expect(document.body.style.overflow).toBe('hidden');

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = container.querySelector('[role="dialog"]')!.parentElement!;
    act(() => {
      backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    act(() => {
      buttonWith('✕')!.click();
    });
    expect(onClose).toHaveBeenCalledTimes(3);

    // 언마운트되면 잠금이 풀립니다 (닫기는 호출부의 몫이라 여기서는 언마운트로 확인)
    await act(async () => root.unmount());
    expect(document.body.style.overflow).not.toBe('hidden');
    root = createRoot(container); // afterEach의 unmount가 던지지 않도록 되돌려 둡니다
  });

  it('★ 가입했는데 세션이 없으면 "메일함을 확인해 주세요"라고 말한다 (Confirm email 켜짐)', async () => {
    // 프로젝트 설정 하나로 갈리는 지점입니다. 여기서 "가입 완료!"라고 말해버리면
    // 보호자는 메일을 열지 않고, 로그인도 안 되는 채로 이탈합니다.
    h.state.signUpResult = { data: { user: { identities: [{ id: 'i1' }] }, session: null }, error: null };

    await render(<AuthModal onClose={() => {}} />);
    act(() => {
      buttonWith('가입하기')!.click();
    });

    type('input[type="email"]', 'parent@example.com');
    type('input[type="password"]', 'river-2026');
    await submitForm();

    expect(container.textContent).toContain('메일함을 확인해 주세요');
    expect(container.textContent).toContain('parent@example.com');
    // 아직 로그인된 것이 아니므로 동의 화면으로 넘어가면 안 됩니다.
    expect(container.textContent).not.toContain('동의하고 시작하기');
  });

  it('로그인 실패를 Supabase 원문이 아니라 한국어 안내로 보여준다', async () => {
    h.state.signInResult = {
      data: {},
      error: { message: 'Invalid login credentials', status: 400 },
    };

    await render(<AuthModal onClose={() => {}} />);
    type('input[type="email"]', 'parent@example.com');
    type('input[type="password"]', 'wrong-password');
    await submitForm();

    expect(container.textContent).not.toContain('Invalid login credentials');
    expect(container.textContent).toContain('비밀번호가 맞지 않아요');
  });

  it('모달 안에서 시작한 드래그가 백드롭에서 끝나도 닫히지 않는다', async () => {
    const onClose = vi.fn();
    await render(<AuthModal onClose={onClose} />);

    const dialog = container.querySelector('[role="dialog"]')!;
    const backdrop = dialog.parentElement!;
    act(() => {
      dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
