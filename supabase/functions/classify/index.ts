/**
 * POST /functions/v1/classify — 관찰 사진 종 판별 (PLAN.md §7.5)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★ 이 함수가 존재하는 이유는 단 하나: ANTHROPIC_API_KEY를 브라우저에서 떼어놓는 것.
 *
 *   ANTHROPIC_API_KEY는 `VITE_` 접두사가 **없습니다**. 그건 실수가 아니라 보안 경계입니다
 *   (SETUP.md §3). VITE_를 붙이는 순간 번들 JS에 평문으로 박혀 배포되고,
 *   누구나 개발자도구에서 꺼내 우리 계정으로 API를 씁니다.
 *   → 키는 `supabase secrets set ANTHROPIC_API_KEY=...` 로만 올라갑니다.
 *
 * ★ 앵커링 금지 (§7.5). 아이가 고른 종(declared_species_id)은 프롬프트에 넣지 않습니다.
 *   넣으면 모델이 동의해버려 채점이 추인이 됩니다. 후보는 `spot_species × 촬영 월`에서만
 *   서버가 다시 만듭니다(candidates.ts) — 클라이언트가 보낸 후보 목록은 쓰지 않습니다.
 *
 * ★ 로깅 규율
 *   ✗ 이미지 바이트/base64를 어떤 형태로도 로깅하지 않습니다.
 *   ✗ 요청 본문을 통째로 찍지 않습니다(안에 이미지가 있습니다).
 *   ✓ 로그에는 observationId(랜덤 uuid)와 실패 코드만 남깁니다.
 *
 * ★ observations에 쓰는 컬럼은 정확히 다섯 개뿐입니다:
 *   model_species_id · model_confidence · model_off_topic · model_version · status
 *   그 밖의 컬럼(declared_species_id, final_species_id, reviewed_by …)은 건드리지 않습니다.
 *   판정은 서버가 하지만 **정답을 정하는 것은 사람**이라는 §7.5의 경계입니다.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 계약: `src/lib/classifier/adapters/claude.ts`의 EdgeClassifyRequestBody / EdgeClassifyResponseBody
 *       (응답에 status/routingReason을 **추가**했습니다 — 기존 필드는 그대로라 하위 호환입니다.)
 *
 * 인증: Authorization: Bearer <사용자 JWT>  또는  <service_role 키>(운영 배치 워커)
 *       ⚠ 브라우저 어댑터는 현재 anon 키를 보냅니다. 그대로는 401입니다 — 보고서 참조.
 */

import Anthropic from 'npm:@anthropic-ai/sdk';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { errorJson, handlePreflight, isUuid, json } from '../_shared/http.ts';
import { identifyCaller, serviceClient } from '../_shared/supabase.ts';
import {
  narrowCandidatesWithFallback,
  seoulMonth,
  toClassifyCandidates,
  type SpeciesRow,
} from './candidates.ts';
import { decideRouting, type ClassifyResult, type RoutingSpecies } from './routing.ts';
import {
  ALLOWED_MODELS,
  buildClassifyOutputSchema,
  buildClassifyUserText,
  buildModelVersion,
  CLASSIFY_SYSTEM_PROMPT,
  DEFAULT_CLASSIFIER_MODEL,
} from './prompt.ts';
import { decodeBase64, scanForMetadata } from './exif.ts';

// ─────────────────────────────────────────────────────────────
// 한도 — Edge Function의 벽시계·메모리 예산 안에 들어가도록
// ─────────────────────────────────────────────────────────────

const CONTRACT_VERSION = 1;
/** 한 요청에 담을 수 있는 사진 수. 넘으면 여러 번 나눠 부르세요(동기 경로의 한계). */
const MAX_ITEMS = 8;
/** 디코드 후 이미지 최대 크기. 클라이언트가 1600px/80%로 압축해 보냅니다(§4.1). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** 동시 호출 수. 레이트리밋과 벽시계 사이의 타협값입니다. */
const CONCURRENCY = 3;
const MODEL_MAX_TOKENS = 8192;

const SUPPORTED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// ─────────────────────────────────────────────────────────────
// 계약 타입 (adapters/claude.ts와 1:1)
// ─────────────────────────────────────────────────────────────

interface EdgeClassifyItem {
  observationId: string;
  imageBase64: string;
  mediaType: string;
  /** 클라이언트가 보내는 후보. **참고용이며 판별에는 쓰지 않습니다**(앵커링 우회 방지). */
  candidates?: unknown;
}

interface EdgeClassifyOutput {
  speciesId: string | null;
  confidence: number;
  offTopic: boolean;
  reason: string;
}

interface EdgeResultItem {
  observationId: string;
  output: EdgeClassifyOutput | null;
  error?: { code: string; message: string };
  /** 계약 확장: 이 관찰이 어느 경로로 갔는지 */
  status?: string;
  routingReason?: string;
}

/** Anthropic 응답에서 우리가 읽는 부분만. SDK 타입 변화에 흔들리지 않도록 최소 정의. */
interface AnthropicMessageLike {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
}

// ─────────────────────────────────────────────────────────────
// 관찰 1건의 처리 컨텍스트
// ─────────────────────────────────────────────────────────────

interface ObservationRow {
  id: string;
  user_id: string;
  spot_id: string;
  declared_species_id: string;
  observed_at: string;
  status: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorJson('method_not_allowed', 'POST만 허용됩니다.', 405);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    // 키 미설정은 "판별 엔진 미확보" = PLAN.md의 D안입니다. 크래시가 아니라 명시적 신호로 알립니다.
    console.error('[classify] ANTHROPIC_API_KEY 미설정 — D안(판별 없음)으로 동작해야 합니다');
    return errorJson(
      'classifier_unavailable',
      '판별 엔진이 설정되지 않았습니다. 관찰은 검수 대기로 남습니다.',
      503,
    );
  }

  let admin;
  try {
    admin = serviceClient();
  } catch {
    console.error('[classify] 환경변수 설정 오류');
    return errorJson('server_misconfigured', '서버 설정 오류입니다.', 500);
  }

  const caller = await identifyCaller(req, admin);
  if (caller.kind === 'anonymous') {
    return errorJson('unauthorized', '로그인이 필요합니다.', 401);
  }

  // ── 본문 파싱 ────────────────────────────────────────────────────────
  // ⚠ 아래 body에는 이미지가 들어 있습니다. 절대 로깅하지 마세요.
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorJson('invalid_json', '요청 형식이 올바르지 않습니다.', 400);
  }

  const rawItems = body.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return errorJson('items_required', 'items가 비어 있습니다.', 400);
  }
  if (rawItems.length > MAX_ITEMS) {
    return errorJson('too_many_items', `한 번에 최대 ${MAX_ITEMS}건까지 처리합니다.`, 400);
  }

  // 모델은 클라이언트가 보낼 수 있으므로 화이트리스트로 막습니다.
  const requestedModel = typeof body.model === 'string' ? body.model : DEFAULT_CLASSIFIER_MODEL;
  if (!ALLOWED_MODELS.includes(requestedModel)) {
    return errorJson('model_not_allowed', '허용되지 않은 모델입니다.', 400);
  }
  const modelVersion = buildModelVersion(requestedModel);

  const items = rawItems as EdgeClassifyItem[];
  const observationIds = items
    .map((i) => i?.observationId)
    .filter((id): id is string => isUuid(id));
  if (observationIds.length !== items.length) {
    return errorJson('observation_id_invalid', 'observationId 형식이 올바르지 않습니다.', 400);
  }

  // ── 관찰 · 사용자 · 후보 종 로드 ──────────────────────────────────────
  const { data: obsRows, error: obsError } = await admin
    .from('observations')
    .select('id, user_id, spot_id, declared_species_id, observed_at, status')
    .in('id', observationIds);

  if (obsError) {
    console.error('[classify] observations 조회 실패', { code: obsError.code ?? 'unknown' });
    return errorJson('lookup_failed', '관찰 기록을 읽지 못했습니다.', 500);
  }

  const observations = new Map<string, ObservationRow>(
    (obsRows ?? []).map((r): [string, ObservationRow] => [r.id as string, r as ObservationRow]),
  );

  const userIds = [...new Set([...observations.values()].map((o) => o.user_id))];
  const spotIds = [...new Set([...observations.values()].map((o) => o.spot_id))];
  const declaredIds = [...new Set([...observations.values()].map((o) => o.declared_species_id))];

  const [usersRes, spotSpeciesRes, declaredRes] = await Promise.all([
    admin.from('users').select('id, expert_program').in('id', userIds),
    // spot_species → species 임베드. 후보 압축의 원천입니다(§7.5 ①).
    admin
      .from('spot_species')
      .select(
        'spot_id, species:species_id (id, code, common_name, category, tier, track, months, id_hint, ethics_flag, is_active)',
      )
      .in('spot_id', spotIds),
    admin.from('species').select('id, tier, ethics_flag').in('id', declaredIds),
  ]);

  if (usersRes.error || spotSpeciesRes.error || declaredRes.error) {
    console.error('[classify] 메타데이터 조회 실패', {
      users: usersRes.error?.code ?? null,
      spotSpecies: spotSpeciesRes.error?.code ?? null,
      species: declaredRes.error?.code ?? null,
    });
    return errorJson('lookup_failed', '메타데이터를 읽지 못했습니다.', 500);
  }

  const expertProgram = new Map<string, boolean>(
    (usersRes.data ?? []).map((u): [string, boolean] => [u.id as string, Boolean(u.expert_program)]),
  );

  const speciesBySpot = new Map<string, SpeciesRow[]>();
  for (const row of spotSpeciesRes.data ?? []) {
    const spotId = (row as { spot_id: string }).spot_id;
    // 임베드 결과는 PostgREST 버전에 따라 객체 또는 1원소 배열로 옵니다. 둘 다 받습니다.
    const embedded = (row as { species: SpeciesRow | SpeciesRow[] | null }).species;
    const species = Array.isArray(embedded) ? embedded[0] : embedded;
    if (!species) continue;
    const list = speciesBySpot.get(spotId) ?? [];
    list.push(species);
    speciesBySpot.set(spotId, list);
  }

  const declaredSpecies = new Map<string, RoutingSpecies>(
    (declaredRes.data ?? []).map((s): [string, RoutingSpecies] => [
      s.id as string,
      s as RoutingSpecies,
    ]),
  );

  const anthropic = new Anthropic({ apiKey, maxRetries: 2 });

  // ── 건별 처리 (부분 실패 허용: 한 건이 죽어도 나머지는 정상 반환) ────────
  const results: EdgeResultItem[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const chunk = items.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      chunk.map((item) => {
        const observation = observations.get(item.observationId);
        return classifyOne({
          admin,
          anthropic,
          caller,
          item,
          model: requestedModel,
          modelVersion,
          observation,
          expertAccompanied: expertProgram.get(observation?.user_id ?? '') ?? false,
          spotSpecies: speciesBySpot.get(observation?.spot_id ?? '') ?? [],
          declared: declaredSpecies.get(observation?.declared_species_id ?? ''),
        }).catch((err): EdgeResultItem => {
          // 예상 못 한 예외도 배치를 죽이지 않습니다.
          console.error('[classify] 처리 중 예외', {
            observationId: item.observationId,
            message: shortMessage(err),
          });
          return {
            observationId: item.observationId,
            output: null,
            error: { code: 'internal_error', message: '판별에 실패했습니다.' },
          };
        });
      }),
    );
    results.push(...settled);
  }

  return json({ contractVersion: CONTRACT_VERSION, modelVersion, items: results });
});

// ─────────────────────────────────────────────────────────────
// 관찰 1건
// ─────────────────────────────────────────────────────────────

interface ClassifyOneArgs {
  admin: SupabaseClient;
  anthropic: Anthropic;
  caller: { kind: 'user'; userId: string } | { kind: 'service' };
  item: EdgeClassifyItem;
  model: string;
  modelVersion: string;
  observation: ObservationRow | undefined;
  expertAccompanied: boolean;
  spotSpecies: SpeciesRow[];
  declared: RoutingSpecies | undefined;
}

async function classifyOne(args: ClassifyOneArgs): Promise<EdgeResultItem> {
  const { admin, anthropic, caller, item, observation, declared } = args;
  const observationId = item.observationId;

  if (!observation) {
    return fail(observationId, 'observation_not_found', '관찰 기록을 찾을 수 없습니다.');
  }

  // 남의 관찰을 채점시킬 수 없습니다. 운영 배치(service_role)만 계정을 넘나듭니다.
  if (caller.kind === 'user' && observation.user_id !== caller.userId) {
    return fail(observationId, 'forbidden', '이 관찰에 접근할 수 없습니다.');
  }

  // ★ 사람이 이미 판정한 건은 모델이 덮어쓰지 않습니다.
  //   confirmed/corrected/rejected는 검수자의 결론이고, 모델은 그 위가 아니라 그 앞 단계입니다.
  if (observation.status !== 'pending') {
    return fail(observationId, 'not_pending', '이미 판정된 관찰입니다.');
  }

  if (!declared) {
    return fail(observationId, 'species_not_found', '선택한 종 정보를 찾을 수 없습니다.');
  }

  // ── 이미지 검증 ──────────────────────────────────────────────────────
  if (typeof item.imageBase64 !== 'string' || item.imageBase64.length === 0) {
    return fail(observationId, 'invalid_image', '이미지가 없습니다.');
  }
  if (!SUPPORTED_MEDIA_TYPES.has(item.mediaType)) {
    return fail(observationId, 'invalid_image', '지원하지 않는 이미지 형식입니다.');
  }

  const bytes = decodeBase64(item.imageBase64);
  if (!bytes) return fail(observationId, 'invalid_image', '이미지를 디코딩하지 못했습니다.');
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return fail(observationId, 'invalid_image', '이미지가 너무 큽니다.');
  }

  // ★ EXIF 잔존 검사 — 이중 방어. 걸리면 **외부로 보내지 않고 거부**합니다(§5.2-3).
  const scan = scanForMetadata(bytes, item.mediaType);
  if (scan.present) {
    console.warn('[classify] 메타데이터 잔존으로 거부', {
      observationId,
      marker: scan.marker ?? 'unknown',
    });
    return fail(
      observationId,
      'exif_present',
      '사진에 위치 정보가 남아 있어 판별하지 않았습니다.',
    );
  }

  // ── 후보 압축 (§7.5 ①) — 서버가 다시 만듭니다 ───────────────────────
  const month = seoulMonth(observation.observed_at);
  const { candidates: narrowed } = narrowCandidatesWithFallback(args.spotSpecies, month, {
    expertAccompanied: args.expertAccompanied,
  });

  if (narrowed.length === 0) {
    // 후보가 없으면 닫힌 선택지 자체가 성립하지 않습니다. 모델을 부르지 않고 pending 유지.
    return { observationId, output: null, error: { code: 'no_candidates', message: '이 스팟의 후보 종이 없습니다.' }, status: 'pending', routingReason: 'no_model_result' };
  }

  const candidates = toClassifyCandidates(narrowed);

  // ── 모델 호출 ────────────────────────────────────────────────────────
  // ★ 여기 어디에도 declared_species_id가 없습니다. 그게 §7.5의 핵심입니다.
  //   프롬프트에 들어가는 것은 (이미지 바이트 + 후보 목록)뿐이며,
  //   user_id·닉네임·스팟 이름·좌표는 일절 실리지 않습니다(§7.5 제약 ③).
  let modelResult: ClassifyResult | null = null;
  let modelError: { code: string; message: string } | null = null;

  try {
    const params = {
      model: args.model,
      max_tokens: MODEL_MAX_TOKENS,
      system: CLASSIFY_SYSTEM_PROMPT,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: buildClassifyOutputSchema(candidates) },
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: item.mediaType, data: item.imageBase64 },
            },
            { type: 'text', text: buildClassifyUserText(candidates) },
          ],
        },
      ],
    };

    // SDK 타입이 output_config를 아직 좁게 잡는 버전이 있어 캐스팅합니다.
    // 응답도 우리가 읽는 최소 형태로만 봅니다.
    // deno-lint-ignore no-explicit-any
    const message = (await anthropic.messages.create(params as any)) as unknown as AnthropicMessageLike;

    if (message.stop_reason === 'refusal') {
      // 모델이 거부해도 배치 전체를 죽이지 않습니다(계약 6).
      modelError = { code: 'refusal', message: '모델이 응답을 거부했습니다.' };
    } else if (message.stop_reason === 'max_tokens') {
      modelError = { code: 'truncated', message: '모델 응답이 잘렸습니다.' };
    } else {
      const text = message.content.find((b) => b.type === 'text')?.text ?? '';
      const parsed = parseOutput(text, candidates.map((c) => c.id));
      if (!parsed) {
        modelError = { code: 'model_error', message: '모델 출력을 해석하지 못했습니다.' };
      } else {
        modelResult = { ...parsed, modelVersion: args.modelVersion };
      }
    }
  } catch (err) {
    // ⚠ 예외 메시지에 요청 본문이 실릴 수 있으므로 앞부분만 자릅니다(이미지 base64 유출 방지).
    console.error('[classify] 모델 호출 실패', {
      observationId,
      message: shortMessage(err),
    });
    modelError = { code: 'model_error', message: '판별 엔진 호출에 실패했습니다.' };
  }

  // ── 라우팅 (§7.5 ④) ─────────────────────────────────────────────────
  // declared와 모델 결과의 비교는 **여기서** 처음 일어납니다 — 모델이 답한 뒤에.
  const decision = decideRouting(observation.declared_species_id, modelResult, declared);

  // ── 기록 ─────────────────────────────────────────────────────────────
  //
  // ⚠⚠ grant_dex_entry를 여기서 직접 부르지 않습니다 — **의도적입니다.**
  //   0005_functions.sql의 트리거 `observations_grant_rewards`가
  //   `after update of status ...`로 걸려 있어, status를 auto_confirmed로 바꾸는
  //   이 UPDATE 하나로 grant_dex_entry + award_points가 이미 실행됩니다.
  //   여기서 또 부르면 dex_entries.count가 관찰 1건당 2씩 증가하고,
  //   "새 카드 획득!" 연출의 근거인 반환값(xmax=0)도 첫 호출이 소진해 버립니다.
  //   → 지급 경로는 트리거 하나로 유지합니다. 자세한 내용은 인수인계 보고서 참조.
  const update = {
    model_species_id: modelResult?.speciesId ?? null,
    model_confidence: decision.confidence,
    model_off_topic: modelResult ? modelResult.offTopic : null,
    // observations_model_version_required: model_species_id가 있으면 반드시 필요
    model_version: modelResult ? args.modelVersion : null,
    status: decision.status,
  };

  const { error: updateError } = await admin
    .from('observations')
    .update(update)
    .eq('id', observationId)
    // 낙관적 잠금: 그 사이 검수자가 손댔다면 아무것도 덮어쓰지 않습니다.
    .eq('status', 'pending');

  if (updateError) {
    console.error('[classify] observations 갱신 실패', {
      observationId,
      code: updateError.code ?? 'unknown',
    });
    return fail(observationId, 'persist_failed', '판별 결과를 저장하지 못했습니다.');
  }

  return {
    observationId,
    output: modelResult
      ? {
          speciesId: modelResult.speciesId,
          confidence: modelResult.confidence,
          offTopic: modelResult.offTopic,
          reason: modelResult.reason ?? '',
        }
      : null,
    ...(modelError ? { error: modelError } : {}),
    status: decision.status,
    routingReason: decision.reason,
  };
}

// ─────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────

function fail(observationId: string, code: string, message: string): EdgeResultItem {
  return { observationId, output: null, error: { code, message } };
}

/**
 * 구조화 출력 파싱 + 방어.
 *
 * 스키마의 enum이 목록 밖 종을 막지만, 스키마가 바뀌거나 모델이 우회하는 경우를 대비해
 * **후보 id 집합으로 한 번 더 검증**합니다. 목록 밖 id는 null(=모르겠다)로 떨어뜨립니다 —
 * 존재하지 않는 종 id를 model_species_id에 쓰면 FK 위반으로 관찰 저장 자체가 실패합니다.
 */
function parseOutput(
  text: string,
  allowedIds: string[],
): { speciesId: string | null; confidence: number; offTopic: boolean; reason: string } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;

  const allowed = new Set(allowedIds);
  const speciesId =
    typeof o.speciesId === 'string' && allowed.has(o.speciesId) ? o.speciesId : null;

  return {
    speciesId,
    confidence: typeof o.confidence === 'number' ? o.confidence : 0,
    offTopic: o.offTopic === true,
    reason: typeof o.reason === 'string' ? o.reason.slice(0, 500) : '',
  };
}

/** 예외 메시지를 짧게. 이미지 base64가 통째로 로그에 실리는 것을 막습니다. */
function shortMessage(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  return m.length > 200 ? `${m.slice(0, 200)}…` : m;
}
