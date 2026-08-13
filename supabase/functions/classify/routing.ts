/**
 * 신뢰도 기반 라우팅 (서버 사본) — PLAN.md §7.5 ④
 *
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║ ★ `src/lib/classifier/routing.ts`의 **의도적 복제본**입니다.          ║
 * ║   Deno는 Vite 앱의 TS를 import할 수 없어 재구현했습니다. 대신         ║
 * ║   **임계값과 판정 경계가 완전히 같아야 합니다.**                      ║
 * ║   한쪽만 고치지 마세요:                                               ║
 * ║     src/lib/classifier/routing.ts ←→ supabase/functions/classify/routing.ts
 * ║   특히 DEFAULT_ROUTING_THRESHOLDS의 네 값과 decideRouting의            ║
 * ║   **판정 순서(0→6)**가 같아야 같은 입력에 같은 status가 나옵니다.     ║
 * ║   회귀 방지: src/lib/classifier/routing.test.ts의 케이스를 서버 쪽으로 ║
 * ║   복제해 두면 두 구현이 갈라지는 순간 바로 드러납니다.                ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 *
 * ★ 이 파일은 "정답을 정하는" 코드가 아닙니다.
 *   declared(아이가 고른 종)는 **입력이지 출력이 아닙니다.**
 *   여기서 정하는 것은 "이 관찰을 어느 경로로 보낼 것인가" 하나뿐입니다.
 */

export type ObservationStatus =
  | 'auto_confirmed'
  | 'pending'
  | 'confirmed'
  | 'corrected'
  | 'rejected';

export type RoutingReason =
  | 'off_topic'
  | 'expert_review_required'
  | 'no_model_result'
  | 'low_confidence'
  | 'species_mismatch'
  | 'agreement'
  | 'inconsistent_input';

export interface ClassifyResult {
  speciesId: string | null;
  confidence: number;
  offTopic: boolean;
  reason?: string;
  modelVersion: string;
}

/** 라우팅에 필요한 최소 종 메타데이터 (DB 행에서 그대로) */
export interface RoutingSpecies {
  id: string;
  tier: number;
  ethics_flag: string;
}

export interface RoutingDecision {
  status: ObservationStatus;
  reason: RoutingReason;
  agreement: boolean | null;
  confidence: number | null;
  requiresExpertReview: boolean;
  modelVersion: string | null;
}

// ─────────────────────────────────────────────────────────────
// 튜닝 지점 — 브라우저의 DEFAULT_ROUTING_THRESHOLDS와 값이 같아야 합니다
// ─────────────────────────────────────────────────────────────

export interface RoutingThresholds {
  /** 자동 확정 최소 신뢰도 (0..1). 보수적 출발점 0.85 — 파일럿에서 재설정 예정 */
  autoConfirmMinConfidence: number;
  /** 자동 확정 허용 최대 등급. 2 = ⭐~⭐⭐. ⭐⭐⭐ 이상은 전량 사람 검수 */
  autoConfirmMaxTier: number;
  /** 등급과 무관하게 항상 전문가 검수로 보내는 윤리 플래그 */
  expertReviewEthicsFlags: string[];
  /** offTopic(신발·실내·인물) 시 즉시 반려할지 */
  rejectOnOffTopic: boolean;
}

export const DEFAULT_ROUTING_THRESHOLDS: RoutingThresholds = {
  autoConfirmMinConfidence: 0.85,
  autoConfirmMaxTier: 2,
  expertReviewEthicsFlags: ['report_only', 'expert_only'],
  rejectOnOffTopic: true,
};

// ─────────────────────────────────────────────────────────────
// 판정
// ─────────────────────────────────────────────────────────────

export function decideStatus(
  declared: string,
  modelResult: ClassifyResult | null,
  species: RoutingSpecies,
  thresholds: RoutingThresholds = DEFAULT_ROUTING_THRESHOLDS,
): ObservationStatus {
  return decideRouting(declared, modelResult, species, thresholds).status;
}

export function decideRouting(
  declared: string,
  modelResult: ClassifyResult | null,
  species: RoutingSpecies,
  thresholds: RoutingThresholds = DEFAULT_ROUTING_THRESHOLDS,
): RoutingDecision {
  const modelVersion = modelResult?.modelVersion ?? null;
  const requiresExpertReview = needsExpertReview(species, thresholds);

  // 0) 배선 오류 방어. 배치 한가운데서 throw하지 않고 조용히 보류합니다.
  if (species.id !== declared) {
    return {
      status: 'pending',
      reason: 'inconsistent_input',
      agreement: null,
      confidence: null,
      requiresExpertReview: true,
      modelVersion,
    };
  }

  // 1) 대분류 불일치 — 인물이 찍힌 사진은 빨리 걷어내야 합니다(§5.2).
  if (modelResult && modelResult.offTopic && thresholds.rejectOnOffTopic) {
    return {
      status: 'rejected',
      reason: 'off_topic',
      agreement: false,
      confidence: normalizeConfidence(modelResult.confidence),
      requiresExpertReview,
      modelVersion,
    };
  }

  // 2) ⭐⭐⭐ 이상 · 보호종 · 전문가 동반 종 → 항상 사람이 봅니다.
  if (requiresExpertReview) {
    return {
      status: 'pending',
      reason: 'expert_review_required',
      agreement: modelResult ? isAgreement(declared, modelResult) : null,
      confidence: modelResult ? normalizeConfidence(modelResult.confidence) : null,
      requiresExpertReview: true,
      modelVersion,
    };
  }

  // 3) 모델 결과 없음 — D안 폴백. 전부 검수 큐로.
  if (!modelResult) {
    return {
      status: 'pending',
      reason: 'no_model_result',
      agreement: null,
      confidence: null,
      requiresExpertReview: false,
      modelVersion: null,
    };
  }

  const confidence = normalizeConfidence(modelResult.confidence);
  const agreement = isAgreement(declared, modelResult);

  // 4) 불일치 — 검수 큐이자 가장 값진 콘텐츠 개선 신호 (신뢰도보다 먼저 봅니다).
  if (!agreement) {
    return {
      status: 'pending',
      reason: 'species_mismatch',
      agreement: false,
      confidence,
      requiresExpertReview: false,
      modelVersion,
    };
  }

  // 5) 일치하지만 신뢰도가 낮음
  if (confidence < thresholds.autoConfirmMinConfidence) {
    return {
      status: 'pending',
      reason: 'low_confidence',
      agreement: true,
      confidence,
      requiresExpertReview: false,
      modelVersion,
    };
  }

  // 6) 높은 신뢰도 + 일치 + tier 1~2 → 즉시 확정
  return {
    status: 'auto_confirmed',
    reason: 'agreement',
    agreement: true,
    confidence,
    requiresExpertReview: false,
    modelVersion,
  };
}

export function needsExpertReview(
  species: RoutingSpecies,
  thresholds: RoutingThresholds = DEFAULT_ROUTING_THRESHOLDS,
): boolean {
  return (
    species.tier > thresholds.autoConfirmMaxTier ||
    thresholds.expertReviewEthicsFlags.includes(species.ethics_flag)
  );
}

// ─────────────────────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────────────────────

function isAgreement(declared: string, modelResult: ClassifyResult): boolean {
  // speciesId가 null이면 "후보 중에 없다" → 불일치로 다룹니다.
  return modelResult.speciesId !== null && modelResult.speciesId === declared;
}

/**
 * 0..1 정규화. NaN·범위 밖은 **0으로** 떨어뜨립니다(1이 아니라).
 * 이상한 값이 자동 확정으로 새는 것보다 검수 큐에 쌓이는 편이 안전합니다.
 */
function normalizeConfidence(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}
