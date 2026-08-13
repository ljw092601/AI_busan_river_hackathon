import { Suspense, lazy } from 'react';
import { useSession } from '@/lib/session';
import { useAuthPrompt } from './AuthPrompt';

/**
 * 홈 헤더의 계정 자리.
 *
 * 미로그인이면 **글자가 있는** 로그인 버튼입니다. 아이콘만 두면 그대로 못 찾습니다 —
 * 이 트랙이 존재하는 이유가 "인증 기능은 다 있는데 들어가는 문이 없다"였습니다.
 * 로그인한 뒤에는 계정 칩(AccountMenu)으로 바뀌고, 좁은 화면에서는 아바타 하나로 접힙니다.
 *
 * ★ AccountMenu를 lazy로 붙이는 이유는 AuthPrompt.tsx 상단 주석과 같습니다 —
 *   이 파일은 HomeScreen이 정적으로 import 하므로 `@/lib/supabase`를 끌어오면 안 됩니다.
 *   (`@/lib/session`은 홈이 이미 쓰고 있어 새로 늘어나는 의존이 아닙니다.)
 */

const AccountMenu = lazy(() => import('./AccountMenu').then((m) => ({ default: m.AccountMenu })));

/** 아바타 칩과 같은 크기의 자리표시자 — 세션 확인 중 헤더가 덜컹거리지 않게 합니다. */
function AccountSlotPlaceholder() {
  return (
    <span
      className="w-11 h-11 shrink-0 rounded-xl bg-slate-100 animate-pulse"
      aria-hidden="true"
    />
  );
}

export function HeaderAccount() {
  const { isLoggedIn, isLoading } = useSession();
  const { requestSignIn } = useAuthPrompt();

  if (isLoading) return <AccountSlotPlaceholder />;

  if (!isLoggedIn) {
    return (
      <button
        type="button"
        onClick={() => requestSignIn()}
        className="shrink-0 flex items-center gap-1.5 px-3 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all shadow-sm"
      >
        <span className="hidden sm:inline text-base" aria-hidden="true">
          🔑
        </span>
        로그인
      </button>
    );
  }

  return (
    <Suspense fallback={<AccountSlotPlaceholder />}>
      <AccountMenu />
    </Suspense>
  );
}
