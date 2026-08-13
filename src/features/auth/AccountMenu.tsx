import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSession } from '@/lib/session';
import { AccountBar } from './SignOutButton';
import { useAuthPrompt } from './AuthPrompt';
import { isOnboardingComplete } from './flow';
import { avatarFromSeed } from './profile';
import { useGuardianProfile } from './useAuth';

/**
 * 헤더의 계정 칩 — 로그인한 보호자에게만 보입니다.
 *
 * ## 왜 팝오버인가
 * 헤더에는 이미 로고와 배지 버튼이 있습니다. 360px에서 별명과 로그아웃 버튼을
 * 나란히 더 놓으면 제목이 밀려 두 줄이 되거나 터치 타깃이 44px 아래로 내려갑니다.
 * 그래서 좁은 화면에서는 **아바타 하나(44px)** 로 접고, 별명·이메일·로그아웃은
 * 눌렀을 때 아래로 펼칩니다. 펼친 내용은 "나" 탭에 쓰려고 만들어 둔 AccountBar를 그대로 씁니다.
 *
 * ## 가입이 끊긴 계정
 * 로그인은 됐는데 `public.users` 행이 없거나 `consent_id`가 비어 있으면
 * 체크인이 `consent_required`로 거부됩니다. 이때 화면은 조용히 로그인된 척하면 안 됩니다 —
 * 칩에 표시를 달고, 팝오버에서 동의 화면(모달)으로 되돌려 보냅니다.
 */
export function AccountMenu() {
  const { session } = useSession();
  const { profile, isLoading, error } = useGuardianProfile();
  const { requestSignIn } = useAuthPrompt();

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const email = session?.user.email ?? null;
  const needsConsent = !isLoading && !error && !isOnboardingComplete(profile);

  // 아바타는 서버에 저장된 시드에서만 만들어집니다(사진 없음). 프로필을 못 읽었을 때는
  // 이메일을 시드로 써서 최소한 계정마다 다른 그림이 나오게 합니다.
  const avatar = useMemo(
    () => avatarFromSeed(profile?.avatar_seed ?? email ?? 'guardian'),
    [profile?.avatar_seed, email],
  );

  // 바깥 클릭·Escape로 닫습니다. 모달이 아니라 팝오버라 스크롤은 잠그지 않습니다.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const label = profile?.nickname ?? (needsConsent ? '가입 마무리' : '내 계정');

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`계정 메뉴 · ${label}`}
        className={`flex items-center gap-2 min-h-[44px] pl-1 pr-1 sm:pr-3 rounded-xl border transition-all shadow-sm ${
          needsConsent
            ? 'bg-amber-50 hover:bg-amber-100 border-amber-300'
            : 'bg-white hover:bg-emerald-50 border-emerald-200'
        }`}
      >
        <span
          className="relative w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-lg"
          style={{ background: `hsl(${avatar.hue} 45% 92%)` }}
          aria-hidden="true"
        >
          {avatar.emoji}
          {needsConsent ? (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center">
              !
            </span>
          ) : null}
        </span>
        <span className="hidden sm:inline max-w-[7rem] truncate text-xs sm:text-sm font-bold text-slate-700">
          {label}
        </span>
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute right-0 top-full mt-2 z-40 w-64 max-w-[calc(100vw-2rem)] drop-shadow-xl"
        >
          {needsConsent ? (
            <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 break-keep">
              <p className="font-bold mb-2">가입이 아직 끝나지 않았어요.</p>
              <p className="mb-2">
                보호자 동의를 마쳐야 미션·퀴즈 기록이 저장됩니다.
              </p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  requestSignIn('가입을 마무리하면 기록이 저장돼요.');
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition-all"
              >
                이어서 마무리하기
              </button>
            </div>
          ) : null}

          {error ? (
            <p className="mb-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 break-keep">
              가족 정보를 불러오지 못했어요. 통신이 돌아오면 다시 표시됩니다.
            </p>
          ) : null}

          <AccountBar nickname={profile?.nickname ?? null} email={email} />
        </div>
      ) : null}
    </div>
  );
}
