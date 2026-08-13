/**
 * 보호자 인증(auth) 트랙 공개 API.
 *
 * 이 배럴 밖의 파일은 내부 구현으로 봅니다.
 * 라우팅 배선은 오케스트레이터(App.tsx)가 합니다 — 이 트랙은 App.tsx를 건드리지 않습니다.
 *
 * 가장 흔한 사용법:
 * ```tsx
 * import { AuthGate } from '@/features/auth';
 * { path: 'me', element: <AuthGate><MyRecords /></AuthGate> }
 * ```
 * 미로그인 방문자도 코스·도감을 볼 수 있어야 하므로(PLAN.md §3) 앱 전체가 아니라
 * 기록이 남는 화면에만 감싸는 것을 권합니다.
 */

// ─── 게이트 · 화면 ─────────────────────────────────────────────
export { AuthGate } from './AuthGate';
export type { AuthGateProps } from './AuthGate';

// ─── 홈 화면에 얹는 로그인 (모달) ───────────────────────────────
// ⚠️ 홈처럼 **정적 import** 하는 쪽은 이 배럴 대신 `@/features/auth/home`을 쓰세요.
//    이 파일은 useAuth → @/lib/supabase 를 함께 평가하므로 VITE_ 환경변수가 없는
//    환경(테스트·fresh clone)에서 import 단계에서 throw 합니다. home.ts는 그렇지 않습니다.
export { AuthPromptProvider, useAuthPrompt } from './AuthPrompt';
export type { AuthPromptProviderProps, AuthPromptValue } from './AuthPrompt';

export { HeaderAccount } from './HeaderAccount';
export { AccountMenu } from './AccountMenu';

export { AuthModal } from './AuthModal';
export type { AuthModalProps } from './AuthModal';

export { SignInScreen } from './SignInScreen';
export type { SignInScreenProps } from './SignInScreen';

export { ConsentScreen } from './ConsentScreen';
export type { ConsentScreenProps } from './ConsentScreen';

export { AccountBar, SignOutButton } from './SignOutButton';
export type { AccountBarProps, SignOutButtonProps } from './SignOutButton';

export { ErrorNotice } from './ErrorNotice';
export type { ErrorNoticeProps } from './ErrorNotice';

// ─── 훅 ─────────────────────────────────────────────────────────
export {
  profileQueryKey,
  useCompleteOnboarding,
  useGuardianProfile,
  useSignIn,
  useSignOut,
  useSignUp,
  useUpdateGuardianProfile,
} from './useAuth';
export type {
  UseCompleteOnboardingResult,
  UseGuardianProfileResult,
  UseSignInResult,
  UseSignOutResult,
  UseUpdateProfileResult,
} from './useAuth';

// ⚠️ 세션 자체는 여기서 다시 내보내지 않습니다. `@/lib/session`의 useSession()을 직접 쓰세요 —
//    캐시 키가 갈라지지 않도록 진입점을 하나로 유지합니다.

// ─── 로직 (테스트·재사용용) ─────────────────────────────────────
export { describeError } from './errors';
export type { AuthErrorKind, FriendlyError } from './errors';

export {
  CONSENT_ITEMS,
  NICKNAME_MAX_LENGTH,
  NOT_COLLECTED,
  PASSWORD_MIN_LENGTH,
  buildConsentScope,
  defaultConsentSelection,
  interpretSignUpResult,
  isConsentComplete,
  isOnboardingComplete,
  validateEmail,
  validateNickname,
  validatePassword,
} from './flow';
export type { ConsentItem, SignUpOutcome } from './flow';

export {
  avatarFromSeed,
  ensureGuardianProfile,
  fetchGuardianProfile,
  randomAvatarSeed,
  updateGuardianProfile,
} from './profile';
export type { EnsureProfileResult } from './profile';

export type {
  AuthClient,
  ConsentMethod,
  ConsentScope,
  ConsentScopeKey,
  GradeBand,
  GuardianProfile,
  GuardianProfileInput,
} from './types';
