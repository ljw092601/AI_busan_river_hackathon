/**
 * 채점 규칙과 상태 전이의 단위 테스트.
 * 렌더링 없이 순수 함수만 검증합니다.
 */

import { describe, expect, it } from 'vitest';
import { POINT_VALUES, type Quiz } from '@/types/domain';
import {
  buildResult,
  createInitialState,
  currentAnswer,
  currentQuiz,
  isLastQuestion,
  pointsForAnswer,
  quizReducer,
  reasonForAnswer,
  type QuizMachineState,
} from './quizMachine';
import { spot1Quizzes } from './mockQuizzes';

const AT = 1_700_000_000_000;

/** 3문항(3지선다 2 + O/X 1) 세트 — 실제 온천천 초안 문항 */
const quizzes: Quiz[] = spot1Quizzes;

function answerAll(indices: number[]): QuizMachineState {
  return indices.reduce<QuizMachineState>((state, selectedIdx) => {
    const answered = quizReducer(state, { type: 'answer', selectedIdx, at: AT });
    const viewed = quizReducer(answered, { type: 'explanation_viewed' });
    return quizReducer(viewed, { type: 'next' });
  }, createInitialState(quizzes));
}

describe('채점 규칙 (PLAN.md §6.1)', () => {
  it('정답은 15P, 오답은 5P — 오답에도 포인트를 준다', () => {
    expect(pointsForAnswer(true)).toBe(15);
    expect(pointsForAnswer(false)).toBe(5);
  });

  it('포인트 값은 도메인 상수와 일치한다 (규칙 이중 정의 방지)', () => {
    expect(pointsForAnswer(true)).toBe(POINT_VALUES.quiz_correct);
    expect(pointsForAnswer(false)).toBe(POINT_VALUES.quiz_wrong);
  });

  it('원장 사유(reason)를 정답/오답에 맞게 붙인다', () => {
    expect(reasonForAnswer(true)).toBe('quiz_correct');
    expect(reasonForAnswer(false)).toBe('quiz_wrong');
  });
});

describe('초기 상태', () => {
  it('문항이 있으면 첫 문항의 question 단계에서 시작한다', () => {
    const state = createInitialState(quizzes);
    expect(state.step).toBe('question');
    expect(state.index).toBe(0);
    expect(state.answers).toEqual([]);
    expect(currentQuiz(state)?.id).toBe(quizzes[0].id);
    expect(currentAnswer(state)).toBeUndefined();
  });

  it('문항이 없으면 곧바로 done', () => {
    const state = createInitialState([]);
    expect(state.step).toBe('done');
    expect(currentQuiz(state)).toBeUndefined();
    expect(isLastQuestion(state)).toBe(false);
  });
});

describe('응답 → 해설 전이', () => {
  it('정답을 고르면 explanation 단계로 가고 15P가 기록된다', () => {
    const state = quizReducer(createInitialState(quizzes), {
      type: 'answer',
      selectedIdx: quizzes[0].answerIdx,
      at: AT,
    });

    expect(state.step).toBe('explanation');
    expect(state.answers).toHaveLength(1);
    expect(state.answers[0]).toMatchObject({
      quizId: quizzes[0].id,
      spotId: quizzes[0].spotId,
      selectedIdx: quizzes[0].answerIdx,
      isCorrect: true,
      points: 15,
      reason: 'quiz_correct',
      explanationViewed: false,
      answeredAt: AT,
    });
  });

  it('오답을 골라도 explanation 단계로 가고 5P가 기록된다', () => {
    const wrongIdx = quizzes[0].answerIdx === 0 ? 1 : 0;
    const state = quizReducer(createInitialState(quizzes), {
      type: 'answer',
      selectedIdx: wrongIdx,
      at: AT,
    });

    expect(state.step).toBe('explanation');
    expect(state.answers[0]).toMatchObject({
      isCorrect: false,
      points: 5,
      reason: 'quiz_wrong',
    });
  });

  it('범위 밖 선택은 오답으로 처리한다', () => {
    const state = quizReducer(createInitialState(quizzes), {
      type: 'answer',
      selectedIdx: 99,
      at: AT,
    });
    expect(state.answers[0].isCorrect).toBe(false);
    expect(state.answers[0].points).toBe(5);
  });

  it('해설을 보는 중에는 답을 바꿀 수 없다 (중복 응답 무시)', () => {
    const first = quizReducer(createInitialState(quizzes), {
      type: 'answer',
      selectedIdx: 0,
      at: AT,
    });
    const second = quizReducer(first, { type: 'answer', selectedIdx: 2, at: AT });

    expect(second).toBe(first);
    expect(second.answers).toHaveLength(1);
  });
});

describe('해설 열람 기록 (PLAN.md §10 열람률)', () => {
  it('현재 문항의 응답에 열람 플래그를 세운다', () => {
    const answered = quizReducer(createInitialState(quizzes), {
      type: 'answer',
      selectedIdx: 0,
      at: AT,
    });
    const viewed = quizReducer(answered, { type: 'explanation_viewed' });

    expect(viewed.answers[0].explanationViewed).toBe(true);
  });

  it('두 번 이상 기록해도 상태가 바뀌지 않는다 (멱등 — 중복 집계 방지)', () => {
    const answered = quizReducer(createInitialState(quizzes), {
      type: 'answer',
      selectedIdx: 0,
      at: AT,
    });
    const once = quizReducer(answered, { type: 'explanation_viewed' });
    const twice = quizReducer(once, { type: 'explanation_viewed' });

    expect(twice).toBe(once);
  });

  it('응답 전(question 단계)에는 열람이 기록되지 않는다', () => {
    const initial = createInitialState(quizzes);
    expect(quizReducer(initial, { type: 'explanation_viewed' })).toBe(initial);
  });
});

describe('다음 문항 전이', () => {
  it('응답 전에는 다음으로 넘어가지 않는다', () => {
    const initial = createInitialState(quizzes);
    expect(quizReducer(initial, { type: 'next' })).toBe(initial);
  });

  it('해설을 거친 뒤 다음 문항의 question 단계로 간다', () => {
    const answered = quizReducer(createInitialState(quizzes), {
      type: 'answer',
      selectedIdx: 0,
      at: AT,
    });
    const next = quizReducer(answered, { type: 'next' });

    expect(next.index).toBe(1);
    expect(next.step).toBe('question');
    expect(currentAnswer(next)).toBeUndefined();
  });

  it('마지막 문항에서 next를 누르면 done', () => {
    const state = answerAll(quizzes.map((q) => q.answerIdx));
    expect(state.step).toBe('done');
    expect(state.index).toBe(quizzes.length - 1);
    expect(isLastQuestion(state)).toBe(true);
  });
});

describe('세션 결과 집계 (onComplete 페이로드)', () => {
  it('전부 정답이면 문항 수 × 15P', () => {
    const result = buildResult(answerAll(quizzes.map((q) => q.answerIdx)));

    expect(result.spotId).toBe(quizzes[0].spotId);
    expect(result.total).toBe(3);
    expect(result.answered).toBe(3);
    expect(result.correctCount).toBe(3);
    expect(result.wrongCount).toBe(0);
    expect(result.totalPoints).toBe(45);
    expect(result.explanationViewedCount).toBe(3);
    expect(result.explanationViewRate).toBe(1);
  });

  it('정답 1 + 오답 2 = 15 + 5 + 5 = 25P', () => {
    const picks = quizzes.map((q, i) => (i === 0 ? q.answerIdx : (q.answerIdx + 1) % q.options.length));
    const result = buildResult(answerAll(picks));

    expect(result.correctCount).toBe(1);
    expect(result.wrongCount).toBe(2);
    expect(result.totalPoints).toBe(25);
    expect(result.answers.map((a) => a.reason)).toEqual([
      'quiz_correct',
      'quiz_wrong',
      'quiz_wrong',
    ]);
  });

  it('해설을 건너뛴 문항이 있으면 열람률이 그만큼 내려간다', () => {
    let state = createInitialState(quizzes);
    // 1번: 해설 열람 O / 2번: 열람 기록 없음 / 3번: 열람 O
    state = quizReducer(state, { type: 'answer', selectedIdx: 0, at: AT });
    state = quizReducer(state, { type: 'explanation_viewed' });
    state = quizReducer(state, { type: 'next' });
    state = quizReducer(state, { type: 'answer', selectedIdx: 0, at: AT });
    state = quizReducer(state, { type: 'next' });
    state = quizReducer(state, { type: 'answer', selectedIdx: 0, at: AT });
    state = quizReducer(state, { type: 'explanation_viewed' });
    state = quizReducer(state, { type: 'next' });

    const result = buildResult(state);
    expect(result.explanationViewedCount).toBe(2);
    expect(result.explanationViewRate).toBeCloseTo(2 / 3);
  });

  it('중간에 그만둬도 그때까지의 결과를 집계할 수 있다', () => {
    let state = createInitialState(quizzes);
    state = quizReducer(state, { type: 'answer', selectedIdx: quizzes[0].answerIdx, at: AT });

    const result = buildResult(state);
    expect(result.total).toBe(3);
    expect(result.answered).toBe(1);
    expect(result.totalPoints).toBe(15);
  });

  it('문항이 없으면 0으로 집계하고 spotId는 null', () => {
    const result = buildResult(createInitialState([]));
    expect(result).toMatchObject({
      spotId: null,
      total: 0,
      answered: 0,
      totalPoints: 0,
      explanationViewRate: 0,
    });
  });
});

describe('reset', () => {
  it('처음 상태로 되돌린다', () => {
    const state = quizReducer(answerAll([0, 0, 0]), { type: 'reset' });
    expect(state).toEqual(createInitialState(quizzes));
  });

  it('새 문항 목록으로 교체할 수 있다', () => {
    const state = quizReducer(createInitialState(quizzes), {
      type: 'reset',
      quizzes: [quizzes[0]],
    });
    expect(state.quizzes).toHaveLength(1);
    expect(state.step).toBe('question');
    expect(isLastQuestion(state)).toBe(true);
  });
});
