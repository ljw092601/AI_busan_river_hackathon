/**
 * WaterGradeSummary — 구간별 수질 요약 (PLAN.md §7.4).
 *
 * 앱 전체에서 가장 중요한 한 화면입니다.
 * 아이가 걷고, 찾고, 찍은 모든 행동이 여기서 하나의 결론으로 수렴합니다 —
 * "우리 동네 하천은 이런 상태다."
 *
 * ★ 절대 규칙
 *   낮은 등급을 **실패로 표현하지 않습니다.**
 *   "2급수밖에 안 되네" (X) → "조금 더 맑아지면 옆새우도 올 수 있어요!" (O)
 *   그래서 이 화면에는 ✗, 실패, 부족 같은 표현이 하나도 없습니다.
 *   0종인 줄도 "못 찾음"이 아니라 **다음 목표**로 읽히게 배치했습니다.
 *   문구 로직은 waterGrade.ts에 모여 있습니다.
 */

import { useMemo } from 'react';
import type { DexEntry, Species } from '../../types/domain';
import { judgeWaterGrade } from './waterGrade';
import styles from './WaterGradeSummary.module.css';

export interface WaterGradeSummaryProps {
  /** 판정 범위의 전체 종 (이 구간/코스에서 만날 수 있는 종) */
  species: Species[];
  /** 아이가 획득한 카드 */
  entries: DexEntry[];
  /** "온천천 ④ 물의 건강검진소" 같은 구간 이름 */
  sectionName?: string;
  /** 제목 */
  title?: string;
}

export function WaterGradeSummary({
  species,
  entries,
  sectionName,
  title = '내가 찾은 생물로 본 이 구간의 물',
}: WaterGradeSummaryProps) {
  const judgement = useMemo(() => {
    const ownedIds = new Set(entries.map((e) => e.speciesId));
    const found = species.filter((s) => ownedIds.has(s.id));
    return judgeWaterGrade(species, found);
  }, [species, entries]);

  const { rows, estimated, headline, body, hopeText, foundCount, indicatorCount } = judgement;

  return (
    <section className={styles.root} aria-labelledby="water-grade-title">
      <header className={styles.head}>
        <h2 className={styles.title} id="water-grade-title">
          {title}
        </h2>
        {sectionName && <p className={styles.section}>{sectionName}</p>}
      </header>

      {/* 좁은 화면에서 표는 가로 스크롤을 부릅니다. 목록 + 그리드 배치로 갑니다. */}
      <ul className={styles.rows}>
        {rows.map((row) => {
          const key = row.grade === null ? 'other' : `g${row.grade}`;
          const isTarget = row.grade !== null && row.found.length === 0;
          return (
            <li
              key={key}
              className={`${styles.row} ${isTarget ? styles.rowTarget : ''}`}
              aria-label={`${row.label}, ${row.found.length}종${
                row.found.length > 0 ? `. ${row.found.map((s) => s.commonName).join(', ')}` : ''
              }`}
            >
              <span className={styles.cellGrade}>
                <span className={styles.gradeTop}>
                  {row.stars && (
                    <span className={styles.stars} aria-hidden="true">
                      {row.stars}
                    </span>
                  )}
                  <span className={styles.gradeLabel}>{row.label}</span>
                </span>
                <span className={styles.gradeNote}>{row.note}</span>
              </span>

              <span className={styles.cellCount} aria-hidden="true">
                <span className={styles.count}>{row.found.length}</span>
                <span className={styles.countUnit}>종</span>
              </span>

              <span className={styles.cellNames} aria-hidden="true">
                {row.found.length > 0 ? (
                  <span className={styles.names}>
                    {row.found.map((s) => s.commonName).join(', ')}
                  </span>
                ) : (
                  <span className={styles.namesEmpty}>다음에 찾아보자!</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <div
        className={`${styles.verdict} ${estimated === null ? styles.verdictPending : ''}`}
        data-grade={estimated ?? 'none'}
      >
        <p className={styles.verdictHead}>
          <span aria-hidden="true">💧</span> {headline}
        </p>
        <p className={styles.verdictBody}>{body}</p>
        <p className={styles.hope}>
          <span aria-hidden="true">🌱</span> {hopeText}
        </p>
      </div>

      <p className={styles.footNote}>
        지금까지 <strong>{foundCount}종</strong>을 만났고, 그중 <strong>{indicatorCount}종</strong>이
        물의 맑기를 알려주는 친구예요. 카드를 더 모으면 이 판정도 더 정확해져요!
      </p>

      <p className={styles.method}>
        어떤 생물이 사는지를 보고 물의 상태를 알아내는 건, 실제 과학자들도 쓰는 방법이에요.
      </p>
    </section>
  );
}
