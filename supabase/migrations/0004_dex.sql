-- ============================================================================
-- 0004_dex.sql — 생물 도감 시스템
--
-- 근거: PLAN.md §7 (특히 §7.4 등급 체계, §7.5 신뢰도 라우팅, §7.9 데이터 모델),
--       src/types/domain.ts (Species / Observation / DexEntry / ObservationLog)
--
-- 이 파일의 핵심 분리:
--   observations = 관찰 이벤트 전량 (시민과학 데이터의 원천, §7.8)
--   dex_entries  = 도감 보유 (종당 1행, 아이가 보는 성취감)
--   observation_logs = 못 찾았을 때의 관찰 일지 (빈손 방지, §7.2)
-- ============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- species — 종 메타데이터
-- ---------------------------------------------------------------------------
create table public.species (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique check (code ~ '^[a-z0-9_]{2,50}$'),
  common_name       text not null,
  scientific_name   text,
  category          public.species_category not null,
  tier              smallint not null check (tier between 1 and 5),
  track             public.track not null,
  water_grade       smallint check (water_grade between 1 and 4),
  months            integer[] not null default '{1,2,3,4,5,6,7,8,9,10,11,12}'::integer[],
  id_hint           text not null default '',
  fact              text not null default '',
  ethics_flag       public.ethics_flag not null default 'none',
  illustration_url  text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- 관찰 가능 월은 1~12 안에 들어야 하고 최소 한 달은 있어야 합니다.
  constraint species_months_valid
    check (months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]
           and cardinality(months) between 1 and 12),

  -- 트랙과 카테고리의 정합성 (PLAN.md §7.2).
  -- 보장 트랙 = 도망가지 않는 것(식물·교란종·흔적·시설), 도전 트랙 = 살아 움직이는 동물.
  -- ⚠️ SpeciesCategory에 값을 추가하면 이 목록도 함께 고쳐야 합니다.
  --    ENUM 추가만으로는 CHECK가 조용히 그 카테고리를 전부 거부합니다.
  constraint species_track_matches_category check (
    (track = 'guaranteed' and category in ('plant','invasive','trace','facility'))
    or
    (track = 'challenge'  and category in ('waterbird','smallbird','fish','mammal','insect','benthos'))
  ),

  -- 🏅 특별 기록(tier 5, 보호종)은 반드시 "목격 보고만"이어야 합니다.
  -- 촬영을 요구하는 순간 아이가 보호종을 추적·접근하게 됩니다. PLAN.md §7.6-2
  constraint species_tier5_report_only
    check (tier <> 5 or ethics_flag = 'report_only')
);

comment on table public.species is
  '도감 종 메타데이터. PLAN.md §7.9는 id_hints를 JSONB로 뒀지만 domain.ts Species.idHint가 string이므로 text로 맞췄습니다.
   도감 카드(collectibles)를 별도 테이블로 두지 않은 것도 같은 이유입니다 — domain.ts가 장소·시설·흔적을
   category(facility/trace) + track(guaranteed)로 species에 통합했습니다.';
comment on column public.species.tier is
  '등급 1~5. domain.ts Tier와 1:1. ENUM이 아니라 smallint인 이유: "⭐⭐⭐ 이상은 전문가 검수"(§7.5),
   "등급별 종수 집계로 수질 추정"(§7.4)처럼 대소 비교·집계가 필요하기 때문입니다.';
comment on column public.species.track is
  '보장/도전 트랙. 보장 트랙 60% : 도전 트랙 40%가 목표 비율입니다(§7.2). 이 비율이 "빈손 이탈률"을 결정합니다.';
comment on column public.species.water_grade is
  '수질 지표 등급(1~4급수). 지표생물이 아니면 NULL. 이 값이 §7.4 "내가 모은 카드로 하천 등급 판정" 화면의 근거입니다.';
comment on column public.species.months is
  '관찰 가능 월(1~12). 연중이면 1..12 전부. 여름에 겨울철새를 찾으라고 하지 않기 위한 필터입니다(§7.7).
   비시즌 카드는 도감에 실루엣으로 표시하고 재방문 동기로 씁니다.';
comment on column public.species.id_hint is
  '아이용 식별 힌트 — 혼동종과의 "차이 한 가지". 예: "쇠백로 = 부리 검정 + 발가락 노랑, 노란 양말!"
   이 힌트의 품질이 곧 declared_species_id의 정확도가 되고, 모델과의 일치율로 측정됩니다.';
comment on column public.species.ethics_flag is
  '관찰 윤리 제약을 획득 조건에 내장(§7.6). report_only는 촬영 없이 목격 보고만으로 획득,
   expert_only는 전문가 동반 프로그램 참여 계정(users.expert_program)에서만 해금합니다.';

create index species_track_tier_idx on public.species (track, tier);
create index species_category_idx   on public.species (category);
create index species_months_gin     on public.species using gin (months);

-- ---------------------------------------------------------------------------
-- river_species — 하천별 서식 가능성
-- ---------------------------------------------------------------------------
create table public.river_species (
  river_id    uuid not null references public.rivers (id) on delete cascade,
  species_id  uuid not null references public.species (id) on delete cascade,
  likelihood  numeric(3,2) not null default 0.50 check (likelihood between 0 and 1),
  verified_by text,
  created_at  timestamptz not null default now(),
  primary key (river_id, species_id)
);

comment on table public.river_species is
  '하천별 서식 가능성. likelihood는 판별 모델의 사전확률(prior)로 씁니다 — §7.5에서 말한
   "우리는 iNaturalist Geomodel보다 더 좁은 사전확률을 가진다"의 실체가 이 컬럼입니다.';
comment on column public.river_species.verified_by is
  '⚠ 생태 자문 검증 출처. NULL이면 미검증 추정치입니다. PLAN.md §11 "서식종 목록이 실제와 불일치" 리스크의 추적 지점.';

-- ---------------------------------------------------------------------------
-- spot_species — 스팟별 관찰 후보
-- ---------------------------------------------------------------------------
create table public.spot_species (
  spot_id     uuid not null references public.spots (id) on delete cascade,
  species_id  uuid not null references public.species (id) on delete cascade,
  seq         smallint not null default 1,
  auto_grant  boolean not null default false,
  note        text,
  created_at  timestamptz not null default now(),
  primary key (spot_id, species_id)
);

comment on table public.spot_species is
  '스팟별 관찰 후보. 계절 필터는 species.months와 조합합니다 — public.spot_candidate_species() 참조.
   이 매핑이 §7.5 ①의 "후보 압축"입니다: 10만 분류 문제를 3~10 분류 문제로 줄여 판별 정확도의 차원을 바꿉니다.';
comment on column public.spot_species.auto_grant is
  '체크인만 하면 확정 지급되는 카드인지 여부(= 장소 카드). 보장 트랙 중 그 스팟 자체를 뜻하는 카드
   (징검다리·수질측정소·합류점 등)에 true를 줍니다. PLAN.md §2.3, §7.2 — 헛걸음 방지 장치의 구현부입니다.';

create index spot_species_species_idx on public.spot_species (species_id);
create index spot_species_auto_grant_idx on public.spot_species (spot_id) where auto_grant;

-- ---------------------------------------------------------------------------
-- observations — 관찰 이벤트 (★ 아이 선택과 모델 추론을 각각 보존)
-- ---------------------------------------------------------------------------
create table public.observations (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users (id) on delete cascade,
  spot_id              uuid not null references public.spots (id) on delete cascade,
  declared_species_id  uuid not null references public.species (id) on delete restrict,
  model_species_id     uuid references public.species (id) on delete set null,
  model_confidence     real check (model_confidence between 0 and 1),
  model_version        text,
  model_off_topic      boolean,
  photo_id             uuid references public.photos (id) on delete set null,
  status               public.observation_status not null default 'pending',
  final_species_id     uuid references public.species (id) on delete set null,
  reviewed_by          uuid references auth.users (id) on delete set null,
  reviewed_at          timestamptz,
  observed_at          timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- 모델 결과가 있으면 어떤 모델이었는지 반드시 남깁니다(나중에 과거 관측을 재평가하기 위해).
  constraint observations_model_version_required
    check (model_species_id is null or model_version is not null)
);

comment on table public.observations is
  '관찰 이벤트. 같은 종을 여러 번 만나도 전부 남습니다 — 시민과학 데이터로서의 가치는 이 누적에 있습니다(§7.8).
   도감 보유(dex_entries)와 분리한 이유: 아이가 보는 성취감은 "종당 1장"이지만 데이터로서의 가치는 "전부"이기 때문입니다.';
comment on column public.observations.declared_species_id is
  '★ 아이가 직접 고른 종. NOT NULL — 모델이 아무리 정확해져도 이 단계는 제거하지 않습니다.
   앱이 자동으로 "왜가리입니다" 하면 아이는 아무것도 배우지 않고 사진 찍는 기계의 조수가 됩니다. PLAN.md §7.5';
comment on column public.observations.model_species_id is
  '모델 추론 결과. NULL 허용 — 판별 엔진 미확보 시(D안 폴백) 이 컬럼 없이도 앱은 완전히 동작합니다.
   declared와 각각 보존하는 이유: 둘의 일치율이 아이의 식별 능력 성장 곡선이고, 불일치는 그대로 검수 큐이자 콘텐츠 개선 지표입니다.';
comment on column public.observations.model_confidence is '0~1 신뢰도. §7.5 ④ 라우팅(즉시 확정 / 검수 큐 / 반려)의 기준값.';
comment on column public.observations.model_version is
  '판별 모델 버전. 모델 교체 후 과거 관측을 재평가하려면 "어떤 모델이 그렇게 판단했는가"가 남아 있어야 합니다.';
comment on column public.observations.model_off_topic is
  '대분류 불일치(신발/실내/인물) 여부. domain.ts ClassifyResult.offTopic 대응. true면 status=rejected 경로.';
comment on column public.observations.final_species_id is
  '검수 확정 종. declared와 다르면 status=corrected가 되지만 포인트는 차감하지 않습니다 —
   "다시 살펴보니 ○○였어!"로 정정하고, 정정 경험 자체를 학습 콘텐츠로 씁니다. PLAN.md §7.5';

create index observations_user_idx    on public.observations (user_id, observed_at desc);
create index observations_spot_idx    on public.observations (spot_id, observed_at desc);
create index observations_species_idx on public.observations (declared_species_id);
create index observations_photo_idx   on public.observations (photo_id);
-- 검수 큐: 오래된 것부터
create index observations_review_queue_idx on public.observations (observed_at)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- dex_entries — 도감 보유 (종당 1행)
-- ---------------------------------------------------------------------------
create table public.dex_entries (
  user_id            uuid not null references public.users (id) on delete cascade,
  species_id         uuid not null references public.species (id) on delete cascade,
  first_observed_at  timestamptz not null default now(),
  best_photo_id      uuid references public.photos (id) on delete set null,
  count              integer not null default 1 check (count > 0),
  updated_at         timestamptz not null default now(),
  primary key (user_id, species_id)
);

comment on table public.dex_entries is
  '도감 보유. 같은 종을 몇 번 만나도 카드는 1장이므로 (user_id, species_id) 복합 PK입니다
   — domain.ts DexEntry에 id 필드가 없는 것과 대응합니다.
   갱신은 public.grant_dex_entry() 함수로만 하세요(RLS에서 직접 INSERT/UPDATE를 막아 두었습니다).';
comment on column public.dex_entries.count is '총 관찰 횟수. 카드는 1장이지만 "몇 번 만났는가"는 아이에게 의미 있는 숫자입니다.';

create index dex_entries_species_idx on public.dex_entries (species_id);

-- ---------------------------------------------------------------------------
-- observation_logs — 관찰 일지 (못 찾았을 때)
-- ---------------------------------------------------------------------------
create table public.observation_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  spot_id     uuid not null references public.spots (id) on delete cascade,
  note        text not null check (char_length(btrim(note)) between 1 and 500),
  created_at  timestamptz not null default now()
);

comment on table public.observation_logs is
  '관찰 일지 — 생물을 못 찾았을 때의 대체 보상(+10P). PLAN.md §7.2
   "비가 와서 새가 안 보였어요"도 훌륭한 관찰 기록입니다. 과학은 원래 못 찾은 날이 더 많고,
   앱이 그걸 인정해주지 않으면 아이는 빈손으로 이탈합니다. 이 테이블이 "빈손 이탈률" 지표의 방어선입니다.';

create index observation_logs_user_idx on public.observation_logs (user_id, created_at desc);
create index observation_logs_spot_idx on public.observation_logs (spot_id);

-- 같은 스팟에서 하루에 여러 번 일지를 써서 포인트를 반복 적립하는 것을 막습니다.
create unique index observation_logs_one_per_day_uq
  on public.observation_logs (user_id, spot_id, ((created_at at time zone 'Asia/Seoul')::date));

-- ---------------------------------------------------------------------------
-- updated_at 트리거
-- ---------------------------------------------------------------------------
create trigger species_set_updated_at      before update on public.species      for each row execute function public.set_updated_at();
create trigger observations_set_updated_at before update on public.observations for each row execute function public.set_updated_at();
create trigger dex_entries_set_updated_at  before update on public.dex_entries  for each row execute function public.set_updated_at();
