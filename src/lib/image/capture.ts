/**
 * 카메라 촬영 입력 헬퍼 — DOM API만 사용합니다 (React 의존성 없음).
 *
 * `<input type="file" accept="image/*" capture="environment">` 를 감쌉니다.
 * `capture="environment"`는 후면 카메라를 요청합니다 — 이 앱의 촬영 대상은
 * 백로·갈대·징검다리이지 셀피가 아니고(PLAN.md §5.2-3 "얼굴 사진 원천 차단"),
 * 기본값을 후면으로 두는 것 자체가 그 설계를 UI 층에서 한 번 더 강제합니다.
 *
 * 검증 정책: **웬만하면 거부하지 않습니다.**
 * 폰 사진은 원래 큽니다. 큰 파일은 거부 대상이 아니라 압축 대상입니다.
 * 거부는 "이미지가 아님 / 빈 파일 / 사람이 찍은 사진일 리 없는 크기"뿐입니다.
 */

import { ImagePipelineError } from './errors';

/** 브라우저 Canvas가 확실히 디코드하는 형식 */
export const CANVAS_SAFE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * iOS가 내려주는 형식. Safari는 디코드하지만 데스크톱 크롬은 못 합니다.
 * 파이프라인에서 디코드 실패로 걸리며, 그때는 '다시 찍어줘' 안내가 맞습니다.
 */
export const RISKY_TYPES = ['image/heic', 'image/heif', 'image/avif'] as const;

/**
 * 방어적 상한 32MB. 폰 사진 상한이 아니라 "사진이 아닌 것"을 막는 선입니다
 * (구형 안드로이드에서 이보다 큰 파일을 디코드하면 탭이 죽습니다).
 */
export const MAX_INPUT_BYTES = 32 * 1024 * 1024;

/** 이 크기를 넘으면 압축이 필수 — 거부가 아니라 안내용 신호입니다 */
export const COMPRESSION_HINT_BYTES = 1_200_000;

export interface CaptureOptions {
  /** 기본 'image/*' */
  accept?: string;
  /** 'environment' = 후면 카메라(기본), 'user' = 전면, false = 갤러리 선택 허용 */
  capture?: 'environment' | 'user' | false;
  /** 기본 false — 이 앱의 미션은 항상 사진 1장입니다 */
  multiple?: boolean;
}

export interface FileLike {
  type: string;
  size: number;
  name?: string;
}

export interface CaptureValidation {
  ok: boolean;
  /** 압축 파이프라인을 반드시 태워야 하는가 */
  needsCompression: boolean;
  /** 디코드 실패 가능성이 있는 형식인가 (HEIC 등) */
  riskyFormat: boolean;
  /** ok=false일 때의 사유 */
  error: ImagePipelineError | null;
  /** 아이에게 그대로 보여줄 수 있는 문구 */
  message: string | null;
}

/**
 * 촬영/선택된 파일 사전 검증. 순수 함수라 DOM 없이 테스트됩니다.
 *
 * 주의: MIME 타입만 봅니다. 실제 형식은 파이프라인이 매직 바이트로 다시
 * 판정하므로(metadataScan.detectImageFormat), 여기서의 통과는 최종 보증이 아닙니다.
 */
export function validateCaptureFile(file: FileLike): CaptureValidation {
  const base: CaptureValidation = {
    ok: false,
    needsCompression: false,
    riskyFormat: false,
    error: null,
    message: null,
  };

  if (!file || file.size === 0) {
    return {
      ...base,
      error: new ImagePipelineError('empty_file', '빈 파일입니다.'),
      message: '사진이 비어 있어요. 다시 찍어볼까?',
    };
  }

  const type = (file.type || '').toLowerCase();
  if (!type.startsWith('image/')) {
    return {
      ...base,
      error: new ImagePipelineError('unsupported_type', `이미지가 아닙니다: ${type || '(타입 없음)'}`),
      message: '사진 파일만 올릴 수 있어요.',
    };
  }

  if (file.size > MAX_INPUT_BYTES) {
    return {
      ...base,
      error: new ImagePipelineError(
        'too_large',
        `파일이 너무 큽니다: ${file.size} 바이트 (상한 ${MAX_INPUT_BYTES})`,
      ),
      message: '사진이 너무 커서 열 수 없어요. 카메라로 다시 찍어줄래?',
    };
  }

  return {
    ok: true,
    needsCompression: file.size > COMPRESSION_HINT_BYTES,
    riskyFormat: (RISKY_TYPES as readonly string[]).includes(type),
    error: null,
    message: null,
  };
}

/**
 * 촬영용 input 엘리먼트를 만듭니다 (DOM에 붙이지 않은 상태로 반환).
 * React 컴포넌트에서 직접 `<input>`을 렌더링해도 되고, 이걸 써도 됩니다.
 */
export function createCaptureInput(options: CaptureOptions = {}): HTMLInputElement {
  if (typeof document === 'undefined') {
    throw new ImagePipelineError('canvas_unavailable', 'DOM이 없는 환경입니다.');
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = options.accept ?? 'image/*';
  input.multiple = options.multiple ?? false;

  const capture = options.capture === undefined ? 'environment' : options.capture;
  if (capture) {
    // 데스크톱 브라우저는 capture 속성을 무시합니다 (파일 선택으로 폴백) — 의도된 동작입니다.
    input.setAttribute('capture', capture);
  }
  return input;
}

/**
 * 카메라를 열고 파일 하나를 받습니다. 취소하면 null.
 *
 * ⚠️ 반드시 **사용자 제스처(클릭) 핸들러 안에서** 호출해야 합니다.
 * 그 밖에서 부르면 브라우저가 파일 선택창을 차단합니다.
 */
export function openCapture(options: CaptureOptions = {}): Promise<File | null> {
  const input = createCaptureInput(options);
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.opacity = '0';
  // iOS Safari는 문서에 붙어 있지 않은 input의 click()을 무시하는 경우가 있습니다.
  document.body.appendChild(input);

  return new Promise<File | null>((resolve) => {
    let settled = false;
    let focusTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (focusTimer !== null) clearTimeout(focusTimer);
      window.removeEventListener('focus', onWindowFocus);
      input.remove();
    };

    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(file);
    };

    const onWindowFocus = () => {
      // 취소 폴백: 'cancel' 이벤트를 지원하지 않는 구형 브라우저용.
      // 포커스가 돌아왔는데 잠시 뒤에도 change가 없으면 취소로 간주합니다.
      // (change 이벤트가 focus보다 늦게 오는 기기가 있어 지연이 필요합니다.)
      if (focusTimer !== null) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => finish(input.files?.[0] ?? null), 800);
    };

    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    window.addEventListener('focus', onWindowFocus);

    input.click();
  });
}
