/**
 * 판별 어댑터 계약 확장 — 배치 처리 · 라우팅 결정 타입
 *
 * 근거: PLAN.md §7.5 (판별 방식 전체), SETUP.md §1-C (Claude API 채택)
 *
 * `src/types/domain.ts`의 `Classifier` / `ClassifyRequest` / `ClassifyResult`가
 * "사진 1장"의 계약이라면, 이 파일은 그것을 **비동기 배치**로 확장합니다.
 *
 * ─────────────────────────────────────────────────────────────
 * 왜 배치인가 (PLAN.md §7.5 "판별을 실시간으로 할 필요가 없습니다")
 *
 * 아이의 도감 카드는 **본인이 고른 종으로 즉시** 발급됩니다.
 * 모델은 정답을 알려주는 게 아니라 사후에 **채점**합니다.
 * 따라서 판별은 동기 호출일 필요가 전혀 없고, 그 결과
 *   - 하천변에서 통신이 끊겨도 아이 경험은 그대로 (로컬 큐 → 나중에 처리)
 *   - 레이턴시가 UX에 영향 없음 → 배치로 비용·레이트리밋 완화
 *   - 사람 검수 통과 후 판별 → 미검수 사진의 외부 전송 문제도 해소
 * 가 따라옵니다.
 * ─────────────────────────────────────────────────────────────
 */

import type {
  ClassifyRequest,
  ClassifyResult,
  Classifier,
  ObservationStatus,
} from '@/types/domain';

// ─────────────────────────────────────────────────────────────
// 후보 종 — 판별 요청에 실려 가는 최소 정보
// ─────────────────────────────────────────────────────────────

/**
 * 판별 요청에 담기는 후보 종.
 *
 * `domain.ts`의 `ClassifyRequest['candidates']`와 동일한 형태를 이름 있는
 * 타입으로 꺼낸 것입니다. 모듈 경계에서 이 이름으로 주고받습니다.
 *
 * ⚠️ 여기에 `userId` 같은 식별자를 절대 추가하지 마세요.
 *    PLAN.md §7.5 ③ — 외부로는 **이미지 바이트 + 종 후보**만 나갑니다.
 *    식별자가 함께 나가는 순간 "개인을 식별할 수 있는 바이트 뭉치"가 됩니다.
 */
export type CandidateSpecies = ClassifyRequest['candidates'][number];

// ─────────────────────────────────────────────────────────────
// 배치 판별 계약
// ─────────────────────────────────────────────────────────────

/** 배치 안의 사진 1장 */
export interface BatchClassifyItem {
  /**
   * 관찰 레코드 id. 결과를 되짚기 위한 **앱 내부** 키입니다.
   *
   * 판별 엔진에 실제로 전달되는 값이지만 개인정보가 아닙니다
   * (observations.id는 랜덤 uuid이고 아이와 연결되는 정보를 담지 않습니다).
   * 결과 순서가 뒤섞여 돌아와도 이 키로 맞춥니다 — **배열 인덱스로 맞추지 마세요.**
   */
  observationId: string;
  /** EXIF가 제거된 이미지 (필수 — 원본 금지). src/lib/image/ 파이프라인 산출물 */
  image: Blob;
  /** 후보 압축 결과 (candidates.ts) */
  candidates: CandidateSpecies[];
}

export interface BatchClassifyRequest {
  items: BatchClassifyItem[];
}

/** 배치 결과 1건 */
export interface BatchClassifyResultItem {
  observationId: string;
  /**
   * 판별 결과. `null`이면 이 건은 판별하지 못했다는 뜻입니다
   * (엔진 오류·타임아웃·이미지 손상 등). **실패가 앱을 막지 않습니다** —
   * routing.ts가 `null`을 정상 입력으로 받아 `pending`으로 보냅니다.
   */
  result: ClassifyResult | null;
  /** 실패 사유 (운영 로그용, 아이에게 노출하지 않음) */
  error?: string;
}

export interface BatchClassifyResult {
  /** 요청 순서와 무관. `observationId`로 매칭하세요 */
  items: BatchClassifyResultItem[];
  /** 재평가·정확도 추적용 (observations.model_version에 저장) */
  modelVersion: string;
}

/**
 * 배치를 지원하는 판별기.
 *
 * `Classifier`(단건)를 그대로 상속하므로, 단건 호출이 필요한 곳
 * (예: 검수자가 한 장만 다시 돌려보는 화면)에서도 같은 객체를 씁니다.
 */
export interface BatchClassifier extends Classifier {
  classifyBatch(req: BatchClassifyRequest): Promise<BatchClassifyResult>;
}

/** 단건 결과에서 흔히 쓰는 형태 (어댑터 구현 편의) */
export type { ClassifyRequest, ClassifyResult, Classifier };

// ─────────────────────────────────────────────────────────────
// 라우팅 결정 (PLAN.md §7.5 ④)
// ─────────────────────────────────────────────────────────────

/**
 * 라우팅 사유. `status`만으로는 "왜 검수 큐에 왔는지"를 알 수 없어
 * 검수 화면의 우선순위·설명과 콘텐츠 개선 지표(어떤 종의 식별 힌트가 부족한가)에
 * 쓰기 위해 별도로 남깁니다.
 */
export type RoutingReason =
  /** 대분류 불일치 (신발·실내·인물) → 즉시 반려 */
  | 'off_topic'
  /** ⭐⭐⭐ 이상 또는 보호종·전문가 동반 종 → 항상 전문가 검수 */
  | 'expert_review_required'
  /** 모델 결과 없음 (D안 폴백 · 엔진 실패 · 배치 대기) */
  | 'no_model_result'
  /** 모델이 후보를 골랐지만 신뢰도가 임계값 미만 */
  | 'low_confidence'
  /** 아이 선택 ≠ 모델 추론 — 검수 큐이자 식별 힌트 개선 신호 */
  | 'species_mismatch'
  /** 높은 신뢰도 + 일치 + 하위 등급 → 즉시 확정 */
  | 'agreement'
  /** 입력이 서로 맞지 않음 (declared ≠ species.id) — 배선 버그. 안전하게 보류 */
  | 'inconsistent_input';

export interface RoutingDecision {
  status: ObservationStatus;
  reason: RoutingReason;
  /**
   * 아이 선택과 모델 추론의 일치 여부. 모델 결과가 없으면 `null`.
   *
   * 이 값의 누적이 곧 **아이의 식별 능력 성장 곡선**입니다 (PLAN.md §7.9).
   */
  agreement: boolean | null;
  /** 0..1로 정규화된 신뢰도. 모델 결과가 없으면 `null` */
  confidence: number | null;
  /** 사람 검수가 반드시 필요한 건인지 — 검수 큐 우선순위 산정용 */
  requiresExpertReview: boolean;
  modelVersion: string | null;
}
