import { useId, useState } from 'react';
import { playSound } from '../sound';
import { MissionDoneNote, MissionPanel, type MissionProps } from './MissionPanel';
import { matchesTextAnswer } from './logic';

/**
 * `text_answer` — 정답 단어를 입력해 제출하는 미션 (부전천).
 *
 * ★ 프로토타입은 오답에 `alert()`를 띄웠지만 여기서는 쓰지 않습니다.
 *   모바일 alert은 화면을 덮고 키보드를 닫아 버려서, 다시 입력하려면
 *   확인 → 입력창 탭 → 키보드 대기까지 세 단계가 더 듭니다.
 *   힌트는 입력창 바로 아래 인라인으로 보여 줍니다.
 */
export function TextAnswerMission({ river, theme, done, onComplete }: MissionProps) {
  const { prompt, placeholder, accept, hint } = river.missionConfig;
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);
  const inputId = useId();
  const feedbackId = useId();

  function submit() {
    if (done) return;
    if (matchesTextAnswer(value, accept)) {
      setWrong(false);
      playSound('success');
      onComplete();
    } else {
      setWrong(true);
      playSound('wrong');
    }
  }

  return (
    <MissionPanel theme={theme} title={river.missionTitle} body={river.missionBody}>
      <div className={`p-3 bg-white rounded-xl border ${theme.panelBorder} space-y-2`}>
        <label htmlFor={inputId} className="block text-xs font-bold text-slate-700">
          {prompt ?? '정답을 입력해 주세요.'}
        </label>

        {done ? (
          <MissionDoneNote>
            ✅ {river.missionConfig.done ?? '정답! 미션을 완료했어요.'}
          </MissionDoneNote>
        ) : (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                id={inputId}
                type="text"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (wrong) setWrong(false);
                }}
                placeholder={placeholder ?? '정답 입력'}
                autoComplete="off"
                aria-invalid={wrong}
                aria-describedby={wrong ? feedbackId : undefined}
                className="flex-grow min-w-0 min-h-[44px] p-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <button
                type="submit"
                className={`shrink-0 min-h-[44px] px-4 py-2.5 ${theme.button} text-white font-bold text-xs rounded-xl transition-all`}
              >
                제출
              </button>
            </form>

            {wrong ? (
              <p
                id={feedbackId}
                role="status"
                className="p-2.5 bg-red-100 text-red-900 rounded-xl text-xs font-semibold leading-relaxed"
              >
                ❌ 아직 정답이 아니에요. {hint ?? '설명을 다시 읽고 도전해 보세요!'}
              </p>
            ) : null}
          </>
        )}
      </div>
    </MissionPanel>
  );
}
