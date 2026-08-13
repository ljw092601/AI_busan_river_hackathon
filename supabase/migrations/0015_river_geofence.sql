-- ============================================================================
-- 0015_river_geofence.sql — 하천 지오펜스 좌표와 반경
--
-- 계기: 홈 화면에 카카오 지도를 띄우고 GPS로 미션/퀴즈를 잠금해제하는 요구.
--       그때까지 전 스팟 좌표가 (0,0)이라 지도에 기니만이 찍히고
--       거리 계산이 전부 무의미했습니다.
-- ============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1) radius_m 상한을 300m → 5000m
--
-- 기존 제약(between 20 and 300)은 "하천변의 특정 지점"을 전제한 값입니다.
-- 지금은 스팟 하나가 하천 전체를 대표하므로, 길이 수 km짜리 대상을 점 하나로
-- 근사하고 있습니다. 300m로는 온천천 산책로 한가운데 서 있어도 안 열립니다.
--
-- ⚠ 근본 해법은 하천을 **선(LineString)** 으로 두는 것입니다.
--   geom을 geography(LineString)로 바꾸면 ST_DWithin이 선까지의 거리를 그대로
--   계산해 주므로 함수는 한 줄도 고칠 필요가 없습니다.
--   원형 지오펜스는 하천의 실제 모양과 달라서, 반경 안이지만 하천에서 먼 곳과
--   하천 위지만 반경 밖인 곳이 동시에 생깁니다. 지금은 데모 우선입니다.
-- ---------------------------------------------------------------------------
alter table public.spots drop constraint if exists spots_radius_m_check;
alter table public.spots add constraint spots_radius_m_check
  check (radius_m between 20 and 5000);

comment on column public.spots.radius_m is
  '체크인/잠금해제 허용 반경(m). 하천 단위 지오펜스는 1000~1500m를 씁니다 —
   하천은 선인데 점 하나로 근사하고 있기 때문입니다. 지점 단위로 정밀화하면 100m 이하로 줄이세요.';

-- ---------------------------------------------------------------------------
-- 2) 5대 하천 대표 좌표
--
-- ⚠️⚠️ 미검증 근사 좌표입니다. 각 하천의 잘 알려진 접근 지점을 기준으로 했지만
--   현장 답사로 확인하지 않았습니다. 운영 배포 전 실측으로 교체하세요.
--   (부산 범위: 위도 34.9~35.4, 경도 128.7~129.35 안에 있는지는 확인했습니다.)
-- ---------------------------------------------------------------------------
update public.spots s
   set geom = ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)::geography,
       radius_m = v.radius_m
  from (values
    ('suyeong',      129.1256, 35.1729, 1500),  -- 수영교 일대 (수영구·해운대구)
    ('bujeon',       129.0594, 35.1583, 1000),  -- 부전동 서면 일대 (부산진구)
    ('oncheoncheon', 129.0784, 35.2049, 1500),  -- 온천천 시민공원 (동래구)
    ('dongcheon',    129.0561, 35.1417, 1000),  -- 범천동 일대 (부산진구)
    ('daecheon',     129.0128, 35.2344, 1200)   -- 화명동 일대 (북구)
  ) as v(slug, lng, lat, radius_m)
  join public.rivers r on r.slug = v.slug
 where s.river_id = r.id and s.seq = 1;

comment on table public.spots is
  '코스 상의 지점. 현재 구조에서는 하천당 1개 = 하천 자신입니다.
   ⚠ 좌표는 미검증 근사값입니다(0015). 현장 답사 전에는 잠금해제 거리 판정을 신뢰하지 마세요.';

-- 검증:
--   select r.slug, ST_Y(s.geom::geometry) lat, ST_X(s.geom::geometry) lng, s.radius_m
--     from public.spots s join public.rivers r on r.id = s.river_id order by r.seq;
