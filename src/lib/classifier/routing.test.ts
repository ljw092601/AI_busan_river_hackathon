/**
 * 라우팅 규칙 테스트 (PLAN.md §7.5 ④)
 *
 * 특히 중요한 두 가지:
 *   1. 모델 결과가 null일 때 (D안 폴백) — 전부 pending, 예외 없음
 *   2. tier 3 이상 · 보호종 — 모델이 뭐라 하든 항상 pending
 */

import {
  DEFAULT_ROUTING_THRESHOLDS,
  decideRouting,
  decideStatus,
  needsExpertReview,
} from './routing';
import type { ClassifyResult } from './types';
import {
  cheongdung,
  heunPpyam,
  jungdaebaengno,
  nalDorae,
  soebaengno,
  sudal,
} from './fixtures';

const MODEL_VERSION = 'test-model+prompt-v1';

function result(overrides: Partial<ClassifyResult> = {}): ClassifyResult {
  return {
    speciesId: null,
    confidence: 0,
    offTopic: false,
    modelVersion: MODEL_VERSION,
    ...overrides,
  };
}

/** 아이 선택과 일치하고 신뢰도가 충분한, "가장 좋은" 모델 결과 */
function confidentMatch(speciesId: string): ClassifyResult {
  return result({ speciesId, confidence: 0.95 });
}

describe('decideStatus — 모델 결과가 null일 때 (D안 폴백)', () => {
  it('판별 엔진이 없어도 던지지 않고 pending을 돌려준다', () => {
    expect(decideStatus(heunPpyam.id, null, heunPpyam)).toBe('pending');
  });

  it('사유는 no_model_result이고 신뢰도·일치 여부는 null이다', () => {
    const d = decideRouting(heunPpyam.id, null, heunPpyam);

    expect(d.status).toBe('pending');
    expect(d.reason).toBe('no_model_result');
    expect(d.agreement).toBeNull();
    expect(d.confidence).toBeNull();
    expect(d.modelVersion).toBeNull();
    expect(d.requiresExpertReview).toBe(false);
  });

  it('등급·트랙과 무관하게 모두 pending이다 — 아이 경험은 동일하다', () => {
    for (const species of [heunPpyam, cheongdung, soebaengno, nalDorae, sudal]) {
      expect(decideStatus(species.id, null, species)).toBe('pending');
    }
  });

  it('상위 등급이면 모델 결과가 없어도 전문가 검수 사유로 분류된다', () => {
    const d = decideRouting(nalDorae.id, null, nalDorae);
    expect(d.reason).toBe('expert_review_required');
    expect(d.requiresExpertReview).toBe(true);
  });
});

describe('decideStatus — tier 3 이상 · 보호종 (항상 전문가 검수)', () => {
  it('tier 3은 완벽한 일치·높은 신뢰도여도 auto_confirmed가 되지 않는다', () => {
    const d = decideRouting(nalDorae.id, confidentMatch(nalDorae.id), nalDorae);

    expect(d.status).toBe('pending');
    expect(d.reason).toBe('expert_review_required');
    expect(d.requiresExpertReview).toBe(true);
    // 일치 여부·신뢰도는 그대로 기록됩니다 (검수 화면과 지표에 씁니다)
    expect(d.agreement).toBe(true);
    expect(d.confidence).toBe(0.95);
  });

  it('보호종(report_only)은 tier와 무관하게 항상 pending이다', () => {
    const d = decideRouting(sudal.id, confidentMatch(sudal.id), sudal);
    expect(d.status).toBe('pending');
    expect(d.reason).toBe('expert_review_required');
  });

  it('needsExpertReview는 등급 상한과 윤리 플래그를 함께 본다', () => {
    expect(needsExpertReview(heunPpyam)).toBe(false); // ⭐
    expect(needsExpertReview(soebaengno)).toBe(false); // ⭐⭐ = 상한
    expect(needsExpertReview(nalDorae)).toBe(true); // ⭐⭐⭐
    expect(needsExpertReview(sudal)).toBe(true); // 🏅 보호종
  });

  it('임계 등급을 올리면 tier 3도 자동 확정될 수 있다 (튜닝 가능)', () => {
    const d = decideRouting(nalDorae.id, confidentMatch(nalDorae.id), nalDorae, {
      ...DEFAULT_ROUTING_THRESHOLDS,
      autoConfirmMaxTier: 3,
      // expert_only는 여전히 플래그 목록에 있으므로 함께 비워야 통과합니다
      expertReviewEthicsFlags: [],
    });
    expect(d.status).toBe('auto_confirmed');
  });
});

describe('decideStatus — offTopic (대분류 불일치)', () => {
  it('offTopic이면 즉시 반려한다', () => {
    const d = decideRouting(
      heunPpyam.id,
      result({ speciesId: null, confidence: 0.9, offTopic: true }),
      heunPpyam,
    );

    expect(d.status).toBe('rejected');
    expect(d.reason).toBe('off_topic');
    expect(d.agreement).toBe(false);
  });

  it('상위 등급 종이어도 offTopic이 우선한다 — 생물 사진이 아예 아니므로', () => {
    const d = decideRouting(
      sudal.id,
      result({ speciesId: null, confidence: 0.9, offTopic: true }),
      sudal,
    );
    expect(d.status).toBe('rejected');
  });

  it('rejectOnOffTopic을 끄면 반려하지 않고 일반 경로를 탄다', () => {
    const d = decideRouting(
      heunPpyam.id,
      result({ speciesId: null, confidence: 0.9, offTopic: true }),
      heunPpyam,
      { ...DEFAULT_ROUTING_THRESHOLDS, rejectOnOffTopic: false },
    );

    expect(d.status).toBe('pending');
    expect(d.reason).toBe('species_mismatch');
  });
});

describe('decideStatus — 불일치 / 낮은 신뢰도', () => {
  it('아이 선택과 모델 추론이 다르면 pending이다', () => {
    // 아이는 쇠백로를 골랐고 모델은 중대백로라고 본 상황 —
    // 검수 큐이자 "이 두 종의 식별 힌트가 부족하다"는 신호
    const d = decideRouting(
      soebaengno.id,
      confidentMatch(jungdaebaengno.id),
      soebaengno,
    );

    expect(d.status).toBe('pending');
    expect(d.reason).toBe('species_mismatch');
    expect(d.agreement).toBe(false);
  });

  it('모델이 후보 중 아무것도 못 고르면(speciesId=null) 불일치로 다룬다', () => {
    const d = decideRouting(
      heunPpyam.id,
      result({ speciesId: null, confidence: 0.3 }),
      heunPpyam,
    );

    expect(d.status).toBe('pending');
    expect(d.reason).toBe('species_mismatch');
  });

  it('일치하지만 신뢰도가 임계값 미만이면 pending이다', () => {
    const d = decideRouting(
      heunPpyam.id,
      result({ speciesId: heunPpyam.id, confidence: 0.84 }),
      heunPpyam,
    );

    expect(d.status).toBe('pending');
    expect(d.reason).toBe('low_confidence');
    expect(d.agreement).toBe(true);
  });

  it('신뢰도가 임계값과 정확히 같으면 자동 확정이다 (경계 포함)', () => {
    const d = decideRouting(
      heunPpyam.id,
      result({
        speciesId: heunPpyam.id,
        confidence: DEFAULT_ROUTING_THRESHOLDS.autoConfirmMinConfidence,
      }),
      heunPpyam,
    );
    expect(d.status).toBe('auto_confirmed');
  });

  it('임계값을 낮추면 같은 결과가 자동 확정으로 바뀐다 (튜닝 가능)', () => {
    const modelResult = result({ speciesId: heunPpyam.id, confidence: 0.7 });

    expect(decideStatus(heunPpyam.id, modelResult, heunPpyam)).toBe('pending');
    expect(
      decideStatus(heunPpyam.id, modelResult, heunPpyam, {
        ...DEFAULT_ROUTING_THRESHOLDS,
        autoConfirmMinConfidence: 0.6,
      }),
    ).toBe('auto_confirmed');
  });
});

describe('decideStatus — 자동 확정', () => {
  it('높은 신뢰도 + 일치 + tier 1이면 auto_confirmed', () => {
    const d = decideRouting(heunPpyam.id, confidentMatch(heunPpyam.id), heunPpyam);

    expect(d.status).toBe('auto_confirmed');
    expect(d.reason).toBe('agreement');
    expect(d.agreement).toBe(true);
    expect(d.confidence).toBe(0.95);
    expect(d.modelVersion).toBe(MODEL_VERSION);
    expect(d.requiresExpertReview).toBe(false);
  });

  it('tier 2도 자동 확정 대상이다 (상한 경계)', () => {
    expect(
      decideStatus(soebaengno.id, confidentMatch(soebaengno.id), soebaengno),
    ).toBe('auto_confirmed');
  });
});

describe('decideStatus — 방어 로직', () => {
  it('declared와 species.id가 어긋나면 조용히 pending으로 보낸다 (배치를 죽이지 않는다)', () => {
    const d = decideRouting(
      jungdaebaengno.id,
      confidentMatch(jungdaebaengno.id),
      soebaengno, // 다른 종의 메타데이터
    );

    expect(d.status).toBe('pending');
    expect(d.reason).toBe('inconsistent_input');
    expect(d.requiresExpertReview).toBe(true);
  });

  it('이상한 신뢰도 값은 0으로 떨어뜨린다 — 자동 확정으로 새지 않게', () => {
    for (const bad of [NaN, Infinity, -Infinity, -0.5]) {
      const d = decideRouting(
        heunPpyam.id,
        result({ speciesId: heunPpyam.id, confidence: bad }),
        heunPpyam,
      );
      expect(d.status).toBe('pending');
      expect(d.reason).toBe('low_confidence');
      expect(d.confidence).toBe(0);
    }
  });

  it('1을 넘는 신뢰도는 1로 클램프한다', () => {
    const d = decideRouting(
      heunPpyam.id,
      result({ speciesId: heunPpyam.id, confidence: 1.7 }),
      heunPpyam,
    );
    expect(d.confidence).toBe(1);
    expect(d.status).toBe('auto_confirmed');
  });
});
