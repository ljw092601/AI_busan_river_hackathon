-- ============================================================================
-- 0013_river_missions.sql — 5대 하천 × (체험 미션 + 퀴즈 + 배지)
--
-- ── 스팟을 왜 안 지웠나 ──────────────────────────────────────────────────
-- 요구사항은 "하천당 스팟을 없애고 하천을 하나로 취급"입니다.
-- 그런데 spots는 quizzes/visits/photos/observations/spot_species/spot_contents가
-- 전부 NOT NULL FK로 참조합니다. 테이블을 드롭하면 이들이 연쇄로 무너집니다.
--
-- 대신 **하천당 스팟 1개**(하천 자신)로 축소했습니다. 데이터 모델은 그대로 살아
-- 있고, UI가 스팟 개념을 노출하지 않으므로 사용자에게는 "하천 하나"로 보입니다.
-- 스키마 변경 위험 0, 되돌리기도 쉽습니다.
--
-- ── 미션을 하천별이 아니라 종류별로 ──────────────────────────────────────
-- 프로토타입(example_html.html)은 하천마다 렌더 함수가 하나씩입니다.
-- 여기서는 mission_kind(enum) + mission_config(jsonb)로 DB가 미션을 정의합니다.
-- 6번째 하천을 추가할 때 코드를 고치지 않고 행 하나만 넣으면 됩니다.
-- ============================================================================

set search_path = public, extensions;

do $$ begin
  create type public.mission_kind as enum (
    'acknowledge',   -- 읽고 인증 버튼
    'text_answer',   -- 정답 단어 입력
    'tap_target',    -- 움직이는 대상 탭   (온천천 수달)
    'collect',       -- N개 수집           (동천 플로깅)
    'observe_log'    -- 관찰 항목 선택+기록 (대천천)
  );
exception when duplicate_object then null;
end $$;

alter table public.rivers
  add column if not exists seq               smallint    not null default 1,
  add column if not exists subtitle          text        not null default '',
  add column if not exists icon              text        not null default '💧',
  add column if not exists theme             text        not null default 'emerald',
  add column if not exists badge_code        text,
  add column if not exists detailed_history  text        not null default '',
  add column if not exists detailed_ecology  text        not null default '',
  add column if not exists mission_kind      public.mission_kind,
  add column if not exists mission_title     text        not null default '',
  add column if not exists mission_body      text        not null default '',
  add column if not exists mission_config    jsonb       not null default '{}'::jsonb;

comment on column public.rivers.theme is
  'Tailwind 색 계열 키(blue/amber/emerald/cyan/teal). 클래스 문자열을 DB에 넣지 마세요 —
   Tailwind는 소스를 정적 스캔하므로 런타임에 조립한 클래스는 빌드에서 제거됩니다.
   화면 코드(src/features/rivers/theme.ts)가 이 키를 미리 정의된 클래스 묶음에 매핑합니다.';
comment on column public.rivers.mission_kind is
  'null이면 이 하천에는 체험 미션이 없고 퀴즈만 있습니다(수영강·부전천).';
comment on column public.rivers.mission_config is
  '미션 종류별 설정. collect → {"items":["🥤",...],"target":3},
   observe_log → {"fields":[{"key","label","options":[{"emoji","label"}]}]}';

-- ---------------------------------------------------------------------------
-- 미션 완료 기록
--
-- ⚠ 이 테이블은 클라이언트가 직접 INSERT 합니다.
--   미션이 전부 앱 안의 상호작용(버튼 탭·단어 입력)이라 서버가 검증할 대상이
--   애초에 없기 때문입니다. 체크인처럼 물리적 사실을 주장하는 게 아닙니다.
--   나중에 GPS·사진 기반 미션이 생기면 그때는 반드시 함수 경유로 바꿔야 합니다.
-- ---------------------------------------------------------------------------
create table if not exists public.river_missions (
  user_id      uuid not null references public.users (id) on delete cascade,
  river_id     uuid not null references public.rivers (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, river_id)
);

alter table public.river_missions enable row level security;

drop policy if exists river_missions_select_self on public.river_missions;
create policy river_missions_select_self on public.river_missions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists river_missions_insert_self on public.river_missions;
create policy river_missions_insert_self on public.river_missions
  for insert to authenticated with check (user_id = (select auth.uid()));

grant select, insert on public.river_missions to authenticated;

-- ---------------------------------------------------------------------------
-- 하천별 진행 상황 — 화면이 이 함수 하나만 부르면 됩니다.
--
-- ⚠ 하천마다 구성이 다릅니다:
--     수영강·부전천  퀴즈만 (mission_kind is null)
--     동천          미션만 (퀴즈 0문항)
--     온천천·대천천  미션 + 퀴즈
--   "미션 완료 AND 전 퀴즈 정답"을 그대로 쓰면 앞의 셋은 **영원히 미완수**가 되고
--   배지 3개를 아무도 받을 수 없습니다. 에러도 안 나고 진행률만 안 오릅니다.
--   → **없는 단계는 이미 통과한 것으로 취급**합니다.
--   → 클라이언트의 isRiverComplete()(src/features/rivers/types.ts)와 규칙이 같아야 합니다.
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
security invoker
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

revoke execute on function public.river_progress() from public;
grant  execute on function public.river_progress() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 배지 수령 — 조건을 **서버에서 다시 확인**하고 지급합니다.
--
-- ★ 인자로 신원을 받지 않습니다(auth.uid()만 사용).
--   record_checkin에서 겪은 사칭 문제를 애초에 만들지 않기 위해서입니다.
-- ---------------------------------------------------------------------------
create or replace function public.claim_river_badge(p_river_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_river  public.rivers%rowtype;
  v_total  integer;
  v_solved integer;
  v_badge  uuid;
  v_new    boolean;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '28000';
  end if;

  select * into v_river from public.rivers where id = p_river_id and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'river_not_found');
  end if;

  -- 미션이 정의된 하천만 미션 완료를 요구합니다.
  if v_river.mission_kind is not null
     and not exists (select 1 from public.river_missions
                      where user_id = v_uid and river_id = p_river_id) then
    return jsonb_build_object('ok', false, 'reason', 'mission_incomplete');
  end if;

  select count(*)::integer into v_total
    from public.quizzes q join public.spots s on s.id = q.spot_id
   where s.river_id = p_river_id;

  select count(distinct qa.quiz_id)::integer into v_solved
    from public.quiz_attempts qa
    join public.quizzes q on q.id = qa.quiz_id
    join public.spots s on s.id = q.spot_id
   where s.river_id = p_river_id and qa.user_id = v_uid and qa.is_correct;

  -- 퀴즈가 0문항이면 이 조건은 자동으로 통과합니다(0 >= 0).
  if v_solved < v_total then
    return jsonb_build_object('ok', false, 'reason', 'quiz_incomplete',
                              'solved', v_solved, 'total', v_total);
  end if;

  select id into v_badge from public.badges where code = v_river.badge_code;
  if v_badge is null then
    return jsonb_build_object('ok', false, 'reason', 'badge_not_configured');
  end if;

  insert into public.user_badges (user_id, badge_id)
  values (v_uid, v_badge)
  on conflict do nothing;
  v_new := found;

  return jsonb_build_object('ok', true, 'badge_code', v_river.badge_code, 'is_new', v_new);
end;
$$;

revoke execute on function public.claim_river_badge(uuid) from public, anon;
grant  execute on function public.claim_river_badge(uuid) to authenticated, service_role;
