// 5대 하천 미션·퀴즈·배지 전 과정을 실제 클라이언트로 끝까지 돌립니다.
// 계정 생성만 service_role(Admin API), 이후 모든 동작은 anon 키 = RLS 그대로 적용.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const app   = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,   { auth: { persistSession: false } });
const anon  = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,   { auth: { persistSession: false } });

let pass = 0, fail = 0;
const failures = [];
const check = (name, ok, detail) => {
  ok ? pass++ : (fail++, failures.push(`${name} — ${detail}`));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const EMAIL = `rivers-${Date.now()}@example.com`;
let userId = null;
let consentIdForCleanup = null;

try {
  const { data: c, error: ce } = await admin.auth.admin.createUser({
    email: EMAIL, password: 'test-password-1234', email_confirm: true,
  });
  if (ce) throw new Error(ce.message);
  userId = c.user.id;

  // ── 미로그인이 콘텐츠를 볼 수 있는가 (홈 화면의 기본 상태) ──────────────
  const { data: anonRivers, error: are } = await anon
    .from('rivers')
    .select('id, name, mission_kind, spots ( quizzes ( id ) )')
    .eq('is_active', true).order('seq');
  check('1. anon 이 5개 하천 조회', !are && anonRivers?.length === 5,
        are?.message ?? `${anonRivers?.length}개`);

  const shape = (anonRivers ?? []).map(r =>
    `${r.name}:${r.mission_kind ?? '없음'}/퀴즈${(r.spots ?? []).flatMap(s => s.quizzes).length}`);
  check('2. 하천별 구성이 확정본과 일치', shape.join(' ') ===
        '수영강:없음/퀴즈1 부전천:없음/퀴즈1 온천천:tap_target/퀴즈1 동천:collect/퀴즈0 대천천:observe_log/퀴즈1',
        shape.join(' '));

  const { error: rpErr } = await anon.rpc('river_progress');
  check('3. anon 의 river_progress 는 빈 결과(에러 아님)', !rpErr, rpErr?.message);

  // ── 로그인 + 프로필/동의 ────────────────────────────────────────────────
  await app.auth.signInWithPassword({ email: EMAIL, password: 'test-password-1234' });
  const consentId = crypto.randomUUID();
  consentIdForCleanup = consentId;
  await app.from('consents').insert({ id: consentId, method: 'in_app', scope: { e2e: true } });
  const { error: ue } = await app.from('users')
    .insert({ id: userId, nickname: '하천테스트', consent_id: consentId });
  check('4. 프로필 + 동의 생성', !ue, ue?.message);

  const { data: rivers } = await app
    .from('rivers')
    .select('id, slug, name, mission_kind, badge_code, spots ( quizzes ( id, answer_idx ) )')
    .eq('is_active', true).order('seq');

  // ── 시작 상태 ───────────────────────────────────────────────────────────
  const { data: p0 } = await app.rpc('river_progress');
  const missionless = p0.filter(r => !r.has_mission);
  check('5. 미션 없는 하천은 mission_done=true 로 시작', missionless.every(r => r.mission_done),
        `${missionless.length}개 하천`);
  check('6. 시작 시 배지 0개', p0.every(r => !r.badge_earned));

  // ── 조건 미달 배지 수령 시도 (거부되어야 함) ────────────────────────────
  const suyeong = rivers.find(r => r.slug === 'suyeong');
  const { data: early } = await app.rpc('claim_river_badge', { p_river_id: suyeong.id });
  check('7. 퀴즈 전 배지 수령 거부', early?.ok === false && early?.reason === 'quiz_incomplete',
        JSON.stringify(early));

  const dongcheon = rivers.find(r => r.slug === 'dongcheon');
  const { data: earlyM } = await app.rpc('claim_river_badge', { p_river_id: dongcheon.id });
  check('8. 미션 전 배지 수령 거부 (퀴즈 0문항 하천)',
        earlyM?.ok === false && earlyM?.reason === 'mission_incomplete', JSON.stringify(earlyM));

  // ── 전 하천 완수 ────────────────────────────────────────────────────────
  for (const r of rivers) {
    if (r.mission_kind) {
      const { error } = await app.from('river_missions')
        .upsert({ user_id: userId, river_id: r.id }, { onConflict: 'user_id,river_id' });
      if (error) check(`   미션 ${r.name}`, false, error.message);
    }
    for (const q of (r.spots ?? []).flatMap(s => s.quizzes)) {
      const { error } = await app.from('quiz_attempts')
        .insert({ user_id: userId, quiz_id: q.id, selected_idx: q.answer_idx, is_correct: true });
      if (error) check(`   퀴즈 ${r.name}`, false, error.message);
    }
  }

  const { data: p1 } = await app.rpc('river_progress');
  check('9. 5개 하천 모두 미션 완료 판정', p1.every(r => r.mission_done));
  check('10. 5개 하천 모두 퀴즈 완료 판정', p1.every(r => r.quiz_solved === r.quiz_total),
        p1.map(r => `${r.quiz_solved}/${r.quiz_total}`).join(' '));

  // ── 배지 5개 수령 ───────────────────────────────────────────────────────
  const claims = [];
  for (const r of rivers) {
    const { data } = await app.rpc('claim_river_badge', { p_river_id: r.id });
    claims.push({ name: r.name, ...data });
  }
  check('11. 배지 5개 전부 수령', claims.every(c => c.ok === true),
        claims.map(c => `${c.name}:${c.ok ? 'ok' : c.reason}`).join(' '));

  const { data: p2 } = await app.rpc('river_progress');
  check('12. river_progress 가 배지 5개 반영', p2.filter(r => r.badge_earned).length === 5,
        `${p2.filter(r => r.badge_earned).length}/5`);

  // ── 중복 수령은 늘어나지 않아야 함 ──────────────────────────────────────
  const { data: again } = await app.rpc('claim_river_badge', { p_river_id: suyeong.id });
  const { data: myBadges } = await app.from('user_badges').select('badge_id');
  check('13. 재수령해도 배지 5개 유지', again?.ok === true && myBadges?.length === 5,
        `${myBadges?.length}개`);

  // ── 퀴즈 재응답에 포인트 중복 지급 없는지 ───────────────────────────────
  const { data: bal1 } = await app.rpc('point_balance', { p_user_id: userId });
  const anyQuiz = rivers.flatMap(r => (r.spots ?? []).flatMap(s => s.quizzes))[0];
  await app.from('quiz_attempts')
    .insert({ user_id: userId, quiz_id: anyQuiz.id, selected_idx: anyQuiz.answer_idx, is_correct: true });
  const { data: bal2 } = await app.rpc('point_balance', { p_user_id: userId });
  check('14. 같은 퀴즈 재응답에 포인트 증가 없음', bal1 === bal2, `${bal1} → ${bal2}`);

  // ── 남의 미션을 대신 기록할 수 없어야 함 ────────────────────────────────
  const { error: forge } = await app.from('river_missions')
    .insert({ user_id: crypto.randomUUID(), river_id: suyeong.id });
  check('15. 남의 미션 기록 차단', !!forge, forge?.message ?? '⚠️ 위조 성공');

} catch (e) {
  console.error('\n중단:', e.message);
  fail++;
} finally {
  if (userId) {
    // service_role 은 원장 DELETE 가 허용되므로(0014) 계정 삭제가 cascade 로 정리됩니다.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) console.error('  ⚠️ 테스트 계정 삭제 실패:', delErr.message);
    await admin.from('consents').delete().eq('id', consentIdForCleanup ?? '00000000-0000-0000-0000-000000000000');
  }
  console.log(`\n${'─'.repeat(56)}\n통과 ${pass} / 실패 ${fail}`);
  if (failures.length) { console.log('\n실패:'); failures.forEach(f => console.log('  · ' + f)); }
  process.exit(fail ? 1 : 0);
}
