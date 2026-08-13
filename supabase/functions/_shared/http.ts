/**
 * Edge Function 공통 HTTP 유틸 — CORS · JSON 응답 · 요청 파싱
 *
 * PWA(브라우저)가 직접 호출하므로 CORS는 필수입니다.
 * 쿠키를 쓰지 않고 Authorization 헤더만 쓰므로 `*` 오리진으로 충분합니다
 * (credentials를 쓰는 순간 `*`가 불가능해지므로, 그 방향으로 바꾸지 마세요).
 */

export const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers':
    'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
};

/** OPTIONS 프리플라이트면 응답을 돌려주고, 아니면 null */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response('ok', { headers: CORS_HEADERS });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json; charset=utf-8' },
  });
}

/** 실패 응답 (형태를 한 곳에 모아둡니다) */
export function errorJson(code: string, message: string, status: number): Response {
  return json({ ok: false, reason: code, message }, status);
}

/**
 * Authorization: Bearer <token> 에서 토큰만 꺼냅니다.
 *
 * ⚠ 반환값을 로그에 찍지 마세요. 사용자 JWT는 그 자체로 자격증명입니다.
 */
export function bearerToken(req: Request): string | null {
  const raw = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match ? match[1].trim() : null;
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    // 값이 아니라 이름만 남깁니다.
    throw new Error(`필수 환경변수가 없습니다: ${name}`);
  }
  return value;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
