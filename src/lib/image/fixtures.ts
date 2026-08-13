/**
 * 테스트 전용 이미지 바이트 픽스처 빌더.
 *
 * ⚠️ 앱 코드에서 import하지 마세요 — 테스트에서만 씁니다.
 *
 * 왜 실제 JPEG 파일을 놓지 않고 바이트를 조립하는가:
 *   ① 바이너리 파일은 리뷰에서 내용을 읽을 수 없습니다. "이 픽스처에 GPS가
 *      정말 들어 있나?"를 확인할 방법이 base64 덤프뿐이면 테스트를 믿기 어렵습니다.
 *   ② EXIF Orientation 6 + GPS IFD 같은 **정확한 조합**을 만들려면 조립이 유일합니다.
 *   ③ 브라우저 인코더 없이 node에서 돌아갑니다.
 */

function u16be(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function u16(n: number, le: boolean): number[] {
  return le ? [n & 0xff, (n >> 8) & 0xff] : u16be(n);
}

function u32(n: number, le: boolean): number[] {
  return le ? [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff] : u32be(n);
}

function chars(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0));
}

// ─────────────────────────────────────────────────────────────
// JPEG
// ─────────────────────────────────────────────────────────────

export const JPEG_SOI = [0xff, 0xd8];
export const JPEG_EOI = [0xff, 0xd9];

/** 임의의 APPn 세그먼트 */
export function jpegAppSegment(appNo: number, payload: number[]): number[] {
  const len = payload.length + 2;
  return [0xff, 0xe0 + appNo, ...u16be(len), ...payload];
}

/** 브라우저 인코더가 붙이는 무해한 APP0/JFIF */
export function jpegJfifSegment(): number[] {
  return jpegAppSegment(0, [
    ...chars('JFIF'), 0x00,
    0x01, 0x02, // 버전
    0x00,       // 단위 없음
    ...u16be(1), ...u16be(1), // 밀도
    0x00, 0x00, // 썸네일 없음
  ]);
}

/** 무해한 APP2/ICC_PROFILE (내용은 더미) */
export function jpegIccSegment(): number[] {
  return jpegAppSegment(2, [...chars('ICC_PROFILE'), 0x00, 0x01, 0x01, 0xde, 0xad, 0xbe, 0xef]);
}

export interface ExifFixtureOptions {
  /** 1~8. 기본 1 */
  orientation?: number;
  /** 리틀엔디안('II') 여부. 기본 true */
  littleEndian?: boolean;
  /** GPS IFD 포인터를 넣을지. 기본 false */
  withGps?: boolean;
}

/**
 * EXIF APP1 세그먼트를 조립합니다.
 * `withGps: true`면 GPS IFD 포인터(0x8825)와 실제 GPS IFD를 담습니다 —
 * 이 앱이 막으려는 바로 그 데이터입니다.
 */
export function jpegExifSegment(options: ExifFixtureOptions = {}): number[] {
  const orientation = options.orientation ?? 1;
  const le = options.littleEndian ?? true;
  const withGps = options.withGps ?? false;

  // IFD0 엔트리 (태그 오름차순)
  const entryCount = withGps ? 2 : 1;
  const ifd0Size = 2 + entryCount * 12 + 4;
  const gpsIfdOffset = 8 + ifd0Size; // TIFF 헤더 기준 오프셋

  const orientationEntry = [
    ...u16(0x0112, le), // Orientation
    ...u16(3, le),      // SHORT
    ...u32(1, le),      // count
    ...u16(orientation, le), 0x00, 0x00, // 값 4바이트 필드 (SHORT는 앞 2바이트)
  ];

  const gpsPointerEntry = [
    ...u16(0x8825, le), // GPSInfoIFDPointer
    ...u16(4, le),      // LONG
    ...u32(1, le),      // count
    ...u32(gpsIfdOffset, le),
  ];

  // GPS IFD — GPSLatitudeRef = "N"
  const gpsIfd = [
    ...u16(1, le),
    ...u16(0x0001, le),
    ...u16(2, le), // ASCII
    ...u32(2, le),
    ...chars('N'), 0x00, 0x00, 0x00,
    ...u32(0, le), // next IFD 없음
  ];

  const tiff = [
    ...(le ? chars('II') : chars('MM')),
    ...u16(0x002a, le),
    ...u32(8, le), // IFD0 오프셋
    ...u16(entryCount, le),
    ...orientationEntry,
    ...(withGps ? gpsPointerEntry : []),
    ...u32(0, le), // next IFD 없음
    ...(withGps ? gpsIfd : []),
  ];

  return jpegAppSegment(1, [...chars('Exif'), 0x00, 0x00, ...tiff]);
}

/** XMP는 EXIF와 별개로 GPS를 담을 수 있는 또 하나의 경로입니다. */
export function jpegXmpSegment(): number[] {
  return jpegAppSegment(1, [
    ...chars('http://ns.adobe.com/xap/1.0/'), 0x00,
    ...chars('<x:xmpmeta><exif:GPSLatitude>35,10.5N</exif:GPSLatitude></x:xmpmeta>'),
  ]);
}

/** APP13 Photoshop/IPTC */
export function jpegIptcSegment(): number[] {
  return jpegAppSegment(13, [...chars('Photoshop 3.0'), 0x00, 0x38, 0x42, 0x49, 0x4d]);
}

/** COM 주석 세그먼트 */
export function jpegComSegment(text: string): number[] {
  const payload = chars(text);
  return [0xff, 0xfe, ...u16be(payload.length + 2), ...payload];
}

/** SOF0 (baseline) — 스캐너가 원시 크기를 여기서 읽습니다 */
export function jpegSof0(width: number, height: number): number[] {
  const payload = [
    0x08, // 정밀도
    ...u16be(height),
    ...u16be(width),
    0x01, 0x01, 0x11, 0x00, // 컴포넌트 1개
  ];
  return [0xff, 0xc0, ...u16be(payload.length + 2), ...payload];
}

/** SOS + 가짜 엔트로피 데이터 */
export function jpegSos(): number[] {
  const payload = [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00];
  return [0xff, 0xda, ...u16be(payload.length + 2), ...payload, 0x12, 0x34, 0x56];
}

export interface JpegFixtureOptions {
  width?: number;
  height?: number;
  /** SOF 앞에 넣을 세그먼트들 */
  segments?: number[][];
  /** EOI 뒤에 덧붙일 트레일러 바이트 */
  trailer?: number[];
  /** EOI를 생략 (잘린 파일 시뮬레이션) */
  omitEoi?: boolean;
}

export function buildJpeg(options: JpegFixtureOptions = {}) {
  const width = options.width ?? 4;
  const height = options.height ?? 2;
  return new Uint8Array([
    ...JPEG_SOI,
    ...(options.segments ?? []).flat(),
    ...jpegSof0(width, height),
    ...jpegSos(),
    ...(options.omitEoi ? [] : JPEG_EOI),
    ...(options.trailer ?? []),
  ]);
}

/** Canvas 재인코딩 결과를 흉내 낸 "깨끗한" JPEG */
export function buildCleanJpeg(width = 1600, height = 1200) {
  return buildJpeg({ width, height, segments: [jpegJfifSegment()] });
}

// ─────────────────────────────────────────────────────────────
// PNG
// ─────────────────────────────────────────────────────────────

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function pngChunk(type: string, data: number[]): number[] {
  // CRC는 스캐너가 검사하지 않으므로 0으로 둡니다.
  return [...u32be(data.length), ...chars(type), ...data, 0, 0, 0, 0];
}

export function buildPng(options: { width?: number; height?: number; extraChunks?: number[][] } = {}) {
  const width = options.width ?? 8;
  const height = options.height ?? 4;
  const ihdr = pngChunk('IHDR', [...u32be(width), ...u32be(height), 8, 6, 0, 0, 0]);
  return new Uint8Array([
    ...PNG_SIG,
    ...ihdr,
    ...(options.extraChunks ?? []).flat(),
    ...pngChunk('IDAT', [0x78, 0x9c, 0x01]),
    ...pngChunk('IEND', []),
  ]);
}

// ─────────────────────────────────────────────────────────────
// WebP
// ─────────────────────────────────────────────────────────────

export function webpChunk(fourcc: string, data: number[]): number[] {
  const padded = data.length % 2 === 1 ? [...data, 0x00] : data;
  return [...chars(fourcc), ...u32(data.length, true), ...padded];
}

export function buildWebp(options: { extraChunks?: number[][] } = {}) {
  const vp8x = webpChunk('VP8X', [
    0x10, 0x00, 0x00, 0x00,
    0x0f, 0x00, 0x00, // 너비-1 = 15 → 16
    0x07, 0x00, 0x00, // 높이-1 = 7  → 8
  ]);
  const body = [...vp8x, ...(options.extraChunks ?? []).flat(), ...webpChunk('VP8 ', [0x01, 0x02, 0x03])];
  return new Uint8Array([...chars('RIFF'), ...u32(body.length + 4, true), ...chars('WEBP'), ...body]);
}

export function webpExifChunk(): number[] {
  return webpChunk('EXIF', [...chars('Exif'), 0x00, 0x00, 0x49, 0x49]);
}
