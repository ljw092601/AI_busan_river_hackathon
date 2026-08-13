/**
 * 하천별 색 테마.
 *
 * ★ 왜 클래스 문자열을 DB에 넣지 않고 여기에 두는가
 *   Tailwind는 빌드 시점에 **소스 코드를 정적으로 스캔**해서 실제로 쓰인 클래스만 남깁니다.
 *   `` `bg-${river.theme}-600` `` 처럼 런타임에 조립한 클래스는 스캐너 눈에 안 보이므로
 *   최종 CSS에서 통째로 사라지고, 화면에서는 색이 아예 안 나옵니다.
 *   그래서 DB에는 키('blue')만 두고, 완성된 클래스 문자열은 이 파일에 **문자 그대로** 적습니다.
 *
 *   새 테마를 추가할 때도 반드시 이 객체에 전체 문자열을 적어야 합니다.
 */

export type ThemeKey = 'blue' | 'amber' | 'emerald' | 'cyan' | 'teal';

export interface RiverTheme {
  /** 카드 아이콘 배경 + 모달 헤더 */
  gradient: string;
  /** 주요 버튼 */
  button: string;
  /** 강조 텍스트 (부제 등) */
  accent: string;
  /** 미션 패널 배경 */
  panelBg: string;
  /** 미션 패널 테두리 */
  panelBorder: string;
  /** 미션 패널 본문 텍스트 */
  panelText: string;
  /** STEP 1 배지 */
  stepBadge: string;
}

const THEMES: Record<ThemeKey, RiverTheme> = {
  blue: {
    gradient: 'from-blue-600 to-indigo-700',
    button: 'bg-blue-600 hover:bg-blue-700',
    accent: 'text-blue-600',
    panelBg: 'bg-blue-50',
    panelBorder: 'border-blue-200',
    panelText: 'text-blue-900',
    stepBadge: 'bg-blue-600 text-white',
  },
  amber: {
    gradient: 'from-amber-600 to-orange-700',
    button: 'bg-amber-600 hover:bg-amber-700',
    accent: 'text-amber-600',
    panelBg: 'bg-amber-50',
    panelBorder: 'border-amber-200',
    panelText: 'text-amber-900',
    stepBadge: 'bg-amber-600 text-white',
  },
  emerald: {
    gradient: 'from-emerald-500 to-teal-700',
    button: 'bg-emerald-600 hover:bg-emerald-700',
    accent: 'text-emerald-600',
    panelBg: 'bg-emerald-50',
    panelBorder: 'border-emerald-200',
    panelText: 'text-emerald-900',
    stepBadge: 'bg-emerald-600 text-white',
  },
  cyan: {
    gradient: 'from-cyan-600 to-blue-700',
    button: 'bg-cyan-600 hover:bg-cyan-700',
    accent: 'text-cyan-600',
    panelBg: 'bg-cyan-50',
    panelBorder: 'border-cyan-200',
    panelText: 'text-cyan-900',
    stepBadge: 'bg-cyan-600 text-white',
  },
  teal: {
    gradient: 'from-teal-600 to-emerald-800',
    button: 'bg-teal-600 hover:bg-teal-700',
    accent: 'text-teal-600',
    panelBg: 'bg-teal-50',
    panelBorder: 'border-teal-200',
    panelText: 'text-teal-900',
    stepBadge: 'bg-teal-600 text-white',
  },
};

/** DB의 theme 값이 오타여도 화면이 무너지지 않도록 emerald로 떨어뜨립니다. */
export function themeOf(key: string): RiverTheme {
  return THEMES[key as ThemeKey] ?? THEMES.emerald;
}
