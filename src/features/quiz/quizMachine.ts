/**
 * 퀴즈 진행 상태 기계 — 순수 함수만 있습니다 (React 비의존).
 *
 * 채점과 상태 전이를 UI에서 떼어낸 이유:
 *   1. 단위 테스트가 렌더링 없이 가능합니다 (quizMachine.test.ts)
 *   2. 포인트 계산 규칙(정답 15 / 오답 5)이 한 군데에만 존재합니다
 *
 * 상태 전이:
 *   question ──answer──> explanation ──next──> question | done
 *   (explanation 단계에서 explanation_viewed 로 해설 열람을 기록)
 */

import { POINT_VALUES, type Quiz } from '@/types/domain';
import type { QuizAnswer, QuizPointReason, QuizSessionResult, QuizStep } from './types';

export interface QuizMachineState {
  quizzes: Quiz[];
  /** 현재 문항 인덱스 (0-based) */
  index: number;
  step: QuizStep;
  answers: QuizAnswer[];
}

export type QuizAction =
  | { type: 'answer'; selectedIdx: number; at?: number }
  | { type: 'explanation_viewed' }
  | { type: 'next' }
  | { type: 'reset'; quizzes?: Quiz[] };

/** 정답 15P / 오답 5P. 오답 0점은 재도전이 아니라 이탈을 만듭니다 (PLAN.md §6.1) */
export function pointsForAnswer(isCorrect: boolean): number {
  return isCorrect ? POINT_VALUES.quiz_correct : POINT_VALUES.quiz_wrong;
}

export function reasonForAnswer(isCorrect: boolean): QuizPointReason {
  return isCorrect ? 'quiz_correct' : 'quiz_wrong';
}

export function createInitialState(quizzes: Quiz[]): QuizMachineState {
  return {
    quizzes,
    index: 0,
    step: quizzes.length > 0 ? 'question' : 'done',
    answers: [],
  };
}

export function currentQuiz(state: QuizMachineState): Quiz | undefined {
  return state.quizzes[state.index];
}

/** 현재 문항에 대한 응답. 아직 답하지 않았으면 undefined */
export function currentAnswer(state: QuizMachineState): QuizAnswer | undefined {
  const quiz = currentQuiz(state);
  if (!quiz) return undefined;
  return state.answers.find((a) => a.quizId === quiz.id);
}

export function isLastQuestion(state: QuizMachineState): boolean {
  return state.quizzes.length > 0 && state.index >= state.quizzes.length - 1;
}

export function quizReducer(state: QuizMachineState, action: QuizAction): QuizMachineState {
  switch (action.type) {
    case 'answer': {
      // 중복 응답 방지 — 해설을 보는 중에는 답을 바꿀 수 없습니다.
      if (state.step !== 'question') return state;
      const quiz = currentQuiz(state);
      if (!quiz) return state;

      const isCorrect = action.selectedIdx === quiz.answerIdx;
      const answer: QuizAnswer = {
        quizId: quiz.id,
        spotId: quiz.spotId,
        selectedIdx: action.selectedIdx,
        isCorrect,
        points: pointsForAnswer(isCorrect),
        reason: reasonForAnswer(isCorrect),
        explanationViewed: false,
        answeredAt: action.at ?? Date.now(),
      };
      return { ...state, step: 'explanation', answers: [...state.answers, answer] };
    }

    case 'explanation_viewed': {
      if (state.step !== 'explanation') return state;
      const quiz = currentQuiz(state);
      if (!quiz) return state;
      const target = state.answers.find((a) => a.quizId === quiz.id);
      if (!target || target.explanationViewed) return state; // 멱등 — 재렌더로 중복 집계되지 않게
      return {
        ...state,
        answers: state.answers.map((a) =>
          a.quizId === quiz.id ? { ...a, explanationViewed: true } : a,
        ),
      };
    }

    case 'next': {
      // 해설을 거치지 않고는 다음 문항으로 넘어갈 수 없습니다.
      if (state.step !== 'explanation') return state;
      if (isLastQuestion(state)) return { ...state, step: 'done' };
      return { ...state, index: state.index + 1, step: 'question' };
    }

    case 'reset':
      return createInitialState(action.quizzes ?? state.quizzes);

    default:
      return state;
  }
}

/** 세션 결과 집계 — `onComplete` 페이로드 */
export function buildResult(state: QuizMachineState): QuizSessionResult {
  const { answers, quizzes } = state;
  const correctCount = answers.filter((a) => a.isCorrect).length;
  const explanationViewedCount = answers.filter((a) => a.explanationViewed).length;

  return {
    spotId: quizzes[0]?.spotId ?? null,
    total: quizzes.length,
    answered: answers.length,
    correctCount,
    wrongCount: answers.length - correctCount,
    totalPoints: answers.reduce((sum, a) => sum + a.points, 0),
    explanationViewedCount,
    explanationViewRate: answers.length === 0 ? 0 : explanationViewedCount / answers.length,
    answers,
  };
}
