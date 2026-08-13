import { useMemo, useState, type FormEvent } from 'react';
import { ErrorNotice } from './ErrorNotice';
import {
  CONSENT_ITEMS,
  NICKNAME_MAX_LENGTH,
  NOT_COLLECTED,
  buildConsentScope,
  defaultConsentSelection,
  isConsentComplete,
  validateNickname,
} from './flow';
import { avatarFromSeed, randomAvatarSeed } from './profile';
import { useCompleteOnboarding, useSignOut } from './useAuth';
import type { ConsentScopeKey, GradeBand } from './types';
import s from './auth.module.css';

/**
 * 최초 1회 온보딩 — 보호자 본인 동의 + 가족 프로필 생성.
 *
 * 로그인은 됐지만 `public.users` 행이 없는 상태에서 나타납니다.
 * 가입 직후일 수도 있고, 이메일 인증을 마치고 처음 들어온 것일 수도 있고,
 * 예전에 가입하다 중간에 끊긴 것일 수도 있습니다 — 셋 다 여기로 옵니다.
 *
 * ## 동의 문구를 쓸 때의 규칙
 * **스키마가 실제로 하는 일만 씁니다.** 아래 목록은 마케팅 문구가 아니라
 * 0003_core_tables.sql · 0006_rls.sql이 강제하는 사실의 요약입니다.
 * 예를 들어 "언제든 계정을 지울 수 있어요"는 쓰지 않았습니다 —
 * 지금 클라이언트에는 계정 삭제 경로가 없고, consents에는 UPDATE 권한조차 없어
 * 앱 안에서 동의를 철회할 방법이 없기 때문입니다. 그 사실을 그대로 적었습니다.
 */

export interface ConsentScreenProps {
  /** 온보딩이 끝난 뒤 호출됩니다. (AuthGate는 프로필 캐시 변화로 알아서 다시 그립니다) */
  onCompleted?: () => void;
}

const GRADE_BAND_OPTIONS: { value: GradeBand | null; label: string }[] = [
  { value: 'g3_4', label: '3~4학년' },
  { value: 'g5_6', label: '5~6학년' },
  { value: null, label: '나중에' },
];

export function ConsentScreen({ onCompleted }: ConsentScreenProps) {
  const [nickname, setNickname] = useState('');
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [gradeBand, setGradeBand] = useState<GradeBand | null>(null);
  const [avatarSeed, setAvatarSeed] = useState(() => randomAvatarSeed());
  const [checked, setChecked] = useState<Record<ConsentScopeKey, boolean>>(defaultConsentSelection);
  const [consentError, setConsentError] = useState<string | null>(null);

  const onboarding = useCompleteOnboarding();
  const signOut = useSignOut();

  const avatar = useMemo(() => avatarFromSeed(avatarSeed), [avatarSeed]);

  function toggle(key: ConsentScopeKey) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
    setConsentError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const nErr = validateNickname(nickname);
    setNicknameError(nErr);

    const consentOk = isConsentComplete(checked);
    setConsentError(consentOk ? null : '필수 항목에 동의해야 시작할 수 있어요.');
    if (nErr || !consentOk) return;

    const result = await onboarding.complete({
      nickname,
      gradeBand,
      avatarSeed,
      scope: buildConsentScope(checked),
      method: 'in_app', // 보호자 본인이 앱에서 직접 동의 (PLAN.md §5.1)
    });

    if (result) onCompleted?.();
  }

  return (
    <div className={s.screen}>
      <h1 className={s.brand}>시작하기 전에</h1>
      <p className={s.lede}>
        이 앱은 <strong>보호자 본인(성인)</strong>이 동의합니다. 한 계정이 곧 한 가족이고,
        도감도 가족이 하나를 함께 채웁니다.
      </p>

      <form className={s.card} onSubmit={handleSubmit} noValidate>
        {/* ── 별명 + 아바타 ───────────────────────────────────────────── */}
        <div className={s.form}>
          <div className={s.field}>
            <label className={s.label} htmlFor="onboarding-nickname">
              우리 가족 별명
            </label>
            <div className={s.avatarRow}>
              <span
                className={s.avatar}
                style={{ background: `hsl(${avatar.hue} 45% 92%)` }}
                aria-hidden="true"
              >
                {avatar.emoji}
              </span>
              <input
                id="onboarding-nickname"
                className={s.input}
                type="text"
                value={nickname}
                maxLength={NICKNAME_MAX_LENGTH}
                autoComplete="off"
                placeholder="예: 온천천탐험대"
                aria-invalid={nicknameError ? true : undefined}
                aria-describedby={nicknameError ? 'onboarding-nickname-error' : 'onboarding-nickname-help'}
                onChange={(e) => setNickname(e.target.value)}
                disabled={onboarding.isPending}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                className={s.secondary}
                onClick={() => setAvatarSeed(randomAvatarSeed())}
                disabled={onboarding.isPending}
              >
                아바타 바꾸기
              </button>
            </div>
            <p className={s.help} id="onboarding-nickname-help">
              실명 대신 쓰는 표시용 이름이에요. 아바타는 사진이 아니라 그림으로 만들어집니다.
            </p>
            {nicknameError ? (
              <p className={s.fieldError} id="onboarding-nickname-error">
                {nicknameError}
              </p>
            ) : null}
          </div>

          {/* ── 학년대역 (선택) ──────────────────────────────────────── */}
          <div className={s.field}>
            <span className={s.label} id="onboarding-band-label">
              함께 가는 아이의 학년
              <span className={s.optional}>선택 · 건너뛰어도 돼요</span>
            </span>
            <div className={s.bandRow} role="group" aria-labelledby="onboarding-band-label">
              {GRADE_BAND_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  className={s.band}
                  aria-pressed={gradeBand === opt.value}
                  onClick={() => setGradeBand(opt.value)}
                  disabled={onboarding.isPending}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className={s.help}>
              이야기와 퀴즈의 낱말 수준을 고르는 데만 씁니다. 고르지 않으면 3~4학년 기준으로 보여줘요.
              나이나 생일을 묻는 것이 아니고, 나중에 바꿀 수 있습니다.
            </p>
          </div>
        </div>

        {/* ── 무엇을 남기는가 / 남기지 않는가 ──────────────────────────── */}
        <section className={s.section}>
          <h2 className={s.sectionTitle}>이 앱이 남기는 것</h2>
          <ul className={s.factList}>
            <li>보호자 이메일과 비밀번호 (로그인용 · 비밀번호는 앱이 아니라 Supabase가 보관합니다)</li>
            <li>가족 별명과 아바타 그림 시드</li>
            <li>고르셨다면 아이 학년대역 (3~4 / 5~6 둘 중 하나)</li>
            <li>어느 스팟을 언제 지났는지, 퀴즈 응답, 도감 기록, 포인트 내역</li>
          </ul>
        </section>

        <section className={`${s.section} ${s.notCollected}`}>
          <h2 className={s.sectionTitle}>받지 않는 것</h2>
          <ul className={s.factList}>
            {NOT_COLLECTED.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        {/* ── 동의 항목 ────────────────────────────────────────────────── */}
        <section className={s.section}>
          <h2 className={s.sectionTitle}>동의 항목</h2>
          {CONSENT_ITEMS.map((item) => (
            <label
              key={item.key}
              className={`${s.consentItem} ${checked[item.key] ? s.consentChecked : ''}`}
            >
              <input
                type="checkbox"
                className={s.checkbox}
                checked={checked[item.key]}
                onChange={() => toggle(item.key)}
                disabled={onboarding.isPending}
              />
              <span>
                <span className={s.consentLabel}>{item.label}</span>
                <span className={s.consentDetail}>{item.detail}</span>
              </span>
            </label>
          ))}
          {consentError ? (
            <p className={s.fieldError} role="alert" style={{ marginTop: '0.625rem' }}>
              {consentError}
            </p>
          ) : null}
          <p className={s.help} style={{ marginTop: '0.75rem' }}>
            동의한 날짜와 항목만 기록에 남습니다. 서명 이미지나 신분 정보는 받지 않습니다.
            <br />
            지금은 앱 안에서 동의를 되돌리거나 계정을 직접 지울 수 없습니다 — 운영자에게 요청해 주세요.
          </p>
        </section>

        <div className={s.submitRow}>
          <ErrorNotice error={onboarding.error} />
          <button type="submit" className={s.primary} disabled={onboarding.isPending}>
            {onboarding.isPending ? '저장하는 중…' : '동의하고 시작하기'}
          </button>
          <button
            type="button"
            className={s.link}
            onClick={() => void signOut.signOut()}
            disabled={signOut.isPending}
          >
            다른 계정으로 로그인할게요
          </button>
        </div>
      </form>
    </div>
  );
}
