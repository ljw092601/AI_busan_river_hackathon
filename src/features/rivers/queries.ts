import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import type { MissionConfig, MissionKind, QuizView, RiverView } from './types';

/**
 * 5대 하천 데이터 로딩 — 두 UI 트랙이 **공유하는 단일 진입점**입니다.
 * 각자 쿼리를 새로 짜지 마세요. queryKey가 갈라지면 미션을 완료해도
 * 다른 화면의 진행률이 안 바뀌는 버그가 납니다.
 *
 * 미로그인도 동작합니다: rivers/spots/quizzes는 anon 읽기가 열려 있고,
 * 진행 상황(river_progress)만 로그인 시에 조회합니다.
 */

export const riverKeys = {
  all: ['rivers'] as const,
  content: () => [...riverKeys.all, 'content'] as const,
  progress: (userId: string | null) => [...riverKeys.all, 'progress', userId] as const,
};

interface ProgressRow {
  river_id: string;
  has_mission: boolean;
  mission_done: boolean;
  quiz_total: number;
  quiz_solved: number;
  badge_earned: boolean;
}

/** 하천 + 퀴즈 (공개 콘텐츠) */
async function fetchContent() {
  const { data, error } = await supabase
    .from('rivers')
    .select(
      `id, slug, name, subtitle, summary, icon, theme, badge_code, seq,
       detailed_history, detailed_ecology,
       mission_kind, mission_title, mission_body, mission_config,
       spots ( id, quizzes ( id, seq, question, options, answer_idx, explanation ) )`,
    )
    .eq('is_active', true)
    .order('seq');
  if (error) throw error;
  return data ?? [];
}

/** 본인 진행 상황 + 정답 맞힌 퀴즈 id 집합 */
async function fetchProgress() {
  const [{ data: prog, error: pErr }, { data: att, error: aErr }] = await Promise.all([
    supabase.rpc('river_progress'),
    supabase.from('quiz_attempts').select('quiz_id').eq('is_correct', true),
  ]);
  if (pErr) throw pErr;
  if (aErr) throw aErr;
  return {
    progress: (prog ?? []) as ProgressRow[],
    solved: new Set((att ?? []).map((a) => a.quiz_id)),
  };
}

export function useRivers() {
  const { userId } = useSession();

  const content = useQuery({ queryKey: riverKeys.content(), queryFn: fetchContent });
  const progress = useQuery({
    queryKey: riverKeys.progress(userId),
    queryFn: fetchProgress,
    // 미로그인이면 아예 호출하지 않습니다(RLS상 어차피 빈 결과).
    enabled: Boolean(userId),
  });

  const rivers: RiverView[] = (content.data ?? []).map((r) => {
    const p = progress.data?.progress.find((x) => x.river_id === r.id);
    const quizzes: QuizView[] = (r.spots ?? [])
      .flatMap((s) => s.quizzes ?? [])
      .sort((a, b) => a.seq - b.seq)
      .map((q) => ({
        id: q.id,
        seq: q.seq,
        question: q.question,
        options: q.options,
        answerIdx: q.answer_idx,
        explanation: q.explanation,
      }));

    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      subtitle: r.subtitle,
      summary: r.summary,
      icon: r.icon,
      theme: r.theme,
      badgeCode: r.badge_code,
      detailedHistory: r.detailed_history,
      detailedEcology: r.detailed_ecology,
      missionKind: r.mission_kind as MissionKind | null,
      missionTitle: r.mission_title,
      missionBody: r.mission_body,
      missionConfig: (r.mission_config ?? {}) as MissionConfig,
      quizzes,
      // 미로그인이라 진행 상황이 없어도 "미션이 있는 하천인가"는 콘텐츠에서 알 수 있습니다.
      hasMission: r.mission_kind != null,
      missionDone: p?.mission_done ?? false,
      quizSolvedIds: progress.data?.solved ?? new Set<string>(),
      badgeEarned: p?.badge_earned ?? false,
    };
  });

  return {
    rivers,
    isLoading: content.isPending || (Boolean(userId) && progress.isPending),
    error: content.error ?? progress.error ?? null,
    refetch: () => {
      void content.refetch();
      void progress.refetch();
    },
  };
}

/** 미션 완료 기록. 미로그인이면 아무것도 하지 않고 false를 돌려줍니다. */
export function useCompleteMission() {
  const { userId } = useSession();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (riverId: string) => {
      if (!userId) return false;
      const { error } = await supabase
        .from('river_missions')
        .upsert({ user_id: userId, river_id: riverId }, { onConflict: 'user_id,river_id' });
      if (error) throw error;
      return true;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: riverKeys.all }),
  });
}

/** 퀴즈 정답 기록. 서버 트리거가 첫 시도에만 포인트를 지급합니다. */
export function useAnswerQuiz() {
  const { userId } = useSession();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (v: { quizId: string; selectedIdx: number; isCorrect: boolean }) => {
      if (!userId) return false;
      const { error } = await supabase.from('quiz_attempts').insert({
        user_id: userId,
        quiz_id: v.quizId,
        selected_idx: v.selectedIdx,
        is_correct: v.isCorrect,
      });
      if (error) throw error;
      return true;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: riverKeys.all }),
  });
}

/**
 * 배지 수령. 서버가 미션·퀴즈 완수를 **다시 확인**하고 지급합니다.
 * 클라이언트 판정을 믿지 않으므로 조건 미달이면 ok:false가 돌아옵니다.
 */
export function useClaimBadge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (riverId: string) => {
      const { data, error } = await supabase.rpc('claim_river_badge', { p_river_id: riverId });
      if (error) throw error;
      return data as { ok: boolean; reason?: string; badge_code?: string; is_new?: boolean };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: riverKeys.all }),
  });
}

/** 획득한 배지 목록 (배지 수첩용) */
export function useBadges() {
  const { userId } = useSession();
  return useQuery({
    queryKey: [...riverKeys.all, 'badges', userId],
    queryFn: async () => {
      const [{ data: all, error: e1 }, { data: mine, error: e2 }] = await Promise.all([
        supabase.from('badges').select('id, code, name, description'),
        userId
          ? supabase.from('user_badges').select('badge_id, earned_at')
          : Promise.resolve({ data: [], error: null } as const),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const earned = new Map((mine ?? []).map((b) => [b.badge_id, b.earned_at]));
      return (all ?? []).map((b) => ({ ...b, earnedAt: earned.get(b.id) ?? null }));
    },
  });
}
