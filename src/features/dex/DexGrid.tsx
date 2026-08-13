/**
 * DexGrid — 도감 카드 그리드.
 *
 * 카테고리별 섹션으로 나누고, 각 섹션 머리에 세트 진척(예: 물새 3/5)을 답니다.
 * 미획득 카드는 실루엣 + `???`, 비시즌 카드는 실루엣 + "겨울에 다시 와줘!" (PLAN.md §7.7).
 *
 * 데이터 페칭은 하지 않습니다. species/entries를 props로 받습니다.
 */

import { useMemo } from 'react';
import type { DexEntry, Species, SpeciesCategory } from '../../types/domain';
import { CATEGORY_EMOJI, CATEGORY_LABEL, CATEGORY_ORDER } from './display';
import { currentMonth } from './season';
import { DexCard } from './DexCard';
import styles from './DexGrid.module.css';

export interface DexGridProps {
  /** 보여줄 전체 종 */
  species: Species[];
  /** 아이가 획득한 카드 */
  entries: DexEntry[];
  /** 현재 월(1~12). 생략하면 오늘 기준 */
  month?: number;
  /** 카테고리 표시 순서. 생략하면 기본 순서 */
  categories?: SpeciesCategory[];
  /** 카드를 눌렀을 때. 생략하면 카드는 정적으로 표시됩니다 */
  onSelectCard?: (species: Species) => void;
  /** 보여줄 종이 하나도 없을 때의 문구 */
  emptyMessage?: string;
}

export function DexGrid({
  species,
  entries,
  month = currentMonth(),
  categories = CATEGORY_ORDER,
  onSelectCard,
  emptyMessage = '아직 카드가 없어. 하천에 나가서 첫 카드를 만나보자!',
}: DexGridProps) {
  const entryBySpecies = useMemo(() => {
    const map = new Map<string, DexEntry>();
    for (const e of entries) map.set(e.speciesId, e);
    return map;
  }, [entries]);

  const sections = useMemo(() => {
    const grouped = new Map<SpeciesCategory, Species[]>();
    for (const s of species) {
      const bucket = grouped.get(s.category) ?? [];
      bucket.push(s);
      grouped.set(s.category, bucket);
    }
    return categories
      .filter((c) => (grouped.get(c) ?? []).length > 0)
      .map((c) => ({ category: c, items: grouped.get(c) as Species[] }));
  }, [species, categories]);

  if (sections.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <div className={styles.root}>
      {sections.map(({ category, items }) => {
        const owned = items.filter((s) => entryBySpecies.has(s.id)).length;
        const complete = owned === items.length;

        return (
          <section key={category} className={styles.section} aria-labelledby={`dex-cat-${category}`}>
            <h3 className={styles.sectionHead} id={`dex-cat-${category}`}>
              <span className={styles.sectionEmoji} aria-hidden="true">
                {CATEGORY_EMOJI[category]}
              </span>
              <span className={styles.sectionName}>{CATEGORY_LABEL[category]}</span>
              <span
                className={`${styles.sectionCount} ${complete ? styles.sectionCountDone : ''}`}
                aria-label={`${items.length}장 중 ${owned}장 모음`}
              >
                <span aria-hidden="true">
                  {owned}/{items.length}
                </span>
                {complete && (
                  <span className={styles.setDone} aria-hidden="true">
                    🎉
                  </span>
                )}
              </span>
            </h3>

            <ul className={styles.grid}>
              {items.map((s) => (
                <li key={s.id} className={styles.cell}>
                  <DexCard
                    species={s}
                    entry={entryBySpecies.get(s.id) ?? null}
                    month={month}
                    variant="tile"
                    {...(onSelectCard ? { onSelect: onSelectCard } : {})}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
