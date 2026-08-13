import confetti from 'canvas-confetti';
import { playSound } from './sound';

/**
 * 하천 완수 축하 연출.
 *
 * `prefers-reduced-motion`을 켠 사용자에게는 **색종이만 생략**하고 소리는 그대로 냅니다.
 * (연출을 통째로 없애면 "완수했다"는 신호 자체가 사라져 버립니다.)
 */

export function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

export function celebrate(): void {
  playSound('success');
  if (prefersReducedMotion()) return;
  try {
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
  } catch {
    // jsdom처럼 canvas가 없는 환경에서도 조용히 넘어갑니다.
  }
}
