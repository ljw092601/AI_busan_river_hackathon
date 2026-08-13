-- ============================================================================
-- 0006_rls.sql — Row Level Security 정책 및 권한
--
-- 원칙 (PLAN.md §5):
--   ① 보호자 계정은 본인(=가족) 데이터만 본다.
--   ② v0.5: 교차 계정 접근(교사→학생)이 사라져 정책이 `= auth.uid()` 한 줄로 단순해졌습니다.
--   ③ 사진은 기본 비공개. 공개는 별도 동의 + 검수 통과 건에 한한다.
--   ④ 원장(points_ledger)·도감(dex_entries)·방문(visits)은 클라이언트가 직접 쓰지 못한다.
--      전부 SECURITY DEFINER 함수(0005)를 통해서만 기록됩니다 — 포인트 위조를 원천 차단합니다.
--
-- 모든 정책에서 auth.uid()를 (select auth.uid()) 형태로 감쌌습니다.
-- 이렇게 하면 행마다 재평가되지 않고 InitPlan으로 한 번만 계산되어 대량 조회가 훨씬 빠릅니다.
-- ============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- RLS 활성화 — 예외 없이 전 테이블
-- ---------------------------------------------------------------------------
alter table public.consents          enable row level security;
alter table public.rivers            enable row level security;
alter table public.users             enable row level security;
alter table public.spots             enable row level security;
alter table public.spot_contents     enable row level security;
alter table public.quizzes           enable row level security;
alter table public.visits            enable row level security;
alter table public.photos            enable row level security;
alter table public.quiz_attempts     enable row level security;
alter table public.points_ledger     enable row level security;
alter table public.badges            enable row level security;
alter table public.user_badges       enable row level security;
alter table public.species           enable row level security;
alter table public.river_species     enable row level security;
alter table public.spot_species      enable row level security;
alter table public.observations      enable row level security;
alter table public.dex_entries       enable row level security;
alter table public.observation_logs  enable row level security;

-- ---------------------------------------------------------------------------
-- 1. 공개 콘텐츠 — 누구나 읽기, 쓰기는 service_role만
--    (QR 링크로 들어온 미로그인 방문자도 코스와 도감을 둘러볼 수 있어야 합니다. PLAN.md §3)
-- ---------------------------------------------------------------------------
create policy rivers_read_all        on public.rivers        for select to anon, authenticated using (true);
create policy spots_read_all         on public.spots         for select to anon, authenticated using (is_active);
create policy spot_contents_read_all on public.spot_contents for select to anon, authenticated using (true);
create policy quizzes_read_all       on public.quizzes       for select to anon, authenticated using (true);
create policy species_read_all       on public.species       for select to anon, authenticated using (true);
create policy river_species_read_all on public.river_species for select to anon, authenticated using (true);
create policy spot_species_read_all  on public.spot_species  for select to anon, authenticated using (true);
create policy badges_read_all        on public.badges        for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2. users.expert_program 자가 승격 방지
--
-- ❌ v0.5에서 teachers 테이블과 그 정책은 제거했습니다.
-- ✅ 다만 "본인이 올릴 수 없는 플래그"라는 보호 패턴은 users.expert_program으로 옮겼습니다.
--    이 값이 true면 저서생물(⭐⭐⭐, expert_only) 카드가 해금되므로(§7.6-4),
--    보호자가 스스로 켜면 "돌 뒤집지 않기" 약속을 앱이 스스로 무력화하는 셈이 됩니다.
--
-- 정책의 WITH CHECK 안에서 users를 다시 조회하면 "infinite recursion detected in policy"가 나므로,
-- 트리거로 막습니다 — 클라이언트 요청(role=authenticated)에서 온 변경은 조용히 원래 값으로 되돌립니다.
-- ---------------------------------------------------------------------------
create or replace function public.tg_users_protect_expert_program()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.expert_program is distinct from old.expert_program
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    new.expert_program := old.expert_program;
  end if;
  return new;
end;
$$;

comment on function public.tg_users_protect_expert_program() is
  '전문가 동반 프로그램 플래그의 자가 승격을 막습니다. 프로그램 참가 확정 시 운영자(service_role)만 부여합니다.
   PLAN.md §7.6-4 — 저서생물 카드는 전문가 동반일 때만 해금됩니다.';

create trigger users_protect_expert_program
  before update on public.users
  for each row execute function public.tg_users_protect_expert_program();

-- ---------------------------------------------------------------------------
-- 3. users — 본인(가족)만. v0.5로 교차 계정 접근이 사라졌습니다.
-- ---------------------------------------------------------------------------
create policy users_select_self on public.users
  for select to authenticated
  using (id = (select auth.uid()));

create policy users_insert_self on public.users
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy users_update_self on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. consents — 본인이 연결된 동의 레코드만
-- ---------------------------------------------------------------------------
create policy consents_insert_any on public.consents
  for insert to authenticated
  with check (true);

create policy consents_select_linked on public.consents
  for select to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.consent_id = consents.id
        and u.id = (select auth.uid())
    )
  );

comment on policy consents_insert_any on public.consents is
  '동의 레코드는 users에 연결되기 전에 먼저 만들어지므로 INSERT 시점에는 소유자를 판정할 수 없습니다.
   식별정보가 없는 테이블이라 위험이 낮아 INSERT는 열되, 조회는 연결된 본인 계정으로 제한합니다.';

-- ---------------------------------------------------------------------------
-- ❌ 5. classes / class_members — v0.5에서 전체 제거
--    테이블 자체가 없어졌습니다(0003 참조). 참여코드로 합류하는 개념이 사라지고
--    한 계정 = 한 가족 = 하나의 도감이 되었습니다. PLAN.md §5.1, §6.3
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 6. visits — 읽기만. 쓰기는 record_checkin()(SECURITY DEFINER) 전용
-- ---------------------------------------------------------------------------
create policy visits_select_self on public.visits
  for select to authenticated
  using (user_id = (select auth.uid()));


comment on table public.visits is
  '★ 체크인 기록. 위도·경도 컬럼이 없습니다 — 이것은 누락이 아니라 설계입니다.
   서버는 좌표를 인자로 받아 반경 내 여부만 판정하고 응답 직후 폐기합니다. DB에는 "○○스팟을 △시에 통과함"만 남습니다.
   개인위치정보의 계속 수집·보관에 해당하지 않도록 하기 위한 구조입니다. PLAN.md §5.2-1
   ⚠ lat/lng는 물론 distance_m(스팟까지의 거리)도 저장하면 안 됩니다.
      스팟 좌표가 공개값이므로 거리 하나만 있어도 이용자의 위치가 원형 띠로 복원됩니다.
   ⚠ INSERT 정책이 없습니다. 클라이언트가 직접 방문 기록을 만들 수 없고,
      반드시 public.record_checkin()을 거쳐야 좌표 검증이 보장됩니다.';

-- ---------------------------------------------------------------------------
-- 7. photos — 기본 비공개
-- ---------------------------------------------------------------------------
create policy photos_select_self on public.photos
  for select to authenticated
  using (user_id = (select auth.uid()));


-- 공개 갤러리: 별도 동의 + 검수 통과 건만. is_public은 CHECK 제약으로도 approved를 요구합니다.
create policy photos_select_public on public.photos
  for select to anon, authenticated
  using (is_public and review_status = 'approved');

-- 업로드는 항상 미검수·비공개 상태로만 들어옵니다. 아이가 스스로 승인하거나 공개할 수 없습니다.
create policy photos_insert_self on public.photos
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and review_status = 'pending'
    and not is_public
  );

create policy photos_delete_self on public.photos
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- 검수(review_status 변경)는 운영자가 service_role로 수행합니다. UPDATE 정책을 두지 않은 것이 그 집행입니다.

-- ---------------------------------------------------------------------------
-- 8. quiz_attempts
-- ---------------------------------------------------------------------------
create policy quiz_attempts_select_self on public.quiz_attempts
  for select to authenticated
  using (user_id = (select auth.uid()));


create policy quiz_attempts_insert_self on public.quiz_attempts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- TODO(검토): is_correct를 클라이언트가 보내므로 위조가 가능합니다(정답 15P / 오답 5P, 차이 10P).
--   유인이 작아 MVP에서는 수용했습니다. 문제가 되면 채점 RPC(정답 비교 후 INSERT)로 바꾸고
--   이 INSERT 정책을 제거하세요.

-- ---------------------------------------------------------------------------
-- 9. points_ledger — 읽기만. 쓰기는 award_points()(SECURITY DEFINER) 전용
-- ---------------------------------------------------------------------------
create policy points_ledger_select_self on public.points_ledger
  for select to authenticated
  using (user_id = (select auth.uid()));


-- ---------------------------------------------------------------------------
-- 10. user_badges
-- ---------------------------------------------------------------------------
create policy user_badges_select_self on public.user_badges
  for select to authenticated
  using (user_id = (select auth.uid()));


-- ---------------------------------------------------------------------------
-- 11. observations — 이용자는 등록만, 판정은 서버·운영자가
-- ---------------------------------------------------------------------------
create policy observations_select_self on public.observations
  for select to authenticated
  using (user_id = (select auth.uid()));


create policy observations_insert_self on public.observations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    -- 아이는 항상 '검수 대기'로만 등록합니다. auto_confirmed 라우팅은 서버(§7.5 ④)의 판단입니다.
    and status = 'pending'
    -- 모델 결과를 클라이언트가 채워 넣을 수 없습니다.
    and model_species_id is null
    and model_confidence is null
    and final_species_id is null
    and reviewed_by is null
  );


comment on policy observations_insert_self on public.observations is
  '아이의 관찰 등록. declared_species_id(아이 선택)만 넣을 수 있고 판정 관련 컬럼은 전부 막습니다.
   DELETE 정책도 없습니다 — 관찰 이벤트는 시민과학 데이터의 원천이라 임의 삭제되면 안 됩니다(§7.8).
   잘못 등록한 건은 운영자가 service_role로 status=rejected 처리합니다.';

-- ---------------------------------------------------------------------------
-- 12. dex_entries — 읽기만. 쓰기는 grant_dex_entry()(SECURITY DEFINER) 전용
-- ---------------------------------------------------------------------------
create policy dex_entries_select_self on public.dex_entries
  for select to authenticated
  using (user_id = (select auth.uid()));


-- ---------------------------------------------------------------------------
-- 13. observation_logs
-- ---------------------------------------------------------------------------
create policy observation_logs_select_self on public.observation_logs
  for select to authenticated
  using (user_id = (select auth.uid()));


create policy observation_logs_insert_self on public.observation_logs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 14. 테이블 권한 — RLS 위에 한 겹 더.
--     RLS는 "어떤 행"을, GRANT는 "어떤 동작"을 막습니다. 둘 다 걸어야 실수에 강합니다.
-- ---------------------------------------------------------------------------

-- 공개 콘텐츠: 읽기 전용
revoke all on
  public.rivers, public.spots, public.spot_contents, public.quizzes,
  public.species, public.river_species, public.spot_species, public.badges
from anon, authenticated;

grant select on
  public.rivers, public.spots, public.spot_contents, public.quizzes,
  public.species, public.river_species, public.spot_species, public.badges
to anon, authenticated;

-- 원장·도감·방문·뱃지 획득: 클라이언트는 읽기만 (쓰기는 SECURITY DEFINER 함수 경유)
revoke all on public.points_ledger, public.dex_entries, public.visits, public.user_badges
  from anon, authenticated;
grant select on public.points_ledger, public.dex_entries, public.visits, public.user_badges
  to authenticated;

-- 사용자 데이터
revoke all on
  public.users, public.consents,
  public.photos, public.quiz_attempts, public.observations, public.observation_logs
from anon, authenticated;

grant select, insert, update            on public.users            to authenticated;
grant select, insert                    on public.consents         to authenticated;
grant select, insert, update, delete    on public.photos           to authenticated;
grant select, insert                    on public.quiz_attempts    to authenticated;
grant select, insert, update            on public.observations     to authenticated;
grant select, insert                    on public.observation_logs to authenticated;

-- 공개 갤러리(검수 통과 + is_public)는 미로그인 사용자도 볼 수 있어야 합니다.
grant select on public.photos to anon;

revoke all on public.v_point_balances from anon, authenticated;
grant select on public.v_point_balances to authenticated;

-- ---------------------------------------------------------------------------
-- 15. 함수 실행 권한
--     체크인 계열은 Edge Function(service_role) 전용입니다. 클라이언트가 직접 호출하면
--     §4.3의 "Edge Function이 정확도·순간이동을 먼저 검사한다"는 층이 통째로 우회됩니다.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.verify_checkin(uuid, double precision, double precision, double precision),
  public.record_checkin(uuid, double precision, double precision, double precision, uuid, public.checkin_method),
  public.award_points(uuid, integer, public.point_reason, text, uuid, text),
  public.grant_dex_entry(uuid, uuid, uuid, timestamptz)
from public, anon, authenticated;

grant execute on function
  public.verify_checkin(uuid, double precision, double precision, double precision),
  public.record_checkin(uuid, double precision, double precision, double precision, uuid, public.checkin_method),
  public.award_points(uuid, integer, public.point_reason, text, uuid, text),
  public.grant_dex_entry(uuid, uuid, uuid, timestamptz)
to service_role;


-- 클라이언트가 직접 호출해도 안전한 것들
grant execute on function
  public.point_balance(uuid),
  public.spot_candidate_species(uuid, integer),
  public.dex_summary_by_tier(uuid, uuid),
  public.can_unlock_expert(uuid),
  public.tier_points(smallint)
to authenticated;

grant execute on function public.spot_candidate_species(uuid, integer) to anon;
