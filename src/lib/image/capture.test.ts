/**
 * 촬영 입력 사전 검증 테스트.
 *
 * 검증 정책의 핵심: **큰 파일은 거부 대상이 아니라 압축 대상**입니다.
 * 하천변에서 "사진이 너무 커요"로 막히면 아이는 미션을 포기합니다.
 */

import { describe, expect, it } from 'vitest';

import {
  COMPRESSION_HINT_BYTES,
  createCaptureInput,
  MAX_INPUT_BYTES,
  validateCaptureFile,
} from './capture';

describe('validateCaptureFile', () => {
  it('일반적인 폰 사진(4MB JPEG)은 통과하고 압축 대상으로 표시한다', () => {
    const r = validateCaptureFile({ type: 'image/jpeg', size: 4 * 1024 * 1024 });
    expect(r.ok).toBe(true);
    expect(r.needsCompression).toBe(true);
    expect(r.error).toBeNull();
  });

  it('작은 이미지는 압축이 필수는 아니다', () => {
    const r = validateCaptureFile({ type: 'image/jpeg', size: COMPRESSION_HINT_BYTES - 1 });
    expect(r.ok).toBe(true);
    expect(r.needsCompression).toBe(false);
  });

  it('빈 파일은 거부한다', () => {
    const r = validateCaptureFile({ type: 'image/jpeg', size: 0 });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('empty_file');
    expect(r.message).toBeTruthy();
  });

  it('이미지가 아니면 거부한다', () => {
    const r = validateCaptureFile({ type: 'application/pdf', size: 1000 });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('unsupported_type');
  });

  it('타입이 비어 있어도 거부한다', () => {
    expect(validateCaptureFile({ type: '', size: 1000 }).error?.code).toBe('unsupported_type');
  });

  it('상한을 넘는 파일만 too_large로 거부한다 — 방어적 상한이지 사진 크기 제한이 아니다', () => {
    expect(validateCaptureFile({ type: 'image/jpeg', size: MAX_INPUT_BYTES }).ok).toBe(true);
    const r = validateCaptureFile({ type: 'image/jpeg', size: MAX_INPUT_BYTES + 1 });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('too_large');
  });

  it('HEIC는 거부하지 않고 riskyFormat으로만 표시한다 — iPhone 기본 형식이라 막으면 안 된다', () => {
    const r = validateCaptureFile({ type: 'image/heic', size: 3_000_000 });
    expect(r.ok).toBe(true);
    expect(r.riskyFormat).toBe(true);
  });

  it('대소문자가 섞인 MIME 타입도 처리한다', () => {
    expect(validateCaptureFile({ type: 'IMAGE/JPEG', size: 1000 }).ok).toBe(true);
  });
});

describe('createCaptureInput', () => {
  it('기본값은 후면 카메라 — 이 앱의 미션에 셀피는 없다 (PLAN.md §5.2-3)', () => {
    const input = createCaptureInput();
    expect(input.type).toBe('file');
    expect(input.accept).toBe('image/*');
    expect(input.getAttribute('capture')).toBe('environment');
    expect(input.multiple).toBe(false);
  });

  it('capture: false면 갤러리 선택도 허용된다', () => {
    expect(createCaptureInput({ capture: false }).hasAttribute('capture')).toBe(false);
  });
});
