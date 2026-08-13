-- ============================================================================
-- 0017_mission_photo.sql — 미션 인증 사진
--
-- 계기: tap_target(온천천 수달)·observe_log(대천천 관찰일지)가 "사진을 찍는다"고
--       말만 하고 버튼 탭으로 완료 처리하고 있었습니다. 실제 촬영·업로드로 바꾸면서
--       그 결과물을 미션 기록에 붙입니다.
--
-- 사진 자체의 처리는 이미 있던 것들을 그대로 씁니다:
--   · 브라우저에서 EXIF/GPS 제거 후 업로드 (src/lib/image, PLAN.md §5.2-3)
--   · photos 버킷은 Private, 경로는 photos/{user_id}/... (0007)
--   · photos_insert_self 가 본인·review_status='pending'·NOT is_public 을 강제 (0006)
-- ============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- ⚠ nullable 입니다. 사진 없는 미션(collect)이 있고, 촬영이 실패해도 미션은
--   완료될 수 있어야 합니다 — 카메라 권한이 없다는 이유로 하천 앞까지 걸어온
--   아이의 진행을 막지 않습니다.
--
-- ⚠ on delete set null 입니다. 사진을 파기해도(보관기간·삭제 요구) 미션 완료
--   기록은 남아야 합니다. cascade 로 두면 사진 삭제가 진행 상황까지 지웁니다.
-- ---------------------------------------------------------------------------
alter table public.river_missions
  add column if not exists photo_id uuid references public.photos (id) on delete set null;

comment on column public.river_missions.photo_id is
  '미션 인증 사진. nullable — 촬영에 실패해도 미션은 완료될 수 있습니다.
   사진이 파기되면 null이 되고 미션 완료 기록은 남습니다.';

-- ---------------------------------------------------------------------------
-- 남의 사진을 자기 미션 인증으로 붙이지 못하게 합니다.
--
-- photos_select_self 가 남의 사진을 안 보여주므로 id 를 알아내기는 어렵지만,
-- **"알아내기 어렵다"와 "쓸 수 없다"는 다릅니다.** record_checkin 의 p_user_id 에서
-- 겪은 것과 같은 종류의 구멍이라 같은 방식으로 막습니다.
-- ---------------------------------------------------------------------------
drop policy if exists river_missions_insert_self on public.river_missions;
create policy river_missions_insert_self on public.river_missions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      photo_id is null
      or exists (
        select 1 from public.photos p
        where p.id = photo_id and p.user_id = (select auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- UPDATE 경로가 필요한 이유
--   클라이언트는 upsert(on conflict do update)로 미션을 기록합니다.
--   ⚠ Postgres 에서 ON CONFLICT DO UPDATE 는 **UPDATE 권한을 요구**합니다.
--     0013 은 select/insert 만 부여했으므로, 이 GRANT 가 없으면 두 번째 호출부터
--     권한 오류가 납니다(사진을 나중에 붙이는 경로가 통째로 막힘).
-- ---------------------------------------------------------------------------
drop policy if exists river_missions_update_self on public.river_missions;
create policy river_missions_update_self on public.river_missions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      photo_id is null
      or exists (
        select 1 from public.photos p
        where p.id = photo_id and p.user_id = (select auth.uid())
      )
    )
  );

grant update on public.river_missions to authenticated;

-- ---------------------------------------------------------------------------
-- anon 의 쓰기 권한 회수 (방어 이중화)
--
-- 0013 에서 테이블을 만들 때 Supabase 기본 권한으로 anon 에 INSERT/UPDATE/
-- DELETE/TRUNCATE 가 붙어 있었습니다. 정책이 전부 `to authenticated` 라 실제로는
-- 한 줄도 통과하지 못하지만, **RLS 하나에만 기대고 있는 상태**였습니다.
-- 정책을 실수로 넓히는 순간 곧바로 뚫리므로 권한 자체를 걷습니다.
--
-- 다른 테이블에는 같은 잔여 권한이 없음을 확인했습니다:
--   select table_name, privilege_type from information_schema.role_table_grants
--    where grantee='anon' and table_schema='public'
--      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.river_missions from anon;