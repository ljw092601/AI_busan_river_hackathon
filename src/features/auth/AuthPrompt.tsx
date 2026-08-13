import {
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * "여기서 로그인하게 해줘" 요청을 받는 접합부.
 *
 * ## 왜 라우트가 아니라 모달인가
 * 홈에서 `/me`로 이동시키면 지도·위치 구독·열려 있던 미션 모달이 전부 초기화됩니다.
 * 하천변에서 그건 "아까 보던 화면으로 돌아가는 법"을 잃는 것과 같습니다.
 * 그래서 로그인은 **현재 화면 위에 얹고**, 끝나면 그 자리에 그대로 돌려놓습니다.
 *
 * ## 왜 이 파일에는 supabase가 없는가 (★ 지우지 마세요)
 * 이 모듈은 HomeScreen이 **정적으로** import 합니다. 그런데 `@/lib/supabase`는
 * 모듈 평가 시점에 VITE_ 환경변수가 없으면 throw 하고, `useAuth`/`AuthGate`는 그것을
 * 정적으로 끌어옵니다. 그대로 이으면 .env 없이 도는 환경(fresh clone·CI)에서
 * HomeScreen 테스트가 import 단계에서 통째로 죽습니다.
 * → 무거운 쪽(AuthModal)은 `lazy()`로 떼어 두고, 이 파일은 React만 씁니다.
 *   같은 이유로 AccountMenu도 HeaderAccount에서 lazy로 붙습니다.
 *
 * ## 다른 트랙에서 쓰는 법
 * ```tsx
 * const { requestSignIn, isAvailable } = useAuthPrompt();
 * {isAvailable && <button onClick={() => requestSignIn('이 미션 기록을 저장하려면')}>로그인</button>}
 * ```
 * Provider 밖에서 불러도 던지지 않습니다 — `isAvailable: false`에 no-op을 돌려주므로
 * 이 훅을 쓰는 컴포넌트를 단독으로 렌더해도 안전합니다.
 */

const AuthModal = lazy(() => import('./AuthModal').then((m) => ({ default: m.AuthModal })));

export interface AuthPromptValue {
  /** 로그인 모달을 엽니다. reason은 모달 상단에 "왜 지금 로그인인가"로 한 줄 붙습니다. */
  requestSignIn: (reason?: string) => void;
  isOpen: boolean;
  /** Provider가 위에 있는가. false면 요청해도 아무 일도 일어나지 않습니다. */
  isAvailable: boolean;
}

const NOT_AVAILABLE: AuthPromptValue = {
  requestSignIn: () => {},
  isOpen: false,
  isAvailable: false,
};

const AuthPromptContext = createContext<AuthPromptValue>(NOT_AVAILABLE);

export function useAuthPrompt(): AuthPromptValue {
  return useContext(AuthPromptContext);
}

export interface AuthPromptProviderProps {
  children: ReactNode;
}

/**
 * 로그인 모달의 열림 상태를 소유하고, 자손 어디에서든 열 수 있게 합니다.
 * 모달 자체는 열릴 때 처음 내려받습니다(lazy) — 미로그인 방문자가 둘러보기만 하고
 * 나가는 경우가 대부분이라 인증 화면 코드를 첫 로딩에 태울 이유가 없습니다.
 */
export function AuthPromptProvider({ children }: AuthPromptProviderProps) {
  const [reason, setReason] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const requestSignIn = useCallback((nextReason?: string) => {
    setReason(nextReason ?? null);
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const value = useMemo<AuthPromptValue>(
    () => ({ requestSignIn, isOpen: open, isAvailable: true }),
    [requestSignIn, open],
  );

  return (
    <AuthPromptContext.Provider value={value}>
      {children}
      {open ? (
        <Suspense
          fallback={
            <div
              role="status"
              aria-live="polite"
              className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-sm font-bold text-white"
            >
              로그인 화면을 여는 중…
            </div>
          }
        >
          <AuthModal onClose={close} reason={reason} />
        </Suspense>
      ) : null}
    </AuthPromptContext.Provider>
  );
}
