/**
 * 퀴즈 시드 — 온천천 코스
 *
 * 출처: content/oncheoncheon-draft.md §2 각 스팟의 「퀴즈」 블록
 * 근거: src/types/domain.ts (Quiz)
 *
 * ⚠️ 🟡 초안 — 교사 검수 필요 (어휘 수준·교육과정 연계). 초안 §1 검증 상태 표 참조.
 *
 * ── 변환 규칙 ──────────────────────────────────────────────────
 *  · 초안에서 **볼드**로 표시된 보기가 정답 → 그 보기의 배열 인덱스가 answerIdx.
 *  · 보기 앞의 ①②③ 번호는 표시 계층의 몫이므로 options 문자열에서 제거했습니다.
 *  · O/X 문항은 options: ['O', 'X'] 로 두고, 문두의 "(O/X) " 표기만 제거했습니다
 *    (보기가 O/X이므로 중복 표기). 문장 자체는 그대로입니다.
 *  · 그 외 한국어 문안은 초안 그대로입니다.
 *
 * ⚠️ 문항 수: 초안의 퀴즈를 세면 17문항입니다 (①3 ②2 ③3 ④3 ⑤3 ⑥3).
 *    작업 지시서에는 16문항으로 적혀 있었으나, 초안 표를 기준으로 17문항 전부 옮겼습니다.
 *
 * ⚠️ 정답 위치 편향 — 콘텐츠 검토 필요
 *    3지선다 14문항 중 12문항의 정답이 ②(answerIdx 1)입니다.
 *    (answerIdx 0: 1문항 / 1: 12문항 / 2: 1문항)
 *    아이가 내용을 몰라도 "가운데 고르기"로 맞힐 수 있습니다. 보기 순서 재배치 권장.
 * ────────────────────────────────────────────────────────────────
 */

import type { Quiz } from '../types/domain';
import type { SpotId } from './oncheoncheon';

/** spotId가 실재하는 스팟이어야 한다는 제약을 얹은 Quiz */
type QuizSeed = Quiz & { spotId: SpotId };

export const quizzes = [
  // ── ① 물이 시작되는 곳 ────────────────────────────────────────
  {
    id: 'quiz-oncheon-01-1',
    spotId: 'spot-oncheon-01',
    question: '온천천의 물은 원래 어디에서 왔을까?',
    options: ['수돗물을 흘려보낸 것', '금정산에 내린 비', '바닷물이 올라온 것'],
    answerIdx: 1,
    explanation:
      "산에 내린 비가 땅속으로 스며들었다가 다시 솟아나 하천이 됩니다. 이걸 '발원'이라고 해요.",
  },
  {
    id: 'quiz-oncheon-01-2',
    spotId: 'spot-oncheon-01',
    question: '물의 순환에서 바다 다음에 오는 것은?',
    options: ['구름', '땅속', '하천'],
    answerIdx: 0,
    explanation: '바닷물이 햇빛에 증발해 구름이 되고, 구름이 비가 되어 다시 산에 내립니다.',
  },
  {
    id: 'quiz-oncheon-01-3',
    spotId: 'spot-oncheon-01',
    question: '상류의 물은 하류보다 대체로 물살이 빠르고 차갑다.',
    options: ['O', 'X'],
    answerIdx: 0,
    explanation: '상류는 경사가 급해서 물살이 빠르고, 산 그늘에 있어 물이 더 차가워요.',
  },

  // ── ② 여울과 징검다리 ────────────────────────────────────────
  {
    id: 'quiz-oncheon-02-1',
    spotId: 'spot-oncheon-02',
    question: '물이 하얗게 부서지는 얕고 빠른 곳을 뭐라고 할까?',
    options: ['소', '여울', '늪'],
    answerIdx: 1,
    explanation: '얕고 빠른 곳은 여울, 깊고 조용한 곳은 소. 하천은 이 둘이 번갈아 나타나요.',
  },
  {
    id: 'quiz-oncheon-02-2',
    spotId: 'spot-oncheon-02',
    question: '여울이 하천에 좋은 이유는?',
    options: ['물이 더 깨끗해 보여서', '물에 산소가 녹아들어서', '물이 빨리 흘러가서'],
    answerIdx: 1,
    explanation: '물이 부서지며 공기와 섞이면 산소가 녹아요. 물고기가 숨 쉴 수 있게 됩니다.',
  },

  // ── ③ 새들의 식당 ────────────────────────────────────────────
  {
    id: 'quiz-oncheon-03-1',
    spotId: 'spot-oncheon-03',
    question: '백로와 왜가리가 이곳에 자주 오는 이유는?',
    options: ['물이 시원해서', '물이 얕아 물고기를 잡기 쉬워서', '사람이 먹이를 줘서'],
    answerIdx: 1,
    explanation: '얕은 물에서는 물고기가 잘 보이고 발로 서서 사냥할 수 있어요.',
  },
  {
    id: 'quiz-oncheon-03-2',
    spotId: 'spot-oncheon-03',
    question: '새를 관찰할 때 올바른 행동은?',
    options: ['가까이 가서 자세히 본다', '멀리서 조용히 지켜본다', '소리를 내서 날게 한다'],
    answerIdx: 1,
    explanation:
      "새가 놀라 날아가면 먹이를 못 먹어요. 관찰의 첫 번째 약속은 '방해하지 않기'입니다.",
  },
  {
    id: 'quiz-oncheon-03-3',
    spotId: 'spot-oncheon-03',
    question: '하천의 먹이사슬 순서로 알맞은 것은?',
    options: [
      '백로 → 물고기 → 물벌레',
      '물벌레 → 물고기 → 백로',
      '물고기 → 물벌레 → 백로',
    ],
    answerIdx: 1,
    explanation: '작은 물벌레를 물고기가 먹고, 물고기를 백로가 먹습니다.',
  },

  // ── ④ 물의 건강검진소 ────────────────────────────────────────
  {
    id: 'quiz-oncheon-04-1',
    spotId: 'spot-oncheon-04',
    question: "'지표생물'이란 무엇일까?",
    options: [
      '지도에 표시된 생물',
      '어떤 생물이 사는지로 물의 상태를 알려주는 생물',
      '가장 큰 생물',
    ],
    answerIdx: 1,
    explanation: '깨끗한 물에만 사는 생물이 있으면 그 물은 깨끗하다는 뜻이에요.',
  },
  {
    id: 'quiz-oncheon-04-2',
    spotId: 'spot-oncheon-04',
    question: '다음 중 더 맑은 물에 사는 생물은?',
    options: ['실지렁이', '옆새우', '거머리'],
    answerIdx: 1,
    explanation: '옆새우는 아주 맑은 물(1급수)에서 살아요. 실지렁이는 흐린 물에서도 삽니다.',
  },
  {
    id: 'quiz-oncheon-04-3',
    spotId: 'spot-oncheon-04',
    question: '다슬기를 발견했다면, 그 물은 어느 정도 맑다는 뜻이다.',
    options: ['O', 'X'],
    answerIdx: 0,
    explanation: '다슬기는 2급수 정도의 물에서 삽니다. 아주 더러운 물에서는 살 수 없어요.',
  },

  // ── ⑤ 되살아난 물길 ──────────────────────────────────────────
  {
    id: 'quiz-oncheon-05-1',
    spotId: 'spot-oncheon-05',
    question: '예전에 온천천이 오염되었던 가장 큰 이유는?',
    options: ['비가 안 와서', '생활하수가 그대로 흘러들어서', '물고기가 너무 많아서'],
    answerIdx: 1,
    explanation: '도시가 커지면서 집과 공장에서 나온 물이 하천으로 바로 흘러들었어요.',
  },
  {
    id: 'quiz-oncheon-05-2',
    spotId: 'spot-oncheon-05',
    question: '하천을 되살리기 위해 사람들이 한 일이 아닌 것은?',
    options: ['하수를 따로 처리하기', '물가에 나무 심기', '하천을 콘크리트로 덮기'],
    answerIdx: 2,
    explanation:
      '하천을 덮는 것(복개)은 오히려 하천을 죽이는 일이에요. 물이 햇빛과 공기를 못 만나거든요.',
  },
  {
    id: 'quiz-oncheon-05-3',
    spotId: 'spot-oncheon-05',
    question: '한 번 오염된 하천은 절대 되살릴 수 없다.',
    options: ['O', 'X'],
    answerIdx: 1,
    explanation:
      '온천천이 바로 되살아난 하천이에요. 다만 아주 오랜 시간과 많은 사람의 노력이 필요해요.',
  },

  // ── ⑥ 두 물이 만나는 곳 ──────────────────────────────────────
  {
    id: 'quiz-oncheon-06-1',
    spotId: 'spot-oncheon-06',
    question: '온천천은 어느 강으로 흘러들까?',
    options: ['낙동강', '수영강', '동천'],
    answerIdx: 1,
    explanation: '온천천은 수영강에 합류하고, 수영강은 바다로 흘러갑니다.',
  },
  {
    id: 'quiz-oncheon-06-2',
    spotId: 'spot-oncheon-06',
    question: '민물과 바닷물이 섞이는 곳을 뭐라고 할까?',
    options: ['여울', '기수역', '발원지'],
    answerIdx: 1,
    explanation:
      '강이 바다를 만나는 곳이에요. 민물 생물과 바다 생물을 함께 볼 수 있는 특별한 곳입니다.',
  },
  {
    id: 'quiz-oncheon-06-3',
    spotId: 'spot-oncheon-06',
    question: '오늘 걸어온 순서로 알맞은 것은?',
    options: [
      '바다 → 강 → 하천 → 산',
      '산 → 하천 → 강 → 바다',
      '하천 → 산 → 바다 → 강',
    ],
    answerIdx: 1,
    explanation: '물은 높은 곳에서 낮은 곳으로 흐릅니다. 산에서 시작해 바다로 가요.',
  },
] satisfies QuizSeed[];

/** 스팟별 퀴즈 */
export const quizzesBySpotId: Record<string, Quiz[]> = quizzes.reduce<Record<string, Quiz[]>>(
  (acc, q) => {
    (acc[q.spotId] ??= []).push(q);
    return acc;
  },
  {},
);

export const QUIZ_COUNT = quizzes.length;
