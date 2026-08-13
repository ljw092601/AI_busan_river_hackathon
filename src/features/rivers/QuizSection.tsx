import { useState } from 'react';
import { playSound } from './sound';
import type { QuizView, RiverView } from './types';

/**
 * STEP 2 — 하천별 생태·역사 퀴즈.
 *
 * 채점은 클라이언트에서 `quiz.answerIdx`와 비교해 **즉시** 합니다.
 * 서버 왕복을 기다리면 초등학생 기준으로 "눌렀는데 아무 일도 안 일어나는" 시간이 생기고,
 * 하천변 LTE에서는 그게 몇 초가 됩니다. 정답이 페이지 소스에 들어 있지만
 * 교육용 앱에서 감수할 만한 거래입니다(부정행위 방지 장치는 두지 않습니다).
 * 기록은 채점 뒤에 별도로 보냅니다.
 */

export interface QuizSectionProps {
  river: RiverView;
  /** 이미 맞힌 퀴즈 id (서버 기록 + 이번 세션 정답) */
  solved: ReadonlySet<string>;
  onAnswer: (quiz: QuizView, selectedIdx: number, isCorrect: boolean) => void;
}

export function QuizSection({ river, solved, onAnswer }: QuizSectionProps) {
  // 문항 id → 방금 고른 오답 (다시 고르면 사라집니다)
  const [wrongPick, setWrongPick] = useState<Record<string, number>>({});

  function choose(quiz: QuizView, optionIdx: number) {
    if (solved.has(quiz.id)) return;
    const isCorrect = optionIdx === quiz.answerIdx;
    if (isCorrect) {
      playSound('success');
      setWrongPick((prev) => {
        const next = { ...prev };
        delete next[quiz.id];
        return next;
      });
    } else {
      playSound('wrong');
      setWrongPick((prev) => ({ ...prev, [quiz.id]: optionIdx }));
    }
    onAnswer(quiz, optionIdx, isCorrect);
  }

  if (river.quizzes.length === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-xs text-slate-500">이 하천의 퀴즈는 아직 준비 중이에요.</p>
      </section>
    );
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full font-black text-xs shrink-0">
          STEP 2
        </span>
        <h4 className="font-bold text-base text-slate-800">
          {river.name} 생태·역사 퀴즈 (총 {river.quizzes.length}문항)
        </h4>
      </div>

      {river.quizzes.map((quiz, idx) => {
        const isSolved = solved.has(quiz.id);
        const wrongIdx = wrongPick[quiz.id];

        return (
          <div key={quiz.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex justify-between items-start gap-2">
              <p className="font-bold text-sm text-slate-800">
                Q{idx + 1}. {quiz.question}
              </p>
              {isSolved ? (
                <span className="bg-emerald-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0">
                  정답!
                </span>
              ) : null}
            </div>

            <div className="space-y-2">
              {quiz.options.map((option, optionIdx) => {
                const highlightCorrect = isSolved && optionIdx === quiz.answerIdx;
                const highlightWrong = !isSolved && wrongIdx === optionIdx;
                return (
                  <button
                    key={optionIdx}
                    type="button"
                    onClick={() => choose(quiz, optionIdx)}
                    aria-pressed={highlightCorrect || highlightWrong}
                    // disabled 대신 aria-disabled — disabled는 포커스를 잃게 해
                    // 키보드/스크린리더 사용자가 방금 맞힌 문항으로 돌아갈 수 없습니다.
                    aria-disabled={isSolved}
                    className={`w-full text-left min-h-[44px] p-3 rounded-xl border text-xs font-medium transition-all ${
                      highlightCorrect
                        ? 'bg-emerald-100 border-emerald-500 font-bold text-emerald-900'
                        : highlightWrong
                          ? 'bg-red-50 border-red-300 text-red-900'
                          : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {isSolved ? (
              <p
                role="status"
                className="p-3 rounded-xl text-xs leading-relaxed font-semibold bg-emerald-100 text-emerald-900"
              >
                🎉 정답입니다! {quiz.explanation}
              </p>
            ) : wrongIdx !== undefined ? (
              <p
                role="status"
                className="p-3 rounded-xl text-xs leading-relaxed font-semibold bg-red-100 text-red-900"
              >
                ❌ 아직 정답이 아니에요. 설명을 다시 읽어 보고 한 번 더 골라 보세요!
              </p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
