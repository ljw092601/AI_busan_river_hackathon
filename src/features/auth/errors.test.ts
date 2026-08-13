/**
 * 오류 번역기 테스트.
 *
 * 가장 중요한 단언은 마지막 describe입니다 — **영어 원문이 화면으로 새지 않는가.**
 * "Invalid login credentials"를 그대로 보여주는 순간 이 트랙의 목적이 사라집니다.
 */

import { describe, expect, it } from 'vitest';
import { describeError } from './errors';

describe('describeError — Auth 오류 코드', () => {
  it('잘못된 자격증명을 한국어 안내로 바꾸고 다음 행동을 알려준다', () => {
    const r = describeError({ code: 'invalid_credentials', message: 'Invalid login credentials' });
    expect(r.kind).toBe('invalid_credentials');
    expect(r.message).toContain('비밀번호');
    expect(r.hint).toBeTruthy();
  });

  it('이메일 미인증은 "메일 링크를 눌러라"까지 안내한다', () => {
    const r = describeError({ code: 'email_not_confirmed', message: 'Email not confirmed' });
    expect(r.kind).toBe('email_not_confirmed');
    expect(r.hint).toContain('링크');
  });

  it('이미 가입된 이메일은 로그인으로 유도한다', () => {
    expect(describeError({ code: 'user_already_exists' }).kind).toBe('user_already_exists');
    expect(describeError({ message: 'User already registered' }).kind).toBe('user_already_exists');
  });

  it('약한 비밀번호 · 이메일 형식 · 가입 중지를 각각 구분한다', () => {
    expect(describeError({ code: 'weak_password' }).kind).toBe('weak_password');
    expect(describeError({ code: 'validation_failed' }).kind).toBe('invalid_email');
    expect(describeError({ message: 'Signups not allowed for this instance' }).kind).toBe(
      'signup_disabled',
    );
  });

  it('레이트리밋은 코드로도 429로도 잡는다', () => {
    expect(describeError({ code: 'over_email_send_rate_limit' }).kind).toBe('rate_limited');
    expect(describeError({ status: 429, message: 'Too many requests' }).kind).toBe('rate_limited');
  });
});

describe('describeError — 문구 매칭 폴백', () => {
  it('code가 없어도 메시지로 판정한다 (구버전 supabase-js 대비)', () => {
    expect(describeError({ message: 'Invalid login credentials' }).kind).toBe('invalid_credentials');
    expect(describeError({ message: 'Email not confirmed' }).kind).toBe('email_not_confirmed');
  });
});

describe('describeError — 네트워크', () => {
  it('fetch 실패(TypeError)를 하천변 통신 안내로 바꾼다', () => {
    const r = describeError(new TypeError('Failed to fetch'));
    expect(r.kind).toBe('network');
    expect(r.hint).toContain('하천');
  });

  it('supabase-js의 AuthRetryableFetchError도 네트워크로 본다', () => {
    expect(describeError({ name: 'AuthRetryableFetchError', message: 'request failed' }).kind).toBe(
      'network',
    );
  });
});

describe('describeError — Postgres/PostgREST 오류', () => {
  it('23505(중복)는 "이미 만들어짐"으로 안내한다 — 실패가 아닙니다', () => {
    expect(describeError({ code: '23505', message: 'duplicate key value' }).kind).toBe('duplicate');
  });

  it('42501(권한)과 RLS 403은 권한 안내로 모인다', () => {
    expect(describeError({ code: '42501' }).kind).toBe('permission');
    expect(describeError({ status: 403, message: 'permission denied' }).kind).toBe('permission');
  });

  it('CHECK 위반은 별명 길이 규칙을 알려준다', () => {
    const r = describeError({ code: '23514', message: 'users_nickname_check' });
    expect(r.kind).toBe('constraint');
    expect(r.hint).toContain('20자');
  });
});

describe('describeError — 알 수 없는 오류', () => {
  it('원문은 detail로만 보관하고 message는 한국어로 준다', () => {
    const r = describeError({ message: 'Something exploded in the gateway' });
    expect(r.kind).toBe('unknown');
    expect(r.message).not.toContain('exploded');
    expect(r.detail).toBe('Something exploded in the gateway');
  });

  it('문자열·null 같은 이상한 throw도 죽지 않는다', () => {
    expect(describeError(null).kind).toBe('unknown');
    expect(describeError('boom').kind).toBe('unknown');
    expect(describeError(undefined).message).toBeTruthy();
  });
});

describe('★ 영어 원문이 화면 문구로 새지 않는다', () => {
  const RAW = [
    { code: 'invalid_credentials', message: 'Invalid login credentials' },
    { code: 'email_not_confirmed', message: 'Email not confirmed' },
    { code: 'user_already_exists', message: 'User already registered' },
    { code: 'weak_password', message: 'Password should be at least 6 characters' },
    { code: '23505', message: 'duplicate key value violates unique constraint' },
    { code: '42501', message: 'new row violates row-level security policy' },
  ];

  it.each(RAW)('$code → message/hint에 원문이 없고 한글이 있다', (raw) => {
    const r = describeError(raw);
    const shown = `${r.message} ${r.hint ?? ''}`;
    expect(shown).not.toContain(raw.message);
    expect(shown).toMatch(/[가-힣]/);
    expect(r.detail).toBeUndefined(); // 번역에 성공했으면 원문을 덧붙이지 않습니다
  });
});
