/**
 * Claude 판별 어댑터 (골격) — Supabase Edge Function 경유
 *
 * ─────────────────────────────────────────────────────────────
 * ⛔ 이 파일에는 Anthropic API 호출 코드가 들어가지 않습니다.
 *
 * 이 파일은 **클라이언트 번들에 그대로 들어갑니다.**
 * 여기서 api.anthropic.com을 직접 부르려면 `ANTHROPIC_API_KEY`가 번들에
 * 평문으로 박혀야 하고, 그 순간 누구나 개발자도구에서 꺼내 씁니다.
 * `VITE_` 접두사 유무가 곧 보안 경계입니다 (SETUP.md §3).
 *
 * 그래서 구조는 이렇게 됩니다:
 *
 *   [브라우저]  이 어댑터
 *        │  POST /functions/v1/classify   (anon key + EXIF 제거된 이미지)
 *        ▼
 *   [Edge Function]  ANTHROPIC_API_KEY (서버 전용 secret)
 *        │  Message Batches API — 비동기 배치, 비용 50% 할인
 *        ▼
 *   [Claude]
 *
 * PLAN.md §7.5에서 "판별은 실시간일 필요가 없다"고 정한 결정이
 * 여기서 그대로 맞아떨어집니다 — 배치라서 키를 서버에 두는 비용이 0입니다.
 * ─────────────────────────────────────────────────────────────
 */

import type {
  BatchClassifier,
  BatchClassifyRequest,
  BatchClassifyResult,
  BatchClassifyResultItem,
  CandidateSpecies,
  ClassifyRequest,
  ClassifyResult,
} from '../types';
import { buildModelVersion } from '../prompt';

// ═════════════════════════════════════════════════════════════
// Edge Function 계약 (contract)
//
// 아래 타입이 `POST /functions/v1/classify`의 요청·응답 스키마입니다.
// **Edge Function 구현은 이 계약을 따릅니다.** 바꾸려면 양쪽을 함께 고치세요.
// ═════════════════════════════════════════════════════════════

/** Edge Function 엔드포인트 경로 (Supabase 프로젝트 URL에 이어 붙임) */
export const CLASSIFY_FUNCTION_PATH = '/functions/v1/classify';

/** 계약 버전 — 요청 본문에 실어 서버가 구버전 클라이언트를 식별합니다 */
export const CLASSIFY_CONTRACT_VERSION = 1;

export type SupportedImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

/** 요청에 담기는 후보 종 — CandidateSpecies와 동일 (계약을 명시적으로 못박음) */
export type EdgeCandidate = CandidateSpecies;

export interface EdgeClassifyItem {
  /** 결과 매칭 키. 랜덤 uuid — 아이와 연결되는 정보 없음 */
  observationId: string;
  /** base64 인코딩된 이미지 본문 (data: 접두사 없음) */
  imageBase64: string;
  mediaType: SupportedImageMediaType;
  /** 후보 압축 결과. 3~10종 기대. 빈 배열이면 서버가 400 */
  candidates: EdgeCandidate[];
}

export interface EdgeClassifyRequestBody {
  contractVersion: number;
  items: EdgeClassifyItem[];
  /**
   * 모델 오버라이드(선택). 파일럿에서 A/B를 돌릴 때만 씁니다.
   * 서버는 화이트리스트에 없는 값을 거부해야 합니다 — 클라이언트가 보내는 값입니다.
   */
  model?: string;
}

/** 모델 원시 출력 (prompt.ts의 구조화 출력 스키마와 1:1) */
export interface EdgeClassifyOutput {
  speciesId: string | null;
  confidence: number;
  offTopic: boolean;
  reason: string;
}

export interface EdgeClassifyResultItem {
  observationId: string;
  /** 이 건을 판별하지 못했으면 null (나머지 건은 정상 처리됩니다) */
  output: EdgeClassifyOutput | null;
  error?: {
    /** 'exif_present' | 'invalid_image' | 'model_error' | 'refusal' | 'timeout' 등 */
    code: string;
    message: string;
  };
}

export interface EdgeClassifyResponseBody {
  contractVersion: number;
  /** 예: 'claude-opus-5+prompt-v1' — observations.model_version에 그대로 저장 */
  modelVersion: string;
  items: EdgeClassifyResultItem[];
}

/**
 * Edge Function 구현 시 반드시 지켜야 할 것 (계약의 일부):
 *
 * 1. **EXIF 잔존 검사 후 거부.** 클라이언트에서 이미 제거하지만(§5.2),
 *    서버는 도착한 파일에 EXIF가 남아 있으면 `code: 'exif_present'`로 거부합니다.
 *    이중 방어입니다 — 한쪽이 뚫려도 좌표가 외부로 나가지 않게.
 * 2. **요청에 사용자 식별자를 담지 않습니다.** 이 계약에 userId 필드가 없는 것은
 *    실수가 아닙니다. Edge Function도 Anthropic으로 보낼 때 metadata에 넣지 마세요.
 * 3. **Message Batches API 사용** — 비동기 배치, 비용 50% 할인.
 *    배치 결과는 순서를 보장하지 않으므로 `custom_id`(=observationId)로 맞춥니다.
 * 4. **구조화 출력 강제** — prompt.ts의 `buildClassifyOutputSchema()` 사용.
 *    파싱 실패가 없어야 이 계약이 성립합니다.
 * 5. **부분 실패 허용** — 한 건이 실패해도 나머지는 정상 반환합니다.
 *    실패 건은 `output: null` → 앱에서 `pending`으로 라우팅됩니다.
 * 6. **거부(refusal) 처리** — 모델이 응답을 거부하면 `code: 'refusal'`로
 *    output=null을 돌려줍니다. 예외를 던져 배치 전체를 죽이지 마세요.
 *
 * TODO(검토): 배치가 즉시 끝나지 않는 경우의 API 형태.
 *   현재 계약은 "요청 → 결과"의 동기 응답입니다. 실제 Batches API는 최대 24시간이
 *   걸릴 수 있으므로, Edge Function이
 *     (a) 내부에서 폴링해 완료 후 응답 (짧은 배치 전용, 타임아웃 위험) 또는
 *     (b) 제출 → jobId 반환 → 별도 폴링 엔드포인트
 *   중 무엇을 할지 결정이 필요합니다. (b)라면 이 계약에 jobId가 추가됩니다.
 *   판별이 사후 채점이라 (b)가 설계 의도에는 더 맞습니다.
 */

// ═════════════════════════════════════════════════════════════
// 어댑터 구현
// ═════════════════════════════════════════════════════════════

export interface ClaudeClassifierOptions {
  /** Supabase 프로젝트 URL (VITE_SUPABASE_URL). 예: https://xxx.supabase.co */
  supabaseUrl: string;
  /** anon / publishable key. 클라이언트 노출 OK — RLS로 보호됩니다 */
  anonKey: string;
  /** 모델 오버라이드 (선택) */
  model?: string;
  /** 테스트 주입용 */
  fetchImpl?: typeof fetch;
}

export function createClaudeClassifier(
  options: ClaudeClassifierOptions,
): BatchClassifier {
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const endpoint = `${options.supabaseUrl.replace(/\/+$/, '')}${CLASSIFY_FUNCTION_PATH}`;
  // 실제 modelVersion은 서버 응답 값을 신뢰합니다. 이건 호출 실패 시의 표시용입니다.
  const declaredVersion = buildModelVersion(options.model);

  async function classifyBatch(
    req: BatchClassifyRequest,
  ): Promise<BatchClassifyResult> {
    if (req.items.length === 0) {
      return { items: [], modelVersion: declaredVersion };
    }

    const items: EdgeClassifyItem[] = await Promise.all(
      req.items.map(async (item) => ({
        observationId: item.observationId,
        imageBase64: await blobToBase64(item.image),
        mediaType: toMediaType(item.image.type),
        candidates: item.candidates,
      })),
    );

    const body: EdgeClassifyRequestBody = {
      contractVersion: CLASSIFY_CONTRACT_VERSION,
      items,
      ...(options.model ? { model: options.model } : {}),
    };

    const response = await doFetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // anon key는 Edge Function 접근 제어용입니다. 판별 키가 아닙니다.
        apikey: options.anonKey,
        authorization: `Bearer ${options.anonKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // 배치 전체 실패도 정상 경로입니다 — 전 건 result=null → 전부 pending.
      // 예외를 던져 호출자(배치 워커)를 죽이지 않습니다.
      const message = `classify 함수 호출 실패 (HTTP ${response.status})`;
      return {
        items: req.items.map<BatchClassifyResultItem>((item) => ({
          observationId: item.observationId,
          result: null,
          error: message,
        })),
        modelVersion: declaredVersion,
      };
    }

    const payload = (await response.json()) as EdgeClassifyResponseBody;
    const byId = new Map(payload.items.map((i) => [i.observationId, i]));

    return {
      // 요청 순서로 재정렬합니다. 배치 결과는 순서를 보장하지 않으므로
      // **인덱스가 아니라 observationId로 맞춥니다.**
      items: req.items.map<BatchClassifyResultItem>((item) => {
        const found = byId.get(item.observationId);
        if (!found || !found.output) {
          return {
            observationId: item.observationId,
            result: null,
            error: found?.error?.message ?? '응답에 해당 건이 없습니다',
          };
        }
        return {
          observationId: item.observationId,
          result: toClassifyResult(found.output, payload.modelVersion),
        };
      }),
      modelVersion: payload.modelVersion ?? declaredVersion,
    };
  }

  async function classify(req: ClassifyRequest): Promise<ClassifyResult> {
    const batch = await classifyBatch({
      items: [{ observationId: 'single', image: req.image, candidates: req.candidates }],
    });
    const first = batch.items[0];
    if (!first?.result) {
      throw new Error(first?.error ?? '판별 결과를 받지 못했습니다');
    }
    return first.result;
  }

  return { version: declaredVersion, classify, classifyBatch };
}

// ─────────────────────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────────────────────

function toClassifyResult(
  output: EdgeClassifyOutput,
  modelVersion: string,
): ClassifyResult {
  return {
    speciesId: output.speciesId,
    confidence: output.confidence,
    offTopic: output.offTopic,
    reason: output.reason,
    modelVersion,
  };
}

function toMediaType(blobType: string): SupportedImageMediaType {
  switch (blobType) {
    case 'image/png':
      return 'image/png';
    case 'image/webp':
      return 'image/webp';
    default:
      // 이미지 파이프라인(src/lib/image/)이 JPEG로 재인코딩하는 것이 기본입니다.
      return 'image/jpeg';
  }
}

/** Blob → base64. 대용량에서 스택이 터지지 않도록 청크로 나눠 변환합니다 */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < buffer.length; i += chunkSize) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
