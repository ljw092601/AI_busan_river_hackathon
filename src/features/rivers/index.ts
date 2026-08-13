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

/* ── 위치 잠금해제 ─────────────────────────────────────────────
   ⚠️ 클라이언트 판정입니다(types.ts lockStateOf 주석 참고). 우회할 수 있고,
      그래서 어떤 문구도 "인증"이라고 말하지 않습니다.
   HomeScreen이 useGeolocation()을 한 번만 부르고 RiverLocationProvider로 내려보냅니다.
   주입되는 MissionModal은 useRiverLock(river)으로 그 값을 읽습니다 —
   배선하는 쪽에서 따로 넘길 것은 없습니다. */
export { LocationBanner } from './LocationBanner';
export type { LocationBannerProps } from './LocationBanner';

export {
  RiverLocationProvider,
  useRiverLocation,
  useRiverLock,
  accuracyPoorOf,
} from './LocationContext';
export type { RiverLocationValue, RiverLocationProviderProps } from './LocationContext';

export {
  POOR_ACCURACY_M,
  approxDistance,
  hasCoordinates,
  isAccuracyPoor,
  lockNote,
  lockOf,
  unlockedCount,
  withLocks,
} from './location';
export type { RiverWithLock } from './location';

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

export { isRiverComplete, solvedCount, lockStateOf } from './types';
export type {
  LockState,
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
