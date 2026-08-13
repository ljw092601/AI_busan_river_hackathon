/**
 * 해설. **정답·오답 모두에게** 같은 무게로 보여줍니다.
 *
 * 오답일 때 "틀렸습니다" 같은 판정문을 앞세우지 않고 바로 해설로 넘어갑니다.
 * 초등 대상에서 부정 피드백은 재도전이 아니라 이탈을 만듭니다 (PLAN.md §3).
 *
 * `onView`는 해설이 화면에 붙은 시점에 문항당 1회 호출됩니다.
 * PLAN.md §10의 "퀴즈 해설 열람률 80% 이상"은 이 신호로만 측정할 수 있습니다.
 */

import { useEffect } from 'react';
import type { Quiz } from '@/types/domain';
import { pointsForAnswer } from './quizMachine';
import styles from './QuizExplanation.quiz.module.css';

export interface QuizExplanationProps {
  quiz: Quiz;
  isCorrect: boolean;
  /** 해설 노출 시 1회 호출 (열람률 측정) */
  onView?: (quizId: string) => void;
}

export function QuizExplanation({ quiz, isCorrect, onView }: QuizExplanationProps) {
  useEffect(() => {
    onView?.(quiz.id);
    // onView는 매 렌더 새 함수일 수 있으므로 문항 단위로만 발화합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.id]);

  return (
    <section className={styles.card} aria-label="해설">
      <h3 className={styles.title}>
        <span className={styles.icon} aria-hidden="true">
          💡
        </span>
        {isCorrect ? '왜 그럴까?' : '이건 이런 이야기야'}
      </h3>

      <p className={styles.body}>{quiz.explanation}</p>

      <p className={styles.reward}>
        <span aria-hidden="true">🌱</span> +{pointsForAnswer(isCorrect)}P 모았어
        {isCorrect ? '!' : ' — 해설을 읽었으니까!'}
      </p>
    </section>
  );
}
