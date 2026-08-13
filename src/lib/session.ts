import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * 세션 조회 — 도감 트랙과 인증 트랙이 **공유하는 계약**입니다.
 *
 * 왜 공용 파일에 두는가: 두 트랙이 각자 `supabase.auth.getSession()`을
 * 서로 다른 queryKey로 감싸면 캐시가 둘로 갈라집니다. 로그인 직후
 * 한쪽 화면만 갱신되고 다른 쪽은 예전 상태로 남는, 재현이 까다로운 버그가 됩니다.
 * 반드시 이 훅을 쓰세요.
 */

export const SESSION_QUERY_KEY = ['session'] as const;

export function useSession() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async (): Promise<Session | null> => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    // 세션은 아래 onAuthStateChange가 밀어넣으므로 자동 재조회가 필요 없습니다.
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // 토큰 갱신·로그인·로그아웃을 캐시에 직접 반영합니다.
      queryClient.setQueryData(SESSION_QUERY_KEY, session);
      if (!session) {
        // 로그아웃 시 남의 계정 데이터가 화면에 남지 않도록 전부 무효화합니다.
        queryClient.clear();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return {
    session: query.data ?? null,
    userId: query.data?.user.id ?? null,
    isLoading: query.isLoading,
    isLoggedIn: Boolean(query.data),
  };
}
