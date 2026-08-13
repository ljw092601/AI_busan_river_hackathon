-- ============================================================================
-- 0008_harden_function_grants.sql — 함수 실행 권한 조이기
--
-- 계기: Supabase database linter(security advisor) 지적 2종.
--
-- ── 왜 이 파일이 필요한가 ────────────────────────────────────────────────
-- Postgres는 함수를 만들면 **EXECUTE를 PUBLIC에 자동으로 부여**합니다.
-- 0006에서 체크인·적립 계열 4개만 명시적으로 REVOKE 했기 때문에,
-- 나머지 함수(특히 트리거 함수)는 기본 PUBLIC 권한이 그대로 남아 있었습니다.
--
-- Supabase에서 public 스키마의 함수는 PostgREST가 `/rest/v1/rpc/<함수명>`으로
-- 자동 노출합니다. 즉 **트리거 전용 함수가 HTTP 엔드포인트가 되어 있었습니다.**
--
-- 트리거 함수를 RPC로 직접 부르면 NEW/TG_OP가 없어 대부분 에러로 끝나지만,
-- SECURITY DEFINER라 정의자 권한으로 실행되는 표면을 열어둘 이유가 없습니다.
-- "공격이 성공하지 않는다"와 "공격 표면이 없다"는 다릅니다.
-- ============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1) 트리거 전용 함수 — 어떤 클라이언트 롤도 직접 호출할 수 없어야 합니다.
--    트리거는 소유자 권한으로 발화하므로 EXECUTE 권한과 무관하게 정상 동작합니다.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.tg_observations_grant_rewards(),
  public.tg_observation_logs_award(),
  public.tg_quiz_attempts_award(),
  public.tg_users_protect_expert_program(),
  public.set_updated_at(),
  public.forbid_mutation()
from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) can_unlock_expert — 로그인 사용자만. 익명에게 열어둘 이유가 없습니다.
--    (SECURITY DEFINER라 RLS를 우회해 users를 읽습니다. 남의 uuid를 넣으면
--     그 계정의 전문가 프로그램 참여 여부가 노출되므로 anon 차단이 맞습니다.)
-- ---------------------------------------------------------------------------
revoke execute on function public.can_unlock_expert(uuid) from public, anon;
grant  execute on function public.can_unlock_expert(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) 나머지 조회 함수도 PUBLIC 기본 권한을 걷고 필요한 롤에만 다시 부여합니다.
--    전부 SECURITY INVOKER라 RLS가 적용되지만, 기본 PUBLIC 권한을 방치하지 않습니다.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.point_balance(uuid),
  public.dex_summary_by_tier(uuid, uuid),
  public.tier_points(smallint)
from public, anon;

grant execute on function
  public.point_balance(uuid),
  public.dex_summary_by_tier(uuid, uuid),
  public.tier_points(smallint)
to authenticated, service_role;

-- 후보 목록은 미로그인 방문자도 봐야 합니다(QR로 들어와 코스를 둘러보는 경로, §3).
revoke execute on function public.spot_candidate_species(uuid, integer) from public;
grant  execute on function public.spot_candidate_species(uuid, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) tier_points의 search_path 고정
--    linter 지적: role mutable search_path.
--    이 함수는 테이블을 읽지 않아 실질 위험은 낮지만, 함수 본문 해석이
--    호출자의 search_path에 좌우되지 않도록 못박아 둡니다.
-- ---------------------------------------------------------------------------
create or replace function public.tier_points(p_tier smallint)
returns integer
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case p_tier
           when 1 then 20   -- ⭐    흔한 친구
           when 2 then 30   -- ⭐⭐   물이 맑아야 (2급수 지표)
           when 3 then 45   -- ⭐⭐⭐  아주 맑아야 (1급수 지표)
           when 4 then 60   -- ⭐⭐⭐⭐ 귀한 손님
           when 5 then 60   -- 🏅    특별 기록 (보호종)
           else 0
         end;
$$;

comment on function public.tier_points(smallint) is
  '도감 등급별 지급 포인트. src/types/domain.ts의 TIER_POINTS와 값이 일치해야 합니다 — 한쪽만 고치지 마세요.';

-- create or replace가 권한을 초기화하므로 다시 걸어줍니다.
revoke execute on function public.tier_points(smallint) from public, anon;
grant  execute on function public.tier_points(smallint) to authenticated, service_role;

-- ============================================================================
-- 남은 linter 경고에 대한 판단
--
-- ▸ record_checkin / verify_checkin / award_points / grant_dex_entry 는
--   0006에서 이미 service_role 전용입니다. Edge Function만 호출합니다.
--
-- ▸ 앞으로 함수를 추가할 때마다 EXECUTE가 PUBLIC에 자동 부여된다는 점을 기억하세요.
--   "만들었으니 됐다"가 아니라 "누가 부를 수 있는가"를 매번 명시해야 합니다.
-- ============================================================================
