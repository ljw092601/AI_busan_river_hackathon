/**
 * 사진으로 도감 카드 얻기 — 서버 계약(`claim_species_photo`) 래퍼.
 *
 * ── 왜 클라이언트가 dex_entries 를 안 쓰는가 ────────────────────
 * dex_entries·points_ledger 는 클라이언트 쓰기가 봉인돼 있습니다(정책도 GRANT도 없음).
 * 카드와 포인트는 서버가 줍니다. 여기서는 "이 사진으로 이 종을 등록해 주세요"라고
 * **주장**만 하고, 결과를 그대로 받아 화면 문구로 옮깁니다 (PLAN.md §4.2, docs/SECURITY.md).
 *
 * ── ⚠️ 지금은 서버가 사진의 내용을 확인하지 않습니다 ─────────────
 * 아이가 고른 종을 그대로 인정합니다(0019_claim_species_photo.sql).
 * 그래서 화면에 **"AI가 확인했어요" / "판별 완료" / "정확히 맞혔어요"** 라고 쓰면
 * 거짓말이 됩니다. 우리가 말할 수 있는 건 "사진을 등록했어요"까지입니다.
 * 그 사실을 아이에게 알리는 한 줄이 PHOTO_UNVERIFIED_NOTE 입니다 — 지우지 마세요.
 *
 * ── 던지지 않습니다 ─────────────────────────────────────────────
 * 네트워크 실패까지 `{ ok: false, reason: 'request_failed' }` 로 돌려줍니다.
 * 호출부(useSpeciesPhotoClaim)가 촬영 실패(PhotoError)와 등록 실패를 다른 문구로
 * 안내해야 하는데, 둘 다 예외로 올라오면 catch 한 곳에서 구분이 안 됩니다.
 */

import { supabase } from '@/lib/supabase';

/**
 * 등록 실패 사유.
 *   expert_only        전문가 동반 프로그램 전용 종 (PLAN.md §7.6-4)
 *   photo_not_found    사진 id 가 없거나 내 사진이 아님
 *   species_not_found  없거나 내려간 종
 *   no_spot            등록할 스팟을 찾지 못함 (시드 문제)
 *   request_failed     서버에 닿지 못함 — 여기서만 만드는 사유입니다
 *   unknown            서버가 처음 보는 reason 을 보냄
 */
export type ClaimFailureReason =
  | 'expert_only'
  | 'photo_not_found'
  | 'species_not_found'
  | 'no_spot'
  | 'request_failed'
  | 'unknown';

/** 새 카드를 얻었습니다. 포인트는 서버가 정합니다. */
export interface ClaimAcquired {
  ok: true;
  isNew: true;
  speciesId: string;
  /** 서버가 알려준 등급. 표시에는 species.tier 를 쓰세요 — 이건 기록용입니다. */
  tier: number | null;
  /** 서버가 지급한 포인트. 클라이언트가 계산하지 않습니다. */
  points: number | null;
  observationId: string | null;
}

/** 이미 가진 종. 관찰도 만들지 않고 **포인트도 나가지 않습니다**. */
export interface ClaimAlreadyOwned {
  ok: true;
  isNew: false;
  speciesId: string;
  reason: 'already_owned';
}

export interface ClaimRejected {
  ok: false;
  reason: ClaimFailureReason;
  /** 어른(교사·개발자)용 원인 문자열. 아이 눈높이 문구와 섞지 마세요. */
  detail?: string;
}

export type ClaimResult = ClaimAcquired | ClaimAlreadyOwned | ClaimRejected;

const KNOWN_FAILURES: ReadonlySet<string> = new Set([
  'expert_only',
  'photo_not_found',
  'species_not_found',
  'no_spot',
]);

/**
 * 서버 JSON → 결과 타입.
 *
 * 순수 함수라 supabase 없이 테스트할 수 있습니다. 모르는 모양이 와도 던지지 않습니다 —
 * 하천변에서 화면이 하얗게 죽는 것보다 "다시 시도해 줄래?"가 낫습니다.
 */
export function parseClaimResult(data: unknown, fallbackSpeciesId: string): ClaimResult {
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: 'unknown', detail: `예상하지 못한 응답: ${String(data)}` };
  }

  const row = data as Record<string, unknown>;
  const speciesId = typeof row.species_id === 'string' ? row.species_id : fallbackSpeciesId;

  if (row.ok === true) {
    if (row.is_new === true) {
      return {
        ok: true,
        isNew: true,
        speciesId,
        tier: typeof row.tier === 'number' ? row.tier : null,
        points: typeof row.points === 'number' ? row.points : null,
        observationId: typeof row.observation_id === 'string' ? row.observation_id : null,
      };
    }
    return { ok: true, isNew: false, speciesId, reason: 'already_owned' };
  }

  const raw = typeof row.reason === 'string' ? row.reason : '';
  if (KNOWN_FAILURES.has(raw)) {
    return { ok: false, reason: raw as ClaimFailureReason };
  }
  return { ok: false, reason: 'unknown', ...(raw ? { detail: raw } : {}) };
}

/**
 * 서버에 카드 등록을 요청합니다.
 *
 * ⚠️ `authenticated` 전용입니다. 미로그인 상태로 부르면 서버가 28000 으로 거절합니다 —
 *    그래서 호출부는 **부르기 전에** 로그인 여부를 보고 안내합니다.
 * ⚠️ 신원을 인자로 보내지 않습니다. 서버가 auth.uid() 만 봅니다(사칭 방지).
 */
export async function claimSpeciesPhoto(args: {
  speciesId: string;
  /**
   * 사진 id. **보호종(report_only)만 생략할 수 있습니다.**
   * 서버가 그 종에 한해 사진 없이 목격 기록을 받아 줍니다 — 촬영을 요구하면
   * 접근·추적을 유도하게 되어 §7.6의 취지와 정반대가 되기 때문입니다.
   */
  photoId?: string | null;
}): Promise<ClaimResult> {
  try {
    const { data, error } = await supabase.rpc('claim_species_photo', {
      p_species_id: args.speciesId,
      p_photo_id: args.photoId ?? undefined,
    });
    if (error) {
      return { ok: false, reason: 'request_failed', detail: error.message };
    }
    return parseClaimResult(data, args.speciesId);
  } catch (e) {
    return {
      ok: false,
      reason: 'request_failed',
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ── 문구 ────────────────────────────────────────────────────────
   ★ 정직하게. 서버는 사진을 보지 않습니다. "확인했어요/맞혔어요"는 금지어입니다. */

/**
 * ★ 지우지 마세요.
 * 아이에게 "이 앱이 무엇을 하고 무엇을 하지 않는지" 알리는 한 줄입니다.
 * 자동 판별이 실제로 붙는 날 이 문장을 바꾸세요 — 그전에는 사실입니다.
 */
export const PHOTO_UNVERIFIED_NOTE =
  '지금은 찍은 사진을 그대로 등록해요. 자동 판별은 준비 중이에요.';

/** 이미 가진 종. 포인트가 안 나가는 것이 정상이라는 점까지 말해 줍니다. */
export const ALREADY_OWNED_MESSAGE =
  '이 카드는 이미 도감에 있어! 사진은 잘 저장했어. 점수는 처음 만났을 때만 받을 수 있어.';

export function claimFailureMessage(reason: ClaimFailureReason): string {
  switch (reason) {
    case 'expert_only':
      // §7.6-4 — 돌 뒤집기를 부추기지 않는 문구. 잠긴 이유를 벌이 아니라 초대로 말합니다.
      return '이 친구는 선생님과 함께하는 프로그램에서 만날 수 있어요. 지금은 등록할 수 없어.';
    case 'photo_not_found':
      return '사진을 찾지 못했어요. 사진을 다시 찍어서 등록해 줄래?';
    case 'species_not_found':
      return '지금은 등록할 수 없는 카드예요. 조금 있다가 다시 열어봐 줄래?';
    case 'no_spot':
      return '등록할 장소를 찾지 못했어요. 조금 있다가 다시 시도해 줄래?';
    case 'request_failed':
      return '도감에 등록하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 줄래?';
    default:
      return '도감에 등록하지 못했어요. 조금 있다가 다시 시도해 줄래?';
  }
}

/**
 * 다시 찍으면 결과가 달라질 수 있는 실패인가.
 * expert_only·species_not_found 는 몇 번을 찍어도 같은 답이 옵니다 —
 * "다시 찍기"를 내밀면 아이를 헛수고시키는 것이라 내밀지 않습니다.
 */
export function isRetryableFailure(reason: ClaimFailureReason): boolean {
  return reason === 'photo_not_found' || reason === 'no_spot' || reason === 'request_failed' || reason === 'unknown';
}
