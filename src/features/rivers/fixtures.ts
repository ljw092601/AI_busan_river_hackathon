import type { MissionConfig, MissionKind, QuizView, RiverView } from './types';

/**
 * 테스트용 하천 만들기.
 *
 * 실제 DB의 5대 하천은 구성이 제각각입니다(퀴즈만 / 미션만 / 둘 다).
 * 그 조합을 손으로 매번 적으면 테스트마다 조금씩 달라져 정작 중요한 차이가 묻힙니다.
 */

export function makeQuiz(overrides: Partial<QuizView> = {}): QuizView {
  return {
    id: 'q1',
    seq: 1,
    question: '온천천에 돌아온 멸종위기 야생생물 1급 동물은?',
    options: ['수달', '삵', '반달가슴곰'],
    answerIdx: 0,
    explanation: '수질이 좋아지면서 수달이 돌아왔어요.',
    ...overrides,
  };
}

export function makeRiver(overrides: Partial<RiverView> = {}): RiverView {
  const missionKind = (overrides.missionKind ?? 'acknowledge') as MissionKind | null;
  return {
    id: 'river-1',
    slug: 'oncheoncheon',
    name: '온천천',
    subtitle: '도심을 가로지르는 생태하천',
    summary: '수질이 좋아지며 수달이 돌아온 하천.',
    icon: '🦦',
    theme: 'emerald',
    badgeCode: 'river_oncheoncheon',
    detailedHistory: '',
    detailedEcology: '',

    missionKind,
    missionTitle: '온천천 수달 카메라스냅 미션',
    missionBody: '수달을 찾아 사진을 찍어 주세요.',
    missionConfig: {} as MissionConfig,

    quizzes: [makeQuiz()],

    hasMission: missionKind != null,
    missionDone: false,
    quizSolvedIds: new Set<string>(),
    badgeEarned: false,
    ...overrides,
  };
}
