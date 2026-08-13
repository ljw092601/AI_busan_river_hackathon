import type { ComponentType } from 'react';
import type { MissionKind } from '../types';
import { AcknowledgeMission } from './AcknowledgeMission';
import { CollectMission } from './CollectMission';
import { ObserveLogMission } from './ObserveLogMission';
import { TapTargetMission } from './TapTargetMission';
import { TextAnswerMission } from './TextAnswerMission';
import type { MissionProps } from './MissionPanel';

/**
 * STEP 1 미션은 **하천 slug가 아니라 `mission_kind`로** 고릅니다.
 *
 * 프로토타입은 하천마다 함수를 하나씩 두고 id로 분기했습니다(`if (river.id === 'suyeong')`).
 * 그러면 하천이 하나 늘 때마다 코드도 늘어납니다. 여기서는 DB의 mission_kind가
 * 컴포넌트를, mission_config가 문구·항목을 정합니다. 여섯 번째 하천은
 * 행 하나만 넣으면 코드 수정 없이 동작합니다.
 */

const REGISTRY: Record<MissionKind, ComponentType<MissionProps>> = {
  acknowledge: AcknowledgeMission,
  text_answer: TextAnswerMission,
  tap_target: TapTargetMission,
  collect: CollectMission,
  observe_log: ObserveLogMission,
};

/**
 * kind가 비었거나 아직 모르는 값이면 '읽고 인증'으로 떨어뜨립니다.
 * 미션 화면이 통째로 사라지면 그 하천은 영원히 완수 불가가 되기 때문입니다.
 */
export function missionComponentFor(kind: MissionKind | null): ComponentType<MissionProps> {
  return (kind && REGISTRY[kind]) || AcknowledgeMission;
}

export function MissionStep(props: MissionProps) {
  const Component = missionComponentFor(props.river.missionKind);
  return <Component {...props} />;
}

export type { MissionProps } from './MissionPanel';
export { MissionPanel, MissionDoneNote } from './MissionPanel';
export {
  useMissionPhoto,
  MissionPhotoPending,
  MissionPhotoFailure,
  MissionPhotoThumb,
  MissionPhotoSignedOutNote,
  OTTER_PHOTO_TAG,
  OBSERVE_LOG_PHOTO_TAG,
} from './MissionPhoto';
export type { MissionPhotoController, MissionPhotoStatus } from './MissionPhoto';
export { AcknowledgeMission } from './AcknowledgeMission';
export { CollectMission } from './CollectMission';
export { ObserveLogMission } from './ObserveLogMission';
export { TapTargetMission } from './TapTargetMission';
export { TextAnswerMission } from './TextAnswerMission';
export {
  collectTarget,
  isCollectComplete,
  isCompleteWith,
  matchesTextAnswer,
  normalizeAnswer,
} from './logic';
