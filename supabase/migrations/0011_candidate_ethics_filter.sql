-- ============================================================================
-- 0011_candidate_ethics_filter.sql — 저서생물 윤리 필터 + 계절 폴백
--
-- 계기: spot_candidate_species()에 윤리 필터가 없어, 스팟 ④에서
--       옆새우·플라나리아·날도래류(ethics_flag = expert_only)가 **누구에게나**
--       "지금 만날 수 있는 친구들"로 표시되고 있었습니다. 실제로 재현했습니다.
--       목록에 올리는 순간 아이는 돌을 뒤집습니다 — 표시 자체가 곧 유도입니다.
--       PLAN.md §7.6-4가 막으려던 결과가 그대로 일어나고 있었습니다.
-- ============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 왜 헬퍼 함수가 따로 필요한가
--
-- spot_candidate_species는 SECURITY INVOKER라 호출자 권한으로 users를 읽습니다.
-- 그런데 anon에는 public.users에 대한 **테이블 GRANT가 아예 없습니다.**
-- Postgres는 GRANT를 먼저 보고 RLS를 나중에 봅니다. 그래서 "정책상 0행"이 아니라
--   ERROR: permission denied for table users
-- 가 나면서 함수 전체가 실패합니다. (처음 작성한 판이 정확히 이렇게 터졌습니다.)
--
-- users에 anon SELECT를 주는 것은 RLS가 막더라도 공격 표면을 넓히는 선택이라
-- 대신 자기 자신만 판정하는 최소 DEFINER 헬퍼를 둡니다.
--
-- ★ 인자가 없다는 점이 핵심입니다. record_checkin/award_points처럼 신원을
--   인자로 받으면 그것이 곧 위조 입력이 되지만, 이 함수는 auth.uid()만 보므로
--   남의 상태를 물어볼 방법 자체가 없습니다.
-- ---------------------------------------------------------------------------
create or replace function public.current_user_is_expert()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select u.expert_program from public.users u where u.id = auth.uid()),
    false
  );
$$;

comment on function public.current_user_is_expert() is
  '호출자 본인의 전문가 프로그램 참여 여부. 인자가 없어 남의 계정을 조회할 수 없습니다.
   미로그인(auth.uid() is null)이면 항상 false. PLAN.md §7.6-4';

revoke execute on function public.current_user_is_expert() from public;
grant  execute on function public.current_user_is_expert() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 후보 목록 재정의
--   ① expert_only 종은 전문가 프로그램 참여자에게만
--   ② 제철 후보가 0건이면 보장 트랙을 계절 무시하고 내보냄 (§7.2 빈 화면 방지)
-- ---------------------------------------------------------------------------
create or replace function public.spot_candidate_species(
  p_spot_id uuid,
  p_month   integer default null
)
returns setof public.species
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with ctx as (
    select coalesce(p_month, extract(month from (now() at time zone 'Asia/Seoul'))::integer) as m,
           public.current_user_is_expert() as expert
  ),
  visible as (
    select sp.id, sp.track, sp.tier, sp.months, sp.common_name, ss.seq as ss_seq
    from public.species sp
    join public.spot_species ss on ss.species_id = sp.id
    cross join ctx
    where ss.spot_id = p_spot_id
      and sp.is_active
      and (sp.ethics_flag <> 'expert_only' or ctx.expert)
  ),
  in_season as (
    select v.* from visible v cross join ctx where ctx.m = any (v.months)
  ),
  picked as (
    select * from in_season
    union all
    select * from visible
     where track = 'guaranteed' and not exists (select 1 from in_season)
  )
  select s.*
  from public.species s
  join picked p on p.id = s.id
  order by p.track, p.tier, p.ss_seq, p.common_name;
$$;

comment on function public.spot_candidate_species(uuid, integer) is
  '스팟의 "지금 만날 수 있는 친구들". 계절 필터(species.months) 적용 — 여름에 겨울철새를 제시하지 않습니다(§7.7).
   0011부터: expert_only 종은 users.expert_program=true 인 호출자에게만 보이고,
   제철 후보가 0건이면 보장 트랙을 계절 무시하고 내보냅니다.
   ⚠ 이 함수는 아이에게 보여줄 목록입니다. 판별 모델의 후보는 Edge Function이 따로 계산합니다.';

revoke execute on function public.spot_candidate_species(uuid, integer) from public;
grant  execute on function public.spot_candidate_species(uuid, integer) to anon, authenticated, service_role;

-- 0010이 뒤집은 전제를 따라 남아 있던 주석 정정
comment on column public.visits.accuracy_m is
  'GPS 보고 정확도(m). 0010부터 lat/lng가 함께 저장되므로 "위치를 복원할 수 없다"는 이전 설명은 더 이상 유효하지 않습니다.';
