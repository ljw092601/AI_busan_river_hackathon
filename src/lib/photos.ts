import { captureAndPrepare, isImagePipelineError, type PreparedImage } from '@/lib/image';
import { supabase } from '@/lib/supabase';

/**
 * 사진 촬영 → 업로드 → DB 기록. 화면이 쓰는 단일 진입점입니다.
 *
 * ┌ 촬영 ─ EXIF/GPS 제거(재인코딩) ─ 압축 ─ 검증 ─ Storage 업로드 ─ photos INSERT ┐
 *
 * ★ 원본 File을 Storage로 직접 보내는 코드를 만들지 마세요.
 *   `@/lib/image`의 prepareForUpload를 통과한 Blob만 올라갑니다. 통과하지 않으면
 *   촬영 위치와 시각이 박힌 원본이 그대로 서버에 남습니다. PLAN.md §5.2-3
 *
 * ★ 경로 규칙: photos/{user_id}/{uuid}.{ext}
 *   Storage 정책이 첫 폴더명을 auth.uid()와 대조합니다(0007). 파일명에 촬영 시각이나
 *   좌표를 넣지 마세요 — 경로도 메타데이터입니다.
 */

const BUCKET = 'photos';

export interface UploadedPhoto {
  photoId: string;
  storagePath: string;
  /** 화면에 즉시 보여줄 미리보기. 업로드된 파일이 아니라 로컬 Blob URL 입니다. */
  previewUrl: string;
  width: number;
  height: number;
  byteSize: number;
}

export type PhotoFailure =
  | 'cancelled'      // 사용자가 촬영을 취소 — 오류가 아닙니다
  | 'not_signed_in'
  | 'prepare_failed' // 형식·용량·디코드 실패
  | 'upload_failed'
  | 'record_failed';

export class PhotoError extends Error {
  constructor(
    readonly kind: PhotoFailure,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PhotoError';
  }
}

/** 사용자에게 그대로 보여줄 수 있는 한국어 문구. */
export function describePhotoError(e: unknown): string {
  if (e instanceof PhotoError) {
    switch (e.kind) {
      case 'not_signed_in':
        return '사진을 저장하려면 로그인이 필요해요.';
      case 'prepare_failed':
        return '사진을 처리하지 못했어요. 다른 사진으로 다시 시도해 주세요.';
      case 'upload_failed':
        return '사진을 올리지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';
      case 'record_failed':
        return '사진은 올라갔는데 기록에 실패했어요. 한 번 더 눌러 주세요.';
      default:
        return '사진 촬영을 취소했어요.';
    }
  }
  return '사진 처리 중 문제가 생겼어요. 다시 시도해 주세요.';
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * 촬영부터 기록까지 한 번에.
 *
 * 사용자가 촬영을 취소하면 `null`을 반환합니다(예외가 아닙니다).
 * 그 밖의 실패는 `PhotoError`를 던집니다.
 *
 * ⚠️ **사용자 제스처 핸들러 안에서 직접 호출**해야 합니다.
 *   await 뒤로 미루면 브라우저가 파일 선택창을 차단합니다.
 */
export async function captureAndUpload(opts: {
  userId: string | null;
  /** 어느 지점에서 찍었는지. 하천당 스팟 1개이므로 사실상 하천 식별자입니다. */
  spotId?: string | null;
  /** 어떤 미션이었는지 표시용 태그. 좌표·시각을 넣지 마세요. */
  missionTag?: string | null;
}): Promise<UploadedPhoto | null> {
  if (!opts.userId) {
    throw new PhotoError('not_signed_in', '로그인이 필요합니다.');
  }

  let prepared: PreparedImage | null;
  try {
    // capture: 'environment' → 모바일에서 후면 카메라가 바로 열립니다.
    prepared = await captureAndPrepare({ capture: 'environment' });
  } catch (e) {
    if (isImagePipelineError(e)) {
      throw new PhotoError('prepare_failed', '이미지를 준비하지 못했습니다.', e);
    }
    throw new PhotoError('prepare_failed', '이미지를 준비하지 못했습니다.', e);
  }

  if (!prepared) return null; // 사용자가 취소

  const path = `${opts.userId}/${crypto.randomUUID()}.${extensionFor(prepared.mimeType)}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, prepared.blob, {
      contentType: prepared.mimeType,
      // 같은 uuid가 두 번 나올 일은 없지만, 덮어쓰기를 허용하지 않는 편이 안전합니다.
      upsert: false,
    });
  if (upErr) {
    throw new PhotoError('upload_failed', upErr.message, upErr);
  }

  // is_public / review_status 는 보내지 않습니다 — photos_insert_self 정책이
  // review_status='pending' AND NOT is_public 을 요구하고, 둘 다 컬럼 기본값입니다.
  const { data, error: insErr } = await supabase
    .from('photos')
    .insert({
      user_id: opts.userId,
      storage_path: path,
      spot_id: opts.spotId ?? null,
      mission_tag: opts.missionTag ?? null,
      exif_stripped: true, // prepareForUpload 를 통과한 바이트에만 붙입니다
    })
    .select('id')
    .single();

  if (insErr) {
    // 업로드된 파일이 고아로 남습니다. 되돌리기를 시도하되 실패해도 무시합니다 —
    // 여기서 또 던지면 사용자는 원인이 두 개인 오류를 보게 됩니다.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw new PhotoError('record_failed', insErr.message, insErr);
  }

  return {
    photoId: data.id,
    storagePath: path,
    previewUrl: URL.createObjectURL(prepared.blob),
    width: prepared.width,
    height: prepared.height,
    byteSize: prepared.byteSize,
  };
}
