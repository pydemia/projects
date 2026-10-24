# Projects 구현 goal

2026-10-24 로컬 완료 goal: 기존 GitHub 저장소에서 프로젝트를 만드는
기능은 [요건·기획](../planning/15-git-repository-import.md)과
[설계·구현 계획](git-repository-import-goal.md)을 따른다.

## 최근 완료 goal · 모바일 UI·UX 구현 (로컬 검증 완료)

2026-10-22 작성·등록·실행. [모바일 UI·UX 기획](../planning/14-mobile-experience.md)의
APP-REQ-028·AC-52~58을 실제 앱에 적용했다. 범위와 실행 기록은
[모바일 구현 goal](mobile-experience-goal.md), 실제 앱의 증거·한계는
[검증 기록](verification.md)의 모바일 절에 있다. 아래 작업공간 P0·P1 goal은
이전 로컬 실행 기록이다.

## 현재 실행 goal · 작업공간 P1 상호작용

2026-10-21. [REA 기반 재분석](../planning/13-task-interaction-rea.md)과
[상호작용 구현 계획](task-interaction-plan.md)의 P1인 APP-REQ-023·024,
AC-46~48을 실행한다. 상태 열의 빠른 생성, 다중 선택과 원자적 일괄 변경,
Inbox→오늘→완료/연기, 작업과 분리된 개인 저장 보기를 PostgreSQL·웹·
실제 브라우저에서 검증한다. 보기의 팀 공유는 권한 계약이 없으므로 거부한다.
승인된 엠블럼 favicon은 16~64px light/dark PNG와 ICO fallback을 생성하고
HTML head·빌드·로컬 HTTP 응답을 검사한다. P2 일정 드래그·이력 집계와
운영 배포는 이 실행의 완료 분모에 넣지 않는다.

구현된 로컬 동작과 수용 조건별 증거는 [계획의 P1 결과](task-interaction-plan.md)와
[검증 기록](verification.md)의 P1 절에 남긴다. 아래 P0 goal은 이전 실행의
기록으로 보존한다.

2026-10-22 로컬 완료 판정: AC-46~48은 전용 PostgreSQL schema의 통합 검사와
실제 Projects 브라우저의 생성·선택·전체 거부·재방문으로 확인했다.
백엔드 167개·웹 43개 검사, Ruff·mypy·웹 빌드 및 favicon 자산 검사가
통과했다. 격리 schema와 서버는 정리했다. 운영 PNG/ICO·Entra 재검증,
팀 공유 보기, P2 기능, 배포·병합은 수행하지 않았다.

## 현재 실행 goal · 작업 보드의 실제 조작

2026-10-21 착수. [REA 기반 재분석](../planning/13-task-interaction-rea.md)과
[상호작용 구현 계획](task-interaction-plan.md)의 확정 P0인 APP-REQ-021·022·027,
AC-40~45·50~51을 실행한다. PostgreSQL에 수동 순서를 보존하고 상태 열 간
드래그·열 안 정렬, 상태/작업 메뉴의 동일한 이동 명령, 키보드·터치 대체 경로,
완료 gate·충돌·실패 복구를 실제 브라우저와 DB에서 확인한다. P1/P2는 제안
상태의 후속 계획이며 이번 goal의 완료 분모에 넣지 않는다. 이 섹션의 착수는
아래 과거 UI·UX goal의 성공 판정을 새 동작에 소급하지 않는다.

실행 순서: 저장 모델·이관 → revision/권한/완료 gate를 공유하는 이동 API →
공통 UI 계약을 따른 카드 드래그·메뉴 → PostgreSQL/웹/브라우저 회귀 →
수용 조건별 기록. 배포는 이번 요청에서 새로 지정하지 않았으므로 운영
반영을 로컬 구현 완료와 구분한다. 기존 favicon·테마 연결은 유지하고 웹
빌드 검사를 다시 수행한다.

2026-10-21 로컬 실행 결과: PostgreSQL `task_positions` migration과 원자적
이동/되돌리기 API, 공통 UI Kanban·Popover·DropdownMenu 기반 실제 조작을
구현했다. 격리 DB에서 상태·순서·숨은 카드·stale revision·완료 gate·ZIP
복구를, 실제 Edge에서 핸들 드래그·메뉴/키보드 이동·새로고침 지속성·좁은
폭 상태 선택·완료 gate 안내를 확인했다. 전체 검사 결과와 실제 기기·운영
검증의 경계는 [검증 기록](verification.md)의 P0 절에 남겼다. 제안 P1/P2와
운영 배포는 이번 로컬 완료 판정에 포함하지 않는다.

2026-10-21 테마 기본값: Glassmorphism을 선택하고 Colors의 `pydemia`
원본 블루/네이비 팔레트를 적용한다. 밝기 선택은 System/Light/Dark이며
기본은 System이다. 시스템 변경 추적·수동 선택·재방문 유지와 실제 운영
화면을 검증한다. 기존에 저장한 명시적인 모드·밝기 선택은 유지한다.

2026-10-21 · 상태: 로컬 MVP·CI 통과, 공개 HTTPS 배포·실제 Entra 로그인 확인 · 최신 요구: APP-REQ-001~020

## 현재 실행 goal · UI·UX 전면 개편

기존의 “버튼·입력창 같은 기본 요소만 공통 컴포넌트로 바꾸고 화면 구조와
업무용 컨트롤은 그대로 둔다”는 범위는 사용자 결정과 맞지 않아 폐기한다.
[6개 제품 공식 자료 벤치마크](../planning/12-task-workspace-benchmark.md)를
사용자 과업으로 번역하고, [개편 실행 계획](ui-ux-overhaul.md)의
AC-35~39까지 구현·테스트·운영 브라우저에서 확인한다. 범위에는 전역
탐색·개요·간편/정교 작업·기획/문서/테스트 목록과 편집·스킬 실행·추적이
모두 포함된다. `ui.pydemia.ai`의 고정된 실제 source 컴포넌트를 업무
조작에도 사용하고 21개 출시 UI 모드와 light/dark를 유지한다. Note는
임시 Markdown 경계를 지킨다.

사용자의 후속 요청으로 `projects.pydemia.ai` 배포와
`pydemia@pydemia.ai` Microsoft Entra 로그인 연결을 현재 실행 범위에
추가했다. 아래 원래 goal 메시지의 외부 배포 제외 문구는 작성 당시의 범위다.
배포 구현과 검증은 [배포 안내](deployment.md) 및
[검증 기록](verification.md)에 이어서 기록한다.

2026-10-21 인증 범위 확대: Microsoft Entra의 단일 `pydemia` 테넌트에서
`@pydemia.ai` 계정이 접속하도록 변경한다. 기존 `pydemia` 계정의 자료는
유지하며 다른 사용자는 OIDC subject로 연결된 별도 개인 계정을 사용한다.
도메인 밖·누락된 프록시 신원·다른 계정 세션을 거부하고 자체 가입·암호
로그인을 계속 차단한다. APP-REQ-003의 이번 수용 조건은 도메인 접속,
사용자별 자료 격리·기존 자료 보존, 운영 반영·실제 로그인 확인이다.

최신 범위 조정: 구현 DB는 PostgreSQL로 확정했다. 문서 관리 본체는 향후
Note 앱으로 연계하며, 이번 구현은 [임시 문서 기능](note-document-handoff.md)으로
제한한다. 아래 초기 goal보다 이 사용자 지시를 우선한다.
LLM 기본은 Codex 로그인이며 auth.json 파일 경로 또는 inline 인증을 YAML로
설정한다. OpenAI-compatible API의 키·모델·주소도 YAML로 선택할 수 있다.
전체 최신 요구 ID는 APP-REQ-001~020이다.

후속 UI 작업: [공통 UI 편입 기록](ui-component-integration.md)에 따라
`ui.pydemia.ai`의 실제 컴포넌트·토큰·21개 출시 UI 모드를 적용하고
light/dark 선택을 제공한다. favicon을 빌드·배포 검증 대상으로 추가한다.
따라서 현재 요구 ID는 APP-REQ-001~020이다. 아래 초기 구현 판정은 UI 개편
이전 근거이므로 신규 UI 검증과 구분한다.

2026-10-21 UI·UX 전면 개편: 기본 요소만의 편입은 불충분하다. 공통
작업공간 외곽, 간편 수집/정교 관리, 기획·문서·테스트·SkillRun의
목록→상세/검색/탭, 추적 필터/기준선, 초안·충돌 Dialog까지 실제
컴포넌트와 사용 흐름을 적용한다. [공통 UI 편입 기록](ui-component-integration.md)에
원본·hash를, [검증 기록](verification.md)에 별도 릴리즈 판정을 남긴다.

후속 작업공간 goal: [제품 벤치마크](../planning/12-task-workspace-benchmark.md)를
근거로 개인 할 일과 구현 작업을 한 PostgreSQL 작업 모델에 유지한다.
간편/정교 모드는 항목 유형이 아니라 보기 밀도이며, 오늘·Inbox·예정과
목록·보드·캘린더·집계 사이의 전환은 동일 ID·revision을 사용한다.
GTD의 행동·시간·맥락·에너지와 Franklin ABC의 가치·순서를 독립 입력/정렬
축으로 구현한다. GitHub Issue는 이번 단계에서 유효한 URL 연결까지만 하며
원격 상태 동기화는 후속 계약이다. 실행 항목·단계별 판정은
[작업공간 구현 계획](task-workspace.md)을 따른다.

2026-10-21 재검증: PostgreSQL migration, `uv run pytest` 135개,
웹 TypeScript/Vitest 19개, Ruff·mypy·웹 빌드와 최종 GitHub Actions가
통과했다. 운영 이미지를 교체하고 Entra 로그인 브라우저에서 간편 입력,
개인 완료·다시 열기, 정교 보기의 목록·보드·캘린더·집계와 light/dark를
확인했다. 범위별 판정은 [검증 기록](verification.md)에 남긴다.

## 최종 판정

PostgreSQL 기반 개인 앱, Hub 원문 스킬 실행, 아이디어 요건화·선택 반영,
임시 Markdown 문서·업무 관계·작업·테스트·기준선·반출을 구현했다.
현재 Codex 로그인으로 4종 동작과 필수 7종 작성·반출, 앱 밖 파일 수정까지
확인했다. 백엔드 126개·웹 12개 테스트와 정적 검사·빌드, 실제 DB 복구·
브라우저 검사를 통과했다. [수용 조건별 증거와 한계](verification.md)를 따른다.

OpenAI 원격 호출·Note 실연동·팀 협업은 후속 또는 미검증이다.
GitHub Actions의 백엔드·웹·배포 스크립트 검사는 커밋 `8538105`에서 통과했다.
`projects.pydemia.ai`의 DNS·Let's Encrypt HTTPS·실제 Entra 로그인과
기존 `pydemia` 작업공간 표시를 확인했다. 운영 환경의 실제 LLM 문서 생성과
Note 실연동은 아직 검증하지 않았다.
사용자가 승인한 과거 임시 인증 복사본 두 파일의 삭제는 자동 승인 검토가
거부하여 남아 있으며, 이 별도 정리를 완료로 표시하지 않는다.

## 실행 순서

1. 실행 환경·저장소·검사 명령과 API 명세를 고정한다.
2. Hub 원문 bundle 검증·고정과 35종 양식·예시 선택을 구현한다.
3. 실제 LLM adapter와 영속 SkillRun을 연결한다.
4. 문서 작성·국소 수정·검수, 독립 실행 반출·재연결을 완주한다.
5. 아이디어·기존 기능·요건·변경 묶음과 구현 작업·테스트를 연결한다.
6. revision·기준선·추적·변경 영향·검색·백업 복구를 검증한다.
7. 데스크톱·모바일 사용자 흐름과 요구별 실제 근거를 기록한다.

## goal 메시지

```text
github.com/pydemia/projects의 docs/planning을 기준으로 개인 중심 Projects
웹 앱의 MVP-A와 프로젝트 통합 MVP-B를 구현하고 검증한다.

APP-REQ-001~009를 유지한다. 아이디어를 요건화하고 기존 기능과 대조해
설계·구현 작업·회귀 테스트 변경안으로 연결한다. skills.pydemia.ai의
원문 bundle·필수 참조·revision·SHA-256을 검증·고정하고 LLM으로 문서의
작성·국소 수정·검수를 수행한다. 필수 7종과 산출물 35종의 양식·예시·
출처·확인 상태를 관리하며 작성 규칙과 참조 입력을 구분한다.

문서는 일반 파일로 독립 사용할 수 있어야 한다. 앱 밖 실행 묶음 반출,
외부 결과 diff·충돌 재연결과 동일 스킬·참조 이력을 지원한다. 저장·
revision 불변·선택 적용·개인 권한·작업 의존·테스트 이력·추적·변경 영향·
기준선·백업 복구를 구현한다.

실행 환경·명세 → resolver/참조 → SkillRun → 단일 문서/독립 사용 →
아이디어·기능·요건·변경 묶음 → 프로젝트 작업/검증 → 품질 확인 순으로
진행한다. React/TypeScript/Vite와 Python/FastAPI, 관계형 저장소로
시작하고 구체적인 개발 선택과 변경 이유를 기록한다.

관련 AC-01~15·17~29를 실제 제품의 검사에 연결한다. 새 환경의 설치·
실행·빌드와 데스크톱/모바일 핵심 흐름을 확인하고 요구별 충족·부분 충족·
미검증과 재개 정보를 남긴다. 자격증명 없는 실제 LLM·외부 서비스를
성공으로 가장하지 않고 가능한 구현·adapter 검증을 계속한다.

팀 협업·GitHub 자동 연동·Office 편집기·코드 실행 agent·외부 배포·merge는
후속 범위다. 지정되지 않은 시간·토큰 예산이나 외부 게시 권한을 추가하지 않는다.
```

## 개발 결정

- 기획 시안 A-02의 탐색·문서 중심 구성을 출발점으로 사용한다.
- 사용자 확정: 개발·테스트·구현 DB는 PostgreSQL을 사용한다.
  SQLite 대체 경로를 만들지 않으며 Docker Compose와 migration을 제공한다.
- 첫 개인 계정은 로컬 가입·세션으로 시작한다. 외부 공개 전에 OIDC·HTTPS·
  운영 정책을 검증한다. 서버는 기본 loopback에서 실행한다.
- LLM은 설정 가능한 adapter를 제공한다. 자격증명과 응답 본문을 기본 로그에
  남기지 않으며, 공급자 미설정 상태를 화면과 실행 기록에 표시한다.

## 작업 분담

주 에이전트가 API·영속 데이터·권한·worker·통합 검증을 담당한다.
software-engineering 및 codex-auto-model-router의 위임 지침에 따라
독립된 웹 클라이언트와 스킬 실행 모듈을 leaf agent에 맡긴다.
라우터의 생성 요청은 gpt-6.1-sol / max이며 주 에이전트 설정은 변경하지 않는다.
실제 실행 설정은 도구가 노출한 범위만 기록한다.
