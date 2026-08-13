# 구현 전 준비물 체크리스트

> 기술 스켈레톤 구현 착수 전에 확보해야 할 키·계정·결정사항 전체 목록입니다.
> 상위 문서: [PLAN.md](./PLAN.md) · 콘텐츠: [content/oncheoncheon-draft.md](./content/oncheoncheon-draft.md)

## 0. 현재 상태

| 항목 | 상태 |
|---|---|
| 프로젝트 폴더 | 비어 있음 (git 초기 커밋만) |
| **Supabase 프로젝트** | ❌ **신규 생성 필요** |
| 그 외 키 | ❌ 미확보 |

> **정정:** 이 문서 초안에서 Supabase 프로젝트가 "이미 연결됨"이라고 썼던 것은 잘못된 추정이었습니다.
> MCP 서버가 기존 프로젝트(`uueqkddyofcmtgtgkzux`)를 가리키고 있던 것뿐이며,
> 이 저장소와는 무관합니다. **이 프로젝트 전용으로 새로 생성**합니다.

---

## 1. 필수 — 이게 없으면 MVP가 안 됩니다

### 1-A. Supabase (백엔드 전체) — **신규 생성**

> ⚠️ **프로젝트 생성은 제가 할 수 없습니다.** MCP 도구에 프로젝트 생성 기능이 없습니다
> (`create_branch`는 기존 프로젝트 내 DB 브랜치입니다). 대시보드에서 직접 만들어주세요.

#### ① 프로젝트 생성 — [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**

| 입력 항목 | 권장값 | 이유 |
|---|---|---|
| Name | `river-image` 또는 `busan-river-explorer` | |
| **Region** | **`Northeast Asia (Seoul)` = `ap-northeast-2`** | 공공 시범사업 — 지연시간 + 데이터 소재지. **생성 후 변경 불가** |
| **Database password** | 강한 비밀번호, **즉시 저장** | **생성 시 한 번만 표시**됩니다. 놓치면 재설정해야 함 |
| Plan | Free (MVP) → 파일럿 전 Pro 검토 | 아래 경고 참조 |

> ⚠️ **Free 티어는 7일간 활동이 없으면 DB를 자동 일시정지합니다.**
> 실제로 기존 프로젝트가 이 상태였습니다(쿼리 타임아웃). 개발 중에는 문제없지만,
> **학급 현장학습 당일에 DB가 잠들어 있으면 수업이 통째로 날아갑니다.**
> Phase 2 파일럿 전에는 Pro 전환 또는 주기적 핑(cron)으로 깨어있게 유지하세요.

#### ② 생성 직후 설정

- [ ] **PostGIS 활성화** — Database → Extensions → `postgis` (체크인 반경 판정에 필수)
- [ ] **Storage 버킷 생성** — `photos`, **Private** (Public 금지 — PLAN.md §5.4)

#### ③ 키 수집 — Settings → API

| 항목 | 노출 | 비고 |
|---|---|---|
| Project URL | 클라이언트 OK | `https://<새ref>.supabase.co` |
| **anon / publishable key** | 클라이언트 OK | RLS로 보호됨 |
| **service_role key** | ⛔ **서버 전용** | Edge Function에서만. 클라이언트 절대 금지 |
| **DB password** | ⛔ 서버 전용 | ①에서 저장한 값 |
| **Project ref** | — | URL의 서브도메인. ④에 필요 |

#### ④ MCP 서버를 새 프로젝트로 재연결 ★ 놓치기 쉬움

`C:\Users\ljw09\.claude.json` → `mcpServers.supabase.args`의 `--project-ref`를 새 ref로 교체.
**교체 후 Claude Code 재시작 또는 `/mcp` 재연결이 필요합니다.**

```json
"supabase": {
  "args": ["-y", "@supabase/mcp-server-supabase@latest",
           "--project-ref=<새-project-ref>"],
  "env": { "SUPABASE_ACCESS_TOKEN": "sbp_..." }
}
```

> 이걸 안 바꾸면 마이그레이션·Edge Function 배포가 **전부 옛 프로젝트로 들어갑니다.**
> `SUPABASE_ACCESS_TOKEN`은 계정 전체 범위라 새 프로젝트에도 그대로 동작하므로
> **조용히 잘못된 곳에 적용되는** 것이 이 실수의 위험한 점입니다.

### 1-B. 지도 SDK

두 안 중 택일. **카카오맵을 기본 권장**하되, 공공사업 라이선스가 걸리면 VWorld로 전환합니다.

| | **카카오맵 (권장)** | **VWorld (국토교통부)** |
|---|---|---|
| 발급처 | Kakao Developers | VWorld 오픈API |
| 필요한 것 | 앱 생성 → **JavaScript 키** | 인증키 신청 |
| 도메인 등록 | **필수** — 웹 플랫폼에 사이트 도메인 등록 | **필수** |
| 장점 | 개발 편의성·POI 정확도 우수, 자료 많음 | 공공 목적 라이선스가 깔끔, 공적 데이터 |
| 확인 필요 | 상업/공공 서비스 이용약관·일 쿼터 | 서비스 안정성·타일 품질 |

**도메인 등록은 개발 시작 전에 해두세요.** 등록 안 하면 로컬에서도 지도가 안 뜹니다.

```
등록할 도메인:
  http://localhost:5173      ← Vite 기본 포트
  http://localhost:4173      ← Vite preview
  https://<배포도메인>        ← 나중에 추가
```

> ⚠️ **지도 JS 키는 클라이언트에 그대로 노출됩니다.** 이건 정상이며, **도메인 화이트리스트가 유일한 보호 수단**입니다. 숨기려 하지 말고 도메인 제한을 정확히 거세요.

### 1-C. 종 판별 API (Anthropic)

PLAN.md §7.5에서 외부 API 채택으로 결정했습니다. **Claude API를 권장**합니다.

| 항목 | 값 |
|---|---|
| 키 | `ANTHROPIC_API_KEY` — [platform.claude.com](https://platform.claude.com) 콘솔에서 발급 |
| 노출 | ⛔ **서버 전용** (Supabase Edge Function secret) |
| 모델 | `claude-opus-5` — $5 / $25 per MTok (입력/출력) |
| 호출 방식 | **Message Batches API** — 비동기 배치, **비용 50% 할인** |

**왜 Claude API인가 (이 프로젝트 기준):**

1. **문제가 이미 제약돼 있습니다.** §7.5의 후보 압축으로 3~10종만 남으므로, 도감의 식별 힌트(`쇠백로 = 부리 검정 + 발가락 노랑`)를 프롬프트에 그대로 넣고 그 중에서 고르게 하면 됩니다. 열린 분류 문제가 아닙니다.
2. **구조화 출력**으로 `{species_id, confidence, reason}`을 스키마 강제로 받을 수 있습니다 — 파싱 실패가 없습니다.
3. **배치 처리와 정합**합니다. PLAN.md에서 "판별은 실시간일 필요가 없다"고 결정했으므로 Batches API가 그대로 맞고, **비용이 절반**입니다.
4. 상업·공공 이용 약관이 명확합니다 (iNaturalist API의 이용약관 확인 과제가 사라집니다).

> **모델 선택은 님이 결정하실 사항입니다.** 기본값은 `claude-opus-5`로 잡았습니다.
> 후보가 3~10종으로 좁혀진 제약 분류라 더 저렴한 모델(`claude-haiku-4-5`, $1/$5)로도 충분할 가능성이 있지만,
> **파일럿에서 실제 정확도를 측정한 뒤 판단**하는 게 맞습니다. 어댑터 인터페이스를 두어 모델 교체가 1줄이 되도록 설계하겠습니다.

---

## 2. 조건부 — 해당 기능을 쓸 때만

### 2-A. 기상청 API (안전 차단 — PLAN.md §5.3)

호우·홍수 시 코스 자동 비활성화에 필요합니다. **아동 안전 기능이므로 사실상 필수에 가깝습니다.**

| 항목 | 값 |
|---|---|
| 발급처 | [공공데이터포털(data.go.kr)](https://www.data.go.kr) 회원가입 → 활용신청 |
| 신청할 API | 기상청_단기예보 조회서비스 + 기상특보 조회서비스 |
| 키 | `KMA_SERVICE_KEY` |
| 노출 | ⛔ **서버 전용** — 공공데이터포털 키는 클라이언트 노출 금지 |
| 소요 | 자동 승인 API는 즉시, 심의 대상은 1~2일 |

### 2-B. 국립생물자원관 API (콘텐츠 제작용)

판별 모델이 아니라 **분류·미디어 데이터**입니다. 도감 카드의 학명·분류체계·표본 이미지 확보에 씁니다.

| 항목 | 값 |
|---|---|
| 발급처 | [species.nibr.go.kr/api-list](https://species.nibr.go.kr/api-list) |
| 쓸 API | 국가생물종목록 / 디지털콘텐츠 / 표본정보 |
| 용도 | 32종 도감 카드 제작 시 참조 (런타임 아님) |
| 우선순위 | 낮음 — 콘텐츠 작업 시작할 때 |

### 2-C. 배포

| 항목 | 값 |
|---|---|
| 플랫폼 | Vercel 또는 Cloudflare Pages (둘 다 무료 티어 충분) |
| 필요 | GitHub 연동 계정 |
| 도메인 | 선택. 확정되면 지도 SDK에 도메인 추가 등록 필요 |
| 우선순위 | Phase 1 후반 |

---

## 3. 최종 환경변수 구성

`VITE_` 접두사가 **붙으면 클라이언트 번들에 그대로 들어갑니다.** 접두사 유무가 곧 보안 경계입니다.

### `.env.local` (프론트엔드 · Git 제외)

```bash
# 클라이언트 노출 OK
VITE_SUPABASE_URL=https://uueqkddyofcmtgtgkzux.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_KAKAO_MAP_KEY=...            # 도메인 화이트리스트로 보호
```

### Supabase Edge Function Secrets (서버 전용)

```bash
# ⛔ VITE_ 접두사 절대 금지 — 붙이는 순간 브라우저에 노출됨
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
KMA_SERVICE_KEY=...
```

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... KMA_SERVICE_KEY=...
```

`★ Insight ─────────────────────────────────────`
**`VITE_` 접두사는 편의 기능이 아니라 보안 경계입니다.** Vite는 빌드 시 `VITE_`로 시작하는 변수만 클라이언트 코드에 치환해 넣습니다. 실수로 `VITE_ANTHROPIC_API_KEY`라고 쓰면 **번들 JS에 평문으로 박혀 배포**되고, 누구나 개발자도구에서 꺼내 쓸 수 있습니다.

그래서 이 프로젝트에서 `ANTHROPIC_API_KEY`와 `KMA_SERVICE_KEY`는 **반드시 Edge Function을 경유**해야 합니다. 클라이언트가 직접 판별 API를 호출하는 구조는 설계 자체가 불가능하다고 보시면 됩니다 — 이것도 §7.5에서 "판별은 비동기 배치"로 정한 결정이 맞아떨어지는 지점입니다.
`─────────────────────────────────────────────────`

### `.gitignore` (최초 커밋 전 필수)

```
.env
.env.local
.env*.local
node_modules
dist
.supabase
```

---

## 4. 키가 아닌 결정사항

구현 착수 전에 확정이 필요한 것들입니다. **①②는 지금 답이 필요하고, ③④는 기본값으로 진행 가능합니다.**

| # | 결정 | 선택지 | 기본값 |
|---|---|---|---|
| ① | **지도 제공자** | 카카오맵 / VWorld / 네이버 | 카카오맵 |
| ② | **판별 모델** | `claude-opus-5` / `claude-haiku-4-5` / 파일럿 후 결정 | `claude-opus-5` + 어댑터로 교체 가능하게 |
| ③ | 아동 인증 방식 | 익명 기기 세션 / 학급 참여코드 / 둘 다 | 둘 다 (교사 대시보드 전제) |
| ④ | 패키지 매니저 | npm / pnpm | npm |

---

## 5. 병렬 구현 트랙 — 키 없이 시작 가능한 범위

**전체의 약 70%는 키 없이 지금 바로 착수 가능합니다.** 키 대기 중에 놀 필요가 없습니다.

### 🟢 트랙 A — 키 불필요 (즉시 착수)

| 작업 | 산출물 |
|---|---|
| 프로젝트 스캐폴딩 | Vite + React + TS + PWA 설정, 라우팅, `.gitignore` |
| **DB 스키마 SQL 작성** | `supabase/migrations/*.sql` — PostGIS 포함 전체 스키마 (적용은 나중) |
| **콘텐츠 시드 데이터** | 온천천 6스팟 + 도감 32종 → SQL/JSON 변환 |
| **도감 UI** | 카드 그리드, 실루엣(미획득), 등급 표시, 세트 진척도 — 목 데이터로 |
| **이미지 파이프라인** | 클라이언트 리사이즈 + **EXIF 전량 제거** (Canvas 재인코딩) |
| **퀴즈 엔진** | 문항 렌더링, 정답 판정, 해설 표시 |
| **포인트 원장 로직** | `points_ledger` 계산·집계 (순수 함수) |
| **판별 어댑터 인터페이스** | 모델 교체 가능한 추상화 + 목 구현 |

### 🟡 트랙 B — Supabase 키 필요

| 작업 | 대기 사유 |
|---|---|
| 마이그레이션 적용 | DB password + 프로젝트 Resume |
| 인증/세션 | anon key |
| **체크인 Edge Function** | service_role + PostGIS 활성화 |
| Storage 업로드 | 버킷 생성 + anon key |

### 🔴 트랙 C — 외부 키 필요

| 작업 | 필요 키 |
|---|---|
| 지도 화면 | 카카오맵 JS 키 + 도메인 등록 |
| 판별 배치 처리 | `ANTHROPIC_API_KEY` |
| 기상 안전 차단 | `KMA_SERVICE_KEY` |

---

## 6. 지금 당장 하실 일 (순서대로)

1. **Supabase 새 프로젝트 생성** — Region은 반드시 **Seoul**, DB password 즉시 저장
2. **PostGIS 활성화** + **`photos` 버킷 생성 (Private)**
3. Settings → API에서 **anon key + service_role key + project ref** 복사
4. **`.claude.json`의 `--project-ref` 교체 → Claude Code 재시작** ← 이거 빠뜨리면 옛 프로젝트로 들어감
5. Kakao Developers에서 **앱 생성 → JavaScript 키 + localhost 도메인 등록**
6. platform.claude.com에서 **API 키 발급**
7. data.go.kr에서 **기상청 API 활용신청** (승인 대기 있으니 미리)

> 1~4번이 끝나면 트랙 A + B가 열립니다. 5~7번은 병행하셔도 됩니다.
> **1~4번을 기다리는 동안 🟢 트랙 A는 지금 바로 착수 가능합니다.**

---

*작성 2026-08-14 · 상위 문서 [PLAN.md](./PLAN.md)*
