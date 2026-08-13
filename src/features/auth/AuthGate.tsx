import type { ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { ConsentScreen } from './ConsentScreen';
import { ErrorNotice } from './ErrorNotice';
import { SignInScreen } from './SignInScreen';
import { SignOutButton } from './SignOutButton';
import { useGuardianProfile } from './useAuth';
import s from './auth.module.css';

/**
 * 로그인·동의가 끝난 보호자에게만 children을 보여주는 게이트.
 *
 * ## 다섯 상태
 * ```
 * 세션 확인 중            → 로딩
 * 세션 없음               → <SignInScreen>
 * 세션 있음 · 프로필 확인 중 → 로딩
 * 세션 있음 · 프로필 없음   → <ConsentScreen>   ★ 가입 직후도, 인증 후 첫 진입도 여기로
 * 세션 있음 · 프로필 있음   → children
 * ```
 *
 * ## 왜 프로필 없음을 오류로 다루지 않는가
 * `auth.signUp()`이 성공해도 `public.users` 행은 생기지 않습니다. 게다가 프로젝트에서
 * 이메일 확인이 켜져 있으면 가입 직후엔 세션조차 없습니다. 즉 "auth 사용자는 있는데
 * 프로필이 없는" 구간은 예외가 아니라 **정상 경로**이고, 앱을 껐다 켠 뒤에도, 다른 기기에서도,
 * 가입하다 끊긴 뒤에도 여기로 돌아옵니다.
 * 그래서 프로필 생성을 signUp 응답에 매달지 않고 **세션이 존재하는 시점**에 이 게이트가 맡습니다.
 * 이 배치 덕분에 이메일 확인 설정이 켜지든 꺼지든 코드가 같습니다.
 *
 * ## 라우팅에 붙일 때
 * 미로그인 방문자도 코스·도감을 둘러볼 수 있어야 하므로(PLAN.md §3, RLS의 anon 읽기 정책)
 * 앱 전체가 아니라 **기록이 남는 화면**(체크인·관찰 등록·내 기록)에만 감싸는 것을 권합니다.
 */

export interface AuthGateProps {
  children: ReactNode;
  /**
   * false면 로그인만 확인하고 프로필·동의는 요구하지 않습니다.
   * 기본은 true — 동의(consent_id)가 없으면 record_checkin()이 체크인을 거부하므로
   * 대부분의 화면은 프로필까지 있어야 제대로 동작합니다.
   */
  requireProfile?: boolean;
  /** 로딩 중에 보여줄 것. 없으면 기본 문구를 씁니다. */
  loadingFallback?: ReactNode;
}

function Pending({ children }: { children: ReactNode }) {
  return (
    <div className={s.pending} role="status" aria-live="polite">
      {children}
    </div>
  );
}

export function AuthGate({ children, requireProfile = true, loadingFallback }: AuthGateProps) {
  const { isLoggedIn, isLoading: sessionLoading } = useSession();
  const profile = useGuardianProfile();

  if (sessionLoading) {
    return <Pending>{loadingFallback ?? '잠깐만요…'}</Pending>;
  }

  if (!isLoggedIn) {
    return <SignInScreen />;
  }

  if (!requireProfile) {
    return <>{children}</>;
  }

  if (profile.isLoading) {
    return <Pending>{loadingFallback ?? '가족 정보를 불러오는 중…'}</Pending>;
  }

  // 프로필 조회 자체가 실패한 경우 — 온보딩으로 보내면 이미 있는 계정을 덮어쓸 위험이 있어
  // 재시도/로그아웃만 제시하고 멈춥니다. (조회 실패 ≠ 프로필 없음)
  if (profile.error) {
    return (
      <div className={s.screen}>
        <h1 className={s.brand}>가족 정보를 불러오지 못했어요</h1>
        <ErrorNotice error={profile.error} />
        <div className={s.submitRow}>
          <button type="button" className={s.primary} onClick={profile.refetch}>
            다시 시도
          </button>
          <SignOutButton variant="link" label="로그아웃하고 처음부터" />
        </div>
      </div>
    );
  }

  if (!profile.profile) {
    return <ConsentScreen />;
  }

  return <>{children}</>;
}
