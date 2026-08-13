/**
 * QuizRunner 통합 테스트 — 훅과 화면이 실제로 맞물리는지 확인합니다.
 *
 * 채점 규칙 자체의 검증은 quizMachine.test.ts에 있습니다.
 * 여기서는 "아이가 실제로 누르는 순서"대로 진행했을 때
 * 콜백(onExplanationView / onComplete)이 약속대로 나오는지만 봅니다.
 *
 * @testing-library가 프로젝트에 없어 react-dom으로 직접 렌더합니다.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QuizRunner } from './QuizRunner';
import { spot1Quizzes } from './mockQuizzes';
import type { QuizSessionResult } from './types';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** 보기 버튼들 — 선택지는 aria-pressed를 가진 실제 button입니다 */
function optionButtons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'));
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent === text);
}

function click(el: HTMLElement) {
  act(() => {
    el.click();
  });
}

describe('QuizRunner', () => {
  it('문항을 순차 진행하고 진행 표시가 따라온다', () => {
    act(() => {
      root.render(<QuizRunner quizzes={spot1Quizzes} onComplete={() => {}} />);
    });

    expect(container.textContent).toContain('1 / 3');
    expect(optionButtons()).toHaveLength(3);

    click(optionButtons()[0]);
    click(buttonByText('다음 문제')!);

    expect(container.textContent).toContain('2 / 3');
  });

  it('O/X 문항은 보기 2개로 그려진다', () => {
    // 3번 문항이 O/X — 앞의 두 문항을 통과시킨 뒤 확인
    act(() => {
      root.render(<QuizRunner quizzes={spot1Quizzes} onComplete={() => {}} />);
    });

    for (let i = 0; i < 2; i++) {
      click(optionButtons()[0]);
      click(buttonByText('다음 문제')!);
    }

    expect(optionButtons()).toHaveLength(2);
    expect(container.textContent).toContain('맞아요');
  });

  it('오답이어도 해설을 보여주고 "틀렸다"는 말을 쓰지 않는다', () => {
    act(() => {
      root.render(<QuizRunner quizzes={spot1Quizzes} onComplete={() => {}} />);
    });

    const wrongIdx = spot1Quizzes[0].answerIdx === 0 ? 1 : 0;
    click(optionButtons()[wrongIdx]);

    expect(container.textContent).toContain(spot1Quizzes[0].explanation);
    expect(container.textContent).toContain('+5P');
    expect(container.textContent).not.toContain('틀렸');
  });

  it('응답 후에는 답을 바꿀 수 없다 (aria-disabled로 잠금, 포커스는 유지)', () => {
    act(() => {
      root.render(<QuizRunner quizzes={spot1Quizzes} onComplete={() => {}} />);
    });

    click(optionButtons()[0]);
    const buttons = optionButtons();
    expect(buttons.every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true);
    expect(buttons.some((b) => b.disabled)).toBe(false); // disabled는 포커스를 잃게 하므로 쓰지 않음

    click(buttons[1]);
    expect(optionButtons()[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('해설 열람을 문항당 1회씩 알린다 (PLAN.md §10)', () => {
    const viewed: string[] = [];
    act(() => {
      root.render(
        <QuizRunner
          quizzes={spot1Quizzes}
          onComplete={() => {}}
          onExplanationView={(id) => viewed.push(id)}
        />,
      );
    });

    click(optionButtons()[0]);
    expect(viewed).toEqual([spot1Quizzes[0].id]);

    click(buttonByText('다음 문제')!);
    click(optionButtons()[0]);
    expect(viewed).toEqual([spot1Quizzes[0].id, spot1Quizzes[1].id]);
  });

  it('완주하면 결과를 1회 통지한다 — 적립은 하지 않는다', () => {
    const results: QuizSessionResult[] = [];
    act(() => {
      root.render(<QuizRunner quizzes={spot1Quizzes} onComplete={(r) => results.push(r)} />);
    });

    spot1Quizzes.forEach((quiz, i) => {
      click(optionButtons()[quiz.answerIdx]);
      click(buttonByText(i === spot1Quizzes.length - 1 ? '결과 보기' : '다음 문제')!);
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      spotId: spot1Quizzes[0].spotId,
      total: 3,
      correctCount: 3,
      totalPoints: 45,
      explanationViewRate: 1,
    });
    expect(container.textContent).toContain('퀴즈 끝!');
  });

  it('문항이 없어도 깨지지 않는다', () => {
    const results: QuizSessionResult[] = [];
    act(() => {
      root.render(<QuizRunner quizzes={[]} onComplete={(r) => results.push(r)} />);
    });

    expect(container.textContent).toContain('아직 퀴즈가 없어요');
    expect(results).toHaveLength(0); // 빈 적립을 만들지 않습니다
  });
});
