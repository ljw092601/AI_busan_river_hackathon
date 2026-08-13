-- ============================================================================
-- 0003_core_tables.sql — 계정 · 콘텐츠 · 방문 · 포인트 원장
--
-- 근거: PLAN.md §4.2 데이터 모델, §5 개인정보 설계, src/types/domain.ts
--
-- 이 파일의 두 가지 비자명한 설계 결정 (타협 불가):
--   ① visits에 위도·경도 컬럼이 없습니다.        → PLAN.md §5.2-1
--   ② 포인트에 잔액 컬럼이 없습니다(원장 방식).   → PLAN.md §4.2 설계 노트
-- 각 테이블 주석에 이유를 남겼습니다.
-- ============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- consents — 보호자 본인 동의 이력 (성인)
-- ---------------------------------------------------------------------------
create table public.consents (
  id            uuid primary key default gen_random_uuid(),
  method        public.consent_method not null,
  consented_at  timestamptz not null default now(),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  -- 동의 범위(사진 업로드 / 공개 갤러리 게시 등)를 항목별로 남깁니다.
  scope         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),

  constraint consents_period_valid check (expires_at is null or expires_at > consented_at)
);

comment on table public.consents is
  '보호자 본인(성인) 동의 이력. v0.5 이전에는 법정대리인 동의였습니다 — 계정 주체가 성인이 되어
   개인정보보호법 §22조의2 적용이 해소됐습니다(PLAN.md §5.1). users와 분리 보관하는 이유는 그대로입니다:
   동의 "사실"과 계정 프로필의 수명이 다르기 때문입니다.
   ⚠ 실명·연락처·서명 이미지 등 식별정보 컬럼을 여기에 추가하지 마세요. 동의 사실만 남깁니다.';
comment on column public.consents.scope is
  '동의 항목별 세부 범위. 예: {"photo_upload": true, "public_gallery": false}. 공개 갤러리는 별도 동의 필요(§5.2-4).';
comment on column public.consents.expires_at is
  '동의 만료 시각. 시범사업 종료 후 90일 파기 정책(§5.2-5)의 기준점으로 씁니다.';

-- ---------------------------------------------------------------------------
-- ❌ v0.5에서 제거: teachers
--    보호자 계정 전환으로 교사 개념이 사라졌습니다. PLAN.md §5.1
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- rivers — 하천(코스)
-- ---------------------------------------------------------------------------
create table public.rivers (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name         text not null,
  region       text not null,
  summary      text not null default '',
  source_desc  text,   -- 발원 설명
  mouth_desc   text,   -- 하구·합류 설명
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.rivers is '하천 = 하나의 코스. domain.ts River와 대응(source_desc·mouth_desc는 서버 전용 부가 필드).';
comment on column public.rivers.slug is 'URL 식별자. 예: oncheoncheon. 소문자·숫자·하이픈만.';

-- ---------------------------------------------------------------------------
-- ❌ v0.5에서 제거: classes / class_members
--    학급 참여코드 시나리오가 범위에서 빠졌습니다. PLAN.md §5.1
--    한 계정 = 한 가족 = 하나의 도감이므로 소속 개념 자체가 없습니다(§6.3).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- users — 보호자 계정 (성인). 1행 = 가족 1팀 = 도감 1벌
-- ---------------------------------------------------------------------------
create table public.users (
  id             uuid primary key references auth.users (id) on delete cascade,
  nickname       text not null check (char_length(nickname) between 1 and 20),
  avatar_seed    text not null default replace(gen_random_uuid()::text, '-', ''),
  -- 동반 아동의 학년대역. 콘텐츠 난이도 조절에만 쓰이는 선택값입니다.
  grade_band     public.grade_band,
  consent_id     uuid references public.consents (id) on delete set null,
  -- 전문가 동반 프로그램 참여 여부. true일 때만 ethics_flag='expert_only' 종(저서생물)이 해금됩니다.
  expert_program boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.users is
  '보호자 계정(성인). 1행 = 가족 1팀 = 도감 1벌. PLAN.md §6.3
   ⚠ 실명·생년월일·연락처·주소 컬럼을 추가하지 마세요. 보호자에 대해서도 최소수집입니다(§5.2-2).
   ⚠⚠ **동반 아동의 정보를 담는 컬럼은 어떤 것도 추가하지 마세요** — 이름·나이·학교·사진 전부.
   계정 주체가 성인으로 바뀌어 법정대리인 동의 의무는 사라졌지만,
   아동 정보를 받는 순간 그 층이 통째로 되돌아옵니다.';
comment on column public.users.avatar_seed is
  '아바타 생성용 난수 시드. 얼굴 사진 대신 절차적 아바타를 쓰기 위한 값입니다(§5.2-3 얼굴 원천 차단).';
comment on column public.users.grade_band is
  '동반 아동 학년대역. v0.5에서 NOT NULL → NULL 허용으로 완화했습니다.
   아동 정보를 필수로 받지 않겠다는 §5.2-2의 집행이며, NULL이면 3~4학년 기준으로 표시합니다.';
comment on column public.users.consent_id is
  '보호자 본인 동의 레코드(성인). NULL이면 체크인이 거부됩니다(public.record_checkin 참조).';
comment on column public.users.expert_program is
  '전문가 동반 프로그램 참여 여부. 저서생물 카드(⭐⭐⭐, expert_only)는 이 값이 true일 때만 해금합니다.
   v0.5 이전에는 classes.expert_program이었습니다. PLAN.md §7.6-4';

-- ---------------------------------------------------------------------------
-- spots — 스팟
-- ---------------------------------------------------------------------------
create table public.spots (
  id                  uuid primary key default gen_random_uuid(),
  river_id            uuid not null references public.rivers (id) on delete cascade,
  seq                 smallint not null check (seq > 0),
  name                text not null,
  theme               text not null default '',
  geom                geography(Point, 4326) not null,
  radius_m            integer not null default 80 check (radius_m between 20 and 300),
  arrival_story       text not null default '',
  safety_note         text not null default '',
  photo_mission       text,
  accessibility_note  text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- 클라이언트(지도 핀)용 좌표. geom이 단일 진실이고 아래 둘은 파생값이라 드리프트가 없습니다.
  lat  double precision generated always as (ST_Y(geom::geometry)) stored,
  lng  double precision generated always as (ST_X(geom::geometry)) stored,

  constraint spots_seq_unique unique (river_id, seq)
);

comment on table public.spots is
  '코스 상의 스팟. 좌표는 geography(Point,4326) 하나로만 보관하고 lat/lng는 생성 컬럼으로 파생시킵니다.
   반경 판정은 반드시 서버에서 ST_DWithin으로 합니다 — 클라이언트 거리 계산은 조작 가능하기 때문입니다. PLAN.md §4.2';
comment on column public.spots.radius_m is
  '체크인 허용 반경(m). 고층건물·교량 인접 구간은 GPS 오차가 커서 스팟별로 개별 튜닝합니다(50~150m). PLAN.md §11';
comment on column public.spots.geom is
  'WGS84 지리 좌표. GEOMETRY가 아니라 GEOGRAPHY를 쓰는 이유: ST_DWithin/ST_Distance가 도(degree)가 아닌 미터로 계산되어
   투영 변환 없이 "80m 이내"를 그대로 표현할 수 있습니다.';
comment on column public.spots.lat is '지도 표시용 위도(파생값). domain.ts Spot.lat 대응.';
comment on column public.spots.lng is '지도 표시용 경도(파생값). domain.ts Spot.lng 대응.';

create index spots_geom_gix on public.spots using gist (geom);
create index spots_river_seq_idx on public.spots (river_id, seq);

-- ---------------------------------------------------------------------------
-- spot_contents — 스팟 부가 콘텐츠
-- ---------------------------------------------------------------------------
create table public.spot_contents (
  id         uuid primary key default gen_random_uuid(),
  spot_id    uuid not null references public.spots (id) on delete cascade,
  kind       public.spot_content_kind not null,
  seq        smallint not null default 1,
  title      text,
  body       text,
  media_url  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.spot_contents is
  '스팟의 추가 카드(복원 전후 사진, 지역사 자료 등). 도착 스토리 본문은 spots.arrival_story에 있습니다.';

create index spot_contents_spot_idx on public.spot_contents (spot_id, kind, seq);

-- ---------------------------------------------------------------------------
-- quizzes — 퀴즈
-- ---------------------------------------------------------------------------
create table public.quizzes (
  id           uuid primary key default gen_random_uuid(),
  spot_id      uuid not null references public.spots (id) on delete cascade,
  seq          smallint not null default 1,
  question     text not null,
  options      text[] not null,
  answer_idx   smallint not null check (answer_idx >= 0),
  explanation  text not null default '',
  difficulty   smallint not null default 1 check (difficulty between 1 and 3),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint quizzes_options_len   check (cardinality(options) between 2 and 5),
  constraint quizzes_answer_in_range check (answer_idx < cardinality(options))
);

comment on table public.quizzes is
  '스팟별 퀴즈. options를 JSONB가 아니라 text[]로 둔 이유: domain.ts Quiz.options가 string[]이고,
   배열 길이와 answer_idx의 정합성을 CHECK 제약으로 DB에서 강제할 수 있기 때문입니다(PLAN.md §4.2의 JSONB 안에서 벗어남).';
comment on column public.quizzes.answer_idx is 'options 배열의 정답 인덱스(0부터). cardinality(options)보다 작아야 합니다.';

create index quizzes_spot_idx on public.quizzes (spot_id, seq);

-- TODO(검토): answer_idx가 클라이언트에 그대로 내려갑니다. 정답을 미리 볼 수 있다는 뜻입니다.
--   오답에도 5P를 주는 설계(§3)라 부정 유인이 매우 낮아 MVP에서는 수용했습니다.
--   문제가 되면 정답·해설을 quiz_answers 테이블로 분리하고 채점 RPC만 노출하세요.

-- ---------------------------------------------------------------------------
-- visits — 체크인 기록  ★ 좌표를 저장하지 않습니다
-- ---------------------------------------------------------------------------
create table public.visits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  spot_id       uuid not null references public.spots (id) on delete cascade,
  verified_at   timestamptz not null default now(),
  method        public.checkin_method not null default 'gps',
  accuracy_m    real check (accuracy_m >= 0),
  anomaly_flag  text,
  created_at    timestamptz not null default now()
);

comment on table public.visits is
  '★ 체크인 기록. 위도·경도 컬럼이 없습니다 — 이것은 누락이 아니라 설계입니다.
   서버는 좌표를 인자로 받아 반경 내 여부만 판정하고 응답 직후 폐기합니다. DB에는 "○○스팟을 △시에 통과함"만 남습니다.
   개인위치정보의 계속 수집·보관에 해당하지 않도록 하기 위한 구조입니다. PLAN.md §5.2-1
   ⚠ lat/lng는 물론 distance_m(스팟까지의 거리)도 저장하면 안 됩니다.
      스팟 좌표가 공개값이므로 거리 하나만 있어도 이용자의 위치가 원형 띠로 복원됩니다.';
comment on column public.visits.accuracy_m is
  'GPS 보고 정확도(m). 좌표가 아니라 오차 반경 수치일 뿐이라 위치를 복원할 수 없습니다.
   이상 탐지(§6.4 2층)와 스팟별 반경 튜닝 근거로만 씁니다.';
comment on column public.visits.anomaly_flag is
  '순간이동 등 이상 징후 태그(§6.4 3층). 차단이 아니라 플래그입니다 — 오탐으로 아이의 성과를 지우지 않기 위해서입니다.
   속도 계산은 사용자 좌표가 아니라 "직전 스팟 ↔ 현재 스팟"의 공개 좌표 거리로 합니다.';

create index visits_user_idx on public.visits (user_id, verified_at desc);
create index visits_spot_idx on public.visits (spot_id, verified_at desc);

-- 같은 스팟 같은 날 중복 체크인 방지 (포인트 반복 적립 차단).
-- TODO(검토): 오전 방문 후 오후 재방문 같은 정상 케이스도 함께 막힙니다.
--   계절 재방문(§7.7)은 날짜가 다르므로 영향 없습니다. 파일럿에서 민원이 있으면 완화하세요.
create unique index visits_one_per_day_uq
  on public.visits (user_id, spot_id, ((verified_at at time zone 'Asia/Seoul')::date));

-- ---------------------------------------------------------------------------
-- photos — 사진
-- ---------------------------------------------------------------------------
create table public.photos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  visit_id       uuid references public.visits (id) on delete set null,
  spot_id        uuid references public.spots (id) on delete set null,
  storage_path   text not null unique,
  mission_tag    text,
  review_status  public.photo_review_status not null default 'pending',
  reviewed_by    uuid references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  exif_stripped  boolean not null default false,
  is_public      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- EXIF 잔존 검사를 통과하지 않은 파일은 승인될 수 없습니다 (이중 방어의 DB측 마지막 관문).
  constraint photos_approved_requires_exif_check
    check (review_status <> 'approved' or exif_stripped),
  -- 공개는 검수 통과 건에 한합니다 (§5.2-4).
  constraint photos_public_requires_approval
    check (not is_public or review_status = 'approved')
);

comment on table public.photos is
  '사진. 기본 비공개(is_public=false)이며 해당 계정만 조회 가능합니다. PLAN.md §5.2-4
   PLAN.md §4.2에서는 photos가 visit_id에만 매달려 있었지만, 관찰(observations)은 체크인 없이도 성립할 수 있어
   user_id·spot_id를 직접 갖도록 바꿨습니다(visit_id는 nullable).';
comment on column public.photos.exif_stripped is
  '★ 클라이언트가 업로드 전 EXIF를 전량 제거했고, 서버 도착 후 잔존 검사도 통과했음을 뜻합니다.
   EXIF에는 촬영 GPS가 들어 있어, 이 값이 false인 파일을 승인하면 §5의 좌표 미수집 설계가 사진으로 되살아납니다.
   PLAN.md §5.2-3, §7.5 제약③';
comment on column public.photos.is_public is
  '공개 갤러리 게시 여부. 별도 동의(consents.scope) + 검수 통과 건에만 true. 기본은 항상 false입니다.';

create index photos_user_idx on public.photos (user_id, created_at desc);
create index photos_visit_idx on public.photos (visit_id);
create index photos_review_queue_idx on public.photos (created_at)
  where review_status = 'pending';

-- ---------------------------------------------------------------------------
-- quiz_attempts — 퀴즈 응답
-- ---------------------------------------------------------------------------
create table public.quiz_attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  quiz_id       uuid not null references public.quizzes (id) on delete cascade,
  selected_idx  smallint check (selected_idx >= 0),
  is_correct    boolean not null,
  attempted_at  timestamptz not null default now()
);

comment on table public.quiz_attempts is
  '퀴즈 응답 이력. 재시도를 허용하되 포인트는 첫 시도에만 지급합니다(트리거에서 처리).
   오답도 이력을 남기는 이유: 어떤 문항이 반복적으로 틀리는지가 곧 콘텐츠 개선 지표이기 때문입니다.';

create index quiz_attempts_user_idx on public.quiz_attempts (user_id, attempted_at desc);
create index quiz_attempts_quiz_idx on public.quiz_attempts (quiz_id);

-- ---------------------------------------------------------------------------
-- points_ledger — 포인트 원장  ★ 잔액 컬럼 없음
-- ---------------------------------------------------------------------------
create table public.points_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  delta       integer not null,
  reason      public.point_reason not null,
  ref_type    text,
  ref_id      uuid,
  note        text,
  created_at  timestamptz not null default now()
);

comment on table public.points_ledger is
  '★ 포인트 원장(append-only). users.points 같은 잔액 컬럼을 두지 않습니다 — PLAN.md §4.2 설계 노트.
   잔액 컬럼은 동시 갱신에서 유실되기 쉽고 "이 포인트가 왜 생겼지?"를 추적할 수 없습니다.
   원장이면 잔액은 SUM(delta)이고, 굿즈 교환 분쟁·부정 적립 회수·통계가 전부 이 테이블 하나에서 해결됩니다.
   정정이 필요하면 행을 고치지 말고 반대 부호의 보정 행을 추가하세요(UPDATE/DELETE는 트리거가 차단합니다).';
comment on column public.points_ledger.delta is '증감분. 잔액은 SUM(delta) — public.point_balance() / public.v_point_balances 참조.';
comment on column public.points_ledger.ref_type is '적립 근거 객체 종류. 예: visit, observation, quiz, species, observation_log.';
comment on column public.points_ledger.ref_id is '적립 근거 객체 id. (user_id, reason, ref_type, ref_id) 유니크로 중복 적립을 DB가 막습니다.';

create index points_ledger_user_idx on public.points_ledger (user_id, created_at desc);

-- 멱등성: 같은 근거로 같은 사유의 포인트는 두 번 들어갈 수 없습니다.
-- (Edge Function 재시도·오프라인 큐 재전송이 그대로 이중 적립이 되는 것을 DB에서 막습니다)
create unique index points_ledger_idempotency_uq
  on public.points_ledger (user_id, reason, ref_type, ref_id)
  where ref_id is not null;

create trigger points_ledger_append_only
  before update or delete on public.points_ledger
  for each row execute function public.forbid_mutation();

-- ---------------------------------------------------------------------------
-- badges / user_badges
-- ---------------------------------------------------------------------------
create table public.badges (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name        text not null,
  description text not null default '',
  criteria    jsonb not null default '{}'::jsonb,
  icon_url    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.badges is
  '뱃지 정의. criteria는 판정 조건의 선언적 표현입니다(예: {"river_slug":"oncheoncheon","spots_required":6}).
   판정 로직 자체는 앱/Edge Function에 두고, DB는 정의와 획득 사실만 보관합니다.';

create table public.user_badges (
  user_id    uuid not null references public.users (id) on delete cascade,
  badge_id   uuid not null references public.badges (id) on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (user_id, badge_id)
);

comment on table public.user_badges is '뱃지 획득 사실. 리더보드는 만들지 않습니다(PLAN.md §6.3) — 비교가 아니라 개인 수집이 목표입니다.';

-- ---------------------------------------------------------------------------
-- updated_at 트리거
-- ---------------------------------------------------------------------------
create trigger rivers_set_updated_at        before update on public.rivers        for each row execute function public.set_updated_at();
create trigger users_set_updated_at         before update on public.users         for each row execute function public.set_updated_at();
create trigger spots_set_updated_at         before update on public.spots         for each row execute function public.set_updated_at();
create trigger spot_contents_set_updated_at before update on public.spot_contents for each row execute function public.set_updated_at();
create trigger quizzes_set_updated_at       before update on public.quizzes       for each row execute function public.set_updated_at();
create trigger photos_set_updated_at        before update on public.photos        for each row execute function public.set_updated_at();
create trigger badges_set_updated_at        before update on public.badges        for each row execute function public.set_updated_at();
