/**
 * 하천 미션/퀴즈 화면의 공개 진입점.
 *
 * MissionModal은 여기서 내보내지 않습니다 — 다른 트랙이 소유하는 파일이라
 * 이 배럴이 그것을 참조하면 두 트랙이 같은 파일을 놓고 부딪칩니다.
 * 라우터가 HomeScreen의 renderMissionModal prop으로 연결해 주세요.
 */

export { HomeScreen } from './HomeScreen';
export type { HomeScreenProps } from './HomeScreen';

export { ProgressHero } from './ProgressHero';
export type { ProgressHeroProps } from './ProgressHero';

export { RiverCard } from './RiverCard';
export type { RiverCardProps } from './RiverCard';

export { Encyclopedia } from './Encyclopedia';
export type { EncyclopediaProps } from './Encyclopedia';

export { BadgeModal } from './BadgeModal';
export type { BadgeModalProps } from './BadgeModal';

export { useModalBehavior, useBackdropClose } from './useModalBehavior';

export { themeOf } from './theme';
export type { RiverTheme, ThemeKey } from './theme';

export {
  riverKeys,
  useRivers,
  useBadges,
  useCompleteMission,
  useAnswerQuiz,
  useClaimBadge,
} from './queries';

export { isRiverComplete, solvedCount } from './types';
export type {
  RiverView,
  QuizView,
  MissionKind,
  MissionConfig,
  AcknowledgeConfig,
  TextAnswerConfig,
  TapTargetConfig,
  CollectConfig,
  ObserveLogConfig,
} from './types';
