# 작업 탐색·보기 전환·프로젝트 이동 실행

후속 사용자 지시로 2026-11-02 운영 배포와 [QA 샘플 생성](task-workspace-v2-qa.md)을
완료했다. 아래는 로컬 구현 실행의 기록이며 운영 API·인증 경로 검증과 인증 후
UI 미확인 경계는 [배포 기록](deployment.md)을 따른다.

2026-11-02 · 사용자 구현 지시 · 기준 P-02 · 상태: 로컬 구현·검증 완료

기준은 [기획 16](../planning/16-clickup-task-discovery-and-transfer.md)의
APP-REQ-038~044 / AC-73~84다. 같은 조건을 mock 통과와 앱 통과로 중복
집계하지 않는다. 구현·실제 PostgreSQL/API·웹 검사·로컬 브라우저와
실제 Note/Hub/LLM·운영 검증을 구별한다.

## 전체 수용 조건과 현재 근거

동일 가중 12개, 전체 진행률 **100% (로컬 검증 완료 12/12)**. 기획 시안은
분자에 포함하지 않았다. Note의 이번 범위는 문서 참조이며 실서비스 본문
조회·서버 간 권한 위임은 아래 미검증 경계로 남긴다.

| AC | 결과 | 상태·근거 |
|---|---|---|
| 73 | 전역 작업 조회·소속·검색·권한 | 충족. task_queries.py·test_task_discovery.py·실제 전역 목록. 서버 페이지/건수/변경 감지·GTD 정렬 후 페이지 적용 |
| 74 | 첫 작업 가시성·정확한 빈 상태 | 충족. 실제 1440×900 간편/정교 첫 행, 빈 결과·과거 계획/오늘 그룹 회귀 |
| 75 | 동일 ID·필드·이력의 프로젝트 이동 | 충족. transfer 통합·HTTP·실제 브라우저 이동/새 조회/되돌리기 |
| 76 | 관계·완료 gate·테스트·SkillRun·기준선·ZIP 보존 | 충족. TestRun/SHA gate·review_ready 적용 거부·소속 revision 동등성·독립 ZIP 복원/누락 근거 차단·TaskContext 출처 표시 |
| 77 | 충돌·권한·멱등·실패·조건부 되돌리기 | 충족. PostgreSQL 동시 재요청 1개 이벤트/revision, preview 변경·활성 실행 거부, 4xx/성공 불명 분리·operation 회복 |
| 78 | 숨은 선택을 밝히는 원자적 일괄 이동 | 충족. 서버 전체 거부·최대100, 웹 blocker 검사와 실제 UI 2개 이동/undo |
| 79 | 모바일·키보드·초점·뒤로 복귀 | 충족. 공통 Dialog/선택기·메뉴 대체, 웹 조작 검사, 실제 Edge 320~430px·모바일 완료·상세 닫기 초점 복귀. 물리 기기/스크린리더 미검증 |
| 80 | Note 참조·revision/hash·실패 경계 | 참조 범위 충족. URL·소유자·충돌·미확인 상태, 실제 UI 참조 생성 후 이동/undo에도 revision/hash 보존. Note 본문/권한 위임 미검증 |
| 81 | 범위·표시·밀도 독립 전환 | 충족. 전역/프로젝트 네 표시 방식×간단/상세. 같은 ID/초안/필터 유지. 전역 집계형은 전체 페이지 조회 |
| 82 | 개인 저장 보기·legacy/URL 복원 | 충족. v1/v2·전역/프로젝트 기본 분리, dirty/명시 복원·q= remount·프로젝트별 메모리 회귀 |
| 83 | 정렬·날짜 없음·기간 밖·snapshot 표현 | 충족. 목록 GTD→보드 수동→목록 GTD, 달력 월/날짜 기준·날짜 없음/다른 기간, 현재 snapshot |
| 84 | 전환의 초안·선택·초점/문맥 보존 | 충족. mounted editor·초안·숨은 선택·보기별 작업 anchor, 실제 전환/뒤로/닫기 초점 복귀와 모션 감소 규칙. 픽셀 단위 위치 동일성은 보장하지 않음 |

로컬 실행 범위의 잔여 작업은 없다. 실제 Note 위임, 물리 기기·스크린리더,
운영 배포/Entra의 완료 시점은 이번 실행으로 산정하지 않는다.

## 작업과 쓰기 소유권

software-engineering/개발 절차와 실행 goal의 위임 지침에 따라 leaf 작업을
배분했다. 모델 라우터의 실제 생성 요청은 gpt-6.1-sol / low이며 주 에이전트
설정은 변경하지 않았다. 라우터 추천 모델과 실제 생성 요청을 혼동하지 않는다.

- 주 에이전트: 전체 기준·API 조립, 전역 조회/저장 보기, Note 참조, 통합
  검사와 요구별 판정. src/projects/api.py, schemas.py, 전역 조회/참조 모듈,
  관련 새 테스트와 문서를 소유한다.
- 이동 leaf: database.py, migration, transfer 모듈/요청 모델, records.py,
  portable.py/jobs.py의 필요한 보존 규칙과 이동 회귀 테스트를 소유한다.
- 웹 leaf: 기존 TaskWorkspace/App/hooks/models/api와 필요한 웹 기능
  컴포넌트·스타일·테스트를 소유한다. 공통 registry 원문은 보존한다.

공유 API는 주 에이전트가 통합하고 migration·전체 검사는 순서대로 실행한다.
기존 수정·첨부를 무단 stash/폐기하지 않는다. 새로운 Git 게시나 운영 변경은
현재 실행의 로컬 구현 완료와 구분한다.

## 검증 명령

AGENTS.md의 `docker compose up -d db`, `uv run projects migrate`,
`uv run pytest`, Ruff check/format, mypy와 웹 check/build를 실행한다.
통합 테스트는 임의 이름의 전용 PostgreSQL schema를 생성·정리한다.
새 schema의 실제 API/브라우저에서 두 프로젝트·관계·초안·뷰 복원과 이동을
확인한다. 실제 외부 호출을 수행하지 않은 경로를 성공으로 판정하지 않는다.

## 실제 실행 결과

- `docker compose up -d db`, `uv run projects migrate` 성공. migration 0008은
  기존 보기를 유지하며 전역 보기·이동 이력·외부 snapshot을 추가한다.
  자료가 있는 schema의 단순 downgrade는 이력을 삭제하지 않고 거부한다.
- `uv run pytest` **223개 통과**. 무작위 전용 PostgreSQL schema만 정리했다.
  same-owner 교차 관계 허용·타 사용자 거부, 동시성, 독립 ZIP/legacy v1,
  Note 필드 이전의 원본 revision 보존을 검사했다.
- Ruff check/format, `uv run mypy src/projects` 통과.
- 웹 check **57개 통과**, build와 favicon SVG·10개 PNG·ICO 검사 통과.
- `uv run python scripts/verify-mobile-browser.py verify-task-discovery-browser.cjs`
  성공. 실제 앱+격리 DB에서 전역/정교 첫 행, 초안/뒤로 가기, 달력 누락,
  단일/2개 일괄 이동·undo 후 DB 소속, Note 참조, 모바일 완료/복귀·폭을
  확인했다. light/dark, SVG/ICO HTTP Content-Type·bytes/hash도 확인했다.
- 앱 이미지: [전역](screenshots/task-discovery/global-desktop.png),
  [Dark](screenshots/task-discovery/global-dark.png),
  [보드·초안](screenshots/task-discovery/board-draft.png),
  [이동](screenshots/task-discovery/transfer-preview.png),
  [모바일](screenshots/task-discovery/mobile-list.png). 자료는 QA용이다.

## Note·외부 실행과 API 범위

Note 소스에서 실제 주소 `https://note.pydemia.ai/#/page/{id}`와 SHA-256
revision 형식을 확인했다. private proxy 신원·`x-note-client:web`/origin
검사는 Projects 서버의 위임 자격이 아니다. 이번 기능은 Note 자체 로그인으로
열 수 있는 참조와 선택 revision/hash를 보관한다. 권한·문서 존재·가용성·본문은
항상 `unverified`로 표시한다. 임의 URL fetch나 읽기 성공을 가장하지 않는다.
TaskData·revision·SkillRun snapshot/ZIP에 같은 참조가 유지된다.

주요 API는 `/api/tasks`, 전역/프로젝트 `task-views`,
`/api/task-transfers/preview`, `/api/task-transfers`, 단일
`/api/items/{id}/transfer`, operation 조회·조건부 undo와
`/api/items/{id}/note-references`, `/api/items/{id}/task-context`다.
단일/일괄 이동은 공통 `{tasks:[{id,expected_revision}],target_project_id,
target_list_name?,preview_token,operation_id}`를 받는다. 보기 v2는
`mode`, 표시 `view`, 독립 `task_scope`, `calendar_date_field`, 선택
`layout_sorts`를 사용하며 기존 요청/보기·ZIP v1을 계속 읽는다.

위 검사는 최초 로컬 구현 시점의 결과다. 이후 운영 배포·QA 샘플 생성은
[배포 기록](deployment.md)과 [QA 안내](task-workspace-v2-qa.md), 추가 사용자
피드백의 회귀 검사는 [검증 기록](verification.md)을 따른다. 실제 Hub·LLM 신규
호출, Note 본문 읽기/쓰기·신원 위임과 Git 게시는 이번 범위에 포함하지 않는다.
