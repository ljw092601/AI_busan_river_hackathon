import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KAKAO_SDK_SCRIPT_ID,
  KakaoMapsError,
  loadKakaoMaps,
  resetKakaoMapsLoader,
} from './loadKakaoMaps';

/**
 * SDK 로더 테스트.
 *
 * jsdom은 외부 <script>를 실제로 받아오지 않습니다 — onload/onerror가 저절로
 * 발생하지 않으므로, 우리가 직접 이벤트를 던져 각 실패 분기를 재현합니다.
 * (지도 렌더 자체는 SDK가 없어 테스트할 수 없습니다.)
 */

const KEY = 'test-javascript-key';

function scriptEl(): HTMLScriptElement | null {
  return document.getElementById(KAKAO_SDK_SCRIPT_ID) as HTMLScriptElement | null;
}

/** 스크립트는 받았고, SDK가 window.kakao를 설치한 상태를 흉내 냅니다. */
function installSdk(options: { autoloadWorks?: boolean } = {}) {
  const maps: Record<string, unknown> = {
    load: (cb: () => void) => {
      // autoload=false 이므로 Map 생성자는 load() 콜백 시점에야 생깁니다.
      if (options.autoloadWorks !== false) maps.Map = function KakaoMap() {};
      cb();
    },
  };
  window.kakao = { maps } as unknown as Window['kakao'];
  return maps;
}

beforeEach(() => {
  vi.stubEnv('VITE_KAKAO_MAP_KEY', KEY);
});

afterEach(() => {
  resetKakaoMapsLoader();
  delete window.kakao;
  vi.unstubAllEnvs();
});

describe('loadKakaoMaps — 실패 분기', () => {
  it('키가 없으면 .env.local과 JavaScript 키를 짚어 준다', async () => {
    vi.stubEnv('VITE_KAKAO_MAP_KEY', '');

    const err = await loadKakaoMaps().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(KakaoMapsError);
    expect((err as KakaoMapsError).code).toBe('missing-key');
    expect((err as KakaoMapsError).message).toContain('.env.local');
    expect((err as KakaoMapsError).message).toContain('JavaScript 키');
    // 키가 없으면 아예 붙이지 않습니다 — 실패할 요청을 보낼 이유가 없습니다.
    expect(scriptEl()).toBeNull();
  });

  it('공백만 있는 키도 없는 것으로 본다', async () => {
    vi.stubEnv('VITE_KAKAO_MAP_KEY', '   ');
    const err = await loadKakaoMaps().catch((e: unknown) => e);
    expect((err as KakaoMapsError).code).toBe('missing-key');
  });

  it('스크립트를 못 받으면 **도메인 등록**을 1순위 원인으로 안내한다', async () => {
    // 카카오 앱 키는 콘솔에 등록한 도메인에서만 동작합니다. 이 안내가 없으면
    // 사용자는 아무 단서 없이 빈 지도만 보게 됩니다.
    const promise = loadKakaoMaps();
    scriptEl()!.dispatchEvent(new Event('error'));

    const err = await promise.catch((e: unknown) => e);
    expect((err as KakaoMapsError).code).toBe('script-error');

    const message = (err as KakaoMapsError).message;
    expect(message).toContain('플랫폼');
    expect(message).toContain('사이트 도메인');
    expect(message).toContain(window.location.origin);
  });

  it('실패한 <script>는 남기지 않는다', async () => {
    const promise = loadKakaoMaps();
    scriptEl()!.dispatchEvent(new Event('error'));
    await promise.catch(() => undefined);
    expect(scriptEl()).toBeNull();
  });

  it('스크립트는 받았는데 window.kakao가 없으면 도메인 안내로 떨어진다', async () => {
    // 도메인 미등록 시 카카오가 200으로 에러 스크립트를 내려주는 경우가 있어
    // onload가 성공처럼 발생합니다. kakao 전역 유무로 다시 확인해야 합니다.
    const promise = loadKakaoMaps();
    scriptEl()!.dispatchEvent(new Event('load'));

    const err = await promise.catch((e: unknown) => e);
    expect((err as KakaoMapsError).code).toBe('script-error');
    expect((err as KakaoMapsError).message).toContain('사이트 도메인');
  });

  it('load() 콜백이 끝나도 Map 생성자가 없으면 실패로 본다', async () => {
    const promise = loadKakaoMaps();
    installSdk({ autoloadWorks: false });
    scriptEl()!.dispatchEvent(new Event('load'));

    const err = await promise.catch((e: unknown) => e);
    expect((err as KakaoMapsError).code).toBe('script-error');
  });
});

describe('loadKakaoMaps — 성공과 캐싱', () => {
  it('onload가 아니라 kakao.maps.load() 콜백에서 resolve 한다', async () => {
    const promise = loadKakaoMaps();
    const maps = installSdk();
    const loadSpy = vi.spyOn(maps as { load: (cb: () => void) => void }, 'load');

    scriptEl()!.dispatchEvent(new Event('load'));

    await expect(promise).resolves.toBe(maps);
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('autoload=false 로 요청한다', () => {
    void loadKakaoMaps().catch(() => undefined);
    const src = scriptEl()!.src;
    expect(src).toContain('//dapi.kakao.com/v2/maps/sdk.js');
    expect(src).toContain('autoload=false');
    expect(src).toContain(`appkey=${KEY}`);
    scriptEl()!.dispatchEvent(new Event('error'));
  });

  it('StrictMode 이중 마운트에도 <script>는 하나만 붙는다', async () => {
    // 두 번 주입하면 SDK가 두 번 초기화되어 첫 지도의 내부 상태를 밟습니다.
    const first = loadKakaoMaps();
    const second = loadKakaoMaps();
    expect(second).toBe(first);
    expect(document.querySelectorAll(`#${KAKAO_SDK_SCRIPT_ID}`).length).toBe(1);

    installSdk();
    scriptEl()!.dispatchEvent(new Event('load'));
    await expect(first).resolves.toBeDefined();

    // 이미 준비된 뒤의 호출도 같은 결과를 즉시 돌려줍니다.
    await expect(loadKakaoMaps()).resolves.toBe(await first);
  });

  it('실패한 시도는 기억하지 않는다 — 다시 시도가 실제로 다시 시도된다', async () => {
    const first = loadKakaoMaps();
    scriptEl()!.dispatchEvent(new Event('error'));
    await first.catch(() => undefined);

    const second = loadKakaoMaps();
    expect(second).not.toBe(first);
    expect(scriptEl()).not.toBeNull(); // 새 스크립트를 다시 붙였다

    installSdk();
    scriptEl()!.dispatchEvent(new Event('load'));
    await expect(second).resolves.toBeDefined();
  });

  it('SDK가 이미 살아 있으면(HMR) 스크립트를 다시 붙이지 않는다', async () => {
    const maps = installSdk();
    (maps as Record<string, unknown>).Map = function KakaoMap() {};

    await expect(loadKakaoMaps()).resolves.toBe(maps);
    expect(scriptEl()).toBeNull();
  });
});
