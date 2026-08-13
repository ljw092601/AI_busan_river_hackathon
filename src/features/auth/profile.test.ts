/**
 * 프로필 부트스트랩 테스트 — 가짜 Supabase 클라이언트 대상.
 *
 * ⚠️ 이 파일은 `@/lib/supabase`를 import하지 않습니다.
 *    그 모듈은 import 시점에 VITE_ 환경변수를 검사하고 없으면 throw 하는데,
 *    테스트 환경에는 .env.local이 없어 파일 전체가 죽습니다.
 *    그래서 profile.ts는 클라이언트를 **인자로 받도록** 설계했습니다.
 *
 * 여기서 검증하는 것은 "네트워크가 잘 된다"가 아니라
 * **어떤 순서로, 어떤 모양의 요청을, 몇 번 보내는가**입니다. 그게 RLS를 통과시키는 부분입니다.
 * 실제 Supabase 응답을 대상으로는 검증하지 못했습니다(§보고).
 */

import { describe, expect, it } from 'vitest';
import { avatarFromSeed, ensureGuardianProfile, newUuid, randomAvatarSeed } from './profile';
import type { AuthClient, GuardianProfile, GuardianProfileInput } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// 가짜 클라이언트
// ─────────────────────────────────────────────────────────────────────────────

interface RecordedCall {
  table: string;
  op: 'select' | 'insert' | 'update';
  payload?: Record<string, unknown>;
  /** insert/update 뒤에 이어 붙은 체이닝 — `.select()` 여부를 확인하려고 남깁니다 */
  chained: string[];
}

type Responder = (call: RecordedCall) => { data?: unknown; error?: unknown };

function createFakeClient(respond: Responder) {
  const calls: RecordedCall[] = [];

  function builder(call: RecordedCall) {
    const api = {
      select(..._args: unknown[]) {
        call.chained.push('select');
        return api;
      },
      eq(..._args: unknown[]) {
        call.chained.push('eq');
        return api;
      },
      single() {
        call.chained.push('single');
        return api;
      },
      maybeSingle() {
        call.chained.push('maybeSingle');
        return api;
      },
      then<T>(
        onFulfilled?: (v: { data: unknown; error: unknown }) => T,
        onRejected?: (e: unknown) => T,
      ) {
        const r = respond(call);
        return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(
          onFulfilled,
          onRejected,
        );
      },
    };
    return api;
  }

  const client = {
    from(table: string) {
      return {
        select(..._args: unknown[]) {
          const call: RecordedCall = { table, op: 'select', chained: [] };
          calls.push(call);
          return builder(call);
        },
        insert(payload: Record<string, unknown>) {
          const call: RecordedCall = { table, op: 'insert', payload, chained: [] };
          calls.push(call);
          return builder(call);
        },
        update(payload: Record<string, unknown>) {
          const call: RecordedCall = { table, op: 'update', payload, chained: [] };
          calls.push(call);
          return builder(call);
        },
      };
    },
  };

  return { client: client as unknown as AuthClient, calls };
}

const USER_ID = '11111111-2222-3333-4444-555555555555';

const INPUT: GuardianProfileInput = {
  nickname: '  온천천탐험대  ',
  gradeBand: 'g3_4',
  scope: { service: true, photo_upload: true, public_gallery: false },
};

function profileRow(over: Partial<GuardianProfile> = {}): GuardianProfile {
  return {
    id: USER_ID,
    nickname: '온천천탐험대',
    avatar_seed: 'seed',
    grade_band: 'g3_4',
    consent_id: null,
    expert_program: false,
    created_at: '2026-08-14T00:00:00Z',
    updated_at: '2026-08-14T00:00:00Z',
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ensureGuardianProfile — (a) 아무것도 없는 새 계정', () => {
  it('동의 → 프로필 순서로 만들고 created=true를 돌려준다', async () => {
    const { client, calls } = createFakeClient((call) => {
      if (call.table === 'users' && call.op === 'select') return { data: null };
      if (call.table === 'consents') return {};
      return { data: profileRow({ consent_id: 'c1' }) };
    });

    const result = await ensureGuardianProfile(client, USER_ID, INPUT);

    expect(result.created).toBe(true);
    expect(result.consentCreated).toBe(true);
    expect(calls.map((c) => `${c.table}.${c.op}`)).toEqual([
      'users.select',
      'consents.insert', // ★ consents가 먼저 — users.consent_id가 이걸 참조합니다
      'users.insert',
    ]);
  });

  it('★ consents INSERT에 .select()를 붙이지 않는다 (RLS RETURNING 함정)', async () => {
    // consents_select_linked는 "users가 이 동의를 가리킬 때"만 조회를 허용합니다.
    // 방금 만든 행은 아직 아무도 가리키지 않으므로 RETURNING이 정책에 걸립니다.
    const { client, calls } = createFakeClient((call) => {
      if (call.table === 'users' && call.op === 'select') return { data: null };
      if (call.table === 'consents') return {};
      return { data: profileRow({ consent_id: 'c1' }) };
    });

    await ensureGuardianProfile(client, USER_ID, INPUT);

    const consentInsert = calls.find((c) => c.table === 'consents')!;
    expect(consentInsert.chained).not.toContain('select');
    // id를 클라이언트에서 만들어 넣습니다 — RETURNING 없이 users와 이어붙이려면 이 방법뿐입니다.
    expect(consentInsert.payload?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(consentInsert.payload?.method).toBe('in_app');
    expect(consentInsert.payload?.scope).toEqual(INPUT.scope);
  });

  it('users INSERT는 방금 만든 consent_id를 물고 들어간다', async () => {
    const { client, calls } = createFakeClient((call) => {
      if (call.table === 'users' && call.op === 'select') return { data: null };
      if (call.table === 'consents') return {};
      return { data: profileRow({ consent_id: 'c1' }) };
    });

    await ensureGuardianProfile(client, USER_ID, INPUT);

    const consentId = calls.find((c) => c.table === 'consents')!.payload?.id;
    const userInsert = calls.find((c) => c.table === 'users' && c.op === 'insert')!;
    expect(userInsert.payload?.consent_id).toBe(consentId);
    expect(userInsert.payload?.id).toBe(USER_ID);
  });

  it('★ expert_program을 절대 보내지 않는다 (저서생물 카드 자가 해금 방지)', async () => {
    const { client, calls } = createFakeClient((call) => {
      if (call.table === 'users' && call.op === 'select') return { data: null };
      if (call.table === 'consents') return {};
      return { data: profileRow({ consent_id: 'c1' }) };
    });

    await ensureGuardianProfile(client, USER_ID, INPUT);

    for (const call of calls) {
      expect(Object.keys(call.payload ?? {})).not.toContain('expert_program');
    }
  });

  it('별명 앞뒤 공백을 정리하고, 학년대역 null(건너뛰기)도 그대로 보낸다', async () => {
    const { client, calls } = createFakeClient((call) => {
      if (call.table === 'users' && call.op === 'select') return { data: null };
      if (call.table === 'consents') return {};
      return { data: profileRow({ consent_id: 'c1' }) };
    });

    await ensureGuardianProfile(client, USER_ID, { ...INPUT, gradeBand: null });

    const userInsert = calls.find((c) => c.table === 'users' && c.op === 'insert')!;
    expect(userInsert.payload?.nickname).toBe('온천천탐험대');
    expect(userInsert.payload?.grade_band).toBeNull();
    expect(userInsert.payload?.avatar_seed).toEqual(expect.any(String));
  });
});

describe('ensureGuardianProfile — (b) 프로필은 있는데 동의만 없는 상태', () => {
  it('동의를 만들어 연결하고 created=false를 돌려준다', async () => {
    const { client, calls } = createFakeClient((call) => {
      if (call.table === 'users' && call.op === 'select') return { data: profileRow() };
      if (call.table === 'consents') return {};
      return { data: profileRow({ consent_id: 'c9' }) };
    });

    const result = await ensureGuardianProfile(client, USER_ID, INPUT);

    expect(result.created).toBe(false);
    expect(result.consentCreated).toBe(true);
    expect(result.profile.consent_id).toBe('c9');
    expect(calls.map((c) => `${c.table}.${c.op}`)).toEqual([
      'users.select',
      'consents.insert',
      'users.update', // INSERT가 아니라 UPDATE — 중복 키로 죽지 않습니다
    ]);
  });
});

describe('ensureGuardianProfile — (c) 이미 완성된 계정 (멱등성)', () => {
  it('아무것도 쓰지 않고 기존 행을 그대로 돌려준다', async () => {
    const existing = profileRow({ consent_id: 'c1', nickname: '기존별명', grade_band: 'g5_6' });
    const { client, calls } = createFakeClient(() => ({ data: existing }));

    const result = await ensureGuardianProfile(client, USER_ID, INPUT);

    expect(result).toEqual({ profile: existing, created: false, consentCreated: false });
    // ★ 조회 1번이 전부입니다. 복구 호출이 기존 별명·학년대역을 덮어쓰면 조용한 데이터 손실입니다.
    expect(calls).toHaveLength(1);
    expect(result.profile.nickname).toBe('기존별명');
  });

  it('여러 번 불러도 결과가 같다', async () => {
    const existing = profileRow({ consent_id: 'c1' });
    const { client, calls } = createFakeClient(() => ({ data: existing }));

    const a = await ensureGuardianProfile(client, USER_ID, INPUT);
    const b = await ensureGuardianProfile(client, USER_ID, INPUT);

    expect(a).toEqual(b);
    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0);
  });
});

describe('ensureGuardianProfile — (d) 다른 탭과 경합', () => {
  it('23505(중복 키)는 오류가 아니라 정상 경로로 흡수한다', async () => {
    const winner = profileRow({ consent_id: 'c-other', nickname: '먼저만든쪽' });
    let userSelects = 0;

    const { client } = createFakeClient((call) => {
      if (call.table === 'users' && call.op === 'select') {
        userSelects += 1;
        // 첫 조회에는 없었는데, INSERT 사이에 다른 탭이 만들었습니다.
        return { data: userSelects === 1 ? null : winner };
      }
      if (call.table === 'consents') return {};
      return { error: { code: '23505', message: 'duplicate key value' } };
    });

    const result = await ensureGuardianProfile(client, USER_ID, INPUT);

    expect(result.created).toBe(false);
    expect(result.profile.nickname).toBe('먼저만든쪽');
  });

  it('중복이 아닌 오류(권한 등)는 삼키지 않고 그대로 던진다', async () => {
    const { client } = createFakeClient((call) => {
      if (call.table === 'users' && call.op === 'select') return { data: null };
      if (call.table === 'consents') return {};
      return { error: { code: '42501', message: 'row-level security' } };
    });

    await expect(ensureGuardianProfile(client, USER_ID, INPUT)).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('동의 INSERT가 실패하면 users는 건드리지 않는다', async () => {
    const { client, calls } = createFakeClient((call) => {
      if (call.table === 'users' && call.op === 'select') return { data: null };
      return { error: { code: '42501', message: 'denied' } };
    });

    await expect(ensureGuardianProfile(client, USER_ID, INPUT)).rejects.toBeTruthy();
    expect(calls.some((c) => c.table === 'users' && c.op === 'insert')).toBe(false);
  });
});

describe('아바타 · UUID', () => {
  it('같은 시드는 언제나 같은 아바타를 만든다 (서버에는 시드만 저장)', () => {
    expect(avatarFromSeed('abc123')).toEqual(avatarFromSeed('abc123'));
    expect(avatarFromSeed('abc123').hue).toBeGreaterThanOrEqual(0);
    expect(avatarFromSeed('abc123').hue).toBeLessThan(360);
    expect(avatarFromSeed('').emoji).toBeTruthy(); // 빈 시드에도 죽지 않습니다
  });

  it('시드가 다르면 대체로 다른 아바타가 나온다', () => {
    const emojis = new Set(Array.from({ length: 40 }, () => avatarFromSeed(newUuid()).emoji));
    expect(emojis.size).toBeGreaterThan(3);
  });

  it('avatar_seed는 DB 기본값과 같은 모양(하이픈 없는 32자 hex)이다', () => {
    expect(randomAvatarSeed()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('newUuid는 v4 형식이고 매번 다르다', () => {
    expect(newUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(Array.from({ length: 100 }, newUuid)).size).toBe(100);
  });
});
