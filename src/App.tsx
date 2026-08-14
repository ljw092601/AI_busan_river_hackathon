import { createBrowserRouter, Outlet } from 'react-router-dom';
import { HomeScreen } from '@/features/rivers';
import { MissionModal } from '@/features/rivers/MissionModal';
import { RiverMap } from '@/features/map';
import { DexContainer } from '@/features/dex';
import { AuthGate } from '@/features/auth';
import { DevScreen } from '@/features/dev/DevScreen';
import { DemoLocationPanel } from '@/features/dev/DemoLocationPanel';

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

/**
 * 모든 라우트를 감싸는 껍데기.
 *
 * ★ 시연 패널을 여기 둔 이유
 *   예전에는 `/` 에만 붙어 있어서, /dex 나 /me 로 이동하면 시연 도구가 사라졌습니다.
 *   시연 중에 도감을 보여주다가 위치를 못 옮기는 상황이 생깁니다.
 *   레이아웃으로 올리면 **어느 주소에서도** 같은 규칙(`?demo=1` 또는 개발 서버)으로 뜹니다.
 */
function Shell() {
  return (
    <>
      {/* isDemoMode()가 false면 아무것도 그리지 않습니다.
          개발 서버에서는 항상, 배포본에서는 ?demo=1 일 때만 보입니다. */}
      <DemoLocationPanel />
      <Outlet />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      {
        path: '/',
        element: (
          <HomeScreen
            renderMissionModal={(river, onClose) => (
              <MissionModal river={river} onClose={onClose} />
            )}
            renderMap={(a) => (
              <RiverMap
                rivers={a.rivers}
                position={a.position}
                selectedRiverId={a.selectedRiverId}
                onSelectRiver={a.onSelectRiver}
                onRequestLocation={a.onRequestLocation}
              />
            )}
          />
        ),
      },

      // 도감은 홈의 「생물 도감」 탭이 주 진입점입니다.
      // 이 라우트는 직접 링크·북마크용으로 남겨 둡니다.
      // ⚠️ 탭으로 보면 주소가 안 바뀌므로 ?demo=1 이 그대로 유지됩니다.
      //    이 라우트로 직접 들어올 때도 /dex?demo=1 로 시연 패널이 뜹니다.
      { path: '/dex', element: <DexContainer /> },

      { path: '/me', element: <AuthGate><DexContainer /></AuthGate> },

      // 개발 점검 화면. 운영 빌드에는 등록하지 않습니다.
      ...(import.meta.env.DEV ? [{ path: '/dev', element: <DevScreen /> }] : []),
    ],
  },
]);
