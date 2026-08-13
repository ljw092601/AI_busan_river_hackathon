import { describe, expect, it } from 'vitest';
import { TIER_POINTS } from '../../types/domain';
import type { PointsLedgerEntry } from '../../types/domain';
import {
  appendIfNew,
  balance,
  balanceByReason,
  balanceOf,
  cohortTotal,
  createEntry,
  dedupeKey,
  isDuplicate,
  kstDateKey,
} from './ledger';
import type { CreateEntryInput } from './ledger';

/** 테스트는 id·시각을 항상 주입합니다 — 순수 함수를 결정적으로 검증하기 위해 */
let seq = 0;
function entry(input: Omit<CreateEntryInput, 'id'> & { id?: string }): PointsLedgerEntry {
  seq += 1;
  return createEntry({
    id: input.id ?? `e${seq}`,
    createdAt: input.createdAt ?? '2026-05-10T02:00:00.000Z',
    ...input,
  });
}

describe('balance', () => {
  it('빈 원장의 잔액은 0', () => {
    expect(balance([])).toBe(0);
  });

  it('잔액은 SUM(delta)다', () => {
    const ledger = [
      entry({ userId: 'u1', reason: 'checkin', refType: 'spot', refId: 's1' }),
      entry({ userId: 'u1', reason: 'quiz_correct', refType: 'quiz', refId: 'q1' }),
      entry({ userId: 'u1', reason: 'species_found', refType: 'species', refId: 'sp1', tier: 3 }),
    ];
    expect(balance(ledger)).toBe(10 + 15 + TIER_POINTS[3]);
  });

  it('사용자가 섞여 있어도 balanceOf가 자기 것만 센다', () => {
    const ledger = [
      entry({ userId: 'u1', reason: 'checkin', refType: 'spot', refId: 's1' }),
      entry({ userId: 'u2', reason: 'course_complete', refType: 'river', refId: 'r1' }),
    ];
    expect(balanceOf(ledger, 'u1')).toBe(10);
    expect(balanceOf(ledger, 'u2')).toBe(100);
    expect(balanceOf(ledger, 'u3')).toBe(0);
  });

  it('원장에 delta 0 항목이 섞여도 잔액이 흔들리지 않는다', () => {
    const ledger = [
      entry({ userId: 'u1', reason: 'species_found', refType: 'species', refId: 'sp1', tier: 4 }),
      entry({ userId: 'u1', reason: 'species_found', refType: 'correction:observation', refId: 'o1', delta: 0 }),
    ];
    expect(balance(ledger)).toBe(TIER_POINTS[4]);
  });
});

describe('balanceByReason', () => {
  it('모든 사유를 0으로 채워서 돌려준다', () => {
    const byReason = balanceByReason([]);
    expect(byReason.checkin).toBe(0);
    expect(byReason.species_found).toBe(0);
    expect(byReason.river_milestone).toBe(0);
    expect(Object.keys(byReason)).toHaveLength(8);
  });

  it('사유별 합이 전체 잔액과 같다', () => {
    const ledger = [
      entry({ userId: 'u1', reason: 'checkin', refType: 'spot', refId: 's1' }),
      entry({ userId: 'u1', reason: 'checkin', refType: 'spot', refId: 's2' }),
      entry({ userId: 'u1', reason: 'quiz_wrong', refType: 'quiz', refId: 'q1' }),
      entry({ userId: 'u1', reason: 'species_found', refType: 'species', refId: 'sp1', tier: 2 }),
    ];
    const byReason = balanceByReason(ledger);
    expect(byReason.checkin).toBe(20);
    expect(byReason.quiz_wrong).toBe(5);
    expect(byReason.species_found).toBe(TIER_POINTS[2]);
    expect(Object.values(byReason).reduce((a, b) => a + b, 0)).toBe(balance(ledger));
  });
});

describe('cohortTotal', () => {
  it('총합과 인원만 돌려준다 (개인 순위는 제공하지 않음 — PLAN.md §6.3)', () => {
    const ledger = [
      entry({ userId: 'u1', reason: 'checkin', refType: 'spot', refId: 's1' }),
      entry({ userId: 'u2', reason: 'checkin', refType: 'spot', refId: 's1' }),
      entry({ userId: 'u2', reason: 'checkin', refType: 'spot', refId: 's2' }),
    ];
    expect(cohortTotal(ledger)).toEqual({ total: 30, teamCount: 2 });
  });
});

describe('createEntry', () => {
  it('delta를 규칙에서 유도한다', () => {
    const e = entry({ userId: 'u1', reason: 'dex_set_complete', refType: 'dex_set', refId: 'waterbird_5' });
    expect(e.delta).toBe(80);
    expect(e.refType).toBe('dex_set');
    expect(e.refId).toBe('waterbird_5');
  });

  it('ref가 없으면 null로 정규화된다', () => {
    const e = entry({ userId: 'u1', reason: 'checkin' });
    expect(e.refType).toBeNull();
    expect(e.refId).toBeNull();
  });

  it('delta를 명시하면 규칙 계산을 건너뛴다 (정정 항목용)', () => {
    const e = entry({ userId: 'u1', reason: 'species_found', delta: 0 });
    expect(e.delta).toBe(0);
  });
});

describe('isDuplicate — 중복 적립 차단', () => {
  it('같은 스팟 체크인은 두 번 적립되지 않는다 (재방문해도)', () => {
    const first = entry({
      userId: 'u1', reason: 'checkin', refType: 'spot', refId: 's1',
      createdAt: '2026-05-10T02:00:00.000Z',
    });
    const revisit = entry({
      userId: 'u1', reason: 'checkin', refType: 'spot', refId: 's1',
      createdAt: '2026-11-20T02:00:00.000Z',
    });
    expect(isDuplicate([first], revisit)).toBe(true);
  });

  it('다른 스팟 체크인은 중복이 아니다', () => {
    const s1 = entry({ userId: 'u1', reason: 'checkin', refType: 'spot', refId: 's1' });
    const s2 = entry({ userId: 'u1', reason: 'checkin', refType: 'spot', refId: 's2' });
    expect(isDuplicate([s1], s2)).toBe(false);
  });

  it('다른 사용자는 중복이 아니다', () => {
    const a = entry({ userId: 'u1', reason: 'checkin', refType: 'spot', refId: 's1' });
    const b = entry({ userId: 'u2', reason: 'checkin', refType: 'spot', refId: 's1' });
    expect(isDuplicate([a], b)).toBe(false);
  });

  it('같은 종 재발견은 두 번 적립되지 않는다 (도감 카드가 종당 1장이므로)', () => {
    const first = entry({ userId: 'u1', reason: 'species_found', refType: 'species', refId: 'sp1', tier: 2 });
    const again = entry({
      userId: 'u1', reason: 'species_found', refType: 'species', refId: 'sp1', tier: 2,
      createdAt: '2026-08-01T02:00:00.000Z',
    });
    expect(isDuplicate([first], again)).toBe(true);
  });

  it('★ 오답 뒤 정답으로 재적립할 수 없다 (quiz_wrong·quiz_correct는 같은 판정 단위)', () => {
    const wrong = entry({ userId: 'u1', reason: 'quiz_wrong', refType: 'quiz', refId: 'q1' });
    const correct = entry({ userId: 'u1', reason: 'quiz_correct', refType: 'quiz', refId: 'q1' });
    expect(isDuplicate([wrong], correct)).toBe(true);

    // 규칙이 깨지면 5 + 15 = 20 > 15 가 되어 "일부러 틀리기"가 이득이 됩니다.
    const ledger = appendIfNew([wrong], {
      id: 'x', createdAt: '2026-05-10T03:00:00.000Z',
      userId: 'u1', reason: 'quiz_correct', refType: 'quiz', refId: 'q1',
    }).entries;
    expect(balance(ledger)).toBe(5);
  });

  it('다른 퀴즈는 중복이 아니다', () => {
    const q1 = entry({ userId: 'u1', reason: 'quiz_correct', refType: 'quiz', refId: 'q1' });
    const q2 = entry({ userId: 'u1', reason: 'quiz_correct', refType: 'quiz', refId: 'q2' });
    expect(isDuplicate([q1], q2)).toBe(false);
  });

  it('완주·세트·마일스톤도 1회만', () => {
    const done = entry({ userId: 'u1', reason: 'course_complete', refType: 'river', refId: 'oncheoncheon' });
    const dup = entry({
      userId: 'u1', reason: 'course_complete', refType: 'river', refId: 'oncheoncheon',
      createdAt: '2027-01-01T00:00:00.000Z',
    });
    expect(isDuplicate([done], dup)).toBe(true);
  });

  it('정정 항목(delta 0)은 이후의 정당한 적립을 막지 않는다', () => {
    const correction = entry({
      userId: 'u1', reason: 'species_found',
      refType: 'correction:observation', refId: 'sp1', delta: 0,
    });
    const award = entry({ userId: 'u1', reason: 'species_found', refType: 'species', refId: 'sp1', tier: 1 });
    expect(isDuplicate([correction], award)).toBe(false);
  });
});

describe('isDuplicate — 관찰 일지(observation_log)는 스팟당 하루 1회', () => {
  it('같은 날 같은 스팟의 두 번째 일지는 적립되지 않는다', () => {
    const a = entry({
      userId: 'u1', reason: 'observation_log', refType: 'spot', refId: 's1',
      createdAt: '2026-05-10T01:00:00.000Z', // KST 2026-05-10 10:00
    });
    const b = entry({
      userId: 'u1', reason: 'observation_log', refType: 'spot', refId: 's1',
      createdAt: '2026-05-10T07:00:00.000Z', // KST 2026-05-10 16:00
    });
    expect(isDuplicate([a], b)).toBe(true);
  });

  it('계절이 바뀌어 다시 오면 새로 적립된다 (재방문 설계 §7.7과 충돌하지 않게)', () => {
    const spring = entry({
      userId: 'u1', reason: 'observation_log', refType: 'spot', refId: 's1',
      createdAt: '2026-05-10T01:00:00.000Z',
    });
    const winter = entry({
      userId: 'u1', reason: 'observation_log', refType: 'spot', refId: 's1',
      createdAt: '2027-01-15T01:00:00.000Z',
    });
    expect(isDuplicate([spring], winter)).toBe(false);
  });

  it('같은 날이라도 스팟이 다르면 각각 적립된다', () => {
    const s1 = entry({ userId: 'u1', reason: 'observation_log', refType: 'spot', refId: 's1' });
    const s2 = entry({ userId: 'u1', reason: 'observation_log', refType: 'spot', refId: 's2' });
    expect(isDuplicate([s1], s2)).toBe(false);
  });

  it('KST 아침 활동이 전날로 밀리지 않는다 (UTC 날짜를 쓰면 깨지는 케이스)', () => {
    // 2026-05-10T00:30Z = KST 09:30 같은 날 아침
    // 2026-05-09T23:30Z = KST 08:30 같은 날 아침
    expect(kstDateKey('2026-05-09T23:30:00.000Z')).toBe('2026-05-10');
    expect(kstDateKey('2026-05-10T00:30:00.000Z')).toBe('2026-05-10');

    const early = entry({
      userId: 'u1', reason: 'observation_log', refType: 'spot', refId: 's1',
      createdAt: '2026-05-09T23:30:00.000Z',
    });
    const later = entry({
      userId: 'u1', reason: 'observation_log', refType: 'spot', refId: 's1',
      createdAt: '2026-05-10T00:30:00.000Z',
    });
    expect(isDuplicate([early], later)).toBe(true);
  });
});

describe('dedupeKey', () => {
  it('DB UNIQUE 인덱스로 옮길 수 있게 결정적 문자열을 만든다', () => {
    const e = entry({
      userId: 'u1', reason: 'quiz_correct', refType: 'quiz', refId: 'q1',
      createdAt: '2026-05-10T02:00:00.000Z',
    });
    expect(dedupeKey(e)).toBe('u1|quiz|quiz|q1|');
    expect(dedupeKey(e)).toBe(dedupeKey({ ...e, id: 'other', createdAt: '2027-01-01T00:00:00.000Z' } as PointsLedgerEntry));
  });
});

describe('appendIfNew', () => {
  it('중복이면 원장을 그대로 두고 skipped를 알린다', () => {
    const base = [entry({ userId: 'u1', reason: 'checkin', refType: 'spot', refId: 's1' })];
    const r = appendIfNew(base, {
      id: 'z', createdAt: '2026-06-01T02:00:00.000Z',
      userId: 'u1', reason: 'checkin', refType: 'spot', refId: 's1',
    });
    expect(r.skipped).toBe(true);
    expect(r.entry).toBeNull();
    expect(r.entries).toHaveLength(1);
    expect(balance(r.entries)).toBe(10);
  });

  it('원본 배열을 변경하지 않는다 (append-only)', () => {
    const base: PointsLedgerEntry[] = [];
    const r = appendIfNew(base, {
      id: 'z', createdAt: '2026-06-01T02:00:00.000Z',
      userId: 'u1', reason: 'checkin', refType: 'spot', refId: 's1',
    });
    expect(base).toHaveLength(0);
    expect(r.entries).toHaveLength(1);
    expect(r.skipped).toBe(false);
  });

  it('오프라인 큐가 같은 요청을 3번 재전송해도 10P만 적립된다', () => {
    let ledger: PointsLedgerEntry[] = [];
    for (let i = 0; i < 3; i += 1) {
      ledger = appendIfNew(ledger, {
        id: `dup${i}`, createdAt: '2026-06-01T02:00:00.000Z',
        userId: 'u1', reason: 'checkin', refType: 'spot', refId: 's1',
      }).entries;
    }
    expect(ledger).toHaveLength(1);
    expect(balance(ledger)).toBe(10);
  });
});
