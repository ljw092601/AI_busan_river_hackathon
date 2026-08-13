-- ============================================================================
-- 0001_extensions.sql — 확장 · 공용 유틸리티
--
-- 부산 하천 탐험대 (PLAN.md §4 데이터 모델)
-- 이 파일부터 0007까지 번호 순서대로 실행하면 스키마 전체가 올라갑니다.
-- ============================================================================

-- Supabase 관례상 확장은 public이 아닌 extensions 스키마에 설치합니다.
-- (public에 PostGIS 수백 개 함수가 쏟아지면 PostgREST 스키마 캐시가 비대해집니다)
create schema if not exists extensions;

-- PostGIS — 체크인 반경 판정(ST_DWithin)의 전제. PLAN.md §4.2
-- ⚠ 이 확장이 없으면 spots.geom 생성부터 실패합니다.
create extension if not exists postgis with schema extensions;

-- gen_random_uuid() 용. PG13+ 내장이지만 명시적으로 보장해 둡니다.
create extension if not exists pgcrypto with schema extensions;

-- 이후 모든 마이그레이션은 이 search_path를 전제로 합니다.
-- (생성 컬럼·함수 본문의 ST_* 참조가 DDL 시점에 해석되어 저장됩니다)
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 공용 트리거 함수: updated_at 자동 갱신
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'updated_at 컬럼을 now()로 갱신하는 공용 BEFORE UPDATE 트리거 함수.';

-- ---------------------------------------------------------------------------
-- 공용 트리거 함수: append-only 강제
--   포인트 원장처럼 "고쳐 쓰면 안 되는" 테이블에 붙입니다.
--   정정이 필요하면 반대 부호의 새 행(보정 전표)을 넣습니다 — 회계와 동일한 방식.
-- ---------------------------------------------------------------------------
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception
    '% 테이블은 append-only입니다. 수정·삭제 대신 반대 부호의 보정 행을 추가하세요.',
    tg_table_name
    using errcode = '42501';
end;
$$;

comment on function public.forbid_mutation() is
  'UPDATE/DELETE를 예외로 차단하는 트리거 함수. points_ledger 등 원장 테이블 전용.';
