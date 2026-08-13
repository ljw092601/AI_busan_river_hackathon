// /dev 화면이 하는 일을 그대로 코드로 실행합니다.
// ★ 계정 생성만 service_role(Admin API)을 쓰고, 그 이후 모든 동작은 anon 키 클라이언트입니다.
//   즉 RLS를 우회하지 않습니다 — 여기서 되는 일은 브라우저에서도 됩니다.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const app = createClient(URL, ANON, { auth: { persistSession: false } });

const EMAIL = `e2e-${Date.now()}@example.com`;
const PASSWORD = 'test-password-1234';

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

let userId = null;
try {
  // ── 0. 테스트 계정 (Admin) ────────────────────────────────────────────
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (cErr) throw new Error(`계정 생성 실패: ${cErr.message}`);
  userId = created.user.id;
  console.log(`\n테스트 계정: ${EMAIL}\n           ${userId}\n`);

  // ── 1. 로그인 (여기서부터 anon 클라이언트) ────────────────────────────
  const { data: si, error: siErr } = await app.auth.signInWithPassword({
    email: EMAIL, password: PASSWORD,
  });
  check('1. 로그인', !siErr && !!si.session, siErr?.message);

  // ── 2. 미로그인 anon 이 콘텐츠를 읽을 수 있는가 ───────────────────────
  const anonOnly = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: anonSpecies, error: asErr } = await anonOnly.from('species').select('id').limit(50);
  check('2. anon 이 species 조회', !asErr && anonSpecies?.length === 44,
        asErr?.message ?? `${anonSpecies?.length}종`);

  const { data: anonDex, error: adErr } = await anonOnly.from('dex_entries').select('*');
  check('3. anon 은 dex_entries 조회 차단', !!adErr || anonDex?.length === 0,
        adErr ? adErr.message : `${anonDex?.length}행`);

  // ── 3. 동의 없이 체크인 시도 → consent_required 여야 함 ───────────────
  const { data: spots } = await app.from('spots').select('id, seq, name, lat, lng, radius_m').order('seq');
  const spot2 = spots.find(s => s.seq === 2);
  const spot4 = spots.find(s => s.seq === 4);

  const { data: noConsent, error: ncErr } = await app.rpc('record_checkin', {
    p_spot_id: spot2.id, p_lat: spot2.lat, p_lng: spot2.lng, p_accuracy_m: 10,
  });
  check('4. 동의 전 체크인 거부', !ncErr && noConsent?.reason === 'consent_required',
        ncErr?.message ?? JSON.stringify(noConsent));

  // ── 4. 프로필 + 동의 생성 (RLS 경유) ──────────────────────────────────
  const consentId = crypto.randomUUID();
  const { error: consErr } = await app.from('consents')
    .insert({ id: consentId, method: 'in_app', scope: { e2e: true } });
  check('5. consents INSERT (.select() 없이)', !consErr, consErr?.message);

  const { error: uErr } = await app.from('users')
    .insert({ id: userId, nickname: 'E2E테스트', consent_id: consentId });
  check('6. users INSERT', !uErr, uErr?.message);

  // ── 5. expert_program 자가 승격 — INSERT/UPDATE 양쪽 ──────────────────
  const otherId = crypto.randomUUID();
  const { error: insExpErr } = await app.from('users')
    .insert({ id: otherId, nickname: '해킹', expert_program: true });
  check('7. 남의 id 로 users INSERT 차단', !!insExpErr, insExpErr?.message ?? '⚠️ 통과됨');

  const { error: updExpErr } = await app.from('users')
    .update({ expert_program: true }).eq('id', userId);
  check('8. expert_program UPDATE 차단', !!updExpErr, updExpErr?.message ?? '⚠️ 승격 성공');

  // ── 6. 포인트/도감 위조 시도 ──────────────────────────────────────────
  const { error: forgeErr } = await app.from('points_ledger')
    .insert({ user_id: userId, delta: 99999, reason: 'checkin' });
  check('9. points_ledger 직접 INSERT 차단', !!forgeErr, forgeErr?.message ?? '⚠️ 위조 성공');

  const { data: anySpecies } = await app.from('species').select('id').limit(1);
  const { error: dexForgeErr } = await app.from('dex_entries')
    .insert({ user_id: userId, species_id: anySpecies[0].id });
  check('10. dex_entries 직접 INSERT 차단', !!dexForgeErr, dexForgeErr?.message ?? '⚠️ 위조 성공');

  const { error: visitForgeErr } = await app.from('visits')
    .insert({ user_id: userId, spot_id: spot2.id });
  check('11. visits 직접 INSERT 차단', !!visitForgeErr, visitForgeErr?.message ?? '⚠️ 위조 성공');

  // ── 7. verify_checkin 각 실패 모드 ────────────────────────────────────
  const { data: tooFar } = await app.rpc('verify_checkin', {
    p_spot_id: spot2.id, p_lat: 35.18, p_lng: 129.08, p_accuracy_m: 10,
  });
  check('12. too_far 판정 + 남은 거리', tooFar?.[0]?.ok === false && tooFar[0].reason === 'too_far',
        `remaining_m=${tooFar?.[0]?.remaining_m}`);

  const { data: lowAcc } = await app.rpc('verify_checkin', {
    p_spot_id: spot2.id, p_lat: spot2.lat, p_lng: spot2.lng, p_accuracy_m: 101,
  });
  check('13. low_accuracy 판정', lowAcc?.[0]?.reason === 'low_accuracy', JSON.stringify(lowAcc?.[0]));

  const { data: okVerify } = await app.rpc('verify_checkin', {
    p_spot_id: spot2.id, p_lat: spot2.lat, p_lng: spot2.lng, p_accuracy_m: 10,
  });
  check('14. 반경 내 통과', okVerify?.[0]?.ok === true, JSON.stringify(okVerify?.[0]));

  // ── 8. 실제 체크인 ────────────────────────────────────────────────────
  const { data: ci, error: ciErr } = await app.rpc('record_checkin', {
    p_spot_id: spot2.id, p_lat: spot2.lat, p_lng: spot2.lng, p_accuracy_m: 10,
  });
  check('15. record_checkin 성공', !ciErr && ci?.ok === true, ciErr?.message ?? JSON.stringify(ci));
  check('16. 장소 카드 2장 자동 지급', ci?.granted_species?.length === 2,
        `${ci?.granted_species?.length}장`);
  check('17. 포인트 = 체크인10 + 카드20+20 = 50', ci?.balance === 50, `balance=${ci?.balance}`);

  // ── 9. 중복 체크인 ────────────────────────────────────────────────────
  const { data: dup } = await app.rpc('record_checkin', {
    p_spot_id: spot2.id, p_lat: spot2.lat, p_lng: spot2.lng, p_accuracy_m: 10,
  });
  check('18. 같은 날 재체크인 → already_checked_in', dup?.already_checked_in === true, JSON.stringify(dup));

  const { data: bal2 } = await app.rpc('point_balance', { p_user_id: userId });
  check('19. 중복 체크인에 포인트 증가 없음', bal2 === 50, `balance=${bal2}`);

  // ── 11. 윤리 필터 ─────────────────────────────────────────────────────
  const { data: cand } = await app.rpc('spot_candidate_species', { p_spot_id: spot4.id });
  const expertLeak = (cand ?? []).filter(s => s.ethics_flag === 'expert_only');
  check('21. expert_only 종이 후보에 없음', expertLeak.length === 0,
        expertLeak.length ? `⚠️ 누출: ${expertLeak.map(s => s.common_name).join(', ')}`
                          : `후보 ${cand?.length}종`);

  const { data: anonCand } = await anonOnly.rpc('spot_candidate_species', { p_spot_id: spot4.id });
  check('22. anon 도 후보 조회 가능(에러 아님)', Array.isArray(anonCand) && anonCand.length > 0,
        `${anonCand?.length ?? 0}종`);

  // ── 12. 좌표 저장 확인 (0010) ─────────────────────────────────────────
  const { data: visitRows } = await app.from('visits').select('lat, lng, distance_m, spot_id');
  check('23. visits 에 좌표 저장됨 (0010)',
        visitRows?.length === 1 && visitRows[0].lat !== null && visitRows[0].lng !== null,
        JSON.stringify(visitRows?.[0]));

  // ── 13. 도감 ──────────────────────────────────────────────────────────
  const { data: dexRows } = await app.from('dex_entries')
    .select('count, species (code, common_name, track)');
  check('24. dex_entries 2장', dexRows?.length === 2,
        dexRows?.map(d => d.species.common_name).join(', '));

  const { data: otherDex } = await app.from('dex_entries').select('*').eq('user_id', crypto.randomUUID());
  check('25. 남의 도감 조회 불가(0행)', otherDex?.length === 0, `${otherDex?.length}행`);

  // ── 14. 원장 확인 ─────────────────────────────────────────────────────
  const { data: led } = await app.from('points_ledger').select('reason, delta').order('created_at');
  check('26. 원장 3건 (checkin + species×2)', led?.length === 3,
        led?.map(l => `${l.reason}:${l.delta}`).join(' '));

  const { error: ledUpdErr } = await app.from('points_ledger').update({ delta: 1 }).eq('user_id', userId);
  check('27. 원장 UPDATE 차단 (append-only)', !!ledUpdErr, ledUpdErr?.message ?? '⚠️ 수정 성공');

  // ── 10. 남의 이름으로 체크인 시도 (0010에서 막은 것) ──────────────────
  const victim = await admin.auth.admin.createUser({
    email: `victim-${Date.now()}@example.com`, password: PASSWORD, email_confirm: true,
  });
  const victimId = victim.data.user.id;
  const { data: imperson } = await app.rpc('record_checkin', {
    p_spot_id: spot4.id, p_lat: spot4.lat, p_lng: spot4.lng, p_accuracy_m: 10,
    p_user_id: victimId,
  });
  const { data: victimBal } = await admin.rpc('point_balance', { p_user_id: victimId });
  check('20. p_user_id 로 남의 계정 체크인 불가', victimBal === 0,
        `피해자 balance=${victimBal}, 응답=${JSON.stringify(imperson)?.slice(0, 60)}`);
  await admin.auth.admin.deleteUser(victimId);

  // ── 정리 ──────────────────────────────────────────────────────────────
} catch (e) {
  console.error('\n중단:', e.message);
  fail++;
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
  console.log(`\n${'─'.repeat(60)}\n통과 ${pass} / 실패 ${fail}`);
  if (fail) {
    console.log('\n실패 목록:');
    for (const r of results.filter(r => !r.ok)) console.log(`  · ${r.name} — ${r.detail}`);
  }
  process.exit(fail ? 1 : 0);
}
