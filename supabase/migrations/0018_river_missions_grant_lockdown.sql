-- ============================================================================
-- 0018_river_missions_grant_lockdown.sql — river_missions 잔여 GRANT 정리
--
-- 계기: 문서 작성 중 발견. 0013 에서 이 테이블을 만들 때 `revoke all` 을 먼저
--       하지 않아 Supabase 기본 GRANT ALL 이 남아 있었습니다.
--       0006 §14가 다른 테이블 전부에 적용한 원칙이 이 테이블에만 빠졌습니다.
--
-- 실측 결과 (수정 전):
--   anon           DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   authenticated  DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   (같은 문제가 있는 테이블은 river_missions 하나뿐임을 확인했습니다.)
--
-- ── ★ TRUNCATE 가 왜 특히 문제인가 ──────────────────────────────────────
-- **TRUNCATE 는 RLS 의 적용을 받지 않습니다.** Postgres 에 명시된 동작이며,
-- DELETE 와 달리 정책이 한 줄도 관여하지 않습니다.
--
-- 즉 "DELETE 정책이 없으니 지울 수 없다"는 판단이 TRUNCATE 에는 **통하지 않습니다.**
-- 이 테이블에는 DELETE 정책이 없어서 DELETE 는 실제로 막혀 있었지만,
-- TRUNCATE 는 같은 논리로 안전하지 않습니다. PostgREST 가 TRUNCATE 를 노출하지는
-- 않으므로 당장의 경로는 없었지만, 있을 이유가 없는 권한입니다.
--
-- 교훈: RLS 는 만능이 아닙니다. TRUNCATE 처럼 정책을 우회하는 명령이 있으므로
--       GRANT 자체를 최소로 유지하는 이중 방어가 필요합니다.
-- ============================================================================

set search_path = public, extensions;

revoke delete, truncate, references, trigger on public.river_missions from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.river_missions from anon;

-- 남는 것:
--   anon           SELECT (정책이 없어 실제로는 0행)
--   authenticated  SELECT, INSERT, UPDATE  ← upsert 에 UPDATE 가 필요합니다
--
-- 확인:
--   select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_schema='public' and table_name='river_missions'
--      and grantee in ('anon','authenticated') group by grantee;
