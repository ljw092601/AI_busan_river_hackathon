import type { ReactNode } from 'react';
import type { RiverTheme } from '../theme';
import type { RiverView } from '../types';

/**
 * STEP 1 미션들의 공통 껍데기 — 프로토타입의 미션 패널을 그대로 옮긴 것입니다.
 * 색은 전부 theme.ts의 **완성된 클래스 문자열**로만 들어옵니다(문자열 조립 금지).
 */

export interface MissionProps {
  river: RiverView;
  theme: RiverTheme;
  /** 이미 완료된 미션인가 (서버 기록 + 이번 세션의 낙관적 상태 합산) */
  done: boolean;
  /** 미션을 방금 끝냈을 때 한 번 호출 */
  onComplete: () => void;
}

export function MissionPanel({
  theme,
  title,
  body,
  children,
}: {
  theme: RiverTheme;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className={`${theme.panelBg} border ${theme.panelBorder} rounded-2xl p-5 shadow-sm space-y-3`}
    >
      <div className={`flex items-center gap-2 border-b ${theme.panelBorder} pb-2`}>
        <span className={`px-2.5 py-1 ${theme.stepBadge} rounded-full font-black text-xs shrink-0`}>
          STEP 1
        </span>
        <h4 className={`font-bold text-base ${theme.panelText}`}>{title}</h4>
      </div>
      {body ? <p className={`text-xs ${theme.panelText} leading-relaxed`}>{body}</p> : null}
      {children}
    </section>
  );
}

/** 미션 완료 후 패널 하단에 뜨는 초록 확인 줄. */
export function MissionDoneNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="p-2.5 bg-emerald-100 text-emerald-900 text-xs font-bold rounded-xl text-center"
    >
      {children}
    </p>
  );
}
