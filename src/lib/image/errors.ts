/**
 * 이미지 파이프라인 오류 타입.
 *
 * ⚠️ 설계 원칙: **실패를 삼키지 않습니다.**
 * 메타데이터 제거·검증에 실패했는데 조용히 원본 Blob을 돌려주면,
 * 호출부는 "안전한 이미지"를 받았다고 믿고 그대로 업로드합니다.
 * 그 순간 PLAN.md §5의 "위치 좌표를 저장하지 않는다" 설계가 통째로 무너집니다.
 * 따라서 이 모듈의 모든 실패 경로는 예외로만 빠져나갑니다.
 *
 * DOM 의존성이 없습니다 — metadataScan.ts와 함께 서버(Edge Function)로
 * 그대로 복사해 이중 방어(PLAN.md §5.2-3)에 재사용할 수 있습니다.
 */

export type ImagePipelineErrorCode =
  /** 빈 파일 */
  | 'empty_file'
  /** 이미지가 아니거나 지원하지 않는 형식 */
  | 'unsupported_type'
  /** 사람이 찍은 사진이라고 보기 어려운 크기 — 방어적 상한 */
  | 'too_large'
  /** 디코딩 실패 (손상된 파일, 브라우저 미지원 코덱 등) */
  | 'decode_failed'
  /** 캔버스 인코딩 실패 */
  | 'encode_failed'
  /** Canvas / createImageBitmap 을 쓸 수 없는 환경 */
  | 'canvas_unavailable'
  /** 우리가 파싱할 수 없는 형식 → "메타데이터 없음"을 증명할 수 없음 */
  | 'unverifiable_format'
  /** 재인코딩 후에도 메타데이터가 남아 있음 (가장 심각) */
  | 'metadata_remains';

export class ImagePipelineError extends Error {
  readonly code: ImagePipelineErrorCode;
  readonly detail: unknown;

  constructor(code: ImagePipelineErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = 'ImagePipelineError';
    this.code = code;
    this.detail = detail;
    // ES2022 타깃에서는 필요 없지만, 다운레벨 트랜스파일 시 instanceof 보전용
    Object.setPrototypeOf(this, ImagePipelineError.prototype);
  }
}

export function isImagePipelineError(e: unknown): e is ImagePipelineError {
  return e instanceof ImagePipelineError;
}
