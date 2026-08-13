import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AuthPromptProvider, HeaderAccount, useAuthPrompt } from '@/features/auth/home';
import { useGeolocation, type GeoPosition } from '@/lib/geo';
import { useSession } from '@/lib/session';
import { BadgeModal } from './BadgeModal';
import { Encyclopedia } from './Encyclopedia';
import { LocationBanner } from './LocationBanner';
import { RiverLocationProvider, accuracyPoorOf, type RiverLocationValue } from './LocationContext';
import { unlockedCount, withLocks } from './location';
import { ProgressHero } from './ProgressHero';
import { RiverCard } from './RiverCard';
import { useRivers } from './queries';
import { isRiverComplete, type RiverView } from './types';

/**
 * 부산 하천 탐험대 홈. example_html.html의 레이아웃을 그대로 옮겼습니다.
 *
 * ★ 미션 모달 seam
 *   MissionModal은 다른 트랙이 소유하므로 직접 import 하지 않습니다.
 *   "어떤 하천이 열려 있는가"는 여기서 들고, 실제 모달은 renderMissionModal
 *   prop으로 주입받습니다. prop이 없으면 아무것도 그리지 않으므로
 *   이 화면만 따로 띄워도 정상 동작합니다.
 *
 * ★ 지도 seam
 *   RiverMap도 같은 이유로 직접 import 하지 않습니다(다른 트랙 소유).
 *   renderMap prop이 있으면 하천 그리드 위에 그리고, 없으면 아무것도 그리지 않습니다.
 *
 * ★ 계정 seam
 *   로그인은 화면 이동이 아니라 **이 화면 위에 얹는 모달**입니다. `/me`로 보내면
 *   지도·위치 구독·열려 있던 미션이 전부 초기화되고, 보호자는 보던 자리로 돌아오는 법을
 *   잃습니다. 열림 상태는 AuthPromptProvider가 들고 있고, 자손 어디서든
 *   `useAuthPrompt().requestSignIn(이유)`로 엽니다 — 주입되는 MissionModal도 같습니다.
 *   ⚠️ 인증 화면 본체(AuthModal·AccountMenu)는 lazy로 붙습니다. 이 파일이
 *      `@/lib/supabase`를 정적으로 끌어오면 .env 없는 환경에서 홈 전체가 import 단계에서
 *      죽습니다. 그래서 `@/features/auth`(무거운 배럴)가 아니라 `.../auth/home`을 씁니다.
 *
 * ★ 위치는 여기서 **한 번만** 구독합니다
 *   useGeolocation()을 화면마다 부르면 watchPosition이 그만큼 늘어 배터리가 빨리 닳고,
 *   두 구독이 서로 다른 좌표를 들고 있으면 카드와 모달이 다른 거리를 말합니다.
 *   그래서 여기서 한 번 부르고, 아래로는 prop과 RiverLocationProvider로만 내려보냅니다.
 *
 * ⚠️ 잠금은 전부 **클라이언트 판정**입니다(types.ts lockStateOf 주석 참고).
 *    우회할 수 있고, 그래서 화면 어디에도 "인증"이라고 쓰지 않습니다.
 */

export interface HomeScreenProps {
  renderMissionModal?: (river: RiverView, onClose: () => void) => ReactNode;
  renderMap?: (args: {
    rivers: RiverView[];
    position: GeoPosition | null;
    selectedRiverId: string | null;
    onSelectRiver: (riverId: string) => void;
    onRequestLocation: () => void;
  }) => ReactNode;
}

type TabKey = 'missions' | 'guide';

const TABS: { key: TabKey; label: string; emoji: string }[] = [
  { key: 'missions', label: '탐험 미션 & 퀴즈', emoji: '🧭' },
  { key: 'guide', label: '하천 대백과', emoji: '📖' },
];

const TAB_BASE =
  'px-4 py-2 min-h-[44px] text-xs sm:text-sm font-bold rounded-xl flex items-center gap-2 transition-all whitespace-nowrap';
const TAB_ACTIVE = 'bg-white/20 text-white';
const TAB_IDLE = 'hover:bg-white/10 text-emerald-100';

export function HomeScreen({ renderMissionModal, renderMap }: HomeScreenProps) {
  const [tab, setTab] = useState<TabKey>('missions');
  const [openRiverId, setOpenRiverId] = useState<string | null>(null);
  const [badgeOpen, setBadgeOpen] = useState(false);

  const { rivers, isLoading, error, refetch } = useRivers();
  const { isLoggedIn } = useSession();

  // ★ 앱 전체에서 유일한 watchPosition 구독.
  const geo = useGeolocation();

  const location: RiverLocationValue = {
    status: geo.status,
    position: geo.position,
    message: geo.message,
    accuracyPoor: accuracyPoorOf(geo.position),
    requestLocation: geo.start,
  };

  // 위치를 받은 뒤에만 가까운 순으로 정렬됩니다(위치가 없으면 원래 순서 유지).
  const cards = useMemo(() => withLocks(rivers, geo.position), [rivers, geo.position]);
  const nearest = geo.position && cards.length > 0 ? cards[0] : null;

  const completedCount = rivers.filter((r) => isRiverComplete(r) || r.badgeEarned).length;
  const openRiver = rivers.find((r) => r.id === openRiverId) ?? null;

  const closeMission = useCallback(() => setOpenRiverId(null), []);
  const openMission = useCallback((river: RiverView) => setOpenRiverId(river.id), []);
  const selectRiver = useCallback((riverId: string) => setOpenRiverId(riverId), []);

  return (
    <AuthPromptProvider>
    <RiverLocationProvider value={location}>
    <div className="min-h-screen flex flex-col justify-between overflow-x-hidden text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-emerald-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-10 h-10 shrink-0 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white text-xl shadow-md shadow-emerald-200"
              aria-hidden="true"
            >
              🌊
            </span>
            <div className="min-w-0">
              <h1 className="font-black text-base sm:text-xl text-slate-800 tracking-tight leading-none">
                부산 하천 탐험대
              </h1>
              <p className="hidden sm:block text-xs text-emerald-600 font-medium mt-1 break-keep">
                미션 &amp; 퀴즈로 만나는 부산 5대 하천 이야기
              </p>
            </div>
          </div>

          {/* 배지 + 계정. 360px에서는 둘 다 라벨을 접고 아이콘/아바타만 남깁니다 —
              다만 로그인 버튼의 "로그인" 글자는 접지 않습니다(찾지 못하면 없는 것과 같습니다). */}
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBadgeOpen(true)}
              className="shrink-0 flex items-center gap-2 px-3 min-h-[44px] bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-sm"
            >
              <span className="text-base" aria-hidden="true">
                🏅
              </span>
              <span className="hidden sm:inline">탐험 배지</span>
              <span className="bg-amber-500 text-white rounded-full text-xs px-2 py-0.5 ml-0.5">
                {completedCount}/{rivers.length || 5}
              </span>
            </button>

            {/* 로그인 전이면 로그인 버튼, 후면 계정 칩(별명·이메일·로그아웃). */}
            <HeaderAccount />
          </div>
        </div>

        {/* Tabs */}
        <nav className="bg-emerald-800 text-white" aria-label="화면 전환">
          <div className="max-w-5xl mx-auto px-4 flex gap-1 sm:gap-2 overflow-x-auto py-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? 'page' : undefined}
                className={`${TAB_BASE} ${tab === t.key ? TAB_ACTIVE : TAB_IDLE}`}
              >
                <span aria-hidden="true">{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 w-full flex-grow">
        <ProgressHero completed={completedCount} total={rivers.length || 5} />

        {!isLoggedIn && <GuestSaveNotice />}

        {/* 진행 상황 쿼리만 실패한 경우에도 useRivers().error가 채워집니다.
            이미 받아둔 하천이 있으면 화면을 통째로 버리지 않고 띠 경고만 붙입니다. */}
        {error && rivers.length > 0 && (
          <div
            role="alert"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3"
          >
            <span className="break-keep">
              <span aria-hidden="true">📡</span> 진행 상황을 불러오지 못했어요. 아래 기록이 최신이
              아닐 수 있어요.
            </span>
            <button
              type="button"
              onClick={refetch}
              className="min-h-[44px] px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition-all"
            >
              다시 시도
            </button>
          </div>
        )}

        {error && rivers.length === 0 ? (
          <div
            role="alert"
            className="bg-white border border-red-200 rounded-3xl p-6 text-center shadow-sm"
          >
            <p className="text-3xl mb-2" aria-hidden="true">
              📡
            </p>
            <h3 className="font-bold text-slate-800 mb-1">하천 정보를 불러오지 못했어요</h3>
            <p className="text-xs text-slate-500 mb-4 break-keep">
              인터넷 연결을 확인하고 다시 시도해주세요.
            </p>
            <button
              type="button"
              onClick={refetch}
              className="min-h-[44px] px-6 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm transition-all"
            >
              다시 시도
            </button>
          </div>
        ) : tab === 'missions' ? (
          <section>
            <LocationBanner
              location={location}
              nearest={nearest}
              unlocked={unlockedCount(cards)}
            />

            {/* 지도 seam — 다른 트랙이 소유합니다. prop이 없으면 아무것도 그리지 않습니다. */}
            {renderMap
              ? renderMap({
                  rivers,
                  position: geo.position,
                  selectedRiverId: openRiverId,
                  onSelectRiver: selectRiver,
                  onRequestLocation: geo.start,
                })
              : null}

            <div className="flex justify-between items-end mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">부산 5대 하천 미션 &amp; 퀴즈</h3>
                <p className="text-xs text-slate-500 break-keep">
                  하천 가까이에 가면 그 하천의 미션과 퀴즈가 열려요. 카드를 누르면 잠겨 있어도
                  하천 이야기는 읽을 수 있어요.
                </p>
              </div>
            </div>

            {isLoading ? (
              <RiverGridSkeleton />
            ) : rivers.length === 0 ? (
              <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6 text-center">
                아직 등록된 하천이 없어요.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {cards.map(({ river, lock, nearest: isNearest }) => (
                  <RiverCard
                    key={river.id}
                    river={river}
                    onOpen={openMission}
                    lock={lock}
                    nearest={isNearest}
                    accuracy={geo.position?.accuracy ?? null}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <section>
            <div className="mb-6">
              <h3 className="text-xl font-bold text-slate-800">부산 5대 하천 대백과</h3>
              <p className="text-xs text-slate-500 break-keep">
                부산을 적시는 주요 하천의 역사, 생태적 특징, 보존 가치를 사전 형태로 배워보세요.
              </p>
            </div>
            {isLoading ? <GuideSkeleton /> : <Encyclopedia rivers={rivers} />}
          </section>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">
              🌿
            </span>
            <span className="font-bold text-slate-700">부산 하천 생태·역사 탐험대</span>
          </div>
          <p className="break-keep">
            부산광역시 주요 5대 하천(수영강·부전천·온천천·동천·대천천) 교육용 앱
          </p>
        </div>
      </footer>

      {/* 모달도 provider 안입니다 — 주입된 MissionModal이 useRiverLock으로 잠금을 읽습니다. */}
      {openRiver && renderMissionModal ? renderMissionModal(openRiver, closeMission) : null}
      {badgeOpen && <BadgeModal rivers={rivers} onClose={() => setBadgeOpen(false)} />}
    </div>
    </RiverLocationProvider>
    </AuthPromptProvider>
  );
}

/**
 * 미로그인 안내 띠.
 *
 * "저장되지 않는다"고 말하는 자리에 **저장되게 만드는 버튼**이 없으면 그건 안내가 아니라
 * 통보입니다. 화면을 막지는 않습니다 — 둘러보기는 의도된 상태이고(App.tsx 주석),
 * 여기서 로그인을 강요하면 "해볼 만한지 먼저 본다"는 흐름 자체가 사라집니다.
 *
 * HomeScreen 본체가 AuthPromptProvider를 그리므로, 훅을 쓰려면 이렇게 자식이어야 합니다.
 */
function GuestSaveNotice() {
  const { requestSignIn } = useAuthPrompt();

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
      <p className="break-keep min-w-0">
        <span aria-hidden="true">💡</span> 지금은 둘러보기 상태예요. 로그인하면 미션과 퀴즈
        기록이 저장되고 배지를 받을 수 있어요.
      </p>
      <button
        type="button"
        onClick={() => requestSignIn('로그인하면 지금까지처럼 둘러본 뒤에도 기록이 남습니다.')}
        className="shrink-0 min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold transition-all"
      >
        로그인하고 기록 저장하기
      </button>
    </div>
  );
}

function RiverGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 animate-pulse">
          <div className="w-12 h-12 rounded-2xl bg-slate-200 mb-4" />
          <div className="h-4 w-2/3 bg-slate-200 rounded mb-2" />
          <div className="h-3 w-1/2 bg-slate-100 rounded mb-3" />
          <div className="h-3 w-full bg-slate-100 rounded mb-1.5" />
          <div className="h-3 w-5/6 bg-slate-100 rounded mb-5" />
          <div className="h-11 w-full bg-slate-200 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

function GuideSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      {Array.from({ length: 3 }, (_, i) => (
        <div
          key={i}
          className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm animate-pulse"
        >
          <div className="flex items-center gap-4 mb-4 border-b border-slate-100 pb-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-200 shrink-0" />
            <div className="flex-grow">
              <div className="h-4 w-40 bg-slate-200 rounded mb-2" />
              <div className="h-3 w-56 max-w-full bg-slate-100 rounded" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-24 bg-slate-100 rounded-2xl" />
            <div className="h-24 bg-emerald-50 rounded-2xl" />
          </div>
        </div>
      ))}
    </div>
  );
}
