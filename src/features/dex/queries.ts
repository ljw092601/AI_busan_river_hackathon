/**
 * 도감 데이터 조회 — Supabase.
 *
 * ── RLS가 정하는 것 (0006_rls.sql) ─────────────────────────────
 *   species      anon·authenticated 모두 select 가능 (using true)
 *   dex_entries  **authenticated 전용**. anon은 정책도 GRANT도 없습니다.
 *
 * 그래서 미로그인 상태에서 dex_entries를 조회하면 "권한 없음"이 아니라
 * 그냥 **빈 결과**가 돌아옵니다(정책에 걸리지 않는 행이 0개). 조용한 성공이라
 * 화면은 멀쩡해 보이지만 쿼리 캐시에 의미 없는 빈 배열이 남습니다.
 * 그래서 호출부(DexContainer)는 userId가 없으면 TanStack Query의 `enabled`로
 * 아예 요청하지 않습니다 — 하천변 데이터를 한 번이라도 덜 쓰는 게 낫습니다.
 *
 * ⚠️ 쓰기는 여기 없습니다. dex_entries는 grant_dex_entry()(SECURITY DEFINER)로만
 *    만들어집니다. 도감 위조 방지를 위한 구조적 봉인입니다 (PLAN.md §4.2).
 */

import { supabase } from '../../lib/supabase';
import type { DexEntry, Species } from '../../types/domain';
import { sortForDisplay, toDexEntry, toSpecies } from './mappers';

/**
 * 쿼리 키.
 * entries 키에 userId를 넣는 이유: 기기 하나를 형제가 번갈아 쓰는 상황이 실제로 있습니다.
 * 키가 같으면 로그인 계정이 바뀌어도 앞사람 카드가 잠깐 보입니다.
 */
export const dexKeys = {
  all: ['dex'] as const,
  species: () => ['dex', 'species'] as const,
  entries: (userId: string | null) => ['dex', 'entries', userId] as const,
};

/** 도감에 실을 전체 종. `is_active`가 아닌 종은 운영에서 내린 카드입니다. */
export async function fetchSpecies(): Promise<Species[]> {
  const { data, error } = await supabase.from('species').select('*').eq('is_active', true);

  if (error) {
    throw new Error(`[dex] 종 목록을 불러오지 못했습니다: ${error.message}`);
  }

  return sortForDisplay((data ?? []).map(toSpecies));
}

/**
 * 내가 모은 카드.
 * RLS가 이미 user_id를 강제하지만 where를 명시합니다 —
 * 정책이 바뀌어도 이 함수의 의미("내 것만")가 코드에 남아 있어야 합니다.
 */
export async function fetchDexEntries(userId: string): Promise<DexEntry[]> {
  const { data, error } = await supabase.from('dex_entries').select('*').eq('user_id', userId);

  if (error) {
    throw new Error(`[dex] 내 도감 기록을 불러오지 못했습니다: ${error.message}`);
  }

  return (data ?? []).map(toDexEntry);
}
