/**
 * 프로필 부트스트랩 — `auth.users`는 있는데 `public.users`가 없는 구간을 메웁니다.
 *
 * ## 왜 이 파일이 따로 있는가
 * `auth.signUp()`이 성공하면 `auth.users` 행은 생기지만 `public.users` 행은 **생기지 않습니다**.
 * 그 사이에 앱을 껐다 켜거나, 이메일 인증 대기 중이거나, 탭을 두 개 열었거나 하면
 * "로그인은 됐는데 프로필이 없는" 상태가 남습니다. 그래서 이 경로는 반드시
 * **여러 번 불러도 안전(idempotent)** 해야 합니다.
 *
 * ## RLS 함정 두 가지 (0006_rls.sql)
 *
 * ① **consents INSERT에 `.select()`를 붙이면 실패합니다.**
 *    `consents_select_linked` 정책은 "users.consent_id가 이 행을 가리킬 때"만 조회를 허용합니다.
 *    그런데 방금 만든 동의 행은 아직 아무도 가리키지 않습니다 — 닭과 달걀입니다.
 *    Postgres는 `INSERT ... RETURNING`의 반환 행에도 SELECT 정책을 적용하므로
 *    `.insert(...).select()`는 "권한 없음"으로 떨어집니다.
 *    → **id를 클라이언트에서 만들어 넣고 `.select()`를 붙이지 않습니다.**
 *      supabase-js는 `.select()`가 없으면 `Prefer: return=representation`을 보내지 않고,
 *      PostgREST도 RETURNING을 만들지 않으므로 정책 검사 자체가 일어나지 않습니다.
 *
 * ② users INSERT는 반대로 `.select()`가 안전합니다 — `users_select_self`가 `id = auth.uid()`라
 *    방금 넣은 본인 행이 그대로 보입니다.
 *
 * ## 주문 순서
 * consents 먼저, users 나중입니다. users.consent_id가 consents를 참조하기 때문입니다.
 * (FK 검사는 RLS를 우회하므로 이 순서에서 정책 문제는 없습니다.)
 *
 * ⚠️ users INSERT가 실패하면 방금 만든 consents 행이 고아로 남습니다.
 *    consents에는 식별정보가 없어(0003 주석) 위험이 낮아 감수했습니다. 정리는 운영 배치의 몫입니다.
 */

import type { Update } from '@/types/database';
import type {
  AuthClient,
  ConsentMethod,
  ConsentScope,
  GuardianProfile,
  GuardianProfileInput,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// 아바타 — 얼굴 사진을 쓰지 않기 위한 절차적 아바타 (PLAN.md §5.2-3)
// ─────────────────────────────────────────────────────────────────────────────

/** users.avatar_seed의 DB 기본값과 같은 모양(하이픈 없는 32자 hex)으로 만듭니다. */
export function randomAvatarSeed(): string {
  return newUuid().replace(/-/g, '');
}

const AVATAR_EMOJI = ['🦆', '🐟', '🪿', '🐸', '🦋', '🌾', '🪸', '🐢', '🦉', '🐝', '🍃', '🐌'] as const;

/** 시드 → 아바타 표현. 같은 시드는 언제나 같은 결과입니다(서버 저장은 시드뿐). */
export function avatarFromSeed(seed: string): { emoji: string; hue: number } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return {
    emoji: AVATAR_EMOJI[hash % AVATAR_EMOJI.length],
    hue: hash % 360,
  };
}

/**
 * UUID v4.
 * `crypto.randomUUID`는 보안 컨텍스트(https/localhost)에서만 있어서 폴백을 둡니다 —
 * 여기서 예외가 나면 가입 자체가 막히므로 조용히 실패할 곳이 아닙니다.
 */
export function newUuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 조회 / 생성
// ─────────────────────────────────────────────────────────────────────────────

/** 내 프로필 한 행. 없으면 null (아직 온보딩 전이라는 뜻이지 오류가 아닙니다). */
export async function fetchGuardianProfile(
  client: AuthClient,
  userId: string,
): Promise<GuardianProfile | null> {
  const { data, error } = await client.from('users').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

/** 동의 행을 만들고 그 id를 돌려줍니다. `.select()`를 붙이지 않는 이유는 파일 상단 ①번. */
async function insertConsent(
  client: AuthClient,
  scope: ConsentScope,
  method: ConsentMethod,
): Promise<string> {
  const id = newUuid();
  const { error } = await client.from('consents').insert({ id, method, scope });
  if (error) throw error;
  return id;
}

export interface EnsureProfileResult {
  profile: GuardianProfile;
  /** users 행을 이번에 새로 만들었는가 */
  created: boolean;
  /** consents 행을 이번에 새로 만들었는가 */
  consentCreated: boolean;
}

/**
 * 로그인된 보호자에게 `public.users` 행과 `consents` 행이 있도록 보장합니다.
 *
 * 몇 번을 호출해도 안전합니다. 네 가지 상태를 모두 다룹니다:
 *   (a) 아무것도 없음        → 동의 생성 + 프로필 생성
 *   (b) 프로필은 있고 동의 없음 → 동의 생성 + 연결 (가입 중간에 끊긴 경우)
 *   (c) 둘 다 있음            → 아무것도 하지 않고 그대로 반환 ★ 덮어쓰지 않습니다
 *   (d) 다른 탭이 방금 만듦   → INSERT가 23505로 실패 → 다시 읽어서 반환
 *
 * (c)에서 덮어쓰지 않는 이유: 이 함수는 "온보딩 저장" 겸 "복구"로 쓰이는데,
 * 복구 호출이 기존 별명·학년대역을 초기화하면 조용한 데이터 손실이 됩니다.
 * 프로필 수정은 별도 경로(updateGuardianProfile)로 명시적으로만 합니다.
 *
 * ⚠️ expert_program은 절대 넣지 않습니다. 저서생물 카드 해금 플래그이고,
 *    전문가 동반 프로그램 참가가 확정됐을 때 운영자(service_role)만 부여합니다. PLAN.md §7.6-4
 */
export async function ensureGuardianProfile(
  client: AuthClient,
  userId: string,
  input: GuardianProfileInput,
): Promise<EnsureProfileResult> {
  const method: ConsentMethod = input.method ?? 'in_app';
  const nickname = input.nickname.trim();

  const existing = await fetchGuardianProfile(client, userId);

  // (c) 이미 완성된 계정 — 손대지 않습니다.
  if (existing?.consent_id) {
    return { profile: existing, created: false, consentCreated: false };
  }

  // (b) 프로필은 있는데 동의만 빠진 상태 — 동의를 만들어 연결합니다.
  if (existing) {
    const consentId = await insertConsent(client, input.scope, method);
    const { data, error } = await client
      .from('users')
      .update({
        consent_id: consentId,
        nickname,
        grade_band: input.gradeBand,
      })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return { profile: data, created: false, consentCreated: true };
  }

  // (a) 처음부터 — 동의 → 프로필 순서.
  const consentId = await insertConsent(client, input.scope, method);
  const { data, error } = await client
    .from('users')
    .insert({
      id: userId,
      nickname,
      grade_band: input.gradeBand,
      consent_id: consentId,
      avatar_seed: input.avatarSeed ?? randomAvatarSeed(),
    })
    .select()
    .single();

  if (error) {
    // (d) 그 사이 다른 탭이 만들었습니다. 경합은 오류가 아니라 정상 경로입니다.
    if (isDuplicateKey(error)) {
      const raced = await fetchGuardianProfile(client, userId);
      if (raced) return { profile: raced, created: false, consentCreated: true };
    }
    throw error;
  }

  return { profile: data, created: true, consentCreated: true };
}

/** 온보딩 이후의 명시적 프로필 수정 (별명·학년대역·아바타). 동의는 건드리지 않습니다. */
export async function updateGuardianProfile(
  client: AuthClient,
  userId: string,
  patch: { nickname?: string; gradeBand?: GuardianProfileInput['gradeBand']; avatarSeed?: string },
): Promise<GuardianProfile> {
  const row: Update<'users'> = {};
  if (patch.nickname !== undefined) row.nickname = patch.nickname.trim();
  if (patch.gradeBand !== undefined) row.grade_band = patch.gradeBand;
  if (patch.avatarSeed !== undefined) row.avatar_seed = patch.avatarSeed;

  const { data, error } = await client.from('users').update(row).eq('id', userId).select().single();
  if (error) throw error;
  return data;
}

/** Postgres 23505(unique_violation). PostgREST는 code를 문자열로 실어 보냅니다. */
export function isDuplicateKey(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === '23505';
}
