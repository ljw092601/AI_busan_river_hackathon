/**
 * DexCardSheet — 카드 뒷면을 띄우는 바텀 시트.
 *
 * 그리드에서 카드를 누르면 뒤집히는 자리입니다.
 * 상태는 부모가 들고 있고, 여기서는 표시만 합니다.
 */

import { useEffect, useRef } from 'react';
import type { DexEntry, Species } from '../../types/domain';
import { DexCard } from './DexCard';
import { currentMonth } from './season';
import styles from './DexCardSheet.module.css';

export interface DexCardSheetProps {
  /** null이면 닫힘 */
  species: Species | null;
  entry?: DexEntry | null;
  month?: number;
  onClose: () => void;
}

export function DexCardSheet({
  species,
  entry = null,
  month = currentMonth(),
  onClose,
}: DexCardSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (species) closeRef.current?.focus();
  }, [species]);

  useEffect(() => {
    if (!species) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [species, onClose]);

  if (!species) return null;

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`${species.commonName} 카드 자세히 보기`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.body}>
          <DexCard species={species} entry={entry} month={month} variant="detail" />
        </div>
        <div className={styles.footer}>
          <button ref={closeRef} type="button" className={styles.close} onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
