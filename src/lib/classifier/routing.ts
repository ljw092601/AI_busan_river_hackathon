/**
 * 신뢰도 기반 라우팅 (PLAN.md §7.5 ④)
 *
 * ─────────────────────────────────────────────────────────────
 * 왜 아이의 선택을 자동 확정으로 대체하지 않는가  ★ 이 파일의 전제
 *
 * 모델이 아무리 정확해져도 ③(아이가 최종 선택)은 제거하면 안 됩니다.
 * 앱이 자동으로 "왜가리입니다" 하고 카드를 주면, 아이는 아무것도 배우지 않고
 * **사진 찍는 기계의 조수**가 됩니다. 관찰의 핵심은 *차이를 알아보는 것*이고,
 * 그건 아이가 직접 고를 때만 일어납니다.
 *
 * 그래서 이 파일의 함수는 "정답을 정하는" 함수가 아닙니다.
 * `declaredSpeciesId`(아이가 고른 종)는 **입력이지 출력이 아닙니다.**
 * 여기서 정하는 건 오직 "이 관찰 기록을 어느 경로로 보낼 것인가" 하나뿐이고,
 * 모델의 역할은 아이의 답을 **채점하고 데이터 품질을 보증하는 것**입니다.
 *
 * 이건 기술적 한계 때문의 타협이 아니라, 교육앱으로서의 의도적 설계입니다.
 * ─────────────────────────────────────────────────────────────
 *
 * 라우팅 규칙 (PLAN.md §7.5 ④)
 *   높은 신뢰도 + 아이 선택 일치 + tier 1~2  → 'auto_confirmed'
 *   불일치 또는 낮은 신뢰도                  → 'pending' (검수 큐)
 *   tier 3 이상 · 보호종(ethicsFlag)         → 'pending' (항상 전문가 검수)
 *   대분류 불일치 (offTopic)                 → 'rejected'
 *
 * ⚠️ `pending`은 벌이 아닙니다. 아이는 이미 카드를 받았고 포인트도 받았습니다.
 *    사후 검수에서 오판정이 확인되면 카드를 회수하지 않고
 *    "다시 살펴보니 ○○였어!"로 **정정**합니다 (포인트 차감 없음 — PLAN.md §7.5).
 */

import type { EthicsFlag, ObservationStatus, Species, Tier } from '@/types/domain';
import type { ClassifyResult, RoutingDecision, RoutingReason } from './types';

// ─────────────────────────────────────────────────────────────
// 튜닝 지점 — 임계값은 전부 여기 모여 있습니다
//
// 파일럿(Phase 2)에서 실제 오판정률을 재고 조정할 값들입니다.
// PLAN.md §10 목표: 종 오판정률 30% 미만.
// 검수 인력이 부담되면 임계값을 낮추고, 신뢰가 무너지면 올립니다.
// ─────────────────────────────────────────────────────────────

export interface RoutingThresholds {
  /**
   * 자동 확정에 필요한 최소 신뢰도 (0..1).
   *
   * 0.85는 **근거 있는 추정치가 아니라 보수적인 출발점**입니다.
   * iNaturalist류 모델의 Top-1 정확도가 75% 수준이라는 점, 그리고 우리는
   * 후보가 3~10종으로 압축돼 있어 더 높게 나와야 한다는 점을 함께 고려한 값입니다.
   * TODO(검토): 파일럿에서 (신뢰도 구간 × 검수 결과 일치율) 표를 만들어
   *             "일치율 95% 이상이 유지되는 최저 신뢰도"로 재설정할 것.
   */
  autoConfirmMinConfidence: number;

  /**
   * 자동 확정을 허용하는 최대 등급.
   *
   * 2 = ⭐~⭐⭐까지만 자동. ⭐⭐⭐ 이상은 1급수 지표생물이라
   * (a) 모델 학습 데이터가 가장 부족하고 (PLAN.md §7.5 제약 ①)
   * (b) 시민과학 데이터로 대외 공표되는 등급이라 (§7.8)
   * 하필 가장 중요한 곳에서 자동 판별이 가장 약합니다. 그래서 전량 사람 검수.
   */
  autoConfirmMaxTier: Tier;

  /**
   * 등급과 무관하게 항상 전문가 검수로 보내는 윤리 플래그.
   *
   * report_only = 보호종(수달·저어새). 시민과학 가치가 가장 큰 기록이라
   *               오탐이 그대로 공식 데이터가 되면 안 됩니다.
   * expert_only = 저서생물. 애초에 전문가 동반 프로그램에서만 등록됩니다.
   *
   * no_approach는 제외했습니다 — 그건 촬영 거리 규칙이지 판정 난이도가 아닙니다.
   */
  expertReviewEthicsFlags: EthicsFlag[];

  /**
   * offTopic(신발·실내·인물) 시 즉시 반려할지.
   *
   * true를 기본으로 둡니다. 인물이 우연히 포함된 사진은 검수 단계에서
   * 반려 + 즉시 삭제해야 하고(§5.2), 지연이 길수록 위험이 큽니다.
   * TODO(검토): 파일럿에서 offTopic 오탐(진짜 생물 사진인데 반려)이 관측되면
   *             false로 내려 'pending'으로 보내고 사람이 판단하게 할 것.
   *             아이의 진짜 사진을 반려하는 것은 그 자체로 이탈 요인입니다.
   */
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

/**
 * 관찰 1건의 상태를 결정합니다.
 *
 * @param declared     아이가 고른 종의 id — **항상 존재합니다** (교육의 핵심)
 * @param modelResult  모델 추론 결과. `null` 가능:
 *                       · D안 폴백 (판별 엔진 미확보)
 *                       · 배치가 아직 안 돌았음
 *                       · 엔진 호출 실패
 *                     어느 경우든 앱은 정상 동작해야 하고, 전부 `pending`입니다.
 * @param species      `declared`가 가리키는 종의 메타데이터 (tier·ethicsFlag 판단용)
 *
 * 순수 함수입니다. DB·시계·네트워크를 건드리지 않습니다.
 */
export function decideStatus(
  declared: string,
  modelResult: ClassifyResult | null,
  species: Species,
  thresholds: RoutingThresholds = DEFAULT_ROUTING_THRESHOLDS,
): ObservationStatus {
  return decideRouting(declared, modelResult, species, thresholds).status;
}

/**
 * {@link decideStatus}의 상세 버전. 사유·일치 여부·신뢰도를 함께 돌려줍니다.
 *
 * 검수 큐 정렬, 성장 곡선 집계(일치율), 콘텐츠 개선 지표
 * (어떤 종의 식별 힌트가 부족한가)에 이 값을 씁니다.
 */
export function decideRouting(
  declared: string,
  modelResult: ClassifyResult | null,
  species: Species,
  thresholds: RoutingThresholds = DEFAULT_ROUTING_THRESHOLDS,
): RoutingDecision {
  const modelVersion = modelResult?.modelVersion ?? null;
  const requiresExpertReview = needsExpertReview(species, thresholds);

  // 0) 배선 오류 방어.
  //    declared와 species가 다른 종을 가리키면 어떤 판정도 신뢰할 수 없습니다.
  //    배치 잡 한가운데서 throw하면 나머지 건까지 죽으므로, 조용히 보류합니다.
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

  // 1) 대분류 불일치 — 생물 사진이 아예 아님. 등급보다 먼저 판정합니다.
  //    (인물이 찍힌 사진은 빨리 걷어내야 합니다 — §5.2)
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

  // 2) ⭐⭐⭐ 이상 · 보호종 · 전문가 동반 종 → 모델이 뭐라 하든 항상 사람이 봅니다.
  //    모델 결과 유무보다 먼저 판정해야, 엔진이 붙든 안 붙든 같은 경로가 됩니다.
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

  // 3) 모델 결과 없음 — D안 폴백. 아이 경험은 동일하고, 전부 검수 큐로.
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

  // 4) 불일치 — 검수 큐이자, 가장 값진 콘텐츠 개선 신호입니다.
  //    (신뢰도보다 먼저 봅니다: 낮은 신뢰도로 '다른 종'을 지목한 건도
  //     "이 두 종이 헷갈린다"는 정보를 담고 있습니다.)
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

/**
 * 사람 검수가 반드시 필요한 종인가.
 *
 * 검수 인력 산정(§11 "검수 인력 부담")과 교사 대시보드 큐 필터에 그대로 씁니다.
 */
export function needsExpertReview(
  species: Species,
  thresholds: RoutingThresholds = DEFAULT_ROUTING_THRESHOLDS,
): boolean {
  return (
    species.tier > thresholds.autoConfirmMaxTier ||
    thresholds.expertReviewEthicsFlags.includes(species.ethicsFlag)
  );
}

/** 사유별 사람용 설명 — 검수 화면 라벨. 아이에게 보여주는 문구가 아닙니다. */
export const ROUTING_REASON_LABEL: Record<RoutingReason, string> = {
  off_topic: '생물 사진이 아닌 것으로 판정 (신발·실내·인물 등)',
  expert_review_required: '상위 등급 또는 보호종 — 전문가 검수 필수',
  no_model_result: '모델 판별 결과 없음 (엔진 미연동 또는 배치 대기)',
  low_confidence: '아이 선택과 일치하나 모델 신뢰도가 낮음',
  species_mismatch: '아이 선택과 모델 추론이 불일치',
  agreement: '모델이 아이 선택을 높은 신뢰도로 확인',
  inconsistent_input: '입력 불일치 (선택 종과 종 메타데이터가 다름)',
};

// ─────────────────────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────────────────────

function isAgreement(declared: string, modelResult: ClassifyResult): boolean {
  // speciesId가 null이면 "후보 중에 없다"는 뜻 → 불일치로 다룹니다.
  return modelResult.speciesId !== null && modelResult.speciesId === declared;
}

/**
 * 신뢰도를 0..1로 정규화합니다.
 *
 * NaN·범위 밖 값은 **0으로 떨어뜨립니다**(1이 아니라). 어댑터가 이상한 값을
 * 돌려줬을 때 자동 확정으로 새는 것보다 검수 큐에 쌓이는 편이 안전합니다.
 */
function normalizeConfidence(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}
