-- ============================================================================
-- 0002_enums.sql — 도메인 열거형
--
-- src/types/domain.ts 의 union 타입을 Postgres ENUM으로 1:1 대응시킵니다.
-- ⚠ 값의 철자·순서를 바꾸면 domain.ts와 계약이 깨집니다. 반드시 함께 고치세요.
--
-- 숫자 union(Tier 1..5, WaterGrade 1..4)은 ENUM이 아니라 smallint + CHECK로 둡니다.
-- 등급은 "3등급 이상"처럼 대소 비교·집계(§7.4 수질 요약)를 해야 하기 때문입니다.
-- ============================================================================

set search_path = public, extensions;

-- domain.ts: Track
create type public.track as enum ('guaranteed', 'challenge');
comment on type public.track is
  '도감 트랙. guaranteed=보장(식물·흔적·시설, 항상 그 자리), challenge=도전(살아 움직이는 동물). PLAN.md §7.2';

-- domain.ts: SpeciesCategory
create type public.species_category as enum (
  'waterbird',   -- 물새
  'smallbird',   -- 작은 새
  'fish',        -- 물고기
  'mammal',      -- 포유류 (수달 등 — 전부 report_only 보호종)
  'insect',      -- 수서곤충
  'benthos',     -- 저서생물 (지표생물)
  'plant',       -- 물가 식물
  'invasive',    -- 생태교란 식물
  'trace',       -- 흔적 (발자국·깃털·껍데기)
  'facility'     -- 장소·시설
);
comment on type public.species_category is '도감 카테고리. domain.ts SpeciesCategory와 1:1.';

-- domain.ts: EthicsFlag — 관찰 윤리를 "안내문"이 아니라 "획득 조건"으로 못박습니다. PLAN.md §7.6
create type public.ethics_flag as enum (
  'none',         -- 제약 없음
  'no_approach',  -- 접근 금지 (근접 촬영 감점)
  'report_only',  -- 촬영 불필요, 목격 보고만으로 획득 (보호종 — 추적 유인 제거)
  'expert_only'   -- 전문가 동반 프로그램에서만 해금 (저서생물 — 돌 뒤집기 방지)
);
comment on type public.ethics_flag is '관찰 윤리 제약. domain.ts EthicsFlag와 1:1. PLAN.md §7.6';

-- domain.ts: ObservationStatus — §7.5 신뢰도 기반 라우팅의 종착점
create type public.observation_status as enum (
  'auto_confirmed',  -- 높은 신뢰도 + 아이 선택 일치 + 하위 등급 → 즉시 확정
  'pending',         -- 검수 큐 대기 (불일치·낮은 신뢰도·상위 등급·보호종)
  'confirmed',       -- 검수 통과
  'corrected',       -- 정정됨 (포인트 차감 없음 — 아이를 처벌하지 않습니다)
  'rejected'         -- 대분류 불일치 (신발/실내/인물)
);
comment on type public.observation_status is '관찰 판정 상태. domain.ts ObservationStatus와 1:1. PLAN.md §7.5';

-- domain.ts: PointReason
create type public.point_reason as enum (
  'checkin',           -- 스팟 체크인 +10
  'species_found',     -- 생물 발견 (등급별 20~60)
  'observation_log',   -- 관찰 일지 +10 (빈손 방지)
  'quiz_correct',      -- 퀴즈 정답 +15
  'quiz_wrong',        -- 퀴즈 오답 +5 (이탈 방지)
  'course_complete',   -- 코스 완주 +100
  'dex_set_complete',  -- 도감 세트 완성 +80
  'river_milestone'    -- 하천 3개 완주 +300
);
comment on type public.point_reason is
  '포인트 적립 사유. domain.ts PointReason과 1:1. 값 자체가 "왜 생긴 포인트인가"의 감사 근거입니다.';

-- ---------------------------------------------------------------------------
-- 아래는 domain.ts에 아직 타입이 없는 서버측 열거형입니다.
-- 클라이언트에 노출되면 domain.ts에 대응 타입을 추가해야 합니다.
-- ---------------------------------------------------------------------------

-- 동반 아동 정보 최소화(PLAN.md §5.2-2): 생년월일 대신 학년대역만, 그마저도 선택값입니다.
create type public.grade_band as enum ('g3_4', 'g5_6');
comment on type public.grade_band is
  '동반 아동 학년대역. 3~4학년 / 5~6학년. 생년월일·나이를 받지 않기 위한 최소 단위이며
   v0.5에서 users.grade_band는 NULL 허용으로 완화됐습니다(아동 정보를 필수로 받지 않음). PLAN.md §5.2';

-- 체크인 수단
create type public.checkin_method as enum (
  'gps',                -- 브라우저 위치 + 서버 ST_DWithin 판정 (기본)
  'qr',                 -- 현장 QR (GPS 불량 구간 대체 수단)
  'operator_override'   -- 운영자가 수동 인정 (v0.5 이전: teacher_override). PLAN.md §6.4
);
comment on type public.checkin_method is '체크인 검증 수단. visits.method에 기록됩니다.';

-- 사진 검수 상태 (PLAN.md §5.2-3·4)
create type public.photo_review_status as enum ('pending', 'approved', 'rejected');
comment on type public.photo_review_status is
  '사진 검수 상태. 기본 pending이며, 인물 포함·부적절 사진은 rejected 후 즉시 삭제 대상입니다.';

-- 스팟 부가 콘텐츠 종류
create type public.spot_content_kind as enum (
  'story',    -- 도착 스토리 보조 텍스트
  'history',  -- 지역사·복원사
  'safety',   -- 안전 안내
  'media',    -- 사진·삽화
  'extra'     -- 기타
);
comment on type public.spot_content_kind is '스팟 부가 콘텐츠 종류. spot_contents.kind.';

-- 보호자 본인(성인) 동의 획득 방식 (PLAN.md §5.1)
create type public.consent_method as enum (
  'in_app',           -- 앱 최초 실행 시 본인 동의 (기본 경로)
  'guardian_link',    -- 전달받은 링크에서 동의
  'guardian_onsite'   -- 현장 프로그램에서 직접 동의
);
comment on type public.consent_method is
  '보호자 본인(성인) 동의 획득 방식. v0.5 이전에는 법정대리인 동의였고 teacher_bulk(학급 일괄)가 있었습니다.
   계정 주체가 성인이 되어 §22조의2 적용이 해소됐습니다. 동의 "사실"만 기록하고 신원 정보는 저장하지 않습니다.';
