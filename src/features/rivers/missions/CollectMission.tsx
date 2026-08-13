import { useState } from 'react';
import { playSound } from '../sound';
import { MissionDoneNote, MissionPanel, type MissionProps } from './MissionPanel';
import { collectTarget, isCollectComplete } from './logic';

/**
 * `collect` — 흩어진 항목을 목표 개수만큼 주우면 끝나는 미션 (동천 플로깅).
 *
 * ★ 프로토타입은 카운터를 전역 변수(`trashCount`)로 뒀습니다.
 *   그래서 모달을 닫았다 다른 하천을 열면 카운트가 이어져 한 번만 눌러도 완료됐습니다.
 *   여기서는 컴포넌트 상태라 하천마다 0에서 시작합니다.
 */
export function CollectMission({ river, theme, done, onComplete }: MissionProps) {
  const items = river.missionConfig.items ?? [];
  const target = collectTarget(river.missionConfig);
  const doneLabel = river.missionConfig.done ?? '수거 완료!';

  const [picked, setPicked] = useState<ReadonlySet<number>>(() => new Set<number>());

  function pickUp(index: number) {
    if (done || picked.has(index)) return;
    const next = new Set(picked);
    next.add(index);
    setPicked(next);
    playSound('click');
    if (isCollectComplete(next.size, target)) onComplete();
  }

  const count = done ? target : picked.size;

  return (
    <MissionPanel theme={theme} title={river.missionTitle} body={river.missionBody}>
      <div className="flex items-center justify-between text-xs font-bold text-slate-600">
        <span>주운 개수</span>
        <span aria-live="polite">
          {count} / {target}
        </span>
      </div>

      <div
        className={`relative min-h-[8rem] ${theme.panelBg} rounded-2xl border ${theme.panelBorder} flex items-center justify-around flex-wrap gap-2 p-3`}
      >
        {items.map((item, i) => {
          const isPicked = done || picked.has(i);
          return (
            <button
              key={`${item}-${i}`}
              type="button"
              onClick={() => pickUp(i)}
              aria-disabled={isPicked}
              aria-label={isPicked ? `${item} 주웠음` : `${item} 줍기`}
              className={`min-w-[44px] min-h-[44px] p-2.5 bg-white rounded-2xl shadow border border-slate-200 text-2xl transition-all ${
                isPicked ? 'opacity-20 cursor-default' : 'hover:scale-110'
              }`}
            >
              <span aria-hidden="true">{item}</span>
            </button>
          );
        })}
        {items.length === 0 ? (
          <p className="text-xs text-slate-500">주울 항목이 아직 준비되지 않았어요.</p>
        ) : null}
      </div>

      {done ? <MissionDoneNote>{doneLabel}</MissionDoneNote> : null}
    </MissionPanel>
  );
}
