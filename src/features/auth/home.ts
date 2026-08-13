/**
 * 홈 화면이 쓰는 **가벼운** 진입점.
 *
 * `@/features/auth`(index.ts)는 훅·프로필 헬퍼까지 전부 내보내므로 import 하는 순간
 * `@/lib/supabase`가 함께 평가됩니다. 그 모듈은 VITE_ 환경변수가 없으면 throw 하고,
 * HomeScreen은 .env 없이도 렌더돼야 하는 화면입니다(rivers 트랙 테스트가 그렇게 돕니다).
 *
 * 그래서 홈이 **정적으로** 가져가는 것은 이 세 개뿐입니다. 실제 인증 화면(AuthModal)과
 * 계정 칩(AccountMenu)은 필요해진 순간 `lazy()`로 내려받습니다.
 *
 * ```tsx
 * <AuthPromptProvider>
 *   …헤더 안에 <HeaderAccount /> …
 * </AuthPromptProvider>
 * ```
 * 자손 어디서나 `useAuthPrompt().requestSignIn('…')`으로 같은 모달을 엽니다.
 */

export { AuthPromptProvider, useAuthPrompt } from './AuthPrompt';
export type { AuthPromptProviderProps, AuthPromptValue } from './AuthPrompt';

export { HeaderAccount } from './HeaderAccount';
