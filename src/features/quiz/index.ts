/**
 * 퀴즈 트랙 공개 API.
 *
 * 사용 예:
 *   <QuizRunner
 *     quizzes={quizzes}                      // 데이터는 상위에서 주입 (페칭 없음)
 *     onComplete={(r) => awardPoints(r)}     // 포인트 적립은 포인트 트랙에서
 *     onExplanationView={(id) => track(id)}  // 해설 열람률 계측 (PLAN.md §10)
 *   />
 *
 * 포인트 트랙 연결 — 결과의 answers를 그대로 원장 항목으로 옮기면 됩니다:
 *   result.answers.map((a) =>
 *     createEntry({ userId, reason: a.reason, refType: 'quiz', refId: a.quizId }),
 *   );
 * delta는 `src/lib/points`의 규칙에서 유도되며 `a.points`(정답 15 / 오답 5)와 같습니다.
 * 이 모듈은 점수를 계산만 하고 원장에 쓰지 않습니다.
 */

export { QuizRunner } from './QuizRunner';
export type { QuizRunnerProps } from './QuizRunner';

export { QuizQuestion } from './QuizQuestion';
export type { QuizQuestionProps } from './QuizQuestion';

export { QuizExplanation } from './QuizExplanation';
export type { QuizExplanationProps } from './QuizExplanation';

export { useQuiz } from './useQuiz';
export type { UseQuizApi, UseQuizOptions } from './useQuiz';

export {
  buildResult,
  createInitialState,
  currentAnswer,
  currentQuiz,
  isLastQuestion,
  pointsForAnswer,
  quizReducer,
  reasonForAnswer,
} from './quizMachine';
export type { QuizAction, QuizMachineState } from './quizMachine';

export type { QuizAnswer, QuizPointReason, QuizSessionResult, QuizStep } from './types';
