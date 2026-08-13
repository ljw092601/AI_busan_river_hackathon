import type { Row } from '@/types/database';

/**
 * 5대 하천 미션/퀴즈 화면의 공유 타입.
 * ⚠️ 이 파일은 여러 트랙이 함께 씁니다 — 필드를 지우거나 이름을 바꾸지 마세요.
 */

export type MissionKind =
  | 'acknowledge'   // 읽고 인증 버튼        (수영강)
  | 'text_answer'   // 정답 단어 입력        (부전천)
  | 'tap_target'    // 움직이는 대상 탭      (온천천 수달)
  | 'collect'       // N개 수집              (동천 플로깅)
  | 'observe_log';  // 관찰 항목 선택 + 기록 (대천천)

/** mission_config 의 미션별 형태. DB에는 jsonb 로 들어 있어 런타임 검증이 필요합니다. */
export interface AcknowledgeConfig { cta?: string; done?: string }
export interface TextAnswerConfig {
  prompt?: string; placeholder?: string; accept?: string[]; hint?: string;
}
export interface TapTargetConfig { emoji?: string; label?: string; done?: string }
export interface CollectConfig { items?: string[]; target?: number; done?: string }
export interface ObserveOption { emoji?: string; label: string }
export interface ObserveField { key: string; label: string; options: ObserveOption[] }
/** 대천천: 사진 촬영 + 여러 항목(발견 생물 / 물 상태 / 냄새 / 쓰레기)을 각각 하나씩 고릅니다. */
export interface ObserveLogConfig {
  fields?: ObserveField[]; cta?: string; done?: string;
}

export type MissionConfig =
  AcknowledgeConfig & TextAnswerConfig & TapTargetConfig & CollectConfig & ObserveLogConfig;

export type RiverRow = Row<'rivers'>;
export type QuizRow = Row<'quizzes'>;

/** 하천 + 퀴즈 + 진행 상황을 합친, 화면이 실제로 쓰는 모양. */
export interface RiverView {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  summary: string;
  icon: string;
  theme: string;
  badgeCode: string | null;
  detailedHistory: string;
  detailedEcology: string;

  missionKind: MissionKind | null;
  missionTitle: string;
  missionBody: string;
  missionConfig: MissionConfig;

  quizzes: QuizView[];

  /** 진행 상황 — 미로그인이면 전부 false/0 입니다. */
  hasMission: boolean;
  missionDone: boolean;
  quizSolvedIds: Set<string>;
  badgeEarned: boolean;
}

export interface QuizView {
  id: string;
  seq: number;
  question: string;
  options: string[];
  answerIdx: number;
  explanation: string;
}

/**
 * 완수 여부. 서버(claim_river_badge)의 판정과 동일해야 합니다.
 *
 * ⚠️ 하천마다 구성이 다릅니다 — "미션 AND 퀴즈"로 단정하면 안 됩니다.
 *      수영강·부전천  퀴즈만 (hasMission=false)
 *      동천          미션만 (quizzes 0문항)
 *      온천천·대천천  둘 다
 *   **없는 단계는 이미 통과한 것으로 봅니다.** 그러지 않으면 해당 하천은 영원히 미완수입니다.
 */
export function isRiverComplete(r: RiverView): boolean {
  const missionOk = !r.hasMission || r.missionDone;
  const quizOk = r.quizzes.every((q) => r.quizSolvedIds.has(q.id)); // 0문항이면 true
  return missionOk && quizOk;
}

export function solvedCount(r: RiverView): number {
  return r.quizzes.filter((q) => r.quizSolvedIds.has(q.id)).length;
}
