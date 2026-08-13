/**
 * 이미지 파이프라인 — 공개 진입점.
 *
 * ┌─ 촬영/선택 ─ 사전 검증 ─ 방향 읽기 ─ 디코드 ─ 리사이즈 ─ 재인코딩 ─ 검증 ─┐
 * │                                       (여기서 메타데이터 소멸)            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 호출부(업로드 화면)가 알아야 할 것은 `prepareForUpload` 하나뿐입니다.
 * **원본 File을 Storage로 직접 보내는 코드는 이 앱 어디에도 있으면 안 됩니다.**
 * (PLAN.md §5.2-3, §7.5 ③, §11 "EXIF GPS 유출" 리스크)
 */

import {
  compressImage,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_EDGE,
  DEFAULT_MIN_QUALITY,
  DEFAULT_QUALITY,
  type CompressOptions,
} from './compress';
import { openCapture, validateCaptureFile, type FileLike } from './capture';
import { ImagePipelineError } from './errors';
import type { MetadataScanResult } from './metadataScan';

export interface PreparedImage {
  /** 업로드해도 되는 Blob — 메타데이터 없음이 **검증된** 바이트 */
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
  /** 원본 바이트 수 (절감량 로깅용) */
  originalByteSize: number;
  /** 결과물 스캔 결과. 감사 로그에 남기면 서버측 거부와 대조할 수 있습니다 */
  verification: MetadataScanResult | null;
}

export interface PrepareOptions extends CompressOptions {
  /** 사전 검증 건너뛰기 (이미 검증한 Blob일 때). 기본 false */
  skipValidation?: boolean;
}

/**
 * 업로드 직전 이미지 준비. **이 함수를 통과하지 않은 이미지는 업로드하지 않습니다.**
 *
 * 실패하면 `ImagePipelineError`를 던집니다. 원본을 그대로 돌려주는 경로는 없습니다 —
 * 조용한 폴백은 GPS 좌표가 박힌 원본을 "안전한 이미지"로 위장시키기 때문입니다.
 */
export async function prepareForUpload(
  input: Blob | File,
  options: PrepareOptions = {},
): Promise<PreparedImage> {
  const originalByteSize = input.size;

  if (!options.skipValidation) {
    const meta: FileLike = { type: input.type, size: input.size };
    const validation = validateCaptureFile(meta);
    if (!validation.ok && validation.error) throw validation.error;
  }

  const result = await compressImage(input, options);

  return {
    blob: result.blob,
    width: result.width,
    height: result.height,
    mimeType: result.mimeType,
    byteSize: result.byteSize,
    originalByteSize,
    verification: result.verification,
  };
}

/** 촬영 → 준비까지 한 번에. 사용자 제스처 핸들러 안에서 호출하세요. */
export async function captureAndPrepare(
  options: PrepareOptions & { capture?: 'environment' | 'user' | false } = {},
): Promise<PreparedImage | null> {
  const file = await openCapture({ capture: options.capture });
  if (!file) return null;
  return prepareForUpload(file, options);
}

// ─────────────────────────────────────────────────────────────
// 재수출
// ─────────────────────────────────────────────────────────────

export {
  ImagePipelineError,
  DEFAULT_MAX_EDGE,
  DEFAULT_QUALITY,
  DEFAULT_MAX_BYTES,
  DEFAULT_MIN_QUALITY,
  compressImage,
};
export { isImagePipelineError, type ImagePipelineErrorCode } from './errors';
export {
  stripMetadata,
  verifyBlobStripped,
  scanBlobMetadata,
  orientationTransform,
  fitWithinEdge,
  type StripOptions,
  type StrippedImage,
  type OutputMimeType,
} from './stripMetadata';
export {
  assertNoMetadata,
  scanImageMetadata,
  detectImageFormat,
  readExifOrientation,
  orientationSwapsAxes,
  type MetadataScanResult,
  type MetadataFinding,
  type ExifOrientation,
  type ImageFormat,
} from './metadataScan';
export {
  openCapture,
  createCaptureInput,
  validateCaptureFile,
  MAX_INPUT_BYTES,
  COMPRESSION_HINT_BYTES,
  CANVAS_SAFE_TYPES,
  RISKY_TYPES,
  type CaptureOptions,
  type CaptureValidation,
  type FileLike,
} from './capture';
export { compressWithLibrary, type CompressOptions } from './compress';
