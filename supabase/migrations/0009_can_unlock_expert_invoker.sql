-- ============================================================================
-- 0009_can_unlock_expert_invoker.sql
--
-- 계기: Supabase database linter 잔여 경고 1건
--       (0029_authenticated_security_definer_function_executable)
--
-- can_unlock_expert를 SECURITY DEFINER → SECURITY INVOKER로 전환합니다.
--
-- ── 무엇이 문제였나 ──────────────────────────────────────────────────────
-- DEFINER면 RLS를 우회해 users를 읽습니다. 그런데 이 함수는 uuid를 인자로 받으므로,
-- 로그인한 누구나 임의의 uuid를 넣어 "그 계정이 전문가 프로그램에 참여 중인가"를
-- 알아낼 수 있었습니다. 사소해 보이지만 남의 계정 상태가 새는 것은 맞습니다.
--
-- ── INVOKER로 바꾸면 ────────────────────────────────────────────────────
-- users의 RLS(users_select_self)가 그대로 적용됩니다.
--   본인 id → 자기 행이 보이므로 정상 판정
--   남의 id → 행이 안 보여 NULL → coalesce로 false
-- 의도한 동작은 유지되고 남의 상태는 알 수 없게 됩니다.
--
-- ⚠ 이 함수를 SECURITY DEFINER 함수 안에서 호출하면 의미가 달라집니다.
--   서버측에서 다른 계정의 해금 여부를 판정해야 한다면 users를 직접 조회하세요.
-- ============================================================================

set search_path = public, extensions;

create or replace function public.can_unlock_expert(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce((select u.expert_program from public.users u where u.id = p_user_id), false);
$$;

comment on function public.can_unlock_expert(uuid) is
  '저서생물(ethics_flag=expert_only) 카드 해금 가능 여부. PLAN.md §7.6-4
   SECURITY INVOKER — users의 RLS가 적용되어 본인 것만 판정할 수 있습니다.
   ⚠ 조회 함수일 뿐 하드 제약은 아닙니다. 앱/Edge Function에서 관찰 등록 전에 확인하세요.
   ⚠ users.expert_program은 보호자가 스스로 켤 수 없습니다 — users_protect_expert_program 트리거가 막습니다.';

-- create or replace가 권한을 초기화하므로 다시 걸어줍니다.
revoke execute on function public.can_unlock_expert(uuid) from public, anon;
grant  execute on function public.can_unlock_expert(uuid) to authenticated, service_role;
