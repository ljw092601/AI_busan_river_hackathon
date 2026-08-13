/**
 * 퀴즈 진행 상태 훅.
 *
 * ⚠️ 포인트 적립은 여기서 하지 않습니다. 채점 결과를 `onComplete`로 넘길 뿐입니다.
 *    원장 기록·잔액 갱신은 포인트 트랙의 책임입니다 (관심사 분리).
 */

import { useCallback, useEffect, useMemo, useRef, useReducer } from 'react';
import type { Quiz } from '@/types/domain';
import {
  buildResult,
  createInitialState,
  currentAnswer as selectCurrentAnswer,
  currentQuiz as selectCurrentQuiz,
  isLastQuestion,
  quizReducer,
} from './quizMachine';
import type { QuizAnswer, QuizSessionResult, QuizStep } from './types';

export interface UseQuizOptions {
  /** 스팟 1곳의 문항 목록 (보통 2~3개). 데이터 페칭은 상위에서 합니다 */
  quizzes: Quiz[];
  /** 전 문항 종료 시 1회 호출. 포인트 적립은 이 콜백을 받은 쪽에서 */
  onComplete?: (result: QuizSessionResult) => void;
  /** 해설이 화면에 노출될 때 문항당 1회 호출 (PLAN.md §10 해설 열람률 측정) */
  onExplanationView?: (quizId: string) => void;
}

export interface UseQuizApi {
  /** 현재 문항. 모두 끝났으면 undefined */
  quiz: Quiz | undefined;
  /** 현재 문항 번호 (0-based) */
  index: number;
  /** 화면 표시용 문항 번호 (1-based) */
  questionNo: number;
  total: number;
  step: QuizStep;
  /** 현재 문항의 응답. 미응답이면 undefined */
  answer: QuizAnswer | undefined;
  answers: QuizAnswer[];
  /** 0..1 — 끝난 문항 비율 */
  progress: number;
  isLast: boolean;
  isDone: boolean;
  correctCount: number;
  /** 지금까지 쌓인 포인트 (표시용 — 적립은 포인트 트랙이) */
  earnedPoints: number;
  /** 보기 선택 확정 → 해설 단계로 */
  submitAnswer: (selectedIdx: number) => void;
  /** 해설이 노출됐음을 기록 */
  markExplanationViewed: () => void;
  /** 다음 문항으로 (마지막이면 종료) */
  next: () => void;
  /** 처음부터 다시 — 결과 콜백도 다시 발화할 수 있게 초기화 */
  reset: () => void;
  /** 현재 시점의 결과 스냅샷 */
  result: QuizSessionResult;
}

export function useQuiz({ quizzes, onComplete, onExplanationView }: UseQuizOptions): UseQuizApi {
  const [state, dispatch] = useReducer(quizReducer, quizzes, createInitialState);

  // 콜백은 ref로 잡아둡니다 — 부모가 인라인 함수를 넘겨도 effect가 재실행되지 않게.
  const onCompleteRef = useRef(onComplete);
  const onExplanationViewRef = useRef(onExplanationView);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onExplanationViewRef.current = onExplanationView;
  });

  const completedRef = useRef(false);
  const viewedRef = useRef<Set<string>>(new Set());

  // 문항 목록이 바뀌면(다른 스팟으로 이동) 처음부터 다시 시작합니다.
  const quizzesRef = useRef(quizzes);
  useEffect(() => {
    if (quizzesRef.current === quizzes) return;
    quizzesRef.current = quizzes;
    completedRef.current = false;
    viewedRef.current = new Set();
    dispatch({ type: 'reset', quizzes });
  }, [quizzes]);

  // 종료 시 결과 1회 통지. 문항이 0개면 통지하지 않습니다(빈 적립 방지).
  useEffect(() => {
    if (state.step !== 'done' || completedRef.current) return;
    if (state.answers.length === 0) return;
    completedRef.current = true;
    onCompleteRef.current?.(buildResult(state));
  }, [state]);

  const submitAnswer = useCallback((selectedIdx: number) => {
    dispatch({ type: 'answer', selectedIdx });
  }, []);

  const next = useCallback(() => {
    dispatch({ type: 'next' });
  }, []);

  const reset = useCallback(() => {
    completedRef.current = false;
    viewedRef.current = new Set();
    dispatch({ type: 'reset' });
  }, []);

  const quiz = selectCurrentQuiz(state);
  const quizId = quiz?.id;

  const markExplanationViewed = useCallback(() => {
    dispatch({ type: 'explanation_viewed' });
    if (!quizId || viewedRef.current.has(quizId)) return;
    viewedRef.current.add(quizId);
    onExplanationViewRef.current?.(quizId);
  }, [quizId]);

  const answer = selectCurrentAnswer(state);
  const total = state.quizzes.length;
  const finished = state.step === 'done' ? total : state.index;

  const result = useMemo(() => buildResult(state), [state]);

  return {
    quiz,
    index: state.index,
    questionNo: Math.min(state.index + 1, Math.max(total, 1)),
    total,
    step: state.step,
    answer,
    answers: state.answers,
    progress: total === 0 ? 1 : finished / total,
    isLast: isLastQuestion(state),
    isDone: state.step === 'done',
    correctCount: result.correctCount,
    earnedPoints: result.totalPoints,
    submitAnswer,
    markExplanationViewed,
    next,
    reset,
    result,
  };
}
