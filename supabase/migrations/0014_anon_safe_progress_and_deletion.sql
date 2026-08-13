-- ============================================================================
-- 0014_anon_safe_progress_and_deletion.sql
--
-- 실제 클라이언트로 돌린 E2E에서 드러난 두 가지를 고칩니다.
-- ============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- ① river_progress 를 미로그인에서도 안전하게
--
-- INVOKER라 호출자 권한으로 quiz_attempts / river_missions / user_badges 를 읽는데,
-- anon 에는 이 테이블들에 대한 **테이블 GRANT 자체가 없습니다.**
-- Postgres는 GRANT를 RLS보다 먼저 보므로 "빈 결과"가 아니라
--   ERROR: permission denied for table quiz_attempts
-- 가 납니다. 0011의 spot_candidate_species에서 겪은 것과 정확히 같은 함정입니다.
--
-- 앱은 미로그인일 때 이 함수를 호출하지 않지만(queries.ts의 enabled: Boolean(userId)),
-- "조건 하나만 지우면 터지는" 상태로 두지 않습니다.
--
-- ★ current_user_is_expert()와 같은 패턴입니다: DEFINER지만 **인자가 없고**
--   신원을 auth.uid()에서만 얻으므로 남의 진행 상황을 물어볼 방법이 없습니다.
--   신원을 인자로 받는 DEFINER 함수(record_checkin)에서 사칭이 가능했던 것과 대비됩니다.
-- ---------------------------------------------------------------------------
drop function if exists public.river_progress();

create function public.river_progress()
returns table (
  river_id       uuid,
  has_mission    boolean,
  mission_done   boolean,
  quiz_total     integer,
  quiz_solved    integer,
  badge_earned   boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.id,
    r.mission_kind is not null,
    r.mission_kind is null
      or exists (select 1 from public.river_missions m
                  where m.river_id = r.id and m.user_id = auth.uid()),
    (select count(*)::integer from public.quizzes q
      join public.spots s on s.id = q.spot_id where s.river_id = r.id),
    (select count(distinct qa.quiz_id)::integer
       from public.quiz_attempts qa
       join public.quizzes q on q.id = qa.quiz_id
       join public.spots s on s.id = q.spot_id
      where s.river_id = r.id and qa.user_id = auth.uid() and qa.is_correct),
    exists (select 1 from public.user_badges ub
             join public.badges b on b.id = ub.badge_id
            where ub.user_id = auth.uid() and b.code = r.badge_code)
  from public.rivers r
  where r.is_active
  order by r.seq;
$$;

comment on function public.river_progress() is
  '호출자 본인의 하천별 진행 상황. 인자가 없어 남의 진행 상황을 조회할 수 없습니다.
   미로그인이면 auth.uid()가 null이라 전부 0/false로 나옵니다(에러가 아닙니다).
   ⚠ 하천마다 구성이 다릅니다 — 미션 없는 하천은 mission_done=true,
     퀴즈 0문항 하천은 quiz_total=0. **없는 단계는 통과로 봅니다.**
     클라이언트 isRiverComplete()(src/features/rivers/types.ts)와 규칙이 같아야 합니다.';

revoke execute on function public.river_progress() from public;
grant  execute on function public.river_progress() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- ② 계정 삭제를 가능하게 (개인정보 파기 요구 대응)
--
-- points_ledger의 append-only 트리거가 **계정 삭제까지 막고 있었습니다.**
-- auth.users를 지우면 FK cascade가 points_ledger DELETE를 시도하는데
-- 트리거가 예외를 던져 삭제 전체가 롤백됩니다. 실제로 테스트 계정을 지우지 못해
-- 트리거를 임시로 끄고 지워야 했습니다.
--
-- 개인정보 삭제·동의 철회 요구에 응할 수 없는 구조는 그대로 둘 수 없습니다.
-- 앱(authenticated)에 대해서는 append-only를 그대로 유지하고,
-- **service_role의 DELETE만** 허용합니다. UPDATE는 여전히 누구에게도 허용하지 않습니다.
--   · 위조 방지 목적은 그대로 — 클라이언트는 원장을 건드릴 수 없습니다.
--   · 파기는 운영자 권한으로만 가능합니다.
-- ---------------------------------------------------------------------------
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and current_user in ('postgres', 'service_role', 'supabase_admin') then
    return old;
  end if;

  raise exception
    '% 테이블은 append-only입니다. 수정·삭제 대신 반대 부호의 보정 행을 추가하세요.',
    tg_table_name
    using errcode = '42501';
end;
$$;

comment on function public.forbid_mutation() is
  'UPDATE/DELETE를 차단하는 트리거 함수. points_ledger 등 원장 테이블 전용.
   ⚠ SECURITY DEFINER로 만들지 마세요 — DEFINER면 current_user가 소유자로 고정되어
     "운영자만 삭제 허용" 판정이 언제나 참이 됩니다(0012에서 같은 실수를 겪었습니다).
   예외: service_role의 DELETE는 허용합니다. 계정 삭제 시 FK cascade가 원장을 지워야 하는데
         이를 막으면 개인정보 파기 요구에 응할 수 없기 때문입니다.';
