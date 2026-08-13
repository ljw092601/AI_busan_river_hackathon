/**
 * 가입 흐름 판정 · 입력 검증 · 동의 항목 테스트.
 *
 * interpretSignUpResult는 이 트랙에서 가장 조용히 틀리는 지점입니다 —
 * 프로젝트 설정(Confirm email) 하나로 같은 코드가 다르게 동작하고,
 * 로컬에서 꺼두고 개발하면 켜져 있는 운영에서만 깨집니다. 그래서 세 갈래를 전부 고정합니다.
 */

import { describe, expect, it } from 'vitest';
import {
  CONSENT_ITEMS,
  NOT_COLLECTED,
  buildConsentScope,
  interpretSignUpResult,
  isConsentComplete,
  validateEmail,
  validateNickname,
  validatePassword,
} from './flow';

describe('interpretSignUpResult', () => {
  it('세션이 함께 오면 바로 로그인된 것이다 (Confirm email 꺼짐)', () => {
    const r = interpretSignUpResult({
      user: { identities: [{ id: 'i1' }] },
      session: { access_token: 'a' },
    });
    expect(r).toBe('session');
  });

  it('세션이 없으면 확인 메일 대기다 (Confirm email 켜짐)', () => {
    const r = interpretSignUpResult({ user: { identities: [{ id: 'i1' }] }, session: null });
    expect(r).toBe('confirm_email');
  });

  it('identities가 빈 배열이면 이미 가입된 이메일이다 — 성공처럼 보이지만 아니다', () => {
    const r = interpretSignUpResult({ user: { identities: [] }, session: null });
    expect(r).toBe('already_registered');
  });

  it('identities가 없는 응답을 already_registered로 오판하지 않는다', () => {
    // identities 필드가 아예 빠진 응답을 "빈 배열"과 같게 다루면
    // 정상 가입자에게 "이미 가입됨"이라고 말하게 됩니다.
    expect(interpretSignUpResult({ user: {}, session: null })).toBe('confirm_email');
    expect(interpretSignUpResult({ user: { identities: null }, session: { t: 1 } })).toBe('session');
  });

  it('user가 null이어도 세션 유무로 판정한다', () => {
    expect(interpretSignUpResult({ user: null, session: null })).toBe('confirm_email');
  });
});

describe('입력 검증', () => {
  it('이메일 오탈자를 서버에 다녀오기 전에 잡는다', () => {
    expect(validateEmail('parent@example.com')).toBeNull();
    expect(validateEmail('  parent@example.com  ')).toBeNull();
    expect(validateEmail('')).toBeTruthy();
    expect(validateEmail('parent@example')).toBeTruthy();
    expect(validateEmail('parent example.com')).toBeTruthy();
  });

  it('비밀번호는 8자 이상', () => {
    expect(validatePassword('12345678')).toBeNull();
    expect(validatePassword('1234567')).toContain('8자');
    expect(validatePassword('')).toBeTruthy();
  });

  it('별명은 1~20자 — DB CHECK 제약과 같은 규칙', () => {
    expect(validateNickname('온천천탐험대')).toBeNull();
    expect(validateNickname('   ')).toBeTruthy(); // 공백만 = 빈 값
    expect(validateNickname('가'.repeat(20))).toBeNull();
    expect(validateNickname('가'.repeat(21))).toBeTruthy();
  });

  it('검증 실패 메시지는 전부 한국어다', () => {
    const messages = [
      validateEmail('x'),
      validatePassword('1'),
      validateNickname(''),
    ].filter((m): m is string => m !== null);
    expect(messages).toHaveLength(3);
    for (const m of messages) expect(m).toMatch(/[가-힣]/);
  });
});

describe('동의 항목', () => {
  it('필수는 서비스 이용 하나뿐이다 — 사진·공개 갤러리는 선택', () => {
    const required = CONSENT_ITEMS.filter((i) => i.required).map((i) => i.key);
    expect(required).toEqual(['service']);
  });

  it('공개 갤러리는 기본으로 꺼져 있다 (PLAN.md §5.2-4)', () => {
    const gallery = CONSENT_ITEMS.find((i) => i.key === 'public_gallery');
    expect(gallery?.defaultChecked).toBe(false);
  });

  it('필수 항목을 빼면 진행되지 않는다', () => {
    expect(isConsentComplete({ service: true })).toBe(true);
    expect(isConsentComplete({ service: false, photo_upload: true })).toBe(false);
    expect(isConsentComplete({})).toBe(false);
  });

  it('scope는 체크 상태를 그대로 옮기고 빠진 항목은 false로 채운다', () => {
    expect(buildConsentScope({ service: true, photo_upload: true })).toEqual({
      service: true,
      photo_upload: true,
      public_gallery: false,
    });
    // undefined를 true로 흘려보내면 동의하지 않은 항목이 동의로 기록됩니다.
    expect(buildConsentScope({}).public_gallery).toBe(false);
    expect(buildConsentScope({}).photo_upload).toBe(false);
  });

  it('동의 문구가 스키마가 하지 않는 일을 약속하지 않는다', () => {
    const copy = [
      ...CONSENT_ITEMS.map((i) => `${i.label} ${i.detail}`),
      ...NOT_COLLECTED,
    ].join(' ');
    // 앱에는 계정 삭제·동의 철회 경로가 없습니다(consents에 UPDATE 권한조차 없음).
    expect(copy).not.toMatch(/언제든.*(삭제|철회|지울)/);
    // 보관 기간은 운영 주체가 정하는 값이라 여기서 숫자로 약속하지 않습니다.
    expect(copy).not.toMatch(/\d+일\s*(뒤|후)에?\s*(파기|삭제)/);
  });

  it('"받지 않는 것" 목록이 아이 정보와 좌표 미저장을 모두 말한다', () => {
    const joined = NOT_COLLECTED.join(' ');
    expect(joined).toContain('이름');
    expect(joined).toContain('좌표');
    expect(joined).toContain('얼굴');
  });
});
