/**
 * 판별 모듈 공개 API (PLAN.md §7.5)
 *
 * 사용하는 쪽은 이 파일만 import 하세요.
 *
 *   import { getClassifier, narrowCandidatesWithFallback, decideStatus } from '@/lib/classifier';
 *
 * ─────────────────────────────────────────────────────────────
 * 전형적인 흐름
 *
 *   // 1) 후보 압축 — 아이에게 보여줄 목록이자 모델에게 줄 후보
 *   const { candidates } = narrowCandidatesWithFallback(allSpecies, spotSpeciesIds, month);
 *
 *   // 2) 아이가 고른다  ★ 여기서 카드가 즉시 발급됩니다 (모델을 기다리지 않음)
 *
 *   // 3) 나중에, 배치로 채점
 *   const classifier = getClassifier();          // null이면 D안 (엔진 미확보)
 *   const batch = await classifier?.classifyBatch({ items });
 *
 *   // 4) 라우팅
 *   const status = decideStatus(declaredSpeciesId, modelResult, species);
 *
 * 3번이 통째로 없어도 1·2·4는 그대로 돕니다 — 그게 D안 폴백입니다.
 * ─────────────────────────────────────────────────────────────
 */

export * from './types';
export * from './candidates';
export * from './routing';
export * from './prompt';

export { createMockClassifier, MOCK_MODEL_VERSION } from './adapters/mock';
export type { MockClassifierOptions } from './adapters/mock';

export { createClaudeClassifier, CLASSIFY_FUNCTION_PATH, CLASSIFY_CONTRACT_VERSION } from './adapters/claude';
export type {
  ClaudeClassifierOptions,
  EdgeCandidate,
  EdgeClassifyItem,
  EdgeClassifyOutput,
  EdgeClassifyRequestBody,
  EdgeClassifyResponseBody,
  EdgeClassifyResultItem,
  SupportedImageMediaType,
} from './adapters/claude';

import type { BatchClassifier } from './types';
import { createMockClassifier } from './adapters/mock';
import { createClaudeClassifier } from './adapters/claude';

// ─────────────────────────────────────────────────────────────
// 어댑터 선택 — 모델 교체가 환경변수 1줄
// ─────────────────────────────────────────────────────────────

/**
 * 판별 엔진 종류.
 *
 *   none   판별 없음 = **D안**. 아이 선택만으로 동작하고 전 건 pending.
 *          엔진 확보가 늦어지면 이 상태로 출시해도 앱은 완전히 동작합니다.
 *   mock   결정론적 목. 개발·테스트용.
 *   claude Supabase Edge Function 경유 Claude API (SETUP.md §1-C).
 */
export type ClassifierEngine = 'none' | 'mock' | 'claude';

export interface ClassifierEnv {
  VITE_CLASSIFIER_ENGINE?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_CLASSIFIER_MODEL?: string;
}

/**
 * `import.meta.env`를 타입 선언(`vite/client`)에 의존하지 않고 읽습니다.
 * Vite는 빌드 시 `import.meta.env` 객체 전체를 주입하므로 런타임 접근이 안전하고,
 * vitest(Node)에서도 같은 코드가 그대로 돕니다.
 */
function readEnv(): ClassifierEnv {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  return (meta.env ?? {}) as ClassifierEnv;
}

/**
 * 환경변수를 엔진 종류로 해석합니다.
 *
 * 'claude'로 지정했는데 Supabase URL/키가 없으면 **'none'으로 떨어집니다.**
 * 크래시 대신 D안으로 내려가는 게 맞습니다 — 판별은 축소 가능한 항목이고,
 * 아이 경험은 어느 쪽이든 동일합니다 (PLAN.md Phase 1 노트).
 */
export function resolveEngine(env: ClassifierEnv = readEnv()): ClassifierEngine {
  const raw = (env.VITE_CLASSIFIER_ENGINE ?? 'none').trim().toLowerCase();

  if (raw === 'mock') return 'mock';
  if (raw === 'claude') {
    return env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY ? 'claude' : 'none';
  }
  return 'none';
}

/**
 * 판별기를 만듭니다. `null`이면 D안(판별 없음)입니다.
 *
 * ★ 모델을 바꾸는 것은 이 함수의 한 줄, 혹은 `.env.local`의 한 줄입니다.
 */
export function createClassifier(env: ClassifierEnv = readEnv()): BatchClassifier | null {
  switch (resolveEngine(env)) {
    case 'mock':
      return createMockClassifier();
    case 'claude':
      return createClaudeClassifier({
        supabaseUrl: env.VITE_SUPABASE_URL as string,
        anonKey: env.VITE_SUPABASE_ANON_KEY as string,
        ...(env.VITE_CLASSIFIER_MODEL ? { model: env.VITE_CLASSIFIER_MODEL } : {}),
      });
    case 'none':
    default:
      return null;
  }
}

let cached: BatchClassifier | null | undefined;

/**
 * 앱 전역에서 쓰는 판별기 (지연 생성 + 캐시).
 *
 * `null`을 정상 반환값으로 다루세요. 호출부는 `classifier?.classifyBatch(...)`로
 * 쓰고, 결과가 없으면 routing.ts가 알아서 전부 pending으로 보냅니다.
 */
export function getClassifier(): BatchClassifier | null {
  if (cached === undefined) cached = createClassifier();
  return cached;
}

/** 테스트에서 환경을 바꿔가며 확인할 때 캐시를 비웁니다 */
export function resetClassifierCache(): void {
  cached = undefined;
}
