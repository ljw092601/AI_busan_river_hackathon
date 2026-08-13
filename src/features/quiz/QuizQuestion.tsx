/**
 * 문항 1개 렌더링. 3지선다와 O/X를 모두 다룹니다 (`options` 길이로 판단).
 *
 * 접근성 메모
 *  - 보기는 실제 `<button>` — 키보드 Tab/Enter로 그대로 조작됩니다.
 *  - 응답 후에도 `disabled` 대신 `aria-disabled`를 씁니다. `disabled`를 걸면 방금 누른
 *    버튼에서 포커스가 사라져 스크린리더 사용자가 맥락을 잃습니다.
 *  - 정답/오답을 색으로만 알리지 않습니다 — 아이콘(⭕/✖)과 텍스트를 함께 씁니다.
 */

import type { Quiz } from '@/types/domain';
import styles from './QuizQuestion.quiz.module.css';

export interface QuizQuestionProps {
  quiz: Quiz;
  /** 고른 보기 인덱스. 미응답이면 null */
  selectedIdx: number | null;
  /** true면 정답/오답을 공개하고 입력을 잠급니다 */
  revealed: boolean;
  onSelect: (idx: number) => void;
  /** 문항 번호 (1-based) — 화면에는 안 나오고 보조 안내에만 씁니다 */
  questionNo?: number;
  total?: number;
}

/** O/X 문항일 때 인덱스별로 붙는 큰 기호. 색 없이도 구분되게. */
const OX_MARKS = ['⭕', '❌'];

export function QuizQuestion({
  quiz,
  selectedIdx,
  revealed,
  onSelect,
  questionNo,
  total,
}: QuizQuestionProps) {
  const isOX = quiz.options.length === 2;
  const answered = selectedIdx !== null;
  const isCorrect = answered && selectedIdx === quiz.answerIdx;
  const headingId = `quiz-q-${quiz.id}`;

  const feedback = !revealed
    ? ''
    : isCorrect
      ? '정답이에요! 잘했어!'
      : `아쉬워요. 정답은 "${quiz.options[quiz.answerIdx]}" 예요.`;

  return (
    <div className={styles.wrap}>
      {questionNo !== undefined && total !== undefined && (
        <p className={styles.srOnly}>
          {total}문제 중 {questionNo}번 문제
        </p>
      )}

      <h2 className={styles.question} id={headingId}>
        {quiz.question}
      </h2>

      <div
        className={isOX ? styles.optionsOX : styles.options}
        role="group"
        aria-labelledby={headingId}
      >
        {quiz.options.map((option, idx) => {
          const selected = selectedIdx === idx;
          const isAnswer = idx === quiz.answerIdx;
          const showAsAnswer = revealed && isAnswer;
          const showAsMiss = revealed && selected && !isAnswer;

          const classes = [
            isOX ? styles.optionOX : styles.option,
            selected ? styles.selected : '',
            showAsAnswer ? styles.correct : '',
            showAsMiss ? styles.miss : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={`${quiz.id}-${idx}`}
              type="button"
              className={classes}
              aria-pressed={selected}
              aria-disabled={revealed}
              onClick={() => {
                if (revealed) return;
                onSelect(idx);
              }}
            >
              <span className={styles.marker} aria-hidden="true">
                {isOX ? OX_MARKS[idx] : idx + 1}
              </span>
              <span className={styles.label}>{option}</span>
              {showAsAnswer && (
                <span className={styles.tag}>
                  <span aria-hidden="true">⭕</span> 정답
                </span>
              )}
              {showAsMiss && (
                <span className={styles.tag}>
                  <span aria-hidden="true">✖</span> 내가 고른 답
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 결과는 텍스트로도 알립니다 — 색상만으로 전달하지 않기 */}
      <p
        className={`${styles.feedback} ${isCorrect ? styles.feedbackCorrect : styles.feedbackMiss}`}
        role="status"
        aria-live="polite"
      >
        {feedback}
      </p>
    </div>
  );
}
