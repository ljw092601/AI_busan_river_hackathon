import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import styles from './DevScreen.module.css';

/**
 * 개발/QA 전용 점검 화면.
 *
 * ⚠️ 이 화면은 `import.meta.env.DEV`일 때만 라우트에 등록됩니다(App.tsx).
 *    운영 번들에는 라우트가 없지만 **코드 자체는 트리셰이킹에 의존**하므로,
 *    실제 배포 전에 라우트 등록과 이 폴더를 함께 제거하는 편이 확실합니다.
 *
 * 왜 필요한가: 시드의 스팟 좌표가 전부 (0, 0)입니다(Phase 0 답사 전).
 * 실제 GPS로는 ST_DWithin이 절대 참이 되지 않아 체크인 경로를 한 번도
 * 끝까지 돌려볼 수 없습니다. 여기서는 좌표를 손으로 넣을 수 있으므로
 * 체크인 → 포인트 적립 → 장소 카드 자동 지급까지 실제로 확인됩니다.
 *
 * ⚠️ 이 화면이 RLS를 우회하지는 않습니다. anon 키로 도는 평범한 클라이언트라
 *    여기서 되는 일은 실제 앱에서도 되고, 여기서 막히면 앱에서도 막힙니다.
 *    그게 이 화면의 요점입니다 — 정책을 우회하지 않고 정책을 관찰합니다.
 */

type SpotRow = {
  id: string;
  seq: number;
  name: string;
  radius_m: number;
  lat: number | null;
  lng: number | null;
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>{title}</h2>
      {children}
    </section>
  );
}

function Result({ label, value }: { label: string; value: unknown }) {
  if (value === undefined) return null;
  return (
    <div className={styles.result}>
      <div className={styles.resultLabel}>{label}</div>
      <pre className={styles.pre}>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export function DevScreen() {
  const { session, userId, isLoggedIn } = useSession();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMsg, setAuthMsg] = useState<unknown>();

  const [spotId, setSpotId] = useState('');
  // 시드 좌표가 (0,0)이라 기본값도 (0,0)입니다. 답사 후에는 실제 좌표를 넣으세요.
  const [lat, setLat] = useState('0');
  const [lng, setLng] = useState('0');
  const [accuracy, setAccuracy] = useState('10');
  const [verifyOut, setVerifyOut] = useState<unknown>();
  const [checkinOut, setCheckinOut] = useState<unknown>();
  const [candidatesOut, setCandidatesOut] = useState<unknown>();

  const spots = useQuery({
    queryKey: ['dev', 'spots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('spots')
        .select('id, seq, name, radius_m, lat, lng')
        .order('seq');
      if (error) throw error;
      return data as SpotRow[];
    },
  });

  const profile = useQuery({
    queryKey: ['dev', 'profile', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, nickname, grade_band, expert_program, consent_id')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const balance = useQuery({
    queryKey: ['dev', 'balance', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('point_balance', { p_user_id: userId! });
      if (error) throw error;
      return data;
    },
  });

  const ledger = useQuery({
    queryKey: ['dev', 'ledger', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('points_ledger')
        .select('created_at, reason, delta, ref_type')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const dex = useQuery({
    queryKey: ['dev', 'dex', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dex_entries')
        .select('count, first_observed_at, species (code, common_name, tier, track)')
        .order('first_observed_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const visits = useQuery({
    queryKey: ['dev', 'visits', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visits')
        .select('verified_at, spot_id, method, lat, lng, distance_m, anomaly_flag')
        .order('verified_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const refetchMine = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['dev'] });
  }, [queryClient]);

  const signUp = async () => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    setAuthMsg(error ? { error: error.message } : { user: data.user?.id, session: Boolean(data.session) });
  };

  const signIn = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthMsg(error ? { error: error.message } : { user: data.user?.id });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setAuthMsg({ signedOut: true });
  };

  /**
   * 프로필 + 동의를 한 번에 만듭니다.
   * ⚠️ consents INSERT에 .select()를 붙이지 않습니다 — consents_select_linked 정책이
   *    "users가 이 동의를 가리킬 때"만 조회를 허용하는데, 방금 만든 행은 아직 아무도
   *    가리키지 않아 RETURNING이 정책에 걸립니다. 그래서 uuid를 클라이언트에서 만듭니다.
   */
  const bootstrapProfile = async () => {
    if (!userId) return;
    const consentId = crypto.randomUUID();
    const { error: cErr } = await supabase
      .from('consents')
      .insert({ id: consentId, method: 'in_app', scope: { dev: true } });
    if (cErr) {
      setAuthMsg({ step: 'consents', error: cErr.message });
      return;
    }
    const { error: uErr } = await supabase
      .from('users')
      .upsert({ id: userId, nickname: '개발테스트', consent_id: consentId }, { onConflict: 'id' });
    setAuthMsg(uErr ? { step: 'users', error: uErr.message } : { bootstrapped: true, consentId });
    refetchMine();
  };

  /** ⚠️ 실패해야 정상입니다 — 성공하면 포인트 위조가 가능하다는 뜻입니다. */
  const tryForgePoints = async () => {
    if (!userId) return;
    const { error } = await supabase
      .from('points_ledger')
      .insert({ user_id: userId, delta: 99999, reason: 'checkin' });
    setAuthMsg(
      error
        ? { forgeBlocked: true, code: error.code, message: error.message }
        : { forgeBlocked: false, warning: '⚠️ 포인트 위조에 성공했습니다 — RLS가 뚫렸습니다' },
    );
    refetchMine();
  };

  /** ⚠️ 실패해야 정상입니다 — 0012에서 막은 전문가 자가 승격입니다. */
  const tryForgeExpert = async () => {
    if (!userId) return;
    const { error } = await supabase.from('users').update({ expert_program: true }).eq('id', userId);
    setAuthMsg(
      error
        ? { expertBlocked: true, message: error.message }
        : { expertBlocked: false, warning: '⚠️ expert_program 승격에 성공했습니다 — 확인 필요' },
    );
    refetchMine();
  };

  const runVerify = async () => {
    const { data, error } = await supabase.rpc('verify_checkin', {
      p_spot_id: spotId,
      p_lat: Number(lat),
      p_lng: Number(lng),
      p_accuracy_m: accuracy === '' ? undefined : Number(accuracy),
    });
    setVerifyOut(error ? { error: error.message, code: error.code } : data);
  };

  const runCheckin = async () => {
    const { data, error } = await supabase.rpc('record_checkin', {
      p_spot_id: spotId,
      p_lat: Number(lat),
      p_lng: Number(lng),
      p_accuracy_m: accuracy === '' ? undefined : Number(accuracy),
    });
    setCheckinOut(error ? { error: error.message, code: error.code } : data);
    refetchMine();
  };

  const runCandidates = async () => {
    const { data, error } = await supabase.rpc('spot_candidate_species', { p_spot_id: spotId });
    setCandidatesOut(
      error
        ? { error: error.message }
        : (data ?? []).map((s) => ({
            code: s.code,
            name: s.common_name,
            tier: s.tier,
            track: s.track,
            ethics: s.ethics_flag,
          })),
    );
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1 className={styles.title}>🔧 개발 점검 화면</h1>
        <p className={styles.warn}>
          운영 빌드에는 등록되지 않습니다. RLS를 우회하지 않으므로 여기서 막히면 앱에서도 막힙니다.
        </p>
      </header>

      <Panel title="1. 세션">
        <div className={styles.kv}>
          <span>로그인</span>
          <strong>{isLoggedIn ? '✅ 예' : '❌ 아니오 (anon)'}</strong>
        </div>
        <div className={styles.kv}>
          <span>user id</span>
          <code>{userId ?? '—'}</code>
        </div>
        <div className={styles.kv}>
          <span>email</span>
          <code>{session?.user.email ?? '—'}</code>
        </div>

        <div className={styles.row}>
          <input
            className={styles.input}
            placeholder="이메일"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={styles.input}
            placeholder="비밀번호 (8자 이상)"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className={styles.row}>
          <button className={styles.btn} onClick={() => void signUp()}>가입</button>
          <button className={styles.btn} onClick={() => void signIn()}>로그인</button>
          <button className={styles.btn} onClick={() => void signOut()}>로그아웃</button>
          <button className={styles.btnPrimary} onClick={() => void bootstrapProfile()} disabled={!userId}>
            프로필+동의 생성
          </button>
        </div>
        <Result label="결과" value={authMsg} />
        <Result label="users 행" value={profile.data ?? (profile.isError ? { error: String(profile.error) } : undefined)} />
        <p className={styles.note}>
          체크인은 <code>consent_id</code>가 없으면 <code>consent_required</code>로 거부됩니다. 가입 후 반드시
          「프로필+동의 생성」을 누르세요.
        </p>
      </Panel>

      <Panel title="2. 스팟 선택">
        {spots.isPending && <p className={styles.note}>불러오는 중…</p>}
        {spots.isError && <p className={styles.err}>{String(spots.error)}</p>}
        <div className={styles.spotList}>
          {spots.data?.map((s) => (
            <button
              key={s.id}
              className={s.id === spotId ? styles.spotOn : styles.spot}
              onClick={() => {
                setSpotId(s.id);
                setLat(String(s.lat ?? 0));
                setLng(String(s.lng ?? 0));
              }}
            >
              <strong>
                {s.seq}. {s.name}
              </strong>
              <span>
                ({s.lat}, {s.lng}) r={s.radius_m}m
              </span>
            </button>
          ))}
        </div>
        <p className={styles.note}>
          스팟을 누르면 그 스팟의 좌표가 아래 입력란에 자동으로 채워집니다 — 즉 <em>반드시 반경 안</em>입니다.
          시드 좌표가 (0, 0)이라 실제 GPS로는 절대 성공할 수 없는 상태를 이렇게 우회해 테스트합니다.
        </p>
      </Panel>

      <Panel title="3. 체크인">
        <div className={styles.row}>
          <label className={styles.field}>
            위도<input className={styles.input} value={lat} onChange={(e) => setLat(e.target.value)} />
          </label>
          <label className={styles.field}>
            경도<input className={styles.input} value={lng} onChange={(e) => setLng(e.target.value)} />
          </label>
          <label className={styles.field}>
            정확도(m)
            <input className={styles.input} value={accuracy} onChange={(e) => setAccuracy(e.target.value)} />
          </label>
        </div>
        <div className={styles.row}>
          <button className={styles.btn} onClick={() => void runVerify()} disabled={!spotId}>
            verify_checkin (기록 없음)
          </button>
          <button className={styles.btnPrimary} onClick={() => void runCheckin()} disabled={!spotId}>
            record_checkin (실제 기록)
          </button>
          <button className={styles.btn} onClick={() => void runCandidates()} disabled={!spotId}>
            후보 종 조회
          </button>
        </div>
        <Result label="verify_checkin" value={verifyOut} />
        <Result label="record_checkin" value={checkinOut} />
        <Result label="spot_candidate_species" value={candidatesOut} />
        <p className={styles.note}>
          정확도를 <code>101</code>로 넣으면 <code>low_accuracy</code>, 좌표를 크게 틀리면{' '}
          <code>too_far</code>와 남은 거리가 나와야 합니다. 같은 스팟을 두 번 찍으면{' '}
          <code>already_checked_in</code>이 나오고 포인트는 늘지 않아야 합니다.
        </p>
      </Panel>

      <Panel title="4. 봉인 확인 (실패해야 정상)">
        <div className={styles.row}>
          <button className={styles.btnDanger} onClick={() => void tryForgePoints()} disabled={!userId}>
            포인트 99999 직접 INSERT 시도
          </button>
          <button className={styles.btnDanger} onClick={() => void tryForgeExpert()} disabled={!userId}>
            expert_program 자가 승격 시도
          </button>
        </div>
        <p className={styles.note}>
          두 버튼 모두 <strong>오류가 나야 정상</strong>입니다. 성공하면 RLS나 트리거가 뚫린 것이므로 즉시
          알려주세요.
        </p>
      </Panel>

      <Panel title="5. 내 상태">
        <div className={styles.kv}>
          <span>포인트 잔액</span>
          <strong>{balance.data ?? '—'}</strong>
        </div>
        <div className={styles.kv}>
          <span>도감 보유</span>
          <strong>{dex.data?.length ?? '—'} / 44</strong>
        </div>
        <button className={styles.btn} onClick={refetchMine}>새로고침</button>
        <Result label="visits (좌표 저장 확인)" value={visits.data} />
        <Result label="points_ledger (최근 20)" value={ledger.data} />
        <Result label="dex_entries" value={dex.data} />
      </Panel>
    </div>
  );
}
