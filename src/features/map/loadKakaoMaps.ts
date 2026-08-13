import type { KakaoMaps } from './kakao';

/**
 * 카카오맵 SDK 로더.
 *
 * ★ 반드시 지켜야 하는 두 가지
 *
 * 1) **한 번만 로드하고 약속(Promise)을 기억합니다.**
 *    React 18 StrictMode는 개발 모드에서 effect를 두 번 실행합니다. 그대로 두면
 *    <script>가 두 개 붙고 SDK가 두 번 초기화되어, 두 번째 초기화가 첫 번째 지도의
 *    내부 상태를 밟습니다(지도가 회색으로만 남거나 이벤트가 안 먹는 증상).
 *
 * 2) **`autoload=false` + `kakao.maps.load(cb)`**
 *    autoload를 끄지 않으면 스크립트 onload 시점에 `window.kakao.maps`가 아직
 *    비어 있어 `new kakao.maps.Map(...)`이 TypeError로 터집니다. onload는
 *    "파일을 받았다"일 뿐 "SDK가 준비됐다"가 아닙니다.
 *
 * ⚠️ 실패했을 때는 기억해 둔 Promise를 버립니다. 안 그러면 '다시 시도' 버튼이
 *    영원히 같은 실패를 되돌려 줍니다.
 */

const SDK_URL = 'https://dapi.kakao.com/v2/maps/sdk.js';
export const KAKAO_SDK_SCRIPT_ID = 'kakao-maps-sdk';

/** 스크립트 수신 / SDK 초기화 각각의 상한. 넘으면 스켈레톤이 영원히 도는 것을 막습니다. */
const LOAD_TIMEOUT_MS = 15_000;

export type KakaoMapsErrorCode =
  | 'missing-key'   // VITE_KAKAO_MAP_KEY 없음
  | 'script-error'  // 스크립트를 못 받음 — 대부분 도메인 미등록
  | 'timeout'       // 응답이 없음
  | 'no-dom';       // 브라우저가 아닌 환경(SSR/테스트)

export class KakaoMapsError extends Error {
  readonly code: KakaoMapsErrorCode;
  constructor(code: KakaoMapsErrorCode, message: string) {
    super(message);
    this.name = 'KakaoMapsError';
    this.code = code;
  }
}

function currentOrigin(): string {
  try {
    return window.location.origin;
  } catch {
    return 'http://localhost:5173';
  }
}

const MISSING_KEY_MESSAGE =
  '지도 키(VITE_KAKAO_MAP_KEY)가 설정되어 있지 않아요. ' +
  '프로젝트 루트의 .env.local 에 Kakao Developers > 내 애플리케이션 > 앱 키 의 ' +
  '**JavaScript 키**를 넣고 개발 서버를 다시 시작해 주세요. (REST API 키가 아닙니다)';

/**
 * ★ 이 문구가 이 파일에서 가장 중요합니다.
 *   카카오 앱 키는 **콘솔에 등록한 도메인에서만** 동작합니다. 등록하지 않으면
 *   키가 정확해도 지도가 뜨지 않고, 화면에는 아무 단서도 남지 않습니다
 *   (콘솔 로그를 열어봐야 겨우 보입니다). 지도 실패 원인 1순위라서
 *   사용자에게 보이는 문구에 해결 방법을 그대로 적습니다.
 */
function domainMessage(): string {
  return (
    '카카오 지도를 불러오지 못했어요.\n' +
    `가장 흔한 원인은 도메인 미등록입니다. Kakao Developers > 내 애플리케이션 > 앱 설정 > 플랫폼 > Web 의 ` +
    `'사이트 도메인'에 지금 접속한 주소(${currentOrigin()})를 추가하고 새로고침해 주세요.\n` +
    '주소를 이미 등록했다면 인터넷 연결 또는 광고 차단 확장 프로그램(dapi.kakao.com 차단)을 확인해 주세요.'
  );
}

function timeoutMessage(): string {
  return (
    '지도를 불러오는 데 너무 오래 걸려요.\n' +
    '네트워크 상태를 확인하고 다시 시도해 주세요. ' +
    `계속 실패한다면 Kakao Developers > 플랫폼 > Web 의 '사이트 도메인'에 ${currentOrigin()} 이(가) ` +
    '등록되어 있는지 확인해 주세요.'
  );
}

/** 사용자에게 그대로 보여줄 수 있는 한국어 문구. KakaoMapsError가 아닌 경우의 최후 보루. */
export const KAKAO_FALLBACK_MESSAGE =
  '지도를 표시하지 못했어요. 잠시 후 다시 시도해 주세요. 지도가 없어도 아래 하천 목록은 그대로 사용할 수 있어요.';

function appKey(): string | null {
  const raw = import.meta.env.VITE_KAKAO_MAP_KEY;
  const key = typeof raw === 'string' ? raw.trim() : '';
  return key.length > 0 ? key : null;
}

/** load()까지 끝난 네임스페이스인지 확인. Map 생성자 유무가 가장 확실한 신호입니다. */
function readyMaps(): KakaoMaps | null {
  const maps = typeof window === 'undefined' ? undefined : window.kakao?.maps;
  return maps && typeof maps.Map === 'function' ? (maps as KakaoMaps) : null;
}

let pending: Promise<KakaoMaps> | null = null;

export function loadKakaoMaps(): Promise<KakaoMaps> {
  if (pending) return pending;
  const p = begin();
  pending = p;
  // 실패한 시도는 기억하지 않습니다 — '다시 시도'가 실제로 다시 시도해야 하니까요.
  // (여기서 catch를 붙여 두면 unhandled rejection 경고도 나지 않습니다.)
  p.catch(() => {
    if (pending === p) pending = null;
  });
  return p;
}

/** 테스트/HMR용. 기억한 Promise와 주입한 스크립트를 모두 버립니다. */
export function resetKakaoMapsLoader(): void {
  pending = null;
  if (typeof document !== 'undefined') {
    document.getElementById(KAKAO_SDK_SCRIPT_ID)?.remove();
  }
}

async function begin(): Promise<KakaoMaps> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new KakaoMapsError('no-dom', '브라우저 환경이 아니라 지도를 만들 수 없어요.');
  }

  // HMR로 모듈만 다시 평가된 경우 — SDK는 이미 window에 살아 있습니다.
  const already = readyMaps();
  if (already) return already;

  const key = appKey();
  if (!key) throw new KakaoMapsError('missing-key', MISSING_KEY_MESSAGE);

  await injectScript(key);
  return initMaps();
}

function injectScript(key: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // 직전 실패로 남은 <script>가 있으면 지웁니다. 그대로 두면 브라우저가
    // 실패한 응답을 캐시해 재시도가 조용히 같은 실패를 반복합니다.
    document.getElementById(KAKAO_SDK_SCRIPT_ID)?.remove();

    const el = document.createElement('script');
    el.id = KAKAO_SDK_SCRIPT_ID;
    el.async = true;
    el.src = `${SDK_URL}?appkey=${encodeURIComponent(key)}&autoload=false`;

    let settled = false;
    let timer = 0;
    const finish = (err?: KakaoMapsError) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      el.onload = null;
      el.onerror = null;
      if (err) reject(err);
      else resolve();
    };

    el.onload = () => finish();
    el.onerror = () => {
      el.remove();
      finish(new KakaoMapsError('script-error', domainMessage()));
    };
    timer = window.setTimeout(
      () => finish(new KakaoMapsError('timeout', timeoutMessage())),
      LOAD_TIMEOUT_MS,
    );

    document.head.appendChild(el);
  });
}

function initMaps(): Promise<KakaoMaps> {
  return new Promise<KakaoMaps>((resolve, reject) => {
    const maps = window.kakao?.maps;
    if (!maps || typeof maps.load !== 'function') {
      // 스크립트는 받았는데 kakao 전역이 없다 = 카카오가 에러 응답을 내려준 것.
      reject(new KakaoMapsError('script-error', domainMessage()));
      return;
    }

    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new KakaoMapsError('timeout', timeoutMessage()));
    }, LOAD_TIMEOUT_MS);

    maps.load(() => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      const ready = readyMaps();
      if (ready) resolve(ready);
      else reject(new KakaoMapsError('script-error', domainMessage()));
    });
  });
}
