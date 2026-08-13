import { playSound } from '../sound';
import { MissionPanel, type MissionProps } from './MissionPanel';

/**
 * `acknowledge` — 설명을 읽고 인증 버튼을 누르면 끝나는 미션 (수영강).
 */
export function AcknowledgeMission({ river, theme, done, onComplete }: MissionProps) {
  const cta = river.missionConfig.cta ?? '탐방 인증하기';
  const doneLabel = river.missionConfig.done ?? '미션 완료';

  return (
    <MissionPanel theme={theme} title={river.missionTitle} body={river.missionBody}>
      <button
        type="button"
        onClick={() => {
          if (done) return;
          playSound('click');
          onComplete();
        }}
        aria-disabled={done}
        className={`w-full min-h-[44px] py-3 ${
          done ? 'bg-emerald-600 cursor-default' : theme.button
        } text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2`}
      >
        <span aria-hidden="true">{done ? '✅' : '🚩'}</span>
        <span>{done ? doneLabel : cta}</span>
      </button>
    </MissionPanel>
  );
}
