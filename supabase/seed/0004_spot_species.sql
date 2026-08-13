-- ============================================================================
-- 0004_spot_species.sql — 스팟별 관찰 후보 매핑 (60행)
--
-- 출처: content/oncheoncheon-draft.md §3 도감 표의 「스팟」 열
-- 대응: src/data/spotSpecies.ts (동일 내용의 TypeScript 판 — 함께 고치세요)
-- 스키마: supabase/migrations/0004_dex.sql `public.spot_species`
-- 선행: 0001_species.sql, 0002_oncheoncheon.sql
--
-- 멱등성: PK (spot_id, species_id) → on conflict do nothing.
-- 조인 키: species.code, (rivers.slug, spots.seq)
--
-- 이 매핑이 PLAN.md §7.5 ①의 "후보 압축"입니다 — 여기에 없는 종은 그 스팟에서
-- 아이에게 제시되지도, 판별 후보에 들어가지도 않습니다.
--
-- ⚠️ 초안의 두 출처를 대조했습니다.
--    (a) 각 스팟의 「관찰 후보」 줄 — 살아 있는 동물·식물만. 장소 카드 제외.
--    (b) §3 도감 표의 「스팟」 열   — 흔적·시설 포함. 전 종 대조 결과 (a)의 상위집합.
--    → **(b)를 기준**으로 삼았습니다. 두 출처가 어긋나는 종은 없었습니다.
--
-- ⚠️ 미검증: 초안 §3은 "온천천에 실제로 서식/도래하는가"를 확인하지 않았습니다.
--    이 매핑을 그대로 쓰면 아이에게 없는 생물을 찾으라고 시키게 됩니다.
--    Phase 0 답사 + 생태 자문 후 재확정하세요.
--
-- ── auto_grant (체크인만 하면 확정 지급되는 장소 카드) ────────────────────
--  초안 §2의 「장소 카드」 중 §3 도감 표에도 있는 것에만 true를 주었습니다.
--    ② 징검다리, 여울   ④ 수질측정소   ⑤ 복원 기록 표지   ⑥ 합류점
--
--  ⚠️ 스팟 ①·③에는 auto_grant 카드가 하나도 없습니다 — 헛걸음 방지 장치(§7.2)가
--     빠진 스팟입니다. 초안 §2에는 장소 카드가 적혀 있지만 §3 도감 표에 해당 행이
--     없어서 시드할 수 없었습니다(카드를 지어내지 않았습니다):
--       ① 🏞️ 상류의 물길      → 도감 표에 없음
--       ③ 🐦 새들의 사냥터     → 도감 표에 없음
--       ⑤ 🏙️ 도심을 지나는 물길 → 도감 표에 없음 (⑤는 📜 복원 기록 표지가 있어 커버됨)
--     → 초안 §3 도감 표에 이 3장을 추가할지 콘텐츠 결정이 필요합니다.
-- ============================================================================

set search_path = public, extensions;

insert into public.spot_species (spot_id, species_id, seq, auto_grant)
select s.id, sp.id, v.seq, v.auto_grant
from (values

  -- ── ① 물이 시작되는 곳 — 발원 · 물의 순환 ──────────────────────────
  (1, 'runner_reed',           1, false),   -- 달뿌리풀 ①②
  (1, 'gomari',                2, false),   -- 고마리 ①
  (1, 'sparrow',               3, false),   -- 참새 (초안 스팟 열: "전체")
  (1, 'daurian_redstart',      4, false),   -- 딱새 ①
  (1, 'willow_minnow',         5, false),   -- 버들치 ①
  (1, 'demoiselle_damselfly',  6, false),   -- 물잠자리 ①

  -- ── ② 여울과 징검다리 — 여울과 소 · 물살 · 물속 산소 ────────────────
  (2, 'facility_stepping_stones', 1, true),  -- 장소 카드 🪨 징검다리
  (2, 'facility_riffle',          2, true),  -- 장소 카드 🌊 여울
  (2, 'runner_reed',              3, false), -- 달뿌리풀 ①②
  (2, 'korean_willow',            4, false), -- 왕버들 ②⑤
  (2, 'trace_dasulgi_shell',      5, false), -- 다슬기 껍데기 ②④
  (2, 'sparrow',                  6, false), -- 참새 (전체)
  (2, 'white_wagtail',            7, false), -- 알락할미새 ②③
  (2, 'kingfisher',               8, false), -- 물총새 ②③
  (2, 'pale_chub',                9, false), -- 피라미 ②
  (2, 'dark_chub',               10, false), -- 갈겨니 ②
  (2, 'water_strider',           11, false), -- 소금쟁이 ②
  (2, 'skimmer_dragonfly',       12, false), -- 밀잠자리 ②⑤
  (2, 'dasulgi',                 13, false), -- 다슬기 ②④

  -- ── ③ 새들의 식당 — 먹이사슬 · 조류 관찰 ────────────────────────────
  -- ⚠️ auto_grant 카드 없음 (위 주석 참조)
  (3, 'trace_bird_footprint',  1, false),   -- 새 발자국 ③⑥
  (3, 'trace_feather',         2, false),   -- 깃털 ③
  (3, 'sparrow',               3, false),   -- 참새 (전체)
  (3, 'spot_billed_duck',      4, false),   -- 흰뺨검둥오리 ③⑤⑥
  (3, 'egret_great',           5, false),   -- 중대백로 ③
  (3, 'egret_little',          6, false),   -- 쇠백로 ③
  (3, 'grey_heron',            7, false),   -- 왜가리 ③
  (3, 'great_cormorant',       8, false),   -- 민물가마우지 ③⑥
  (3, 'white_wagtail',         9, false),   -- 알락할미새 ②③
  (3, 'kingfisher',           10, false),   -- 물총새 ②③
  (3, 'carp',                 11, false),   -- 잉어 ③⑤

  -- ── ④ 물의 건강검진소 — 수질 · 지표생물 ★ 코스의 핵심 ───────────────
  (4, 'facility_water_quality_station', 1, true),  -- 장소 카드 🔬 수질측정소
  (4, 'trace_dasulgi_shell',            2, false), -- 다슬기 껍데기 ②④
  (4, 'sparrow',                        3, false), -- 참새 (전체)
  (4, 'dasulgi',                        4, false), -- 다슬기 ②④
  (4, 'pond_snail',                     5, false), -- 물달팽이 ④
  (4, 'mayfly',                         6, false), -- 하루살이류 ④
  (4, 'amphipod',                       7, false), -- 🔒 옆새우 ④ (expert_only)
  (4, 'planaria',                       8, false), -- 🔒 플라나리아 ④ (expert_only)
  (4, 'caddisfly',                      9, false), -- 🔒 날도래류 ④ (expert_only)

  -- ── ⑤ 되살아난 물길 — 하천 복원사 · 지역사 ─────────────────────────
  (5, 'facility_restoration_marker',  1, true),  -- 장소 카드 📜 복원 기록
  (5, 'reed',                         2, false), -- 갈대 ⑤⑥
  (5, 'korean_willow',                3, false), -- 왕버들 ②⑤
  (5, 'cherry_tree',                  4, false), -- 벚나무 ⑤
  (5, 'japanese_hop',                 5, false), -- 🚫 환삼덩굴 ⑤ (생태교란)
  (5, 'sparrow',                      6, false), -- 참새 (전체)
  (5, 'spot_billed_duck',             7, false), -- 흰뺨검둥오리 ③⑤⑥
  (5, 'brown_eared_bulbul',           8, false), -- 직박구리 ⑤
  (5, 'carp',                         9, false), -- 잉어 ③⑤
  (5, 'crucian_carp',                10, false), -- 붕어 ⑤
  (5, 'skimmer_dragonfly',           11, false), -- 밀잠자리 ②⑤

  -- ── ⑥ 두 물이 만나는 곳 — 합류 · 유역 · 바다로 ─────────────────────
  (6, 'facility_confluence',   1, true),    -- 장소 카드 🔀 합류점
  (6, 'reed',                  2, false),   -- 갈대 ⑤⑥
  (6, 'silver_grass',          3, false),   -- 물억새 ⑥
  (6, 'cattail',               4, false),   -- 부들 ⑥
  (6, 'trace_bird_footprint',  5, false),   -- 새 발자국 ③⑥
  (6, 'sparrow',               6, false),   -- 참새 (전체)
  (6, 'spot_billed_duck',      7, false),   -- 흰뺨검둥오리 ③⑤⑥
  (6, 'mallard',               8, false),   -- 청둥오리 ⑥
  (6, 'great_cormorant',       9, false),   -- 민물가마우지 ③⑥
  (6, 'mullet',               10, false)    -- 숭어 ⑥

) as v(spot_seq, species_code, seq, auto_grant)
join public.spots s   on s.seq = v.spot_seq
join public.rivers r  on r.id = s.river_id and r.slug = 'oncheoncheon'
join public.species sp on sp.code = v.species_code
on conflict (spot_id, species_id) do nothing;

-- ============================================================================
-- 어느 스팟에도 매핑되지 않은 종 — 의도된 공백입니다. 지어내지 않았습니다.
--
--  · bur_cucumber (가시박)
--      초안 스팟 열이 "—" 이고 `[온천천 분포 확인]` 표시가 붙어 있습니다.
--      답사에서 분포가 확인되면 해당 스팟에 추가하세요.
--
--  · otter (수달)
--      초안 §3 「특별 기록 — 보호종」 표에는 스팟 열 자체가 없습니다.
--      report_only(목격 보고만)라 특정 스팟에 묶지 않는 편이 설계에 맞을 수 있으나,
--      현재 구조에서는 spot_species에 없으면 관찰 후보로 뜨지 않습니다.
--      → 보호종을 코스 전체 단위로 다룰지 스팟에 묶을지 설계 결정이 필요합니다.
-- ============================================================================

-- ── 검증 ────────────────────────────────────────────────────────────────
-- 기대값: 총 60행 / 스팟별 6, 13, 11, 9, 11, 10 / auto_grant 5행
--   select s.seq, count(*), count(*) filter (where ss.auto_grant) as auto_grant
--     from public.spot_species ss
--     join public.spots s on s.id = ss.spot_id
--     join public.rivers r on r.id = s.river_id and r.slug = 'oncheoncheon'
--    group by 1 order by 1;
--
-- 매핑되지 않은 종 확인 (기대: bur_cucumber, otter 2행)
--   select sp.code, sp.common_name from public.species sp
--    where not exists (select 1 from public.spot_species ss where ss.species_id = sp.id);
--
-- 계절 필터까지 적용한 실제 후보 (PLAN.md §7.5 ① 후보 압축의 결과 — 스팟당 3~10종 목표)
--   select s.seq, count(*) from public.spot_species ss
--     join public.spots s on s.id = ss.spot_id
--     join public.rivers r on r.id = s.river_id and r.slug = 'oncheoncheon'
--     join public.species sp on sp.id = ss.species_id
--    where sp.is_active and extract(month from now() at time zone 'Asia/Seoul')::int = any(sp.months)
--    group by 1 order by 1;
