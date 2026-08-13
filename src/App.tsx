import { createBrowserRouter } from 'react-router-dom';
import { HomeScreen } from '@/features/rivers';
import { MissionModal } from '@/features/rivers/MissionModal';
import { DexContainer } from '@/features/dex';
import { AuthGate } from '@/features/auth';
import { DevScreen } from '@/features/dev/DevScreen';

/**
 * 라우트.
 *
 * ⚠️ 앱 전체를 <AuthGate>로 감싸지 마세요.
 *    rivers/spots/quizzes/species는 anon 읽기가 열려 있습니다 — 미로그인 방문자가
 *    먼저 둘러보고 "해볼 만하네"라고 판단한 뒤 가입하게 하려는 설계입니다.
 *    로그인을 요구하는 것은 기록이 남는 화면뿐입니다.
 *
 * 모달 배선: HomeScreen(트랙 E)과 MissionModal(트랙 F)이 서로를 import 하지
 * 않도록 의존을 뒤집어 뒀습니다. 두 트랙이 같은 파일을 건드리지 않게 하려는
 * 조치였고, 그 접합을 여기서 합니다.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <HomeScreen
        renderMissionModal={(river, onClose) => (
          <MissionModal river={river} onClose={onClose} />
        )}
      />
    ),
  },

  // 도감은 유지하되 메인 흐름에서는 빠져 있습니다. 미로그인도 볼 수 있습니다.
  { path: '/dex', element: <DexContainer /> },

  { path: '/me', element: <AuthGate><DexContainer /></AuthGate> },

  // 개발 점검 화면. 운영 빌드에는 등록하지 않습니다.
  ...(import.meta.env.DEV ? [{ path: '/dev', element: <DevScreen /> }] : []),
]);
