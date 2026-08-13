/**
 * 이미지 메타데이터 스캐너 — **DOM 의존성 없는 순수 바이트 파서**.
 *
 * ─────────────────────────────────────────────────────────────
 * 왜 이 파일이 따로 있는가
 * ─────────────────────────────────────────────────────────────
 * PLAN.md §5.2-3은 EXIF 제거를 **이중 방어**로 설계했습니다.
 *   ① 클라이언트: 업로드 전에 Canvas 재인코딩으로 메타데이터 전량 폐기
 *   ② 서버:       도착한 파일에 EXIF가 남아 있으면 거부
 * ②가 ①과 다른 판정 로직을 쓰면 이중 방어가 아니라 이중 버그가 됩니다.
 * 그래서 판정기를 DOM 없는 순수 함수로 분리해, `errors.ts`와 함께
 * Deno Edge Function에 그대로 복사할 수 있게 했습니다.
 *
 * ─────────────────────────────────────────────────────────────
 * 왜 "제거했다"가 아니라 "검증한다"인가
 * ─────────────────────────────────────────────────────────────
 * Canvas 재인코딩은 이론상 메타데이터를 남기지 않습니다. 하지만 그건
 * "브라우저 구현이 그럴 것이다"라는 **가정**입니다. 이 앱에서 그 가정이
 * 틀리면 만 14세 미만 아동의 촬영 위치가 서버로 들어갑니다.
 * 가정에 기대지 않고, 나가는 바이트를 매번 직접 읽어 확인합니다.
 *
 * 참고: 이 스캐너는 **컨테이너 수준 메타데이터**만 봅니다. 픽셀에 숨겨진
 * 스테가노그래피나 JPEG 엔트로피 데이터 내부는 대상이 아닙니다 —
 * Canvas 재인코딩이 픽셀만 남기고 나머지를 전부 버리므로, 컨테이너
 * 수준만 확인해도 "EXIF/GPS가 실려나가는가"라는 질문에는 답이 됩니다.
 */

import { ImagePipelineError } from './errors';

/** EXIF Orientation 태그 값 (1~8). 1 = 회전 없음 */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'heif' | 'unknown';

export interface MetadataFinding {
  /** 세그먼트/청크 식별자 — 예: 'APP1/Exif', 'PNG/tEXt', 'WEBP/EXIF' */
  kind: string;
  /** 파일 내 바이트 오프셋 */
  offset: number;
  /** 세그먼트 전체 길이(바이트) */
  byteLength: number;
  /** true면 개인정보(위치·기기·시각·저작자)를 담을 수 있는 영역 */
  privacy: boolean;
  note: string;
}

export interface MetadataScanResult {
  format: ImageFormat;
  /** 컨테이너를 끝까지 해석했는지. false면 "메타데이터 없음"을 보증할 수 없음 */
  parsed: boolean;
  findings: MetadataFinding[];
  /** privacy=true 인 finding 이 하나라도 있으면 true */
  hasPrivacyMetadata: boolean;
  width: number | null;
  height: number | null;
  /** EXIF Orientation. 없으면 1 */
  orientation: ExifOrientation;
}

// ─────────────────────────────────────────────────────────────
// 형식 판별
// ─────────────────────────────────────────────────────────────

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let s = '';
  const end = Math.min(offset + length, bytes.length);
  for (let i = offset; i < end; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function detectImageFormat(bytes: Uint8Array): ImageFormat {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    return 'png';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'webp';
  }
  if (bytes.length >= 6 && ascii(bytes, 0, 4) === 'GIF8') {
    return 'gif';
  }
  // ISO-BMFF: iPhone 기본 촬영 형식(HEIC)이 여기로 옵니다.
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) {
      return 'heif';
    }
  }
  return 'unknown';
}

// ─────────────────────────────────────────────────────────────
// JPEG
// ─────────────────────────────────────────────────────────────

/**
 * 남아 있어도 개인정보 위험이 없는 JPEG 세그먼트.
 * - APP0/JFIF, APP0/JFXX : 해상도 단위·썸네일 없는 기본 헤더. 브라우저 인코더가 붙입니다.
 * - APP2/ICC_PROFILE     : 색 프로파일. 기기 모델명이 들어가는 경우가 있으나
 *                          브라우저 Canvas 출력은 sRGB 표준 프로파일이라 식별성이 없습니다.
 * - APP14/Adobe          : 색상 변환 플래그(YCbCr/CMYK). 값이 몇 바이트뿐입니다.
 * 그 외 APPn·COM은 전부 위험으로 봅니다 — EXIF(APP1)·XMP(APP1)·IPTC(APP13)·
 * MPF 썸네일(APP2/MPF)이 모두 GPS를 담을 수 있습니다.
 */
const JPEG_BENIGN_SEGMENTS = new Set([
  'APP0/JFIF',
  'APP0/JFXX',
  'APP2/ICC_PROFILE',
  'APP14/Adobe',
]);

function jpegAppIdentifier(bytes: Uint8Array, dataStart: number, dataEnd: number): string {
  // APPn 페이로드 선두의 NUL 종료 식별자를 읽습니다 (최대 32바이트).
  let s = '';
  for (let i = dataStart; i < Math.min(dataEnd, dataStart + 32); i++) {
    const b = bytes[i]!;
    if (b === 0x00) break;
    if (b < 0x20 || b > 0x7e) break;
    s += String.fromCharCode(b);
  }
  return s;
}

function isSofMarker(marker: number): boolean {
  // SOF0~SOF15 중 DHT(C4)·JPG(C8)·DAC(CC) 제외
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

interface JpegParse {
  findings: MetadataFinding[];
  parsed: boolean;
  width: number | null;
  height: number | null;
  /** APP1/Exif 세그먼트의 [시작, 끝) — Orientation 파싱에 재사용 */
  exifRange: [number, number] | null;
}

function parseJpeg(bytes: Uint8Array): JpegParse {
  const findings: MetadataFinding[] = [];
  let width: number | null = null;
  let height: number | null = null;
  let exifRange: [number, number] | null = null;

  let i = 2; // SOI(FFD8) 다음부터
  let sawSos = false;

  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) {
      // 마커 정렬이 깨졌습니다 → 이 파일은 신뢰할 수 없습니다.
      return { findings, parsed: false, width, height, exifRange };
    }
    // 0xFF 패딩 스킵
    let j = i + 1;
    while (j < bytes.length && bytes[j] === 0xff) j++;
    if (j >= bytes.length) return { findings, parsed: false, width, height, exifRange };
    const marker = bytes[j]!;
    const markerStart = i;
    i = j + 1;

    // 길이 필드가 없는 마커들
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd8) continue; // SOI
    if (marker === 0xd9) break; // EOI

    if (i + 1 >= bytes.length) return { findings, parsed: false, width, height, exifRange };
    const segLength = (bytes[i]! << 8) | bytes[i + 1]!;
    if (segLength < 2 || i + segLength > bytes.length) {
      return { findings, parsed: false, width, height, exifRange };
    }
    const dataStart = i + 2;
    const dataEnd = i + segLength;

    if (isSofMarker(marker)) {
      // SOF: [정밀도 1][높이 2][너비 2]
      if (dataStart + 5 <= dataEnd) {
        height = (bytes[dataStart + 1]! << 8) | bytes[dataStart + 2]!;
        width = (bytes[dataStart + 3]! << 8) | bytes[dataStart + 4]!;
      }
    } else if (marker >= 0xe0 && marker <= 0xef) {
      const appNo = marker - 0xe0;
      const id = jpegAppIdentifier(bytes, dataStart, dataEnd);
      let kind = `APP${appNo}/${id || '?'}`;
      let note = `${id || '식별자 없는'} 애플리케이션 세그먼트`;

      if (appNo === 1) {
        if (id === 'Exif') {
          kind = 'APP1/Exif';
          note = 'EXIF — 촬영 GPS 좌표·기기 모델·촬영 시각·썸네일이 들어 있는 바로 그 영역';
          exifRange = [markerStart, dataEnd];
        } else if (id.startsWith('http://ns.adobe.com/xap')) {
          kind = 'APP1/XMP';
          note = 'XMP — EXIF와 별개로 GPS·저작자 정보를 담을 수 있음';
        }
      } else if (appNo === 13) {
        kind = `APP13/${id || 'Photoshop'}`;
        note = 'IPTC/Photoshop 리소스 — 위치·저작자 필드 포함 가능';
      } else if (appNo === 2 && id === 'MPF') {
        note = 'MPF — 다중 사진 확장(내장 원본/썸네일). 원본 EXIF가 통째로 실릴 수 있음';
      }

      findings.push({
        kind,
        offset: markerStart,
        byteLength: dataEnd - markerStart,
        privacy: !JPEG_BENIGN_SEGMENTS.has(kind),
        note,
      });
    } else if (marker === 0xfe) {
      findings.push({
        kind: 'COM',
        offset: markerStart,
        byteLength: dataEnd - markerStart,
        privacy: true,
        note: '주석 세그먼트 — 임의 텍스트가 실릴 수 있음',
      });
    }

    i = dataEnd;

    if (marker === 0xda) {
      // SOS 이후는 엔트로피 부호화 데이터라 마커 단위 순회가 불가능합니다.
      sawSos = true;
      break;
    }
  }

  if (!sawSos) {
    // 압축 데이터가 없는 JPEG = 우리가 만든 결과물일 리 없음
    return { findings, parsed: false, width, height, exifRange };
  }

  // 정상 JPEG는 EOI(FFD9)로 끝납니다. 뒤에 뭔가 더 붙어 있으면 그 자체가 의심 대상입니다
  // (일부 도구가 EOI 뒤에 원본 EXIF나 썸네일을 그대로 이어붙입니다).
  if (bytes.length < 2 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    findings.push({
      kind: 'JPEG/trailer',
      offset: bytes.length,
      byteLength: 0,
      privacy: true,
      note: 'EOI(FFD9)로 끝나지 않음 — 파일 끝에 정체불명의 추가 데이터가 있음',
    });
  }

  return { findings, parsed: true, width, height, exifRange };
}

// ─────────────────────────────────────────────────────────────
// PNG
// ─────────────────────────────────────────────────────────────

/**
 * PNG는 화이트리스트로 판정합니다.
 * PNG 청크는 누구나 정의할 수 있어서(사설 청크 허용) 블랙리스트가 원리적으로 불완전합니다.
 * "아는 것만 통과"가 유일하게 안전한 정책입니다.
 */
const PNG_BENIGN_CHUNKS = new Set([
  'IHDR', 'PLTE', 'IDAT', 'IEND', // 필수
  'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD', 'hIST', 'pHYs', 'sPLT',
  'cICP', 'mDCv', 'cLLi', // 색·표시 관련
  'acTL', 'fcTL', 'fdAT', // APNG
]);

const PNG_TEXT_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt']);

function parsePng(bytes: Uint8Array): JpegParse {
  const findings: MetadataFinding[] = [];
  let width: number | null = null;
  let height: number | null = null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let i = 8; // 시그니처 다음
  let sawIend = false;

  while (i + 8 <= bytes.length) {
    const length = view.getUint32(i);
    const type = ascii(bytes, i + 4, 4);
    const total = 12 + length; // length(4) + type(4) + data + crc(4)
    if (length > 0x7fffffff || i + total > bytes.length) {
      return { findings, parsed: false, width, height, exifRange: null };
    }

    if (type === 'IHDR' && length >= 8) {
      width = view.getUint32(i + 8);
      height = view.getUint32(i + 12);
    }

    if (!PNG_BENIGN_CHUNKS.has(type)) {
      const isText = PNG_TEXT_CHUNKS.has(type);
      findings.push({
        kind: `PNG/${type}`,
        offset: i,
        byteLength: total,
        privacy: true,
        note: type === 'eXIf'
          ? 'EXIF 청크 — GPS 좌표 포함 가능'
          : type === 'tIME'
            ? '최종 수정 시각'
            : isText
              ? '텍스트 청크 — 임의 정보가 실릴 수 있음'
              : '알 수 없는 청크 — 화이트리스트에 없으므로 통과시키지 않습니다',
      });
    }

    i += total;
    if (type === 'IEND') {
      sawIend = true;
      break;
    }
  }

  if (!sawIend) return { findings, parsed: false, width, height, exifRange: null };

  if (i !== bytes.length) {
    findings.push({
      kind: 'PNG/trailer',
      offset: i,
      byteLength: bytes.length - i,
      privacy: true,
      note: 'IEND 뒤에 추가 데이터가 있음',
    });
  }

  return { findings, parsed: true, width, height, exifRange: null };
}

// ─────────────────────────────────────────────────────────────
// WebP (RIFF)
// ─────────────────────────────────────────────────────────────

const WEBP_BENIGN_CHUNKS = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);

function parseWebp(bytes: Uint8Array): JpegParse {
  const findings: MetadataFinding[] = [];
  let width: number | null = null;
  let height: number | null = null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const riffSize = view.getUint32(4, true);
  if (riffSize + 8 > bytes.length) {
    return { findings, parsed: false, width, height, exifRange: null };
  }

  let i = 12;
  const end = Math.min(bytes.length, riffSize + 8);
  while (i + 8 <= end) {
    const fourcc = ascii(bytes, i, 4);
    const size = view.getUint32(i + 4, true);
    const padded = size + (size % 2); // RIFF 청크는 짝수 바이트 정렬
    if (i + 8 + padded > end) {
      return { findings, parsed: false, width, height, exifRange: null };
    }

    if (fourcc === 'VP8X' && size >= 10) {
      const d = i + 8;
      width = ((bytes[d + 4]! | (bytes[d + 5]! << 8) | (bytes[d + 6]! << 16)) >>> 0) + 1;
      height = ((bytes[d + 7]! | (bytes[d + 8]! << 8) | (bytes[d + 9]! << 16)) >>> 0) + 1;
    }

    if (!WEBP_BENIGN_CHUNKS.has(fourcc)) {
      findings.push({
        kind: `WEBP/${fourcc.trim()}`,
        offset: i,
        byteLength: 8 + padded,
        privacy: true,
        note: fourcc === 'EXIF'
          ? 'EXIF 청크 — GPS 좌표 포함 가능'
          : fourcc === 'XMP '
            ? 'XMP 청크 — GPS·저작자 정보 포함 가능'
            : '알 수 없는 청크',
      });
    }

    i += 8 + padded;
  }

  return { findings, parsed: true, width, height, exifRange: null };
}

// ─────────────────────────────────────────────────────────────
// EXIF Orientation
// ─────────────────────────────────────────────────────────────

function isExifOrientation(v: number): v is ExifOrientation {
  return Number.isInteger(v) && v >= 1 && v <= 8;
}

const TAG_ORIENTATION = 0x0112;

/** APP1/Exif 세그먼트 안의 TIFF 헤더에서 Orientation 태그만 뽑아냅니다. */
function readOrientationFromExifSegment(bytes: Uint8Array, segStart: number, segEnd: number): ExifOrientation {
  // segStart: 0xFF 0xE1 위치. +4 = 세그먼트 페이로드, "Exif\0\0"(6바이트) 뒤가 TIFF 헤더.
  const tiffStart = segStart + 4 + 6;
  const tiffLength = segEnd - tiffStart;
  if (tiffLength < 8) return 1;

  const view = new DataView(bytes.buffer, bytes.byteOffset + tiffStart, tiffLength);
  const b0 = view.getUint8(0);
  const b1 = view.getUint8(1);
  let le: boolean;
  if (b0 === 0x49 && b1 === 0x49) le = true; // "II" intel
  else if (b0 === 0x4d && b1 === 0x4d) le = false; // "MM" motorola
  else return 1;

  if (view.getUint16(2, le) !== 0x002a) return 1;
  const ifd0 = view.getUint32(4, le);
  if (ifd0 + 2 > view.byteLength) return 1;

  const count = view.getUint16(ifd0, le);
  for (let n = 0; n < count; n++) {
    const entry = ifd0 + 2 + n * 12;
    if (entry + 12 > view.byteLength) break;
    if (view.getUint16(entry, le) !== TAG_ORIENTATION) continue;
    const type = view.getUint16(entry + 2, le);
    // SHORT(3)이 표준이지만 LONG(4)으로 쓰는 기기가 있습니다.
    const value = type === 4 ? view.getUint32(entry + 8, le) : view.getUint16(entry + 8, le);
    return isExifOrientation(value) ? value : 1;
  }
  return 1;
}

/**
 * 파일 바이트에서 EXIF Orientation을 읽습니다. 없으면 1.
 *
 * ⚠️ 이 값을 **먼저 읽어두는 것이 이 모듈의 핵심 함정 대응**입니다.
 * 메타데이터를 버리는 순간 Orientation도 함께 사라지므로, 회전 정보를
 * 픽셀 자체에 굽지 않으면 사진이 옆으로 누운 채 저장됩니다.
 */
export function readExifOrientation(bytes: Uint8Array): ExifOrientation {
  if (detectImageFormat(bytes) !== 'jpeg') return 1;
  const parsed = parseJpeg(bytes);
  if (!parsed.exifRange) return 1;
  return readOrientationFromExifSegment(bytes, parsed.exifRange[0], parsed.exifRange[1]);
}

/** Orientation 5~8은 가로·세로가 뒤바뀝니다. */
export function orientationSwapsAxes(orientation: ExifOrientation): boolean {
  return orientation >= 5;
}

// ─────────────────────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────────────────────

/**
 * 이미지 바이트를 스캔해 남아 있는 메타데이터를 열거합니다.
 * 던지지 않습니다 — 판단은 호출부(또는 assertNoMetadata)가 합니다.
 */
export function scanImageMetadata(bytes: Uint8Array): MetadataScanResult {
  const format = detectImageFormat(bytes);

  let parse: JpegParse;
  switch (format) {
    case 'jpeg':
      parse = parseJpeg(bytes);
      break;
    case 'png':
      parse = parsePng(bytes);
      break;
    case 'webp':
      parse = parseWebp(bytes);
      break;
    default:
      // GIF/HEIF/미상: 우리가 해석하지 못하는 컨테이너입니다.
      // "메타데이터가 없다"를 증명할 수 없으므로 parsed=false로 둡니다.
      parse = { findings: [], parsed: false, width: null, height: null, exifRange: null };
      break;
  }

  const orientation =
    format === 'jpeg' && parse.exifRange
      ? readOrientationFromExifSegment(bytes, parse.exifRange[0], parse.exifRange[1])
      : 1;

  return {
    format,
    parsed: parse.parsed,
    findings: parse.findings,
    hasPrivacyMetadata: parse.findings.some((f) => f.privacy),
    width: parse.width,
    height: parse.height,
    orientation,
  };
}

/**
 * 스캔 결과가 "메타데이터 없음"이 아니면 **던집니다**.
 *
 * 서버측 이중 방어(PLAN.md §5.2-3)에서 그대로 재사용하세요.
 * 클라이언트와 서버가 같은 함수로 판정해야 이중 방어가 성립합니다.
 */
export function assertNoMetadata(bytes: Uint8Array): MetadataScanResult {
  const result = scanImageMetadata(bytes);

  if (!result.parsed) {
    throw new ImagePipelineError(
      'unverifiable_format',
      `메타데이터 없음을 검증할 수 없는 형식입니다 (format=${result.format}). ` +
        '검증 불가는 안전으로 간주하지 않습니다.',
      result,
    );
  }

  if (result.hasPrivacyMetadata) {
    const kinds = result.findings.filter((f) => f.privacy).map((f) => f.kind).join(', ');
    throw new ImagePipelineError(
      'metadata_remains',
      `재인코딩 후에도 메타데이터가 남아 있습니다: ${kinds}. 업로드를 중단합니다.`,
      result,
    );
  }

  return result;
}
