/**
 * 도감 카드 등록 훅 — 촬영 → 업로드 → `claim_species_photo`.
 *
 * 파이프라인은 이미 완성돼 있습니다(@/lib/photos: 촬영 → EXIF/GPS 제거 → 압축 →
 * 검증 → Storage 업로드 → photos INSERT). 여기서는 그 뒤에 서버 등록 한 단계를 잇습니다.
 *
 * ── ★ captureAndUpload 는 클릭 핸들러 안에서 곧바로 부릅니다 ─────
 * 브라우저는 **사용자 제스처 안에서만** 카메라/파일 선택창을 열어 줍니다.
 * 앞에 await 를 하나라도 두면(세션 조회·확인 다이얼로그·뮤테이션) 제스처가 소모되어
 * iOS Safari 가 선택창을 **조용히** 막습니다 — 에러도 없이 아무 일도 안 일어납니다.
 * 그래서 capture()는 async 가 아니고, 안에서도 await 없이 바로 호출한 뒤 .then 으로
 * 이어받습니다. 이 규칙은 SpeciesPhotoClaim.test.tsx 가 고정하고 있습니다.
 *
 * ── ★ 미로그인은 카메라를 열지도, 그냥 넘기지도 않습니다 ─────────
 * claim_species_photo 는 authenticated 전용이고 photos INSERT 도 마찬가지라,
 * 촬영해 봐야 not_signed_in 으로 끝납니다. 반대로 아무 말 없이 넘겨 버리면
 * "사진 찍어 등록하기"를 눌렀는데 아무 일도 안 일어나 **기능이 없는 것처럼** 보입니다.
 * (미션 쪽에서 실제로 그렇게 만들었다가 지적받은 적이 있습니다.)
 * 그래서 카메라는 열지 않고, 왜 안 되는지 말합니다.
 *
 * ── 미션 쪽 useMissionPhoto 를 import 하지 않는 이유 ─────────────
 * 같은 파이프라인을 쓰지만 뒤에 붙는 일이 다릅니다(미션은 완료, 도감은 서버 등록).
 * features 끼리 훅을 빌려 쓰면 한쪽 요구가 바뀔 때 다른 쪽이 같이 흔들립니다.
 * 제스처 규칙과 실패 처리 방식만 그대로 가져왔습니다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { captureAndUpload, describePhotoError, type UploadedPhoto } from '@/lib/photos';
import { useSession } from '@/lib/session';
import type { Species } from '@/types/domain';
import {
  ALREADY_OWNED_MESSAGE,
  claimFailureMessage,
  claimSpeciesPhoto,
  isRetryableFailure,
  type ClaimAcquired,
  type ClaimResult,
} from './claim';

/** photos.mission_tag 에 남는 표시용 태그. 좌표·시각을 넣지 마세요. */
export const DEX_PHOTO_TAG = 'dex_species';

/**
 * idle          아무 일도 없음
 * capturing     카메라 → 준비 → 업로드
 * claiming      서버에 카드 등록 요청 중
 * acquired      새 카드 획득 (연출을 띄웁니다)
 * already_owned 이미 가진 종 — 오류가 아닙니다
 * rejected      서버가 거절 (expert_only 등)
 * error         촬영·업로드 실패
 * needs_login   미로그인 — 카메라를 열지 않았습니다
 */
export type SpeciesClaimStatus =
  | 'idle'
  | 'capturing'
  | 'claiming'
  | 'acquired'
  | 'already_owned'
  | 'rejected'
  | 'error'
  | 'needs_login';

export interface SpeciesPhotoClaimController {
  status: SpeciesClaimStatus;
  /** 업로드가 끝난 사진. previewUrl 은 로컬 Blob URL 입니다. */
  photo: UploadedPhoto | null;
  /** 새 카드일 때 서버가 지급한 포인트. 그 외에는 null */
  points: number | null;
  /** 화면에 그대로 쓸 수 있는 한국어 문구 */
  message: string | null;
  /** 다시 찍어볼 만한 실패인가 */
  retryable: boolean;
  /** 사진을 저장할 수 있는가 = 로그인했는가 */
  canCapture: boolean;
  /** 준비·업로드·등록 중. 버튼을 잠그고 진행 상태를 보여 주세요. */
  pending: boolean;
  /** ⚠️ 반드시 클릭 핸들러에서 **await 없이** 부르세요. */
  capture: () => void;
  /**
   * 사진 없이 "보았다"만 기록합니다. **보호종(report_only) 전용**입니다.
   * 촬영을 요구하면 아이를 가까이 가게 만들어 §7.6의 취지와 정반대가 됩니다.
   * 카메라를 열지 않으므로 제스처 제약이 없습니다.
   */
  report: () => void;
  reset: () => void;
}

/**
 * previewUrl 은 URL.createObjectURL 로 만든 것이라 직접 놓아 주지 않으면
 * 페이지가 살아 있는 내내 Blob 이 메모리에 남습니다.
 * (jsdom 처럼 revokeObjectURL 이 없는 환경에서는 그냥 건너뜁니다.)
 */
function revokePreview(photo: UploadedPhoto | null): void {
  if (!photo) return;
  if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(photo.previewUrl);
}

export function useSpeciesPhotoClaim(options: {
  species: Species;
  /** 새 카드를 얻었을 때. 컨테이너가 도감 쿼리를 다시 불러오게 합니다. */
  onAcquired?: (result: ClaimAcquired) => void;
}): SpeciesPhotoClaimController {
  const { species, onAcquired } = options;
  const { userId } = useSession();

  const [status, setStatus] = useState<SpeciesClaimStatus>('idle');
  const [photo, setPhoto] = useState<UploadedPhoto | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);

  // 언마운트 뒤 도착한 응답으로 setState 하지 않기 위한 표식.
  const aliveRef = useRef(true);
  // 두 번 눌러 사진이 두 장 올라가는 것을 막습니다. status 는 렌더 뒤에나 바뀌므로
  // 같은 틱의 연타를 못 막습니다 — 그래서 ref 로 잠급니다.
  const pendingRef = useRef(false);
  const photoRef = useRef<UploadedPhoto | null>(null);
  // 콜백을 capture 의 의존성에 넣으면 부모가 인라인 함수를 넘길 때마다
  // capture 가 새로 만들어집니다. 제스처 핸들러의 정체성이 흔들릴 이유가 없습니다.
  const onAcquiredRef = useRef(onAcquired);
  onAcquiredRef.current = onAcquired;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      revokePreview(photoRef.current);
      photoRef.current = null;
    };
  }, []);

  const keep = useCallback((next: UploadedPhoto | null) => {
    if (photoRef.current && photoRef.current !== next) revokePreview(photoRef.current);
    photoRef.current = next;
    setPhoto(next);
  }, []);

  const reset = useCallback(() => {
    keep(null);
    setMessage(null);
    setPoints(null);
    setRetryable(false);
    setStatus('idle');
  }, [keep]);

  const applyResult = useCallback((result: ClaimResult) => {
    if (result.ok && result.isNew) {
      setPoints(result.points);
      setMessage(null);
      setRetryable(false);
      setStatus('acquired');
      onAcquiredRef.current?.(result);
      return;
    }
    if (result.ok) {
      // 이미 가진 종. 포인트가 안 나가는 것이 정상입니다 — 실패로 그리지 않습니다.
      setPoints(null);
      setMessage(ALREADY_OWNED_MESSAGE);
      setRetryable(false);
      setStatus('already_owned');
      return;
    }
    setPoints(null);
    setMessage(claimFailureMessage(result.reason));
    setRetryable(isRetryableFailure(result.reason));
    setStatus('rejected');
  }, []);

  const speciesId = species.id;

  /** 사진 없이 목격만 기록. 보호종에만 씁니다. */
  const report = useCallback(() => {
    if (pendingRef.current) return;
    if (!userId) {
      setMessage(null);
      setRetryable(false);
      setStatus('needs_login');
      return;
    }

    pendingRef.current = true;
    setMessage(null);
    setPoints(null);
    setRetryable(false);
    setStatus('claiming');

    void claimSpeciesPhoto({ speciesId })
      .then((result) => {
        if (!aliveRef.current) return;
        applyResult(result);
      })
      .finally(() => {
        pendingRef.current = false;
      });
  }, [userId, speciesId, applyResult]);

  const capture = useCallback(() => {
    if (pendingRef.current) return;

    // 미로그인이면 카메라를 열지 않습니다. 대신 왜 안 되는지 말합니다 —
    // 조용히 넘기면 기능이 아예 없는 것처럼 보입니다.
    if (!userId) {
      setMessage(null);
      setRetryable(false);
      setStatus('needs_login');
      return;
    }

    pendingRef.current = true;
    setMessage(null);
    setPoints(null);
    setRetryable(false);
    setStatus('capturing');

    // ↓↓ 여기가 제스처 경계입니다. 이 위에 await 를 넣지 마세요.
    captureAndUpload({ userId, spotId: null, missionTag: DEX_PHOTO_TAG })
      .then((uploaded) => {
        if (!aliveRef.current) {
          // 화면이 이미 닫혔습니다. 미리보기 URL 만 놓아 줍니다.
          pendingRef.current = false;
          revokePreview(uploaded);
          return;
        }
        if (!uploaded) {
          // 취소는 오류가 아닙니다. 빨간 경고 없이 조용히 돌아갑니다.
          pendingRef.current = false;
          setStatus('idle');
          return;
        }

        keep(uploaded);
        setStatus('claiming');

        // claimSpeciesPhoto 는 던지지 않습니다 — 네트워크 실패도 결과로 옵니다.
        return claimSpeciesPhoto({ speciesId, photoId: uploaded.photoId }).then((result) => {
          pendingRef.current = false;
          if (!aliveRef.current) return;
          applyResult(result);
        });
      })
      .catch((error: unknown) => {
        // 여기 오는 건 촬영·업로드 실패(PhotoError)뿐입니다.
        pendingRef.current = false;
        if (!aliveRef.current) return;
        setMessage(describePhotoError(error));
        setRetryable(true);
        setStatus('error');
      });
  }, [userId, speciesId, keep, applyResult]);

  return {
    status,
    photo,
    points,
    message,
    report,
    retryable,
    canCapture: Boolean(userId),
    pending: status === 'capturing' || status === 'claiming',
    capture,
    reset,
  };
}
