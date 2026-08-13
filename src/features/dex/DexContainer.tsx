/**
 * DexContainer — 도감 화면의 **데이터 담당**.
 *
 * 역할 분리:
 *   DexContainer  Supabase에서 가져오고, 로딩·오류·미로그인을 처리한다.
 *   DexScreen     받은 데이터를 그린다. 페칭을 하지 않는다.
 * 이 경계를 지켜야 화면 컴포넌트를 스토리북·테스트·다른 문맥(코스 종료 요약 등)에
 * 그대로 재사용할 수 있습니다. DexScreen 안에 useQuery를 넣지 마세요.
 *
 * ── 미로그인도 정상 상태입니다 ─────────────────────────────────
 * 앱을 처음 연 아이는 로그인 전에 도감부터 구경합니다. 그때
 * "로그인이 필요합니다" 벽을 세우면 앱이 뭘 하는 곳인지 영영 알 수 없습니다.
 * 그래서 미로그인일 때는 44장 전체를 **잠긴 상태로** 보여줍니다.
 * dex_entries는 authenticated 전용이므로 아예 요청하지 않습니다(`enabled`).
 *
 * ── 로딩·오류는 반드시 실제 화면입니다 ─────────────────────────
 * 이 앱은 하천변에서, 흔들리는 모바일 데이터로 씁니다.
 * 빈 화면은 "앱이 죽었다"로 읽힙니다 — 아이는 5초를 기다려주지 않습니다.
 */

import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../lib/session';
import { DexScreen } from './DexScreen';
import { dexKeys, fetchDexEntries, fetchSpecies } from './queries';
import styles from './DexContainer.module.css';

export interface DexContainerProps {
  /** 현재 월(1~12). 생략하면 오늘 기준 — 테스트·시연에서만 넘깁니다. */
  month?: number;
  /** 수질 요약을 함께 보여줄지. 기본값은 DexScreen을 따릅니다. */
  showWaterGrade?: boolean;
  /** "온천천 ④ 물의 건강검진소" 같은 구간 이름 */
  sectionName?: string;
}

/** 종 목록은 운영자가 시드로 바꾸는 데이터라 자주 흔들리지 않습니다. */
const SPECIES_STALE_MS = 1000 * 60 * 60;

export function DexContainer({ month, showWaterGrade, sectionName }: DexContainerProps) {
  const { userId, isLoading: sessionLoading } = useSession();

  const speciesQuery = useQuery({
    queryKey: dexKeys.species(),
    queryFn: fetchSpecies,
    staleTime: SPECIES_STALE_MS,
  });

  const entriesQuery = useQuery({
    queryKey: dexKeys.entries(userId),
    // enabled가 false면 실행되지 않으므로 여기서 userId는 항상 string입니다.
    queryFn: () => fetchDexEntries(userId as string),
    enabled: Boolean(userId),
  });

  // `enabled: false`인 쿼리는 isPending이 계속 true입니다.
  // 미로그인 화면이 영원히 로딩으로 남지 않도록 로그인 상태에서만 기다립니다.
  const waitingForEntries = Boolean(userId) && entriesQuery.isPending;

  if (sessionLoading || speciesQuery.isPending || waitingForEntries) {
    return <DexLoading />;
  }

  if (speciesQuery.isError) {
    return (
      <DexNotice
        emoji="🌧️"
        title="도감을 불러오지 못했어요"
        body="인터넷이 잠깐 끊겼을 수 있어요. 하천 근처는 신호가 약할 때가 있거든요."
        detail={speciesQuery.error.message}
        onRetry={() => void speciesQuery.refetch()}
        retrying={speciesQuery.isFetching}
      />
    );
  }

  const species = speciesQuery.data;

  // 종이 0장 = 시드가 안 들어갔거나 전부 비활성입니다.
  // 빈 그리드를 보여주면 아이는 "내가 뭘 잘못했나" 하고 생각합니다.
  if (species.length === 0) {
    return (
      <DexNotice
        emoji="🪺"
        title="도감이 아직 비어 있어요"
        body="카드를 준비하는 중이에요. 조금 있다가 다시 열어봐 줄래?"
        onRetry={() => void speciesQuery.refetch()}
        retrying={speciesQuery.isFetching}
      />
    );
  }

  const entries = entriesQuery.data ?? [];

  return (
    <div className={styles.root}>
      {!userId && (
        <p className={styles.banner}>
          <span aria-hidden="true">👀</span> 지금은 도감을 구경하는 중이야. 로그인하면 네가 만난
          친구들이 여기에 쌓여!
        </p>
      )}

      {/* 종 목록은 왔는데 내 기록만 실패한 경우 — 화면 전체를 버리지 않습니다.
          44장 그리드는 그대로 보여주고, "내 카드가 안 보이는 이유"만 알려줍니다. */}
      {userId && entriesQuery.isError && (
        <div className={styles.warn} role="alert">
          <p className={styles.warnText}>
            <span aria-hidden="true">⚠️</span> 네가 모은 카드를 불러오지 못했어. 지금 보이는 건
            도감 전체 목록이야.
          </p>
          <button
            type="button"
            className={styles.warnBtn}
            onClick={() => void entriesQuery.refetch()}
            disabled={entriesQuery.isFetching}
          >
            {entriesQuery.isFetching ? '불러오는 중…' : '다시 시도'}
          </button>
        </div>
      )}

      <DexScreen
        species={species}
        entries={entries}
        {...(month !== undefined ? { month } : {})}
        {...(showWaterGrade !== undefined ? { showWaterGrade } : {})}
        {...(sectionName ? { sectionName } : {})}
      />
    </div>
  );
}

// ─── 로딩 ───────────────────────────────────────────────────────

/**
 * 스피너 대신 **도감 모양 그대로** 비워 둡니다.
 * 다음에 올 화면과 같은 모양이면 데이터가 도착할 때 레이아웃이 튀지 않고,
 * 기다리는 동안에도 "여기가 도감이구나"를 읽을 수 있습니다.
 */
function DexLoading() {
  const cells = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className={styles.loading} aria-busy="true" aria-live="polite">
      <p className={styles.loadingText}>도감을 펼치는 중이야…</p>
      <ul className={styles.skelGrid}>
        {cells.map((i) => (
          <li key={i} className={styles.skelCell} aria-hidden="true" />
        ))}
      </ul>
    </div>
  );
}

// ─── 오류 · 빈 상태 ─────────────────────────────────────────────

function DexNotice({
  emoji,
  title,
  body,
  detail,
  onRetry,
  retrying,
}: {
  emoji: string;
  title: string;
  body: string;
  /** 어른(교사·개발자)용 원인 문자열. 아이 눈높이 문구와 섞이지 않게 작게 둡니다. */
  detail?: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className={styles.notice} role="alert">
      <span className={styles.noticeEmoji} aria-hidden="true">
        {emoji}
      </span>
      <h1 className={styles.noticeTitle}>{title}</h1>
      <p className={styles.noticeBody}>{body}</p>
      <button type="button" className={styles.retry} onClick={onRetry} disabled={retrying}>
        {retrying ? '다시 불러오는 중…' : '다시 시도'}
      </button>
      {detail && <p className={styles.noticeDetail}>{detail}</p>}
    </div>
  );
}
