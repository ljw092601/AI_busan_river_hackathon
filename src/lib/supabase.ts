import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * 브라우저용 Supabase 클라이언트 — 프로젝트에 **하나만** 존재해야 합니다.
 *
 * 왜 싱글턴인가: supabase-js 인스턴스는 각자 auth 상태와 토큰 갱신 타이머,
 * localStorage 구독을 들고 있습니다. 두 개를 만들면 세션이 갈라지고
 * 토큰 갱신이 서로를 덮어써 "가끔 로그아웃되는" 재현 어려운 버그가 됩니다.
 * 새 파일에서 createClient를 다시 부르지 말고 이 모듈을 import 하세요.
 *
 * 이 클라이언트는 **anon 키**를 씁니다 = 모든 요청에 RLS가 적용됩니다.
 * 즉 여기서 할 수 있는 일은 정확히 0006_rls.sql이 허용한 것뿐입니다.
 * 쓰기가 안 된다면 대개 버그가 아니라 설계입니다 — 아래 표를 먼저 보세요.
 *
 * ── 클라이언트가 직접 쓸 수 없는 것 (INSERT 정책도 GRANT도 없음) ──────────
 *   visits          체크인 위조 방지 — Edge Function이 record_checkin()으로만 생성
 *   points_ledger   포인트 위조 방지 — award_points()/트리거로만 생성 (append-only)
 *   dex_entries     도감 위조 방지 — grant_dex_entry()로만 생성
 * 이 셋은 "권한을 깜빡한 것"이 아니라 구조적으로 봉인한 것입니다. PLAN.md §4.2
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // 조용히 undefined로 두면 첫 쿼리에서 "Failed to fetch"만 뜨고 원인을 못 찾습니다.
  throw new Error(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없습니다.\n' +
      '.env.example을 복사해 .env.local을 만들고 값을 채운 뒤 dev 서버를 재시작하세요.\n' +
      '(Vite는 env를 시작 시점에 한 번만 읽습니다 — 재시작하지 않으면 반영되지 않습니다.)',
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // 보호자가 하루 코스를 도는 동안 앱이 백그라운드로 오래 내려가므로
    // 복귀 시 세션이 살아 있어야 합니다.
    detectSessionInUrl: true,
  },
});

/** 로그인한 사용자 id. 미로그인이면 null. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
