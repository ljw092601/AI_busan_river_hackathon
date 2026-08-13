/**
 * 방향 보정·리사이즈의 순수 로직 + Blob 검증 헬퍼 테스트.
 *
 * Canvas 자체(디코드·인코딩)는 jsdom에 구현이 없어 단위 테스트 대상이 아닙니다.
 * 대신 **버그가 실제로 나는 지점**인 방향 변환 행렬과 크기 계산을 순수 함수로
 * 떼어내 여기서 검증합니다 — 방향 버그는 브라우저에서 "사진이 누웠다"로만
 * 드러나서 수동 확인 비용이 매우 큽니다.
 */

import { describe, expect, it } from 'vitest';

import { ImagePipelineError } from './errors';
import { readExifOrientation, scanImageMetadata } from './metadataScan';
import {
  fitWithinEdge,
  orientationTransform,
  PROBE_EXIF_APP1_ORIENTATION_6,
  scanBlobMetadata,
  verifyBlobStripped,
} from './stripMetadata';
import { buildCleanJpeg, buildJpeg, jpegExifSegment } from './fixtures';

/** 변환 행렬을 좌표 사상 함수로 바꿔 검산합니다 */
function mapPoint(
  matrix: [number, number, number, number, number, number],
  x: number,
  y: number,
): [number, number] {
  const [a, b, c, d, e, f] = matrix;
  return [a * x + c * y + e, b * x + d * y + f];
}

describe('orientationTransform', () => {
  const W = 400;
  const H = 300;

  it('Orientation 1은 항등 변환', () => {
    const t = orientationTransform(1, W, H);
    expect(t.canvasWidth).toBe(W);
    expect(t.canvasHeight).toBe(H);
    expect(mapPoint(t.matrix, 0, 0)).toEqual([0, 0]);
    expect(mapPoint(t.matrix, W, H)).toEqual([W, H]);
  });

  it('Orientation 5~8은 캔버스 가로·세로가 뒤바뀐다', () => {
    for (const o of [5, 6, 7, 8] as const) {
      const t = orientationTransform(o, W, H);
      expect(t.canvasWidth).toBe(H);
      expect(t.canvasHeight).toBe(W);
    }
  });

  it('Orientation 1~4는 캔버스 크기가 그대로다', () => {
    for (const o of [1, 2, 3, 4] as const) {
      const t = orientationTransform(o, W, H);
      expect(t.canvasWidth).toBe(W);
      expect(t.canvasHeight).toBe(H);
    }
  });

  it('Orientation 6 = 시계방향 90° — 원본 좌상단이 캔버스 우상단으로 간다', () => {
    const t = orientationTransform(6, W, H);
    expect(mapPoint(t.matrix, 0, 0)).toEqual([H, 0]); // 좌상 → 우상
    expect(mapPoint(t.matrix, W, 0)).toEqual([H, W]); // 우상 → 우하
    expect(mapPoint(t.matrix, 0, H)).toEqual([0, 0]); // 좌하 → 좌상
  });

  it('Orientation 8 = 반시계방향 90°', () => {
    const t = orientationTransform(8, W, H);
    expect(mapPoint(t.matrix, 0, 0)).toEqual([0, W]); // 좌상 → 좌하
    expect(mapPoint(t.matrix, W, 0)).toEqual([0, 0]); // 우상 → 좌상
  });

  it('Orientation 3 = 180° 회전', () => {
    const t = orientationTransform(3, W, H);
    expect(mapPoint(t.matrix, 0, 0)).toEqual([W, H]);
    expect(mapPoint(t.matrix, W, H)).toEqual([0, 0]);
  });

  it('Orientation 2 = 좌우 반전 (y는 그대로)', () => {
    const t = orientationTransform(2, W, H);
    expect(mapPoint(t.matrix, 0, 0)).toEqual([W, 0]);
    expect(mapPoint(t.matrix, W, 0)).toEqual([0, 0]);
  });

  it('Orientation 4 = 상하 반전 (x는 그대로)', () => {
    const t = orientationTransform(4, W, H);
    expect(mapPoint(t.matrix, 0, 0)).toEqual([0, H]);
  });

  it('모든 방향에서 원본 네 모서리가 캔버스 안에 정확히 들어간다', () => {
    for (const o of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      const t = orientationTransform(o, W, H);
      const corners = [
        mapPoint(t.matrix, 0, 0),
        mapPoint(t.matrix, W, 0),
        mapPoint(t.matrix, 0, H),
        mapPoint(t.matrix, W, H),
      ];
      const xs = corners.map((p) => p[0]);
      const ys = corners.map((p) => p[1]);
      expect(Math.min(...xs)).toBe(0);
      expect(Math.max(...xs)).toBe(t.canvasWidth);
      expect(Math.min(...ys)).toBe(0);
      expect(Math.max(...ys)).toBe(t.canvasHeight);
    }
  });
});

describe('fitWithinEdge', () => {
  it('긴 변을 1600으로 맞추고 비율을 유지한다 (PLAN.md §4.1)', () => {
    expect(fitWithinEdge(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithinEdge(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('작은 이미지는 확대하지 않는다 — 없는 화질을 만들 수는 없다', () => {
    expect(fitWithinEdge(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('maxEdge가 없으면 그대로 둔다', () => {
    expect(fitWithinEdge(4032, 3024, null)).toEqual({ width: 4032, height: 3024 });
  });

  it('극단적인 파노라마에서도 최소 1px을 보장한다', () => {
    const r = fitWithinEdge(10000, 3, 1600);
    expect(r.width).toBe(1600);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });
});

describe('PROBE_EXIF_APP1_ORIENTATION_6', () => {
  // 이 상수는 손으로 적은 바이트열입니다. 한 바이트만 틀려도 방향 탐침이
  // 조용히 "적용 안 함"으로 떨어지고, 그러면 일부 기기에서 사진이 눕습니다.
  it('픽스처 빌더가 만드는 EXIF와 바이트 단위로 동일하다', () => {
    expect(PROBE_EXIF_APP1_ORIENTATION_6).toEqual(
      jpegExifSegment({ orientation: 6, littleEndian: true, withGps: false }),
    );
  });

  it('실제로 Orientation 6으로 파싱된다', () => {
    const jpeg = buildJpeg({ width: 4, height: 2, segments: [PROBE_EXIF_APP1_ORIENTATION_6] });
    expect(readExifOrientation(jpeg)).toBe(6);
    expect(scanImageMetadata(jpeg).findings.map((f) => f.kind)).toContain('APP1/Exif');
  });
});

describe('verifyBlobStripped / scanBlobMetadata', () => {
  it('깨끗한 Blob은 통과한다', async () => {
    const blob = new Blob([buildCleanJpeg()], { type: 'image/jpeg' });
    const result = await verifyBlobStripped(blob);
    expect(result.hasPrivacyMetadata).toBe(false);
  });

  it('EXIF가 남은 Blob은 던진다 — 외부 라이브러리 출력을 믿지 않기 위한 관문', async () => {
    const bytes = buildJpeg({ segments: [jpegExifSegment({ withGps: true })] });
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    await expect(verifyBlobStripped(blob)).rejects.toBeInstanceOf(ImagePipelineError);
  });

  it('scanBlobMetadata는 던지지 않고 보고만 한다', async () => {
    const bytes = buildJpeg({ segments: [jpegExifSegment({ withGps: true })] });
    const result = await scanBlobMetadata(new Blob([bytes], { type: 'image/jpeg' }));
    expect(result.hasPrivacyMetadata).toBe(true);
  });
});
