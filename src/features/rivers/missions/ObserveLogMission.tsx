import { useState } from 'react';
import { playSound } from '../sound';
import { MissionDoneNote, MissionPanel, type MissionProps } from './MissionPanel';

/**
 * `observe_log` — 관찰 항목을 **항목마다 하나씩** 고른 뒤 일지를 등록하는 미션 (대천천).
 *
 * ★ 필드 목록은 mission_config.fields로만 그립니다
 *   현재 대천천은 발견 생물 / 물 상태 / 냄새 / 쓰레기 4개지만, 개수도 key도 하드코딩하지
 *   않습니다. 문항을 하나 더 넣거나 빼는 일이 DB 수정만으로 끝나야 합니다.
 *
 * ★ 프로토타입은 아무것도 고르지 않아도 제출이 됐습니다.
 *   관찰일지인데 관찰 결과가 비어 있으면 미션의 의미가 사라지므로,
 *   모든 항목을 고르기 전까지 제출을 잠그고 **몇 개가 남았는지** 알려 줍니다.
 */
export function ObserveLogMission({ river, theme, done, onComplete }: MissionProps) {
  const fields = river.missionConfig.fields ?? [];
  const cta = river.missionConfig.cta ?? '📷 관찰일지 등록';
  const doneLabel = river.missionConfig.done ?? '📷 관찰일지 등록 완료';

  // key → 고른 보기 index
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const remaining = fields.filter((f) => answers[f.key] === undefined).length;
  const canSubmit = remaining === 0;

  return (
    <MissionPanel theme={theme} title={river.missionTitle} body={river.missionBody}>
      <div className={`p-3 bg-white rounded-xl border ${theme.panelBorder} space-y-4 text-xs`}>
        {fields.map((field) => (
          <fieldset key={field.key}>
            <legend className="font-bold text-slate-700 block mb-1.5">{field.label}</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
              {field.options.map((opt, i) => {
                const active = answers[field.key] === i;
                return (
                  <button
                    key={`${field.key}-${i}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      if (done) return;
                      setAnswers((prev) => ({ ...prev, [field.key]: i }));
                      playSound('click');
                    }}
                    className={`min-h-[44px] p-2 border rounded-lg transition-all ${
                      active
                        ? `${theme.panelBg} ${theme.panelBorder} ${theme.panelText} font-bold`
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt.emoji ? <span aria-hidden="true">{opt.emoji} </span> : null}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        {done ? (
          <MissionDoneNote>{doneLabel}</MissionDoneNote>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                if (!canSubmit) return;
                playSound('camera');
                onComplete();
              }}
              aria-disabled={!canSubmit}
              className={`w-full min-h-[44px] py-2.5 text-white font-bold rounded-xl transition-all ${
                canSubmit ? theme.button : 'bg-slate-300 cursor-default'
              }`}
            >
              {cta}
            </button>
            {!canSubmit ? (
              <p role="status" className="text-[11px] text-slate-500 text-center">
                아직 고르지 않은 항목이 {remaining}개 있어요. 모두 고르면 일지를 등록할 수 있어요.
              </p>
            ) : null}
          </>
        )}
      </div>
    </MissionPanel>
  );
}
