/**
 * 퀴즈 진행 컨테이너. 스팟 1곳의 2~3문항을 순차로 진행합니다.
 *
 * 데이터 페칭은 하지 않습니다 — `quizzes`를 props로 받습니다.
 * 포인트 적립도 하지 않습니다 — 종료 시 `onComplete(result)`만 부릅니다.
 */

import { QuizExplanation } from './QuizExplanation';
import { QuizQuestion } from './QuizQuestion';
import { useQuiz } from './useQuiz';
import type { QuizSessionResult } from './types';
import type { Quiz } from '@/types/domain';
import styles from './QuizRunner.quiz.module.css';

export interface QuizRunnerProps {
  quizzes: Quiz[];
  /** 전 문항 종료 시 1회 호출. 포인트 적립은 이 콜백을 받은 쪽에서 */
  onComplete: (result: QuizSessionResult) => void;
  /** 해설 노출 시 문항당 1회 호출 (PLAN.md §10 해설 열람률) */
  onExplanationView?: (quizId: string) => void;
  /** 종료 화면의 버튼. 없으면 버튼을 숨깁니다 */
  onFinish?: () => void;
  finishLabel?: string;
}

export function QuizRunner({
  quizzes,
  onComplete,
  onExplanationView,
  onFinish,
  finishLabel = '다음으로 가기',
}: QuizRunnerProps) {
  const {
    quiz,
    questionNo,
    total,
    step,
    answer,
    progress,
    isLast,
    isDone,
    correctCount,
    earnedPoints,
    submitAnswer,
    markExplanationViewed,
    next,
  } = useQuiz({ quizzes, onComplete, onExplanationView });

  if (total === 0) {
    return (
      <section className={styles.runner}>
        <p className={styles.empty}>이 스팟에는 아직 퀴즈가 없어요.</p>
      </section>
    );
  }

  if (isDone || !quiz) {
    return (
      <section className={styles.runner} aria-label="퀴즈 결과">
        <div className={styles.done}>
          <p className={styles.doneEmoji} aria-hidden="true">
            🎉
          </p>
          <h2 className={styles.doneTitle}>퀴즈 끝!</h2>
          <p className={styles.doneLine}>
            {total}문제 중 <strong>{correctCount}문제</strong>를 맞혔어요.
          </p>
          <p className={styles.donePoints}>
            <span aria-hidden="true">🌱</span> 이번 퀴즈로 {earnedPoints}P
          </p>
          <p className={styles.doneNote}>해설을 읽은 것도 훌륭한 공부예요. 다음 스팟으로 가볼까?</p>
          {onFinish && (
            <button type="button" className={styles.primary} onClick={onFinish}>
              {finishLabel}
            </button>
          )}
        </div>
      </section>
    );
  }

  const revealed = step === 'explanation';

  return (
    <section className={styles.runner} aria-label="퀴즈">
      <header className={styles.header}>
        <p className={styles.counter}>
          <strong>{questionNo}</strong> / {total} 문제
        </p>
        <div
          className={styles.track}
          role="progressbar"
          aria-label="퀴즈 진행률"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={questionNo}
          aria-valuetext={`${total}문제 중 ${questionNo}번째`}
        >
          <div className={styles.fill} style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </header>

      <QuizQuestion
        quiz={quiz}
        selectedIdx={answer ? answer.selectedIdx : null}
        revealed={revealed}
        onSelect={submitAnswer}
        questionNo={questionNo}
        total={total}
      />

      {revealed && answer && (
        <>
          <QuizExplanation
            quiz={quiz}
            isCorrect={answer.isCorrect}
            onView={markExplanationViewed}
          />
          <button type="button" className={styles.primary} onClick={next}>
            {isLast ? '결과 보기' : '다음 문제'}
          </button>
        </>
      )}
    </section>
  );
}
