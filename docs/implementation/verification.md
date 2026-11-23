# 구현·배포 검증 기록

## 2026-11-09 작업 목록의 선택 체크박스와 상태점 메뉴

완료 checkbox를 제거하고 선택 checkbox와 구분되는 14px 원형 상태점·펼침 화살표를
도입했다. 개인/구현 Task 모두 같은 메뉴에서 상태를 선택하며, 제목 아래 중복 상태
편집은 현재 상태 텍스트로 바꿨다. 테마의 squircle 상속을 배제해 실제 원을 보장한다.
기존 `saveListState`의 revision·완료 gate·취소 사유·권한 계약을 재사용했다.

- 변경 전 새 UI 회귀 6개가 상태 메뉴 부재로 실패하는 것을 확인하고 수정 후 통과했다.
- 웹 전체 38개 파일·279개 검사와 build·favicon 검사가 통과했다. 이전 완료 checkbox
  테스트는 명시 상태 선택에 맞춰 수정했으며 완료 저장·409·사유·권한 단언은 유지했다.
- 실제 Edge·FastAPI·무작위 전용 PostgreSQL schema에서 5개 흐름을 확인했다:
  선택 checkbox/원형 메뉴 분리와 Enter/Escape·포커스, 진행/완료/재개,
  완료 근거 부족 409의 현재 상태 보존, 취소 사유 필수, 모바일 light/dark·44px·선택 모드 구분.
  페이지 runtime 오류가 없었고 finally에서 schema와 QA 서버를 정리했다.
- 실제 브라우저 중 selection mode·숨은 trigger에서 파생한 locator 문제 두 건은
  시나리오와 안정된 row locator를 바로잡았다. 앱 동작 결함으로 기록하지 않는다.
- 실제 Hub/LLM·Note·Microsoft 승인은 새로 실행하지 않았다. backend/migration 변경은 없고
  직전 검증·운영 source의 모든 backend 파일 hash와 동일함을 확인했다.

실행: `tests/browser-task-list-status.cjs`, local evidence `.projects/research/task-list-status/`.
운영 `b313610cb90a73bc`에 반영하고 92개 payload·공개 16개 자산/인증·실제 Edge
로그인 4개 묶음을 확인했다. schema0016·모든 업무 자료·assistant 설정을 보존했고
필수 잔여 작업은 없다. [배포 문서](deployment.md)의 최신 절을 따른다.


## 2026-11-09 Story·Task와 반복 기획 구현

최신 사용자 goal의 기능·회귀·실제 브라우저 결과는
[통합 검증 기록](story-task-verification.md)과 [실행 기준표](story-task-goal.md)를 따른다.
전체 PG 424개와 후속 receipt 경합 18개, 웹 277개·실제 Edge 10개 흐름·정적 검사·build를
통과했다. 운영 `15728ec5d0015de8`·schema0016과 자료/설정 보존·공개 자산/인증·실제 Edge를
확인해 21/21(100%) 완료했다. 아래 개선안 시안 검토는 구현 착수 전 이력이다.


## 2026-11-09 기획·Story·Task 개선안의 검토

APP-REQ-065~072 / AC-144~160을 [기획 21](../planning/21-planning-story-task-improvement.md)에
연결했다. 첨부 인계안 snapshot의 원문 hash를 대조하고 로컬 모델·관계·완료 규칙·
SkillRun 선택 적용·권한·Note 경계와 차이를 기록했다. 최초/변경 기획, Story/Task의
독립성과 다대다, 상태/검증·별도 집계·선택 일정을 구체화했다.

`node docs/planning/prototype/verify-planning-story-task.cjs`는 실제 Edge의 **모사 시안**
5개 행동 묶음을 통과했다. 공유 Task와 두 목록, 독립 추가/목록·보드 동일 집합,
의존 후보 누락 거부·선택/키보드/취소/초안·기존 완료 보존, 최초 기획 취소 뒤
새 빈 프로젝트 유지와 기존 프로젝트 복귀, Task-only 기획, 390px 모바일의
본문 스크롤/적용 버튼·Escape·JS 오류 없음을 확인했다. 문서와 시안을 자체 대조하며
초기 기획을 새 프로젝트의 생성 후 맥락으로 분리했고, 그 취소/재개도 재검사했다.

[Story 현황](../planning/prototype/screenshots/story-task/stories-desktop.png),
[Task backlog](../planning/prototype/screenshots/story-task/tasks-desktop.png),
[변경 미리보기](../planning/prototype/screenshots/story-task/change-preview-desktop.png)와
[모바일](../planning/prototype/screenshots/story-task/change-preview-mobile.png)을 캡처·관찰했다.
로컬 HTML/JS의 탭 메모리 모사이며 실제 React component·PostgreSQL/API·권한 강제·
Hub/LLM·Note 연동·운영 동작의 검증이 아니다. 해당 구현은 미착수다.
이번 요청에서 앱 source/DB/운영을 수정하거나 새 실행 goal을 생성하지 않았다.
기존 앱의 247개 검사를 새 Story 기능의 통과 근거로 재사용하지 않는다.

## 2026-11-09 로그인 화면의 상단·전체 공간 활용

APP-REQ-064 / AC-142~143. Fluent/dark·583×1122에서 변경 전 브랜드 y=293.5,
로그인 영역 폭=460px를 실제 Edge로 재현했다. 모바일 block 배치에도 남은
`align-content:center`가 내용 전체를 가운데로 밀고 있었다. `start`로 명시하고
상단 헤더와 두 열/한 열 배치를 정리했다. 동일 fixture에서 브랜드 y=22,
로그인 영역 폭=543px가 됐다. 1440px에서는 로그인 폭을 370px 수준에서
약593px로 넓혔다. 음수 여백으로 맞추던 테마 선택을 헤더 안의 flex/wrap으로
배치하고 480px 이하에서는 선택기가 다음 줄의 너비를 채운다.

| 경계 | 결과 |
|---|---|
| 웹 | `npm --prefix web run check`: 34파일·247개 통과 |
| build | `npm --prefix web run build`: typecheck/Vite/favicon 통과, 기존 번들 크기 안내 유지 |
| 실제 Edge 배치 | `uv run python scripts/verify-mobile-browser.py verify-login-layout-browser.cjs`: 583/390/320/768/1440/1920px의 Fluent·Glass light/dark 6개와 입력 포커스/390×430 짧은 화면 1개, 총7 checkpoint 통과 |
| 배치 기준 | 브랜드 상단 12~64px, 가로 넘침 없음, 모바일 본문 폭 활용, desktop 두 열 상단 일치, 테마 선택 경계/로그인 버튼 스크롤 확인 |
| 기존 흐름 | 실제 startup/API/로컬 계정 홈·키보드·뒤로 5 checkpoint 재확인 |
| 이관/설정 | backend/schema·권한·integration Caddy·private 환경/마운트·명령·사용자를 보존하고 전체 업무 레코드 fingerprint 동일 |

배치 검사는 실제 Edge·앱·격리 PostgreSQL의 세션/health를 사용한다. Microsoft-only
표시를 고정하기 위해 auth-options만 공개 응답 fixture로 주입했고 실제 Microsoft
승인을 수행한 검사는 아니다. 입력 포커스 뒤 viewport를 줄인 검사는 물리 모바일
키보드와 구분한다. 최초 1920px 검사에서 로고 y=66이 기준64를 넘은 것을 확인해
최대 패딩을 60px로 조정하고 build/배치/기존 startup을 다시 확인했다. 전체 웹 이후
변경은 이 CSS 패딩뿐이므로 기존 JS/TS 247개 검사의 증거는 재사용한다.

로컬 캡처: [모바일](screenshots/login-layout/login-390-dark.png),
[583px](screenshots/login-layout/login-583-dark.png), [desktop](screenshots/login-layout/login-1440-dark.png).
운영 이미지·공개 Microsoft 표시와 실제 자산 검사는 [배포 기록](deployment.md)의 최신 절을 따른다.
운영 `pydemia-projects:login-7721890b4eeda52b`에 반영하고 실제 공개 auth-options를
기다린 Microsoft-only 화면에서 583/390px dark·1440px light를 확인했다.
테마 전환과 가로 넘침 없음, 상단 배치/폼 너비, JS/CSS/favicon bytes/MIME 일치,
비로그인 API 401과 Microsoft 시작 302/S256의 4 checkpoint가 통과했다.
운영 검사는 auth-options fixture를 사용하지 않았다. backend·schema·설정과 업무
fingerprint 보존, private 백업과 관리 compose는 배포 기록을 따른다.
[운영 모바일](screenshots/login-layout/production-390-dark.png)·
[583px](screenshots/login-layout/production-583-dark.png)·
[운영 desktop](screenshots/login-layout/production-1440-light.png)을 캡처·관찰했다.

## 2026-11-09 홈 컨트롤의 버튼 형태

APP-REQ-062 / AC-138 후속 피드백. `startup.css`에서 홈 링크와 제목의 모든
상태 밑줄을 제거하고 hover/누름 배경, 40px 이상 클릭 영역, pointer 커서와
텍스트 선택 방지를 추가했다. 엠블럼의 별도 배경/테두리를 제거했다. 홈 URL·
새 탭·키보드 Enter는 기존 동작을 유지하고 키보드 focus-visible은 보존한다.
포커스 표시가 옆 화면 밖으로 잘리거나 다음 작업공간 이름과 겹치지 않게 여백을 조정했다.

`npm --prefix web run check`는 34파일·247개 통과, build와 favicon 검사도 통과했다.
실제 Edge+격리 PostgreSQL의 기존 startup 검사를 확장해 static light/dark·React
대기·로그인·프로젝트 요청·엠블럼 클릭·뒤로/Enter 5 checkpoint를 확인했다.
계산된 스타일에서 부모/제목의 밑줄 없음, 컨트롤/아이콘 border 0, hover 배경
변화, 클릭 영역 크기와 user-select를 확인했다.
[hover](screenshots/startup/home-hover-desktop.png)·[키보드 focus](screenshots/startup/home-focus-desktop.png)를 관찰했다.
전체 웹 검사 이후 조정은 CSS 여백·outline offset뿐이며 build/실제 Edge를 다시 실행했다.
backend·schema와 기존 integration은 바꾸지 않고 현재 runtime 위에 frontend layer만 반영한다.
운영 결과는 [배포 기록](deployment.md)의 최신 절을 따른다.
운영 `pydemia-projects:brand-0caa92609f21d56f`에 반영했고 공개 Edge에서 초기
HTML과 React 홈 컨트롤의 hover 밑줄/테두리 없음·pointer·선택 방지를 확인했다.
초대 token 복귀·비로그인 API 차단·Microsoft 시작·JS/CSS/favicon bytes/MIME와
runtime 오류 없음까지 6 checkpoint를 통과했다. 넓은 인증 smoke의 첫 로그인 UI
5초 대기는 실패했으며 실제 auth-options 응답이 도착한 뒤 같은 UI 단언을 하도록
요청/렌더 단계를 나눠 재검사했다. 운영 코드와 UI 단언·API 인증 조건은 바꾸지 않았다.
프런트엔드 디렉터리 권한 문제로 한 차례 자동 복구 후 public 경로 읽기 preflight를
보완한 배포 결과와 전체 업무/권한 자료 보존은 배포 기록에 남겼다.
[운영 hover](screenshots/startup/production-brand-hover.png)를 캡처했다.
별도의 운영 스타일 검사에서 1440px light·390px dark 각각 밑줄/테두리 없음·
pointer/클릭 영역·Enter 홈 이동과 JS/CSS/favicon hash·API 인증 경계를 확인했다
(4 checkpoint). [밝은 테마](screenshots/startup/production-brand-hover-light.png)와
[어두운 테마](screenshots/startup/production-brand-hover-dark.png)의 실제 hover를 캡처했다.

## 2026-11-08 홈 링크·프런트엔드 로딩

APP-REQ-062~063 / AC-138~141. SNB 위 엠블럼과 제목을 `Projects 홈` 링크로
연결했다. 작업/프로젝트 상세와 필터/hash를 정리해 프로젝트 목록으로 이동하며,
선택했던 프로젝트의 계정별 기억은 보존한다. 수정키/새 탭의 기본 링크 동작과
키보드 Enter를 지원한다. 로그인 전의 브랜드 링크도 같은 홈 주소를 사용한다.

`index.html`에 로딩 상태와 자리 표시를 넣고 head에서 CSS를 읽어 앱 모듈이나
API 응답 전에 표시한다. React 시작 후 세션 확인, 프로젝트 목록·내용 요청은
`LoadingScreen`/`ContentLoading`이 이어받는다. 기존 성공/오류·로그인 복구 흐름을
유지하고 상태 안내, light/dark와 reduced-motion을 지원한다. HTML 자체의 서버
응답을 받기 전에는 이 화면을 표시할 수 없으며 백엔드 처리 시간이 줄었다고 주장하지 않는다.

| 검사 | 현재 결과 |
|---|---|
| 웹 전체 | `npm --prefix web run check`: 34개 파일·247개 통과. 실제 App의 홈 URL/기억 보존 및 세션/프로젝트 pending 검사 2개 추가 |
| build | host와 allowlist 기반 Linux amd64 image build·favicon 확인 통과. 기존 번들 크기 안내 유지 |
| 실제 Edge | `uv run python scripts/verify-mobile-browser.py verify-startup-browser.cjs`: 5 checkpoint 통과. main module 다운로드를 실제 보류한 HTML 로딩(1440 light/390 dark), 세션 응답 보류 후 로그인 전환 2가지, 프로젝트 요청 지연·엠블럼 클릭·URL 정리·뒤로·Enter 홈 이동 |
| 화면 관찰 | [초기 모바일 dark](screenshots/startup/static-390-dark.png), [desktop 홈 focus](screenshots/startup/home-focus-desktop.png). 수평 넘침 없음과 모션 감소 시 animation 없음 확인 |
| 인증 회귀 | 전체 웹에 초대 로그인 복귀·세션/초안 회귀 포함. backend·schema·권한/프록시 설정은 직전 운영과 동일 |
| 배포 설정 회귀 | `uv run pytest tests/test_deployment.py -q`: 29개 통과, 기존 TestClient deprecation 1개 |

Note의 로컬 `src/web/components/DocumentLoading.tsx`(SHA-256
`e8041e4f2bcc182f360a3515842014f6aaf7fb78e81eb90844b17d8cf0f6e0f4`)와
`DocumentLoading.css`(`646bc30d740c34bcf62ddc321109e83e9738f338b40d161d3f39e0a789920d38`)를
참고했다. 새 component 공급원을 추가하지 않고 기존 브랜드/토큰·기본 링크와
프로젝트 내부 로딩 표시를 조합했다. Note 운영 페이지 조회는 불가해 로컬 코드
확인과 구분했다. skills.pydemia.ai의 frontend-development를 MCP에서 읽어 적용했으며
library source revision은 `b7df3b7b5ea47d9d084a965d4da0168547338fa0`이다.
첫 정적 검사에서 교체 후 남은 미사용 Loading import를 제거하고 전체 검사·빌드를 재실행했다.
독립 읽기 검토에서 밝은 초기 배경의 홈 포커스 대비 부족을 확인해 색을 보완했다.
수정 색의 light/dark 배경 대비는 각각 4.11:1 / 3.06:1이며 host/Linux build와
실제 Edge 5개 checkpoint를 다시 확인했다. 전체 웹 247개 이후 바뀐 것은 이 CSS
색 한 곳이므로 JS/TS 동작 검사의 증거는 재사용한다. 미배포 준비 이미지
`5b283393f2b2397e`는 운영에 전환하지 않았고 최종 source는 `3f5f287a22895e64`다.
실제 Hub·LLM·Note 연동이나 Microsoft 승인 조작은 이 프런트엔드 변경의 검사 범위가 아니다.
운영 이미지·공개 경로 확인은 [배포 기록](deployment.md)의 최신 절을 따른다.
배포 전 대조에서 별도 assistant rollout의 backend·schema 0013·Caddy 경로가
운영에 추가된 것을 발견했다. 직전 986 전체 이미지를 기준으로 한 전환은 source
대조에서 차단됐고 서비스는 바뀌지 않았다. 이 별도 변경을 workspace에 합치거나
덮어쓰지 않고 현재 runtime image 위에 검증한 web/dist만 얹는 배포로 전환했다.
프런트엔드 build source hash와 전체 runtime image 식별을 구분하며, 운영 backend·
권한/schema·private mount/environment·integration 경로 보존을 별도로 대조한다.
최종 runtime은 `pydemia-projects:home-3f5f287a22895e64`, schema는 기존 0013이며,
backend/migration 파일 hash·환경·마운트·명령·사용자와 전후 DB fingerprint가 같다.
프로젝트 7개·항목 29개·assistant operation 3개를 포함한 기존 업무 자료를 보존했다.
공개 운영 Edge에서 JS 응답을 실제 보류한 초기 화면과 홈 링크, 로그인/초대 복귀,
API 인증 차단, Microsoft 시작·JS/CSS/favicon bytes/MIME의 5 checkpoint를 확인했다.
최초 공개 UI 5초 대기 한 건은 실패했고, 진단을 추가한 동일 기준 재실행에서
별도 코드/제한 변경 없이 통과했다. [운영 초기 화면](screenshots/startup/production-static-390-light.png)을 남겼다.

## 2026-11-07 프로젝트별 권한 구현·운영 검증

APP-REQ-061 / AC-133~137과 [PG-01~16](project-access-goal.md)을 구현했다.
최종 운영 source는 `986e0a1af12655bb`, schema는 `0012`다. 기존 pydemia.ai
조직 로그인은 유지하며 프로젝트별 멤버십과 오너·에디터·뷰어·사용자 지정 역할을
서버와 UI에 적용했다. 프로젝트의 **프로젝트 설정 · 멤버·권한**에서 관리한다.
조직 전체 자동 공유나 owner_id 접근 우회는 없다. 실제 삭제 기능은 없으므로
삭제 권한은 제공하지 않고 보관·복원은 오너만 할 수 있다.

| 경계 | 최종 증거·판정 |
|---|---|
| 이관·정책 | 실제 PostgreSQL의 0010→head 자료·필드 ID/revision·오너·개인 순서 보존, 초기 0011 draft→0012 복구. 기본 3역할·18개 동작·사용자 지정 역할·마지막 오너·cross-project role FK 검증 |
| 목록·변경 HTTP | 전역 목록/검색/집계/cursor, 직접 ID 404, 읽기 가능한 프로젝트의 금지 동작 403. 25개 HTTP 검사와 제목/상태/속성/문서/관계/기준선/테스트의 현재 권한 확인 |
| 이동·반출 | 양쪽 이동 권한·현재 원본·독자 변화·미리보기/receipt/되돌리기 재검사. 실제 두 transaction의 이동/ZIP/관계 경합 409, actor 개인 보기·프로젝트 필드 격리 |
| SkillRun | 요청자와 요청 당시 membership ID, 현재 원본의 읽기·실행 권한을 claim/외부 호출 직전/재시도/적용에 재검사. 실행 권한 전용 38개와 기존 private source 회귀 통과 |
| 실제 앱·Edge | 무작위 격리 PostgreSQL schema+실제 API+로컬 계정으로 10개 권한 checkpoint 묶음. 에디터 편집/상태/드래그, 뷰어 비활성, 사용자 지정 역할 403, A/B/C 목록/집계, focus 강등/제거, cache/draft 무재전송, 최신 초대 미리보기·명시적 수락·오너 이전 |
| 화면 | 320/390px light/dark 체크박스 선택·비선택 대비와 영향 확인. [캡처](screenshots/project-access/owner-role-impact-desktop.png), [모바일](screenshots/project-access/role-form-390-light.png). 기존 inline 13개·재로그인 11개 브라우저 checkpoint 통과 |
| 초대·재인증 | fragment 토큰을 경로 일치·15분 TTL의 sessionStorage에 보관. 실제 App bootstrap 2개 검사에서 로그인 rd/복구 메타에 토큰 제외, 최신 revision 재미리보기, 명시적 수락, 만료 요청 무재전송 확인 |
| 실제 인증 프록시 | 고정 oauth2-proxy+합성 RSA 토큰의 14개 checkpoint. 원래 missing-email 500 재현, single/multi 콜백·nonce/audience/tenant·헤더 위조 거부, 공개 진입 허용·데이터/인증쓰기·경로 우회 차단 |
| 운영 보존 | private DB/state/config/source 백업·dump 목록 검사. 최초 이관의 기존 column fingerprint와 최종 전환의 모든 업무/권한 레코드 fingerprint 동일. 프로젝트 6·항목 28·revision 42·보기 3·순서 24·기준선 1·관계 4 보존; 기본 역할 18·오너 멤버십 6 |
| 운영 경로·자산 | app/DB healthy, proxy/edge running. 실제 공개 Edge에서 App 200·초대 token checkpoint·token-free rd, 비로그인 데이터/session/preview·위조 헤더 401, Microsoft authority/계정 선택/S256/nonce, JS/CSS/favicon bytes·MIME 일치와 runtime 오류 없음 확인 |

```powershell
docker compose up -d db
uv run projects migrate
uv run pytest                                      # 369 passed
uv run ruff check src tests migrations              # passed
uv run ruff format --check src tests migrations     # 73 files
uv run mypy src/projects                           # 32 source files
npm --prefix web run check                         # 34 files / 245 tests
npm --prefix web run build                         # host + immutable Linux image build
uv run --with cryptography python scripts/verify-entra-proxy.py # 14 checkpoints
uv run python scripts/verify-mobile-browser.py verify-project-access-browser.cjs # 10 groups
uv run python scripts/verify-mobile-browser.py verify-inline-browser.cjs # 13
uv run python scripts/verify-mobile-browser.py verify-reauth-browser.cjs # 11
```

최초 권한 이미지 `ea7acc4fbce89dd6`에서 backend 369·web 243·정적 검사와 실제
권한/편집/재로그인 브라우저 검사를 통과했다. 최종 이미지는 그 source에서
`compose.production.yaml`과 App bootstrap 검사 1파일만 바뀌었다. backend/runtime
JS/CSS는 동일해 기존 증거를 재사용하며, 영향받은 배포 검사 29개·프록시 14개·
웹 전체 245개·Linux build와 공개 운영 Edge는 최종 설정으로 다시 확인했다.
이후 실행/기획 문서만 정리했으며 source/archive hash 재대조로 구분한다.

첫 전체 backend 검사에서 숨은 다른 프로젝트 target에 422를 내던 한 건을
읽기 권한 404 검사로 수정했다. 웹 전체 병렬 검사에서 첫 실제 Markdown renderer
lazy import가 기본 기다림보다 늦는 fixture는 beforeAll에서 같은 실제 renderer를
미리 읽게 했다. inline 브라우저의 기존 개인 field seed는 새 프로젝트 field 계약에
맞게 project_id를 지정했다. 기능 assertion·대기 제한을 완화하거나 검사를 삭제하지
않고 해당 검사와 전체를 재실행했다. 독립 agent의 자료·실행·UI·HTTP 경계 리뷰와
지적 수정을 현재 source 및 관련 회귀로 대조했다.

독립 리뷰의 주요 수정 경계는 이동한 source snapshot의 ZIP 읽기 권한,
ZIP의 Item→Project 잠금 후 재검사, link endpoint/project 재검사, 기준선의
숨은 revision Item ID 필터, task-context의 run 전체 원본 필터, foreign target
사전 읽기 검사와 역순 잠금 제거, Git 중복의 현재 멤버십 범위와 옛 unique
index 제거, 오너 전용 보관과 미제공 삭제 코드의 정합성이다.

운영 첫 점검에서 OAuth2 Proxy 자체 로그인 화면이 앱보다 먼저 응답해 새 초대
fragment를 App이 보존할 수 없는 경계를 발견했다. GET root·flat JS/CSS assets·
favicon·auth options·health만 공개해 App 로그인 화면이 먼저 열리게 했다.
project/session/preview API와 인증 쓰기는 계속 보호한다. 프록시 우회 설정과
실제 공개 브라우저에서 원래 증상을 재검사했다.

남은 경고는 기존 Starlette TestClient deprecation과 번들 크기 안내다.
브라우저는 실제 Edge·DB·앱이지만 로컬 비밀번호 계정이며 Entra IdP/토큰은 합성이다.
이번에 실제 다른 Microsoft 계정 두 개의 승인 이후 조작, 물리 모바일 기기,
실제 Hub·LLM·Note 연동은 검증하지 않았다. 운영에는 QA용 사용자·업무 자료를
추가하거나 다른 사람의 권한을 임의로 부여하지 않았다. 로그인 후 실제 구성원
초대는 오너가 새 프로젝트 설정에서 수행한다. 배포 식별·복구는 [배포 기록](deployment.md)을 따른다.

## 이전 설계 검토 · 2026-11-07 프로젝트별 권한 착수 전

사용자가 로그인 범위를 `pydemia.ai` 조직으로 확정하고, 권한의 단위를 프로젝트로
명시했다. APP-REQ-061의 [설계 20](../planning/20-tenancy-and-project-permissions.md)을
프로젝트 멤버십·기본/사용자 지정 역할·동작별 capabilities·멤버/역할 관리 API와
프로젝트 설정 화면으로 수정했다. Workspace 역할 상속 제안은 대체했다.

현재 코드의 `Project.owner_id`, `records.project_for_user`, 프로젝트 목록/전체
작업의 직접 owner 조건, `ProjectActions`의 이름/ZIP 메뉴를 읽어 프로젝트별 멤버
관리와 역할 적용이 미구현임을 다시 확인했다. 목록·검색·집계·직접 URL·쓰기·
export/transfer/worker까지 같은 프로젝트 권한을 적용하는 전환 범위를 기록했다.
AC-133~134는 수정 설계로 검토했고 AC-135~137의 구현·실행 검증은 미착수다.
기존 로그인 검사 273/215개 결과로 새 권한 조건을 충족 처리하지 않는다.

이번 변경은 문서에 한정한다. 앱 source·DB·운영 정책은 바꾸지 않았고 운영은
`47b682394f07d58d`다. Markdown 참조·폐기 결정과 현재 기준의 충돌·diff를 확인하며,
앱 테스트와 운영 재배포는 수행하지 않는다.

## 2026-11-07 Entra 승인 후 500·인증 멀티테넌시

APP-REQ-059~061 / AC-129~134. 운영 source `47b682394f07d58d`에 구현한 인증
정책/identity 경계와 [기획 20](../planning/20-tenancy-and-project-permissions.md)의
후속 팀 역할 설계를 구분한다. 외부 조직·개인 계정 허용은 활성화하지 않았다.

운영 직전 조사에서 app/DB healthy, 앱 traceback 없음, 프록시의 콜백 두 건에
email 누락 오류를 확인했다. Graph에서 실제 앱 `pydemia Projects`의
`signInAudience=AzureADMyOrg`를 조회했다. 토큰·client secret·원문 환경변수는
출력하거나 보관하지 않았다. 앱 등록의 읽기 성공을 변경 권한의 증거로 쓰지 않는다.

| 경계 | 실행 증거·판정 |
|---|---|
| 원래 증상 | 실제 고정 프록시 v7.15.2 + 합성 RSA 서명 토큰에서 기존 email 사용자 claim의 HTTP 500 재현 |
| 수정 프록시 | single/multi 구성에서 email 없는 토큰 및 email 있는 토큰 콜백 성공, 두 허용 tenant 헤더 구분, 외부 헤더 덮어쓰기, ID/access token 미전달 |
| 토큰 거부 | single/multi 각각 잘못된 nonce·audience·미허용 tenant 거부. PKCE S256과 계정 선택 prompt 확인. 총 12 checkpoint |
| 앱/DB | 새로운 `test_entra_tenancy.py` 12개: 같은 subject/email의 다른 tenant 분리, 다른 프로젝트·작업·ZIP·이름 변경 거부, 이름 변경 시 동일 계정, 원래 조직만 legacy 연결, 동시 첫 로그인, 잘못된 정책과 issuer/tenant/domain 거부 |
| 기존 회귀 | 전체 PostgreSQL pytest 273개, 웹 215개, 실제 Edge 재로그인 11 checkpoint 통과 |
| 독립 검토 | 첫 로그인/legacy 연결/정책/공유 경계 검토. direct Caddy의 두 realm 헤더 제거 누락을 보완; 확인된 우회로 판정하지 않음 |
| 운영 | schema 0010, app/DB healthy, proxy/edge running, 실제 프록시 config-test 통과, 기존 계정/업무 fingerprint 동일, 공개 Microsoft 시작 302·S256·nonce·계정 선택, 위조 비로그인 요청 401 |
| 팀 공유 역할 | Workspace/멤버십/초대/역할/API/UI/이관/ZIP·worker 위험 설계 완료. 멤버 관리·공유 권한은 미구현이며 기존 owner 격리 유지 |

```powershell
docker compose up -d db
uv run projects migrate
uv run pytest                                      # 273 passed
uv run ruff check src tests migrations              # passed
uv run ruff format --check src tests migrations     # 64 files
uv run mypy src/projects                           # 30 source files
npm --prefix web run check                         # 29 files / 215 tests
npm --prefix web run build                         # build + favicon
uv run --with cryptography python scripts/verify-entra-proxy.py # 12 checkpoints
uv run python scripts/verify-mobile-browser.py verify-reauth-browser.cjs # 11 checkpoints
```

처음 전체 검사 실행 중 공개 프록시 생성물을 수정해, 이미 import된 이전 renderer와
생성물 비교 한 건이 실패했다. 생성/수정이 끝난 revision에서 전체를 다시 실행해
273개 모두 통과했다. 기존 assertion을 없애거나 retry/timeout을 늘리지 않았다.
기존 Starlette TestClient deprecation과 웹 500kB 번들 경고는 남는다.

프록시 테스트는 실제 고정 이미지와 실제 서명 검증/콜백/쿠키를 쓰지만 IdP·토큰은
합성이다. 재로그인 브라우저는 실제 PostgreSQL·로컬 비밀번호 로그인이며 Microsoft
경계·403/network 주입은 합성이다. 실제 Microsoft 두 계정의 승인 이후 앱 조작,
물리 기기·Hub·LLM·Note 실연동은 이번 검사의 범위가 아니다. 실제 다른 계정의
운영 로그인 재확인은 남는다. 운영 조사·배포 중 사용자 데이터는 만들지 않았다.

215개 allowlist·source/image/hash·private 백업·운영 자산/favicons와 복구 조건은
[배포 기록](deployment.md)의 최신 절을 따른다. cryptography는 검증 명령의
임시 환경만 사용하며 앱 runtime 의존성·lockfile은 바꾸지 않았다.

## 2026-11-03 데스크톱 작업 제목의 이른 줄바꿈

APP-REQ-058 / AC-126~128을 구현하고 운영 `b8efb8b43cd14806`에 반영했다.
실제 Edge·격리 PostgreSQL에서 수정 전 제목 열 547.625px / 버튼 283.922px·
2줄을 재현했다. 외곽 TaskTitleEdit의 100% 너비와 desktop 열 최소 폭을 적용한
동일 검사는 제목/버튼 547.625px·1줄로 통과했다. 한글 어절을 우선하되 긴 단일
문자열은 필요한 위치에서 분리한다. 변경은 CSS 두 파일이다.

| 조건 | 실제 관찰 |
|---|---|
| AC-126 | 1440px 기본 2개 필드는 제목 547.625px, 1024px 2개/8개 필드와 1440px 8개 필드는 406px, 1280px 간단은 441.219px, 1920px 상세는 830px였다. 모두 열 너비를 채우고 같은 예시 제목은 한 줄이었다. |
| AC-127 | 속성이 많으면 목록 내부를 가로 스크롤해 마지막 작업 메뉴까지 접근한다. 전역 제목 input 너비와 실제 저장, 보드 전체 제목 폭·Esc 취소·native 제목 drag의 상태 변경, 상세 heading 폭을 확인했다. |
| AC-128 | 210자 공백 없는 제목과 320/390/430px에서 문서 가로 넘침이 1px 이하였다. 아래 웹/빌드·제목 브라우저 5개·기존 편집 브라우저 13개 checkpoint가 통과했다. |

```text
npm --prefix web run check                         # 29 files, 215 passed
npm --prefix web run build                         # passed; favicon verified
uv run python scripts/verify-mobile-browser.py verify-task-title-browser.cjs # 5 checkpoints
uv run python scripts/verify-mobile-browser.py verify-inline-browser.cjs     # 13 checkpoints
git diff --check                                  # passed
```

backend·migration·의존성·인증·시간대 코드가 직전 0796… manifest와 동일하므로
그 revision의 PostgreSQL 261개·Ruff/mypy 결과를 재사용한다. 실제 앱 브라우저는
무작위 schema·임의 포트를 사용하고 종료 시 정리했다. CSS 수치만 미러링하는
단위 검사는 추가하지 않았다. image build/favicon과 운영 자산/업무 fingerprint는
[배포 기록](deployment.md)에 있다. 기존 500kB 번들 경고는 남는다.

[속성 8개 목록](screenshots/task-title/after-desktop.png),
[상세](screenshots/task-title/detail-desktop.png),
[모바일·긴 제목](screenshots/task-title/mobile-list.png)을 확인했다.
인증 후 운영 UI·물리 기기·스크린리더·Hub/LLM/Note 실연동은 이번 검사 범위가 아니다.

## 2026-11-03 사용자 시간대·날짜/시간 UI 간격

APP-REQ-057 / AC-121~125를 구현하고 운영 `0796e0207e9cf01c`에 반영했다.
[기획 18의 최신 계약](../planning/18-inline-editing-and-preferences.md)을 따른다.

| 조건 | 관찰과 판정 |
|---|---|
| AC-121 | 같은 UTC/Z·offset·zone-less 예시가 같은 UTC epoch으로 정규화되고 서울/UTC/LA에서 올바른 날짜·시각으로 보인다. 실제 속성 UI는 T/숫자 offset을 포함하지 않는다. datetime 속성만 canonical UTC를 유지한다. |
| AC-122 | 날짜/시간은 별도 span이며 그 사이 텍스트 노드가 없다. 실제 Edge에서 flex gap과 두 영역의 기하학적 간격을 확인했다. flex 부모 아래 blockification도 정상 layout으로 검사했다. 기준선 native option은 날짜만, 선택 시각은 별도 UI로 보여주며 중첩 time을 제거했다. |
| AC-123 | LA/en-US 기기에서도 명시 서울 설정을 저장·새로고침하면 서울 시각을 보인다. UTC 선택은 이미 열린 다른 탭에도 반영됐다. 기존 v1의 날짜/시간 형식과 zone 없는 경우 system 기본값은 컴포넌트/스키마 검사로 보존했다. |
| AC-124 | 실제 API의 UTC timestamp·ISO 날짜·revision을 재조회했다. 날짜 전용 마감일은 timezone 변경에도 같고 설정 변경은 revision을 만들지 않는다. NY DST 시작/종료, 인도 반시간, 날짜 경계, 잘못된 시간대/시각과 중복 변환 방지는 단위 검사다. 320/390/430px light/dark에서 UI와 gap을 확인했다. |
| AC-125 | 최종 아래 검사·Linux image build/favicon과 운영 health/자산 bytes·UTC DB 세션·업무 fingerprint 보존을 확인했다. 실제 Microsoft 인증 완료·인증 후 운영 UI·물리 기기는 미검증이다. |

```text
docker compose up -d db
uv run projects migrate
uv run pytest                                      # 261 passed
uv run ruff check src tests migrations             # passed
uv run ruff format --check src tests migrations    # 61 files passed
uv run mypy src/projects                          # 29 files passed
npm --prefix web run check                        # 29 files, 215 passed
npm --prefix web run build                        # passed; favicon verified
uv run python scripts/verify-mobile-browser.py verify-datetime-browser.cjs # 8 checkpoints
uv run python scripts/verify-mobile-browser.py verify-reauth-browser.cjs   # 11 checkpoints
```

재인증 브라우저 회귀 중 새 로그인 성공 직후 독립 GET이 간헐적으로 401이었다.
ASGI response.start 순간 별도 PostgreSQL 연결에서 새 세션이 보이는지 검사해
수정 전 False/실패를 재현했다. 기본 request-scope DB dependency의 commit은
응답 뒤에 실행됐다. function scope로 바꿔 같은 검사와 기존 인증/CSRF·전체
회귀가 통과했다. 정책/쿠키/권한을 완화하거나 브라우저 retry를 추가하지 않았다.
DB를 읽는 streaming 응답은 없어 응답 전 dependency 종료가 현재 API와 맞는다.

서버의 기존 UTC-aware datetime/timestamptz는 유지하며 새 UI는 UTC 시각을 IANA
시간대로 렌더링한다. 날짜 전용 값·업무 날짜/오늘 필터·API/ZIP 원문·Hub/Note
책임은 바꾸지 않았다. 기존 Starlette/httpx 경고와 500kB 번들 경고는 남는다.
실제 앱/격리 PostgreSQL·컴포넌트 검사·합성 provider·운영 HTTP를 구별한다.

화면: [날짜/시간의 UI 간격](screenshots/datetime/date-time-gap-desktop.png),
[시간대 설정](screenshots/datetime/settings-desktop.png),
[모바일 dark](screenshots/datetime/settings-mobile-dark.png).

## 2026-11-03 날짜·시간 표시 형식

APP-REQ-056 / AC-116~120을 구현하고 운영 `0996c4144d63a840`에 반영했다.
[기획 18의 추가 계약](../planning/18-inline-editing-and-preferences.md)을 따른다.

| 조건 | 실행 증거와 판정 |
|---|---|
| AC-116 | 실제 설정에서 날짜/시간 preset·직접 입력, 예시, 적용/기본값을 확인했다. 미적용 선택은 다른 표시를 바꾸지 않는다. 필수 token 누락/중복·24시간과 오전오후 혼합 등은 단위/컴포넌트 검사와 실제 invalid 입력에서 적용이 차단됐다. |
| AC-117 | 실제 적용→새로고침/메뉴 재방문과 이미 열린 다른 탭의 storage event 반영을 확인했다. 손상된 저장소 fallback·저장 실패의 메모리 적용/안내·명시 재시도는 컴포넌트 검사다. 서버 계정/기기 동기화는 구현 범위가 아니다. |
| AC-118 | 실제 API/DB의 기본 날짜·사용자 날짜를 목록/보드/상세·달력 기간 밖 항목에서 확인했다. `05/12/2026`을 선택해도 native 입력 값과 실제 저장 값은 `2026-12-05`다. 표시 설정 변경만으로 revision이 늘지 않았다. 프로젝트/편집/revision/실행/테스트/Git/소속 이력은 공통 DateTimeValue를 사용한다. |
| AC-119 | 실제 Edge Asia/Seoul·America/Los_Angeles/en-US에서 날짜 전용 값이 전날로 바뀌지 않고 timestamp만 기기 시간대를 쓰는 것을 확인했다. 320/390/430px·light/dark의 가로 넘침은 1px 이하였다. 자정/정오·윤년·1년/2000년·12/24시간·초는 단위 검사다. |
| AC-120 | 아래 필수 검사·실제 재인증 회귀 11 checkpoint·Linux image build/favicon이 통과했다. 운영 자산 bytes/Content-Type·인증·업무 fingerprint 보존은 [배포 기록](deployment.md)에 있다. |

```text
docker compose up -d db
uv run projects migrate
uv run pytest                                      # 260 passed
uv run ruff check src tests migrations             # passed
uv run ruff format --check src tests migrations    # 61 files passed
uv run mypy src/projects                          # 29 files passed
npm --prefix web run check                        # 29 files, 211 passed
npm --prefix web run build                        # passed; favicon verified
uv run python scripts/verify-mobile-browser.py verify-datetime-browser.cjs # 6 checkpoints
uv run python scripts/verify-mobile-browser.py verify-reauth-browser.cjs   # 11 checkpoints
```

실제 Edge·React/API·무작위 전용 PostgreSQL schema를 썼고 종료 시 정리했다.
기존 설정 검사는 새 preview의 dd와 계정 dd를 구별하도록 계정 영역으로 한정했다.
새 브라우저 검사는 6주 달력 범위를 벗어나도록 월을 옮긴 뒤 기간 밖 날짜를
검사하고, 동시에 보이는 목록/상세는 각각의 영역에서 같은 표시를 확인한다.
timeout/재시도 증가나 단언 제거 없이 최종 검사가 통과했다. 기존 Starlette/httpx
경고와 500kB 번들 경고는 남는다.

기능 검증본 `9694861dedf78888` 이후 models.ts의 EOF 빈 줄만 정리해
`git diff --check`를 통과시켰다. 최종 `0996c4144d63a840`은 image의 TypeScript/
build/favicon을 다시 검사했고 실제 배포 JS/CSS/favicon bytes가 기능 검증본과
동일하다. 동작 검사는 이 동일 산출물의 앞선 결과를 재사용한다. 두 전환 모두
업무 fingerprint가 같았고 최종 source manifest와 현재 checkout을 일치시켰다.

화면: [데스크톱](screenshots/datetime/settings-desktop.png),
[모바일 light](screenshots/datetime/settings-mobile-light.png),
[dark](screenshots/datetime/settings-mobile-dark.png).
native 날짜 입력기의 표시 형식은 OS/브라우저에 맡긴다. 월/요일 탐색 레이블은
한국어를 유지한다. 실제 Microsoft 인증 완료·인증 후 운영 UI·물리 기기·
스크린리더·Hub/LLM/Note 호출은 이번 검사 범위가 아니다.

## 2026-11-03 로그인 만료 후 재인증·원래 화면 복귀

[기획 19](../planning/19-session-expiry-and-return.md)의 APP-REQ-055 /
AC-110~115를 구현하고 운영 `0ad513fbaadbd676`에 반영했다.

| 조건 | 실행 증거와 판정 |
|---|---|
| AC-110 | 실제 비밀번호 세션을 logout API로 무효화한 뒤 편집 PUT 401을 발생시켰다. 로그인 화면의 returnTo와 로그인 후 프로젝트/작업/표시/검색/임의 query/hash가 원문과 같았다. Microsoft 모드 이동은 실제 로컬 세션에 합성 provider 경계를 연결해 검사했다. |
| AC-111 | 제목/본문/맥락·빠른 입력과 속성 팝오버를 복원했다. 재인증 후 PUT 자동 재전송이 없고, 다른 요청으로 revision을 올리면 복구 초안의 원래 revision이 실제 409를 냈다. 생성/프로젝트명/상태·유형/보기/목록·상세 키와 계정 변경 remount는 컴포넌트 검사다. |
| AC-112 | 실제 브라우저 storage quota 실패에서 이동이 멈추고 속성 입력이 남았다. 복구·명시 재시도 후 같은 입력창이 돌아왔다. timeout/예외/false 및 이동·Note 참조·관계·테스트의 미저장 입력 차단, 기존 Dialog 안의 retry 접근성도 검사했다. 빈 snapshot은 저장소가 막혀도 이동을 막지 않는다. |
| AC-113 | 잘못된 비밀번호의 실제 401은 로그인 화면에 머문다. 합성 403/network는 이동하지 않는다. 실제 만료 세션의 동시 401은 provider 시작 1회다. 합성 persistent 401은 성공 session bootstrap 뒤에도 60초 반복 방지가 유지되고 명시 재시도만 새 이동을 허용했다. |
| AC-114 | 외부/다중 인코딩/재귀 경로 거부와 다른 사용자 초안 격리를 검사했다. 실제 ZIP 401도 원래 프로젝트 목록 URL로 복귀했다. URL이 포함된 검색과 `//` hash는 합성 provider의 encoded wrapper를 거쳐 byte-exact 복귀했다. 운영 HTTP에서도 direct/wrapper rd 보존·Microsoft 계정 선택을 확인했다. |
| AC-115 | 아래 전체 검사와 기존 직접 편집 13 checkpoint가 최종 source에서 통과했다. Linux image build·운영 health/자산 bytes·백업·업무 데이터 fingerprint 일치는 [배포 기록](deployment.md)에 있다. |

```text
docker compose up -d db
uv run projects migrate
uv run pytest                                      # 260 passed
uv run ruff check src tests migrations             # passed
uv run ruff format --check src tests migrations    # 61 files passed
uv run mypy src/projects                          # 29 source files passed
npm --prefix web run check                        # 27 files, 197 passed
npm --prefix web run build                        # passed; favicon verified
uv run python scripts/verify-mobile-browser.py verify-reauth-browser.cjs  # 11 checkpoints
uv run python scripts/verify-mobile-browser.py verify-inline-browser.cjs  # 13 checkpoints
```

브라우저는 실제 Edge·React/API·무작위 전용 PostgreSQL schema를 썼고 종료 시
schema/서버를 정리했다. 합성 provider는 실제 Microsoft 인증을 수행하지 않는다.
테스트의 credential limiter는 완화하지 않았다. 반복 로그인한 QA harness의 429는
새 context에 기존 실제 세션을 복사해 불필요한 인증을 줄여 해결했다.

독립 검토에서 생성 폼 누락, 프록시가 검색/hash의 raw `//`를 거부하는 조건,
사이드바/목록 중복 복구 키와 모바일 선택창 재마운트 누락을 찾아 보완했다.
기존 Markdown 검사 한 건은 전체 병렬 실행에서 lazy renderer 변환 중 1초
query 대기가 끝났다. 실제 모듈을 먼저 import한 뒤 같은 콘텐츠/안전성/클릭
단언을 수행하도록 고쳤다. timeout/retry/단언을 늘리거나 제거하지 않았다.
최종 197개는 모두 통과했다. 기존 Starlette/httpx 경고·500kB 번들 경고는 남는다.

합성 화면: [재로그인](screenshots/reauth/password-expired-login.png),
[390px 초안 복원](screenshots/reauth/password-recovered-mobile.png),
[저장소 실패](screenshots/reauth/storage-blocked.png),
[반복 이동 차단](screenshots/reauth/provider-loop-blocked.png).
실제 Microsoft 계정의 로그인 완료·인증 후 운영 UI·물리 기기·OS 키보드·
스크린리더·Hub/LLM/Note 호출은 미검증이다. 공개 인증 경계와 실제 앱/DB 및
컴포넌트 mock 증거를 서로 대신하지 않는다.

## 2026-11-03 직접 편집·설정 화면·프로젝트 메뉴

[기획 18](../planning/18-inline-editing-and-preferences.md)의 APP-REQ-050~054 /
AC-97~109를 구현하고 운영에 반영했다. 제목/본문·작업 값 자체에서 편집하고,
테마는 설정 화면에, ZIP은 프로젝트 메뉴에 둔다. 범위별 실제 증거는 다음과 같다.

| 조건 | 관찰과 판정 |
|---|---|
| AC-97 | 실제 앱의 개요 제목과 프로젝트 메뉴에서 이름을 바꿔 API version 증가·새로고침·GNB/사이드바·전체 작업 소속명을 확인했다. PostgreSQL에서 owner/CSRF/stale version·이름 이외 필드 보존을 검사했다. |
| AC-98~100 | 목록/보드/상세 제목을 선택해 Enter 저장·Esc 취소, Markdown 본문 클릭→Ctrl+Enter 저장, 상태·취소 이유·날짜·숫자 0·기본/사용자 체크 false를 실제 API/DB로 재조회했다. 개인 작업 목록의 진행 상태도 별도 값 편집으로 바꾼다. |
| AC-101 | 개인→구현은 테스트 필수를 켜고, 유형 변경의 ID/본문/관계/이력을 보존한다. 완료 gate·의존·테스트 근거가 없는 완료/유형 전환은 실제 API 409이며 상태가 바뀌지 않았다. 일반 PUT의 유형 변경은 여전히 거부한다. |
| AC-102 | 실제 동시 요청으로 제목/본문 409를 발생시켰다. 내 입력 보존→최신 revision 명시 병합→별도 저장 후 다른 최신 속성이 보존됨을 확인했다. 본문 초안의 새로고침·다른 메뉴 방문 후 본문 탭 복원을 확인했다. deferred 속성 응답이 활성 제목 초안을 지우거나 새 revision으로 오래된 속성을 저장하던 결함을 발견해 live editor ref로 차단했고 회귀 테스트가 통과했다. |
| AC-103 | IME Enter/Esc/229·연속 저장·pending 취소·링크 클릭·본문 텍스트 선택은 컴포넌트 검사로 확인했다. 실제 Edge에서 카드 제목 클릭 편집과 native 제목 drag를 구별하고 기존 설명/handle drag·순서 저장·조작 버튼 제외·모바일 상세 닫기 후 제목 포커스 복귀를 회귀 검사했다. 본문 편집 중 관계 탭 shortcut이 편집기를 숨기던 결함도 수정했다. |
| AC-104~106 | 기획 18의 실제 source/공식 문서와 Hub skills revision/hash를 기록했다. 아래 전체 검사·host/image build와 favicon이 통과했고, 운영 source/image/백업·업무 fingerprint·인증 경로는 [배포 기록](deployment.md)에 있다. SQLite·새 migration·Hub/Note 책임 변경은 없다. |
| AC-107~109 | 실제 테마 glass→material·dark 저장/재방문을 확인했다. 설정의 빈 project URL은 임의 선택으로 바꾸지 않는다. 긴 이름의 320/390/430/768/1024px GNB·설정, 모바일 light/dark 상세의 가로 넘침이 1px 이하였다. Card 내부 좌우 실측 17px(16px padding+border), 검색 입력 좌우 14px다. GNB에는 테마 선택창/ZIP이 없고 프로젝트 ZIP은 실제 CRC/manifest가 유효한 파일로 내려받았다. |

```text
docker compose up -d db
uv run projects migrate
uv run pytest                                      # 253 passed
uv run ruff check src tests migrations             # passed
uv run ruff format --check src tests migrations    # 60 files passed
uv run mypy src/projects                          # 29 source files passed
npm --prefix web run check                        # 21 files, 142 passed
npm --prefix web run build                        # passed
uv run python scripts/verify-mobile-browser.py verify-inline-browser.cjs
uv run python scripts/verify-mobile-browser.py verify-task-discovery-browser.cjs
```

브라우저는 실제 Edge·React/API·무작위 전용 PostgreSQL schema를 사용했고
종료 시 해당 schema와 임의 포트 서버를 정리한다. 개별 컴포넌트 mock 검사,
실제 앱/DB, 공개 문서 조사, 운영 HTTP 검사를 서로 구별한다. 주 에이전트가
통합했고 독립 컨트롤/속성·API leaf와 별도 RecordEditor 통합 검사에서 찾은
실패를 반영했다. 수정 전 간격은 1px였고 late CSS의 0px 좌우 padding이
원인이었다. 모바일 breadcrumb가 늦은 CSS 때문에 중복 노출되던 문제도
실제 화면에서 확인해 desktop 범위로 한정하고 hidden/visible 단언을 추가했다.

검사 과정에서는 새 제목 동작의 link→button 계약, 달력의 기존 link 계약과
사용하지 않는 import를 수정했다. Markdown의 eager import로 생긴 번들 증가를
기존 lazy renderer 재사용으로 해소했다. 새 검사는 렌더 완료를 기다리도록
수정했고, 기존 보안 검사의 lazy 모듈 변환이 1초 query 대기와 경쟁하던 문제는
실제 renderer를 먼저 import한 뒤 같은 모든 보안 단언을 수행하도록 했다.
timeout·retry·assertion을 늘리거나 제거하지 않았다. 최종 전체 검사는 통과했고
기존 Starlette/httpx 경고 1건과 500kB bundle 경고만 남는다.

합성 QA 화면:
[데스크톱 직접 편집](screenshots/inline-editing/detail-desktop.png),
[모바일 light](screenshots/inline-editing/detail-mobile-light.png),
[dark](screenshots/inline-editing/detail-mobile-dark.png),
[모바일 저장 후](screenshots/inline-editing/detail-mobile-edited.png),
[환경설정](screenshots/inline-editing/preferences-mobile.png),
[768px GNB](screenshots/inline-editing/header-768.png).
모바일 프로젝트 선택창의 항목 메뉴도 추가 검사했다. 최초에는 Dialog 밖의
공통 theme portal로 메뉴가 열려 focus trap이 메뉴를 닫았고, 새 검사는 메뉴 항목
대기에서 실패했다. ProjectActions의 메뉴 open을 제어하고 trigger가 속한
Dialog 내부를 menu/rename portal 컨테이너로 선택했다. 같은 검사가 통과했으며
이름 입력 포커스·저장 버튼/패널의 화면 경계·Enter 저장·선택 프로젝트 유지를
확인했다. 최종 inline 브라우저는 **13개 checkpoint**를 통과했다. 이 보완 뒤
웹 142개와 build/favicon도 재실행 통과했다. backend는 동일하므로 앞의 253개
결과를 재사용한다. [모바일 항목 이름 수정](screenshots/inline-editing/project-picker-rename.png).

실제 Hub/LLM/Note 호출·물리 기기/OS 키보드·스크린리더·인증 후 운영 UI
조작은 이번 증거에 포함하지 않는다.

## 2026-11-02 개요의 범위 문구·미사용 테스트 지표

사용자 모바일 사진에서 `현재 프로젝트 전체`와 프로필/건수가 붙어 보이고,
테스트를 사용하지 않는 일감 프로젝트에도 `테스트 통과 · 미정의`가 나타났다.
기존 `.scope-note > span`은 CardContent 편입 이후 실제 span의 부모와 달라
데스크톱 간격·모바일 줄바꿈이 모두 적용되지 않았다. metadata 전용 class로
대상을 연결해 데스크톱 14px 간격·모바일 별도 줄과 7px 간격을 복구했다.

개발 여부를 간편/표준 프로필에서 추정하지 않는다. 서버 집계의 등록된 테스트
케이스가 0개면 테스트 지표를 숨기고 요약·진행할 작업 없음 문구도 일반 업무용으로
표시한다. 테스트 케이스가 있으면 기존 통과율과 미실행 제외 기준을 유지한다.
데스크톱 지표는 표시된 카드 수에 맞춰 열을 채운다. 데이터/API/gate 변경은 없다.

`uv run python scripts/verify-mobile-browser.py verify-overview-browser.cjs`는
수정 전 간편/표준의 불필요한 지표·안내문, 모바일 320/390/430px 양 테마의
줄 간격과 데스크톱 간격에서 실패했다. 같은 검사를 수정 후 통과했다. 실제
React/API와 무작위 전용 PostgreSQL schema를 썼으며 간편·표준 양쪽에
테스트 케이스를 등록하면 `0 / 1 · 0%`가 표시되는 것도 확인했다. 사용하지
않는 지표를 숨기는 것이 미실행을 통과로 바꾸지 않는지 검사한다.

웹 전체 첫 실행에서 기존 Markdown lazy import 검사가 준비 화면에서 1회
실패했다. 단독 검사 명령을 저장소 루트에서 잘못 실행한 환경 오류도 있었으며,
정확한 web 디렉터리의 단독 검사 2개와 원래 전체 명령 재실행 113개가 통과했다.
검사 timeout·assertion·앱 Markdown 구현은 변경하지 않았다.
`npm --prefix web run build`와 Linux amd64 이미지 build/favicon도 통과했다.
기존 500kB bundle 경고는 남는다. 직전 운영 manifest와 대조한 변경은 웹 3개
파일뿐이며 backend·migration·의존성이 같아 기존 backend 236개 증거를
재사용한다. 이번 새 backend 전체 실행으로 기록하지 않는다.

실제 로컬 앱 합성 QA 화면:
[모바일 dark](screenshots/overview/personal-mobile-dark.png),
[모바일 light](screenshots/overview/personal-mobile-light.png),
[데스크톱](screenshots/overview/personal-desktop.png),
[테스트가 있는 프로젝트](screenshots/overview/registered-tests-desktop.png).
물리 기기·인증 후 운영 UI 조작은 별도이며 운영 자산/health·데이터 보존은
[배포 기록](deployment.md)을 따른다.

## 2026-11-02 간단한 입력·작업 필드·이름 있는 보기

[사용자 결정·ClickUp 비교 기획](../planning/17-clickup-task-management.md)의
AC-85~94를 실제 앱에 적용하고 운영에 배포했다. 제목 한 줄로 먼저 생성하고,
속성은 목록에서 저장/취소로 편집한다. 표시 열과 카드 속성의 추가·숨기기·
순서, 다섯 타입 사용자 필드와 이름 있는 보기 관리가 같은 작업공간에 있다.
완료 gate·프로젝트 선택·모바일 직접 보기 선택·가로 칸반은 유지한다.

| 조건 | 실행 증거와 판정 |
|---|---|
| AC-85~86 | 실제 Edge+격리 PostgreSQL에서 제목만 입력해 Enter로 생성하고 동일 ID를 조회했다. 마감일과 사용자 값을 행에서 저장하고 새로고침했다. 동시 API 수정으로 409를 발생시켜 초안 보존→명시적 최신 작업 불러오기→별도 저장을 확인했다. 취소·서버 실패·0/false/지우기는 컴포넌트/API 검사로 보완했다. |
| AC-87~88 | 다섯 타입의 엄격한 값·계정 격리·알 수 없는 정의 거부를 PostgreSQL에서 검사했다. 실제 UI에서 선택 필드를 생성·저장하고 열 숨김 뒤 값 유지·열 순서·저장 보기 복원·카드 속성을 확인했다. 체크 표시의 배경/아이콘 대비와 선택창의 화면 경계를 검사했다. |
| AC-89~90 | 이름 있는 보기 생성→새로고침→이름 변경→개인 기본→복제→현재 설정 명시 갱신→삭제 취소/확인을 실제 앱에서 확인했다. 메타데이터 변경은 저장된 설정을 유지하고 복제는 미저장 화면을 섞지 않는다. 기존 전역/프로젝트 네 보기·두 밀도·URL/초안·프로젝트 유지 회귀도 통과했다. |
| AC-91 | 모든 쓰기 경로의 필드 검증, 프로젝트 이동 후 값 유지, 독립 계정 ZIP 복원과 과거 revision/hash, legacy ZIP의 `custom_fields` 부재 원형 보존, 충돌/누락 정의의 원자적 실패를 PostgreSQL에서 검사했다. |
| AC-92 | 실제 Edge 모바일 에뮬레이션에서 값 편집과 320·360·390·430px의 페이지 가로 넘침을 검사했다. 기존 CDP 터치 스와이프·열 선택/복원·메뉴 이동/undo 회귀는 별도 discovery 브라우저에서 통과했다. 물리 기기·OS 키보드와 스크린리더는 미검증이다. |
| AC-93~94 | 아래 전체 검사와 실제 앱 브라우저 두 시나리오가 통과했다. 비공개 백업, 앱 중지 중 migration 전후 기존 업무 테이블 건수/hash 일치, 새 이미지/HTTP 자산 bytes·인증 경로·QA 샘플 보존은 [운영 배포 기록](deployment.md)을 따른다. |

검사 명령과 결과:

```text
docker compose up -d db
uv run projects migrate
uv run pytest                                      # 236 passed
uv run ruff check src tests migrations             # passed
uv run ruff format --check src tests migrations    # 59 files passed
uv run mypy src/projects                          # 29 files passed
npm --prefix web run check                        # 17 files, 113 passed
npm --prefix web run build                        # passed
uv run python scripts/verify-mobile-browser.py verify-task-discovery-browser.cjs
uv run python scripts/verify-mobile-browser.py verify-task-management-browser.cjs
```

브라우저 launcher는 무작위 PostgreSQL schema와 임의 로컬 포트만 사용하고
종료 시 해당 schema·서버를 정리한다. 필드/보기 검사는 실제 API/DB이며 mock
검사와 구별한다. 최종 CSS만 바뀐 뒤에는 웹 전체·build/favicon·management
브라우저를 다시 통과했다. backend와 discovery의 검사 이후 해당 로직은
변하지 않았다. 기존 Starlette/httpx deprecation 1건과 500kB bundle 경고는 남는다.

공식 ClickUp 문서 조사와 skills.pydemia.ai 원문 적용 기록은 기획 17에 있다.
이번 실행의 새 ClickUp 인증 UI·외부 Hub/LLM·실제 Note 본문 호출은 없다.
운영 app/DB·정적 자산·공개 인증 경로를 검사했으나 제어 도구의
`failed to write kernel assets` 오류로 인증 후 운영 UI 조작은 재검증하지 못했다.

실제 로컬 앱의 합성 QA 화면:
[데스크톱 열·저장 보기](screenshots/task-management/desktop-fields-views.png),
[필드 선택·순서](screenshots/task-management/field-chooser.png),
[모바일 목록·속성](screenshots/task-management/mobile-fields-views.png).

## 2026-11-02 목록 완료 체크·상태 선택 구분

사용자가 목록의 큰 흰 박스를 체크박스로 식별하지 못한 문제를 수정했다.
개인 작업은 20px의 체크와 구분되는 테두리·완료 배경을 표시하고, 주변
44px label 터치 영역을 유지한다. 일괄 선택도 같은 작은 체크를 사용한다.
구현 작업은 화살표 대신 현재 상태 드롭다운으로 변경한다. 기존 revision
검사·완료 gate를 사용하며 취소는 사유를 받은 뒤에만 저장한다. 충돌 시
원래 상태와 입력한 사유를 보존한다. 공통 registry 원본은 수정하지 않았다.

최초 신규 4개 회귀가 수정 전 실패했고, 선택 기억 회귀 1개를 더해 전체 웹
**15개 파일·86개 테스트**가 통과했다. 첫 전체 검사에서 기존 Markdown lazy
import 검사가 준비 상태에서 한 번 실패했으며, 해당 단독 검사와 동일 전체
명령의 재실행이 통과했다. timeout·검사 조건은 변경하지 않았다.

실제 Edge+격리 PostgreSQL에서 20px 체크·44px hit area의 모서리 클릭/터치로
완료 저장, 완료 배경과 체크 아이콘의 구별, 상태 드롭다운의 화살표 위치,
상태 저장→새로고침, 구현 완료 gate, 취소 열기/돌아가기의 무변경과 사유
입력 후 취소 저장·본문 보존을 확인했다. 이전 상세 보기의 일괄 선택 기억이
간단 모드의 완료 체크를 숨기던 조합도 발견해 모드 조건을 바로잡았다.
기존 드래그·이동/undo·가로 칸반 터치 재현·보기 전환 회귀도 통과했다.

`npm --prefix web run check`와
`uv run python scripts/verify-mobile-browser.py verify-task-discovery-browser.cjs`를
사용했다. 이미지 build/favicon과 운영 확인은 [배포 기록](deployment.md)에
연결한다. 실제 운영 로그인 후 조작·물리 기기는 이번 검사와 구별한다.
[모바일 목록 컨트롤](screenshots/task-discovery/mobile-list-controls.png).

## 2026-11-02 모바일 직접 보기 선택·가로 칸반

목록 기본값을 유지하고 모바일 헤더에 목록/보드/캘린더/집계와 간단/상세
선택기를 노출했다. 상태 열 드롭다운·한 열만 표시하는 CSS를 가로 칸반과
상태 이름/건수 탐색으로 바꿨다. 현재 열 표시와 세션 기억은 스크롤에 맞추고
이동·undo 후에는 해당 열로 이동한다. 화면 전체에는 가로 넘침이 없다.

수정 전 직접 선택기 회귀가 실패했고 수정 후 전체 웹 **14개 파일·81개**가
통과했다. 실제 Edge+격리 PostgreSQL에서 두 밀도의 네 보기 선택과 기존
프로젝트 유지·초안·native drag/순서 저장·이동/undo 회귀를 확인했다.
추가 모바일 context(`isMobile`, `hasTouch`)의 CDP 터치 입력으로 카드 제목
영역에서 가로 스와이프했다. 열의 scrollLeft가 변하고 작업 revision·상태와
선택 항목은 그대로임을 확인했다. 상태 버튼→최근 열 새로고침 복원,
카드 메뉴 상태 이동→API 재조회→undo, 전역 보드의 다섯 열과 320~430px
화면 넘침·44px 선택 버튼도 검사했다. 물리 기기의 터치 검증과 구별한다.

브라우저 회귀 중 라디오 포커스를 키보드 입력으로 취급해 하단 탐색을 숨기는
기존 CSS를 발견했다. radio/checkbox를 입력 키보드 감지에서 제외하고 보기
선택 후 하단 탐색이 계속 보이는지 재검증했다. 검사 명령은 웹 check와
`uv run python scripts/verify-mobile-browser.py verify-task-discovery-browser.cjs`다.
현재 소스 이미지의 build·favicon 검사는 배포 기록에 연결한다.

화면: [모바일 목록·직접 선택](screenshots/task-discovery/mobile-list.png),
[가로 칸반](screenshots/task-discovery/mobile-board-scroll.png).

## 2026-11-02 카드 본문 드래그

핸들에만 연결된 native drag를 카드 전체로 확장했다. 카드의 제목·설명·여백과
기존 핸들에서 시작할 수 있다. 버튼·링크·체크박스·입력·contenteditable 등은
드래그에서 제외한다. 브라우저가 `dragstart`의 target을 상위 카드로 지정하는
경우에도 최초 포인터 위치를 검사해 조작 영역이 카드 이동으로 바뀌지 않는다.
기존 이동 API·완료 gate·자동 정렬 제한·undo는 그대로 사용한다.

수정 전 신규 회귀 2개가 실패했고 수정 후 기존 자동 스크롤/무효 드롭을 포함해
전체 웹 **14개 파일·81개 테스트**가 통과했다. 실제 Edge+격리 PostgreSQL에서
제목으로 다른 열 이동→API 재조회→undo, 설명으로 열 안 순서 변경→새로고침,
기존 핸들 이동, 체크박스 drag 차단과 선택·상태 메뉴·상세 링크 클릭을 확인했다.
기존 네 보기/모드·프로젝트 유지·이동/undo·모바일 320~430px 회귀도 통과했다.
명령은 `npm --prefix web run check`와
`uv run python scripts/verify-mobile-browser.py verify-task-discovery-browser.cjs`다.

배포 이미지 안의 `npm run build`·favicon 검사도 통과했다. 직전 운영 manifest와
비교해 `pydemia-ui/kanban.tsx`와 해당 테스트만 변경됐으며 backend는 동일하다.
운영 이미지·HTTP 자산 bytes·health와 업무 데이터 보존을 확인했다.
운영 로그인 후 실제 drag, 물리 터치 기기는 직접 검증하지 않았다.
[배포 기록](deployment.md)을 따른다.

## 2026-11-02 보기 전환·프로젝트 선택 유지·모드 선택 재검증

사용자 제보 세 가지를 APP-REQ-037·044의 최신 수용 조건으로 반영했다.
전체 작업의 비목록 탭 비활성화/목록 강제, 모바일 탐색의 `project` 삭제,
프로젝트 선택기의 `taskProject`만 변경하는 경로가 원인이었다. 기존 저장 보기의
`schema_version: 1, task_scope: null` 응답도 프런트 스키마에서 거부되고 있었다.

| 조건 | 수정 전 증거 | 현재 증거 |
|---|---|---|
| 전역·프로젝트의 네 표시 방식, 밀도 독립 | 신규 회귀 9개 실패: 탭·모바일 옵션 제한, 모드 제목, 첫 페이지 제한, 프로젝트 선택 경로 | 전체 웹 **14개 파일·79개 테스트 통과**. 전역 151개 전체 페이지·부분 실패/재시도·409 초기화·요청 취소·선택 상세 분리 포함 |
| 프로젝트 선택 유지 | 신규 App 회귀 3개 모두 실패: 모바일 오늘·목록·재진입에서 ID 유실 | 같은 회귀 통과. URL 우선, 계정별 접근 가능한 마지막 프로젝트 복원, stale/다른 계정 기억 배제 |
| 기존 저장 보기 호환 | 직렬화한 legacy v1 회귀 2개 실패 | 실제 API 응답 모양의 null/v1을 파싱하고 Inbox·보드 복원 통과 |
| 화면과 실제 조작 | 컴포넌트 검사를 실제 렌더링과 구별 | 실제 Edge+격리 PostgreSQL에서 전역 네 보기×간단/상세, 모바일 네 보기, 프로젝트 선택→메뉴/목록/전역 복귀/새로고침/재진입/모바일 탐색 통과. 초안·이동/undo·DB 소속·320~430px 기존 회귀도 통과 |
| 모드 시각 검수 | 제목의 접근성 텍스트는 있으나 Tailwind `clip-path`에 가려짐 | 앱 전용 CSS에서 제목을 표시하고 fieldset 여백 축소. 실제 브라우저 CSS 값·스크린샷 확인. 공통 registry 원본 미변경 |
| 빌드·운영 | 로컬 Vite 결과와 운영 이미지 구별 | 소스 hash `784c6c91d5d3ae05…`의 Linux amd64 이미지 빌드·favicon 검사 통과. 운영 이미지·HTTP 자산 bytes 일치, app/DB healthy, schema 0008, 기존 업무 데이터 fingerprint 동일 |

현재 배포 소스와 직전 `bfccaad354feddcf` manifest를 비교했으며 변경은
웹 소스/검사 9개 파일뿐이다. PostgreSQL·Python·migration의 bytes가 같아
직전 backend 223개·Ruff·mypy 결과를 재사용했다. CSS 최종 변경 후에는
Docker 이미지 안에서 웹 build·favicon 검사를 다시 수행했다. 500kB 이상
번들 경고는 기존과 같으며 build 실패는 아니다.

이미지·archive·backup은 [배포 기록](deployment.md)에, QA 링크는
[샘플 안내](task-workspace-v2-qa.md)에 있다. 운영 로그인 후 화면 조작은
직접 확인하지 못했다. CUA와 Node REPL이 kernel assets 경로 오류로 시작되지
않아 실제 화면 회귀는 별도 Edge headless+격리 DB에서 수행했다. 운영 HTTPS의
인증 진입과 이미지·자산·데이터 검사를 이 결과와 구분한다. 실제 Note 본문,
Hub/LLM 신규 실행과 물리 기기 조작은 이번 검사 범위 밖이다.

화면: [전체 작업 보드·모드 선택](screenshots/task-discovery/global-board.png),
[목록](screenshots/task-discovery/global-desktop.png),
[모바일](screenshots/task-discovery/mobile-list.png).

## 2026-11-02 작업 탐색·보기 전환·프로젝트 이동

APP-REQ-038~044 / AC-73~84의 로컬 결과는
[실행 기준표](task-workspace-v2-goal.md)에 기록했다. 이번 분모는 개인 앱의
전역 조회·보기 복원·프로젝트 이동·Note 참조이며 실서비스 Note 본문 연동과
운영 배포는 구별한다. 동일 가중 12개 조건의 로컬 검증을 완료했다.

| 검증 층위 | 실제 결과 |
|---|---|
| PostgreSQL/API | `uv run projects migrate` 성공. `uv run pytest` 223개 통과. 임의 전용 schema에서 소유자 격리·페이지 일관성·동시 재요청·preview 경합·조건부 undo·완료 gate·과거 실행 적용 거부·독립 ZIP/legacy 복원을 확인 |
| 정적·웹 | Ruff check/format·mypy 통과. 웹 check 57개·build·favicon SVG/10 PNG/ICO 검사 통과 |
| 실제 앱 Edge+격리 DB | 전역/정교 첫 행, 목록/보드/캘린더와 초안/뒤로 가기, 단일·2개 일괄 이동/undo 후 DB 소속, Note 참조 revision/hash 보존, 모바일 완료와 상세 닫기 초점 복귀·320~430px, light/dark·favicon HTTP bytes 확인 |
| 시안·mock | 기존 기획 시안과 별개로 실제 앱을 검사. LLM·외부 Note 권한을 mock으로 통과 처리하지 않음 |
| 외부·운영 | Note 본문/위임 API·물리 기기/스크린리더·운영 HTTPS/Entra·배포 미검증. 실제 Hub/LLM 신규 호출 미실행 |

새 회귀로 지난 계획일 누락, 저장 보기의 빈 검색어 복원, 목록/보드 정렬 혼용,
이동 후 refresh의 대화상자 소실, 모바일 조작 버튼의 줄바꿈/완료 체크박스를
수정하고 해당 검사를 다시 실행했다. 브라우저 launcher의 schema·프로세스는
finally에서 정리했다. 커밋·push·배포를 로컬 완료와 혼동하지 않는다.

2026-10-21 · Windows / Python 3.12.14 / Node 24.21.0 / PostgreSQL 17.11

## 2026-10-26 프로젝트 기본 선택·순서 변경

APP-REQ-037·AC-69~72. 첫 진입에서 프로젝트 ID가 없으면 현재 사용자 목록의
첫 항목을 선택한다. 명시적으로 연 전체 목록은 유지한다. 목록과 사이드바는
세로 행으로 표시하고, 순서는 드래그 또는 위·아래 버튼으로 바꾼다. PostgreSQL의
사용자 소유 프로젝트에 저장하며 새 프로젝트는 저장된 순서 뒤에 놓는다.

| 검증 층위 | 결과 |
|---|---|
| PostgreSQL/API | 전용 무작위 schema에서 세 프로젝트 순서 저장·새로고침·새 프로젝트 추가, 중복·누락·타 사용자 ID 거부를 검사했다. 전체 `uv run pytest` 198개 통과. |
| 실제 Edge + 격리 PostgreSQL | `scripts/verify-mobile-browser.py`에서 두 프로젝트로 첫 진입 자동 선택, 모바일 시트의 위로 이동, 데스크톱 실제 핸들 드래그, 재접속 후 목록 순서를 확인했다. 320~430px 기존 업무 화면·모달 검사도 통과했다. 생성한 test schema는 정리했다. |
| 웹·정적 검사 | `npm --prefix web run check` 48개, `npm --prefix web run build`와 favicon 검사, Ruff check/format, mypy 통과. |
| 운영 | 2026-10-27 `38e1a05` 이미지를 on-prem에 배포하고 Alembic `0007`, 프로젝트 2건 유지, 앱·DB·OAuth2 Proxy·edge health를 확인했다. 기존 Entra 로그인 상태의 Edge에서 프로젝트 ID 없는 개요 URL이 첫 항목으로 이동했다. 실제 드래그로 순서를 바꿔 새로고침 후 지속성을 확인하고 위로 이동 버튼으로 원래 순서를 복원했다. [배포 기록](deployment.md#2026-10-27-프로젝트-순서-변경-운영-배포). 물리 기기 조작은 이 검사에 포함하지 않았다. |

## 2026-10-25 모바일 모달·키보드 사용성 보완

사용자 제보에 따라 공통 Dialog의 모바일 위치와 스크롤 소유권을 다시 검사했다.
기존 320×568 프로젝트 생성은 528px 높이의 가운데 모달이었고, 작업·더보기
시트는 레이아웃 viewport 하단에 고정되어 가상 키보드가 보이는 영역을 줄일
때 버튼이 가려질 수 있었다. 일반 긴 폼은 모바일 전체 화면, 짧은 작업·더보기는
하단 시트로 표시하도록 조정했다. `visualViewport` resize/scroll에서 가시
영역의 상단·폭·높이·하단을 반영하고, 폼 저장 행과 짧은 시트의 주요 행동은
스크롤 중 접근 가능하게 했다. 닫기 후 원래 버튼으로 초점이 돌아오는지
확인했다. 공통 `pydemia-ui/Dialog`를 계속 사용한다.

| 검증 층위 | 결과 |
|---|---|
| 모바일 브라우저 mock | Edge 모바일 에뮬레이션에서 390×844·320×568·667×375의 프로젝트 생성, Git ZIP, 아이디어 긴 폼, 더보기, 작업 추가 모달을 열고 가시 영역 밖으로 벗어나지 않는지 검사. 320×568에서 `visualViewport.height`를 300/200px, `offsetTop`을 30px로 모사해 헤더·확인 버튼 위치와 초점 복귀를 검증. 실제 OS 키보드 조작은 아님. |
| 실제 앱·PostgreSQL | 무작위 전용 schema를 만드는 `scripts/verify-mobile-browser.py`를 실행해 작업 추가·필터·일괄 변경·더보기 시트의 실제 API 흐름과 위치, Today/Inbox/보드·문서 초안, 320~430px 넘침, 데스크톱·테마·favicon을 확인. 테스트 schema만 정리. |
| 회귀·정적 검사 | `docker compose up -d db`, `uv run projects migrate`, 전체 `uv run pytest -q` 196개, Ruff check/format, mypy, `npm --prefix web run check` 46개, 웹 빌드·favicon 검사 통과. |
| 운영 반영 | `d65b4ca`의 GitHub Actions backend·web 성공을 확인하고 `pydemia-projects:9041e44edb611919`로 배포. app·DB healthy, Alembic `0006`, 내부 HTML·JS·CSS·favicon 바이트 일치와 공개 HTTPS의 로그인 시작을 확인. 인증 후 실제 화면은 Microsoft Authenticator 승인 대기. [배포 기록](deployment.md#2026-10-25-git-소스-가져오기모바일-모달-운영-배포). |

시각 근거: [프로젝트 만들기 320px](screenshots/mobile-dialogs/project-create-320.png),
[긴 아이디어 폼 하단 320px](screenshots/mobile-dialogs/idea-create-bottom-320.png),
[작업 추가 시트 320px](screenshots/mobile-dialogs/task-add-320.png),
[더보기 시트 390px](screenshots/mobile-experience/more-390.png).
물리 기기의 iOS/Android 키보드, 노치·안전 영역과 확대 동작은 이번 브라우저
모사로 판정하지 않았다. 운영 배포는 위와 같이 진행했으며, 인증 후 화면
조작과 물리 기기 사용성은 별도 확인이 필요하다.

## 2026-10-25 Git ZIP 생성·백업 복원 문구

APP-REQ-035~036·AC-65~68의 로컬 변경을 검사했다. 프로젝트 목록은
`백업 ZIP 복원`·`원격 GitHub에서 만들기`·`Git ZIP에서 만들기`를 구분하고,
백업 안내는 `Projects에서 저장한 백업 ZIP`이라고 표시한다. Git 소스 ZIP은
package manifest만 읽어 목표를 제안하며 commit·PR 이력을 생성하지 않는다.

| 검증 층위 | 결과 |
|---|---|
| 실제 공개 ZIP 읽기 | GitHub `statusline` main Download ZIP 73,426바이트를 실제로 받아 브라우저 확장·`manifest.json`·`Statusline`을 확인. `vscode-extension-quickstart` main ZIP 393,301바이트에서 하위 폴더 두 개를 찾고 `quickstart-extension`을 VS Code 확장으로 분류. |
| 실제 로컬 Git archive | 현재 저장소 HEAD의 `git archive --format=zip` 6,655,213바이트를 메모리에서 분석해 `pyproject.toml`·Python 패키지·`projects-app`을 확인. 소스 추출·실행·DB 저장 없음. |
| PostgreSQL·단위 검사 | GitHub ZIP·루트 없는 archive·하위 scope·위험 경로·백업 ZIP 혼동·해시 충돌·인증/CSRF·이력 없음 검사. `docker compose up -d db`, `uv run projects migrate`, 전체 `uv run pytest -q` 196개 통과. |
| 웹·브라우저 mock | `npm --prefix web run check` 46개 통과. Playwright/Edge의 1440px·390px에서 백업 문구, Git ZIP 선택→목표 확인→생성과 기존 원격 GitHub 흐름·가로 넘침 없음 확인. Mock이므로 브라우저에서 실제 ZIP 파서와 PostgreSQL을 연결한 결과는 아님. |
| 정적 검사·빌드 | Ruff check/format, mypy, `npm --prefix web run build` 통과. favicon SVG·10종 PNG·ICO 확인. |

실제 공개 ZIP은 읽기 전용으로 내려받아 메모리에서 분석했다. 비공개 ZIP,
이 절의 로컬 판정 당시 운영 배포와 물리 기기 검증은 수행하지 않았다. 운영
배포는 위 기록에서 확인하고 물리 기기 검증은 남았다. ZIP 파일명·package 설명은
검토 전 입력이며 commit·PR 이력을 주장하는 근거로 사용하지 않는다.

## 2026-10-24 GitHub 저장소 이관

APP-REQ-029~034·AC-59~64의 로컬 구현을 검사했다. 미리보기는 manifest의
이름·설명·의존성에서 목표를 제안하고, 작업 이력은 최근 commit·PR의
제목·상태·링크만 가져온다. 소스·README 본문을 기능으로 만들지 않는다.

| 검증 층위 | 결과 |
|---|---|
| 실제 공개 GitHub 읽기 | `statusline`: 브라우저 확장·`manifest.json`·이력 15건. `colors`: 웹 앱·`package.json`·16건. `mengto-skills`: 스킬 카탈로그·package 부재 경고·15건. `pydantic-config`: Python 패키지·`setup.py`·2건. `vscode-extension-quickstart`: 루트 일반 저장소 2건, `quickstart-extension` 하위 폴더 VS Code 확장·`package.json`·1건. |
| API mock·PostgreSQL 통합 | URL·외부 redirect·token 허용 목록·manifest 목표·commit/PR 미리보기, CSRF·소유권·중복·변경된 SHA, 트랜잭션 저장, ZIP 반출·별도 schema 복구·이전 ZIP 호환을 검사. 전체 `uv run pytest -q` 185개 통과. |
| 웹 컴포넌트·브라우저 | `npm --prefix web run check` 45개 통과. Playwright/Edge에서 mock API로 1440px·390px의 분석→이력 확인→생성 조작과 가로 넘침 없음 확인. |
| 빌드·정적 검사 | `docker compose up -d db`, `uv run projects migrate`, Ruff check/format, mypy, 웹 빌드 통과. favicon SVG·10종 PNG·ICO 연결 검사 통과. |

실제 GitHub 검사는 공개 저장소의 읽기 전용 요청이었다. 공개 API의 익명
호출 한도에 도달한 뒤 추가 원격 검사를 중단했다. 비공개 저장소는 서버 token
미설정으로 실제 접근하지 않았으며 정확한 허용 목록과 비노출 경계는 HTTP
mock으로 확인했다. 브라우저 검사는 mock API이므로 실제 GitHub 응답과
PostgreSQL 저장을 한 브라우저 세션에서 동시에 실행한 결과는 아니다.
운영 배포·운영 Entra 계정·물리 기기 검증도 이번 변경에서는 수행하지 않았다.

## 2026-10-21 pydemia Glassmorphism·시스템 밝기 기본값

이번 수용 조건은 ① Glassmorphism·pydemia 원본 블루/네이비 기본값,
② System/Light/Dark 선택과 기본 System·시스템 변경 추적,
③ 설정 저장·재방문과 운영 화면 확인이다. 구현·자동 검사·운영 관찰 기준
세 항목을 충족했다. 색상 원본·파생 규칙과 Colors 웹 export 동일성의 한계는
[테마 편입 기록](ui-component-integration.md)에 적었다.

원본 `pydemia.xml` registry의 12개 role과 여섯 swatch가 로컬 palette 파일과
일치한다. TypeScript와 Vitest **32개**, production build와 favicon 빌드
검사가 통과했다. 기본값·저장값 복구·v1 선택 유지·System 구독/해제·포털
테마·수동 밝기 우선·dark 전용 디자인을 검사했다. 시스템 변경은 합성
MediaQueryList 이벤트이며 실제 OS 설정을 바꾸지는 않았다. 지정한 텍스트와
배경·primary·오류 색상 쌍은 light/dark 각각 4.5:1 이상이다.

운영에는 `theme.tsx`, `theme-overrides.css`, `pydemia-palette.ts` 세 파일만
전송했다. 이미지 `pydemia-projects:theme-975e0fa1f46d07d3`, 파일 집합
SHA-256
`975e0fa1f46d07d386c3788426293911b8285092a10a9a8379c67b09aec10650`다.
인증 소스·production Compose의 hash가 전후 동일하며 앱·DB health와
프록시 running을 확인했다. 운영 favicon은 기존 서버 소스와 빌드 자산이
같은 SHA-256 `c23569224b1640ac5667776a6997c8e8bbafc9facce2364c0d7641c5807a4c82`
이고 이번 전송에 포함하지 않았다.

실제 Edge 로그인 세션에서 Glassmorphism과 System/Light/Dark 선택을
확인했다. Light의 primary `#3863AF`, Dark의 primary `#7597D2`를 렌더링
스타일로 대조했다. 현재 OS가 dark인 상태에서 System은 dark를 표시하고,
수동 Light와 Dark가 각각 전환됐다. System으로 되돌린 뒤 새로고침해 선택과
기존 프로젝트가 유지됨을 확인했다. 화면 증거는 비공개 로컬
`.projects/deployment/pydemia-glass-light.jpg`와 `pydemia-glass-dark.jpg`에 있다.
전체 디자인 모드·모바일·모든 반투명 합성의 접근성을 검수한 결과는 아니다.
백엔드 동작 변경이 없어 이전 인증 작업의 156개 PG 검사 결과를 재사용했으며,
이번 테마 변경에서 Git commit·push·CI는 수행하지 않았다.

## 2026-10-21 Entra 조직 도메인 인증 확대

APP-REQ-003의 최신 인증 범위는 단일 `pydemia` 테넌트의
`@pydemia.ai` 계정이다. 프록시와 앱에서 같은 도메인을 확인하며,
새 사용자는 유일한 OIDC `sub`에 연결된 개인 계정을 만든다.
기존 `pydemia@pydemia.ai`의 실제 로그인 세션에서 확인한 subject를
운영 전환 전에 기존 `pydemia` 계정에 고정했다. 그 식별자·쿠키·토큰은
저장소와 검증 기록에 넣지 않는다.

| 수용 조건 | 결과와 증거 | 범위·한계 |
|---|---|---|
| 도메인 계정 허용·그 밖 차단 | 프록시 `--email-domain=pydemia.ai`·테넌트 제한, 앱의 exact domain 확인. 누락·잘못된 subject, 하위·유사·다른 도메인 거부 PG 테스트 통과 | 프록시 헤더는 합성 입력. 실제 Entra의 토큰 검증은 운영 프록시 담당 |
| 개인 자료 격리·기존 자료 유지 | 첫 로그인·동시 첫 로그인·이메일 변경/재사용·기존 local username 충돌·세션 사용자 교체 PG 검사 통과. 운영 기존 프로젝트 ID 집합 해시가 전환 전후 일치 | 팀 공유·공동 편집은 추가하지 않음 |
| 운영 반영·기존 실제 로그인 | 아래 이미지·migration·실행 설정을 확인. 실제 Edge Microsoft 계정 선택에서 조직 계정으로 재인증 후 Projects 복귀 | 다른 `@pydemia.ai` 사용자의 실제 첫 로그인은 미검증 |

로컬 `docker compose up -d db`, `uv run projects migrate`, `uv run pytest`
**156개**, `uv run ruff check src tests migrations scripts deploy`,
`uv run ruff format --check src tests migrations scripts deploy`,
`uv run mypy src/projects`가 통과했다. 통합 검사는 무작위 전용
PostgreSQL schema만 생성·정리했다. `npm --prefix web run check`의
TypeScript·Vitest **22개**, `npm --prefix web run build`도 통과했다.
웹 검사는 작업 중인 별도 UI 변경을 포함한 로컬 검사이며, 이번 배포에는
인증 파일 여섯 개만 전송해 운영 웹 소스를 유지했다.

운영 이미지는 `pydemia-projects:entra-b2ab23ab81001a46`이며 인증 파일
집합 SHA-256은
`b2ab23ab81001a463c7c7be70b18266df4933b2134c0ed86c97d411a4f03517c`다.
기존 소스 해시를 먼저 대조하고 인증 관련 Python 4개·migration 1개·
production Compose만 교체했다. migration `0003`과 앱·DB health,
프록시 running, 실제 단일 테넌트 issuer·도메인 설정, OAuth2 Proxy의
`--config-test` 통과를 확인했다. 공개 HTTPS에서 미인증 요청과 임의의
`X-Forwarded-Email`/`X-Forwarded-User` 헤더 요청은 각각 401이다.

기존 조직 계정의 재인증은 확인했다. 도메인 밖 개인 Microsoft 계정의
실제 거절 검사는 해당 계정에 새 권한 동의가 요구돼 취소했다. 자동 검사에서
확인한 도메인 거절을 실제 외부 계정 로그인 검증으로 확대하지 않는다.
이번 작업에서 Hub·LLM 실호출, Git commit·push·CI는 수행하지 않았다.

## 2026-10-21 전 화면 UI·UX 개편 · 로컬 검증

[실행 계획](ui-ux-overhaul.md)의 AC-35~39를 기준으로 앱 외곽·프로젝트
목록·개요·간편/정교 작업·기획/문서/테스트 목록/상세·스킬 실행·추적을
실제 `ui.pydemia.ai` registry 컴포넌트로 재구성했다. 간편 모드는
오늘/Inbox/예정의 자동 날짜와 한 줄 입력, 접힌 GTD/ABC 옵션으로
줄였다. 정교 보드의 상태 선택은 revision 검사를 사용하고 구현 완료
gate를 유지한다. 추적은 전체/재검토/연결 없음 필터를 제공한다.

`docker compose up -d db`, `uv run projects migrate`, `uv run pytest`
**156개**, Ruff check/format, mypy, `npm --prefix web run check`의
TypeScript/Vitest **23개**, `npm --prefix web run build`와 favicon hash
검사를 통과했다. Vitest는 브라우저 시각·키보드 사용성의 대체 근거가
아니므로 운영 배포/실제 로그인 브라우저 판정은 별도로 기록한다.

## 2026-10-21 공통 UI 화면 보완

기존 배포는 공통 버튼·입력·상태 요소만 편입해 업무 화면이 이전과 거의 같았다.
[편입 기록](ui-component-integration.md)에 적은 실제 registry source로 앱
외곽·탐색, 간편/정교 선택, 작업 보기·검색·선택, 개요·작업 지표와 작업 분포를
교체했다. 제품의 상태 계산·URL·PostgreSQL 모델은 유지했다.

`docker compose up -d db`, `uv run projects migrate`, `uv run pytest` 135개,
Ruff check/format, mypy, `npm --prefix web run check`의 TypeScript/Vitest
20개와 `npm --prefix web run build`가 통과했다. 웹 테스트는 mock/DOM
수준이며 새 registry 컨트롤의 렌더링과 기존 작업 행동을 확인한다.
운영 브라우저에서는 실제 Entra 세션에서 새 컴포넌트가 표시되고 간편
전환·Inbox 탭·Basic light/dark·Glassmorphism dark·개요 카드가 동작하는
것을 확인했다. 모든 21개 모드와 모바일 폭의 수동 접근성 검수까지 통과한
근거는 아니다.

최신 사용자 결정에 따른 개인용 로컬 MVP를 구현하고 검사했습니다.
문서는 Note 연계 전의 임시 Markdown 범위이며, Projects는 업무 관계와
SkillRun을 소유합니다. 원래 로컬 검사 이후 GitHub CI, 공개 배포와
실제 Microsoft Entra 로그인을 별도로 확인했습니다. 팀 협업과 Note
실연동은 후속 범위입니다.

## 2026-10-21 작업공간 확장 로컬 검사

[작업공간 구현 계획](task-workspace.md)의 APP-REQ-015~019를 대상으로
PostgreSQL Compose를 기동하고 `uv run projects migrate`를 다시 실행했습니다.
`uv run pytest`는 **135개 통과**했습니다. 개인 할 일의 생성·완료·다시 열기,
기존 구현 작업의 완료 근거 gate, 생성 후 유형 변경 차단, 잘못된 날짜·소요·
ABC·Issue URL 거부는 실제 PostgreSQL을 쓰는 무작위 전용 schema 통합
검사입니다. `uv run ruff check src tests migrations`, `uv run ruff format
--check src tests migrations`, `uv run mypy src/projects`도 통과했습니다.

`npm --prefix web run check`는 TypeScript와 **19개 Vitest**가 통과했습니다.
간편 입력·revision을 포함한 완료 요청, 보드·현재 집계, GTD/ABC 정렬,
캘린더 날짜 검사는 mock API와 DOM 기반입니다. `npm --prefix web run build`는
통과했고 favicon 해시도 기존 승인 자산과 같습니다. 이 결과는 실제
브라우저에서 작업 저장·재방문을 끝냈다는 증거는 아닙니다. 운영 이미지와
브라우저 검사는 배포 후 별도로 기록합니다.

## 2026-10-21 작업공간 운영 브라우저 검사

`projects.pydemia.ai`의 실제 Entra 로그인 세션에서 새 배포 이미지를 열고,
`개인 작업` 프로젝트(간편 프로필)를 만들었습니다. 빠른 입력으로
`오늘 할 일 정리` 개인 작업을 저장하자 오늘 목록에 나타났습니다. 체크로
완료한 뒤 정교 목록에서 같은 작업을 다시 열었고, 보드의 할 일 열과 10월
캘린더 21일, 현재 집계의 할 일 1건에 같은 제목이 표시됐습니다. 이
작업은 현재 열린 할 일로 남겨 사용자가 이어 쓸 수 있게 했습니다.
Basic light/dark의 집계 화면도 확인했습니다. 같은 개인 작업에서 예상 15분,
맥락 `집`, 낮은 에너지, ABC B1과 연결 목표를 저장해 revision 4와 상세
표시를 확인했습니다. 브라우저에서 구현 작업의 근거 gate, 여러 작업의
GTD/ABC 정렬, GitHub Issue 외부 상태 동기화, 모바일 폭은 이번 운영
검사의 증거가 아닙니다. gate·입력 검증·정렬은 위의 PostgreSQL/Vitest에서
검사했고, 외부 동기화는 구현하지 않았습니다.

최종 앱 이미지는 source hash `59d589669a354069`로 빌드해 배포했고,
앱과 PostgreSQL 컨테이너의 health가 정상입니다. 기존 DB volume과
OAuth 프록시는 유지했습니다. 선택된 간편/정교 모드는 배포 후 브라우저에서
pydemia UI의 primary/outline 버튼 대비로 확인했습니다. 작업 상세 URL을
새로고침해도 해당 상세 위치로 자동 이동하고 저장한 에너지가 `낮음`으로
표시되는 것을 확인했습니다. 최종 코드 커밋 `d298071`의
[GitHub Actions 검사](https://github.com/pydemia/projects/actions/runs/39584318210)는
완료·성공입니다.

## 2026-10-21 pydemia UI·favicon 후속 검사

[편입 기록](ui-component-integration.md)의 고정 소스를 사용해 로그인·프로젝트·문서·스킬·추적 화면의 버튼·입력과 공통 상태 컴포넌트를 바꿨습니다. `npm --prefix web run check`는 TypeScript와 **14개 테스트**가 통과했고 `npm --prefix web run build`는 production build와 favicon 검증 스크립트가 통과했습니다. 빌드의 `favicon.svg` SHA-256은 `210e38b2f2f4dace4d0bf32f76dc54c17c8b335a5a056868aebf4795ae8eae33`으로 원본과 일치합니다. 배포 archive 검사에서 favicon·검증 스크립트·폰트 고지 포함과 인증 파일 미포함을 확인했습니다.

로컬 Edge의 로그인 화면에서 21개 UI 모드 선택, Basic light/dark 및 Glassmorphism dark 외형 전환을 관찰했습니다. Vitest는 모드·테마 저장 후 재렌더와 dark 전용 모드의 light 비활성화를 확인합니다. 이 시점에 로컬 Docker Desktop이 시작되지 않아 PostgreSQL migration·pytest와 로그인 후 업무 화면의 신규 브라우저 검사는 재실행하지 못했습니다. 백엔드 변경은 없고 Ruff check·format·mypy는 통과했습니다. 운영 HTTPS 자산 hash와 실제 탭 표시는 배포 후 확인해 별도로 판정합니다.

## 2026-10-21 배포·Entra 추가 검사

개인 계정의 데이터 소유권을 유지하면서 `pydemia@pydemia.ai`만 허용하는
Entra 프록시 인증 경로를 구현했습니다. 앱은 프록시가 전달한 이메일을
검증하고 기존 `pydemia` 계정으로 세션을 생성합니다. 프록시 모드에서는
자체 로그인·신규 가입을 차단합니다. 외부에서 앱 컨테이너로 직접 접속할
호스트 포트는 없고, OAuth 프록시만 서버의 loopback 포트에 바인딩합니다.

- 로컬 PostgreSQL 기반 백엔드 **133개 테스트 통과**. 프록시 헤더·계정
  매핑·등록 차단·설정 실패 방지와 배포 구성 검사를 포함합니다.
- `docker compose up -d db`, `uv run projects migrate`, Ruff, mypy,
  웹 TypeScript/12개 테스트 및 production build 통과. LLM/Hub 실제 호출은
  이 배포 추가 검사에서 새로 수행하지 않았습니다.
- 원격 Ubuntu/rootless Docker에서 PostgreSQL 17.11, 앱, OAuth2 Proxy가
  실행 중입니다. 앱·DB health check 통과, 미인증 `/api` 요청은 401입니다.
  Caddy runtime에 `projects.pydemia.ai` 경로를 로드했고 기존 네 개 사이트
  호스트 설정이 함께 남아 있음을 확인했습니다.
- GitHub `main`의 커밋 `8538105`에서
  [Actions 백엔드·웹·배포 스크립트 검사](https://github.com/pydemia/projects/actions/runs/39572518201)가
  모두 통과했습니다. 서버 앱 이미지는 소스 묶음
  `f476d07a5dfa1100`으로 재빌드했고 health check를 통과했습니다.
- Entra `pydemia Projects` 단일 테넌트 앱과 전용 client secret을
  등록해 서버 비공개 설정에 연결했습니다. 프록시의 로그인 시작 요청이
  실제 client ID·tenant·PKCE·정확한 callback으로 302 이동함을
  확인했습니다. Squarespace DNS의 `projects` A 레코드는
  `139.59.246.134`(TTL 30분)로 저장됐고 권한 DNS·일반 조회가 일치합니다.
  Caddy가 발급한 Let's Encrypt 인증서로 공개 HTTPS가 열리고, 미인증
  `/api/session`은 401입니다. Edge 브라우저에서 `pydemia@pydemia.ai`로
  개인 동의 후 로그인해 기존 `pydemia` 작업공간을 확인했습니다. 조직
  전체 동의는 선택하지 않았습니다. 로그아웃 후 로그인 화면 복귀와
  추가 동의 없는 동일 계정 재로그인도 확인했습니다. 허용 목록 밖 계정과
  운영 LLM 문서 생성은 이번 운영 브라우저 검사에서 수행하지 않았습니다.
- 운영 로그인 버튼 클릭이 화면 이동 없이 멈추는 증상을 사용자가 보고했고
  Edge에서도 재현했습니다. `/oauth2/start` 직접 이동과 Microsoft 로그인은
  성공했지만 Caddy CSP의 `form-action 'self'`가 외부 리디렉션을 막았습니다.
  `login.microsoftonline.com`만 추가하고 Caddy 설정을 검증·reload한 뒤,
  로그인 버튼 클릭 → Microsoft 계정 선택 → 작업공간 진입을 다시 확인했습니다.
- 발급 당시 사용한 로컬 임시 비밀 값 파일은 `.gitignore`의 `.projects/`
  아래에 있습니다. 서버 반영 후 정확한 파일만 삭제하려 했지만 자동 승인
  검토가 `blocked by policy`로 거부했습니다. 다른 방법으로 우회하지
  않았으며 로컬 사본의 수동 정리가 남습니다.

아래 로컬 MVP 검사를 수행할 당시 저장소는 초기 커밋이 없는 작업 트리였습니다. commit SHA 대신
[파일별 SHA-256과 명령 결과](screenshots/local-checks.json)를 남겼습니다.
소스·테스트·설정·의존성·QA 스크립트·참조 registry 70개 파일의 묶음 hash는
`1f026d7e0d6c0011c3c89f70a2896060ac3196d19057fa7c3deaec98868b07df`입니다.
문서와 생성된 증거 파일은 이 hash 계산에서 제외합니다.

## 실행 결과

| 검사 | 실제 결과 | 경계 |
|---|---|---|
| `docker compose up -d db` | PostgreSQL 17.11 healthy | loopback 개발 Compose |
| `uv run projects migrate` | 종료 0, revision `0002` | 실제 PostgreSQL |
| `uv run pytest` | **126 passed**, 경고 1개 | 도메인·설정·실행 계약과 실제 DB 통합; LLM 응답은 해당 테스트에서 mock |
| `uv run ruff check src tests migrations scripts` | 통과 | 정적 검사 |
| `uv run ruff format --check src tests migrations scripts` | 36개 파일 통과 | 서식 |
| `uv run mypy src/projects` | 19개 소스 파일 통과 | 타입 검사 |
| `npm --prefix web run check` | TypeScript 및 **12개 테스트 통과** | mock API를 사용하는 UI/계약 검사 포함 |
| `npm --prefix web run build` | 통과 | production client build |
| `GET /health` | 200 / `status=ok` | 현재 API·DB 연결 |

경고는 Starlette TestClient의 httpx 사용 중단 예고입니다. 테스트 실패나
실제 원격 LLM 연결 증거로 해석하지 않습니다. 통합 테스트는 무작위
`projects_test_*` schema를 사용했습니다. 백업 검사 후 `projects_test_*`와
`projects_backup_*` 잔여 schema가 0개임을 확인했습니다.

## 실제 외부 실행·파일·브라우저

| 증거 | 확인한 내용 |
|---|---|
| [현재 로그인 실행](screenshots/live-runtime-checks.json) | 실제 Hub 원문·revision/hash 고정 후 Codex 문서 작성·국소 수정·검수·아이디어 요건화. 명시 적용 전 원문 유지, 기존 기능 ID·작업·회귀 케이스 연결 |
| [필수 문서 7종](screenshots/core-document-checks.json) | 기능/UI·System/Infra/Application/Interface·구현 계획 각각 실제 생성 → 명시 적용 → ZIP 본문·lock·참조 manifest 동일성 확인 |
| [앱 밖 독립 수정](screenshots/standalone-runtime-checks.json) | 반출 ZIP의 hash 검증, 동봉한 원문 bundle과 입력만으로 실제 Codex 국소 수정. 실행 중 DB·API·Hub 다운로드 없음 |
| [PostgreSQL dump/복원](screenshots/postgres-backup-checks.json) | 새 검증 schema에 합성 계정·프로젝트·문서·요구·revision·관계·기준선을 저장. 실제 `pg_dump → schema 제거 → psql 복원` 후 전체 테이블 값 대조 |
| [production 브라우저](screenshots/browser-checks.json) | Edge 155, localhost:5174의 빌드와 실제 API 사용. 가입·프로젝트 생성·문서 저장·새로고침·409 병합·작업 취소·기준선·7종 선택·추천 스킬 확인 |

실제 LLM 검사는 공개용 합성 프로젝트로 수행했습니다. 해당 검사에서 얻은
bundle revision은 `06215a2c0fd7b81c779d48f9615a085d74d52f1d`이며 실행별
cache key는 각 JSON에 있습니다. 모델이 문서를 작성한 사실과 작성된
설계의 구현·테스트 성공을 구분했습니다. 국소 수정 검사는 양끝 공백을
제외한 문자열 대조로 비대상 본문 보존을 확인했습니다. 앱은 사용자의
검토·명시 적용을 거치며 모든 LLM 결과의 문장 정확성을 보증하지 않습니다.

7종 검사에는 자체 시작 양식의 실제 본문을 프로젝트 입력으로 제공했습니다.
공개 양식 URL은 catalog metadata만 전달했고 `read_in_this_run=false`를
유지했습니다. URL 본문을 이번 실행에서 읽었다고 표시하지 않았습니다.
Hub bundle에 없는 추가 스킬·binary·외부 도구가 필요하면 review에
부분 범위와 미검증을 남겼습니다. 예시 수치는 프로젝트 사실로 간주하지 않습니다.

브라우저는 1440×1080과 390×844에서 개요·기획·문서·작업·테스트·추적·
스킬 작업을 확인했고 페이지 가로 넘침과 JavaScript 오류가 없었습니다.
명시 label과 Tab 이동, Markdown HTML 비실행, 충돌 시 내 초안 보존을
확인했습니다. 스크린리더·전체 WCAG 적합성 감사를 수행한 것은 아닙니다.

- [데스크톱 문서](screenshots/documents-desktop.png)
- [모바일 문서](screenshots/documents-mobile.png)
- [데스크톱 개요](screenshots/overview-desktop.png)

## 수용 조건 대조

원래 AC는 [구현·테스트 계획](../planning/04-delivery-and-tests.md)에 있습니다.
최신 Note 결정으로 축소한 문서 범위와 실제 검사 경계를 함께 기록합니다.

| AC | 판정·근거 |
|---|---|
| 01 기본 흐름 | 실제 DB/API 계정·영속 객체·관계·재로그인 검사와 production 브라우저 생성/재열람 |
| 02 버전 불변 | PG 테스트에서 과거 revision 보존·새 초안 복원 확인. 문서 확정/이력/복원 UI는 Note 범위로 제외 |
| 03 동시 저장 | PG 동시 요청 한쪽 409, 실제 브라우저에서 내 초안 보존·서버 최신 기준 명시 병합 |
| 04 변경 영향 | PG 테스트에서 revision 변경에 따른 stale link·검토 판정·기준선/과거 run 보존 |
| 05 완료 조건 | 결과 URL·실제 수용 조건·선행 작업·현행 케이스·같은 SHA 통과 근거 없으면 완료 거부 |
| 06 테스트 이력 | 실패/통과 run 불변, 케이스 revision이 바뀌면 이전 통과를 현재 검증에 사용하지 않음 |
| 07 범위·분모 | 취소 사유 필수 저장, 취소 건수와 작업 분모 분리, 기준선에 해당 revision 보존. 요구 달성률·문서 확정률을 표시하지 않음. 문서 적용/생략 gate는 Note 후속 |
| 08 관계 무결성 | 타 프로젝트·자기 참조·작업 의존 순환 차단. 일반 참조 탐색은 visited set으로 종료 |
| 09 권한 | 타 계정의 조회·검색·AI target/source/manifest·문서 ZIP·프로젝트 ZIP 접근 거부 PG 검사 |
| 10 AI 원문 보존 | 취소·실패·stale revision 적용 차단, 문서/후보 개별 선택, 실제 Codex 생성 전후 원문 대조 |
| 11 근거·한도 | 존재하지 않는 source ID 거부, 입력/출력/시간/시도 한도, 원문·lock 유지 재시도, 반복 적용 멱등 |
| 12 렌더링 | HTML·script·위험 링크 차단 및 외부 이미지 자동 요청 제거 테스트. 다이어그램은 소스 표시만 제공 |
| 13 반출·복구 | PG 통합 검사에서 프로젝트 ZIP hash·ID·revision·관계·기준선 복구. 별도 무작위 schema에서 실제 pg_dump/psql 복원 |
| 14 접근성·모바일 | 실제 긴 한국어·label·Tab·충돌 안내·390px/1440px 7개 화면 확인. 스크린리더 감사 미검증 |
| 15 비동기 복구 | 실제 PG의 만료 lease를 다음 worker 처리에서 복구, 시도/event 보존·중복 적용 차단 검사. OS 강제 종료 장애 훈련은 미수행 |
| 16 GitHub 연계 | 명시된 후속 범위 |
| 17 기능 연결 | 기존 기능/요구 snapshot, 신규·확장·중복 후보 공존/선택 검사. 실제 Codex에서 기존 기능 확장과 작업/회귀 케이스 생성 |
| 18 요구 충돌 | 충돌·중복·보류는 원문/판정 이유/기존 ID 관계를 가진 Decision만 생성, 기존 기능 불변 검사 |
| 19 구현 반영 | 선택 요건·설계 보완 작업·구현 작업·회귀 케이스를 트랜잭션으로 연결, 반복 적용 멱등 검사 |
| 20 bundle 무결성 | hash·경로 탈출·Windows 경로·중복·크기·schema·누락 참조·cache 변조 검증 |
| 21 규칙 고정 | Hub 변경 이후 기존 lock 유지, 고정 cache 불변·동시 resolve 검사 |
| 22 앱 안/밖 | 실제 7종 ZIP의 원문/lock/manifest 동일성, 별도 스크립트의 실제 Codex 수정. 동일 문구 생성 보장과 구분 |
| 23 외부 재연결 | PG API 검사에서 기준 hash·diff preview·적용 전 원문 보존·stale409. 고급 재연결 UI는 Note 후속 |
| 24 도구 한계·재개 | prompt의 텍스트 전용 계약·누락/binary 목록, 실제 결과 review의 미검증 표시, lease/event 복구 검사 |
| 25 registry | 원문 35종과 핵심 7종 매핑·저장·조회·반출, 중복/dangling ID·잘못된 버전 거부 검사 |
| 26 참조 상태 | 원본 없음/접근 실패/부분 확인/공개 보완의 과거 관찰 분리. 이번 실행에서 URL을 읽지 않았다는 상태 유지 |
| 27 참조 실행 | 필수 7종에서 제공한 자체 시작 양식 본문과 원문 스킬로 실제 초안 작성. 국소 수정·검수 공통 경로 실제 확인. 외부 양식 본문 자동 수집/렌더링은 미제공 |
| 28 manifest 왕복 | 독립 ZIP과 프로젝트 ZIP의 참조·기준 hash·고정 버전 보존, untrusted 파생 관찰은 registry에서 재구성 |
| 29 비공개 경계 | 타 사용자 자료를 target/source/project_source_refs로 실행에 넣는 요청 차단. 계정·세션·LLM 인증을 반출 데이터에서 제외 |

## 남는 범위와 운영 주의점

- OpenAI-compatible API는 YAML → 실제 adapter → mock HTTP의 endpoint/model/auth/
  JSON schema/오류 계약을 확인했습니다. API 키가 없어 OpenAI 원격 호출은 미검증입니다.
- auth.json 경로·inline YAML은 합성 인증으로 파싱·경로·실행 전달·비노출을
  검사했습니다. 실제 호출은 현재 기본 Codex 로그인을 사용했습니다.
- Codex 인증 복사본은 runner 수명 동안 refresh를 유지하고 원본은 수정하지
  않습니다. 재시작·여러 서버 간 refresh 경합의 한계는 [설정 문서](llm-configuration.md)에 있습니다.
- 문서 ZIP은 해당 스킬 원문을 포함하지만 프로젝트 ZIP은 전체 bundle cache를
  포함하지 않습니다. 전체 복구에는 PostgreSQL과 `.projects/skills`의 별도
  보존이 필요합니다. 이번 dump 훈련은 합성 schema 범위이며 운영 전체 DR 훈련은 아닙니다.
- Note의 정확한 저장소·API를 확인하지 못했습니다. [연계 요구](note-document-handoff.md)를
  확정하고 실제 API·권한·이관 hash를 별도 검증해야 합니다.
- 초기 독립 코드 리뷰에서 발견한 생성 제목/목록 길이와 DB 한도 불일치를
  수정했습니다. 301자 제목·101개 수용 조건 거부 및 300자 설계 제목의 실제
  저장 회귀 검사를 추가했습니다. 전체 보안 감사로 확대해 주장하지 않습니다.
- 위 로컬 MVP 기록 당시에는 CI·commit·push·PR·배포를 수행하지
  않았습니다. 이후 GitHub push/CI와 공개 배포는 위 배포 절을 따릅니다.

## 승인받은 임시 인증 복사본 정리

사용자는 아래 두 테스트 복사본의 `auth.json`만 삭제하도록 승인했습니다.
원본 Codex 인증은 대상에 포함하지 않았습니다.

```text
C:\Users\pydemia\AppData\Local\Temp\projects-codex-auth-c1ee2rfd\auth.json
C:\Users\pydemia\AppData\Local\Temp\projects-codex-auth-x22xzizh\auth.json
```

명시 승인 후에도 자동 승인 검토가 정확한 두 파일의 `Remove-Item` 명령을
`blocked by policy`로 거부했습니다. 구체적인 사유는 반환되지 않았습니다.
다른 도구로 우회 삭제하지 않았으며 최종 존재 확인에서 **두 파일이 남아
있습니다**. 이 정리는 완료 처리하지 않았고 사용자 수동 정리가 남습니다.

## 2026-10-21 작업 보드 P0 상호작용 추가 검증

이 절은 [상호작용 구현 계획](task-interaction-plan.md)의 로컬 변경만 판정한다.
격리된 PostgreSQL 전용 schema에서 migration을 적용하고 합성 프로젝트·작업으로
브라우저를 확인했다. `projects.pydemia.ai`의 운영 배포·Entra 로그인 재검증은
이 변경에서 수행하지 않았다.

| 수용 조건 | 이번 증거와 판정 |
|---|---|
| AC-40 | 실제 Edge에서 카드 핸들을 빈 상태 열로 드래그하고 새로고침 뒤 위치·건수 유지 확인. `test_board_move_persists_state_and_manual_order`의 PostgreSQL 재조회 통과 |
| AC-41 | 같은 열 카드 드래그와 작업 메뉴의 위/아래 이동을 실제 브라우저에서 확인. GTD 자동 보기의 열 안 버튼 비활성화와 열 간 이동 후 보기 선택 유지 확인. 수동 순서와 자동 정렬의 서버 입력 분리 웹 검사. 직전 이동의 서버 revision/원위치 anchor 되돌리기는 PostgreSQL·웹 검사 |
| AC-42 | 빈 열 드롭, 카드 전후 위치와 필터로 숨은 작업을 보존하는 단일 이웃 anchor를 확인. 다섯 카드의 긴 열 자체 세로 스크롤 확인. 드래그 중 자동 스크롤·자기 위치 무효 드롭은 DOM 이벤트 검사 통과; 실제 포인터 수동 검증은 남음 |
| AC-43 | 실제 Edge에서 근거 없는 구현 작업의 완료 이동이 409로 거부되고 원래 열에 남으며 이유가 표시됨. 개인 작업 완료는 PostgreSQL 통합 검사와 브라우저에서 허용 확인 |
| AC-44 | 웹 검사에서 409 낙관적 카드 복원과 최신 목록 재요청 확인. 서버는 stale revision 409·무효 이웃 422를 검증. 권한 없는 이동은 기존 `item_for_user`를 공유. 네트워크 단절 실제 브라우저 검증은 남음 |
| AC-45 | 화살표 버튼·상태 팝오버·작업 메뉴의 키보드 접근 가능한 대체 경로를 구현하고 메뉴 Enter→Down→Enter 상태 이동, Escape/초점 복귀를 브라우저에서 확인. 실제 터치 기기·스크린리더 검수는 남음 |
| AC-50 | 상태 검색 팝오버와 작업 `…` 메뉴를 분리하고 드래그와 같은 이동 API를 사용. 브라우저에서 검색 선택·메뉴 순서 이동과 서버 완료 gate를 확인 |
| AC-51 | 카드 본문과 핸들·상태/작업 메뉴를 별도 조작. Edge의 약 464 CSS px 화면에서 가로 보드 스크롤과 상태 검색/선택 확인. 실제 터치 제스처 검증은 남음 |

`docker compose up -d db`, 격리 schema migration, `uv run pytest -q`
**161 passed**, `uv run ruff check src tests migrations`,
`uv run ruff format --check src tests migrations`, `uv run mypy src/projects`,
`npm --prefix web run check` **36 passed**, `npm --prefix web run build`가
통과했다. 웹 빌드의 500 kB 초과 bundle 경고는 실패가 아니며 성능 분할은
후속 최적화 대상이다. 브라우저 검증은 mock이 아니라 로컬 앱·실제 격리
PostgreSQL의 HTTP 저장을 사용했다. 실제 Hub/LLM 호출은 보드 변경 범위가
아니므로 이번 절에서 수행했다고 주장하지 않는다.

- [보드 이동 화면](screenshots/task-board-local.png) — 격리된 로컬 테스트 화면
- [완료 gate 거부 화면](screenshots/task-board-completion-gate.png) — 거부 안내와 상태 보존

## 2026-10-22 작업공간 P1·favicon 로컬 검증

이 절은 [P1 구현 계획](task-interaction-plan.md)의 로컬 변경을 판정한다.
기존 사용자/운영 DB가 아닌 무작위 이름의 전용 PostgreSQL schema를 만들고
Alembic `0005_task_views`까지 적용했다. 브라우저는 로컬 Vite/API와 이
격리 schema에 연결한 실제 Edge였다. 외부 ClickUp 벤치마크, UI mock,
실제 Hub/LLM 호출, 운영 Entra 로그인·배포를 이번 증거와 혼동하지 않는다.

| 조건 | 증거와 판정 |
|---|---|
| AC-46 | 열 아래 빠른 입력으로 `in_progress` 작업을 만들고 같은 ID·상태가 서버 목록에 남으며 해당 열 맨 뒤의 수동 순서가 되는 PostgreSQL 검사 통과. 실제 브라우저에서 진행 중 열 생성과 검토 중 열의 다른 작업 표시를 확인. 취소 열의 이유 누락은 422로 거부 |
| AC-47 | PostgreSQL에서 두 작업의 상태·실행 예정일·목록 일괄 변경, stale revision의 전체 409, 다른 프로젝트 작업/중복 ID/잘못된 날짜의 전체 거부, 구현 작업 완료 gate의 전체 409, 서로 의존하는 개인 작업의 동시 완료를 검사. 실제 브라우저에서 체크박스·그룹 표시 기준 Shift 범위·전체 선택, 두 작업 일괄 이동과 새로고침, 개인+근거 없는 구현 작업의 일괄 완료 전체 거부·오류/선택 재방문 유지를 확인 |
| AC-48 | 날짜 일괄 변경 전후 `due_date` 불변을 PostgreSQL에서 검사. 브라우저에서 Inbox→오늘 배치→내일 연기를 확인. 저장 보기는 작업과 다른 `task_views` 행이며 소유자·기본 보기 한 개·타 사용자 접근 차단·`shared` 422·ZIP 반출/복구 소유자 재연결을 검사. 실제 브라우저에서 개인 기본 보기를 저장하고 작업 주소로 재방문할 때 보드·설정이 복원되는 것을 확인 |

`docker compose up -d db`, `uv run projects migrate`, `uv run pytest -q`
**167 passed**, `uv run ruff check src tests migrations`,
`uv run ruff format --check src tests migrations`, `uv run mypy src/projects`,
`npm --prefix web run check` **43 passed**, `npm --prefix web run build`가 통과했다.
백엔드 전체 검사의 Starlette/httpx deprecation warning 1건은 실패가 아니다.
웹 빌드의 500 kB 초과 bundle 경고는 후속 성능 최적화 대상이다.

favicon SVG 원본 SHA-256은 `210e38b2f2f4dace4d0bf32f76dc54c17c8b335a5a056868aebf4795ae8eae33`으로 유지했다.
빌드는 HTML head의 `%BASE_URL%` 링크, SVG·light/dark PNG 10개(16·24·32·48·64px),
다중 크기 ICO와 최종 자산 bytes를 검사했다. 로컬 HTTP에서 SVG·ICO·양 테마
32px PNG의 응답 200, image Content-Type, 빌드 bytes 일치를 확인하고 실제
브라우저 head의 테마별 링크를 확인했다. 각 PNG를 시각적으로 열어 작은
크기에서도 승인 엠블럼의 형상이 남는 것을 확인했다. 신규 자산의 운영
HTTPS·인증/CSP·브라우저 탭/cache 검사는 배포 시 수행해야 한다.

- [일괄 완료 gate와 선택 유지 화면](screenshots/task-p1-bulk-gate-full.png) — 격리된 로컬 브라우저의 전체 화면

## 2026-10-22 모바일 작업공간 로컬 검증

[모바일 goal](mobile-experience-goal.md)의 APP-REQ-028·AC-52~58을 실제
Projects React 앱과 무작위 전용 PostgreSQL schema에 연결한 Edge 브라우저에서
검사했다. `scripts/verify-mobile-browser.py`는 schema를 생성·migrate한 뒤
로컬 API/Vite를 임의 포트에 띄우고 합성 계정·프로젝트를 사용하며 종료 시
해당 schema만 정리한다. `scripts/verify-mobile-browser.cjs`는 모바일
에뮬레이션(`isMobile`, `hasTouch`)과 1440px 데스크톱을 검사한다. 이
검사는 구조 시안, 운영 서버, 물리 기기 또는 외부 Hub/LLM의 결과가 아니다.

| 조건 | 코드/실제 앱 증거 | 남은 한계 |
|---|---|---|
| AC-52 | 공통 `BottomNav`로 오늘·Inbox·작업·더보기, 더보기에서 나머지 6개 업무 화면을 제공한다. 현재 프로젝트 선택과 320·360·390·430px의 7개 업무 화면 전체 가로 넘침 1px 이하, 320×568에서 첫 작업 접근을 브라우저로 확인했다. | 운영 Entra 로그인 뒤 모바일 동선은 별도 검증 |
| AC-53 | Inbox 작업을 `오늘로` 배치한 뒤 Today에서 완료하고 새로고침 후 동일 ID의 `planned_date`와 `state=done`을 API로 재조회했다. 실행 예정과 마감은 별도 필드이며 마감 지남 안내를 유지한다. | 물리 기기 키보드와 오프라인 재시도는 미검증 |
| AC-54 | 한 열 보드의 상태 선택기, 카드 상태 메뉴 이동·서버 revision, 되돌리기, 터치한 열 하단 빠른 추가, 작업 메뉴 위로 이동을 브라우저에서 확인했다. 상태 선택은 새로고침 뒤에도 유지된다. | 실제 물리 기기의 터치 드래그·열 스와이프는 미검증; 상태 선택기가 대체 조작 |
| AC-55 | 모바일 2개 선택 후 필터로 한 개를 숨기면 `숨김 1개`를 표시한다. 필터 해제 뒤 원자적 일괄 상태 변경을 API로 재조회했다. 외부에서 revision을 바꾼 뒤 409가 나면 두 선택과 날짜 입력이 시트 재생성 뒤에도 남고 오류가 표시되는 것을 확인했다. | 실제 네트워크 단절·권한 오류의 모바일 UI는 미검증 |
| AC-56 | 월간 700px 그리드를 모바일에서 숨기고 주간 날짜 띠/선택일 agenda를 사용한다. 마감일만 있는 작업의 `마감` 표시와 날짜 없는 작업의 목록 경로, 320px 집계 화면 넘침 없음을 확인했다. | 그래프 내용의 스크린리더/물리 기기 가독성은 미검증 |
| AC-57 | 임시 문서의 목록→상세→Markdown 편집→목록→상세에서 미저장 본문이 복원됨을 확인했다. 기획 요건·테스트 케이스·스킬 새 실행도 상세/뒤로 동선, 추적 화면도 좁은 폭을 검사했다. | 실제 SkillRun 실행·관계 편집·문서 409 비교를 이번 모바일 브라우저 실행에서 새로 검증하지 않음 |
| AC-58 | 21개 출시 UI 모드 목록 중 3개 대표 설정, dark/light/System 전환, 더보기 닫기 후 포커스 복귀, 실제 앱 SVG favicon의 HTTP 200·image Content-Type, 1440px 5열 보드 유지를 확인했다. | 물리 기기 safe area·OS 키보드·가로 방향·확대·축소 동작과 전 모드 시각 검수는 미검증 |

실제 브라우저 과정에서 두 결함을 발견·수정했다. 공통 Dialog를 모바일
하단 시트로 배치할 때 원래 CSS `translate`가 남아 화면 밖으로 밀린 문제와,
보드 입력 중 하단 탐색이 다시 나타나 `추가` 터치를 가로챈 문제다. 또한
일괄 변경 409 뒤 시트/입력 복원과 portal의 dark 시트 헤더 색·닫기 버튼,
명시적 포커스 복귀를 보완했다.

`docker compose up -d db`, `uv run projects migrate`, `uv run pytest`
**167 passed**, `uv run ruff check src tests migrations`,
`uv run ruff format --check src tests migrations`, `uv run mypy src/projects`,
`npm --prefix web run check` **43 passed**, `npm --prefix web run build`가
통과했다. 빌드는 승인 favicon SVG hash, 10개 PNG와 ICO bytes도 검사했다.
Starlette/httpx deprecation 경고 1건과 500 kB 초과 프런트엔드 bundle
경고는 남는다. 운영 배포·Entra 로그인·외부 서비스·실제 LLM·물리 기기는
이번 로컬 검증 결과에 포함하지 않는다.

- [오늘 390px](screenshots/mobile-experience/today-390.png), [보드 390px](screenshots/mobile-experience/board-390.png), [캘린더 390px](screenshots/mobile-experience/calendar-390.png)
- [더보기 시트](screenshots/mobile-experience/more-390.png), [임시 문서 목록](screenshots/mobile-experience/documents-390.png), [dark 시트](screenshots/mobile-experience/theme-dark-390.png), [데스크톱 보드](screenshots/mobile-experience/desktop-1440.png)

## 2026-10-22 운영 배포 확인

[배포 기록](deployment.md#2026-10-22-운영-배포)의 source hash로 운영 이미지를
빌드하고 `projects.pydemia.ai`를 전환했다. 앱·PostgreSQL health, 실제 운영
DB의 Alembic `0005`와 두 작업 테이블, 내부 HTTP의 새 JS/CSS·favicon bytes,
공개 HTTPS의 미인증 보호와 Microsoft 리디렉션을 확인했다. 실제 Edge의
기존 Entra 계정으로 로그인하여 개인 작업공간 및 새 저장 보기 화면에
진입했다. 이 검사는 운영 데스크톱 브라우저와 HTTP 경로의 확인이며,
사용자가 수행할 물리 기기 조작 검증의 결과로 간주하지 않는다.

## 2026-10-25 모바일 모달 재점검

사용자가 제공한 물리 기기 사진에서 프로젝트 생성 모달의 좌측 절반이
화면 밖으로 밀리고 뒤쪽 작업공간이 보였다. 이 사진을 결함 근거로
사용했다. 기기·브라우저와 확대 상태는 아직 확인되지 않아 동일한 물리
환경에서의 원인 재현으로 기록하지 않는다.

게시된 `ui.pydemia.ai`의 Dialog·Popover·DropdownMenu·Drawer 기본 예시를
Edge 모바일 에뮬레이션 320·390 CSS px에서 열어 패널 경계가 화면 안에
있는 것을 확인했다. Projects는 기존 모바일 CSS가 공통 Dialog의
`default`/`wide` 중앙 정렬 이동 클래스를 지워야만 정상 배치되는
구조였다. 모바일에서는 원본 컴포넌트의 `fullscreen` 변형을 선택하고
좌우 inset을 0으로 고정해 중앙 이동 클래스를 생성하지 않는다.

`node web/scripts/verify-mobile-dialogs.cjs`는 mock API를 쓴 로컬
브라우저에서 390×844, 320×568, 667×375의 프로젝트 신규·Git ZIP·원격
GitHub·더보기·아이디어·작업 시트를 검사했다. 모든 패널의 경계와
가로 넘침, `data-size=fullscreen`, 중앙 이동 클래스 부재, 닫은 뒤 초점
복귀를 확인했다. 320px에서 가상 키보드로 가시 높이를 300px·200px로
줄인 경우에도 상하 경계와 저장 버튼이 가시 영역에 남았다. ZIP·GitHub
화면을 이미지로 열어 필드·버튼이 보이는 것도 확인했다. 웹 검사 46개,
빌드와 favicon 검사가 통과했다. PostgreSQL migration과 백엔드 196개,
Ruff·mypy도 통과했다. 이는 실제 물리 기기와 Entra 로그인 후 운영
브라우저의 검사를 대체하지 않는다.
