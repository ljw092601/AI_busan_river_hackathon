/**
 * 오류 번역기 — Supabase의 영어 오류를 **보호자가 읽고 다음 행동을 할 수 있는 한국어**로 바꿉니다.
 *
 * 왜 별도 모듈인가: "Invalid login credentials"를 그대로 띄우면 비개발자 보호자는
 * 무엇을 잘못했는지도, 다음에 뭘 눌러야 하는지도 알 수 없습니다. 하천변에서 아이가 기다리는
 * 상황이라 "다시 시도" 이상의 구체적 지시가 없으면 그대로 이탈합니다.
 *
 * 설계 규칙 세 가지:
 *   ① message는 **무슨 일이 일어났는지** 한 줄. 비난하지 않습니다.
 *   ② hint는 **다음에 무엇을 누를지**. 없으면 넣지 않습니다(빈 위로는 도움이 안 됩니다).
 *   ③ 원문(detail)은 kind='unknown'일 때만 남깁니다 — 번역 못 한 케이스를 제보받기 위해서입니다.
 *      번역에 성공한 오류에 원문을 같이 띄우면 애써 번역한 의미가 없습니다.
 *
 * 이 파일은 순수 함수만 있습니다(네트워크·React 없음). 테스트는 errors.test.ts.
 */

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'user_already_exists'
  | 'weak_password'
  | 'invalid_email'
  | 'rate_limited'
  | 'signup_disabled'
  | 'network'
  | 'permission'
  | 'duplicate'
  | 'constraint'
  | 'unknown';

export interface FriendlyError {
  kind: AuthErrorKind;
  /** 무슨 일이 일어났는가 (한 줄) */
  message: string;
  /** 다음에 무엇을 하면 되는가 */
  hint?: string;
  /** 번역하지 못한 원문 — kind='unknown'일 때만 채웁니다 */
  detail?: string;
}

/** supabase-js의 AuthError / PostgrestError를 둘 다 받기 위한 최소 구조 */
interface ErrorLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  name?: unknown;
}

function asErrorLike(err: unknown): ErrorLike {
  return typeof err === 'object' && err !== null ? (err as ErrorLike) : {};
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

const TABLE: Record<Exclude<AuthErrorKind, 'unknown'>, Omit<FriendlyError, 'kind' | 'detail'>> = {
  invalid_credentials: {
    message: '이메일 또는 비밀번호가 맞지 않아요.',
    hint: '대소문자와 앞뒤 공백을 확인해 주세요. 이 앱이 처음이시라면 아래 "가입하기"로 계정을 먼저 만들어 주세요.',
  },
  email_not_confirmed: {
    message: '아직 이메일 인증이 끝나지 않았어요.',
    hint: '가입할 때 받은 메일의 링크를 누른 뒤 다시 로그인해 주세요. 메일이 안 보이면 스팸함도 확인해 주세요.',
  },
  user_already_exists: {
    message: '이미 가입된 이메일이에요.',
    hint: '"로그인"으로 바꿔서 같은 이메일로 들어와 주세요.',
  },
  weak_password: {
    message: '비밀번호가 너무 짧거나 단순해요.',
    hint: '영문과 숫자를 섞어 8자 이상으로 만들어 주세요.',
  },
  invalid_email: {
    message: '이메일 주소 형식을 다시 확인해 주세요.',
    hint: 'parent@example.com 처럼 @와 도메인이 모두 있어야 해요.',
  },
  rate_limited: {
    message: '짧은 시간에 너무 여러 번 시도했어요.',
    hint: '1분쯤 기다렸다가 다시 눌러 주세요.',
  },
  signup_disabled: {
    message: '지금은 새 가입을 받고 있지 않아요.',
    hint: '이미 계정이 있다면 로그인해 주세요. 처음이시라면 운영자에게 문의해 주세요.',
  },
  network: {
    message: '인터넷 연결이 불안정해요.',
    hint: '하천 근처는 신호가 약할 수 있어요. 잠시 뒤 다시 시도하거나 데이터를 켜고 눌러 주세요.',
  },
  permission: {
    message: '계정 정보를 저장할 권한이 없어요.',
    hint: '로그아웃한 뒤 다시 로그인해 주세요. 그래도 안 되면 운영자에게 알려주세요.',
  },
  duplicate: {
    message: '이미 만들어진 계정 정보예요.',
    hint: '그대로 진행하셔도 됩니다. 화면이 멈춰 있으면 새로고침해 주세요.',
  },
  constraint: {
    message: '입력한 값이 규칙에 맞지 않아요.',
    hint: '별명은 1~20자로 지어 주세요.',
  },
};

function build(kind: Exclude<AuthErrorKind, 'unknown'>): FriendlyError {
  return { kind, ...TABLE[kind] };
}

/**
 * Supabase 오류(Auth / PostgREST) 또는 임의의 throw 값을 한국어 안내로 번역합니다.
 *
 * 판정 순서: 코드 → HTTP 상태 → 메시지 문구.
 * 코드를 먼저 보는 이유는 supabase-js가 버전에 따라 문구를 바꾸기 때문입니다.
 * 문구 매칭만 하면 라이브러리 업데이트 한 번에 모든 번역이 조용히 'unknown'으로 떨어집니다.
 */
export function describeError(err: unknown): FriendlyError {
  const e = asErrorLike(err);
  const code = str(e.code).toLowerCase();
  const message = str(e.message);
  const lower = message.toLowerCase();
  const status = typeof e.status === 'number' ? e.status : undefined;

  // ── 1. Postgres / PostgREST 오류 코드 (프로필·동의 INSERT 경로) ──────────
  if (code === '23505') return build('duplicate');
  if (code === '23514' || code === '23502') return build('constraint');
  if (code === '42501' || code === '42p01' || code.startsWith('pgrst')) return build('permission');
  // RLS 위반은 PostgREST가 401/403으로 내려주기도 합니다.
  if (status === 401 || status === 403) {
    if (!lower.includes('credential')) return build('permission');
  }

  // ── 2. supabase-js AuthError 코드 (2.x는 error.code를 제공합니다) ─────────
  switch (code) {
    case 'invalid_credentials':
      return build('invalid_credentials');
    case 'email_not_confirmed':
    case 'phone_not_confirmed':
      return build('email_not_confirmed');
    case 'user_already_exists':
    case 'email_exists':
      return build('user_already_exists');
    case 'weak_password':
      return build('weak_password');
    case 'validation_failed':
      return build('invalid_email');
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
    case 'over_sms_send_rate_limit':
      return build('rate_limited');
    case 'signup_disabled':
    case 'email_provider_disabled':
      return build('signup_disabled');
    default:
      break;
  }

  // ── 3. HTTP 상태 ──────────────────────────────────────────────────────────
  if (status === 429) return build('rate_limited');

  // ── 4. 문구 매칭 (코드가 없는 구버전·엣지 케이스 대비) ────────────────────
  if (lower.includes('invalid login credentials')) return build('invalid_credentials');
  if (lower.includes('email not confirmed')) return build('email_not_confirmed');
  if (lower.includes('already registered') || lower.includes('user already registered')) {
    return build('user_already_exists');
  }
  if (lower.includes('password should be') || lower.includes('password is too weak')) {
    return build('weak_password');
  }
  if (lower.includes('unable to validate email') || lower.includes('invalid email')) {
    return build('invalid_email');
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) return build('rate_limited');
  if (lower.includes('signups not allowed') || lower.includes('signup is disabled')) {
    return build('signup_disabled');
  }

  // fetch 실패는 TypeError로 옵니다 — 하천변에서 가장 흔한 경로라 반드시 잡습니다.
  if (
    str(e.name) === 'TypeError' ||
    str(e.name) === 'AuthRetryableFetchError' ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed')
  ) {
    return build('network');
  }

  return {
    kind: 'unknown',
    message: '문제가 생겨서 진행하지 못했어요.',
    hint: '잠시 뒤 다시 시도해 주세요. 계속 같은 화면이 나오면 아래 내용을 운영자에게 알려주세요.',
    detail: message || String(err),
  };
}
