-- ============================================================================
-- 0005_functions.sql — 체크인 검증 · 포인트 원장 · 도감 지급 · 뷰
--
-- 근거: PLAN.md §4.3 체크인 검증 로직, §6.1 포인트 배분, §7.5 라우팅
--
-- ⚠ 모든 SECURITY DEFINER 함수에 search_path를 고정했습니다.
--   고정하지 않으면 호출자가 search_path를 바꿔 동명의 가짜 테이블을 주입할 수 있습니다.
-- ============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 등급 → 포인트 (domain.ts TIER_POINTS와 1:1)
-- ---------------------------------------------------------------------------
create or replace function public.tier_points(p_tier smallint)
returns integer
language sql
immutable
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

-- ---------------------------------------------------------------------------
-- 포인트 잔액
-- ---------------------------------------------------------------------------
create or replace function public.point_balance(p_user_id uuid)
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(delta), 0)::integer
  from public.points_ledger
  where user_id = p_user_id;
$$;

comment on function public.point_balance(uuid) is
  '포인트 잔액 = SUM(delta). 잔액 컬럼을 두지 않는 대신 이 함수/뷰를 씁니다. PLAN.md §4.2 설계 노트.';

create or replace view public.v_point_balances
with (security_invoker = true) as
  select
    user_id,
    coalesce(sum(delta), 0)::integer as balance,
    count(*)::integer                as entry_count,
    max(created_at)                  as last_entry_at
  from public.points_ledger
  group by user_id;

comment on view public.v_point_balances is
  '사용자별 포인트 잔액 집계 뷰. security_invoker=true라 points_ledger의 RLS가 그대로 적용됩니다
   (즉 본인 행만 합산됩니다 — 뷰가 RLS 우회 통로가 되지 않도록).';

-- ---------------------------------------------------------------------------
-- 포인트 적립 (원장에 append)
-- ---------------------------------------------------------------------------
create or replace function public.award_points(
  p_user_id   uuid,
  p_delta     integer,
  p_reason    public.point_reason,
  p_ref_type  text default null,
  p_ref_id    uuid default null,
  p_note      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  -- 중복 적립은 points_ledger_idempotency_uq 부분 유니크 인덱스가 막습니다.
  -- 이미 적립된 근거면 조용히 NULL을 돌려줍니다(오프라인 큐 재전송이 정상 흐름이므로 예외가 아닙니다).
  insert into public.points_ledger (user_id, delta, reason, ref_type, ref_id, note)
  values (p_user_id, p_delta, p_reason, p_ref_type, p_ref_id, p_note)
  on conflict do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.award_points(uuid, integer, public.point_reason, text, uuid, text) is
  '포인트 원장에 행을 추가합니다. 같은 (user, reason, ref_type, ref_id)는 두 번 적립되지 않습니다.
   회수가 필요하면 이 함수로 음수 delta의 보정 행을 추가하세요 — 기존 행을 고치는 것은 트리거가 막습니다.';

-- ---------------------------------------------------------------------------
-- 도감 카드 지급
-- ---------------------------------------------------------------------------
create or replace function public.grant_dex_entry(
  p_user_id     uuid,
  p_species_id  uuid,
  p_photo_id    uuid default null,
  p_observed_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_new boolean;
begin
  insert into public.dex_entries (user_id, species_id, first_observed_at, best_photo_id, count)
  values (p_user_id, p_species_id, p_observed_at, p_photo_id, 1)
  on conflict (user_id, species_id) do update
    set count             = dex_entries.count + 1,
        best_photo_id     = coalesce(dex_entries.best_photo_id, excluded.best_photo_id),
        first_observed_at = least(dex_entries.first_observed_at, excluded.first_observed_at),
        updated_at        = now()
  returning (xmax = 0) into v_is_new;

  return coalesce(v_is_new, false);
end;
$$;

comment on function public.grant_dex_entry(uuid, uuid, uuid, timestamptz) is
  '도감 카드를 지급합니다. 이미 있으면 count만 올리고 false를, 새로 생겼으면 true를 반환합니다
   (반환값으로 "새 카드 획득!" 연출과 포인트 지급 여부를 가릅니다).';

-- ---------------------------------------------------------------------------
-- ★ 체크인 검증 — ST_DWithin. 좌표를 받되 저장하지 않습니다.
-- ---------------------------------------------------------------------------
create or replace function public.verify_checkin(
  p_spot_id     uuid,
  p_lat         double precision,
  p_lng         double precision,
  p_accuracy_m  double precision default null
)
returns table (ok boolean, remaining_m integer, radius_m integer, reason text)
language plpgsql
stable
set search_path = public, extensions, pg_temp
as $$
declare
  v_spot public.spots%rowtype;
  v_pt   geography(Point, 4326);
  v_dist double precision;
begin
  select * into v_spot from public.spots s where s.id = p_spot_id and s.is_active;
  if not found then
    return query select false, null::integer, null::integer, 'spot_not_found'::text;
    return;
  end if;

  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90
     or p_lng not between -180 and 180 then
    return query select false, null::integer, v_spot.radius_m, 'invalid_coordinates'::text;
    return;
  end if;

  -- §6.4 2층: GPS 정확도가 100m를 넘으면 판정하지 않고 재시도를 요구합니다.
  if p_accuracy_m is not null and p_accuracy_m > 100 then
    return query select false, null::integer, v_spot.radius_m, 'low_accuracy'::text;
    return;
  end if;

  v_pt := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  if ST_DWithin(v_spot.geom, v_pt, v_spot.radius_m) then
    return query select true, 0, v_spot.radius_m, null::text;
    return;
  end if;

  -- 실패 시에는 "남은 거리"만 돌려줍니다. "38m만 더!"가 그 자체로 미니게임이 됩니다(PLAN.md §3).
  -- 원거리(raw distance)가 아니라 반경을 뺀 잔여 거리이고, 정수로 올림해 정밀도를 낮춥니다.
  v_dist := ST_Distance(v_spot.geom, v_pt);
  return query select false, ceil(v_dist - v_spot.radius_m)::integer, v_spot.radius_m, 'too_far'::text;
end;
$$;

comment on function public.verify_checkin(uuid, double precision, double precision, double precision) is
  '★ 체크인 반경 판정. 좌표를 인자로만 받고 어디에도 저장하지 않으며, boolean + 남은 거리(m)만 반환합니다. PLAN.md §4.3, §5.2-1
   클라이언트가 거리 계산을 하면 계산 자체를 조작할 수 있으므로 판정은 반드시 서버(이 함수)에서 합니다.
   ⚠ TODO(검토): 좌표가 인자로 넘어오므로 Postgres 로그 설정(log_statement=all, pgaudit 등)이 켜져 있으면
     좌표가 로그에 남습니다. 운영 전 로그 설정을 반드시 확인하세요 — §5의 설계가 로그로 무너질 수 있습니다.';

-- ---------------------------------------------------------------------------
-- ★ 체크인 기록 — 검증 + visits INSERT + 포인트 + 장소 카드 자동 지급 (원자적)
-- ---------------------------------------------------------------------------
create or replace function public.record_checkin(
  p_spot_id     uuid,
  p_lat         double precision,
  p_lng         double precision,
  p_accuracy_m  double precision default null,
  p_user_id     uuid default null,
  p_method      public.checkin_method default 'gps'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid         uuid := coalesce(p_user_id, auth.uid());
  v_check       record;
  v_visit_id    uuid;
  v_prev        record;
  v_gap_sec     double precision;
  v_spot_gap_m  double precision;
  v_speed_kmh   double precision;
  v_anomaly     text;
  v_granted     jsonb := '[]'::jsonb;
  v_row         record;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '28000';
  end if;

  -- 보호자 본인 동의 없이는 체크인을 받지 않습니다. PLAN.md §5.1
  if not exists (
    select 1
    from public.users u
    join public.consents c on c.id = u.consent_id
    where u.id = v_uid
      and c.revoked_at is null
      and (c.expires_at is null or c.expires_at > now())
  ) then
    return jsonb_build_object('ok', false, 'reason', 'consent_required');
  end if;

  select * into v_check from public.verify_checkin(p_spot_id, p_lat, p_lng, p_accuracy_m);

  if not v_check.ok then
    return jsonb_build_object(
      'ok',          false,
      'reason',      v_check.reason,
      'remaining_m', v_check.remaining_m,
      'radius_m',    v_check.radius_m
    );
  end if;

  -- §6.4 3층 순간이동 탐지.
  -- ★ 사용자 좌표를 쓰지 않습니다. "직전에 찍은 스팟"과 "지금 찍는 스팟"의 공개 좌표 거리 / 경과시간으로만 계산합니다.
  --   덕분에 좌표 미저장 원칙을 지키면서도 이상 이동을 잡아낼 수 있습니다.
  select v.verified_at, s.geom
    into v_prev
  from public.visits v
  join public.spots s on s.id = v.spot_id
  where v.user_id = v_uid and v.spot_id <> p_spot_id
  order by v.verified_at desc
  limit 1;

  if found then
    v_gap_sec := greatest(extract(epoch from (now() - v_prev.verified_at)), 1);
    select ST_Distance(v_prev.geom, s.geom) into v_spot_gap_m
    from public.spots s where s.id = p_spot_id;

    v_speed_kmh := (v_spot_gap_m / v_gap_sec) * 3.6;
    -- 도시철도 1호선이 하천과 나란히 달리므로(§2.1) 임계값을 넉넉히 잡습니다.
    if v_speed_kmh > 90 then
      v_anomaly := 'implausible_speed_' || round(v_speed_kmh)::text || 'kmh';
    end if;
  end if;

  insert into public.visits (user_id, spot_id, method, accuracy_m, anomaly_flag)
  values (v_uid, p_spot_id, p_method, p_accuracy_m, v_anomaly)
  on conflict do nothing
  returning id into v_visit_id;

  if v_visit_id is null then
    -- visits_one_per_day_uq에 걸림 = 오늘 이미 이 스팟을 찍었습니다. 성공으로 응답하되 중복 적립은 하지 않습니다.
    return jsonb_build_object('ok', true, 'already_checked_in', true, 'spot_id', p_spot_id);
  end if;

  perform public.award_points(v_uid, 10, 'checkin', 'visit', v_visit_id);

  -- 장소 카드(보장 트랙) 자동 지급 — 헛걸음 방지. PLAN.md §7.2
  for v_row in
    select sp.id as species_id, sp.tier
    from public.spot_species ss
    join public.species sp on sp.id = ss.species_id
    where ss.spot_id = p_spot_id
      and ss.auto_grant
      and sp.is_active
  loop
    if public.grant_dex_entry(v_uid, v_row.species_id, null, now()) then
      v_granted := v_granted || to_jsonb(v_row.species_id);
      perform public.award_points(
        v_uid, public.tier_points(v_row.tier), 'species_found', 'species', v_row.species_id
      );
    end if;
  end loop;

  return jsonb_build_object(
    'ok',              true,
    'visit_id',        v_visit_id,
    'spot_id',         p_spot_id,
    'granted_species', v_granted,
    'anomaly_flag',    v_anomaly,
    'balance',         public.point_balance(v_uid)
  );
end;
$$;

comment on function public.record_checkin(uuid, double precision, double precision, double precision, uuid, public.checkin_method) is
  '★ 체크인 전 과정(검증 → visits INSERT → 포인트 → 장소 카드 지급)을 한 트랜잭션으로 처리합니다. PLAN.md §4.3
   Edge Function이 service_role로 호출하는 진입점이며, 좌표는 인자로만 존재하고 함수 종료와 함께 사라집니다.
   ⚠ TODO(검토): 야간(일몰 후) 체크인 비활성화(§5.3)와 기상특보 차단은 여기가 아니라 Edge Function에 둡니다
     — 일몰 시각·기상 API는 외부 의존이라 DB 트랜잭션 안에 넣기 부적절합니다.';

-- ---------------------------------------------------------------------------
-- §7.5 ① 후보 압축 — spot_species × 현재 월
-- ---------------------------------------------------------------------------
create or replace function public.spot_candidate_species(
  p_spot_id uuid,
  p_month   integer default null
)
returns setof public.species
language sql
stable
set search_path = public, pg_temp
as $$
  select sp.*
  from public.species sp
  join public.spot_species ss on ss.species_id = sp.id
  where ss.spot_id = p_spot_id
    and sp.is_active
    and coalesce(p_month, extract(month from (now() at time zone 'Asia/Seoul'))::integer) = any (sp.months)
  order by sp.track, sp.tier, ss.seq, sp.common_name;
$$;

comment on function public.spot_candidate_species(uuid, integer) is
  '스팟의 "지금 만날 수 있는 친구들" 목록. 계절 필터(species.months) 적용 — 여름에 겨울철새를 제시하지 않습니다(§7.7).
   동시에 §7.5 ①의 후보 압축이기도 합니다: 이 결과가 판별 모델에 넘길 후보 3~10종이 됩니다.';

-- ---------------------------------------------------------------------------
-- §7.4 구간별 수질 요약 — "내가 모은 카드로 하천 등급 판정"
-- ---------------------------------------------------------------------------
create or replace function public.dex_summary_by_tier(
  p_user_id  uuid,
  p_river_id uuid default null
)
returns table (tier smallint, owned integer, best_water_grade smallint)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    sp.tier,
    count(distinct sp.id)::integer as owned,
    min(sp.water_grade)::smallint  as best_water_grade
  from public.dex_entries d
  join public.species sp on sp.id = d.species_id
  where d.user_id = p_user_id
    and (
      p_river_id is null
      or exists (
        select 1 from public.river_species rs
        where rs.species_id = sp.id and rs.river_id = p_river_id
      )
    )
  group by sp.tier
  order by sp.tier;
$$;

comment on function public.dex_summary_by_tier(uuid, uuid) is
  '등급별 보유 종수 + 가장 좋은 수질 등급. PLAN.md §7.4 코스 종료 요약 화면("이 구간의 물은 2급수로 추정돼요")의 데이터원.
   ⚠ 표시 문구는 낮은 등급이 나와도 실패로 쓰지 않습니다 — "조금 더 맑아지면 옆새우도 올 수 있어"로 씁니다.';

-- ---------------------------------------------------------------------------
-- ❌ v0.5에서 제거: generate_join_code() / join_class()
--    학급 참여코드 시나리오가 범위에서 빠졌습니다. PLAN.md §5.1
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 전문가 동반 프로그램 해금 여부 (§7.6-4)
-- ---------------------------------------------------------------------------
-- v0.5: class_members ⋈ classes.expert_program → users.expert_program 단일 조회로 단순화.
create or replace function public.can_unlock_expert(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select u.expert_program from public.users u where u.id = p_user_id),
    false
  );
$$;

comment on function public.can_unlock_expert(uuid) is
  '저서생물(ethics_flag=expert_only) 카드 해금 가능 여부. PLAN.md §7.6-4
   ⚠ TODO(검토): 현재는 조회 함수일 뿐 하드 제약으로 걸지 않았습니다. 앱/Edge Function에서 관찰 등록 전에 확인하세요.
     DB 제약으로 막으면 콘텐츠 시드·운영자 수동 인정 같은 정상 경로까지 막혀 운영이 경직됩니다.
   ⚠ users.expert_program은 보호자가 스스로 켤 수 없어야 합니다 — 0006 RLS의 users UPDATE 정책에서
     이 컬럼을 제외하고, 프로그램 참가 확정 시 운영자(service_role)가 설정합니다.';

-- ---------------------------------------------------------------------------
-- 트리거: 관찰 확정 → 도감 카드 + 포인트
-- ---------------------------------------------------------------------------
create or replace function public.tg_observations_grant_rewards()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_species_id uuid;
  v_tier       smallint;
begin
  if new.status not in ('auto_confirmed', 'confirmed', 'corrected') then
    return new;
  end if;

  -- 이미 확정 상태였고 종도 그대로면 아무것도 하지 않습니다.
  -- (OLD는 INSERT 트리거에서 미할당이라 참조 전에 tg_op를 반드시 바깥 IF로 분리해야 합니다)
  if tg_op = 'UPDATE' then
    if old.status in ('auto_confirmed', 'confirmed', 'corrected')
       and coalesce(old.final_species_id, old.declared_species_id)
         = coalesce(new.final_species_id, new.declared_species_id) then
      return new;
    end if;
  end if;

  v_species_id := coalesce(new.final_species_id, new.declared_species_id);
  select sp.tier into v_tier from public.species sp where sp.id = v_species_id;

  perform public.grant_dex_entry(new.user_id, v_species_id, new.photo_id, new.observed_at);

  -- 포인트는 관찰 1건당 1회만(ref_id = 관찰 id). 정정(corrected)되어도 차감하지 않습니다.
  -- 아이를 처벌하지 않는다는 §7.5의 결정이 여기서 "멱등 지급 + 무차감"으로 구현됩니다.
  perform public.award_points(
    new.user_id, public.tier_points(v_tier), 'species_found', 'observation', new.id
  );

  return new;
end;
$$;

comment on function public.tg_observations_grant_rewards() is
  '관찰이 확정되면 도감 카드와 포인트를 지급합니다. 정정 시 카드는 새 종으로 추가되지만 포인트는 차감하지 않습니다(PLAN.md §7.5).';

create trigger observations_grant_rewards
  after insert or update of status, final_species_id on public.observations
  for each row execute function public.tg_observations_grant_rewards();

-- ---------------------------------------------------------------------------
-- 트리거: 관찰 일지 → +10P (빈손 방지)
-- ---------------------------------------------------------------------------
create or replace function public.tg_observation_logs_award()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.award_points(new.user_id, 10, 'observation_log', 'observation_log', new.id);
  return new;
end;
$$;

comment on function public.tg_observation_logs_award() is '관찰 일지 작성 시 +10P. 하루 1회 제한은 observation_logs_one_per_day_uq가 담당합니다.';

create trigger observation_logs_award
  after insert on public.observation_logs
  for each row execute function public.tg_observation_logs_award();

-- ---------------------------------------------------------------------------
-- 트리거: 퀴즈 응답 → +15P / +5P (첫 시도에만)
-- ---------------------------------------------------------------------------
create or replace function public.tg_quiz_attempts_award()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 재시도는 허용하되 포인트는 첫 시도에만. (틀린 뒤 다시 맞혀서 15P를 받는 경로를 막습니다)
  if exists (
    select 1 from public.quiz_attempts qa
    where qa.user_id = new.user_id and qa.quiz_id = new.quiz_id and qa.id <> new.id
  ) then
    return new;
  end if;

  -- 오답에도 5P를 줍니다. "틀리면 0점"은 재도전이 아니라 이탈을 만듭니다. PLAN.md §3
  perform public.award_points(
    new.user_id,
    case when new.is_correct then 15 else 5 end,
    case when new.is_correct then 'quiz_correct' else 'quiz_wrong' end::public.point_reason,
    'quiz',
    new.quiz_id
  );
  return new;
end;
$$;

comment on function public.tg_quiz_attempts_award() is '퀴즈 첫 응답에만 포인트 지급(정답 15P / 오답 5P). PLAN.md §3, §6.1';

create trigger quiz_attempts_award
  after insert on public.quiz_attempts
  for each row execute function public.tg_quiz_attempts_award();

-- ---------------------------------------------------------------------------
-- ❌ v0.5에서 제거: is_teacher / is_approved_teacher / teaches_user
--                  teaches_class / is_class_member
--
-- 이 함수들은 전부 "교사가 담당 학급의 아이 데이터를 본다"는 교차 계정 접근을
-- 판정하기 위한 것이었습니다. 보호자 계정 전환으로 **교차 계정 접근 자체가 사라져**
-- RLS가 `user_id = auth.uid()` 한 줄로 단순해졌습니다.
--
-- 부수 효과: SECURITY DEFINER 보조 함수가 없어지면서 정책 간 무한 재귀 위험도 함께
-- 사라졌습니다(users 정책 → class_members 정책 → users 정책 …). PLAN.md §5.1
--
-- ⚠ 운영자 검수(⭐⭐⭐ 이상 관찰 건)는 교사 권한이 아니라 service_role로 처리합니다.
--   RLS를 우회하는 경로이므로 Edge Function 안에서만 쓰고 클라이언트에 노출하지 마세요.
-- ---------------------------------------------------------------------------
