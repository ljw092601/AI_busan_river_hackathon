/**
 * CardAcquired — 카드 획득 연출.
 *
 * PLAN.md §7.4 Insight: 획득 순간이 곧 학습 순간입니다.
 * "⭐⭐ 다슬기를 찾았어! 다슬기는 물이 어느 정도 맑아야 살 수 있어.
 *   지금 이 구간의 물은 다슬기가 살 만한 물이라는 뜻이야."
 * 그래서 축하 문구 아래에 **수질 연결 멘트**를 함께 띄웁니다.
 *
 * 애니메이션은 prefers-reduced-motion을 존중합니다
 * (global.css가 duration을 0으로 만들고, 여기서는 장식 자체를 숨깁니다).
 */

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { Species } from '../../types/domain';
import { TIER_POINTS } from '../../types/domain';
import {
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
  ETHICS_ICON,
  ETHICS_NOTE,
  TIER_LABEL,
  TIER_STARS,
  tierAria,
  tierColor,
} from './display';
import { waterGradeMessage } from './waterGrade';
import styles from './CardAcquired.module.css';

export interface CardAcquiredProps {
  /** 열림 여부. 기본 true (조건부 렌더링해서 써도 됩니다) */
  open?: boolean;
  species: Species;
  /** 이번 관찰까지 포함한 누적 관찰 횟수. 2 이상이면 "또 만났네!" */
  observationCount?: number;
  /** 지급 포인트. 생략하면 등급 기본값(TIER_POINTS) */
  points?: number;
  /** 학습 멘트를 직접 넣고 싶을 때. 생략하면 등급·수질에서 자동 생성 */
  message?: string;
  onClose: () => void;
  closeLabel?: string;
}

const SPARKLES = ['✨', '💧', '🌿', '⭐', '🫧', '✨'];

export function CardAcquired({
  open = true,
  species,
  observationCount = 1,
  points,
  message,
  onClose,
  closeLabel = '좋아!',
}: CardAcquiredProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const isFirst = observationCount <= 1;
  // 도감 카드는 1장이지만 관찰 기록은 계속 쌓입니다 (PLAN.md §7.9).
  // 포인트 계산은 원장(points_ledger) 쪽 책임이라, 여기서는 넘겨받은 값만 표시합니다.
  const awarded = points ?? (isFirst ? TIER_POINTS[species.tier] : 0);
  // ⚠️ `??`가 아니라 `||`입니다. 실제 시드에서 species.fact는 44종 중 42종이 **빈 문자열**이고
  //    (supabase/seed/0001_species.sql), ''는 null이 아니라 ?? 를 통과합니다.
  //    그러면 연출의 본체인 이 문단이 통째로 비어버립니다 — 카드를 얻은 순간에.
  //    생태 자문으로 fact가 채워지기 전까지는 최소한의 축하 문장이라도 남깁니다.
  const learn =
    message?.trim() ||
    waterGradeMessage(species) ||
    species.fact.trim() ||
    `${CATEGORY_LABEL[species.category]} 카드를 한 장 채웠어. 오늘 네가 직접 만난 친구야!`;
  const ethicsNote = ETHICS_NOTE[species.ethicsFlag];

  // 축하 화면이 뜨면 바로 닫기 버튼에 포커스를 둡니다 (키보드·스크린리더 진입점)
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-acquired-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 장식 — 스크린리더에는 읽히지 않고, 모션 최소화 설정에서는 숨겨집니다 */}
        <div className={styles.sparkles} aria-hidden="true">
          {SPARKLES.map((s, i) => (
            <span
              key={`${s}-${i}`}
              className={styles.sparkle}
              style={{ '--i': i } as CSSProperties}
            >
              {s}
            </span>
          ))}
        </div>

        <p className={styles.kicker}>
          {isFirst ? '새 카드를 얻었어!' : `또 만났네! ${observationCount}번째 만남`}
        </p>

        <div
          className={styles.art}
          style={{ '--tier-c': tierColor(species.tier) } as CSSProperties}
          aria-hidden="true"
        >
          {species.illustrationUrl ? (
            <img className={styles.artImg} src={species.illustrationUrl} alt="" />
          ) : (
            <span className={styles.artEmoji}>{CATEGORY_EMOJI[species.category]}</span>
          )}
        </div>

        <h2 className={styles.name} id="card-acquired-title">
          {species.commonName}
        </h2>

        <p className={styles.tierLine}>
          <span
            className={styles.tierBadge}
            style={{ '--tier-c': tierColor(species.tier) } as CSSProperties}
            aria-label={tierAria(species.tier)}
          >
            <span aria-hidden="true">{TIER_STARS[species.tier]}</span>
          </span>
          <span className={styles.tierText}>{TIER_LABEL[species.tier]}</span>
        </p>

        {/* ★ 획득 = 학습. 이 문단이 연출의 본체입니다 */}
        <p className={styles.learn}>{learn}</p>

        {ethicsNote && (
          <p className={styles.ethics}>
            <span aria-hidden="true">{ETHICS_ICON[species.ethicsFlag]}</span> {ethicsNote}
          </p>
        )}

        {awarded > 0 ? (
          <p className={styles.points}>
            <span aria-hidden="true">🎁</span> +{awarded}P
          </p>
        ) : (
          <p className={styles.pointsNote}>
            카드는 이미 한 장 가지고 있어. 그래도 관찰 기록은 계속 쌓이는 중이야!
          </p>
        )}

        <button ref={closeRef} type="button" className={styles.close} onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
