-- ============================================================================
-- 0016_forbid_null_island.sql — (0,0) 좌표 금지
--
-- 계기: 화면 계층에서 "좌표 없음"과 "좌표가 (0,0)"을 구분할 수 없다는 지적.
--   RiverView.lat/lng 는 number 라 스팟이 없으면 0으로 떨어지고,
--   그러면 부산에서 약 9,700km 떨어진 기니만(Null Island)까지의 거리가 계산되어
--   화면에 "약 9,700km 더 가야 해요"가 뜹니다. 에러가 아니라 그럴듯한 오답입니다.
--
-- 앱 쪽에도 방어가 들어가 있지만(hasCoordinates / isUsablePoint),
-- **애초에 그런 행이 생기지 못하게** DB에서 막는 편이 확실합니다.
-- 조용히 이상한 숫자가 보이는 대신 INSERT가 큰 소리로 실패합니다.
--
-- ⚠ 0003의 원래 설계는 "좌표 미실측 자리표시자로 (0,0)을 넣는다"였습니다.
--   그 방식은 여기서 폐기합니다 — **자리표시자가 유효한 좌표처럼 계산에 섞여
--   들어간 것**이 바로 이 문제의 원인이었습니다.
--   좌표를 모르면 스팟을 만들지 마세요. 없는 것과 0은 다릅니다.
-- ============================================================================

set search_path = public, extensions;

alter table public.spots drop constraint if exists spots_geom_not_null_island;
alter table public.spots add constraint spots_geom_not_null_island
  check (not (ST_X(geom::geometry) = 0 and ST_Y(geom::geometry) = 0));

comment on constraint spots_geom_not_null_island on public.spots is
  '(0,0) 금지. 미실측 자리표시자로 쓰였으나 거리 계산에 유효한 좌표처럼 섞여 들어가 문제가 됐습니다.';
