-- ============================================================================
-- 0007_storage.sql — 사진 버킷 및 Storage RLS
--
-- 근거: PLAN.md §5.2-3·4 (사진 기본 비공개, EXIF 제거), SETUP.md §1-A-②
--
-- 경로 규칙: photos/{user_id}/{임의 파일명}
--   첫 번째 폴더명이 소유자 uid라 Storage 정책에서 소유권을 O(1)로 판정할 수 있습니다.
--   ⚠ 파일명에 촬영 시각·좌표를 넣지 마세요. 경로도 메타데이터입니다.
--
-- 이 파일은 storage 스키마에 대한 권한이 없을 수 있는 환경(로컬 순수 Postgres 등)을
-- 고려해 전체를 예외 처리로 감쌌습니다. 실패해도 마이그레이션은 중단되지 않고 NOTICE만 남깁니다.
-- ============================================================================

set search_path = public, extensions;

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice '[0007] storage 스키마가 없습니다. Supabase 환경이 아니므로 건너뜁니다.';
    return;
  end if;

  -- 1) 비공개 버킷 생성 (Public 금지 — PLAN.md §5.2-4)
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('photos', 'photos', false, 8388608, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing
  $sql$;

  -- 2) 본인 폴더에만 업로드
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_insert_own_folder'
  ) then
    execute $sql$
      create policy photos_insert_own_folder on storage.objects
        for insert to authenticated
        with check (
          bucket_id = 'photos'
          and (storage.foldername(name))[1] = (select auth.uid())::text
        )
    $sql$;
  end if;

  -- 3) 본인 사진 조회
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_select_own'
  ) then
    execute $sql$
      create policy photos_select_own on storage.objects
        for select to authenticated
        using (
          bucket_id = 'photos'
          and (storage.foldername(name))[1] = (select auth.uid())::text
        )
    $sql$;
  end if;

  -- ❌ 4) v0.5에서 제거: photos_select_by_teacher
  --
  -- 기존 정책은 "담당 교사면 조회 가능"이었고 판정을 public.teaches_user()로 했습니다.
  -- 보호자 계정 전환으로 그 함수가 사라졌는데, 조건절만 지우면
  --   `exists (select 1 from public.photos p where p.storage_path = storage.objects.name)`
  -- 이 남아 **인증된 누구나 모든 사진을 조회**할 수 있게 됩니다.
  -- 정책 3(photos_select_own)이 이미 본인 조회를 담당하므로 정책 자체를 삭제합니다.
  --
  -- ⚠ 교훈: RLS 정책에서 조건 하나만 빼는 리팩터링은 정책을 통째로 지우는 것보다 위험합니다.
  --    남은 조건이 우연히 "항상 참"에 가까우면 정책이 조용히 전면 허용으로 바뀝니다.
  --
  -- 운영자 검수는 service_role(RLS 우회)로 하므로 별도 정책이 필요 없습니다.
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_select_by_teacher'
  ) then
    execute 'drop policy photos_select_by_teacher on storage.objects';
  end if;

  -- 5) 본인 사진 삭제 (잘못 올린 사진 회수 + 90일 파기 정책 대응)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_delete_own'
  ) then
    execute $sql$
      create policy photos_delete_own on storage.objects
        for delete to authenticated
        using (
          bucket_id = 'photos'
          and (storage.foldername(name))[1] = (select auth.uid())::text
        )
    $sql$;
  end if;

  raise notice '[0007] photos 버킷 및 Storage 정책 적용 완료.';

exception
  when insufficient_privilege then
    raise notice '[0007] storage 스키마 권한이 없어 건너뜁니다. Supabase 대시보드에서 photos 버킷(Private)과 정책을 직접 만드세요.';
  when others then
    raise notice '[0007] Storage 설정 중 오류(%): %. 대시보드에서 수동 설정이 필요합니다.', sqlstate, sqlerrm;
end;
$$;

-- ⚠ TODO(검토): 공개 갤러리(§5.2-4)는 아직 Storage 정책이 없습니다.
--   is_public=true 사진을 익명에게 노출하려면 서명 URL(signed URL)을 Edge Function에서 발급하는 방식을 권합니다.
--   버킷 자체를 public으로 바꾸면 경로만 알면 미검수 사진까지 열리므로 절대 금지입니다.
--
-- ⚠ TODO(검토): 90일 파기(§5.2-5)는 스케줄 작업이 필요합니다.
--   pg_cron + Storage 삭제 API로 구성하되, 파기 대상 판정은 consents.expires_at 기준으로 하세요.
