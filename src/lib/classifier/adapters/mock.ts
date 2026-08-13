/**
 * 목 판별 어댑터 — 테스트·개발용
 *
 * **결정론적입니다. 랜덤을 쓰지 않습니다.**
 * 같은 입력이면 항상 같은 결과가 나와야
 *   - 라우팅 테스트가 재현되고
 *   - 개발 중 화면이 새로고침마다 다른 판정을 뱉지 않고
 *   - "이 케이스가 왜 pending이었지?"를 다시 만들어볼 수 있습니다.
 *
 * 결정 근거는 **후보 id 목록 + seed**입니다. 이미지 바이트는 보지 않습니다
 * (jsdom/Node에서 Blob 내용에 접근하는 순간 환경 의존이 생깁니다).
 */

import type {
  BatchClassifier,
  BatchClassifyRequest,
  BatchClassifyResult,
  ClassifyRequest,
  ClassifyResult,
} from '../types';

export const MOCK_MODEL_VERSION = 'mock+v1';

export interface MockClassifierOptions {
  /** 결정 해시에 섞는 값. 같은 후보 목록으로 다른 시나리오를 만들 때 씁니다 */
  seed?: string;
  /**
   * 응답을 통째로 가로챕니다. 특정 분기(offTopic, 낮은 신뢰도, 불일치)를
   * 테스트에서 정확히 재현할 때 사용하세요.
   */
  respondWith?: (req: ClassifyRequest) => ClassifyResult;
  /** modelVersion 문자열 덮어쓰기 (모델 교체 시나리오 테스트용) */
  modelVersion?: string;
}

/**
 * 목 판별기를 만듭니다.
 *
 * 기본 동작:
 *   - 후보 id 목록의 해시로 후보 하나를 고릅니다 (항상 같은 후보).
 *   - 신뢰도는 해시에서 0.55~0.99 사이 값을 유도합니다.
 *     자동 확정 임계값(0.85) 위아래가 모두 나오도록 일부러 넓게 잡았습니다.
 *   - 후보가 0개면 speciesId=null, confidence=0 (라우팅에서 pending).
 *   - offTopic은 기본적으로 false. 필요하면 `respondWith`로 만드세요.
 */
export function createMockClassifier(
  options: MockClassifierOptions = {},
): BatchClassifier {
  const seed = options.seed ?? '';
  const version = options.modelVersion ?? MOCK_MODEL_VERSION;

  async function classify(req: ClassifyRequest): Promise<ClassifyResult> {
    if (options.respondWith) return options.respondWith(req);

    const ids = req.candidates.map((c) => c.id);
    if (ids.length === 0) {
      return {
        speciesId: null,
        confidence: 0,
        offTopic: false,
        reason: '후보가 없어 판별할 수 없습니다 (목 어댑터).',
        modelVersion: version,
      };
    }

    const h = fnv1a(`${seed}::${ids.join('|')}`);
    const picked = req.candidates[h % ids.length];
    // 0.55 ~ 0.99 사이. 100 구간으로 나눠 임계값 경계가 잘 나오게 합니다.
    const confidence = 0.55 + ((h >>> 8) % 45) / 100;

    return {
      speciesId: picked.id,
      confidence: Math.round(confidence * 100) / 100,
      offTopic: false,
      reason: `목 어댑터: 후보 ${ids.length}종 중 '${picked.commonName}'을(를) 결정론적으로 선택했습니다.`,
      modelVersion: version,
    };
  }

  async function classifyBatch(
    req: BatchClassifyRequest,
  ): Promise<BatchClassifyResult> {
    const items = await Promise.all(
      req.items.map(async (item) => ({
        observationId: item.observationId,
        result: await classify({ image: item.image, candidates: item.candidates }),
      })),
    );
    return { items, modelVersion: version };
  }

  return { version, classify, classifyBatch };
}

/**
 * FNV-1a 32bit. 암호학적 용도가 아니라 **재현 가능한 분산**이 목적입니다.
 * Math.random()을 쓰지 않는 이유가 이것 — 테스트가 흔들리면 안 됩니다.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
