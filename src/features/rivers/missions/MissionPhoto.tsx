import { useCallback, useEffect, useRef, useState } from 'react';
import { captureAndUpload, describePhotoError, type UploadedPhoto } from '@/lib/photos';
import { useSession } from '@/lib/session';

/**
 * 미션 사진 촬영 — 온천천(tap_target)·대천천(observe_log)이 **함께 쓰는** 껍데기.
 *
 * 파이프라인 자체는 이미 완성돼 있습니다(@/lib/photos: 촬영 → EXIF/GPS 제거 →
 * 압축 → 검증 → Storage 업로드 → photos INSERT). 여기서는 그것을 화면에 잇기만 합니다.
 *
 * ★ captureAndUpload 는 **클릭 핸들러 안에서 곧바로** 부릅니다
 *   브라우저는 사용자 제스처에서만 파일/카메라 선택창을 열어 줍니다. 앞에 await 를
 *   하나라도 두면(세션 조회·확인 다이얼로그·뮤테이션) 제스처가 소모되어
 *   iOS Safari 가 선택창을 **조용히** 막습니다. 그래서 이 훅의 capture()는
 *   async 가 아니고, 안에서도 await 없이 바로 호출한 뒤 .then 으로 이어받습니다.
 *
 * ★ 사진 실패가 미션을 막지 않습니다
 *   하천까지 걸어간 아이가 권한 거부·오프라인·업로드 실패 때문에 미션을 못 끝내면
 *   안 됩니다. 실패하면 항상 "사진 없이 완료하기"를 함께 내밉니다.
 *
 * ★ 취소는 오류가 아닙니다
 *   captureAndUpload 는 사용자가 선택창을 닫으면 null 을 돌려줍니다. 빨간 경고 없이
 *   조용히 idle 로 돌아갑니다.
 *
 * ★ 미로그인은 카메라를 열지 않습니다
 *   photos_insert_self 와 Storage 정책이 authenticated 전용이라 촬영해 봐야
 *   not_signed_in 으로 끝납니다. 사진을 다 찍게 한 뒤에 거절하는 대신 미리 말하고,
 *   미션은 지금까지처럼 사진 없이 완료되게 둡니다.
 */

/** 미션 태그 — 표시용 라벨입니다. 좌표·시각 등 메타데이터를 넣지 마세요. */
export const OTTER_PHOTO_TAG = 'oncheoncheon_otter';
export const OBSERVE_LOG_PHOTO_TAG = 'daecheon_log';

export type MissionPhotoStatus = 'idle' | 'pending' | 'done' | 'error';

export interface MissionPhotoController {
  status: MissionPhotoStatus;
  /** 업로드가 끝난 사진. previewUrl 은 로컬 Blob URL 입니다. */
  photo: UploadedPhoto | null;
  /** 실패했을 때 화면에 그대로 쓸 수 있는 한국어 문구. */
  errorMessage: string | null;
  /** 사진을 저장할 수 있는가 = 로그인했는가. false 면 카메라를 열지 않습니다. */
  canCapture: boolean;
  /** 준비·업로드 중. 버튼을 잠그고 진행 상태를 보여 주세요. */
  pending: boolean;
  /** ⚠️ 반드시 클릭 핸들러에서 **await 없이** 부르세요. */
  capture: (onUploaded: (photo: UploadedPhoto) => void) => void;
  reset: () => void;
}

/**
 * previewUrl 은 URL.createObjectURL 로 만든 것이라 직접 놓아 주지 않으면
 * 페이지가 살아 있는 내내 Blob 이 메모리에 남습니다.
 * (jsdom 처럼 createObjectURL 이 없는 환경에서는 revoke 도 없습니다 — 그냥 건너뜁니다.)
 */
function revokePreview(photo: UploadedPhoto | null): void {
  if (!photo) return;
  if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(photo.previewUrl);
}

export function useMissionPhoto(options: {
  missionTag: string;
  /**
   * 어느 지점에서 찍었는지. 하천당 스팟은 1개입니다.
   * ⚠️ 지금은 RiverView 가 스팟 id 를 들고 오지 않아 사실상 항상 null 입니다.
   */
  spotId?: string | null;
}): MissionPhotoController {
  const { missionTag, spotId = null } = options;
  const { userId } = useSession();

  const [status, setStatus] = useState<MissionPhotoStatus>('idle');
  const [photo, setPhoto] = useState<UploadedPhoto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 언마운트 뒤 도착한 응답으로 setState 하지 않기 위한 표식.
  const aliveRef = useRef(true);
  // 두 번 눌러 사진이 두 장 올라가는 것을 막습니다. status 는 렌더 뒤에나 바뀌므로
  // 같은 틱의 연타를 못 막습니다 — 그래서 ref 로 잠급니다.
  const pendingRef = useRef(false);
  const photoRef = useRef<UploadedPhoto | null>(null);

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
    setErrorMessage(null);
    setStatus('idle');
  }, [keep]);

  const capture = useCallback(
    (onUploaded: (uploaded: UploadedPhoto) => void) => {
      if (pendingRef.current) return;
      // 미로그인이면 아예 열지 않습니다 — 호출부가 사진 없는 경로로 보내야 합니다.
      if (!userId) return;

      pendingRef.current = true;
      setErrorMessage(null);
      setStatus('pending');

      // ↓↓ 여기가 제스처 경계입니다. 이 위에 await 를 넣지 마세요.
      captureAndUpload({ userId, spotId, missionTag })
        .then((uploaded) => {
          pendingRef.current = false;
          if (!aliveRef.current) {
            // 화면이 이미 닫혔습니다. 미리보기 URL 만 놓아 줍니다.
            revokePreview(uploaded);
            return;
          }
          if (!uploaded) {
            setStatus('idle'); // 취소 — 오류가 아닙니다
            return;
          }
          keep(uploaded);
          setStatus('done');
          onUploaded(uploaded);
        })
        .catch((error: unknown) => {
          pendingRef.current = false;
          if (!aliveRef.current) return;
          setErrorMessage(describePhotoError(error));
          setStatus('error');
        });
    },
    [userId, spotId, missionTag, keep],
  );

  return {
    status,
    photo,
    errorMessage,
    canCapture: Boolean(userId),
    pending: status === 'pending',
    capture,
    reset,
  };
}

/* ── 표시용 조각들 ──────────────────────────────────────────────
   준비 + 업로드는 모바일 데이터에서 몇 초씩 걸립니다. 그동안 아무 변화가 없으면
   아이는 "고장 났다"고 읽고 계속 누릅니다. 진행 상태를 반드시 보여 주세요. */

export function MissionPhotoPending({ label = '사진을 준비하고 있어요…' }: { label?: string }) {
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 text-[11px] font-bold text-slate-600"
    >
      <span
        aria-hidden="true"
        className="inline-block w-3 h-3 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin"
      />
      {label}
    </p>
  );
}

/**
 * 사진 실패 안내. **반드시 빠져나갈 길을 같이 줍니다** — 현장까지 간 아이를
 * 카메라 권한 때문에 미션 앞에 세워 둘 수는 없습니다.
 */
export function MissionPhotoFailure({
  message,
  onRetry,
  onSkip,
}: {
  message: string;
  onRetry: () => void;
  onSkip: () => void;
}) {
  return (
    <div
      role="alert"
      className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900"
    >
      <p className="text-[11px] leading-relaxed">
        <span aria-hidden="true">📷 </span>
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[44px] flex-1 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 transition-all"
        >
          다시 찍기
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="min-h-[44px] flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-all"
        >
          사진 없이 완료하기
        </button>
      </div>
    </div>
  );
}

/** 방금 올린 사진의 로컬 미리보기. 서버에서 다시 받아오지 않습니다. */
export function MissionPhotoThumb({ photo }: { photo: UploadedPhoto }) {
  return (
    <figure className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2">
      <img
        src={photo.previewUrl}
        alt="방금 찍은 미션 사진"
        className="h-14 w-14 shrink-0 rounded-lg object-cover bg-slate-100"
      />
      <figcaption className="text-[11px] font-bold text-slate-600 leading-relaxed break-keep">
        사진을 저장했어요. 촬영 위치와 시각 정보는 지우고 올렸어요.
      </figcaption>
    </figure>
  );
}

/**
 * 미로그인 안내. 로그인 방법 자체는 모달 위쪽 배너가 이미 안내하므로
 * 여기서는 "지금은 사진이 저장되지 않는다"는 사실만 정직하게 적습니다.
 */
export function MissionPhotoSignedOutNote() {
  return (
    <p className="rounded-xl bg-slate-100 border border-slate-200 px-3 py-2 text-[11px] leading-relaxed text-slate-600 break-keep">
      <span aria-hidden="true">🔒 </span>
      사진 저장은 로그인한 뒤에 할 수 있어요.
    </p>
  );
}

/**
 * 미로그인 상태에서 촬영 버튼을 눌렀을 때.
 *
 * ★ 예전에는 그냥 즉시 완료시켰습니다. 그러면 "사진을 찍는다"고 해놓고 아무 일도
 *   일어나지 않은 채 완료 화면으로 넘어가, 카메라 기능이 없는 것처럼 보였습니다.
 *   (실제로 그렇게 보인다는 지적을 받았습니다.)
 *   이제는 왜 사진이 안 찍히는지 말하고, 계속할지 사용자가 고릅니다.
 */
export function MissionPhotoNeedsLogin({ onSkip }: { onSkip: () => void }) {
  return (
    <div
      role="status"
      className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-3 space-y-2"
    >
      <p className="text-[11px] leading-relaxed text-amber-900 break-keep">
        <span aria-hidden="true">📸 </span>
        사진을 저장하려면 로그인이 필요해요. 위쪽 <strong>로그인하고 저장하기</strong>를 누르면
        찍은 사진이 기록에 남아요.
      </p>
      <button
        type="button"
        onClick={onSkip}
        className="min-h-[44px] w-full rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-xs font-bold text-amber-900 transition-all hover:bg-amber-100"
      >
        사진 없이 미션만 완료하기
      </button>
    </div>
  );
}
