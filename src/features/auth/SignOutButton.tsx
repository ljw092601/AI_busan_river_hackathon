import { ErrorNotice } from './ErrorNotice';
import { useSignOut } from './useAuth';
import s from './auth.module.css';

/**
 * 로그아웃 버튼.
 *
 * 토큰을 직접 지우지 않습니다 — `supabase.auth.signOut()`이 저장소를 비우고,
 * `session.ts`의 onAuthStateChange가 react-query 캐시를 통째로 clear 합니다.
 * 남의 계정 데이터가 화면에 남지 않는 것은 그 clear가 보장합니다.
 */
export interface SignOutButtonProps {
  /** 'link'는 본문 안에, 'button'은 독립 액션으로 씁니다. 기본은 'button'. */
  variant?: 'button' | 'link';
  label?: string;
  className?: string;
}

export function SignOutButton({
  variant = 'button',
  label = '로그아웃',
  className,
}: SignOutButtonProps) {
  const { signOut, isPending, error } = useSignOut();
  const base = variant === 'link' ? s.link : s.secondary;

  return (
    <>
      <button
        type="button"
        className={className ? `${base} ${className}` : base}
        onClick={() => void signOut()}
        disabled={isPending}
      >
        {isPending ? '나가는 중…' : label}
      </button>
      <ErrorNotice error={error} />
    </>
  );
}

/**
 * 현재 로그인한 계정을 보여주는 줄 + 로그아웃.
 * "나" 탭 상단에 그대로 붙일 수 있게 만들어 둔 조각입니다.
 */
export interface AccountBarProps {
  nickname?: string | null;
  email?: string | null;
}

export function AccountBar({ nickname, email }: AccountBarProps) {
  return (
    <div className={s.accountBar}>
      <span className={s.accountName}>{nickname ?? '우리 가족'}</span>
      {email ? <span className={s.accountMeta}>{email}</span> : null}
      <span className={s.accountSpacer} />
      <SignOutButton />
    </div>
  );
}
