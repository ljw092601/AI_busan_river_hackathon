/**
 * 가입/로그인 흐름의 **순수 판정 로직**. React도 네트워크도 없습니다.
 *
 * 여기에 모은 이유는 하나입니다 — `signUp()`의 결과 해석이 이 트랙에서 가장 틀리기 쉬운 지점이고,
 * 그래서 반드시 테스트로 고정해 두어야 하기 때문입니다.
 */

import type { ConsentScope, ConsentScopeKey } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// 1. signUp 결과 해석 — ★ 이 트랙 최대의 순서 함정
// ─────────────────────────────────────────────────────────────────────────────

export type SignUpOutcome =
  /** 세션이 즉시 생겼습니다 (Supabase 대시보드에서 "Confirm email"이 **꺼진** 상태) */
  | 'session'
  /** 확인 메일을 보냈고 세션은 아직 없습니다 ("Confirm email"이 **켜진** 상태) */
  | 'confirm_email'
  /** 이미 가입된 이메일입니다 (Supabase가 사용자 열거 방지를 위해 성공처럼 응답한 경우) */
  | 'already_registered';

/** interpretSignUpResult가 필요로 하는 최소 형태 — 테스트에서 가짜 값을 넣기 위해 좁게 잡았습니다 */
export interface SignUpResultLike {
  user: { identities?: unknown[] | null } | null;
  session: unknown | null;
}

/**
 * `auth.signUp()`의 응답을 세 갈래로 해석합니다.
 *
 * ⚠️ **signUp 직후에 세션이 있다고 가정하면 안 됩니다.**
 *    같은 코드가 프로젝트 설정 하나(Authentication → Providers → Email → Confirm email)에 따라
 *    전혀 다르게 동작합니다. 켜져 있으면 `session === null`이고, 이때 곧바로
 *    `public.users`를 INSERT하려 들면 `auth.uid()`가 없어 RLS(users_insert_self)에 막힙니다.
 *    → 그래서 프로필 생성은 signUp 뒤가 아니라 **세션이 생긴 시점**(AuthGate)에서 합니다.
 *
 * ⚠️ 이미 가입된 이메일로 다시 가입하면 Supabase는 오류가 아니라 **가짜 user**를 돌려줍니다
 *    (`identities: []`). 사용자 열거(enumeration) 공격을 막기 위한 의도된 동작입니다.
 *    이걸 놓치면 "가입 성공!" 이라 말해놓고 로그인은 안 되는 최악의 안내가 됩니다.
 */
export function interpretSignUpResult(data: SignUpResultLike): SignUpOutcome {
  const identities = data.user?.identities;
  if (data.user && Array.isArray(identities) && identities.length === 0) {
    return 'already_registered';
  }
  return data.session ? 'session' : 'confirm_email';
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 입력 검증 — 서버에 다녀오기 전에 걸러 대기시간을 없앱니다
//    반환값은 한국어 안내 문자열, 통과면 null.
// ─────────────────────────────────────────────────────────────────────────────

/** 완벽한 이메일 정규식은 존재하지 않습니다. 오탈자만 잡고 최종 판정은 서버에 맡깁니다. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(raw: string): string | null {
  const email = raw.trim();
  if (!email) return '이메일 주소를 입력해 주세요.';
  if (!EMAIL_RE.test(email)) return 'parent@example.com 처럼 @와 도메인이 모두 있어야 해요.';
  return null;
}

/**
 * 최소 8자.
 * Supabase 기본값은 6자지만 한 자리 더 올려 잡았습니다 — 공공 시범사업 계정이고,
 * 서버 정책이 6자여도 클라이언트가 더 엄격한 건 언제나 안전한 방향입니다.
 */
export const PASSWORD_MIN_LENGTH = 8;

export function validatePassword(raw: string): string | null {
  if (!raw) return '비밀번호를 입력해 주세요.';
  if (raw.length < PASSWORD_MIN_LENGTH) {
    return `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상으로 만들어 주세요.`;
  }
  return null;
}

/** DB CHECK 제약(char_length(nickname) between 1 and 20)과 같은 규칙 */
export const NICKNAME_MAX_LENGTH = 20;

export function validateNickname(raw: string): string | null {
  const nickname = raw.trim();
  if (!nickname) return '가족 별명을 지어 주세요. (예: 온천천탐험대)';
  if (nickname.length > NICKNAME_MAX_LENGTH) {
    return `별명은 ${NICKNAME_MAX_LENGTH}자까지 쓸 수 있어요.`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 동의 항목
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsentItem {
  key: ConsentScopeKey;
  label: string;
  /** 체크했을 때 **실제로 무슨 일이 일어나는지**. 스키마가 하지 않는 일을 쓰지 마세요. */
  detail: string;
  required: boolean;
  defaultChecked: boolean;
}

/**
 * 동의 항목 정의.
 *
 * ⚠️ 문구를 고칠 때 규칙: **스키마가 실제로 하는 일만 씁니다.**
 *    예를 들어 "언제든 삭제할 수 있어요"라고 쓰면 안 됩니다 —
 *    지금 클라이언트에는 계정 삭제 경로가 없고 consents에는 UPDATE 권한조차 없습니다.
 *    지킬 수 없는 약속은 동의서에서 가장 비싼 종류의 거짓말입니다.
 */
export const CONSENT_ITEMS: readonly ConsentItem[] = [
  {
    key: 'service',
    label: '서비스 이용과 최소 정보 처리에 동의합니다. (필수)',
    detail:
      '로그인용 이메일, 가족 별명, 방문 기록(어느 스팟을 언제 지났는지), 퀴즈·관찰·포인트 기록을 저장합니다.',
    required: true,
    defaultChecked: true,
  },
  {
    key: 'photo_upload',
    label: '사진 미션과 관찰 사진 업로드에 동의합니다. (선택)',
    detail:
      '업로드 전에 기기에서 촬영 위치(EXIF GPS)를 지우고 보냅니다. 사진은 기본 비공개이고 이 계정만 볼 수 있습니다.',
    required: false,
    defaultChecked: true,
  },
  {
    key: 'public_gallery',
    label: '검수를 통과한 사진의 공개 갤러리 게시에 동의합니다. (선택)',
    detail:
      '끄면 사진은 계속 비공개입니다. 켜도 운영자 검수를 통과한 사진만 공개되고, 인물이 담긴 사진은 반려·삭제됩니다.',
    required: false,
    defaultChecked: false,
  },
];

/** 체크박스 초기 상태. 배열 순서에 의존하지 않도록 정의에서 만들어 냅니다. */
export function defaultConsentSelection(): Record<ConsentScopeKey, boolean> {
  const out = {} as Record<ConsentScopeKey, boolean>;
  for (const item of CONSENT_ITEMS) out[item.key] = item.defaultChecked;
  return out;
}

/** 체크박스 상태 → consents.scope 로 저장할 값 */
export function buildConsentScope(selected: Partial<Record<ConsentScopeKey, boolean>>): ConsentScope {
  return {
    service: true, // 필수 항목이라 여기 도달했다는 것 자체가 동의를 뜻합니다
    photo_upload: selected.photo_upload === true,
    public_gallery: selected.public_gallery === true,
  };
}

/** 필수 항목이 모두 체크됐는가 */
export function isConsentComplete(selected: Partial<Record<ConsentScopeKey, boolean>>): boolean {
  return CONSENT_ITEMS.every((item) => !item.required || selected[item.key] === true);
}

/**
 * 온보딩이 **실제로** 끝났는가.
 *
 * `public.users` 행이 있는 것만으로는 부족합니다. `record_checkin()`은
 * users ⋈ consents 조인이 성립할 때만 체크인을 받아들이고(0010_store_coordinates.sql),
 * `consent_id`가 비어 있으면 `{ ok:false, reason:'consent_required' }`로 거부합니다.
 * 즉 "행은 있는데 동의가 없는" 계정은 로그인된 것처럼 보이면서 아무것도 저장되지 않습니다.
 * 그 상태를 미완료로 판정해 동의 화면으로 되돌리는 것이 이 함수의 일입니다.
 *
 * (`revoked_at`·`expires_at`까지는 여기서 판정하지 않습니다 — 클라이언트에는 consents
 *  SELECT 권한이 없어 읽을 수 없고, 앱 안에 철회 경로도 없습니다. 운영자가 철회한 계정은
 *  체크인 시점에 `consent_required`로 드러납니다.)
 */
export function isOnboardingComplete(
  profile: { consent_id: string | null } | null | undefined,
): boolean {
  return Boolean(profile?.consent_id);
}

/** 화면에 그대로 쓰는 "무엇을 받지 않는가" 목록 — PLAN.md §5.2의 집행이자 광고입니다. */
export const NOT_COLLECTED: readonly string[] = [
  '아이의 이름·나이·학교·연락처 — 입력란 자체가 없습니다',
  '보호자의 실명·생년월일·전화번호·주소',
  '위치 좌표 — 반경 안인지만 판정하고 즉시 버립니다. 지나간 스팟만 남습니다',
  '얼굴 사진 — 사진 미션은 풍경·생물·시설만 대상으로 만듭니다',
];
