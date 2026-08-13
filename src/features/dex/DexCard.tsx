/**
 * DexCard — 도감 카드 한 장.
 *
 * 두 가지 모습을 가집니다.
 *   variant="tile"    그리드에 놓이는 앞면 (일러스트 · 이름 · 등급 배지)
 *   variant="detail"  카드 뒷면 (식별 힌트 · 생태 설명 · 획득일 · 관찰 횟수)
 *
 * 미획득 카드는 **실루엣 + `???`** 로 보여줍니다 (PLAN.md §7.7).
 * 다만 뒷면에서는 **식별 힌트만 미리 보여줍니다** — 찾으러 가는 데 필요한 정보이고,
 * 이름과 생태 설명은 직접 만났을 때의 몫으로 남겨둡니다.
 */

import type { CSSProperties } from 'react';
import type { DexEntry, Species } from '../../types/domain';
import { TIER_POINTS } from '../../types/domain';
import {
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
  ETHICS_ICON,
  ETHICS_NOTE,
  TIER_LABEL,
  TIER_NOTE,
  TIER_STARS,
  TRACK_ICON,
  TRACK_LABEL,
  TRACK_NOTE,
  formatDate,
  tierAria,
  tierColor,
} from './display';
import { comebackHint, currentMonth, formatMonths, isInSeason, seasonsOf } from './season';
import styles from './DexCard.module.css';

/**
 * owned     획득함
 * unseen    아직 못 만남 (지금 만날 수는 있음)
 * offseason 지금은 철이 아님 → "겨울에 다시 와줘!"
 * locked    전문가 동반 프로그램에서만 해금 (PLAN.md §7.6-4)
 */
export type DexCardState = 'owned' | 'unseen' | 'offseason' | 'locked';

export function resolveCardState(
  species: Species,
  entry: DexEntry | null | undefined,
  month: number,
): DexCardState {
  if (entry) return 'owned';
  if (species.ethicsFlag === 'expert_only') return 'locked';
  if (!isInSeason(species.months, month)) return 'offseason';
  return 'unseen';
}

export interface DexCardProps {
  species: Species;
  /** 획득 기록. 없으면 미획득 */
  entry?: DexEntry | null;
  /** 현재 월(1~12). 생략하면 오늘 기준 */
  month?: number;
  variant?: 'tile' | 'detail';
  /** 타일을 눌렀을 때. 넘기지 않으면 버튼이 아니라 정적 카드가 됩니다 */
  onSelect?: (species: Species) => void;
}

function Illustration({
  species,
  hidden,
  size,
}: {
  species: Species;
  hidden: boolean;
  size: 'tile' | 'detail';
}) {
  const cls = `${styles.art} ${size === 'detail' ? styles.artLarge : ''} ${
    hidden ? styles.artSilhouette : ''
  }`;

  if (!hidden && species.illustrationUrl) {
    return (
      <div className={cls}>
        <img
          className={styles.artImg}
          src={species.illustrationUrl}
          alt={`${species.commonName} 그림`}
        />
      </div>
    );
  }

  // 일러스트 미제작분은 카테고리 이모지로 대체합니다 (PLAN.md §8 — 일러스트가 병목)
  return (
    <div className={cls} aria-hidden="true">
      <span className={styles.artEmoji}>{CATEGORY_EMOJI[species.category]}</span>
    </div>
  );
}

function TierBadge({ species, muted }: { species: Species; muted: boolean }) {
  return (
    <span
      className={`${styles.tierBadge} ${muted ? styles.tierBadgeMuted : ''}`}
      style={{ '--tier-c': tierColor(species.tier) } as CSSProperties}
      aria-label={tierAria(species.tier)}
    >
      <span aria-hidden="true">{TIER_STARS[species.tier]}</span>
    </span>
  );
}

export function DexCard({
  species,
  entry = null,
  month = currentMonth(),
  variant = 'tile',
  onSelect,
}: DexCardProps) {
  const state = resolveCardState(species, entry, month);
  const owned = state === 'owned';

  return variant === 'detail' ? (
    <DexCardDetail species={species} entry={entry} state={state} month={month} />
  ) : (
    <DexCardTile
      species={species}
      state={state}
      owned={owned}
      month={month}
      onSelect={onSelect}
    />
  );
}

// ─── 앞면 ───────────────────────────────────────────────────────

function DexCardTile({
  species,
  state,
  owned,
  month,
  onSelect,
}: {
  species: Species;
  state: DexCardState;
  owned: boolean;
  month: number;
  onSelect?: (species: Species) => void;
}) {
  const name = owned ? species.commonName : '???';

  let statusLine = '';
  if (state === 'offseason') statusLine = comebackHint(species.months, month);
  else if (state === 'locked') statusLine = '선생님과 함께 만나요';
  else if (state === 'unseen') statusLine = '아직 못 만났어';

  // 스크린리더에는 카드 상태를 말로 전달합니다 (실루엣은 시각 정보라서)
  const aria = owned
    ? `${species.commonName}, ${TIER_LABEL[species.tier]} 등급, 획득함`
    : `아직 만나지 못한 ${CATEGORY_LABEL[species.category]} 카드, ${TIER_LABEL[species.tier]} 등급${
        statusLine ? `, ${statusLine}` : ''
      }`;

  const inner = (
    <>
      <Illustration species={species} hidden={!owned} size="tile" />
      <span className={`${styles.name} ${owned ? '' : styles.nameHidden}`}>{name}</span>
      <span className={styles.tileMeta}>
        <TierBadge species={species} muted={!owned} />
        <span className={styles.trackIcon} aria-hidden="true" title={TRACK_LABEL[species.track]}>
          {TRACK_ICON[species.track]}
        </span>
      </span>
      {statusLine && <span className={styles.statusLine}>{statusLine}</span>}
    </>
  );

  const cardClass = `${styles.tile} ${owned ? styles.tileOwned : styles.tileLocked} ${
    state === 'offseason' ? styles.tileOffseason : ''
  }`;

  if (!onSelect) {
    return (
      <div className={cardClass} aria-label={aria} role="img">
        {inner}
      </div>
    );
  }

  return (
    <button type="button" className={cardClass} onClick={() => onSelect(species)} aria-label={aria}>
      {inner}
    </button>
  );
}

// ─── 뒷면 ───────────────────────────────────────────────────────

function DexCardDetail({
  species,
  entry,
  state,
  month,
}: {
  species: Species;
  entry: DexEntry | null;
  state: DexCardState;
  month: number;
}) {
  const owned = state === 'owned';
  const ethicsNote = ETHICS_NOTE[species.ethicsFlag];
  const ethicsIcon = ETHICS_ICON[species.ethicsFlag];
  const seasons = seasonsOf(species.months);

  return (
    <article className={styles.detail}>
      <Illustration species={species} hidden={!owned} size="detail" />

      <header className={styles.detailHead}>
        <h3 className={`${styles.detailName} ${owned ? '' : styles.nameHidden}`}>
          {owned ? species.commonName : '???'}
        </h3>
        {owned && species.scientificName && (
          <p className={styles.sciName}>{species.scientificName}</p>
        )}

        <div className={styles.chips}>
          <span
            className={styles.tierChip}
            style={{ '--tier-c': tierColor(species.tier) } as CSSProperties}
          >
            <span aria-hidden="true">{TIER_STARS[species.tier]}</span>
            <span className={styles.chipLabel}>{TIER_LABEL[species.tier]}</span>
          </span>
          <span className={styles.chip}>
            <span aria-hidden="true">{TRACK_ICON[species.track]}</span> {TRACK_LABEL[species.track]}
          </span>
          <span className={styles.chip}>{CATEGORY_LABEL[species.category]}</span>
        </div>
        <p className={styles.tierNote}>{TIER_NOTE[species.tier]}</p>
      </header>

      {/* ⚠️ 실제 시드에서 id_hint·fact는 대부분 빈 문자열입니다
          (supabase/seed/0001_species.sql — fact가 있는 종은 44종 중 2종뿐).
          비어 있는데도 제목을 그리면 "👀 이렇게 알아봐" 아래가 텅 빈 카드가 됩니다.
          내용이 채워질 때까지 항목 자체를 내립니다 — 생태 자문 후 문구가 들어오면
          아무 것도 고치지 않아도 다시 나타납니다. */}
      {species.idHint.trim() && (
        <section className={styles.block}>
          <h4 className={styles.blockTitle}>👀 이렇게 알아봐</h4>
          <p className={styles.blockBody}>{species.idHint}</p>
        </section>
      )}

      {owned && species.fact.trim() && (
        <section className={styles.block}>
          <h4 className={styles.blockTitle}>💚 이런 친구야</h4>
          <p className={styles.blockBody}>{species.fact}</p>
        </section>
      )}

      <section className={styles.block}>
        <h4 className={styles.blockTitle}>📅 언제 만날 수 있어</h4>
        <p className={styles.blockBody}>
          {formatMonths(species.months)}
          {seasons.length > 0 && seasons.length < 4 && ` (${seasons.join('·')})`}
        </p>
        {state === 'offseason' && (
          <p className={styles.comeback}>🗓️ {comebackHint(species.months, month)}</p>
        )}
      </section>

      <section className={styles.block}>
        <h4 className={styles.blockTitle}>🤝 트랙</h4>
        <p className={styles.blockBody}>{TRACK_NOTE[species.track]}</p>
      </section>

      {ethicsNote && (
        <section className={`${styles.block} ${styles.ethics}`}>
          <h4 className={styles.blockTitle}>
            <span aria-hidden="true">{ethicsIcon}</span> 관찰 약속
          </h4>
          <p className={styles.blockBody}>{ethicsNote}</p>
        </section>
      )}

      {owned && entry ? (
        <dl className={styles.record}>
          <div className={styles.recordItem}>
            <dt className={styles.recordKey}>처음 만난 날</dt>
            <dd className={styles.recordVal}>{formatDate(entry.firstObservedAt)}</dd>
          </div>
          <div className={styles.recordItem}>
            <dt className={styles.recordKey}>만난 횟수</dt>
            <dd className={styles.recordVal}>{entry.count}번</dd>
          </div>
          <div className={styles.recordItem}>
            <dt className={styles.recordKey}>받은 점수</dt>
            <dd className={styles.recordVal}>{TIER_POINTS[species.tier]}P</dd>
          </div>
        </dl>
      ) : (
        <p className={styles.notYet}>
          {state === 'locked'
            ? '아직 잠겨 있어. 선생님과 함께하는 관찰 시간에 만나자!'
            : '아직 못 만난 친구야. 만나면 여기에 이야기가 채워져!'}
        </p>
      )}
    </article>
  );
}
