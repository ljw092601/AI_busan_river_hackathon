/**
 * 인증 훅 — 화면과 supabase-js 사이의 유일한 접점.
 *
 * ⚠️ 세션 조회는 여기서 만들지 않습니다. `@/lib/session`의 `useSession()`을 그대로 씁니다.
 *    도감 트랙과 같은 queryKey를 공유해야 로그인 직후 양쪽 화면이 함께 갱신됩니다.
 *    (각자 감싸면 캐시가 갈라져 "한쪽만 로그인된 것처럼 보이는" 버그가 됩니다.)
 *
 * ⚠️ 비밀번호·토큰을 이 트랙에서 저장하지 않습니다. 저장소·갱신·만료는 전부 supabase-js가 합니다.
 *    아래 어디에도 localStorage 접근이 없다는 사실 자체가 그 집행입니다.
 */

import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import { describeError, type FriendlyError } from './errors';
import { interpretSignUpResult, type SignUpOutcome } from './flow';
import {
  ensureGuardianProfile,
  fetchGuardianProfile,
  updateGuardianProfile,
  type EnsureProfileResult,
} from './profile';
import type { GuardianProfile, GuardianProfileInput } from './types';

/** 프로필 캐시 키. 세션 키와 분리돼 있어야 로그아웃 시 함께 비워집니다(session.ts의 clear). */
export function profileQueryKey(userId: string | null) {
  return ['guardian-profile', userId] as const;
}

// ─────────────────────────────────────────────────────────────────────────────
// 프로필
// ─────────────────────────────────────────────────────────────────────────────

export interface UseGuardianProfileResult {
  profile: GuardianProfile | null;
  isLoading: boolean;
  error: FriendlyError | null;
  /** 로그인은 됐지만 public.users 행이 아직 없는 상태 = 온보딩이 필요합니다 */
  needsOnboarding: boolean;
  refetch: () => void;
}

export function useGuardianProfile(): UseGuardianProfileResult {
  const { userId, isLoading: sessionLoading } = useSession();

  const query = useQuery({
    queryKey: profileQueryKey(userId),
    queryFn: async (): Promise<GuardianProfile | null> => {
      if (!userId) return null;
      return fetchGuardianProfile(supabase, userId);
    },
    enabled: Boolean(userId),
    // 기본값은 retry:3(main.tsx)이지만, 여기서는 **통신 오류일 때만** 재시도합니다.
    // RLS 거부나 권한 오류를 세 번 더 두드려봐야 결과는 같고, 그동안 보호자는
    // 아무 설명 없는 로딩 화면을 보게 됩니다. 하천변 통신 끊김만 재시도할 가치가 있습니다.
    retry: (failureCount, error) => failureCount < 2 && describeError(error).kind === 'network',
    staleTime: 1000 * 60 * 5,
  });

  const isLoading = sessionLoading || (Boolean(userId) && query.isLoading);

  return {
    profile: query.data ?? null,
    isLoading,
    error: query.error ? describeError(query.error) : null,
    needsOnboarding: Boolean(userId) && !isLoading && !query.error && !query.data,
    refetch: () => void query.refetch(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 가입 / 로그인 / 로그아웃
// ─────────────────────────────────────────────────────────────────────────────

interface ActionState {
  isPending: boolean;
  error: FriendlyError | null;
}

const IDLE: ActionState = { isPending: false, error: null };

export interface UseSignInResult extends ActionState {
  signIn: (email: string, password: string) => Promise<boolean>;
  reset: () => void;
}

export function useSignIn(): UseSignInResult {
  const [state, setState] = useState<ActionState>(IDLE);

  const signIn = useCallback(async (email: string, password: string) => {
    setState({ isPending: true, error: null });
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setState({ isPending: false, error: describeError(error) });
      return false;
    }
    // 성공 시 세션은 onAuthStateChange가 캐시에 밀어넣습니다 — 여기서 따로 갱신하지 않습니다.
    setState(IDLE);
    return true;
  }, []);

  return { ...state, signIn, reset: () => setState(IDLE) };
}

export interface UseSignUpResult extends ActionState {
  /** 성공하면 세 갈래 중 하나, 실패하면 null */
  signUp: (email: string, password: string) => Promise<SignUpOutcome | null>;
  outcome: SignUpOutcome | null;
  reset: () => void;
}

/**
 * 이메일 + 비밀번호 가입.
 *
 * **왜 매직링크가 아닌가:** 이 프로젝트에는 아직 SMTP가 붙어 있지 않습니다.
 * Supabase 기본 메일 발송기는 시간당 소수 건으로 제한되어 파일럿에 쓸 수 없고,
 * 무엇보다 "메일이 안 오면 아무것도 못 하는" 흐름은 하천 입구에서 치명적입니다.
 * 비밀번호는 최소한 그 자리에서 재시도가 됩니다. SMTP를 붙이면 매직링크로 바꿀 수 있습니다.
 */
export function useSignUp(): UseSignUpResult {
  const [state, setState] = useState<ActionState>(IDLE);
  const [outcome, setOutcome] = useState<SignUpOutcome | null>(null);

  const signUp = useCallback(async (email: string, password: string) => {
    setState({ isPending: true, error: null });
    setOutcome(null);

    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      setState({ isPending: false, error: describeError(error) });
      return null;
    }

    const result = interpretSignUpResult(data);
    setOutcome(result);
    setState(
      result === 'already_registered'
        ? { isPending: false, error: describeError({ code: 'user_already_exists' }) }
        : IDLE,
    );
    return result;
  }, []);

  return {
    ...state,
    outcome,
    signUp,
    reset: () => {
      setState(IDLE);
      setOutcome(null);
    },
  };
}

export interface UseSignOutResult extends ActionState {
  signOut: () => Promise<void>;
}

export function useSignOut(): UseSignOutResult {
  const [state, setState] = useState<ActionState>(IDLE);
  const queryClient = useQueryClient();

  const signOut = useCallback(async () => {
    setState({ isPending: true, error: null });
    const { error } = await supabase.auth.signOut();
    if (error) {
      setState({ isPending: false, error: describeError(error) });
      return;
    }
    // session.ts의 onAuthStateChange가 캐시를 비우지만, 구독이 아직 붙기 전인
    // 아주 짧은 창을 대비해 한 번 더 비웁니다. 두 번 비워도 해롭지 않습니다.
    queryClient.clear();
    setState(IDLE);
  }, [queryClient]);

  return { ...state, signOut };
}

// ─────────────────────────────────────────────────────────────────────────────
// 온보딩 (동의 + 프로필 생성)
// ─────────────────────────────────────────────────────────────────────────────

export interface UseCompleteOnboardingResult {
  complete: (input: GuardianProfileInput) => Promise<EnsureProfileResult | null>;
  isPending: boolean;
  error: FriendlyError | null;
}

export function useCompleteOnboarding(): UseCompleteOnboardingResult {
  const { userId } = useSession();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: GuardianProfileInput) => {
      if (!userId) {
        // 세션 없이 여기 오면 RLS(users_insert_self)에 막힙니다. 미리 명확히 끊습니다.
        throw new Error('세션이 없습니다. 다시 로그인해 주세요.');
      }
      return ensureGuardianProfile(supabase, userId, input);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(profileQueryKey(userId), result.profile);
    },
  });

  return {
    complete: async (input) => {
      try {
        return await mutation.mutateAsync(input);
      } catch {
        return null; // 오류는 아래 error로 전달됩니다
      }
    },
    isPending: mutation.isPending,
    error: mutation.error ? describeError(mutation.error) : null,
  };
}

export interface UseUpdateProfileResult {
  update: (patch: {
    nickname?: string;
    gradeBand?: GuardianProfileInput['gradeBand'];
    avatarSeed?: string;
  }) => Promise<GuardianProfile | null>;
  isPending: boolean;
  error: FriendlyError | null;
}

export function useUpdateGuardianProfile(): UseUpdateProfileResult {
  const { userId } = useSession();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (patch: Parameters<UseUpdateProfileResult['update']>[0]) => {
      if (!userId) throw new Error('세션이 없습니다. 다시 로그인해 주세요.');
      return updateGuardianProfile(supabase, userId, patch);
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(profileQueryKey(userId), profile);
    },
  });

  return {
    update: async (patch) => {
      try {
        return await mutation.mutateAsync(patch);
      } catch {
        return null;
      }
    },
    isPending: mutation.isPending,
    error: mutation.error ? describeError(mutation.error) : null,
  };
}
