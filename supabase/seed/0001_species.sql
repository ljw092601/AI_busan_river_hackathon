-- ============================================================================
-- 0001_species.sql — 도감 종 시드 (44장)
--
-- 출처: content/oncheoncheon-draft.md §3 「도감 카드 초안」
-- 대응: src/data/species.ts (동일 내용의 TypeScript 판 — 함께 고치세요)
-- 스키마: supabase/migrations/0004_dex.sql `public.species`
--
-- 실행 순서: 0001 → 0002 → 0003 → 0004 (뒤 파일이 앞 파일의 행을 참조합니다)
-- 멱등성: 자연키 `code`에 unique 제약이 있어 on conflict (code) do nothing 으로
--         몇 번을 돌려도 중복이 생기지 않습니다.
--
-- ⚠️ 키 주의: public.species.id 는 uuid(자동 생성)입니다.
--    **안정적인 자연키는 `code`** 이고, 뒤 시드 파일들도 code로 조인합니다.
--    src/data/species.ts 의 `code` 값과 반드시 일치해야 합니다.
--
-- ============================================================================
-- ⚠️⚠️ 미검증 데이터 — 생태 자문 전 초안입니다
-- ============================================================================
--   ❌ 서식종 목록·등급   미검증. "온천천에 실제로 서식/도래하는가"를 확인하지 않았습니다.
--   ❌ months(계절)       미검증. 일반적 계절성 기준. 실제 관측 기록으로 교체 필요.
--   ❌ scientific_name    초안에 없습니다 → 전 종 NULL. 국립생물자원관 국가생물종목록으로 확보.
--   ❌ fact               초안에 해당 항목이 없습니다 → 원칙적으로 ''.
--                         예외 2종(다슬기·옆새우)만 초안 퀴즈 해설 문장을 그대로 옮겼습니다.
-- 그대로 운영에 올리면 아이에게 없는 생물을 찾으라고 시키게 됩니다 (PLAN.md §11).
-- 검증이 끝나면 river_species.verified_by 에 자문 출처를 남기세요.
--
-- (river_species는 이 시드에서 다루지 않습니다 — likelihood 값이 초안에 없어
--  지어내지 않았습니다. 생태 자문 후 별도로 채우세요.)
--
-- ── 초안 → 컬럼 변환 규칙 ────────────────────────────────────────────────
--  tier         ⭐ 개수 (1~4), 🏅 보호종 = 5
--  track        초안 표의 "보장 트랙" = guaranteed / "도전 트랙" = challenge
--  ethics_flag  🔒(전문가 동반) = expert_only / 보호종 = report_only
--               새 전체 = no_approach (초안 ③ 「근접 촬영은 감점」, PLAN.md §7.6-1)
--               그 외 = none
--  water_grade  tier 2 → 2급수 지표, tier 3 → 1급수 지표.
--               단 **수생 분류군(fish/insect/benthos)에만** 부여합니다.
--               새·식물·흔적·시설은 수질 지표종이 아니므로 tier와 무관하게 NULL.
--  months       "연중" → 1..12. "10~4"처럼 해를 넘기는 구간은 오름차순으로 펼침.
--               흔적·시설 표에는 관찰 월 열이 없어 연중으로 두었습니다.
--
-- ⚠️ 초안 §3의 제목은 "32종"이지만 표를 실제로 세면 44장입니다
--    (식물 9 + 흔적·시설 8 + 새 11 + 물고기 6 + 곤충·저서 9 + 보호종 1).
--    "표에 있는 종을 누락하지 않는다"를 우선해 44장 전부를 시드합니다.
-- ============================================================================

set search_path = public, extensions;

insert into public.species
  (code, common_name, scientific_name, category, tier, track,
   water_grade, months, id_hint, fact, ethics_flag, is_active)
values

-- ── 보장 트랙 — 식물 (항상 그 자리에 있음) ─────────────────────────────────
('reed', '갈대', null, 'plant', 1, 'guaranteed',
 null, array[8,9,10,11],
 '키가 사람보다 크고, 끝에 부드러운 빗자루 모양 이삭', '', 'none', true),

('silver_grass', '물억새', null, 'plant', 1, 'guaranteed',
 null, array[9,10,11],
 '갈대와 비슷하나 이삭이 더 하얗고 은빛', '', 'none', true),

('runner_reed', '달뿌리풀', null, 'plant', 1, 'guaranteed',
 null, array[6,7,8,9,10],
 '물가에 낮게 깔려 자라고 줄기가 옆으로 뻗음', '', 'none', true),

('gomari', '고마리', null, 'plant', 1, 'guaranteed',
 null, array[8,9,10],
 '작은 분홍·흰 꽃이 뭉쳐 핌. 잎이 방패 모양', '', 'none', true),

('cattail', '부들', null, 'plant', 1, 'guaranteed',
 null, array[7,8,9,10],
 '핫도그처럼 생긴 갈색 이삭 — 한 번 보면 안 잊음', '', 'none', true),

('korean_willow', '왕버들', null, 'plant', 1, 'guaranteed',
 null, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '물가에 서 있는 굵은 나무, 가지가 늘어짐', '', 'none', true),

-- 초안 관찰 월: "연중(꽃 4월)" — 개화기는 표시 계층에서 별도 처리 필요
('cherry_tree', '벚나무', null, 'plant', 1, 'guaranteed',
 null, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '봄에 분홍 꽃, 껍질에 가로줄 무늬', '', 'none', true),

-- 🚫 생태교란종 — "이건 왜 문제일까?" 카드 (PLAN.md §7.3)
('japanese_hop', '환삼덩굴', null, 'invasive', 1, 'guaranteed',
 null, array[6,7,8,9,10],
 '까끌까끌한 줄기 — 다른 식물을 덮어버림 (생태교란)', '', 'none', true),

-- 🚫 생태교란종. TODO: 초안 「[온천천 분포 확인]」 — 분포 미확인이라 스팟 매핑 없음(0004 참조)
('bur_cucumber', '가시박', null, 'invasive', 1, 'guaranteed',
 null, array[7,8,9,10],
 '넓은 잎으로 나무까지 뒤덮음 (생태교란)', '', 'none', true),

-- ── 보장 트랙 — 흔적·시설 ──────────────────────────────────────────────
-- 초안 표에 관찰 월 열이 없습니다 → 전부 연중.
('trace_bird_footprint', '새 발자국', null, 'trace', 1, 'guaranteed',
 null, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '젖은 흙이나 모래를 살펴봐. 물갈퀴 자국이 있으면 오리!', '', 'none', true),

('trace_feather', '깃털', null, 'trace', 1, 'guaranteed',
 null, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '물가에 떨어진 깃털. 줍지 말고 사진만', '', 'none', true),

('trace_dasulgi_shell', '다슬기 껍데기', null, 'trace', 1, 'guaranteed',
 null, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '뾰족한 원뿔 모양 빈 껍데기', '', 'none', true),

-- TODO: 초안 식별 힌트 열이 공란입니다 — 콘텐츠 작성 필요
('facility_stepping_stones', '징검다리', null, 'facility', 1, 'guaranteed',
 null, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '', '', 'none', true),

('facility_riffle', '여울', null, 'facility', 1, 'guaranteed',
 null, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '물이 하얗게 부서지며 소리 나는 곳', '', 'none', true),

-- TODO: 초안 식별 힌트 열이 공란입니다 — 콘텐츠 작성 필요
('facility_water_quality_station', '수질측정소', null, 'facility', 1, 'guaranteed',
 null, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '', '', 'none', true),

-- TODO: 식별 힌트 공란 + 초안 「[제작 시 확인]」 복원 사업 연도·주체·사업명 확정 후 fact 작성
('facility_restoration_marker', '복원 기록 표지', null, 'facility', 1, 'guaranteed',
 null, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '', '', 'none', true),

('facility_confluence', '합류점', null, 'facility', 1, 'guaranteed',
 null, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '두 물줄기가 만나 하나가 되는 곳', '', 'none', true),

-- ── 도전 트랙 — 새 ────────────────────────────────────────────────────
-- 전 종 ethics_flag = 'no_approach'. 새는 수질 지표종이 아니므로 water_grade는 NULL.
('spot_billed_duck', '흰뺨검둥오리', null, 'waterbird', 1, 'challenge',
 null, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '뺨이 하얗고 부리 끝이 노란 오리. 연중 볼 수 있음', '', 'no_approach', true),

('sparrow', '참새', null, 'smallbird', 1, 'challenge',
 null, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '뺨에 검은 점', '', 'no_approach', true),

('brown_eared_bulbul', '직박구리', null, 'smallbird', 1, 'challenge',
 null, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '회갈색, 시끄럽게 "삐이익" 울며 날아감', '', 'no_approach', true),

-- 초안 "11~3" → 해를 넘기는 구간
('mallard', '청둥오리', null, 'waterbird', 1, 'challenge',
 null, array[1,2,3,11,12],
 '수컷은 머리가 초록빛으로 반짝임. 겨울 손님', '', 'no_approach', true),

('egret_great', '중대백로', null, 'waterbird', 2, 'challenge',
 null, array[4,5,6,7,8,9,10],
 '하얗고 큼. 부리가 노란색(여름엔 검게 변함)', '', 'no_approach', true),

('egret_little', '쇠백로', null, 'waterbird', 2, 'challenge',
 null, array[4,5,6,7,8,9,10],
 '하얗고 작음. 부리 검정 + 발가락 노랑 — 노란 양말!', '', 'no_approach', true),

('grey_heron', '왜가리', null, 'waterbird', 2, 'challenge',
 null, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '회색빛, 백로보다 큼. 목을 S자로 접고 서 있음', '', 'no_approach', true),

-- 초안 "10~4" → 해를 넘기는 구간
('great_cormorant', '민물가마우지', null, 'waterbird', 2, 'challenge',
 null, array[1,2,3,4,10,11,12],
 '검고 목이 김. 날개를 펼쳐 말리는 자세가 특징', '', 'no_approach', true),

('white_wagtail', '알락할미새', null, 'smallbird', 2, 'challenge',
 null, array[3,4,5,6,7,8,9,10],
 '흑백 무늬, 꼬리를 위아래로 까딱까딱', '', 'no_approach', true),

-- 초안 "10~4" → 해를 넘기는 구간
('daurian_redstart', '딱새', null, 'smallbird', 2, 'challenge',
 null, array[1,2,3,4,10,11,12],
 '수컷 배가 주황색, 날개에 흰 점', '', 'no_approach', true),

-- ⭐⭐⭐⭐ 귀한 손님 — 계절·서식 조건이 까다로움 (PLAN.md §7.4)
('kingfisher', '물총새', null, 'smallbird', 4, 'challenge',
 null, array[4,5,6,7,8,9],
 '파란 등 + 주황 배. 물가를 쏜살같이 지나감', '', 'no_approach', true),

-- ── 도전 트랙 — 물고기 ────────────────────────────────────────────────
('carp', '잉어', null, 'fish', 1, 'challenge',
 null, array[4,5,6,7,8,9,10],
 '크고 통통함. 입가에 수염', '', 'none', true),

('crucian_carp', '붕어', null, 'fish', 1, 'challenge',
 null, array[4,5,6,7,8,9,10],
 '잉어와 비슷하나 수염이 없음', '', 'none', true),

('pale_chub', '피라미', null, 'fish', 2, 'challenge',
 2, array[5,6,7,8,9,10],
 '손바닥보다 작고 은빛. 여울에서 무리지어 다님', '', 'none', true),

('dark_chub', '갈겨니', null, 'fish', 2, 'challenge',
 2, array[5,6,7,8,9,10],
 '피라미와 비슷, 눈 위쪽이 붉음', '', 'none', true),

('willow_minnow', '버들치', null, 'fish', 3, 'challenge',
 1, array[4,5,6,7,8,9,10],
 '상류의 맑고 찬 물에만 삶. 작고 갈색', '', 'none', true),

-- ⚠️ 자문 확인 필요: 초안 ⭐⭐ → 변환 규칙상 water_grade 2가 되지만, 숭어는 하류·기수역
--    어종이라 2급수 지표종으로 보기 어렵습니다. 등급이 "수질"이 아니라 "만나기 어려움"을
--    뜻한 것인지 확인 필요.
('mullet', '숭어', null, 'fish', 2, 'challenge',
 2, array[4,5,6,7,8,9,10],
 '하류·기수역. 가끔 물 위로 튀어오름', '', 'none', true),

-- ── 도전 트랙 — 곤충·저서생물 ──────────────────────────────────────────
-- 🔒 expert_only = 전문가 동반 프로그램에서만 해금 (PLAN.md §7.6-4).
--    돌을 뒤집어야 보이는 생물이라 아이가 임의로 하면 서식지가 훼손됩니다.
('water_strider', '소금쟁이', null, 'insect', 1, 'challenge',
 null, array[4,5,6,7,8,9,10],
 '물 위를 미끄러지듯 걸어다님', '', 'none', true),

('skimmer_dragonfly', '밀잠자리', null, 'insect', 1, 'challenge',
 null, array[5,6,7,8,9],
 '몸이 하늘색 가루를 뿌린 듯함', '', 'none', true),

-- ⚠️ 자문 확인 필요: 초안 ⭐⭐⭐ → 변환 규칙상 water_grade 1.
--    초안 힌트가 "맑은 물가"라 지표성을 전제하나 1급수 지표로 확정 가능한지 확인 필요.
('demoiselle_damselfly', '물잠자리', null, 'insect', 3, 'challenge',
 1, array[5,6,7,8],
 '날개 전체가 검고 몸이 금속빛 초록. 맑은 물가', '', 'none', true),

-- fact 출처: 초안 ④ 스팟 퀴즈 3번 해설 (그대로 옮김)
('dasulgi', '다슬기', null, 'benthos', 2, 'challenge',
 2, array[4,5,6,7,8,9,10],
 '뾰족한 원뿔, 돌에 붙어 있음',
 '다슬기는 2급수 정도의 물에서 삽니다. 아주 더러운 물에서는 살 수 없어요.', 'none', true),

('pond_snail', '물달팽이', null, 'benthos', 2, 'challenge',
 2, array[4,5,6,7,8,9,10],
 '둥근 껍데기, 수초에 붙음', '', 'none', true),

('mayfly', '하루살이류', null, 'benthos', 2, 'challenge',
 2, array[4,5,6,7,8,9],
 '꼬리가 2~3가닥으로 길게 나옴', '', 'none', true),

-- fact 출처: 초안 ④ 스팟 퀴즈 2번 해설 (앞 문장만 그대로 옮김)
('amphipod', '옆새우', null, 'benthos', 3, 'challenge',
 1, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '옆으로 누워 헤엄침. 1급수 지표',
 '옆새우는 아주 맑은 물(1급수)에서 살아요.', 'expert_only', true),

('planaria', '플라나리아', null, 'benthos', 3, 'challenge',
 1, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '납작하고 눈이 사시처럼 두 개. 1급수 지표', '', 'expert_only', true),

('caddisfly', '날도래류', null, 'benthos', 3, 'challenge',
 1, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '모래·나뭇조각으로 집을 지어 들고 다님. 1급수 지표', '', 'expert_only', true),

-- ── 특별 기록 — 보호종 ────────────────────────────────────────────────
-- ✅ 해결됨: domain.ts SpeciesCategory + species_category ENUM에 'mammal' 추가 완료.
--    category를 'mammal'로 바로잡고 is_active = true 로 전환했습니다.
--
-- ✅ 해결됨 (2026-08-14): `species_track_matches_category` CHECK에 'mammal'이 들어 있는지
--    라이브 DB에서 직접 확인했고, 44행 전부 정상 삽입되었습니다.
--    (이전 판에 있던 "이 INSERT는 실패한다" 경고는 사실이 아니므로 삭제했습니다.)
--
-- ⚠️ 다만 초안의 「[온천천 서식 확인 필요]」는 그대로 유효합니다.
--    생태 자문에서 온천천 수달 서식이 확인되지 않으면 is_active = false 로 되돌리세요.
-- TODO: id_hint 없음(초안 표에 해당 열 없음). report_only라 사진 식별이 불필요해 우선순위 낮음.
-- fact 출처: 초안 §3 「특별 기록 — 보호종」 표의 비고 (그대로 옮김)
('otter', '수달', null, 'mammal', 5, 'challenge',
 null, array[1,2,3,4,5,6,7,8,9,10,11,12],
 '', '접근·추적 금지. 발견 시 앱이 위치 없이 "보았다"만 기록', 'report_only', true)

on conflict (code) do nothing;

-- ── 검증 ────────────────────────────────────────────────────────────────
-- 기대값: 44행 (전부 is_active = true)
--   select count(*) from public.species;
--   select category, track, count(*) from public.species group by 1,2 order by 1;
--   select tier, count(*) from public.species group by 1 order by 1;
-- 보장:도전 비율은 PLAN.md §7.2 목표가 60:40입니다. 현재 시드는 17:27 (39:61) —
-- 목표보다 도전 트랙이 많습니다. 빈손 이탈률에 영향을 주므로 콘텐츠 검토 대상입니다.
--   select track, count(*) from public.species where is_active group by 1;
