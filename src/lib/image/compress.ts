/**
 * 업로드 전 압축 정책.
 *
 * 목표 (PLAN.md §4.1): **긴 변 1600px / JPEG 품질 0.8**.
 * 이유는 두 가지입니다.
 *   ① 하천변에서 셀룰러로 올립니다. 12MP 원본(3~6MB)을 그대로 올리면
 *      학급 30명 × 스팟 6곳 = 180장이 아이들 데이터 요금이 됩니다.
 *   ② 종 판별(PLAN.md §7.5)에는 1600px면 충분합니다. 병목은 해상도가 아니라
 *      "30m 밖 백로가 20픽셀"이라는 촬영 조건이라, 원본을 보내도 정확도가
 *      올라가지 않습니다.
 *
 * ⚠️ 압축은 이 모듈의 **부차 목표**입니다. 1순위는 메타데이터 제거이고,
 * 압축 경로가 무엇이든 결과물은 반드시 검증을 통과해야 합니다.
 */

import imageCompression, { type Options as LibOptions } from 'browser-image-compression';

import { ImagePipelineError } from './errors';
import { stripMetadata, verifyBlobStripped, type OutputMimeType, type StrippedImage } from './stripMetadata';

/** 긴 변 상한 (PLAN.md §4.1) */
export const DEFAULT_MAX_EDGE = 1600;
/** JPEG 품질 (PLAN.md §4.1) */
export const DEFAULT_QUALITY = 0.8;
/** 셀룰러 업로드 예산. 1600px/0.8 JPEG는 보통 이 아래로 떨어집니다 */
export const DEFAULT_MAX_BYTES = 1_200_000;
/** 품질 하한 — 이 아래로 내리면 종 식별이 어려워집니다 */
export const DEFAULT_MIN_QUALITY = 0.5;

export interface CompressOptions {
  maxEdge?: number;
  quality?: number;
  maxBytes?: number | null;
  minQuality?: number;
  mimeType?: OutputMimeType;
  /**
   * browser-image-compression 경유 여부. 기본 false.
   * 왜 기본이 false인지는 `compressWithLibrary` 주석을 보세요.
   */
  useLibrary?: boolean;
}

/**
 * 기본 압축 경로 — 자체 Canvas 파이프라인.
 * 방향 보정 · 리사이즈 · 재인코딩 · 검증이 한 번의 디코드로 끝납니다.
 */
export async function compressImage(
  input: Blob,
  options: CompressOptions = {},
): Promise<StrippedImage> {
  if (options.useLibrary) {
    return compressWithLibrary(input, options);
  }
  return stripMetadata(input, {
    mimeType: options.mimeType ?? 'image/jpeg',
    quality: options.quality ?? DEFAULT_QUALITY,
    maxEdge: options.maxEdge ?? DEFAULT_MAX_EDGE,
    maxBytes: options.maxBytes === undefined ? DEFAULT_MAX_BYTES : options.maxBytes,
    minQuality: options.minQuality ?? DEFAULT_MIN_QUALITY,
    verify: true,
  });
}

/**
 * browser-image-compression 경유 경로.
 *
 * ─────────────────────────────────────────────────────────────
 * 이 라이브러리를 기본 경로로 쓰지 않는 이유 (실측·소스 확인 결과)
 * ─────────────────────────────────────────────────────────────
 * 1. **`preserveExif` 옵션이 존재합니다** (기본 false). 즉 이 라이브러리는
 *    EXIF를 보존할 수도 있는 물건이며, 그 스위치가 켜지면 GPS가 그대로
 *    실려나갑니다. 아래에서 명시적으로 false를 넣지만, 기본값에 기대지 않고
 *    **결과 바이트를 매번 다시 검사**합니다.
 * 2. **`useWebWorker: true`(라이브러리 기본값)는 워커 안에서 `libURL`
 *    (기본값 jsdelivr CDN)을 importScripts로 불러옵니다.** 하천변에서 통신이
 *    끊기면 압축 자체가 실패합니다 — 오프라인 우선 PWA(PLAN.md §9 Phase 1)와
 *    정면으로 충돌하므로 워커를 끕니다.
 * 3. 방향 처리(`exifOrientation`)를 라이브러리 내부 규칙에 맡기게 되는데,
 *    우리는 stripMetadata에서 방향 적용 여부를 직접 측정해 다룹니다.
 *
 * 그래도 남겨둔 이유: 바이트 목표(`maxSizeMB`)를 반복 인코딩으로 맞추는
 * 로직이 잘 다듬어져 있어, 특정 기기에서 자체 경로가 예산을 못 맞출 때
 * 대안으로 쓸 수 있습니다. **검증 통과는 예외 없이 동일하게 요구됩니다.**
 */
export async function compressWithLibrary(
  input: Blob,
  options: CompressOptions = {},
): Promise<StrippedImage> {
  const mimeType = options.mimeType ?? 'image/jpeg';
  const maxBytes = options.maxBytes === undefined ? DEFAULT_MAX_BYTES : options.maxBytes;

  const file =
    input instanceof File ? input : new File([input], 'capture', { type: input.type || mimeType });

  const libOptions: LibOptions = {
    maxWidthOrHeight: options.maxEdge ?? DEFAULT_MAX_EDGE,
    initialQuality: options.quality ?? DEFAULT_QUALITY,
    fileType: mimeType,
    // ★ EXIF 보존 금지. 이 한 줄이 이 모듈 전체의 존재 이유입니다.
    preserveExif: false,
    // CDN 의존 제거 (위 2번)
    useWebWorker: false,
    ...(maxBytes ? { maxSizeMB: maxBytes / (1024 * 1024) } : {}),
  };

  const compressed = await imageCompression(file, libOptions);

  // 라이브러리를 믿지 않습니다 — 결과 바이트를 직접 읽어 확인합니다.
  try {
    const verification = await verifyBlobStripped(compressed);
    const size = await readBlobSize(compressed);
    return {
      blob: compressed,
      width: size.width,
      height: size.height,
      mimeType: compressed.type || mimeType,
      byteSize: compressed.size,
      // 라이브러리가 방향을 어떻게 처리했는지는 알 수 없습니다.
      appliedOrientation: 1,
      quality: options.quality ?? DEFAULT_QUALITY,
      verification,
    };
  } catch (e) {
    // 검증 실패 → **원본을 반환하지 않습니다.** 자체 Canvas 경로로 다시 굽고,
    // 그것도 실패하면 그대로 던집니다.
    if (e instanceof ImagePipelineError) {
      return stripMetadata(compressed, {
        mimeType,
        quality: options.quality ?? DEFAULT_QUALITY,
        maxEdge: options.maxEdge ?? DEFAULT_MAX_EDGE,
        maxBytes,
        minQuality: options.minQuality ?? DEFAULT_MIN_QUALITY,
        verify: true,
      });
    }
    throw e;
  }
}

/** 검증된 Blob에서 픽셀 크기만 다시 확인 (라이브러리 경로 보고용) */
async function readBlobSize(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }
  return { width: 0, height: 0 };
}
