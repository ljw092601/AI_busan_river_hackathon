/**
 * DexScreen — 도감 화면 조립본.
 *
 * App.tsx의 `/dex` 라우트에 그대로 꽂을 수 있게 만든 컴포넌트입니다.
 * (라우트 교체는 App.tsx 담당 트랙에서 해주세요 — 여기서는 건드리지 않았습니다.)
 *
 * 데이터 페칭은 하지 않습니다. species/entries를 props로 받고,
 * 열려 있는 카드가 무엇인지 같은 **화면 상태만** 안에서 관리합니다.
 */

import { useMemo, useState, type ReactNode } from 'react';
import type { DexEntry, Species } from '../../types/domain';
import { DexGrid } from './DexGrid';
import { DexProgress } from './DexProgress';
import { DexCardSheet } from './DexCardSheet';
import { WaterGradeSummary } from './WaterGradeSummary';
import { currentMonth, monthSeason } from './season';
import styles from './DexScreen.module.css';

export interface DexScreenProps {
  species: Species[];
  entries: DexEntry[];
  /** 현재 월(1~12). 생략하면 오늘 기준 */
  month?: number;
  /** 수질 요약을 함께 보여줄지 (코스 종료 화면에서는 true) */
  showWaterGrade?: boolean;
  /** "온천천 ④ 물의 건강검진소" 같은 구간 이름 */
  sectionName?: string;
  /**
   * 카드 뒷면에 끼워 넣을 "사진 찍어 등록하기" 슬롯.
   * 넘기지 않으면 도감은 지금까지처럼 보기 전용입니다 —
   * 코스 종료 요약처럼 등록이 필요 없는 문맥에서 그대로 재사용하기 위해서입니다.
   */
  renderClaim?: (species: Species, entry: DexEntry | null) => ReactNode;
}

export function DexScreen({
  species,
  entries,
  month = currentMonth(),
  showWaterGrade = true,
  sectionName,
  renderClaim,
}: DexScreenProps) {
  const [selected, setSelected] = useState<Species | null>(null);

  const entryBySpecies = useMemo(() => {
    const map = new Map<string, DexEntry>();
    for (const e of entries) map.set(e.speciesId, e);
    return map;
  }, [entries]);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1 className={styles.h1}>도감</h1>
        <p className={styles.season}>
          지금은 {month}월, {monthSeason(month)}이야
        </p>
      </header>

      <DexProgress species={species} entries={entries} />

      {showWaterGrade && (
        <WaterGradeSummary
          species={species}
          entries={entries}
          {...(sectionName ? { sectionName } : {})}
        />
      )}

      <DexGrid species={species} entries={entries} month={month} onSelectCard={setSelected} />

      <DexCardSheet
        species={selected}
        entry={selected ? (entryBySpecies.get(selected.id) ?? null) : null}
        month={month}
        {...(renderClaim ? { renderClaim } : {})}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
