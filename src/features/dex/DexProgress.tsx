/**
 * DexProgress — 컬렉션 진척도.
 *
 * ⚠️ 리더보드·랭킹은 **의도적으로 만들지 않습니다** (PLAN.md §6.3).
 *    초등 대상 전체 랭킹은 상위권 소수만 남기고 나머지를 이탈시키며,
 *    부정 체크인의 가장 큰 유인이 됩니다.
 *    비교 대상은 남이 아니라 **어제의 나**입니다 — 그래서 여기 있는 숫자는
 *    모두 "내가 모은 것 / 모을 수 있는 것"뿐입니다.
 */

import { useMemo } from 'react';
import type { DexEntry, Species, SpeciesCategory } from '../../types/domain';
import { CATEGORY_EMOJI, CATEGORY_LABEL, CATEGORY_ORDER, TRACK_LABEL } from './display';
import styles from './DexProgress.module.css';

export interface DexProgressProps {
  species: Species[];
  entries: DexEntry[];
  /** 상단 제목 */
  title?: string;
  /** 카테고리별 세트 진척 표시 */
  showSets?: boolean;
  /** 보장/도전 트랙별 진척 표시 (PLAN.md §7.2 — 빈손이 아님을 보여주는 장치) */
  showTracks?: boolean;
  categories?: SpeciesCategory[];
}

function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function Bar({ done, total, tone }: { done: number; total: number; tone?: 'water' | 'river' }) {
  return (
    <div
      className={styles.bar}
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuetext={`${total}장 중 ${done}장`}
    >
      <div
        className={`${styles.barFill} ${tone === 'water' ? styles.barFillWater : ''}`}
        style={{ width: `${pct(done, total)}%` }}
      />
    </div>
  );
}

export function DexProgress({
  species,
  entries,
  title = '내 도감',
  showSets = true,
  showTracks = true,
  categories = CATEGORY_ORDER,
}: DexProgressProps) {
  const ownedIds = useMemo(() => new Set(entries.map((e) => e.speciesId)), [entries]);

  const total = species.length;
  const owned = species.filter((s) => ownedIds.has(s.id)).length;

  const sets = useMemo(() => {
    const grouped = new Map<SpeciesCategory, Species[]>();
    for (const s of species) {
      const bucket = grouped.get(s.category) ?? [];
      bucket.push(s);
      grouped.set(s.category, bucket);
    }
    return categories
      .filter((c) => (grouped.get(c) ?? []).length > 0)
      .map((c) => {
        const items = grouped.get(c) as Species[];
        const done = items.filter((s) => ownedIds.has(s.id)).length;
        return { category: c, done, total: items.length };
      });
  }, [species, categories, ownedIds]);

  const tracks = useMemo(() => {
    const guaranteed = species.filter((s) => s.track === 'guaranteed');
    const challenge = species.filter((s) => s.track === 'challenge');
    return [
      {
        track: 'guaranteed' as const,
        done: guaranteed.filter((s) => ownedIds.has(s.id)).length,
        total: guaranteed.length,
      },
      {
        track: 'challenge' as const,
        done: challenge.filter((s) => ownedIds.has(s.id)).length,
        total: challenge.length,
      },
    ].filter((t) => t.total > 0);
  }, [species, ownedIds]);

  const completedSets = sets.filter((s) => s.done === s.total).length;

  return (
    <section className={styles.root} aria-labelledby="dex-progress-title">
      <h2 className={styles.title} id="dex-progress-title">
        {title}
      </h2>

      <p className={styles.headline}>
        도감 <strong className={styles.big}>{owned}</strong>
        <span className={styles.slash}>/</span>
        {total}장
      </p>
      <Bar done={owned} total={total} />

      <p className={styles.cheer}>
        {owned === 0
          ? '첫 카드를 기다리는 중! 하천에 나가면 반드시 한 장은 채울 수 있어.'
          : owned === total
            ? '와, 전부 모았어! 다음 계절에 오면 또 다른 얼굴을 볼 수 있을 거야.'
            : `${total - owned}장 더 모을 수 있어. 천천히 채워도 괜찮아!`}
      </p>

      {showTracks && tracks.length > 0 && (
        <div className={styles.trackRow}>
          {tracks.map((t) => (
            <div key={t.track} className={styles.trackCard}>
              <span className={styles.trackName}>{TRACK_LABEL[t.track]}</span>
              <span className={styles.trackCount}>
                {t.done}/{t.total}
              </span>
            </div>
          ))}
        </div>
      )}

      {showSets && sets.length > 0 && (
        <div className={styles.sets}>
          <h3 className={styles.setsTitle}>
            세트 모으기
            <span className={styles.setsMeta}>
              완성 {completedSets}/{sets.length}
            </span>
          </h3>
          <ul className={styles.setList}>
            {sets.map((s) => {
              const done = s.done === s.total;
              return (
                <li key={s.category} className={styles.setItem}>
                  <span className={styles.setLabel}>
                    <span aria-hidden="true">{CATEGORY_EMOJI[s.category]}</span>{' '}
                    {CATEGORY_LABEL[s.category]}
                  </span>
                  <Bar done={s.done} total={s.total} tone="water" />
                  <span className={`${styles.setCount} ${done ? styles.setCountDone : ''}`}>
                    {s.done}/{s.total}
                    {done && (
                      <span aria-label="세트 완성" role="img">
                        {' '}
                        🎉
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
