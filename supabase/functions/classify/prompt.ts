/**
 * 판별 프롬프트 (서버 사본)
 *
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║ ★ 이 파일은 `src/lib/classifier/prompt.ts`의 **의도적 복제본**입니다. ║
 * ║   Deno(Edge Function)는 Vite 앱의 TypeScript를 import할 수 없습니다   ║
 * ║   (@/ 별칭·번들러 해석·타입 전용 import가 전부 다른 세계입니다).      ║
 * ║   그래서 복사했고, 대신 **양쪽이 같은 결정을 내려야 합니다.**         ║
 * ║                                                                       ║
 * ║   한쪽만 고치지 마세요:                                               ║
 * ║     src/lib/classifier/prompt.ts   ←→  supabase/functions/classify/prompt.ts
 * ║   문자열(CLASSIFY_SYSTEM_PROMPT), 후보 포맷, 출력 스키마, PROMPT_VERSION
 * ║   네 가지가 바이트 단위로 같아야 재평가(model_version)와 프롬프트 캐시가
 * ║   의미를 갖습니다.                                                    ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */

/** 후보 종 — 외부(Anthropic)로 나가는 최소 필드. 여기에 식별자를 추가하지 마세요(§7.5 ③). */
export interface CandidateSpecies {
  id: string;
  commonName: string;
  idHint: string;
  category: string;
}

/** 기본 판별 모델 (SETUP.md §4 결정 ②). src/lib/classifier/prompt.ts와 동일해야 합니다. */
export const DEFAULT_CLASSIFIER_MODEL = 'claude-opus-5';

/** 클라이언트가 model을 지정할 수 있으므로 화이트리스트로 막습니다 (adapters/claude.ts 계약 참조). */
export const ALLOWED_MODELS: readonly string[] = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
];

/** 프롬프트 버전 — modelVersion 문자열에 함께 넣어 재평가 시 구분합니다 */
export const PROMPT_VERSION = 'v1';

/**
 * 시스템 프롬프트.
 *
 * ★★★ 앵커링 금지 (PLAN.md §7.5 ④, 설계 요점 4) ★★★
 * **아이가 고른 종(declared_species_id)은 이 프롬프트 어디에도 들어가지 않습니다.**
 * 넣는 순간 모델이 거기에 끌려가(anchoring) "채점"이 아니라 "추인"이 됩니다.
 * 그러면 일치율은 100%에 수렴하고, 검증은 아무것도 검증하지 않게 됩니다.
 * 후보 목록은 오직 `spot_species × 촬영 월`에서만 만듭니다(candidates.ts).
 * 일치 여부 비교는 모델이 답한 **뒤에** 앱에서 합니다(routing.ts).
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
 * 구조화 출력 스키마 — `output_config.format`에 그대로 넣습니다.
 *
 * - 모든 object에 additionalProperties: false 필요
 * - 수치 제약(minimum/maximum)은 지원되지 않으므로 confidence는 앱에서 클램프(routing.ts)
 * - speciesId를 후보 id의 enum으로 좁혀 목록 밖 종을 스키마 차원에서 차단
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

/** observations.model_version에 그대로 저장되는 문자열 */
export function buildModelVersion(model: string = DEFAULT_CLASSIFIER_MODEL): string {
  return `${model}+prompt-${PROMPT_VERSION}`;
}
