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
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // 토큰 갱신·로그인·로그아웃을 캐시에 직접 반영합니다.
      queryClient.setQueryData(SESSION_QUERY_KEY, session);

      // ⚠️ 예전에는 `if (!session) queryClient.clear()` 였습니다. 두 가지가 잘못됐습니다.
      //
      //  ① onAuthStateChange 는 구독 직후 **INITIAL_SESSION 을 즉시 발화**합니다.
      //     미로그인 상태에서 이 훅을 쓰는 컴포넌트가 마운트될 때마다 session 이 null 로
      //     들어와 캐시 전체가 날아갔습니다. 로그인 모달을 여는 것만으로 하천·지도
      //     데이터가 비워지고 다시 받아왔습니다.
      //  ② clear() 는 방금 위에서 넣은 세션 데이터까지 지워 버려, 세션 쿼리가
      //     제거되고 재조회되는 왕복이 한 번 더 생겼습니다.
      //
      // 실제로 비워야 하는 순간은 **로그아웃뿐**이고, 세션 키는 남겨야 합니다.
      if (event === 'SIGNED_OUT') {
        queryClient.removeQueries({
          predicate: (q) => q.queryKey[0] !== SESSION_QUERY_KEY[0],
        });
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
