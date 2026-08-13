/**
 * 도착 이미지의 메타데이터 잔존 검사 — 이중 방어 (PLAN.md §5.2-3, §7.5 제약 ③)
 *
 * ★ 왜 서버가 또 검사하는가
 *   EXIF 제거는 **기기에서, 업로드 전에** 끝나야 합니다(src/lib/image/). 서버에 도착한
 *   뒤에 지우면 이미 좌표를 수신·처리한 것이 되고, 체크인에서 좌표를 버린 설계가
 *   사진으로 되살아납니다. 그래서 서버는 "지우기"가 아니라 **거부**합니다.
 *   한쪽(클라이언트 파이프라인)이 뚫려도 좌표가 외부 API로 나가지 않게 하는 층입니다.
 *
 * ★ 무엇을 거부하는가
 *   EXIF(GPS가 들어 있는 곳)만이 아니라 **XMP·IPTC 등 위치를 담을 수 있는 메타데이터 전반**을
 *   거부합니다. GPS는 EXIF 말고도 XMP(`exif:GPSLatitude`)에 들어갑니다.
 *   Canvas 재인코딩 산출물(JPEG=APP0 JFIF만, PNG=IHDR/IDAT/IEND만)은 여기에 걸리지 않으므로
 *   정상 경로에서 오탐이 나지 않습니다.
 *
 * ⚠ 이 검사는 "메타데이터가 있다/없다"만 판정합니다. 좌표 값을 읽지 않고, 읽어서도 안 됩니다.
 *   파싱해서 GPS 태그만 골라내려 하지 마세요 — 그 순간 이 함수가 좌표를 다루는 코드가 됩니다.
 */

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface MetadataScan {
  present: boolean;
  /** 무엇에 걸렸는지 (운영 로그용 태그. 좌표가 아니라 컨테이너 이름입니다) */
  marker?: string;
}

export function scanForMetadata(bytes: Uint8Array, mediaType: string): MetadataScan {
  switch (mediaType) {
    case 'image/jpeg':
      return scanJpeg(bytes);
    case 'image/png':
      return scanPng(bytes);
    case 'image/webp':
      return scanWebp(bytes);
    default:
      // 알 수 없는 형식은 검사할 수 없으므로 통과시키지 않습니다(호출부가 미리 막습니다).
      return { present: true, marker: 'unsupported_media_type' };
  }
}

// ─────────────────────────────────────────────────────────────
// JPEG — 마커 세그먼트 순회
// ─────────────────────────────────────────────────────────────

function scanJpeg(b: Uint8Array): MetadataScan {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) {
    return { present: true, marker: 'not_jpeg' };
  }

  let i = 2;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) {
      // 마커 정렬이 깨졌습니다. 신뢰할 수 없으므로 보수적으로 거부합니다.
      return { present: true, marker: 'malformed_jpeg' };
    }

    // 0xFF 패딩을 건너뛰고 실제 마커 바이트를 찾습니다.
    let j = i;
    while (j < b.length && b[j] === 0xff) j++;
    if (j >= b.length) break;
    const marker = b[j];
    i = j + 1;

    if (marker === 0xd9) break;            // EOI
    if (marker === 0xda) break;            // SOS — 이후는 압축 데이터
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // 길이 없는 마커

    if (i + 1 >= b.length) break;
    const length = (b[i] << 8) | b[i + 1];
    if (length < 2) return { present: true, marker: 'malformed_jpeg' };

    // APP1 = EXIF 또는 XMP,  APP13 = Photoshop IRB(IPTC) — 둘 다 위치를 담을 수 있습니다.
    if (marker === 0xe1) return { present: true, marker: 'jpeg_app1' };
    if (marker === 0xed) return { present: true, marker: 'jpeg_app13' };

    i += length;
  }

  return { present: false };
}

// ─────────────────────────────────────────────────────────────
// PNG — 청크 순회
// ─────────────────────────────────────────────────────────────

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** eXIf = EXIF, iTXt/tEXt/zTXt = XMP·주석이 들어가는 곳 */
const PNG_METADATA_CHUNKS = new Set(['eXIf', 'iTXt', 'tEXt', 'zTXt']);

function scanPng(b: Uint8Array): MetadataScan {
  if (b.length < 8 || !PNG_SIGNATURE.every((v, k) => b[k] === v)) {
    return { present: true, marker: 'not_png' };
  }

  let i = 8;
  while (i + 8 <= b.length) {
    const length = readUint32(b, i);
    const type = asciiAt(b, i + 4, 4);
    if (PNG_METADATA_CHUNKS.has(type)) {
      return { present: true, marker: `png_${type}` };
    }
    if (type === 'IEND') break;
    // length + type(4) + data + crc(4)
    const next = i + 8 + length + 4;
    if (next <= i || next > b.length) return { present: true, marker: 'malformed_png' };
    i = next;
  }

  return { present: false };
}

// ─────────────────────────────────────────────────────────────
// WebP — RIFF 청크 순회
// ─────────────────────────────────────────────────────────────

function scanWebp(b: Uint8Array): MetadataScan {
  if (b.length < 12 || asciiAt(b, 0, 4) !== 'RIFF' || asciiAt(b, 8, 4) !== 'WEBP') {
    return { present: true, marker: 'not_webp' };
  }

  let i = 12;
  while (i + 8 <= b.length) {
    const type = asciiAt(b, i, 4);
    const length = readUint32LE(b, i + 4);
    if (type === 'EXIF' || type === 'XMP ') {
      return { present: true, marker: `webp_${type.trim()}` };
    }
    const padded = length + (length % 2); // RIFF 청크는 짝수 정렬
    const next = i + 8 + padded;
    if (next <= i || next > b.length) return { present: true, marker: 'malformed_webp' };
    i = next;
  }

  return { present: false };
}

// ─────────────────────────────────────────────────────────────
// 바이트 헬퍼
// ─────────────────────────────────────────────────────────────

function readUint32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function readUint32LE(b: Uint8Array, o: number): number {
  return ((b[o + 3] << 24) | (b[o + 2] << 16) | (b[o + 1] << 8) | b[o]) >>> 0;
}

function asciiAt(b: Uint8Array, o: number, n: number): string {
  let s = '';
  for (let k = 0; k < n && o + k < b.length; k++) s += String.fromCharCode(b[o + k]);
  return s;
}

/** base64 → 바이트. 형식 오류는 null. */
export function decodeBase64(data: string): Uint8Array | null {
  try {
    const binary = atob(data);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
