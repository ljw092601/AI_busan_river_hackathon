-- ============================================================================
-- 0020_sighting_only_claim.sql — 보호종은 사진 없이 목격만으로 기록
--
-- 계기: 0019로 도감에 촬영 등록을 붙였더니, **수달 카드에 「사진 찍어 등록하기」**가
--       떴습니다.
--
-- PLAN.md §7.6 은 수달 등 report_only 종을 **접근·추적 금지, "보았다"만 기록**으로
-- 정했습니다. 그런데 claim_species_photo 가 사진을 필수로 요구하는 바람에,
-- **플래그가 막으려던 바로 그 행동을 앱이 유도하는** 상태가 됐습니다.
--
-- 목록에서 가리는 것만으로는 부족합니다(0011에서 배운 것과 같습니다) —
-- 촬영을 요구하지 않는 경로를 서버가 제공해야 화면이 그것을 쓸 수 있습니다.
-- 화면만 고치면 다음 사람이 "왜 사진이 없지" 하며 되돌립니다.
--
-- p_photo_id 를 nullable 로 바꾸되, **report_only 종에서만** 생략을 허용합니다.
-- 그 외 종은 그대로 사진이 필수이고 본인 사진이어야 합니다.
-- ============================================================================

set search_path = public, extensions;

create or replace function public.claim_species_photo(
  p_species_id uuid,
  p_photo_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_species public.species%rowtype;
  v_spot_id uuid;
  v_obs_id  uuid;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '28000';
  end if;

  select * into v_species from public.species where id = p_species_id and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'species_not_found');
  end if;

  -- 저서생물 윤리 규칙(§7.6-4). 화면 필터는 안내이지 방어가 아닙니다.
  if v_species.ethics_flag = 'expert_only' and not public.current_user_is_expert() then
    return jsonb_build_object('ok', false, 'reason', 'expert_only');
  end if;

  -- ★ report_only(보호종)는 사진을 요구하지 않습니다. 요구하면 아이가 가까이 갑니다.
  if v_species.ethics_flag = 'report_only' then
    if p_photo_id is not null
       and not exists (select 1 from public.photos p
                        where p.id = p_photo_id and p.user_id = v_uid) then
      return jsonb_build_object('ok', false, 'reason', 'photo_not_found');
    end if;
  else
    if p_photo_id is null
       or not exists (select 1 from public.photos p
                       where p.id = p_photo_id and p.user_id = v_uid) then
      return jsonb_build_object('ok', false, 'reason', 'photo_not_found');
    end if;
  end if;

  -- 이미 가진 카드는 관찰을 만들지 않습니다.
  -- (트리거가 관찰 1건당 포인트를 주므로 그러지 않으면 무한 반복이 됩니다 — 0019 참조)
  if exists (select 1 from public.dex_entries
              where user_id = v_uid and species_id = p_species_id) then
    return jsonb_build_object('ok', true, 'is_new', false, 'reason', 'already_owned',
                              'species_id', p_species_id);
  end if;

  select ss.spot_id into v_spot_id
    from public.spot_species ss
    join public.spots s on s.id = ss.spot_id and s.is_active
   where ss.species_id = p_species_id
   order by ss.seq
   limit 1;

  if v_spot_id is null then
    select id into v_spot_id from public.spots where is_active order by seq limit 1;
  end if;
  if v_spot_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_spot');
  end if;

  insert into public.observations
    (user_id, spot_id, declared_species_id, photo_id, status, model_version)
  values
    (v_uid, v_spot_id, p_species_id, p_photo_id, 'auto_confirmed', 'none')
  returning id into v_obs_id;

  return jsonb_build_object(
    'ok', true,
    'observation_id', v_obs_id,
    'species_id', p_species_id,
    'is_new', true,
    'tier', v_species.tier,
    'points', public.tier_points(v_species.tier),
    'sighting_only', v_species.ethics_flag = 'report_only'
  );
end;
$$;

comment on function public.claim_species_photo(uuid, uuid) is
  '사진으로 도감 카드를 얻습니다. observations 확정 INSERT → 기존 트리거가 카드·포인트 지급.
   ⚠ ethics_flag=report_only(보호종)는 **사진 없이** 목격만으로 기록합니다 — 촬영을 요구하면
     접근·추적을 유도하게 되어 §7.6의 취지와 정반대가 됩니다.
   ⚠ 이미 가진 종은 관찰을 만들지 않습니다(같은 사진으로 포인트 무한 반복 방지, 실측 확인).
   ⚠ 지금은 사진의 내용을 서버가 확인하지 않습니다. 화면에서 "AI가 확인했다"고 하지 마세요.';

revoke execute on function public.claim_species_photo(uuid, uuid) from public, anon;
grant  execute on function public.claim_species_photo(uuid, uuid) to authenticated, service_role;

-- ============================================================================
-- 검증 (실제로 돌려 확인)
--   수달(report_only) 사진 없이  → ok, is_new, sighting_only=true, tier5 = 60점
--   참새(none)      사진 없이  → photo_not_found 로 거부
-- ============================================================================
