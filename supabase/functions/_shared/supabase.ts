/**
 * Supabase 클라이언트 팩토리 + 호출자 신원 판정
 *
 * ─────────────────────────────────────────────────────────────
 * 왜 두 종류의 클라이언트가 필요한가
 *
 * ① service_role 클라이언트 — RLS를 우회합니다.
 *    0006_rls.sql §15에서 record_checkin / verify_checkin / award_points /
 *    grant_dex_entry의 EXECUTE를 service_role에게만 부여했습니다.
 *    즉 **이 Edge Function이 그 함수들의 유일한 정당한 호출자**입니다.
 *    ⛔ 이 클라이언트를 브라우저로 새어나가게 하는 코드를 절대 쓰지 마세요.
 *
 * ② 사용자 신원 확인 — 요청 본문의 user_id는 **절대** 믿지 않습니다.
 *    Authorization 헤더의 JWT를 Auth 서버에 검증시켜 얻은 sub만 씁니다.
 *    (본문의 user_id를 믿으면 남의 계정으로 포인트를 적립할 수 있습니다.)
 * ─────────────────────────────────────────────────────────────
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { bearerToken, requireEnv } from './http.ts';

/** RLS를 우회하는 마스터 클라이언트. 서버 안에서만 씁니다. */
export function serviceClient(): SupabaseClient {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { 'x-application-name': 'busan-river-edge' } },
    },
  );
}

export type Caller =
  /** 로그인한 보호자 계정 */
  | { kind: 'user'; userId: string }
  /** 운영자/워커가 service_role 키로 직접 호출 (배치 채점 경로) */
  | { kind: 'service' }
  | { kind: 'anonymous' };

/**
 * 호출자를 판정합니다.
 *
 * - service_role 키를 그대로 Bearer로 보낸 경우 → 'service'
 *   (운영 배치 워커 경로. 이 키를 아는 주체는 이미 DB 전권을 가지므로 추가 검증이 무의미합니다.)
 * - 그 외에는 Auth 서버로 JWT를 검증합니다. anon 키는 유효한 JWT지만 사용자가 아니므로 'anonymous'.
 */
export async function identifyCaller(
  req: Request,
  admin: SupabaseClient,
): Promise<Caller> {
  const token = bearerToken(req);
  if (!token) return { kind: 'anonymous' };

  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return { kind: 'service' };
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { kind: 'anonymous' };

  return { kind: 'user', userId: data.user.id };
}
