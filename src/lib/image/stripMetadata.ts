/**
 * 메타데이터 전량 제거 — Canvas 재인코딩 파이프라인.
 *
 * ─────────────────────────────────────────────────────────────
 * 왜 클라이언트에서, 왜 업로드 "전"인가  (PLAN.md §5.2-3, §7.5 ③)
 * ─────────────────────────────────────────────────────────────
 * 이 앱은 체크인에서 GPS 좌표를 받아 반경 판정만 하고 즉시 폐기합니다.
 * DB에는 "○○스팟을 △시에 통과함"만 남고 좌표는 어디에도 저장되지 않습니다.
 *
 * 그런데 사진 파일의 EXIF에는 **촬영 GPS 좌표가 그대로 박혀 있습니다.**
 * 사진을 원본 그대로 올리면, 좌표를 버리려고 만든 설계 전체가 사진을 타고
 * 되살아납니다. 서버에 도착한 뒤 지우는 것은 이미 늦습니다 — 그 시점에
 * 이미 수신·처리한 것이 되기 때문입니다. 판별 API로 보내는 경우라면
 * 국외 이전까지 걸립니다.
 *
 * 그래서 제거는 **기기를 떠나기 전**이어야 하고, 이 파일이 그 지점입니다.
 *
 * ─────────────────────────────────────────────────────────────
 * 제거 방식: 지우는 게 아니라 "픽셀만 새로 굽는다"
 * ─────────────────────────────────────────────────────────────
 * EXIF 세그먼트를 찾아 잘라내는 방식은 놓치는 곳이 생깁니다
 * (XMP, IPTC, MPF 내장 원본, EOI 뒤 트레일러…).
 * Canvas는 디코드된 픽셀만 들고 있으므로, 캔버스에서 새로 인코딩하면
 * 원본 컨테이너의 모든 부가 정보가 구조적으로 사라집니다.
 * "무엇을 지울지"를 열거하지 않아도 되는 것이 이 방식의 핵심 장점입니다.
 *
 * ⚠️ 단, 여기에 함정이 하나 있습니다 — EXIF Orientation.
 * 메타데이터를 버리면 회전 정보도 함께 사라집니다. 방향을 반영하지 않고
 * 재인코딩하면 세로로 찍은 사진이 옆으로 누운 채 저장됩니다.
 * → 방향은 **바이트에서 직접 읽어 픽셀에 굽고**, 결과물에는 남기지 않습니다.
 */

import { ImagePipelineError } from './errors';
import {
  assertNoMetadata,
  orientationSwapsAxes,
  readExifOrientation,
  scanImageMetadata,
  type ExifOrientation,
  type MetadataScanResult,
} from './metadataScan';

export type OutputMimeType = 'image/jpeg' | 'image/webp' | 'image/png';

export interface StripOptions {
  /** 출력 형식. 기본 image/jpeg (사진이므로) */
  mimeType?: OutputMimeType;
  /** 0~1. 기본 0.8 (PLAN.md §4.1) */
  quality?: number;
  /** 긴 변 상한(px). null이면 리사이즈하지 않음 */
  maxEdge?: number | null;
  /**
   * 목표 바이트 상한. 초과하면 품질을 단계적으로 낮춰 재인코딩합니다.
   * null이면 품질 사다리를 타지 않습니다.
   */
  maxBytes?: number | null;
  /** 품질 하한. maxBytes를 못 맞춰도 이 아래로는 내리지 않습니다. 기본 0.5 */
  minQuality?: number;
  /**
   * 결과물 검증 여부. **기본 true이며 끄지 마세요.**
   * 테스트에서 인코더를 흉내 낼 때만 false를 씁니다.
   */
  verify?: boolean;
}

export interface StrippedImage {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
  /** 적용된 EXIF Orientation (픽셀에 구워졌음). 1이면 회전 없음 */
  appliedOrientation: ExifOrientation;
  /** 최종 인코딩 품질 */
  quality: number;
  /** 결과물 스캔 결과 — 감사 로그·디버깅용 */
  verification: MetadataScanResult | null;
}

export const DEFAULT_STRIP_OPTIONS = {
  mimeType: 'image/jpeg' as OutputMimeType,
  quality: 0.8,
  maxEdge: 1600 as number | null,
  maxBytes: null as number | null,
  minQuality: 0.5,
  verify: true,
};

/**
 * EXIF를 읽기 위해 앞부분만 잘라 읽습니다.
 * APP1/Exif는 SOI 직후에 오므로 파일 전체를 메모리에 올릴 이유가 없습니다
 * (하천변 구형 안드로이드에서 12MP 사진 전체를 두 번 올리면 탭이 죽습니다).
 */
const HEAD_BYTES = 256 * 1024;

// ─────────────────────────────────────────────────────────────
// 방향 보정 — 캔버스 변환 행렬
// ─────────────────────────────────────────────────────────────

export interface OrientationTransform {
  /** 변환 후 캔버스 크기 */
  canvasWidth: number;
  canvasHeight: number;
  /** ctx.setTransform(a, b, c, d, e, f) 인자 */
  matrix: [number, number, number, number, number, number];
}

/**
 * EXIF Orientation을 캔버스 변환으로 옮깁니다.
 *
 * @param drawWidth  캔버스에 그릴 원본 폭(리사이즈 후, 회전 전)
 * @param drawHeight 캔버스에 그릴 원본 높이(리사이즈 후, 회전 전)
 *
 * 순수 함수라 브라우저 없이 단위 테스트가 됩니다 — 방향 버그는
 * "결과 사진이 누웠다"로만 드러나서 수동 확인이 매우 비싸기 때문에
 * 굳이 순수 함수로 떼어 놓았습니다.
 */
export function orientationTransform(
  orientation: ExifOrientation,
  drawWidth: number,
  drawHeight: number,
): OrientationTransform {
  const w = drawWidth;
  const h = drawHeight;
  const swapped = orientationSwapsAxes(orientation);

  // 각 행렬은 원본 좌표 (x, y)를 캔버스 좌표로 보냅니다:
  //   (a·x + c·y + e,  b·x + d·y + f)
  let matrix: [number, number, number, number, number, number];
  switch (orientation) {
    case 1: matrix = [1, 0, 0, 1, 0, 0]; break;              // 그대로
    case 2: matrix = [-1, 0, 0, 1, w, 0]; break;             // 좌우 반전
    case 3: matrix = [-1, 0, 0, -1, w, h]; break;            // 180° 회전
    case 4: matrix = [1, 0, 0, -1, 0, h]; break;             // 상하 반전
    case 5: matrix = [0, 1, 1, 0, 0, 0]; break;              // 전치(transpose)
    case 6: matrix = [0, 1, -1, 0, h, 0]; break;             // 시계방향 90°
    case 7: matrix = [0, -1, -1, 0, h, w]; break;            // 반전 전치(transverse)
    case 8: matrix = [0, -1, 1, 0, 0, w]; break;             // 반시계방향 90°
  }

  return {
    canvasWidth: swapped ? h : w,
    canvasHeight: swapped ? w : h,
    matrix,
  };
}

/** 긴 변 기준 축소 크기. 확대는 하지 않습니다(없는 화질을 만들 수 없으므로). */
export function fitWithinEdge(
  width: number,
  height: number,
  maxEdge: number | null | undefined,
): { width: number; height: number } {
  if (!maxEdge || maxEdge <= 0) return { width, height };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// ─────────────────────────────────────────────────────────────
// 디코딩
// ─────────────────────────────────────────────────────────────

type Drawable = ImageBitmap | HTMLImageElement;
type DecodePath = 'bitmap' | 'element';

interface DecodedImage {
  source: Drawable;
  /** 디코더가 내놓은 픽셀 크기 */
  width: number;
  height: number;
  path: DecodePath;
  release(): void;
}

/**
 * 방향 자동 적용 여부를 알아내기 위한 **탐침(probe) EXIF 세그먼트**.
 * Orientation = 6 (시계방향 90°), 리틀엔디안, 다른 태그 없음. 총 36바이트.
 *
 * 바이트 구성:
 *   FF E1 00 22                         APP1, 길이 34
 *   "Exif\0\0"                          EXIF 식별자
 *   49 49 2A 00 08 00 00 00             TIFF 헤더(II, 42, IFD0 오프셋 8)
 *   01 00                               엔트리 1개
 *   12 01 03 00 01 00 00 00 06 00 00 00 태그 0x0112 / SHORT / count 1 / 값 6
 *   00 00 00 00                         다음 IFD 없음
 *
 * (이 상수가 실제 EXIF와 일치하는지는 metadataScan.test.ts에서 검증합니다.)
 */
export const PROBE_EXIF_APP1_ORIENTATION_6 = [
  0xff, 0xe1, 0x00, 0x22,
  0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
  0x01, 0x00,
  0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
];

/** 탐침 이미지 크기 — 가로세로가 달라야 축 교환을 관측할 수 있습니다 */
const PROBE_WIDTH = 4;
const PROBE_HEIGHT = 2;

const orientationProbeCache = new Map<DecodePath, Promise<boolean>>();

/**
 * 이 브라우저의 디코더가 EXIF 방향을 **알아서 적용하는지**를 런타임에 1회 측정합니다.
 *
 * ─────────────────────────────────────────────────────────────
 * 왜 측정해야만 하는가 (Chrome 실측으로 확인된 사실)
 * ─────────────────────────────────────────────────────────────
 * `createImageBitmap(blob, { imageOrientation: 'none' })`를 **명시적으로**
 * 요청해도 Chrome은 EXIF 방향을 적용해 버립니다 (400×200 + Orientation 6 →
 * 200×400 반환). 스펙상 기본값이 'none'에서 'from-image'로 바뀐 이력이 있고,
 * `<img>` 경로는 CSS `image-orientation: from-image`가 기본이라 또 다릅니다.
 *
 * 즉 **어느 쪽으로 가정하든 절반의 기기에서 사진이 눕거나 뒤집힙니다.**
 * 가정 대신, 방향이 박힌 4×2 JPEG를 그 자리에서 만들어 디코드해 보고
 * 2×4가 나오는지로 판정합니다. 결과는 경로별로 캐시합니다.
 *
 * 축이 바뀌지 않는 Orientation 2·3·4(좌우반전·180°·상하반전)는 크기로
 * 관측할 수 없기 때문에, 이 전역 탐침이 유일한 판정 수단입니다.
 */
function decoderAppliesOrientation(path: DecodePath): Promise<boolean> {
  let cached = orientationProbeCache.get(path);
  if (!cached) {
    // 탐침이 실패하면 '적용 안 함'으로 둡니다 — 우리가 직접 회전시키는 쪽이
    // 기본 동작이고, 축이 바뀌는 5~8은 아래 크기 대조로 한 번 더 걸러집니다.
    cached = runOrientationProbe(path).catch(() => false);
    orientationProbeCache.set(path, cached);
  }
  return cached;
}

/** 테스트·디버깅용 — 탐침 캐시 초기화 */
export function resetOrientationProbeCache(): void {
  orientationProbeCache.clear();
}

async function buildOrientationProbeBlob(): Promise<Blob> {
  const { canvas, ctx } = createCanvas(PROBE_WIDTH, PROBE_HEIGHT);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, PROBE_WIDTH, PROBE_HEIGHT);
  const base = await blobToBytes(await canvasToBlob(canvas, 'image/jpeg', 0.5));

  // SOI 직후에 APP1을 끼워 넣습니다 (APP0/JFIF보다 앞서도 규격상 유효합니다).
  const seg = Uint8Array.from(PROBE_EXIF_APP1_ORIENTATION_6);
  const bytes = new Uint8Array(base.length + seg.length);
  bytes.set(base.subarray(0, 2), 0);
  bytes.set(seg, 2);
  bytes.set(base.subarray(2), 2 + seg.length);
  return new Blob([bytes], { type: 'image/jpeg' });
}

async function runOrientationProbe(path: DecodePath): Promise<boolean> {
  const blob = await buildOrientationProbeBlob();
  if (path === 'bitmap') {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'none' });
    const applied = bitmap.width === PROBE_HEIGHT && bitmap.height === PROBE_WIDTH;
    bitmap.close();
    return applied;
  }
  const el = await loadImageElement(blob);
  try {
    return el.img.naturalWidth === PROBE_HEIGHT && el.img.naturalHeight === PROBE_WIDTH;
  } finally {
    el.release();
  }
}

async function loadImageElement(blob: Blob): Promise<{ img: HTMLImageElement; release(): void }> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    throw new ImagePipelineError('canvas_unavailable', '이미지 디코딩 수단이 없는 환경입니다.');
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(new ImagePipelineError('decode_failed', '이미지를 디코딩하지 못했습니다.'));
      el.src = url;
    });
    return { img, release: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  // 경로 A — createImageBitmap. 메모리 해제가 명시적이고 워커에서도 씁니다.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'none' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        path: 'bitmap',
        release: () => bitmap.close(),
      };
    } catch {
      // HEIC 등 미지원 코덱 → <img> 경로로 재시도 (Safari는 <img>로 HEIC를 디코드합니다)
    }
  }

  // 경로 B — HTMLImageElement
  const el = await loadImageElement(blob);
  const width = el.img.naturalWidth || el.img.width;
  const height = el.img.naturalHeight || el.img.height;
  if (!width || !height) {
    el.release();
    throw new ImagePipelineError('decode_failed', '이미지 크기를 알 수 없습니다.');
  }
  return { source: el.img, width, height, path: 'element', release: el.release };
}

/**
 * 이 이미지에 우리가 회전을 **더 적용해야 하는지** 결정합니다.
 *
 * 판단 근거는 두 가지이고, 직접 증거를 우선합니다.
 *   ① 크기 대조(이 이미지에 대한 직접 증거) — Orientation 5~8에서만 관측 가능
 *   ② 전역 탐침(브라우저 동작) — 그 외 모든 경우
 */
async function resolveEffectiveOrientation(
  orientation: ExifOrientation,
  rawWidth: number | null,
  rawHeight: number | null,
  decoded: DecodedImage,
): Promise<ExifOrientation> {
  if (orientation === 1) return 1;

  if (orientationSwapsAxes(orientation) && rawWidth && rawHeight && rawWidth !== rawHeight) {
    const swapped = decoded.width === rawHeight && decoded.height === rawWidth;
    return swapped ? 1 : orientation;
  }

  return (await decoderAppliesOrientation(decoded.path)) ? 1 : orientation;
}

// ─────────────────────────────────────────────────────────────
// 캔버스 / 인코딩
// ─────────────────────────────────────────────────────────────

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function createCanvas(width: number, height: number): {
  canvas: AnyCanvas;
  // 두 컨텍스트는 2D 드로잉 API가 동일합니다. 유니온으로 두면 오버로드 호출이
  // 막히므로 한쪽 타입으로 좁혀서 다룹니다.
  ctx: CanvasRenderingContext2D;
} {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (ctx) return { canvas, ctx: ctx as unknown as CanvasRenderingContext2D };
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) return { canvas, ctx };
  }
  throw new ImagePipelineError('canvas_unavailable', '2D 캔버스를 사용할 수 없는 환경입니다.');
}

async function canvasToBlob(canvas: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new ImagePipelineError('encode_failed', '캔버스 인코딩에 실패했습니다.'));
      },
      type,
      quality,
    );
  });
}

// ─────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────

/**
 * 이미지에서 **모든 메타데이터를 제거**하고(방향은 픽셀에 보존) 재인코딩합니다.
 *
 * 실패 시 반드시 던집니다. 원본을 대신 돌려주는 경로는 존재하지 않습니다 —
 * 조용한 폴백은 GPS 좌표가 실린 원본을 "처리된 이미지"로 위장시키기 때문입니다.
 */
export async function stripMetadata(input: Blob, options: StripOptions = {}): Promise<StrippedImage> {
  const opts = { ...DEFAULT_STRIP_OPTIONS, ...options };

  if (input.size === 0) {
    throw new ImagePipelineError('empty_file', '빈 파일입니다.');
  }

  // ① 앞부분만 읽어 방향과 원시 크기를 확보 (메타데이터가 사라지기 전에)
  const head = await blobToBytes(input.slice(0, HEAD_BYTES));
  const headScan = scanImageMetadata(head);
  const orientation = headScan.format === 'jpeg' ? readExifOrientation(head) : 1;

  // ② 디코딩
  const decoded = await decodeImage(input);

  try {
    // ②-b 디코더가 방향을 이미 적용했는지 판정 (가정하지 않고 측정합니다)
    const effectiveOrientation = await resolveEffectiveOrientation(
      orientation,
      headScan.width,
      headScan.height,
      decoded,
    );

    // ③ 리사이즈 크기 계산 — 회전 전 좌표계 기준
    const target = fitWithinEdge(decoded.width, decoded.height, opts.maxEdge);

    // ④ 방향을 픽셀에 굽기
    const transform = orientationTransform(effectiveOrientation, target.width, target.height);
    const { canvas, ctx } = createCanvas(transform.canvasWidth, transform.canvasHeight);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(...transform.matrix);
    ctx.drawImage(decoded.source as CanvasImageSource, 0, 0, target.width, target.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // ⑤ 재인코딩 — 이 순간 원본 컨테이너의 모든 메타데이터가 소멸합니다
    let quality = clampQuality(opts.quality);
    let blob = await canvasToBlob(canvas, opts.mimeType, quality);

    // ⑥ 바이트 예산 초과 시 품질 사다리 (하천변 셀룰러 업로드 — PLAN.md §4.1)
    if (opts.maxBytes && opts.mimeType !== 'image/png') {
      const minQuality = clampQuality(opts.minQuality);
      while (blob.size > opts.maxBytes && quality - 0.1 >= minQuality - 1e-9) {
        quality = Math.round((quality - 0.1) * 100) / 100;
        blob = await canvasToBlob(canvas, opts.mimeType, quality);
      }
    }

    // ⑦ 검증 — "지웠을 것이다"가 아니라 "지워졌는지 확인했다"
    let verification: MetadataScanResult | null = null;
    if (opts.verify) {
      verification = assertNoMetadata(await blobToBytes(blob));
    }

    return {
      blob,
      width: transform.canvasWidth,
      height: transform.canvasHeight,
      mimeType: opts.mimeType,
      byteSize: blob.size,
      appliedOrientation: effectiveOrientation,
      quality,
      verification,
    };
  } finally {
    decoded.release();
  }
}

function clampQuality(q: number): number {
  if (!Number.isFinite(q)) return DEFAULT_STRIP_OPTIONS.quality;
  return Math.min(1, Math.max(0.05, q));
}

/**
 * 이미 만들어진 Blob에 메타데이터가 남아 있지 않은지 검증합니다.
 * 남아 있으면 던집니다.
 *
 * 외부 라이브러리(browser-image-compression 등)의 출력을 **믿지 않고**
 * 확인하는 데 씁니다. 서버측에서는 `assertNoMetadata(bytes)`를 직접 쓰세요.
 */
export async function verifyBlobStripped(blob: Blob): Promise<MetadataScanResult> {
  return assertNoMetadata(await blobToBytes(blob));
}

/** 던지지 않는 검사판 — UI에서 경고만 띄우고 싶을 때 */
export async function scanBlobMetadata(blob: Blob): Promise<MetadataScanResult> {
  return scanImageMetadata(await blobToBytes(blob));
}

/**
 * Blob → 바이트.
 *
 * `Blob.arrayBuffer()`는 Safari 14 미만과 일부 인앱 웹뷰(카카오톡·라인 등에서
 * 링크를 열면 이쪽으로 들어옵니다)에 없습니다. 검증 단계가 환경 때문에
 * 건너뛰어지는 일은 없어야 하므로 FileReader 폴백을 둡니다.
 */
export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  if (typeof FileReader === 'function') {
    return new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () =>
        reject(new ImagePipelineError('decode_failed', '파일을 읽지 못했습니다.'));
      reader.readAsArrayBuffer(blob);
    });
  }
  throw new ImagePipelineError('canvas_unavailable', 'Blob을 읽을 수단이 없는 환경입니다.');
}

export { assertNoMetadata, scanImageMetadata, readExifOrientation };
export type { ExifOrientation, MetadataScanResult };
