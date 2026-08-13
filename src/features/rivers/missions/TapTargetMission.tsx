import { playSound } from '../sound';
import { MissionDoneNote, MissionPanel, type MissionProps } from './MissionPanel';

/**
 * `tap_target` — 떠다니는 대상을 탭해 "촬영"하는 미션 (온천천 수달).
 *
 * ★ 움직임에 기대지 않습니다
 *   `prefers-reduced-motion`이면 global.css가 `.animate-otter`를 멈춥니다.
 *   그때도 대상은 화면에 그대로 있고 그냥 탭하면 완료됩니다 —
 *   "움직이는 걸 맞혀야만" 통과하는 구조였다면 그 설정에서 미션이 불가능해집니다.
 */
export function TapTargetMission({ river, theme, done, onComplete }: MissionProps) {
  const emoji = river.missionConfig.emoji ?? '🦦';
  const label = river.missionConfig.label ?? '눌러서 찰칵!';
  const doneLabel = river.missionConfig.done ?? '📸 촬영 완료!';

  return (
    <MissionPanel theme={theme} title={river.missionTitle} body={river.missionBody}>
      <div className="bg-slate-900 rounded-2xl p-3 text-center relative overflow-hidden shadow-inner">
        <div className="relative h-36 bg-gradient-to-b from-teal-800 to-cyan-900 rounded-xl overflow-hidden border border-slate-700 flex items-center justify-center">
          <button
            type="button"
            onClick={() => {
              if (done) return;
              playSound('camera');
              onComplete();
            }}
            aria-disabled={done}
            aria-label={`${emoji} ${label}`}
            className={`absolute select-none min-h-[44px] ${done ? '' : 'animate-otter'}`}
          >
            <span className="bg-amber-800/90 hover:bg-amber-700 text-white p-2 rounded-2xl shadow-lg border border-amber-400 flex items-center gap-2 transform hover:scale-110 transition-transform">
              <span className="text-2xl" aria-hidden="true">
                {emoji}
              </span>
              <span className="text-[10px] font-extrabold bg-amber-300 text-amber-950 px-2 py-0.5 rounded whitespace-nowrap">
                {done ? '촬영 완료' : label}
              </span>
            </span>
          </button>
        </div>
      </div>

      {done ? <MissionDoneNote>{doneLabel}</MissionDoneNote> : null}
    </MissionPanel>
  );
}
