import { useEffect, useRef } from 'react';
import { useBackdropClose, useModalBehavior } from '@/features/rivers/useModalBehavior';
import { AuthGate } from './AuthGate';
import s from './auth.module.css';

/**
 * 홈 화면 위에 얹는 로그인·가입·동의 모달.
 *
 * ## 상태 기계는 새로 쓰지 않았습니다
 * 로그인/가입/동의/완료의 분기는 이미 `AuthGate`에 있고, 그 분기는
 * "이메일 확인이 켜졌든 꺼졌든 같은 코드"라는 성질(AuthGate 주석) 때문에 가치가 있습니다.
 * 같은 판단을 모달에 한 벌 더 쓰면 두 곳이 갈라지는 건 시간 문제입니다.
 * 그래서 이 파일은 **껍데기(백드롭·닫기·스크롤 잠금)만** 만들고 본문은 게이트에 맡깁니다.
 *
 * ```
 * 세션 없음                    → SignInScreen  (로그인 ⇄ 가입 토글, 가입 후 메일 확인 안내 포함)
 * 세션 있음 · users 행 없음      → ConsentScreen ★ 가입하다 끊긴 계정도 여기로 되돌아옵니다
 * 세션 있음 · consent_id 없음    → ConsentScreen ★ 이게 없으면 record_checkin이 거부합니다
 * 세션 있음 · 프로필 조회 실패    → 재시도 / 로그아웃 (온보딩으로 보내 덮어쓰지 않습니다)
 * 세션 있음 · 프로필 완성        → children = AuthComplete → 모달을 닫고 원래 화면 그대로
 * ```
 *
 * ## 닫힘 처리
 * Escape·백드롭·스크롤 잠금은 미션 모달과 **같은 훅**을 씁니다
 * (`@/features/rivers/useModalBehavior`). 홈에서 모달이 두 종류인데 닫는 방법이
 * 서로 다르면 그것만으로 버그처럼 느껴집니다.
 */

export interface AuthModalProps {
  onClose: () => void;
  /** "왜 지금 로그인인가" 한 줄. 미션·퀴즈 등 호출한 쪽의 맥락을 그대로 보여줍니다. */
  reason?: string | null;
}

export function AuthModal({ onClose, reason }: AuthModalProps) {
  useModalBehavior(onClose);
  const backdrop = useBackdropClose(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);

  // 열리자마자 초점을 안으로 들여놓습니다. 그렇지 않으면 Tab이 뒤 페이지를 훑습니다.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto"
      {...backdrop}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="보호자 로그인"
        className="relative bg-white w-full max-w-md min-h-full sm:min-h-0 sm:max-h-[90vh] sm:rounded-3xl shadow-2xl overflow-y-auto outline-none"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="로그인 창 닫기"
          className="absolute top-2 right-2 w-11 h-11 z-10 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center text-lg transition-all"
        >
          ✕
        </button>

        {reason ? (
          // pr-12는 오른쪽 위 닫기 버튼(44px)과 글자가 겹치지 않게 비워 둔 자리입니다.
          <div className="px-5 pr-12 pt-5 sm:px-6 sm:pr-14">
            <div className={`${s.alert} ${s.alertInfo}`} role="status">
              <span className={s.alertIcon} aria-hidden="true">
                💾
              </span>
              <div className={s.alertBody}>
                <p className={s.alertTitle}>{reason}</p>
              </div>
            </div>
          </div>
        ) : null}

        <AuthGate loadingFallback="잠깐만요…">
          <AuthComplete onDone={onClose} />
        </AuthGate>
      </div>
    </div>
  );
}

/**
 * 게이트를 통과했다 = 세션도 프로필도 동의도 갖춰졌다는 뜻입니다.
 * 축하 화면을 따로 두지 않고 곧바로 닫습니다 — 보호자가 원했던 것은 로그인이 아니라
 * **하던 일을 계속하는 것**이고, 헤더에 별명이 뜨는 것으로 이미 확인이 됩니다.
 */
function AuthComplete({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    onDone();
  }, [onDone]);

  return (
    <div className={s.pending} role="status" aria-live="polite">
      준비됐어요! 이제 기록이 저장됩니다.
    </div>
  );
}
