// 홈 로그인 흐름을 실제 Supabase 에 대고 검증합니다.
// ★ Admin API 는 정리(삭제)에만 씁니다. 가입·동의·저장은 전부 anon 키 = 앱과 동일한 경로.
//   Admin 으로 계정을 만들면 "Confirm email" 설정을 우회하므로 검증 의미가 없습니다.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const app = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const failures = [];
const check = (name, ok, detail) => {
  ok ? pass++ : (fail++, failures.push(`${name} — ${detail}`));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const EMAIL = `auth-${Date.now()}@example.com`;
const PASSWORD = 'test-password-1234';
let userId = null;

try {
  // ── 1. 가입 (앱과 동일한 경로) ──────────────────────────────────────────
  const { data: su, error: suErr } = await app.auth.signUp({ email: EMAIL, password: PASSWORD });
  check('1. 가입 성공', !suErr && !!su.user, suErr?.message);
  check('2. 가입 즉시 세션 발급 (Confirm email 꺼짐)', !!su.session,
        su.session ? '' : '⚠️ 세션 없음 — SMTP 없이는 가입을 끝낼 수 없습니다');
  userId = su.user?.id ?? null;

  // ── 2. 같은 이메일 재가입 ───────────────────────────────────────────────
  //  ⚠️ 응답 모양이 "Confirm email" 설정에 따라 **달라집니다.**
  //     ON  → 에러 없이 user.identities = []  (사용자 열거 방지용 난독화)
  //     OFF → 에러 user_already_exists
  //     UI는 describeError()가 두 경로를 모두 한국어로 처리합니다.
  const { data: dup, error: dupErr } = await app.auth.signUp({ email: EMAIL, password: PASSWORD });
  const detectedById = (dup.user?.identities?.length ?? -1) === 0;
  const detectedByErr = /already/i.test(dupErr?.message ?? '') || dupErr?.code === 'user_already_exists';
  check('3. 이미 가입된 이메일을 감지 (설정에 따라 두 경로 중 하나)',
        detectedById || detectedByErr,
        dupErr ? `error=${dupErr.code}` : `identities=${dup.user?.identities?.length}`);

  // ── 3. ★ 중단된 가입 상태 재현 ─────────────────────────────────────────
  //    users 행은 있는데 consent_id 가 NULL. 이번에 고친 버그의 핵심입니다.
  const { error: uErr } = await app.from('users').insert({ id: userId, nickname: '가입중단' });
  check('4. consent 없이 프로필만 생성 가능', !uErr, uErr?.message);

  const { data: rivers } = await app
    .from('rivers').select('id, slug, spots ( id )').eq('slug', 'oncheoncheon').single();
  const spotId = rivers.spots[0].id;

  const { data: noConsent } = await app.rpc('record_checkin', {
    p_spot_id: spotId, p_lat: 35.2049, p_lng: 129.0784, p_accuracy_m: 10,
  });
  check('5. ★ consent_id=NULL 이면 체크인 거부 (AuthGate 가 잡아야 하는 상태)',
        noConsent?.ok === false && noConsent?.reason === 'consent_required',
        JSON.stringify(noConsent));

  // ── 4. 동의를 나중에 붙이기 (모달의 "이어서 마무리하기" 경로) ──────────
  const consentId = crypto.randomUUID();
  const { error: cErr } = await app.from('consents')
    .insert({ id: consentId, method: 'in_app', scope: { e2e: true } });
  check('6. consents INSERT (.select() 없이)', !cErr, cErr?.message);

  const { error: linkErr } = await app.from('users')
    .update({ consent_id: consentId }).eq('id', userId);
  check('7. 기존 프로필에 동의 연결 (닉네임 보존)', !linkErr, linkErr?.message);

  const { data: prof } = await app.from('users').select('nickname, consent_id').eq('id', userId).single();
  check('8. 닉네임이 덮어써지지 않음', prof?.nickname === '가입중단' && !!prof?.consent_id,
        `nickname=${prof?.nickname}`);

  // ── 5. 이제 실제로 저장돼야 합니다 ──────────────────────────────────────
  const { data: ci } = await app.rpc('record_checkin', {
    p_spot_id: spotId, p_lat: 35.2049, p_lng: 129.0784, p_accuracy_m: 10,
  });
  check('9. 동의 후 체크인 성공', ci?.ok === true, JSON.stringify(ci)?.slice(0, 90));

  const { error: mErr } = await app.from('river_missions')
    .upsert({ user_id: userId, river_id: rivers.id }, { onConflict: 'user_id,river_id' });
  check('10. 미션 저장', !mErr, mErr?.message);

  const { data: prog } = await app.rpc('river_progress');
  const oncheon = prog.find(p => p.river_id === rivers.id);
  check('11. 진행 상황에 반영', oncheon?.mission_done === true, JSON.stringify(oncheon));

  // ── 6. 로그아웃 후에는 아무것도 안 보여야 합니다 ────────────────────────
  await app.auth.signOut();
  const { data: afterOut } = await app.rpc('river_progress');
  //  ⚠️ 미션이 없는 하천(수영강·부전천)은 mission_done 이 **항상 true** 입니다.
  //     "없는 단계는 통과"라는 규칙 때문이며, 미로그인에서도 마찬가지입니다.
  //     그래서 has_mission 이 있는 하천만 봐야 합니다.
  const leaked = (afterOut ?? []).filter(r => r.has_mission && r.mission_done);
  check('12. 로그아웃 후 본인 진행 상황이 안 보임', leaked.length === 0,
        `미션 보유 하천 중 ${leaked.length}개 남음`);
  check('12b. 미션 없는 하천은 미로그인에서도 통과로 표시',
        (afterOut ?? []).filter(r => !r.has_mission).every(r => r.mission_done),
        '없는 단계는 통과 규칙');

  // ── 7. 재로그인하면 복원 ────────────────────────────────────────────────
  const { error: siErr } = await app.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  check('13. 재로그인', !siErr, siErr?.message);
  const { data: restored } = await app.rpc('river_progress');
  check('14. 재로그인 시 진행 상황 복원',
        restored.find(p => p.river_id === rivers.id)?.mission_done === true);

  // ── 8. 잘못된 비밀번호 ──────────────────────────────────────────────────
  const { error: badErr } = await app.auth.signInWithPassword({ email: EMAIL, password: 'wrong-password' });
  check('15. 잘못된 비밀번호 거부', !!badErr, badErr?.message);

} catch (e) {
  console.error('\n중단:', e.message);
  fail++;
} finally {
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error('  ⚠️ 계정 삭제 실패:', error.message);
    await admin.from('consents').delete()
      .not('id', 'in', `(${'00000000-0000-0000-0000-000000000000'})`)
      .is('revoked_at', null)
      .eq('scope->>e2e', 'true');
  }
  console.log(`\n${'─'.repeat(56)}\n통과 ${pass} / 실패 ${fail}`);
  if (failures.length) { console.log('\n실패:'); failures.forEach(f => console.log('  · ' + f)); }
  process.exit(fail ? 1 : 0);
}
