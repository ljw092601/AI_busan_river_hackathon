-- ============================================================================
-- 0012_expert_program_lockdown.sql — expert_program 자가 승격 차단 (두 경로 모두)
--
-- 계기: 실제 클라이언트로 돌린 E2E 테스트에서 **승격이 성공했습니다.**
--       0011의 윤리 필터를 그대로 무력화하는 경로였습니다.
--
-- 구멍이 둘이었습니다.
--   ① INSERT  users_insert_self 정책이 id만 검사 → 최초 프로필 생성 요청에
--             expert_program: true 를 끼워 넣으면 통과.
--   ② UPDATE  트리거는 있었지만 **한 번도 동작하지 않았습니다.**
-- ============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- ① INSERT 경로 — 정책으로 막습니다.
--
-- 트리거를 insert까지 넓히지 않는 이유: 트리거는 service_role에도 발화하므로
-- 운영자가 참가자를 전문가 프로그램에 등록하는 정상 경로까지 막힙니다.
-- RLS 정책은 service_role이 우회하므로 "클라이언트는 못 켜고 운영자는 켤 수 있다"가
-- 정확히 표현됩니다.
--
-- 값을 조용히 false로 바꾸지 않고 거부시키는 것도 의도입니다 —
-- 조용한 교정은 공격자에게도 실수한 개발자에게도 아무것도 알려주지 않습니다.
-- ---------------------------------------------------------------------------
drop policy if exists users_insert_self on public.users;

create policy users_insert_self on public.users
  for insert to authenticated
  with check (
    id = (select auth.uid())
    and expert_program = false
  );

-- ---------------------------------------------------------------------------
-- ② UPDATE 경로 — 트리거가 왜 동작하지 않았나
--
-- 함수가 SECURITY DEFINER인데 본문에서 current_user로 호출자를 판정했습니다.
-- SECURITY DEFINER는 실행 주체를 **함수 소유자**로 바꿉니다. 즉 함수 안에서
-- current_user는 언제나 소유자(postgres)이고, 조건
--     current_user not in ('postgres', 'service_role', 'supabase_admin')
-- 은 **항상 거짓**이 되어 승격이 그대로 통과했습니다.
--
-- 트리거는 정상적으로 발화했습니다. 아무것도 막지 않았을 뿐입니다.
-- 문법 오류도, 예외도, 로그도 없습니다 — 스키마를 읽으면 "보호되고 있다"고 보이고
-- 실행해 봐야만 아니라는 걸 알 수 있습니다.
--
-- ★ 교훈: SECURITY DEFINER 함수 안에서 호출자를 알고 싶다면 current_user는 답이
--   아닙니다. auth.uid()/auth.jwt()로 요청 컨텍스트에서 읽거나, 정의자 권한이
--   필요 없으면 INVOKER로 두세요. 이 함수는 NEW를 손볼 뿐이라 INVOKER면 충분합니다.
--     PostgREST 로그인 사용자 → 'authenticated'  → 차단
--     Edge Function/운영자     → 'service_role'   → 허용
--     직접 접속/마이그레이션    → 'postgres'      → 허용
-- ---------------------------------------------------------------------------
create or replace function public.tg_users_protect_expert_program()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.expert_program is distinct from old.expert_program
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception '전문가 프로그램 참여 여부는 직접 변경할 수 없습니다.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.tg_users_protect_expert_program() is
  '전문가 동반 프로그램 플래그의 자가 승격을 막습니다. 운영자(service_role)만 부여합니다. PLAN.md §7.6-4
   ⚠ SECURITY INVOKER여야 합니다 — DEFINER면 current_user가 소유자로 고정되어 판정이 무력화됩니다.';

comment on table public.users is
  '보호자(성인) 계정 프로필. 아동 개인정보 컬럼은 두지 않습니다 — 누락이 아니라 설계입니다. PLAN.md §5.1
   ⚠ expert_program은 클라이언트가 켤 수 없습니다:
       INSERT → users_insert_self 정책의 expert_program = false
       UPDATE → users_protect_expert_program 트리거
     두 경로를 모두 막아야 합니다. 한쪽만 막으면 다른 쪽으로 우회됩니다.';
