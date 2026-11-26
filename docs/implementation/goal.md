# Projects 구현 goal

## 2026-11-26 · 프로젝트 보관과 Phase 시작·종료

[기획 22](../planning/22-project-archive-and-phase-lifecycle.md)의
APP-REQ-073~077과 AC-161~173을 구현한다. 기존 Archive·Restore에 보관 전 열린
Task 안내를 붙이고, 상위 일정에서 Phase 기간·선행 관계·시작/종료와 Task 멀티셀렉트를
관리한다. 기존 Task 종료 사유와 과거 revision을 보존해 `Closed`로 통일한다.

기준 커밋 `43add50f7a1f`에서 `codex/project-archive-phase-lifecycle` worktree로
구현했다. 상세 기획의 Task별 종료 결과 확인 절차를 적용한다. 종료 Phase의 재개는 후속
Phase가 처음 시작하기 전까지 허용하며, 재개할 때 이전 종료 기록과 Task 연결을 보존한다.
Phase 작업은 기존 일정 편집 권한 `project.update`를 적용한다.
확인 결과는 [검증 기록](verification.md#2026-11-26-프로젝트-보관과-phase-시작종료)에 연결한다.

## 2026-11-24 · 작업 보기와 하위 작업

ClickUp 공개 List view를 REA로 관찰하고 사용자가 승인한 세 시안을
전체 작업·프로젝트 작업 화면에 적용했다. 목록, 칸반 보드, 그래프,
캘린더, 집계 사이를 전환할 수 있다. 전체 작업의 프로젝트 선택과 보기
설정을 개인 보기로 저장한다. 같은 프로젝트의 부모·하위 작업 관계는
목록의 들여쓰기와 그래프의 연결선으로 표시한다.
[벤치마크와 검증 기록](task-list-ux-benchmark.md)에 적용 결정과 검증 범위를 남긴다.

## 2026-11-09 후속 수정 · 선택 checkbox와 상태점 메뉴

최신 사용자 요청의 목록 UI는 원형 상태점+드롭다운으로 수정해 운영
`b313610cb90a73bc`에 반영했다. 선택 checkbox와 완료 조작을 구분하고
기존 권한·완료 gate·schema0016·assistant/업무 자료를 보존했다.
웹 279개·실제 Edge 5개 흐름과 공개 자산/인증 검증을 통과했다.
아래 Story/Task goal의 21/21 완료 기록은 그 구현 당시의 revision 이력이다.

## 2026-11-09 실행 중 · Story·Task와 반복 기획

최신 사용자 goal의 범위·진행률은 [실행 기준표](story-task-goal.md)를 따른다.
APP-REQ-065~072 / AC-144~160과 설계·운영 정합성·통합 검증·배포의
동일 가중치 21개를 구현한다. 기존 구현 완료 기록은 아래에 보존한다.

운영 `15728ec5d0015de8`·schema0016에 반영하고 전체 회귀·실제 Edge·자료 보존·
공개 자산/인증 검증까지 마쳐 **21/21(100%) 완료**다. [검증 기록](story-task-verification.md)을 따른다.


## 2026-11-09 구현 전 기획 · 최초/진행 중 기획과 Story·Task

사용자가 요청한 [기획 21](../planning/21-planning-story-task-improvement.md)을 작성했다.
기획은 최초 프로젝트 구성과 진행 중 기능·개선의 변경분 추가로 정의한다.
Story/Task 다대다·독립 Task·유연한 관련/선행 관계·별도 검증/집계와 선택적인
상위 일정을 제안했다. APP-REQ-065~072 / AC-144~160을 추적한다.
현재는 문서/모사 시안 단계이며 새 실행 goal 생성, 앱 구현·DB 이관·운영 배포를
수행하지 않았다. 이후 구현 지시는 이 기획의 확정 요구·권장 세부안·미결정을 구분해 따른다.

## 2026-11-09 추가 수정 · 로그인 화면 공간 활용

APP-REQ-064 / AC-142~143: 로그인 화면을 상단 기준으로 배치하고 로고/테마
헤더를 묶었다. 넓은 화면은 안내/로그인의 두 열을 넓히고, 모바일은 한 열로
본문 너비를 활용한다. 짧은 화면의 스크롤과 기존 테마·홈·인증 흐름을 보존한다.
웹 247개·build/favicon, 실제 Edge 7개 로그인 배치/짧은 화면과 기존 startup
5개 checkpoint를 통과했다. frontend source `7721890b4eeda52b`를 기존
assistant-aware runtime에 반영했다. 운영 판정은 [검증](verification.md)·[배포](deployment.md)를 따른다.

## 2026-11-09 추가 수정 · 테두리 없는 홈 컨트롤

APP-REQ-062 / AC-138 후속 피드백에 따라 홈 링크를 버튼 형태로 다듬었다.
밑줄·상시 테두리를 제거하고 hover/누름 배경·클릭 영역·선택 방지를 적용했다.
홈 이동과 키보드 포커스는 유지한다. `startup.css` 한 파일을 바꿨으며 기존
assistant-aware runtime 위에 frontend만 배포했다. 검사·운영 근거는
[검증](verification.md)과 [배포](deployment.md)의 최신 절을 따른다.

## 2026-11-08 추가 구현 · 홈 이동과 초기 로딩

APP-REQ-062~063 / AC-138~141: SNB 위 엠블럼·제목을 프로젝트 목록의 홈 링크로
연결하고 상세/필터/hash를 정리한다. HTML에 초기 로딩 화면을 제공하며 앱 모듈과
API 응답 전에 표시한다. 세션·프로젝트 목록/내용 요청 중에는 React 스켈레톤으로
이어간다. 기존 프로젝트 기억·CSP·인증·권한·favicon을 보존한다.
웹 검사 247개·host/Linux build·격리 PostgreSQL+실제 Edge 5개 checkpoint를 통과했다.
현재 source `3f5f287a22895e64`의 운영 반영 판정은 [검증](verification.md)과
[배포](deployment.md)의 최신 절을 따른다. 아래 16개 기준의 완료는 이전 권한 goal 기록이다.
기존 assistant-aware backend/schema 0013·설정을 보존한 frontend layer를 운영에
반영했고 공개 Edge 검증을 마쳤다. 이번 추가 요청의 구현·검증·배포는 완료했다.

## 최신 구현 goal · 프로젝트별 멤버·역할·허용 동작

2026-11-07 사용자 구현 goal과 subagent 사용 지시에 따라
[프로젝트 권한 실행 기준표](project-access-goal.md)의 PG-01~16을 실행한다.
권한 있는 프로젝트만 목록/검색/집계에서 보고 프로젝트마다 다른 역할과
허용 동작을 설정한다. 기존 자료 이관·모든 서버 경계·UI·회귀·운영 배포까지
포함한다. 아래 설계 단계의 미구현 기록은 착수 당시의 상태이며 진행률과
현재 결과는 실행 기준표·검증·배포 기록을 따른다. 운영 `986e0a1af12655bb`와
schema 0012에 반영했고 기존 자료를 보존했다. 공개 로그인 진입·초대 토큰 보존과
API 인증·운영 자산까지 실제 브라우저로 확인했다. 다른 Microsoft 실계정의
승인 이후 조작은 합성 프록시/격리 DB 계정 검사와 구분해 미검증으로 남긴다.
동일 가중치 PG-01~16의 구현·검증·운영 조건을 모두 충족해 **16/16(100%) 완료**다.

## 착수 전 설계 결정 · 프로젝트별 멤버·권한

2026-11-07 후속 사용자 결정: 로그인 대상은 `pydemia.ai` 조직 계정이며 업무
테넌시·멤버십·역할·가능한 동작은 프로젝트 단위다. APP-REQ-061 / AC-133~137의
[기획·설계 20](../planning/20-tenancy-and-project-permissions.md)을 이 기준으로
갱신했다. 권한 있는 프로젝트만 목록·검색·집계에서 보이고 프로젝트마다 다른
역할을 설정한다. 기존 Workspace 역할 상속 제안은 대체한다. 설계 당시 운영
`47b682394f07d58d`에는 owner 격리와 인증 수정만 있으며 프로젝트 멤버·역할
구현 완료로 표시하지 않는다. 이번 후속 변경은 설계 문서 갱신이고 앱/DB는 바꾸지 않았다.

## 최근 추가 요청 · 로그인 500과 인증 멀티테넌시

2026-11-07 APP-REQ-059~061 / AC-129~134: 운영 프록시의 email 클레임 의존
실패를 재현하고, 공통 허용 조직 정책·프록시 검증 헤더와 tenant+subject
계정 연결을 구현·검증하고 운영 `47b682394f07d58d`에 배포했다. 당시 프로젝트 멤버·역할별 기능은 없었으므로
[기획·설계 20](../planning/20-tenancy-and-project-permissions.md)로 구체화한다.
기존 owner 격리를 유지하며 프로젝트 공유 구현으로 확대하지 않는다. 실제 앱 등록은
AzureADMyOrg이고, 후속 결정으로 현재 pydemia.ai 조직 로그인을 유지한다.
검사·운영 상태는 [검증](verification.md)과 [배포](deployment.md)의 최신 절을 따른다.

## 최근 추가 구현 · 작업 제목 너비

2026-11-03 APP-REQ-058 / AC-126~128: 제목이 열 전체를 사용하도록 intrinsic
너비를 보완하고 데스크톱 최소 제목 폭을 확보해 검증·운영 배포했다. 기존 모바일·편집·drag·속성은
유지한다. [기획 18](../planning/18-inline-editing-and-preferences.md),
[검증](verification.md), [배포](deployment.md)의 최신 증거를 따른다.

## 최근 추가 구현 · 시간대와 날짜/시간 UI 구분

2026-11-03 APP-REQ-057 / AC-121~125: UTC 시각의 IANA 시간대 표시와 raw T/offset
생략, 날짜/시간의 별도 요소·CSS gap을 구현·검증하고 운영에 배포했다. 기존 형식과 날짜 전용 값을
보존한다. 재인증 회귀에서 재현한 응답 이후 commit 문제도 응답 전 확정으로
보완한다. [기획 18](../planning/18-inline-editing-and-preferences.md),
[검증](verification.md), [배포](deployment.md)의 최신 증거를 따른다.

## 최근 추가 구현 · 날짜·시간 표시 형식

2026-11-03 APP-REQ-056 / AC-116~120을 구현·검증하고 운영에 배포했다. 사용자 설정에서 날짜/시간 preset 또는
직접 입력 형식을 미리 보고 적용한다. 브라우저 저장·다른 탭 반영, 기본/사용자
날짜·이력 표시를 연결한다. ISO 날짜·기존 시간대·정렬/필터와 API/DB를 보존한다.
[기획 18](../planning/18-inline-editing-and-preferences.md), [검증](verification.md),
[배포](deployment.md)에서 현재 변경의 결과를 확인한다.

## 최근 추가 구현 · 로그인 만료 후 원래 화면 복귀

2026-11-03 사용자 요청에 따라 [기획 19](../planning/19-session-expiry-and-return.md)의
APP-REQ-055 / AC-110~115를 구현·검증하고 운영에 배포했다. 로그인한 API의 401을 checkpoint·모드별
재로그인·전체 URL 복귀로 연결한다. 초안·계정·revision을 보존하고 자동 저장
재전송과 반복 이동을 차단한다. PostgreSQL·인증 정책·Hub/Note 책임 경계는 유지한다.
[검증](verification.md)과 [배포](deployment.md)의 최신 증거로 완료를 판정한다.

## 최근 추가 구현 · 직접 편집·사용자 설정·프로젝트 메뉴

2026-11-03 최신 사용자 지시에 따라 [기획 18](../planning/18-inline-editing-and-preferences.md)의
APP-REQ-050~054 / AC-97~109를 구현·검증하고 운영에 배포했다. 프로젝트명·작업
제목/본문/속성/유형을 선택해 수정하며 초안·충돌·완료 gate를 보존한다.
테마는 설정 화면에, ZIP은 프로젝트 메뉴에 두고 좁은 GNB와 검색 여백을 보완한다.
과거 ‘유형은 생성 후 불변’ 결정은 명시 유형 전환으로 보완했으며 일반 PUT
우회는 거부한다. [검증](verification.md)과 [배포/rollback](deployment.md)을 따른다.

## 최근 추가 구현 · 입력 간소화·필드·보기 관리

2026-11-02 사용자 피드백으로 [기획 17](../planning/17-clickup-task-management.md)의
APP-REQ-045~048 / AC-85~94를 구현·검증하고 운영에 배포했다. 제목 한 줄 생성,
행 내 필드 편집, 다섯 타입 사용자 필드·열/카드 속성 관리, 이름 있는 개인 보기를
제공한다. 기존 완료 gate·프로젝트 선택·모바일 직접 전환·가로 칸반을 유지한다.
[실행 증거](verification.md)와 [운영/rollback](deployment.md)을 따른다.

## 최근 완료 goal · 작업 탐색·보기 전환·프로젝트 이동

2026-11-02 사용자 구현 지시. [P-02 기획](../planning/16-clickup-task-discovery-and-transfer.md)의
APP-REQ-038~044 / AC-73~84를 [실행 기준표](task-workspace-v2-goal.md)에 따라
구현·검증했다. 전역 작업 탐색, 첫 화면 가시성, 독립된 범위/표시/밀도 전환,
개인 저장 보기/URL/초안 복원, 관계·이력을 보존하는 단일·일괄 프로젝트 이동,
Note 문서 참조를 포함한다. 아래 과거 goal의 완료 기록을 신규 요구에
소급하지 않는다. PostgreSQL·개인 권한·Hub 원문·Note 책임 경계를 유지한다.
같은 날 추가 피드백의 보기 전환 제한·프로젝트 선택 유실·모드 선택 표시를
수정하고 운영에 배포했다. 최신 상태는 [검증 기록](verification.md)과
[배포 기록](deployment.md), [QA 안내](task-workspace-v2-qa.md)를 따른다.

진행률 기준은 AC-73~84의 동일 가중 12개 조건이며 실제 앱 구현과 필요한
검증이 완료된 조건만 분자에 넣는다. 배포·병합은 이번 구현 지시의 완료
분모와 구별한다. 기존 기획/시안 파일과 무관한 첨부 자료는 보존한다.

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
