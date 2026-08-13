-- ============================================================================
-- 0010_store_coordinates.sql — 좌표 저장 + 체크인 직접 호출 허용
--
-- 계기: 개발 일정 단축 결정. 위치정보법 대응은 프로젝트 오너가 별도로 처리합니다.
--
-- ── 무엇이 바뀌나 ────────────────────────────────────────────────────────
--  1. visits에 lat/lng/distance_m를 저장합니다.
--  2. record_checkin / verify_checkin을 authenticated에 개방합니다.
--     → 클라이언트가 RPC로 직접 호출 → **체크인 Edge Function이 불필요해집니다.**
--
-- ── ⚠️ 되돌리기 어려운 변경입니다 ────────────────────────────────────────
--  스키마는 언제든 되돌릴 수 있지만 **그 사이에 쌓인 좌표 데이터는 남습니다.**
--  방침을 되돌릴 때는 컬럼 DROP만으로 끝나지 않고 기존 행의 파기 절차가 필요합니다.
--  운영 배포 전에 결론이 나 있어야 하는 사안입니다.
--
--  PLAN.md §5.2-1과 0003/0005의 주석은 "좌표를 저장하지 않는다"를 전제로 쓰여 있습니다.
--  이 파일이 그 전제를 뒤집으므로, 아래에서 해당 주석들을 함께 갱신합니다.
--  (주석만 남겨두면 다음 사람이 잘못된 전제로 코드를 짭니다.)
-- ============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1) visits에 좌표 컬럼
-- ---------------------------------------------------------------------------
alter table public.visits
  add column if not exists lat        double precision,
  add column if not exists lng        double precision,
  add column if not exists distance_m double precision;

comment on column public.visits.lat is
  '체크인 시점 위도. 0010에서 추가 — 개인위치정보에 해당합니다. 보관 기간·파기 절차가 필요합니다.';
comment on column public.visits.lng is
  '체크인 시점 경도. 0010에서 추가 — 개인위치정보에 해당합니다. 보관 기간·파기 절차가 필요합니다.';
comment on column public.visits.distance_m is
  '스팟 중심으로부터의 거리(m). 디버깅·이상탐지용.';

comment on table public.visits is
  '체크인 기록. 0010부터 좌표(lat/lng)를 저장합니다 — 개인위치정보 보관에 해당합니다.
   ⚠ 이전 버전(0003)의 "좌표를 저장하지 않는다"는 설계는 0010에서 철회되었습니다.
     보관 기간·파기·이용자 고지는 애플리케이션/운영 정책으로 처리해야 합니다.';

-- ---------------------------------------------------------------------------
-- 2) record_checkin — 좌표 저장 + 호출자 신원 확정
--
-- ★ 여기가 이 파일에서 가장 중요한 부분입니다.
--
--   기존:  v_uid := coalesce(p_user_id, auth.uid());
--   변경:  v_uid := coalesce(auth.uid(), p_user_id);
--
--   이 함수는 SECURITY DEFINER이고 p_user_id를 인자로 받습니다.
--   지금까지는 service_role(Edge Function)만 호출할 수 있어서 문제가 없었지만,
--   authenticated에 그대로 개방하면 **로그인한 누구나 p_user_id에 남의 uuid를 넣어
--   그 사람 이름으로 체크인하고 그 사람 계정에 포인트를 적립**할 수 있게 됩니다.
--
--   순서를 뒤집으면: 로그인 사용자는 auth.uid()가 있으므로 항상 자기 자신으로 고정되고,
--   auth.uid()가 없는 service_role만 p_user_id를 쓸 수 있습니다. 운영자 대리 체크인 경로는 유지됩니다.
--
--   교훈: SECURITY DEFINER 함수를 클라이언트에 개방할 때는
--         "인자로 받는 신원"이 하나라도 있으면 반드시 무력화해야 합니다.
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
  v_uid         uuid := coalesce(auth.uid(), p_user_id);   -- ★ 0010: 순서 반전
  v_check       record;
  v_visit_id    uuid;
  v_prev        record;
  v_gap_sec     double precision;
  v_spot_gap_m  double precision;
  v_speed_kmh   double precision;
  v_anomaly     text;
  v_granted     jsonb := '[]'::jsonb;
  v_row         record;
  v_dist        double precision;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '28000';
  end if;

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

  -- 순간이동 탐지. 공개 스팟 좌표만 사용하는 기존 방식을 그대로 둡니다
  -- (좌표를 저장하게 됐어도 이 계산은 이미 정확하고 바꿀 이유가 없습니다).
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
    if v_speed_kmh > 90 then
      v_anomaly := 'implausible_speed_' || round(v_speed_kmh)::text || 'kmh';
    end if;
  end if;

  -- 0010: 스팟 중심으로부터의 실제 거리
  select ST_Distance(s.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)
    into v_dist
  from public.spots s where s.id = p_spot_id;

  insert into public.visits (user_id, spot_id, method, accuracy_m, anomaly_flag, lat, lng, distance_m)
  values (v_uid, p_spot_id, p_method, p_accuracy_m, v_anomaly, p_lat, p_lng, v_dist)
  on conflict do nothing
  returning id into v_visit_id;

  if v_visit_id is null then
    return jsonb_build_object('ok', true, 'already_checked_in', true, 'spot_id', p_spot_id);
  end if;

  perform public.award_points(v_uid, 10, 'checkin', 'visit', v_visit_id);

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
  '★ 체크인 전 과정(검증 → visits INSERT → 포인트 → 장소 카드 지급)을 한 트랜잭션으로 처리합니다.
   0010부터 authenticated가 RPC로 직접 호출합니다 — 체크인 Edge Function은 필요 없습니다.
   ⚠ p_user_id는 auth.uid()가 없을 때(service_role)만 유효합니다. 로그인 사용자는 항상 본인으로 고정됩니다.
   ⚠ 야간 체크인·기상특보 차단(§5.3)은 외부 API 의존이라 여전히 이 함수 밖(클라이언트 또는 Edge Function)의 몫입니다.';

-- ---------------------------------------------------------------------------
-- 3) 권한 개방
-- ---------------------------------------------------------------------------
grant execute on function
  public.verify_checkin(uuid, double precision, double precision, double precision),
  public.record_checkin(uuid, double precision, double precision, double precision, uuid, public.checkin_method)
to authenticated;

-- ---------------------------------------------------------------------------
-- 4) 유지하는 것 — 포인트·도감 쓰기 봉인
--
--  points_ledger / dex_entries / visits 에 대한 직접 INSERT 정책은 추가하지 않습니다.
--  이유는 보안 취향이 아니라 일정입니다:
--    · 이미 만들어져 동작합니다. 걷어내는 것은 시간을 아끼는 게 아니라 쓰는 일입니다.
--    · 열어두면 브라우저 개발자도구로 포인트·도감 카드를 무제한 생성할 수 있고,
--      시범사업에서 순위·통계가 오염되면 되돌릴 방법이 없습니다.
--  체크인은 위 3)으로 이미 직접 호출이 가능해졌으므로 개발 속도에 병목이 되지 않습니다.
-- ---------------------------------------------------------------------------
