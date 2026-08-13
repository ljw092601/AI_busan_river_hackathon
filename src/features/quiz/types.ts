/**
 * 퀴즈 트랙 공개 타입.
 *
 * 이 모듈은 **포인트를 적립하지 않습니다.** 채점 결과만 계산해서
 * `onComplete(result)`로 넘기고, 원장(points_ledger) 기록은 포인트 트랙이 합니다.
 * (PLAN.md §4.2 — 잔액 컬럼이 아니라 원장)
 */

import type { PointReason } from '@/types/domain';

/** 채점 결과가 유발하는 포인트 사유 — 퀴즈는 이 둘만 만듭니다 (PLAN.md §6.1) */
export type QuizPointReason = Extract<PointReason, 'quiz_correct' | 'quiz_wrong'>;

/**
 * 한 문항의 진행 단계.
 *   question    미응답 — 보기를 고르는 중
 *   explanation 응답 완료 — 정답/오답 표시 + 해설 노출
 *   done        전 문항 종료
 */
export type QuizStep = 'question' | 'explanation' | 'done';

/** 문항 1개의 응답 기록 */
export interface QuizAnswer {
  quizId: string;
  spotId: string;
  /** 아이가 고른 보기 인덱스 */
  selectedIdx: number;
  isCorrect: boolean;
  /** 정답 15P / 오답 5P — 오답에도 포인트를 줍니다 (PLAN.md §6.1) */
  points: number;
  reason: QuizPointReason;
  /** 해설을 실제로 노출했는지 — PLAN.md §10 "퀴즈 해설 열람률 80% 이상"의 원자료 */
  explanationViewed: boolean;
  /** epoch ms */
  answeredAt: number;
}

/**
 * 퀴즈 1세트(= 스팟 1곳)의 최종 결과.
 * `onComplete` 콜백의 페이로드입니다.
 */
export interface QuizSessionResult {
  /** 문항이 없으면 null */
  spotId: string | null;
  /** 출제된 문항 수 */
  total: number;
  /** 실제 응답한 문항 수 */
  answered: number;
  correctCount: number;
  wrongCount: number;
  /** 이번 세트에서 적립되어야 할 총 포인트 (적립은 포인트 트랙이 수행) */
  totalPoints: number;
  explanationViewedCount: number;
  /** 0..1 — 응답 수 대비 해설 열람 비율. 응답이 없으면 0 */
  explanationViewRate: number;
  /** 문항별 상세 — 원장 기록·오답 분석용 */
  answers: QuizAnswer[];
}
