import { useState, type FormEvent } from 'react';
import { ErrorNotice } from './ErrorNotice';
import { PASSWORD_MIN_LENGTH, validateEmail, validatePassword } from './flow';
import { useSignIn, useSignUp } from './useAuth';
import s from './auth.module.css';

/**
 * 로그인 · 가입 화면 (이메일 + 비밀번호).
 *
 * ## 왜 매직링크가 아닌가
 * 이 프로젝트에는 아직 SMTP가 연결돼 있지 않습니다. Supabase 기본 메일 발송기는
 * 시간당 소수 건 제한이라 파일럿 인원을 감당하지 못하고, 무엇보다
 * "메일함을 열어야 시작되는" 흐름은 하천 입구에서 그대로 이탈로 이어집니다.
 * 비밀번호는 최소한 그 자리에서 다시 시도할 수 있습니다.
 * → SMTP를 붙이면 `signInWithOtp`로 바꾸고 이 화면의 비밀번호 필드만 걷어내면 됩니다.
 *
 * ## 화면이 말해야 하는 것
 * 계정 주체가 **보호자(어른)**라는 사실을 첫 줄에서 못박습니다.
 * 이걸 흐리면 아이가 자기 이메일로 가입하려 들고, v0.5에서 없앤 법정대리인 동의 층이
 * 통째로 되살아납니다 (PLAN.md §5.1).
 */

type Mode = 'signin' | 'signup';

export interface SignInScreenProps {
  /** 처음 보여줄 모드. 기본은 로그인입니다. */
  initialMode?: Mode;
}

export function SignInScreen({ initialMode = 'signin' }: SignInScreenProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const signIn = useSignIn();
  const signUp = useSignUp();

  const isPending = signIn.isPending || signUp.isPending;

  // "이미 가입된 이메일"은 가입 중에 났지만 로그인 모드로 옮겨간 뒤에도 보여야 합니다.
  // 모드 전환과 함께 사라지면 보호자는 아무 설명 없이 화면만 바뀐 것으로 봅니다.
  const carriedOver = signUp.outcome === 'already_registered' ? signUp.error : null;
  const serverError = mode === 'signin' ? (signIn.error ?? carriedOver) : signUp.error;

  // ★ 가입은 성공했지만 세션이 없는 상태 — 이메일 확인이 켜진 프로젝트의 정상 경로입니다.
  const awaitingConfirmation = mode === 'signup' && signUp.outcome === 'confirm_email';

  function switchMode(next: Mode) {
    setMode(next);
    setEmailError(null);
    setPasswordError(null);
    signIn.reset();
    signUp.reset();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) return;

    if (mode === 'signin') {
      await signIn.signIn(email, password);
      // 성공하면 세션 변경이 AuthGate를 다시 그립니다 — 여기서 이동시키지 않습니다.
      return;
    }

    const outcome = await signUp.signUp(email, password);
    if (outcome === 'already_registered') {
      // 오류 안내는 이미 signUp.error에 담겨 있습니다. 이메일을 지우지 말고 모드만 바꿔둡니다.
      setMode('signin');
      setPassword('');
    }
  }

  if (awaitingConfirmation) {
    return (
      <div className={s.screen}>
        <h1 className={s.brand}>메일함을 확인해 주세요</h1>
        <div className={`${s.alert} ${s.alertInfo}`} role="status">
          <span className={s.alertIcon} aria-hidden="true">
            📬
          </span>
          <div className={s.alertBody}>
            <p className={s.alertTitle}>{email} 으로 확인 메일을 보냈어요.</p>
            <p className={s.alertHint}>
              메일 속 링크를 누르면 가입이 끝납니다. 그 다음 이 화면으로 돌아와 로그인해 주세요.
              몇 분이 지나도 안 오면 스팸함을 확인해 주세요.
            </p>
          </div>
        </div>
        <div className={s.switchRow}>
          <button type="button" className={s.link} onClick={() => switchMode('signin')}>
            인증을 마쳤어요 · 로그인하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.screen}>
      <h1 className={s.brand}>부산 하천 탐험대</h1>
      <p className={s.lede}>
        계정은 <strong>보호자(어른)</strong>가 만듭니다. 아이는 로그인 없이 함께 보고 고르면 돼요.
        <br />
        아이의 이름·나이·학교는 <strong>받지 않습니다.</strong>
      </p>

      <div className={s.card}>
        <form className={s.form} onSubmit={handleSubmit} noValidate>
          <div className={s.field}>
            <label className={s.label} htmlFor="auth-email">
              보호자 이메일
            </label>
            <input
              id="auth-email"
              className={s.input}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? 'auth-email-error' : undefined}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
            />
            {emailError ? (
              <p className={s.fieldError} id="auth-email-error">
                {emailError}
              </p>
            ) : null}
          </div>

          <div className={s.field}>
            <label className={s.label} htmlFor="auth-password">
              비밀번호
            </label>
            <input
              id="auth-password"
              className={s.input}
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={
                passwordError ? 'auth-password-error' : mode === 'signup' ? 'auth-password-help' : undefined
              }
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
            />
            {mode === 'signup' && !passwordError ? (
              <p className={s.help} id="auth-password-help">
                {PASSWORD_MIN_LENGTH}자 이상으로 만들어 주세요. 브라우저의 비밀번호 저장 기능을 쓰시면
                다음 나들이에서 다시 입력하지 않아도 됩니다.
              </p>
            ) : null}
            {passwordError ? (
              <p className={s.fieldError} id="auth-password-error">
                {passwordError}
              </p>
            ) : null}
          </div>

          <ErrorNotice error={serverError} />

          <button type="submit" className={s.primary} disabled={isPending}>
            {isPending ? '잠시만요…' : mode === 'signin' ? '로그인' : '가입하고 시작하기'}
          </button>
        </form>
      </div>

      <div className={s.switchRow}>
        {mode === 'signin' ? (
          <>
            <span>이 앱이 처음이신가요?</span>
            <button type="button" className={s.link} onClick={() => switchMode('signup')}>
              가입하기
            </button>
          </>
        ) : (
          <>
            <span>이미 계정이 있으신가요?</span>
            <button type="button" className={s.link} onClick={() => switchMode('signin')}>
              로그인
            </button>
          </>
        )}
      </div>
    </div>
  );
}
