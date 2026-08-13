/**
 * 구간별 수질 판정 (PLAN.md §7.4)
 *
 * 아이가 모은 카드로 "우리 동네 하천은 몇 급수인가"를 스스로 판정하게 만드는 로직입니다.
 * 수집이 곧 수질 측정이 되는 지점 — 앱 전체에서 가장 중요한 계산입니다.
 *
 * ★ 문구 원칙 (content/oncheoncheon-draft.md §2-④)
 *   낮은 등급이 나와도 **절대 실패로 표현하지 않습니다.**
 *   "2급수밖에 안 되네" (X)  →  "조금 더 맑아지면 옆새우도 올 수 있어요!" (O)
 *   환경 교육의 목표는 죄책감이 아니라 개선 가능성에 대한 감각입니다.
 *   이 파일의 모든 문자열은 그 원칙 아래 작성되었습니다. 수정 시 반드시 유지하세요.
 */

import type { Species, WaterGrade } from '../../types/domain';

/** 수질 등급 → 등급표의 별 (PLAN.md §7.4의 등급-수질 대응) */
const GRADE_STARS: Record<WaterGrade, string> = {
  1: '⭐⭐⭐',
  2: '⭐⭐',
  3: '⭐',
  4: '⭐',
};

const GRADE_LABEL: Record<WaterGrade, string> = {
  1: '1급수 지표',
  2: '2급수 지표',
  3: '3급수 지표',
  4: '4급수 지표',
};

const GRADE_NOTE: Record<WaterGrade, string> = {
  1: '아주 맑은 물에서만 살아요',
  2: '어느 정도 맑아야 살아요',
  3: '조금 흐린 물에서도 살아요',
  4: '아주 튼튼한 친구들이에요',
};

/** 판정 결과 본문. 어느 등급이 나와도 아이가 기죽지 않게 씁니다. */
const GRADE_BODY: Record<WaterGrade, string> = {
  1: '아주 맑은 물이에요! 까다로운 친구들까지 살고 있다는 뜻이에요.',
  2: '물고기가 살 수 있는 맑은 물이에요. 잘 지켜지고 있어요!',
  3: '조금 흐리지만, 튼튼한 친구들이 잘 살고 있어요.',
  4: '지금은 흐린 편이지만, 하천은 다시 맑아질 수 있어요. 온천천도 예전엔 까맣던 물이었대요!',
};

export interface WaterGradeRow {
  /** null = 수질을 알려주는 지표생물이 아닌 친구들 */
  grade: WaterGrade | null;
  stars: string;
  label: string;
  note: string;
  /** 이 줄에 해당하는, 아이가 찾은 종 */
  found: Species[];
}

export interface WaterGradeJudgement {
  rows: WaterGradeRow[];
  /** 추정 수질 등급. 지표생물을 하나도 못 찾았으면 null */
  estimated: WaterGrade | null;
  /** 지표생물을 몇 종 찾았는지 */
  indicatorCount: number;
  /** 찾은 카드 총 수 */
  foundCount: number;
  /** "이 구간의 물은 2급수로 추정돼요." */
  headline: string;
  /** 등급 설명 한 줄 */
  body: string;
  /** "조금 더 맑아지면 옆새우도 올 수 있어요!" — 다음 목표 */
  hopeText: string;
  /** 희망 문구에 등장한 종 (카드로 보여주고 싶을 때) */
  hopeSpecies: Species[];
  /** 지표생물 1종만으로 판정했으면 true → 표현을 더 조심스럽게 */
  tentative: boolean;
}

const GRADE_ORDER: WaterGrade[] = [1, 2, 3, 4];

/** 문구용 종 이름 나열: "옆새우, 날도래" */
function nameList(species: Species[]): string {
  return species.map((s) => s.commonName).join(', ');
}

/**
 * 아이가 모은 카드로 이 구간의 수질을 추정합니다.
 *
 * @param scopeSpecies 판정 범위의 전체 종 (해당 구간/코스에서 만날 수 있는 종)
 * @param foundSpecies 그중 아이가 실제로 획득한 종
 */
export function judgeWaterGrade(
  scopeSpecies: Species[],
  foundSpecies: Species[],
): WaterGradeJudgement {
  const foundByGrade = new Map<WaterGrade, Species[]>();
  const nonIndicator: Species[] = [];

  for (const s of foundSpecies) {
    if (s.waterGrade === null) nonIndicator.push(s);
    else {
      const bucket = foundByGrade.get(s.waterGrade) ?? [];
      bucket.push(s);
      foundByGrade.set(s.waterGrade, bucket);
    }
  }

  // 1·2급수 줄은 0종이어도 항상 보여줍니다.
  // "1급수 지표 0종"은 실패 표시가 아니라 **다음 목표**로 읽히게 하는 장치입니다.
  const rows: WaterGradeRow[] = [];
  for (const grade of GRADE_ORDER) {
    const found = foundByGrade.get(grade) ?? [];
    if (found.length === 0 && grade > 2) continue;
    rows.push({
      grade,
      stars: GRADE_STARS[grade],
      label: GRADE_LABEL[grade],
      note: GRADE_NOTE[grade],
      found,
    });
  }
  rows.push({
    grade: null,
    stars: '',
    label: '그 밖에 만난 친구',
    note: '물의 맑기와는 상관없이 만나요',
    found: nonIndicator,
  });

  // 추정 등급 = 찾은 지표생물 중 가장 맑은 물을 뜻하는 등급
  const estimated = GRADE_ORDER.find((g) => (foundByGrade.get(g) ?? []).length > 0) ?? null;
  const indicatorCount = foundSpecies.length - nonIndicator.length;
  const tentative = estimated !== null && (foundByGrade.get(estimated) ?? []).length === 1;

  // 다음 목표: 지금보다 한 단계 맑은 물에 사는, 아직 못 만난 친구
  let hopeSpecies: Species[] = [];
  let hopeText = '';

  if (estimated === null) {
    // 지표생물을 아직 못 만난 상태 — 실패가 아니라 "아직 시작"입니다.
    hopeSpecies = scopeSpecies.filter((s) => s.waterGrade === 2).slice(0, 2);
    hopeText =
      hopeSpecies.length > 0
        ? `${nameList(hopeSpecies)} 같은 친구를 찾으면, 이 물이 얼마나 맑은지 알 수 있어!`
        : '지표생물을 한 마리라도 찾으면, 이 물이 얼마나 맑은지 알 수 있어!';
  } else if (estimated === 1) {
    hopeText = '이보다 맑은 물은 없어요. 이 친구들이 계속 살 수 있게 함께 지켜주자!';
  } else {
    const foundIds = new Set(foundSpecies.map((s) => s.id));
    const betterGrade = (estimated - 1) as WaterGrade;
    hopeSpecies = scopeSpecies
      .filter((s) => s.waterGrade === betterGrade && !foundIds.has(s.id))
      .slice(0, 2);
    hopeText =
      hopeSpecies.length > 0
        ? `조금 더 맑아지면 ${nameList(hopeSpecies)}도 올 수 있어요!`
        : '조금 더 맑아지면 더 까다로운 친구들도 찾아올 수 있어요!';
  }

  const headline =
    estimated === null
      ? '아직 물의 맑기를 알려주는 친구를 못 만났어요.'
      : tentative
        ? `이 구간의 물은 ${estimated}급수쯤으로 보여요.`
        : `이 구간의 물은 ${estimated}급수로 추정돼요.`;

  const body =
    estimated === null
      ? '괜찮아! 오늘 만난 친구들도 하천이 살아 있다는 증거예요.'
      : GRADE_BODY[estimated];

  return {
    rows,
    estimated,
    indicatorCount,
    foundCount: foundSpecies.length,
    headline,
    body,
    hopeText,
    hopeSpecies,
    tentative,
  };
}

/**
 * 카드 획득 순간에 띄우는 수질 연결 멘트 (PLAN.md §7.4 Insight).
 * "⭐⭐ 다슬기를 찾았어! 다슬기는 물이 어느 정도 맑아야 살 수 있어."
 */
export function waterGradeMessage(species: Species): string | null {
  if (species.waterGrade === null) return null;
  const g = species.waterGrade;
  if (g === 1) {
    return `${species.commonName}는 아주 맑은 물에서만 살 수 있어. 여기 물이 그만큼 맑다는 뜻이야!`;
  }
  if (g === 2) {
    return `${species.commonName}는 물이 어느 정도 맑아야 살 수 있어. 지금 이 구간의 물은 ${species.commonName}가 살 만한 물이라는 뜻이야.`;
  }
  return `${species.commonName}는 물이 조금 흐려도 잘 견디는 튼튼한 친구야. 물이 더 맑아지면 다른 친구들도 찾아올 거야!`;
}
