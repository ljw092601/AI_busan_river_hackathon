import { describe, expect, it } from 'vitest';
import {
  collectTarget,
  isCollectComplete,
  isCompleteWith,
  matchesTextAnswer,
  normalizeAnswer,
} from './logic';
import { makeQuiz, makeRiver } from '../fixtures';

describe('normalizeAnswer', () => {
  it('앞뒤 공백을 무시한다', () => {
    expect(normalizeAnswer('  복개  ')).toBe('복개');
  });

  it('가운데 연속 공백은 하나로 줄인다', () => {
    expect(normalizeAnswer('복 개')).toBe('복 개');
    expect(normalizeAnswer('복   개')).toBe('복 개');
  });

  it('한글 조합 방식(NFD)이 달라도 같은 값이 된다', () => {
    // 같은 글자지만 IME/OS에 따라 코드포인트가 달라질 수 있습니다.
    expect(normalizeAnswer('복개'.normalize('NFD'))).toBe(normalizeAnswer('복개'));
  });

  it('알파벳은 대소문자를 가리지 않는다', () => {
    expect(normalizeAnswer('Otter')).toBe('otter');
  });
});

describe('matchesTextAnswer', () => {
  const accept = ['복개', '복개천', '복개(覆蓋)'];

  it('허용 답안과 정확히 같으면 통과', () => {
    expect(matchesTextAnswer('복개', accept)).toBe(true);
  });

  it('공백이 붙어도 통과', () => {
    expect(matchesTextAnswer('  복개천 ', accept)).toBe(true);
  });

  it('괄호·한자처럼 의미 있는 글자는 지우지 않는다', () => {
    expect(matchesTextAnswer('복개(覆蓋)', accept)).toBe(true);
    expect(matchesTextAnswer('복개覆蓋', accept)).toBe(false);
  });

  it('다른 낱말은 통과하지 않는다', () => {
    expect(matchesTextAnswer('복원', accept)).toBe(false);
  });

  it('빈 입력은 언제나 오답', () => {
    expect(matchesTextAnswer('   ', accept)).toBe(false);
  });

  it('accept가 없으면 어떤 입력도 통과하지 않는다', () => {
    expect(matchesTextAnswer('복개', undefined)).toBe(false);
    expect(matchesTextAnswer('복개', [])).toBe(false);
  });
});

describe('collectTarget', () => {
  it('target이 있으면 그 값을 쓴다', () => {
    expect(collectTarget({ items: ['🥤', '🛍️', '🥫'], target: 2 })).toBe(2);
  });

  it('target이 없으면 항목 전부', () => {
    expect(collectTarget({ items: ['🥤', '🛍️'] })).toBe(2);
  });

  it('항목보다 큰 target은 항목 수로 깎는다 — 아니면 영원히 못 끝낸다', () => {
    expect(collectTarget({ items: ['🥤'], target: 9 })).toBe(1);
  });

  it('0이나 음수도 최소 1로 올린다 — 아니면 열자마자 완료된다', () => {
    expect(collectTarget({ items: ['🥤', '🛍️'], target: 0 })).toBe(1);
  });
});

describe('isCollectComplete', () => {
  it('목표에 도달하면 완료', () => {
    expect(isCollectComplete(2, 3)).toBe(false);
    expect(isCollectComplete(3, 3)).toBe(true);
    expect(isCollectComplete(4, 3)).toBe(true);
  });
});

describe('isCompleteWith', () => {
  const quizzes = [makeQuiz({ id: 'a' }), makeQuiz({ id: 'b' })];

  it('미션과 퀴즈가 둘 다 있으면 둘 다 끝내야 완수 (온천천·대천천)', () => {
    const river = makeRiver({ missionKind: 'tap_target', quizzes });
    expect(isCompleteWith(river, true, new Set(['a', 'b']))).toBe(true);
    expect(isCompleteWith(river, false, new Set(['a', 'b']))).toBe(false);
    expect(isCompleteWith(river, true, new Set(['a']))).toBe(false);
  });

  it('미션이 없는 하천은 퀴즈만 다 풀면 완수 (수영강·부전천)', () => {
    const river = makeRiver({ missionKind: null, hasMission: false, quizzes });
    expect(isCompleteWith(river, false, new Set(['a', 'b']))).toBe(true);
    expect(isCompleteWith(river, false, new Set(['a']))).toBe(false);
  });

  it('퀴즈가 없는 하천은 미션만 끝내면 완수 (동천)', () => {
    const river = makeRiver({ missionKind: 'collect', quizzes: [] });
    expect(isCompleteWith(river, true, new Set())).toBe(true);
    expect(isCompleteWith(river, false, new Set())).toBe(false);
  });

  it('다른 하천의 정답 id가 섞여 있어도 영향받지 않는다', () => {
    const river = makeRiver({ missionKind: 'tap_target', quizzes });
    expect(isCompleteWith(river, true, new Set(['a', 'zzz']))).toBe(false);
  });
});
