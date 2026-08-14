/**
 * SpeciesPhotoClaim — 잠긴 카드에서 "사진 찍어 등록하기".
 *
 * PLAN.md §7 의 핵심 동작입니다: **생물을 찾아 사진을 찍으면 도감이 채워진다.**
 * 그동안 도감은 보기만 할 수 있었고, 카드는 체크인 시 장소 카드로만 들어왔습니다.
 *
 * 이 컴포넌트 하나가 등록 UX 전체를 들고 있습니다 — 진입점 · 진행 상태 · 결과 안내 ·
 * 재시도 · 획득 연출. 바깥(DexCardSheet → DexScreen → DexContainer)은 자리만 내주고
 * 성공했을 때 도감을 다시 불러오면 됩니다.
 *
 * ── ★ 저서생물(expert_only)에는 촬영 버튼을 두지 않습니다 ────────
 * 서버도 막지만(0019), 화면이 막는 이유는 다릅니다. 목록에 "찍어 보자"를 올리는
 * 순간 아이는 돌을 뒤집습니다. §7.6-4 의 취지는 거절이 아니라 **유도하지 않기**입니다.
 *
 * ── ★ 정직한 문구 ───────────────────────────────────────────────
 * 서버는 사진의 내용을 확인하지 않습니다. "AI가 확인했어요 / 판별 완료 /
 * 정확히 맞혔어요" 는 전부 거짓입니다. 우리가 말할 수 있는 건 "등록했어요"까지이고,
 * 그 사실을 PHOTO_UNVERIFIED_NOTE 한 줄로 아이에게 알립니다.
 */

import type { Species } from '../../types/domain';
import { CardAcquired } from './CardAcquired';
import { PHOTO_UNVERIFIED_NOTE, type ClaimAcquired } from './claim';
import { ETHICS_ICON, ETHICS_NOTE } from './display';
import { useSpeciesPhotoClaim, type SpeciesClaimStatus } from './useSpeciesPhotoClaim';
import styles from './SpeciesPhotoClaim.module.css';

export interface SpeciesPhotoClaimProps {
  species: Species;
  /** 이미 가진 카드인지. 가진 카드에는 진입점을 두지 않습니다. */
  owned?: boolean;
  /** 새 카드를 얻었을 때 — 컨테이너가 도감을 다시 불러오게 합니다. */
  onAcquired?: (result: ClaimAcquired) => void;
}

export function SpeciesPhotoClaim({ species, owned = false, onAcquired }: SpeciesPhotoClaimProps) {
  const claim = useSpeciesPhotoClaim({
    species,
    ...(onAcquired ? { onAcquired } : {}),
  });

  // ★ 전문가 동반 프로그램 전용 종 — 버튼 자체를 만들지 않습니다.
  if (species.ethicsFlag === 'expert_only') {
    return (
      <p className={styles.expert}>
        <span aria-hidden="true">🔒 </span>
        이 친구는 선생님과 함께하는 프로그램에서 만날 수 있어요.
      </p>
    );
  }

  // 획득 연출은 `owned` 검사보다 먼저 봅니다. 등록이 성공하면 컨테이너가 도감을 다시
  // 불러오고, 그 순간 owned 가 true 로 바뀝니다 — 순서를 뒤집으면 축하 화면이
  // 떠 보기도 전에 사라집니다.
  if (claim.status === 'acquired') {
    return (
      <CardAcquired
        species={species}
        observationCount={1}
        {...(claim.points !== null ? { points: claim.points } : {})}
        onClose={claim.reset}
      />
    );
  }

  if (owned) return null;

  const ethicsNote = ETHICS_NOTE[species.ethicsFlag];

  /**
   * ★ 보호종(report_only)에는 사진을 요구하지 않습니다.
   *
   * §7.6은 수달 등을 "접근·추적 금지, 보았다만 기록"으로 정했습니다. 그런데 카드에
   * 「사진 찍어 등록하기」를 띄우면 **플래그가 막으려던 바로 그 행동을 앱이 유도**합니다.
   * 촬영 대신 목격 기록 버튼을 두고, 서버도 이 종에 한해 사진 없는 등록을 받습니다(0020).
   */
  const sightingOnly = species.ethicsFlag === 'report_only';

  return (
    <section
      className={styles.root}
      aria-label={sightingOnly ? '보았다고 기록하기' : '사진 찍어 카드 등록하기'}
    >
      <button
        type="button"
        className={styles.cta}
        // ★ 여기가 제스처 경계입니다. onClick 에 async 를 붙이거나 앞에 await 를 두면
        //   iOS Safari 가 카메라를 조용히 막습니다.
        //   (목격 기록은 카메라를 열지 않으므로 이 제약과 무관합니다.)
        onClick={sightingOnly ? claim.report : claim.capture}
        // disabled 대신 aria-disabled — 눌렀을 때 아무 반응도 없는 버튼보다,
        // 눌러도 두 장 올라가지 않는 버튼이 낫습니다(중복은 훅이 ref 로 막습니다).
        aria-disabled={claim.pending}
      >
        {claim.pending
          ? busyLabel(claim.status)
          : sightingOnly
            ? '👀 보았다고 기록하기'
            : '📷 사진 찍어 등록하기'}
      </button>

      {/* ★ 지우지 마세요 — 지금 앱이 실제로 하는 일을 그대로 적은 한 줄입니다. */}
      <p className={styles.honest}>
        {sightingOnly
          ? '이 친구는 사진을 찍지 않아요. 가까이 가지 말고 "보았다"만 기록해요.'
          : PHOTO_UNVERIFIED_NOTE}
      </p>

      {/* 관찰 약속(가까이 가지 않기 등)은 등록을 권하는 자리에서 한 번 더 말합니다. */}
      {ethicsNote && (
        <p className={styles.ethics}>
          <span aria-hidden="true">{ETHICS_ICON[species.ethicsFlag]} </span>
          {ethicsNote}
        </p>
      )}

      {claim.pending && <ClaimPending label={pendingLabel(claim.status)} />}

      {claim.status === 'needs_login' && <ClaimNeedsLogin />}

      {claim.status === 'already_owned' && claim.message && (
        <div className={styles.already} role="status">
          <p className={styles.alreadyText}>
            <span aria-hidden="true">📗 </span>
            {claim.message}
          </p>
          {claim.photo && <ClaimThumb previewUrl={claim.photo.previewUrl} />}
        </div>
      )}

      {(claim.status === 'error' || claim.status === 'rejected') && claim.message && (
        <div className={styles.fail} role="alert">
          <p className={styles.failText}>
            <span aria-hidden="true">📷 </span>
            {claim.message}
          </p>
          {claim.retryable && (
            <button type="button" className={styles.retry} onClick={claim.capture}>
              다시 찍기
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* ── 조각들 ──────────────────────────────────────────────────────
   준비 + 업로드 + 등록은 모바일 데이터에서 몇 초씩 걸립니다. 그동안 아무 변화가
   없으면 아이는 "고장 났다"고 읽고 계속 누릅니다. 진행 상태를 반드시 보여 줍니다. */

function busyLabel(status: SpeciesClaimStatus): string {
  return status === 'claiming' ? '도감에 등록하는 중…' : '사진 준비 중…';
}

function pendingLabel(status: SpeciesClaimStatus): string {
  return status === 'claiming' ? '도감에 등록하는 중이에요…' : '사진을 준비하고 있어요…';
}

export function ClaimPending({ label }: { label: string }) {
  return (
    <p className={styles.pending} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      {label}
    </p>
  );
}

/**
 * 미로그인 안내.
 *
 * ★ 조용히 넘기지 않습니다. 예전에 미션 쪽에서 미로그인이면 아무 말 없이 완료 처리한
 *   적이 있는데, "사진을 찍는다"고 해놓고 아무 일도 일어나지 않아 **카메라 기능이
 *   아예 없는 것처럼** 보였습니다. 같은 실수를 반복하지 않습니다.
 */
export function ClaimNeedsLogin() {
  return (
    <p className={styles.login} role="status">
      <span aria-hidden="true">🔒 </span>
      사진으로 카드를 등록하려면 로그인이 필요해요. 화면 맨 위 <strong>로그인</strong> 버튼을
      누르고 오면, 네가 찍은 사진이 도감에 쌓여!
    </p>
  );
}

/** 방금 올린 사진의 로컬 미리보기. 서버에서 다시 받아오지 않습니다. */
function ClaimThumb({ previewUrl }: { previewUrl: string }) {
  return (
    <img className={styles.thumb} src={previewUrl} alt="방금 찍어서 등록한 사진" />
  );
}
