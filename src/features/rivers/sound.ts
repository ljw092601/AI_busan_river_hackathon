import { useSyncExternalStore } from 'react';

/**
 * 미션·퀴즈 효과음 — 오디오 **파일 없이** Web Audio로 그때그때 합성합니다.
 *
 * ★ AudioContext를 모듈 로드 시점에 만들지 않는 이유
 *   브라우저는 사용자 제스처(탭/클릭) 이전에 만들어진 AudioContext를 `suspended`로
 *   묶어 둡니다. import 시점에 만들면 첫 소리가 통째로 사라지거나 콘솔이 경고로 덮입니다.
 *   그래서 첫 재생 때 만들고, 이후에는 **하나를 재사용**합니다.
 *   (컨텍스트를 매번 새로 만들면 모바일에서 몇십 번 만에 오디오가 죽습니다.)
 *
 * ★ 소리는 절대 화면을 망가뜨리면 안 됩니다
 *   자동재생 정책·권한·구형 브라우저 등 실패 경로가 많아 전부 try/catch로 삼킵니다.
 *   소리가 안 나는 것은 불편이지만, 미션이 안 눌리는 것은 버그입니다.
 */

export type SoundName = 'success' | 'click' | 'camera' | 'wrong';

const STORAGE_KEY = 'busan-river:sound-muted';

interface LegacyWindow {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

let ctx: AudioContext | null = null;
let muted = readStoredMuted();
const listeners = new Set<() => void>();

function readStoredMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1';
  } catch {
    // Safari 프라이빗 모드 등에서 localStorage 접근 자체가 throw 합니다.
    return false;
  }
}

/** 첫 재생 때 한 번만 만들고 계속 재사용합니다. */
function getContext(): AudioContext | null {
  try {
    if (!ctx) {
      const w = globalThis as unknown as LegacyWindow;
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    // 제스처 이전에 만들어졌다면 여기서 깨웁니다(실패해도 무시).
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function isSoundMuted(): boolean {
  return muted;
}

export function setSoundMuted(next: boolean): void {
  if (muted === next) return;
  muted = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    /* 저장에 실패해도 이번 세션 동안은 동작합니다 */
  }
  listeners.forEach((fn) => fn());
}

/** 음소거를 뒤집고 새 상태를 돌려줍니다. */
export function toggleSoundMuted(): boolean {
  setSoundMuted(!muted);
  if (!muted) playSound('click'); // 켠 순간 확인용 소리
  return muted;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 음소거 상태 + 토글. localStorage에 남아 새로고침해도 유지됩니다. */
export function useSoundMuted(): { muted: boolean; toggle: () => void } {
  const value = useSyncExternalStore(
    subscribe,
    () => muted,
    () => false,
  );
  return { muted: value, toggle: toggleSoundMuted };
}

export function playSound(type: SoundName): void {
  if (muted) return;
  try {
    const audio = getContext();
    if (!audio) return;

    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.connect(gain);
    gain.connect(audio.destination);

    const t = audio.currentTime;

    switch (type) {
      // 도-미-솔-도 상승 아르페지오 (완수)
      case 'success':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, t);
        osc.frequency.setValueAtTime(659.25, t + 0.1);
        osc.frequency.setValueAtTime(783.99, t + 0.2);
        osc.frequency.setValueAtTime(1046.5, t + 0.3);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
        osc.start(t);
        osc.stop(t + 0.6);
        break;
      case 'click':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, t);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
        osc.start(t);
        osc.stop(t + 0.08);
        break;
      case 'camera':
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, t);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
        osc.start(t);
        osc.stop(t + 0.05);
        break;
      case 'wrong':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.setValueAtTime(180, t + 0.15);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.3);
        break;
    }
  } catch {
    /* 소리는 부가 기능입니다 — 실패해도 화면은 그대로 동작해야 합니다 */
  }
}
