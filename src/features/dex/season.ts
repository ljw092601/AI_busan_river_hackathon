/**
 * 계절 유틸 (PLAN.md §7.7 계절성)
 *
 * 설계 의도: "없는 걸 찾으라고 하지 않기".
 * 비시즌 카드는 잠그는 게 아니라 **다시 오게 만드는 장치**입니다.
 * 그래서 문구가 "볼 수 없음"이 아니라 "겨울에 다시 와줘!"입니다.
 */

export type SeasonName = '봄' | '여름' | '가을' | '겨울';

/** 연중 관찰 가능으로 볼 최소 개월 수. 11개월 이상이면 계절을 따지지 않습니다. */
const YEAR_ROUND_THRESHOLD = 11;

export function currentMonth(): number {
  return new Date().getMonth() + 1;
}

export function monthSeason(month: number): SeasonName {
  if (month >= 3 && month <= 5) return '봄';
  if (month >= 6 && month <= 8) return '여름';
  if (month >= 9 && month <= 11) return '가을';
  return '겨울';
}

export function isYearRound(months: number[]): boolean {
  return months.length >= YEAR_ROUND_THRESHOLD;
}

export function isInSeason(months: number[], month: number): boolean {
  if (isYearRound(months)) return true;
  return months.includes(month);
}

/** 지금부터 세어 가장 가까운 관찰 가능 월. 없으면 null */
export function nextAvailableMonth(months: number[], month: number): number | null {
  if (months.length === 0) return null;
  for (let step = 1; step <= 12; step += 1) {
    const m = ((month - 1 + step) % 12) + 1;
    if (months.includes(m)) return m;
  }
  return null;
}

/**
 * 비시즌 카드에 붙는 재방문 문구.
 *   "다음 달에 다시 와줘!" / "겨울에 다시 와줘!"
 */
export function comebackHint(months: number[], month: number): string {
  const next = nextAvailableMonth(months, month);
  if (next === null) return '언젠가 다시 만나자!';
  const isNextMonth = next === (month % 12) + 1;
  if (isNextMonth) return '다음 달에 다시 와줘!';
  return `${monthSeason(next)}에 다시 와줘!`;
}

/**
 * 관찰 가능 월 배열 → "4~10월" / "11~3월" / "연중".
 * 12월→1월로 넘어가는 겨울 구간을 하나로 붙여 읽습니다.
 */
export function formatMonths(months: number[]): string {
  if (months.length === 0) return '아직 몰라';
  if (isYearRound(months)) return '연중';

  const set = new Set(months);
  const sorted = [...set].sort((a, b) => a - b);

  // 연속 구간으로 묶기
  const runs: number[][] = [];
  for (const m of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === m - 1) last.push(m);
    else runs.push([m]);
  }
  // 12월과 1월이 이어지면 겨울 구간으로 합칩니다 (11~3월)
  if (runs.length > 1) {
    const first = runs[0];
    const last = runs[runs.length - 1];
    if (first[0] === 1 && last[last.length - 1] === 12) {
      const merged = [...last, ...first];
      runs.pop();
      runs.shift();
      runs.unshift(merged);
    }
  }

  return runs
    .map((run) => (run.length === 1 ? `${run[0]}월` : `${run[0]}~${run[run.length - 1]}월`))
    .join(', ');
}

/** 관찰 가능 월이 걸쳐 있는 계절들 — 봄·여름·가을 순으로 정렬 */
export function seasonsOf(months: number[]): SeasonName[] {
  const order: SeasonName[] = ['봄', '여름', '가을', '겨울'];
  const found = new Set(months.map(monthSeason));
  return order.filter((s) => found.has(s));
}
