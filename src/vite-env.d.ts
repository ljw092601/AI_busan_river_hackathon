/**
 * 프로젝트 전역 앰비언트 선언.
 *
 * tsconfig의 `types: ["vitest/globals"]`가 @types 자동 포함을 끄기 때문에
 * `vite/client`의 선언이 자동으로 들어오지 않습니다. 필요한 것만 여기에 둡니다.
 *
 * ⚠️ CSS Modules 선언은 **이 파일에만** 두세요.
 *    같은 패턴을 두 파일에서 `declare module` 하면 TS2300(Duplicate identifier)로
 *    타입체크가 통째로 깨집니다. 각 feature 폴더에 있던 css-modules.d.ts 는 이 파일로 대체되었습니다.
 */

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

/**
 * ⚠️ 여기에 선언한 값은 **번들에 그대로 박혀 브라우저로 나갑니다.**
 *    Vite는 `VITE_` 접두사가 붙은 것만 클라이언트에 노출합니다.
 *    SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY 등은 절대 VITE_ 접두사를 붙이지 마세요 —
 *    붙이는 순간 앱을 여는 누구나 읽을 수 있고, RLS를 통째로 우회하는 키가 공개됩니다.
 *    그 키들은 Edge Function(서버)에서만 씁니다.
 */
interface ImportMetaEnv {
  // Vite 내장 변수. `vite/client`를 자동 포함하지 않으므로 직접 선언합니다.
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;

  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_KAKAO_MAP_KEY?: string;
  /** 'none' | 'claude' — 판별 엔진 선택. 없으면 'none'(수동 확정)으로 동작합니다. */
  readonly VITE_CLASSIFIER_ENGINE?: string;
  readonly VITE_CLASSIFIER_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
