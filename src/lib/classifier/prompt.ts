/**
 * 판별 프롬프트 설계 초안 (PLAN.md §7.5 ②, SETUP.md §1-C)
 *
 * ─────────────────────────────────────────────────────────────
 * 이 파일이 클라이언트에 있는 이유
 *
 * 프롬프트는 비밀이 아닙니다 — API 키가 비밀입니다.
 * 프롬프트를 여기 두면 **후보 압축(candidates.ts) → 프롬프트 → 결과 스키마**가
 * 한 저장소에서 함께 버전 관리되고, 아이에게 보여준 후보 목록과
 * 모델에게 준 후보 목록이 어긋나지 않는지 타입으로 확인됩니다.
 *
 * 실제 호출은 Supabase Edge Function에서만 일어납니다.
 * Edge Function은 이 모듈의 문자열·스키마를 **그대로 복제해 사용**합니다.
 * TODO(검토): Edge Function 구현 시 이 파일을 supabase/functions/classify/에서
 *             재사용할지(공유 모듈), 복사할지 결정. Deno/Vite 경계 문제라
 *             복사 + 계약 테스트가 더 단순할 수 있습니다.
 * ─────────────────────────────────────────────────────────────
 */

import type { CandidateSpecies } from './types';

/**
 * 기본 판별 모델 (SETUP.md §4 결정 ②).
 *
 * 후보가 3~10종으로 좁혀진 제약 분류이므로 더 저렴한 모델로도 충분할
 * 가능성이 큽니다. 어댑터 인터페이스를 둔 이유가 이것 —
 * 파일럿에서 실제 정확도를 재고 한 줄로 바꿉니다.
 * TODO(검토): 파일럿에서 claude-opus-5 vs 더 저렴한 모델의 일치율 비교.
 */
export const DEFAULT_CLASSIFIER_MODEL = 'claude-opus-5';

/** 프롬프트 버전 — modelVersion 문자열에 함께 넣어 재평가 시 구분합니다 */
export const PROMPT_VERSION = 'v1';

/**
 * 시스템 프롬프트.
 *
 * 설계 요점 네 가지:
 *
 * 1. **닫힌 선택지.** "무슨 종인가"가 아니라 "이 목록 중 무엇인가"를 묻습니다.
 *    구조화 출력의 enum으로도 강제하지만, 프롬프트에서도 명시합니다.
 *
 * 2. **식별 힌트를 그대로 준다.** 도감 카드에 쓴 힌트
 *    (`쇠백로 = 부리 검정 + 발가락 노랑`)가 곧 판별 기준입니다.
 *    아이가 본 근거와 모델이 본 근거가 같아야 불일치가 의미를 갖습니다.
 *
 * 3. **모를 때 모른다고 말하게 한다.** 억지로 하나 고르게 하면
 *    신뢰도 기반 라우팅이 통째로 무력해집니다. speciesId=null을 허용합니다.
 *
 * 4. **아이 선택을 알려주지 않는다.** declaredSpeciesId는 프롬프트에
 *    **넣지 않습니다.** 넣는 순간 모델이 거기에 끌려가고(anchoring),
 *    채점이 아니라 추인이 됩니다. 일치 여부는 앱에서 비교합니다(routing.ts).
 */
export const CLASSIFY_SYSTEM_PROMPT = [
  '너는 한국 하천 생물 판별을 돕는 조수다.',
  '초등학생이 부산의 하천에서 찍은 사진 한 장을 보고, 주어진 후보 목록 중에서 판별한다.',
  '',
  '규칙:',
  '- 반드시 후보 목록에 있는 종 중에서만 고른다. 목록 밖의 종은 절대 답하지 않는다.',
  '- 각 후보에는 아이용 식별 힌트가 함께 주어진다. 그 힌트를 판별 근거로 삼는다.',
  '- 확신이 없으면 speciesId를 null로 두고 confidence를 낮게 준다.',
  '  억지로 하나를 고르지 마라. "모르겠다"는 유용한 답이다.',
  '- 사진이 생물·식물·흔적·하천 시설 중 어느 것도 아니면(신발, 실내, 사람, 화면 캡처 등)',
  '  offTopic을 true로 하고 speciesId는 null로 둔다.',
  '- 사진에 사람이 크게 찍혔다면 종 판별을 시도하지 말고 offTopic=true로 답한다.',
  '- confidence는 0.0~1.0. 사진이 흐리거나 대상이 아주 작게 찍혔다면 낮춘다.',
  '  초등학생이 30m 밖에서 찍은 새는 흰 점 몇 픽셀일 수 있다.',
  '- reason은 한국어 한 문장으로, 어떤 특징을 보고 그렇게 판단했는지 쓴다.',
  '',
  '출력은 지정된 JSON 스키마를 따른다.',
].join('\n');

/**
 * 후보 목록을 프롬프트용 텍스트로 만듭니다.
 *
 * 순서는 candidates.ts가 결정론적으로 정렬해 넘겨준 그대로 유지합니다
 * (요청마다 바이트가 같아야 프롬프트 캐시가 걸립니다).
 */
export function formatCandidateList(candidates: readonly CandidateSpecies[]): string {
  return candidates
    .map((c) => `- ${c.id} | ${c.commonName} (${c.category}) — ${c.idHint}`)
    .join('\n');
}

/** 사용자 턴에 들어갈 텍스트 (이미지 블록과 함께 전송) */
export function buildClassifyUserText(candidates: readonly CandidateSpecies[]): string {
  return [
    '이 사진 속 대상을 아래 후보 중에서 판별해줘.',
    '',
    '후보 목록 (형식: id | 이름 (분류) — 식별 힌트):',
    formatCandidateList(candidates),
    '',
    'speciesId에는 위 목록의 id를 그대로 쓴다. 확신이 없으면 null.',
  ].join('\n');
}

/**
 * 구조화 출력 스키마.
 *
 * Edge Function은 이 스키마를 `output_config.format`에 그대로 넣습니다.
 *
 * 스키마 제약 메모:
 * - 모든 object에 `additionalProperties: false`가 필요합니다.
 * - 수치 제약(minimum/maximum)은 구조화 출력에서 지원되지 않으므로
 *   confidence 범위는 **앱에서 클램프**합니다 (routing.ts normalizeConfidence).
 * - speciesId를 후보 id의 enum으로 좁혀, 목록 밖 종이 나오는 것을 스키마 차원에서 막습니다.
 */
export function buildClassifyOutputSchema(
  candidates: readonly CandidateSpecies[],
): Record<string, unknown> {
  const ids = candidates.map((c) => c.id);
  return {
    type: 'object',
    properties: {
      speciesId: {
        description: '후보 목록의 id. 확신이 없으면 null',
        anyOf: [{ type: 'string', enum: ids }, { type: 'null' }],
      },
      confidence: {
        type: 'number',
        description: '0.0~1.0 신뢰도',
      },
      offTopic: {
        type: 'boolean',
        description: '생물·식물·흔적·시설 중 어느 것도 아니면 true',
      },
      reason: {
        type: 'string',
        description: '한국어 한 문장 판단 근거',
      },
    },
    required: ['speciesId', 'confidence', 'offTopic', 'reason'],
    additionalProperties: false,
  };
}

/**
 * modelVersion 문자열을 만듭니다.
 * 모델 id만으로는 프롬프트 개정을 구분할 수 없어 프롬프트 버전을 함께 넣습니다.
 * (PLAN.md §7.9 — model_version을 남겨두면 나중에 과거 관측을 재평가할 수 있습니다.)
 */
export function buildModelVersion(model: string = DEFAULT_CLASSIFIER_MODEL): string {
  return `${model}+prompt-${PROMPT_VERSION}`;
}
