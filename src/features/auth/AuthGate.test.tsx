/**
 * AuthGate 상태 전이 테스트.
 *
 * `@/lib/supabase`를 통째로 mock 합니다. 이유는 두 가지입니다:
 *   ① 그 모듈은 import 시점에 VITE_ 환경변수가 없으면 throw 합니다(테스트 환경엔 .env가 없음).
 *      vi.mock은 원본 모듈을 아예 평가하지 않으므로 이 검사가 실행되지 않습니다.
 *   ② 여기서 확인하려는 건 네트워크가 아니라 **어떤 상태에 어떤 화면이 나오는가**입니다.
 *
 * @testing-library가 프로젝트에 없어 react-dom으로 직접 렌더합니다 (quiz 트랙과 같은 방식).
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
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: h.state.session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
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

const { AuthGate } = await import('./AuthGate');

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
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  await act(async () => {
    root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  });
  // 세션 조회 → 프로필 조회로 이어지는 두 단계를 모두 흘려보냅니다.
  // react-query는 마이크로태스크만으로 정착하지 않아 매크로태스크로 여러 번 돌립니다.
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const SECRET = '가족 도감 화면';

describe('AuthGate', () => {
  it('로그인 전에는 로그인 화면을 보여주고 children을 절대 그리지 않는다', async () => {
    await render(
      <AuthGate>
        <p>{SECRET}</p>
      </AuthGate>,
    );

    expect(container.textContent).not.toContain(SECRET);
    expect(container.textContent).toContain('부산 하천 탐험대');
    // 계정 주체가 보호자라는 사실을 첫 화면에서 못박습니다 (PLAN.md §5.1)
    expect(container.textContent).toContain('보호자');
  });

  it('로그인 화면은 이메일 + 비밀번호를 요구한다 (매직링크가 아님 — SMTP 미연결)', async () => {
    await render(
      <AuthGate>
        <p>{SECRET}</p>
      </AuthGate>,
    );

    expect(container.querySelector('input[type="email"]')).not.toBeNull();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('★ 로그인은 됐지만 public.users 행이 없으면 동의 화면으로 보낸다', async () => {
    // auth.signUp 직후 / 이메일 인증 후 첫 진입 / 가입하다 끊긴 계정이 전부 이 상태입니다.
    h.state.session = { user: { id: 'u1', email: 'parent@example.com' } };
    h.state.profile = null;

    await render(
      <AuthGate>
        <p>{SECRET}</p>
      </AuthGate>,
    );

    expect(container.textContent).not.toContain(SECRET);
    expect(container.textContent).toContain('동의');
    expect(container.textContent).toContain('받지 않는 것');
  });

  it('동의 화면은 아이 정보를 받지 않는다는 사실과 학년대역이 선택임을 말한다', async () => {
    h.state.session = { user: { id: 'u1' } };

    await render(
      <AuthGate>
        <p>{SECRET}</p>
      </AuthGate>,
    );

    expect(container.textContent).toContain('건너뛰어도 돼요');
    expect(container.textContent).toMatch(/이름·나이·학교/);
    // 전문가 프로그램(expert_program)은 스스로 켤 수 없으므로 UI에 있어서도 안 됩니다.
    expect(container.textContent).not.toContain('전문가');
  });

  it('세션 + 프로필이 모두 있으면 children을 그린다', async () => {
    h.state.session = { user: { id: 'u1' } };
    h.state.profile = { id: 'u1', nickname: '온천천탐험대', consent_id: 'c1' };

    await render(
      <AuthGate>
        <p>{SECRET}</p>
      </AuthGate>,
    );

    expect(container.textContent).toContain(SECRET);
  });

  it('requireProfile=false면 로그인만으로 통과한다 (동의 전에도 볼 수 있는 화면용)', async () => {
    h.state.session = { user: { id: 'u1' } };
    h.state.profile = null;

    await render(
      <AuthGate requireProfile={false}>
        <p>{SECRET}</p>
      </AuthGate>,
    );

    expect(container.textContent).toContain(SECRET);
  });

  it('프로필 조회가 실패하면 온보딩으로 보내지 않고 재시도를 제안한다', async () => {
    // 조회 실패를 "프로필 없음"으로 착각해 온보딩을 띄우면
    // 이미 있는 계정 위에 새 동의·별명을 덮어쓰게 됩니다.
    h.state.session = { user: { id: 'u1' } };
    h.state.profileError = { code: '42501', message: 'row-level security' };

    await render(
      <AuthGate>
        <p>{SECRET}</p>
      </AuthGate>,
    );

    expect(container.textContent).not.toContain(SECRET);
    expect(container.textContent).not.toContain('동의하고 시작하기');
    expect(container.textContent).toContain('다시 시도');
    // 원문(row-level security)이 그대로 노출되지 않아야 합니다.
    expect(container.textContent).not.toContain('row-level security');
  });
});
