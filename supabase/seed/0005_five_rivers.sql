-- ============================================================================
-- 0005_five_rivers.sql — 부산 5대 하천 콘텐츠 (확정본)
--
-- 출처: 프로젝트 오너가 확정한 문안. 프로토타입 example_html.html 의 초안을
--       오너 확정본으로 교체한 것입니다(수영강·부전천은 미션 없이 퀴즈만,
--       동천은 미션만, 대천천 관찰일지는 4개 항목).
--
-- 선행: 0001~0013 마이그레이션.
-- 멱등: rivers는 slug, badges는 code, spots는 (river_id, seq) 기준.
--       퀴즈는 전량 교체(delete 후 insert)이므로 재실행 시 quiz_attempts의
--       FK 때문에 실패할 수 있습니다 — 이미 사용자 데이터가 있으면 주의하세요.
--
-- ⚠️ 구성이 하천마다 다릅니다. 이것은 누락이 아니라 확정된 콘텐츠입니다.
--      수영강  퀴즈 1 / 미션 없음
--      부전천  퀴즈 1 / 미션 없음
--      온천천  퀴즈 1 / tap_target
--      동천    퀴즈 0 / collect
--      대천천  퀴즈 1 / observe_log
--   완수 판정은 "없는 단계는 통과"입니다. river_progress() 주석 참조.
-- ============================================================================

set search_path = public, extensions;

-- ── 배지 5종 ────────────────────────────────────────────────────────────
insert into public.badges (code, name, description, criteria) values
 ('badge_suyeong',  '경상좌수영 수군 배지',    '수영강 탐험을 완수했습니다.', '{"river":"suyeong"}'),
 ('badge_bujeon',   '복개천 비밀 탐정 배지',   '부전천 탐험을 완수했습니다.', '{"river":"bujeon"}'),
 ('badge_oncheon',  '온천천 수달 파파라치 배지','온천천 탐험을 완수했습니다.', '{"river":"oncheoncheon"}'),
 ('badge_dongcheon','동천 환경 파수꾼 배지',   '동천 탐험을 완수했습니다.',   '{"river":"dongcheon"}'),
 ('badge_daecheon', '대천천 생태 탐험가 배지', '대천천 탐험을 완수했습니다.', '{"river":"daecheon"}')
on conflict (code) do nothing;

-- ── 하천 5개 ────────────────────────────────────────────────────────────
insert into public.rivers (slug, name, region, summary, seq, subtitle, icon, theme, badge_code,
                           detailed_history, detailed_ecology,
                           mission_kind, mission_title, mission_body, mission_config)
values
('suyeong', '수영강', '부산광역시 해운대구·수영구·금정구',
 '조선 효종 때(1652년) 수군 지휘 관아인 경상좌수영이 이전해오며 사천에서 수영강으로 이름이 바뀌었습니다.',
 1, '1652년 경상좌수영의 역사를 간직한 강', '🚢', 'blue', 'badge_suyeong',
 '수영강은 조선 시대 부산 해안 방어의 핵심 거점입니다. 원래 이름은 ''사천(沙川)''이었으나 1652년(효종 3년) 수군 지휘 본부인 경상좌도수군절도사영(경상좌수영)이 수영 하구로 이전하면서 ''수영강''이 되었습니다.',
 '수영강 하구는 바닷물과 민물이 만나는 기수역으로 숭어, 전어, 원앙, 논병아리 등이 도심 생태계를 이룹니다.',
 null, '', '', '{}'),

('bujeon', '부전천', '부산광역시 부산진구',
 '부전동 일대를 흐르던 자연 물길이 도시화로 도로가 되었던 역사와 ''복개'' 개념을 학습합니다.',
 2, '부전동 아스팔트 도로 아래 복개하천', '🛣️', 'amber', 'badge_bujeon',
 '부전천은 부산진구 부전동 일대를 흐르는 도심 하천으로, 과거에는 자연적인 물길이었지만 도시화 과정에서 대부분이 도로가 되었습니다.',
 '하천 위를 구조물로 덮어 도로로 만드는 것을 ''복개(覆蓋)''라고 하며, 최근 생태하천 복원 사업을 통해 다시 맑은 물길로 되살리는 노력이 이어지고 있습니다.',
 null, '', '', '{}'),

('oncheoncheon', '온천천', '부산광역시 금정구·동래구·연제구',
 '돌아온 수달 사진을 촬영하고, 물의 탁도가 높아지는 수질 이상 징후 발생 시 올바른 모니터링 수칙을 배웁니다.',
 3, '수달 스냅샷 찍기 & 수질 이상 징후 관찰', '🦦', 'emerald', 'badge_oncheon',
 '온천천은 금정산 고당봉에서 발원하여 동래구, 연제구를 거쳐 수영강으로 흘러듭니다.',
 '수질 정화 노력으로 천연기념물 수달이 돌아왔으며, 이상 징후 발견 시 변화를 기록하고 다른 정보와 비교하는 관찰 모니터링이 중요합니다.',
 'tap_target', '온천천 수달 카메라스냅 미션',
 '귀여운 수달 사진을 찍어주세요! 온천천 수질 정화 노력으로 돌아온 멸종위기 야생생물 1급 수달이에요.',
 '{"emoji":"🦦","label":"클릭해서 찰칵!","done":"📸 수달 사진 촬영 완성!"}'),

('dongcheon', '동천', '부산광역시 부산진구·동구',
 '오염 역사를 배우고 쓰레기 3개를 주워 정화 미션을 수행합니다.',
 4, '도심 하천의 오염 역사 & 플로깅 쓰레기 수거', '🧹', 'cyan', 'badge_dongcheon',
 '동천은 도시가 발달하면서 생활하수와 산업 활동 등의 영향을 받아 수질오염 문제가 나타났던 부산의 대표적인 도심하천입니다.',
 '시민 플로깅 활동, 해수 통수, 하수관로 정비 등 맑은 물길을 되찾기 위한 수질 개선 노력이 펼쳐지고 있습니다.',
 'collect', '동천 플로깅 정화 미션',
 '동천은 도시가 발달하면서 생활하수와 산업 활동 등의 영향을 받아 수질오염 문제가 나타났던 대표적인 도심하천이에요! 동천이 다시 더 건강한 하천이 되게 하기 위해 동천 근처에서 쓰레기 3개를 줍고 인증해주세요!',
 '{"items":["🥤","🛍️","🥫"],"target":3,"done":"🧹 쓰레기 3개 수거 완료! 동천이 깨끗해졌어요."}'),

('daecheon', '대천천', '부산광역시 북구',
 '대천천 현장 탐정이 되어 사진, 발견 생물, 하천 상태를 기록하고 이상 징후 판단 퀴즈를 해결합니다.',
 5, '에코 탐정 관찰일지 & 이상 징후 판단', '🔍', 'teal', 'badge_daecheon',
 '대천천은 금정산에서 발원하여 화명동을 지나 낙동강으로 흐릅니다. 1959년 초대형 태풍 사라호 때 큰 홍수 피해를 입은 역사를 계기로 치수 사업이 정비되었습니다.',
 '1급수 청정 계곡수에 버들치, 무당개구리 등이 살며, 탁도 변화 시 환경 데이터 비교 기록이 핵심 수수께끼 해결법입니다.',
 'observe_log', '대천천 에코 탐정 관찰일지',
 '탐정이 되어 대천천을 직접 관찰해보고 상태를 확인해보아요!',
 '{"cta":"📷 현장 사진 촬영 & 일지 등록","done":"📷 관찰일지 등록 완료",
   "fields":[
     {"key":"found","label":"무엇을 발견했나요?","options":[
       {"emoji":"🌱","label":"식물"},{"emoji":"🕊️","label":"새"},
       {"emoji":"🐟","label":"물고기"},{"emoji":"🐞","label":"곤충"},
       {"emoji":"❓","label":"잘 모르겠어요"}]},
     {"key":"clarity","label":"오늘 하천의 상태는 어땠나요?","options":[
       {"emoji":"💧","label":"맑음"},{"emoji":"🌫️","label":"보통"},{"emoji":"🟤","label":"탁함"}]},
     {"key":"smell","label":"냄새는 어땠나요?","options":[
       {"emoji":"🙂","label":"없음"},{"emoji":"😐","label":"조금 남"},{"emoji":"😣","label":"심함"}]},
     {"key":"litter","label":"쓰레기는 얼마나 있었나요?","options":[
       {"emoji":"✨","label":"적음"},{"emoji":"🗑️","label":"보통"},{"emoji":"🚯","label":"많음"}]}
   ]}')

on conflict (slug) do update set
  seq = excluded.seq, subtitle = excluded.subtitle, icon = excluded.icon,
  theme = excluded.theme, badge_code = excluded.badge_code, summary = excluded.summary,
  detailed_history = excluded.detailed_history, detailed_ecology = excluded.detailed_ecology,
  mission_kind = excluded.mission_kind, mission_title = excluded.mission_title,
  mission_body = excluded.mission_body, mission_config = excluded.mission_config;

-- ── 하천당 스팟 1개 ─────────────────────────────────────────────────────
-- 좌표는 미실측(0,0) 자리표시자입니다. 지금 구조에서는 GPS 체크인을 쓰지 않으므로
-- 화면에 영향이 없지만, 위치 기능을 되살리려면 현장 답사가 선행되어야 합니다.
insert into public.spots (river_id, seq, name, theme, geom, radius_m, arrival_story)
select r.id, 1, r.name, r.subtitle,
       ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography, 100, r.summary
from public.rivers r
on conflict (river_id, seq) do nothing;

-- ── 퀴즈 4문항 (동천은 미션만이라 퀴즈 없음) ────────────────────────────
delete from public.quizzes;

insert into public.quizzes (spot_id, seq, question, options, answer_idx, explanation)
select s.id, v.seq, v.question, v.options, v.answer_idx, v.explanation
from (values
 ('suyeong', 1,
  '조선 효종 때(1652년) 이 하천 하구에 무엇이 설치되면서 사천에서 수영강으로 이름이 바뀌었나요?',
  array['삼도수군통제영','경상좌도수군절도사영 (경상좌수영)','전라좌도수군절도사영','나주목 관아'], 1,
  '조선시대 부산은 일본과 가까워 해안 방어가 매우 중요했는데, 수영천 하구에 수군을 지휘하는 경상좌수영이 자리 잡으면서 이 지역이 군사적 요충지가 됐어요. 1652년에는 현재의 수영 지역으로 좌수영이 이전했고, 이후 수영이라는 지명과 수영강의 이름도 이 수군영과 연결되어요!'),

 ('bujeon', 1,
  '부전천은 부산진구 부전동 일대를 흐르는 도심 하천으로, 과거에는 자연적인 물길이었지만 도시화 과정에서 대부분이 도로가 되었어요. 하천 위를 콘크리트나 구조물로 덮어서 물길이 겉으로 보이지 않게 만드는 것을 무엇이라고 하나요?',
  array['복개','매립','간척','준설'], 0,
  '하천 위를 콘크리트나 구조물로 덮어 물길이 겉으로 보이지 않게 만드는 것을 ''복개(覆蓋)''라고 해요. 최근에는 덮여 있던 하천을 다시 여는 복원 사업도 이어지고 있어요.'),

 ('oncheoncheon', 1,
  '온천천에서 아직 악취 민원은 발생하지 않았지만, 물의 탁도가 평소보다 갑자기 높아졌어요. 가장 먼저 할 일은?',
  array['아무것도 하지 않는다','바로 하천을 콘크리트로 덮는다','변화를 기록하고 다른 수질 정보와 함께 확인한다','온천천을 폐쇄한다'], 2,
  '기준치를 넘었는지만 보는 것보다 평소와 다른 변화가 나타났는지 관찰하는 것도 중요해요. 이상 징후를 일찍 발견하면 문제가 커지기 전에 원인을 확인하고 대응할 수 있어요.'),

 ('daecheon', 1,
  '대천천에서 평소보다 물이 탁해진 것을 발견했다면 가장 좋은 행동은?',
  array['그냥 지나간다','물에 직접 들어가 확인한다','관찰 내용을 기록하고 다른 환경 데이터와 비교한다','바로 하천 전체를 폐쇄한다'], 2,
  '한번의 관찰만으로 원인을 단정하기 보다는 탁도, 강수량, 수질 측정값 등의 정보를 함께 확인하는 것이 좋아요! 이렇게 이상 징후를 일찍 발견하면 문제가 커지기 전에 확인할 수 있어요.')
) as v(river_slug, seq, question, options, answer_idx, explanation)
join public.rivers r on r.slug = v.river_slug
join public.spots s on s.river_id = r.id and s.seq = 1;

-- ── 검증 ────────────────────────────────────────────────────────────────
-- 기대: 수영강 퀴즈1/미션없음, 부전천 1/없음, 온천천 1/tap_target,
--       동천 0/collect, 대천천 1/observe_log
--   select r.seq, r.name, coalesce(r.mission_kind::text,'—') as mission,
--          (select count(*) from public.quizzes q join public.spots s on s.id=q.spot_id
--            where s.river_id = r.id) as quizzes
--     from public.rivers r order by r.seq;
