/**
 * 메타데이터 검증 함수 단위 테스트.
 *
 * 이 테스트가 이 트랙에서 가장 중요합니다. `assertNoMetadata`는 클라이언트의
 * 마지막 관문이자 서버측 이중 방어(PLAN.md §5.2-3)가 그대로 쓸 판정기라서,
 * 여기서 놓친 케이스는 곧바로 "아동 촬영 위치가 서버에 도착"으로 이어집니다.
 */

import { describe, expect, it } from 'vitest';

import { ImagePipelineError } from './errors';
import {
  assertNoMetadata,
  detectImageFormat,
  readExifOrientation,
  orientationSwapsAxes,
  scanImageMetadata,
} from './metadataScan';
import {
  buildCleanJpeg,
  buildJpeg,
  buildPng,
  buildWebp,
  jpegComSegment,
  jpegExifSegment,
  jpegIccSegment,
  jpegIptcSegment,
  jpegJfifSegment,
  jpegXmpSegment,
  pngChunk,
  webpExifChunk,
} from './fixtures';

describe('detectImageFormat', () => {
  it('매직 바이트로 형식을 판별한다', () => {
    expect(detectImageFormat(buildCleanJpeg())).toBe('jpeg');
    expect(detectImageFormat(buildPng())).toBe('png');
    expect(detectImageFormat(buildWebp())).toBe('webp');
  });

  it('HEIC(ftyp) 컨테이너를 알아본다 — iPhone 기본 촬영 형식', () => {
    const heic = new Uint8Array([
      0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, // 'ftyp'
      ...[...'heic'].map((c) => c.charCodeAt(0)),
      0, 0, 0, 0,
    ]);
    expect(detectImageFormat(heic)).toBe('heif');
  });

  it('MIME 타입이 아니라 바이트를 본다 — 확장자 위장에 속지 않는다', () => {
    expect(detectImageFormat(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBe('unknown');
  });
});

describe('scanImageMetadata — JPEG APP1 마커 탐지', () => {
  it('EXIF(APP1)가 있으면 개인정보 메타데이터로 잡는다', () => {
    const bytes = buildJpeg({ segments: [jpegExifSegment({ orientation: 6, withGps: true })] });
    const result = scanImageMetadata(bytes);

    expect(result.format).toBe('jpeg');
    expect(result.parsed).toBe(true);
    expect(result.hasPrivacyMetadata).toBe(true);
    expect(result.findings.map((f) => f.kind)).toContain('APP1/Exif');
  });

  it('XMP(APP1)도 잡는다 — EXIF만 지우면 GPS가 XMP로 남는다', () => {
    const bytes = buildJpeg({ segments: [jpegXmpSegment()] });
    const result = scanImageMetadata(bytes);
    expect(result.hasPrivacyMetadata).toBe(true);
    expect(result.findings.map((f) => f.kind)).toContain('APP1/XMP');
  });

  it('IPTC(APP13)와 COM 주석도 잡는다', () => {
    const bytes = buildJpeg({ segments: [jpegIptcSegment(), jpegComSegment('촬영: 온천천 3번 스팟')] });
    const kinds = scanImageMetadata(bytes).findings.map((f) => f.kind);
    expect(kinds).toContain('APP13/Photoshop 3.0');
    expect(kinds).toContain('COM');
  });

  it('Canvas 재인코딩 결과물(JFIF만 있는 JPEG)은 통과시킨다', () => {
    const result = scanImageMetadata(buildCleanJpeg(1600, 1200));
    expect(result.parsed).toBe(true);
    expect(result.hasPrivacyMetadata).toBe(false);
    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
  });

  it('APP0/JFIF와 APP2/ICC_PROFILE은 무해로 분류한다', () => {
    const bytes = buildJpeg({ segments: [jpegJfifSegment(), jpegIccSegment()] });
    const result = scanImageMetadata(bytes);
    expect(result.findings).toHaveLength(2);
    expect(result.findings.every((f) => !f.privacy)).toBe(true);
    expect(result.hasPrivacyMetadata).toBe(false);
  });

  it('EOI 뒤에 덧붙은 트레일러를 잡는다 — 원본 EXIF를 꼬리에 붙이는 도구가 있다', () => {
    const bytes = buildJpeg({ segments: [jpegJfifSegment()], trailer: [...jpegExifSegment()] });
    const result = scanImageMetadata(bytes);
    expect(result.hasPrivacyMetadata).toBe(true);
    expect(result.findings.map((f) => f.kind)).toContain('JPEG/trailer');
  });

  it('잘린/손상된 JPEG는 parsed=false — 검증 불가는 안전이 아니다', () => {
    const truncated = buildJpeg({ segments: [jpegJfifSegment()] }).slice(0, 10);
    expect(scanImageMetadata(truncated).parsed).toBe(false);

    const noScan = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9]);
    expect(scanImageMetadata(noScan).parsed).toBe(false);
  });
});

describe('scanImageMetadata — PNG', () => {
  it('깨끗한 PNG는 통과한다', () => {
    const result = scanImageMetadata(buildPng({ width: 320, height: 240 }));
    expect(result.parsed).toBe(true);
    expect(result.hasPrivacyMetadata).toBe(false);
    expect(result.width).toBe(320);
    expect(result.height).toBe(240);
  });

  it('eXIf · tEXt · 사설 청크를 모두 잡는다 (화이트리스트 정책)', () => {
    const bytes = buildPng({
      extraChunks: [
        pngChunk('eXIf', [0x49, 0x49, 0x2a, 0x00]),
        pngChunk('tEXt', [...'Comment'].map((c) => c.charCodeAt(0))),
        pngChunk('prVt', [1, 2, 3]),
      ],
    });
    const result = scanImageMetadata(bytes);
    const kinds = result.findings.map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(['PNG/eXIf', 'PNG/tEXt', 'PNG/prVt']));
    expect(result.hasPrivacyMetadata).toBe(true);
  });
});

describe('scanImageMetadata — WebP', () => {
  it('깨끗한 WebP는 통과한다', () => {
    const result = scanImageMetadata(buildWebp());
    expect(result.parsed).toBe(true);
    expect(result.hasPrivacyMetadata).toBe(false);
    expect(result.width).toBe(16);
    expect(result.height).toBe(8);
  });

  it('EXIF 청크를 잡는다', () => {
    const result = scanImageMetadata(buildWebp({ extraChunks: [webpExifChunk()] }));
    expect(result.hasPrivacyMetadata).toBe(true);
    expect(result.findings.map((f) => f.kind)).toContain('WEBP/EXIF');
  });
});

describe('readExifOrientation', () => {
  it('리틀엔디안(II) EXIF에서 Orientation을 읽는다', () => {
    const bytes = buildJpeg({ segments: [jpegExifSegment({ orientation: 6, littleEndian: true })] });
    expect(readExifOrientation(bytes)).toBe(6);
  });

  it('빅엔디안(MM) EXIF에서도 읽는다', () => {
    const bytes = buildJpeg({ segments: [jpegExifSegment({ orientation: 8, littleEndian: false })] });
    expect(readExifOrientation(bytes)).toBe(8);
  });

  it('GPS IFD가 함께 있어도 Orientation을 정확히 읽는다', () => {
    const bytes = buildJpeg({ segments: [jpegExifSegment({ orientation: 3, withGps: true })] });
    expect(readExifOrientation(bytes)).toBe(3);
  });

  it('EXIF가 없으면 1을 반환한다', () => {
    expect(readExifOrientation(buildCleanJpeg())).toBe(1);
    expect(readExifOrientation(buildPng())).toBe(1);
  });

  it('범위를 벗어난 값은 1로 떨어뜨린다', () => {
    const bytes = buildJpeg({ segments: [jpegExifSegment({ orientation: 99 })] });
    expect(readExifOrientation(bytes)).toBe(1);
  });

  it('5~8만 가로·세로가 뒤바뀐다', () => {
    expect([1, 2, 3, 4].every((o) => !orientationSwapsAxes(o as 1))).toBe(true);
    expect([5, 6, 7, 8].every((o) => orientationSwapsAxes(o as 5))).toBe(true);
  });
});

describe('assertNoMetadata — 마지막 관문', () => {
  it('깨끗한 이미지는 통과시킨다', () => {
    expect(() => assertNoMetadata(buildCleanJpeg())).not.toThrow();
    expect(() => assertNoMetadata(buildPng())).not.toThrow();
    expect(() => assertNoMetadata(buildWebp())).not.toThrow();
  });

  it('EXIF가 남아 있으면 metadata_remains로 던진다', () => {
    const bytes = buildJpeg({ segments: [jpegExifSegment({ withGps: true })] });
    expect(() => assertNoMetadata(bytes)).toThrow(ImagePipelineError);
    try {
      assertNoMetadata(bytes);
      expect.unreachable('던져야 합니다');
    } catch (e) {
      expect((e as ImagePipelineError).code).toBe('metadata_remains');
    }
  });

  it('파싱 불가 형식(HEIC 등)은 unverifiable_format으로 던진다 — 모르면 통과가 아니라 거부', () => {
    const heic = new Uint8Array([
      0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70,
      ...[...'heic'].map((c) => c.charCodeAt(0)),
      0, 0, 0, 0,
    ]);
    try {
      assertNoMetadata(heic);
      expect.unreachable('던져야 합니다');
    } catch (e) {
      expect((e as ImagePipelineError).code).toBe('unverifiable_format');
    }
  });

  it('빈 바이트도 거부한다', () => {
    expect(() => assertNoMetadata(new Uint8Array(0))).toThrow(ImagePipelineError);
  });
});
