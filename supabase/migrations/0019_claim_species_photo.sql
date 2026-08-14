-- ============================================================================
-- 0019_claim_species_photo.sql — 사진으로 도감 카드 얻기
--
-- 원래 기획(PLAN.md §7)의 핵심입니다: 생물을 찾아 사진을 찍으면 도감이 채워집니다.
-- 그동안 도감은 보기만 할 수 있었고, 카드를 얻는 경로는 체크인 시 장소 카드
-- 자동 지급뿐이었습니다.
--
-- ── 왜 새 지급 로직을 안 만들었나 ────────────────────────────────────────
-- dex_entries 와 points_ledger 는 클라이언트 쓰기가 봉인돼 있습니다(정책도 GRANT도
-- 없음). 이미 있는 보상 기계를 그대로 씁니다:
--
--   observations 에 확정 상태로 INSERT
--     → observations_grant_rewards 트리거 (0005)
--       → grant_dex_entry() + award_points()
--
-- 지급 경로가 하나뿐이라 멱등성·포인트 규칙이 한 곳에만 존재합니다.
--
-- ── ⚠️ 지금은 사진의 내용을 서버가 확인하지 않습니다 ────────────────────
-- 아이가 무엇을 찍었는지 검증하지 않고 선언한 종을 그대로 인정합니다.
-- 종 판별 Edge Function(classify)이 배포되면 status 를 'pending' 으로 넣고
-- 판별 결과로 확정하는 흐름으로 바꿔야 합니다.
-- **화면에 "AI가 확인했다"고 쓰면 안 됩니다.** model_version 에 'none' 을 남겨
-- 나중에 판별로 얻은 카드와 구분할 수 있게 해 두었습니다.
--
-- ★ 인자로 신원을 받지 않습니다(auth.uid()만). record_checkin 에서 겪은
--   사칭 문제를 애초에 만들지 않기 위해서입니다.
-- ============================================================================

set search_path = public, extensions;

create or replace function public.claim_species_photo(
  p_species_id uuid,
  p_photo_id   uuid
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

  -- 저서생물 윤리 규칙(§7.6-4).
  -- 화면에서 목록을 가려도 id 를 직접 넣을 수 있으므로 지급 시점에 다시 막습니다.
  -- **화면 필터는 안내이지 방어가 아닙니다.**
  if v_species.ethics_flag = 'expert_only' and not public.current_user_is_expert() then
    return jsonb_build_object('ok', false, 'reason', 'expert_only');
  end if;

  if p_photo_id is null
     or not exists (select 1 from public.photos p
                     where p.id = p_photo_id and p.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'photo_not_found');
  end if;

  -- ---------------------------------------------------------------------------
  -- ★ 이미 가진 카드는 관찰을 만들지 않습니다.
  --
  -- observations_grant_rewards 는 **관찰 1건당** 포인트를 줍니다(ref_id = 관찰 id).
  -- 원래 흐름에서는 관찰이 체크인·스팟 후보에 묶여 반복이 제한적이었지만,
  -- 도감에서 사진으로 직접 등록하는 이 경로에는 그런 제약이 없습니다.
  --
  -- 실측: 같은 사진으로 참새를 두 번 등록 → 도감 1장, **포인트 40점**.
  --       같은 사진 한 장으로 무한 반복이 가능했습니다.
  --
  -- 트리거의 포인트 규칙은 건드리지 않습니다 — 그건 판별 흐름의 규칙이고,
  -- 여기서 고치면 두 흐름의 규칙이 서로 달라집니다.
  -- ---------------------------------------------------------------------------
  if exists (select 1 from public.dex_entries
              where user_id = v_uid and species_id = p_species_id) then
    return jsonb_build_object('ok', true, 'is_new', false, 'reason', 'already_owned',
                              'species_id', p_species_id);
  end if;

  -- observations.spot_id 는 NOT NULL 입니다. 이 종이 등장하는 스팟 중 하나를 씁니다.
  -- 어디에도 매핑되지 않은 종(가시박·수달)은 첫 활성 스팟으로 떨어뜨립니다 —
  -- 관찰 자체를 막는 것보다 낫고, 스팟은 현재 하천당 1개라 의미 손실이 작습니다.
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
    'points', public.tier_points(v_species.tier)
  );
end;
$$;

comment on function public.claim_species_photo(uuid, uuid) is
  '사진으로 도감 카드를 얻습니다. observations 에 확정 INSERT → 기존 트리거가 카드·포인트 지급.
   ⚠ 이미 가진 종은 관찰을 만들지 않습니다 — 트리거가 관찰 1건당 포인트를 주므로
     그러지 않으면 같은 사진으로 무한 반복이 가능합니다(실측 확인).
   ⚠ 지금은 사진의 내용을 서버가 확인하지 않습니다. classify 배포 후에는 status=pending 으로
     넣고 판별 결과로 확정하도록 바꿔야 합니다. 화면에서 "AI가 확인했다"고 말하지 마세요.';

revoke execute on function public.claim_species_photo(uuid, uuid) from public, anon;
grant  execute on function public.claim_species_photo(uuid, uuid) to authenticated, service_role;

-- ============================================================================
-- 검증 (실제로 돌려 확인한 항목)
--   참새 등록          → ok, is_new, tier 1, 20점
--   같은 종 재등록      → ok, is_new=false, already_owned, 포인트 변화 없음
--   전문가 전용 종      → expert_only 로 거부
--   남의/없는 사진 id   → photo_not_found 로 거부
--   다른 종 추가        → 왜가리 tier 2 = 30점, 도감 2장
-- ============================================================================
