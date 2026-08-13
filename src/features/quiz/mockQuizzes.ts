/**
 * 개발·테스트용 목 데이터.
 *
 * `content/oncheoncheon-draft.md` §2의 실제 문항을 `Quiz` 타입으로 옮긴 것입니다.
 * ⚠️ 실제 콘텐츠는 `src/data/`(다른 트랙)가 소유합니다. 이 파일은 그 데이터가 붙기 전까지의
 *    임시 대체물이며, 프로덕션 화면에서 import 하지 마세요.
 *
 * spotId는 임의의 임시 식별자입니다 — 실제 스팟 id와 맞출 필요 없습니다.
 */

import type { Quiz } from '@/types/domain';

/** ① 물이 시작되는 곳 — 발원 · 물의 순환 */
export const spot1Quizzes: Quiz[] = [
  {
    id: 'mock-oc1-q1',
    spotId: 'mock-oc-spot-1',
    question: '온천천의 물은 원래 어디에서 왔을까?',
    options: ['수돗물을 흘려보낸 것', '금정산에 내린 비', '바닷물이 올라온 것'],
    answerIdx: 1,
    explanation:
      '산에 내린 비가 땅속으로 스며들었다가 다시 솟아나 하천이 됩니다. 이걸 "발원"이라고 해요.',
  },
  {
    id: 'mock-oc1-q2',
    spotId: 'mock-oc-spot-1',
    question: '물의 순환에서 바다 다음에 오는 것은?',
    options: ['구름', '땅속', '하천'],
    answerIdx: 0,
    explanation: '바닷물이 햇빛에 증발해 구름이 되고, 구름이 비가 되어 다시 산에 내립니다.',
  },
  {
    id: 'mock-oc1-q3',
    spotId: 'mock-oc-spot-1',
    // O/X 문항 — options 길이가 2면 O/X 화면으로 그려집니다.
    question: '상류의 물은 하류보다 대체로 물살이 빠르고 차가워요.',
    options: ['맞아요', '아니에요'],
    answerIdx: 0,
    explanation: '상류는 경사가 급해서 물살이 빠르고, 산 그늘에 있어 물이 더 차가워요.',
  },
];

/** ② 여울과 징검다리 — 물살 · 물속 산소 */
export const spot2Quizzes: Quiz[] = [
  {
    id: 'mock-oc2-q1',
    spotId: 'mock-oc-spot-2',
    question: '물이 하얗게 부서지는 얕고 빠른 곳을 뭐라고 할까?',
    options: ['소', '여울', '늪'],
    answerIdx: 1,
    explanation:
      '얕고 빠른 곳은 여울, 깊고 조용한 곳은 소. 하천은 이 둘이 번갈아 나타나요.',
  },
  {
    id: 'mock-oc2-q2',
    spotId: 'mock-oc-spot-2',
    question: '여울이 하천에 좋은 이유는?',
    options: ['물이 더 깨끗해 보여서', '물에 산소가 녹아들어서', '물이 빨리 흘러가서'],
    answerIdx: 1,
    explanation: '물이 부서지며 공기와 섞이면 산소가 녹아요. 물고기가 숨 쉴 수 있게 됩니다.',
  },
];

/** ④ 물의 건강검진소 — 수질 · 지표생물 (코스의 핵심) */
export const spot4Quizzes: Quiz[] = [
  {
    id: 'mock-oc4-q1',
    spotId: 'mock-oc-spot-4',
    question: '"지표생물"이란 무엇일까?',
    options: [
      '지도에 표시된 생물',
      '어떤 생물이 사는지로 물의 상태를 알려주는 생물',
      '가장 큰 생물',
    ],
    answerIdx: 1,
    explanation: '깨끗한 물에만 사는 생물이 있으면 그 물은 깨끗하다는 뜻이에요.',
  },
  {
    id: 'mock-oc4-q2',
    spotId: 'mock-oc-spot-4',
    question: '다음 중 더 맑은 물에 사는 생물은?',
    options: ['실지렁이', '옆새우', '거머리'],
    answerIdx: 1,
    explanation: '옆새우는 아주 맑은 물(1급수)에서 살아요. 실지렁이는 흐린 물에서도 삽니다.',
  },
  {
    id: 'mock-oc4-q3',
    spotId: 'mock-oc-spot-4',
    question: '다슬기를 발견했다면, 그 물은 어느 정도 맑다는 뜻이에요.',
    options: ['맞아요', '아니에요'],
    answerIdx: 0,
    explanation: '다슬기는 2급수 정도의 물에서 삽니다. 아주 더러운 물에서는 살 수 없어요.',
  },
];

export const mockQuizzesBySpot: Record<string, Quiz[]> = {
  'mock-oc-spot-1': spot1Quizzes,
  'mock-oc-spot-2': spot2Quizzes,
  'mock-oc-spot-4': spot4Quizzes,
};

export const mockQuizzes: Quiz[] = [...spot1Quizzes, ...spot2Quizzes, ...spot4Quizzes];

export function getMockQuizzes(spotId: string): Quiz[] {
  return mockQuizzesBySpot[spotId] ?? [];
}
