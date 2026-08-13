/**
 * 도메인 공유 타입 — 전 모듈의 계약(contract).
 *
 * ⚠️ 이 파일은 여러 작업 트랙이 공유합니다. 임의로 바꾸지 마세요.
 * 변경이 필요하면 먼저 논의하고, 모든 사용처를 함께 고칩니다.
 *
 * 근거 문서: PLAN.md §7 (생물 도감 시스템), content/oncheoncheon-draft.md
 */

// ─────────────────────────────────────────────────────────────
// 도감 — 등급 · 트랙 (PLAN.md §7.2, §7.4)
// ─────────────────────────────────────────────────────────────

/**
 * 도감 등급. 숫자로 다룹니다 — 별 이모지는 표시 계층에서만 씁니다.
 *   1 = ⭐        흔한 친구        (어디서나)
 *   2 = ⭐⭐      물이 맑아야      (2급수 지표)
 *   3 = ⭐⭐⭐    아주 맑아야      (1급수 지표)
 *   4 = ⭐⭐⭐⭐  귀한 손님        (계절·서식 조건 까다로움)
 *   5 = 🏅        특별 기록        (보호종 — 발견 보고만)
 */
export type Tier = 1 | 2 | 3 | 4 | 5;

/** 등급별 획득 포인트 (PLAN.md §6.1) */
export const TIER_POINTS: Record<Tier, number> = {
  1: 20,
  2: 30,
  3: 45,
  4: 60,
  5: 60,
};

/**
 * 보장 트랙 = 항상 그 자리에 있는 것(식물·흔적·시설). 헛걸음 방지.
 * 도전 트랙 = 살아 움직이는 동물. 발견해야 획득.
 */
export type Track = 'guaranteed' | 'challenge';

export type SpeciesCategory =
  | 'waterbird'   // 물새
  | 'smallbird'   // 작은 새
  | 'fish'        // 물고기
  | 'mammal'      // 포유류 — 수달 등 (전부 report_only 보호종)
  | 'insect'      // 수서곤충
  | 'benthos'     // 저서생물 (지표생물)
  | 'plant'       // 물가 식물
  | 'invasive'    // 생태교란 식물
  | 'trace'       // 흔적 (발자국·깃털·껍데기)
  | 'facility';   // 장소·시설

/**
 * 관찰 윤리 제약 (PLAN.md §7.6) — 획득 조건에 내장됩니다.
 *   none        제약 없음
 *   no_approach 접근 금지 (근접 촬영 감점)
 *   report_only 촬영 불필요, 목격 보고만으로 획득 (보호종)
 *   expert_only 전문가 동반 프로그램에서만 해금 (저서생물)
 */
export type EthicsFlag = 'none' | 'no_approach' | 'report_only' | 'expert_only';

/** 수질 등급 지표 (해당 종이 지표생물일 때만) */
export type WaterGrade = 1 | 2 | 3 | 4;

export interface Species {
  id: string;
  code: string;
  commonName: string;
  scientificName?: string;
  category: SpeciesCategory;
  tier: Tier;
  track: Track;
  /** 수질 지표종일 때의 등급. 아니면 null */
  waterGrade: WaterGrade | null;
  /** 관찰 가능 월 (1~12). 연중이면 1..12 전체 */
  months: number[];
  /** 아이용 식별 힌트 — 혼동종과의 '차이 한 가지' */
  idHint: string;
  /** 생태 설명 (카드 뒷면) */
  fact: string;
  ethicsFlag: EthicsFlag;
  illustrationUrl?: string;
}

// ─────────────────────────────────────────────────────────────
// 코스 · 스팟
// ─────────────────────────────────────────────────────────────

export interface River {
  id: string;
  slug: string;
  name: string;
  region: string;
  summary: string;
}

export interface Spot {
  id: string;
  riverId: string;
  /** 상류→하류 순서 (1부터) */
  seq: number;
  name: string;
  theme: string;
  lat: number;
  lng: number;
  /** 체크인 허용 반경(m). 스팟별 개별 튜닝 (GPS 오차 대응) */
  radiusM: number;
  arrivalStory: string;
  safetyNote: string;
  /** 사진 미션 지시문 (없을 수 있음) */
  photoMission?: string;
}

export interface Quiz {
  id: string;
  spotId: string;
  question: string;
  options: string[];
  /** options 배열의 정답 인덱스 */
  answerIdx: number;
  explanation: string;
}

// ─────────────────────────────────────────────────────────────
// 관찰 · 도감 보유 (PLAN.md §7.9)
// ─────────────────────────────────────────────────────────────

/**
 * 관찰 판정 상태 (PLAN.md §7.5 신뢰도 기반 라우팅)
 *   auto_confirmed  높은 신뢰도 + 아이 선택 일치 + 하위 등급 → 즉시 확정
 *   pending         검수 큐 대기 (불일치·낮은 신뢰도·상위 등급)
 *   confirmed       검수 통과
 *   corrected       정정됨 (포인트 차감 없음 — 아이를 처벌하지 않습니다)
 *   rejected        대분류 불일치 (신발/실내/인물)
 */
export type ObservationStatus =
  | 'auto_confirmed'
  | 'pending'
  | 'confirmed'
  | 'corrected'
  | 'rejected';

export interface Observation {
  id: string;
  userId: string;
  spotId: string;
  /** 아이가 고른 종 — 항상 존재 (교육의 핵심) */
  declaredSpeciesId: string;
  /** 모델 추론 결과 — 없을 수 있음 (D안 폴백) */
  modelSpeciesId: string | null;
  modelConfidence: number | null;
  modelVersion: string | null;
  photoId: string | null;
  status: ObservationStatus;
  finalSpeciesId: string | null;
  observedAt: string;
}

/** 도감 보유 — 같은 종을 여러 번 만나도 카드는 1장 */
export interface DexEntry {
  userId: string;
  speciesId: string;
  firstObservedAt: string;
  bestPhotoId: string | null;
  /** 총 관찰 횟수 */
  count: number;
}

/** 못 찾았을 때의 대체 보상 (PLAN.md §7.2 빈손 방지) */
export interface ObservationLog {
  id: string;
  userId: string;
  spotId: string;
  note: string;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// 포인트 원장 (PLAN.md §4.2 — 잔액 컬럼이 아니라 원장)
// ─────────────────────────────────────────────────────────────

export type PointReason =
  | 'checkin'          // 스팟 체크인 +10
  | 'species_found'    // 생물 발견 (등급별 20~60)
  | 'observation_log'  // 관찰 일지 +10 (빈손 방지)
  | 'quiz_correct'     // 퀴즈 정답 +15
  | 'quiz_wrong'       // 퀴즈 오답 +5 (이탈 방지)
  | 'course_complete'  // 코스 완주 +100
  | 'dex_set_complete' // 도감 세트 완성 +80
  | 'river_milestone'; // 하천 3개 완주 +300

export const POINT_VALUES: Record<Exclude<PointReason, 'species_found'>, number> = {
  checkin: 10,
  observation_log: 10,
  quiz_correct: 15,
  quiz_wrong: 5,
  course_complete: 100,
  dex_set_complete: 80,
  river_milestone: 300,
};

export interface PointsLedgerEntry {
  id: string;
  userId: string;
  /** 증감분. 잔액은 SUM(delta)로 계산합니다 */
  delta: number;
  reason: PointReason;
  refType: string | null;
  refId: string | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// 판별 어댑터 (PLAN.md §7.5) — 모델 교체가 1줄이 되도록
// ─────────────────────────────────────────────────────────────

export interface ClassifyRequest {
  /** EXIF가 제거된 이미지 (필수 — 원본 금지) */
  image: Blob;
  /** 후보 압축 결과: spot_species × 현재 월 */
  candidates: Pick<Species, 'id' | 'commonName' | 'idHint' | 'category'>[];
}

export interface ClassifyResult {
  speciesId: string | null;
  /** 0..1 */
  confidence: number;
  /** 대분류 불일치(신발/실내/인물) 시 true → 즉시 반려 */
  offTopic: boolean;
  reason?: string;
  modelVersion: string;
}

export interface Classifier {
  readonly version: string;
  classify(req: ClassifyRequest): Promise<ClassifyResult>;
}
