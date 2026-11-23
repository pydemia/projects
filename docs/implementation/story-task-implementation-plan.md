# 기획·Story·Task 구현 실행 계획

최종 상태: [실행 기준표](story-task-goal.md) 전체 21/21(100%), 그중 AC-144~160
17/17을 구현·검증하고 운영 `15728ec5d0015de8`·schema0016에 반영했다.
[통합 검증](story-task-verification.md)과 [배포](deployment.md)의 최신 절을 따른다.
아래 0/17과 미검증 표기는 착수 시점의 기준선이며 최종 판정으로 읽지 않는다.

2026-11-09 · 전체 범위: [기획 21](../planning/21-planning-story-task-improvement.md),
APP-REQ-065~072 / **AC-144~160의 17개 조건을 동일 가중치**로 추적한다.
[공유 설계](story-task-design.md)가 Python/TS/LLM schema·API·DB·권한·반출 경계의 계약이다.
이 파일은 실행 순서와 수용 증거를 관리하며 설계 작성만으로 구현 완료를 선언하지 않는다.

현재 이 문서 작성 시점의 판정은 **0/17(0%) 검증 완료**다. 설계와 구현은 병렬 진행 중이다.
전체 완료 예상 범위는 17개 조건의 앱·PostgreSQL·웹·브라우저·호환/권한 검사 및 사용자 승인
범위의 운영 반영이다. 실제 완료 시각은 lineage 복구와 통합 검사 결과 이후 갱신한다.
현재 신뢰도는 중간이며 실제 Hub/LLM·실계정 인증 증거는 mock과 따로 기록한다.

## 1. 실행 원칙과 작업 경계

- 현재 사용자 결정·AGENTS.md와 기존 변경을 보존한다. 대량 미커밋 변경을 stash/reset/재작성하지 않는다.
- PostgreSQL만 사용한다. 통합 테스트는 무작위 전용 schema를 생성·정리한다.
- 운영 assistant-aware 0013을 먼저 정합화하고 새 공유 모델 0014·일정 0015를 순서대로 연결한다.
- worker별 파일 소유권을 고정하고 공유 domain/records/api·migration 통합은 주 에이전트가 관리한다.
- 앱 구현, mock/provider adapter, 실제 Hub, 실제 LLM, 실제 브라우저, 운영 검증을 별도 기록한다.
- Task/Story, 기획 초안, 관계, 선택 일정·기준선의 어느 하나도 남은 전체 범위를 축소하는 이유가 되지 않는다.

## 2. 의존 순서와 결과물

| 순서 | 작업·소유 경계 | 선행/제공 계약 | 완료 증거 |
|---|---|---|---|
| 1 | lineage: 운영 0013 assistant source·migration 대조 | 현재 backend 기능·schema·배포 보존; 신규 번호 확정 | 0013 원문/이력 대조, 기존 assistant 회귀 |
| 2 | 공유 설계와 수용표: 이 문서·story-task-design.md | full plan/AC144~160 → 공통 필드·API | 기획 전체 대조, 필드·route 일치 |
| 3 | Story core: domain/records/story API | 선택 필드·processing_state, 명시 검증, hash/stale, 별도 집계 | 실제 PG 상태/검증/legacy/revision/권한 검사 |
| 4 | planning core: 새 모델/0014·planning service/router | draft/proposal 독립 선택, 원자 적용·receipt·현재 ACL | 실패 무반영·재시도·stale/이동·재가입 검사 |
| 5 | 관계 core: records/관계 API·조회 | M:N·독립 객체, 역방향 relates_to 재사용 | 동시 중복·자기 연결·해제·depends_on 회귀 |
| 6 | Story/Task/기획 UI: 현재 React 컴포넌트·타입·route | 앞선 API; 기존 보기·필터·상세·재인증 checkpoint | TS/Vitest, 390px/desktop·키보드·권한 브라우저 |
| 7 | 선택 일정: schedules API/모델·0015·Roadmap UI | Epic/Phase/Milestone/Iteration 선택성, 현재 배정+이력 | 생성/미사용/공유·재배정·날짜 비전파 PG+UI |
| 8 | 일정 기준선: 별도 snapshot/비교·UI | 선택 Phase/Milestone 날짜 snapshot; Item baseline 독립 | 날짜 변경 전후·권한·불변 snapshot 검사 |
| 9 | archive/portable/이동·SkillRun 입력 결과 연결 | 모든 신규 이력·참조 provenance와 버전 호환 | 구버전 fixture·왕복·원본 권한 철회·move/undo |
| 10 | 통합 검증·리뷰·운영 반영 | 모든 AC와 검사 revision 대조 | 아래 명령·실제 브라우저·승인된 배포 결과 |

기존 SkillRun의 requirement 묶음 적용을 독립 선택으로 이미 충족했다고 취급하지 않는다.
AI 결과를 draft proposal로 변환할 때 새 Story·Task·Link·기존 수정에 안정된 후보 ID를
배정하고 원문 SkillRun을 보존한다. 결과의 중복/충돌/보류는 생성 기본 선택에서 제외한다.
빈/실패 결과와 취소는 미적용 상태로 남긴다.

## 3. AC별 구현·검사 기준

| AC | 구현에서 연결할 결과물 | 필요한 증거 | 현재 판정 |
|---|---|---|---|
| 144 | 생성 후 두 진입, 제목 Task quick create | 실제 생성→기획/Task 분기·최소입력 | 미검증 |
| 145 | 프로젝트와 draft 수명 분리 | 최초 기획 취소 후 프로젝트 존재·backlog 후보 없음 | 미검증 |
| 146 | 증분 제안·기존 수정 기본 해제 | 기존 완료/담당/일정/관계·ID/revision 전후 비교 | 미검증 |
| 147 | implements M:N·Story/Task 양쪽 조회 | T1↔S1/S2·독립 Task/빈 Story·distinct 집계 | 미검증 |
| 148 | relates_to 대칭/reverse reuse·해제 | 양쪽 조회·동시 역방향 생성·자기 연결·Task 보존 | 미검증 |
| 149 | 기존 Task depends_on gate | A 시작 성공·B 미완료 A Done 거부·순환 거부 | 미검증 |
| 150 | StoryVerification·현재 hash stale | Task 전체 Done 비자동 충족·AC 변경/이전 근거·재확인 | 미검증 |
| 151 | 두 backlog·다중 chips·기존 보기 | 필터/선택/전역·프로젝트 범위·개인 보기 회귀 | 미검증 |
| 152 | 별도 집계와 현재 접근 범위 | 공유 distinct·Story 충족 분리·숨은 ID/제목/수 비노출 | 미검증 |
| 153 | 선택 의존 검증·원자 transaction | 미선택 Story 참조 거부·Task-only·후반 실패 rollback | 미검증 |
| 154 | operation receipt·ACL/revision·checkpoint | 중복/다른 payload·409·철회/재가입·이동·401 자동 재전송 없음 | 미검증 |
| 155 | read-default·비파괴 migration·legacy links | 기존 ID/data/revision·검증/개인 보기 snapshot 대조 | 미검증 |
| 156 | Hub 원문·Note 경계·버전/출처 검사 | archive1/2/신규·portable·move/undo·actor/전체 원본 권한 | 미검증 |
| 157 | 선택 상위 일정·Iteration 이력 | 미사용 생성/완료·공유 Task 보존·재배정 후 Task 날짜 동일 | 미검증 |
| 158 | 일정 baseline 독립 snapshot·비교 | 변경 전후 날짜·Item baseline 분리·현재 재확인 표시 | 미검증 |
| 159 | SNB 동작 이동·legacy route | 예전 planning/itemRoute/북마크·로그인 return URL | 미검증 |
| 160 | 반응형/키보드·역할별 동작 | 390px/desktop 선택·취소·오류·receipt·뷰어/custom role 거부 | 미검증 |

각 조건은 구현 위치와 해당 revision의 실제 검사 결과를 기록한 뒤 완료로 바꾼다.
부분 구현·테스트 실패·실제 provider 미설정·미실행 browser는 ‘미검증/부분’으로 유지한다.
한 테스트가 여러 AC를 검증할 수 있으나 확인하지 않은 조건을 함께 통과로 표시하지 않는다.

## 4. 중요한 실패·경합 검사

기획 적용의 후반 후보에 권한/완료 gate/관계 오류를 넣어 앞선 생성도 rollback되는지 본다.
같은 actor+operation의 병렬 적용은 하나의 receipt/Item 집합만 남아야 한다. 다른 payload의
operation 재사용은 409다. 동일 draft를 서로 다른 operation으로 적용해도 두 번째 적용은
기존 receipt를 설명하거나 완료 상태 충돌로 막아야 한다.

preview 후 원본 수정, Task 이동, source_run 원본의 권한 철회, member 제거 후 재가입,
custom role 변경을 각각 수행한다. commit은 현재 잠금 뒤 권한·membership·revision을 다시
검사하고 업무 변경 없이 draft를 보존해야 한다. 401 checkpoint는 선택·원문을 복구하되
로그인 직후 POST/PATCH를 재전송하지 않는다.

relates_to A→B/B→A의 동시 요청, 다중 depends_on 후보로 닫히는 순환, 숨은 cross-project
대상을 포함한 summary/preview/export, 기존 역방향 중복 Link의 읽기/해제를 검사한다.
별도 임의 owner actor를 넣어 권한을 우회하지 못하는지 확인한다.

Story 충족 후 AC/기대 결과/포함·제외 범위를 각각 바꾸고 이전 검증 보존과 집계 제외를
확인한다. 제목·우선순위 수정은 근거를 삭제하지 않아야 한다. 상태 직접 수정으로 검증을
우회할 수 없어야 하며 Task 완료·재개/보류/제외가 연결 객체 상태에 전파되지 않아야 한다.

일정 미사용 Task도 기존 규칙으로 완료한다. 한 Task를 공유 Epic에 묶고 Iteration을 바꿔도
ID·기존 날짜·과거 배정이 유지되어야 한다. 일정 baseline 생성 후 날짜를 바꿔 snapshot이
불변이고 Item baseline과 구분되는지 확인한다.

## 5. 공통 검사와 기록

```powershell
docker compose up -d db
uv run projects migrate
uv run pytest
uv run ruff check src tests migrations
uv run ruff format --check src tests migrations
uv run mypy src/projects
npm --prefix web run check
npm --prefix web run build
```

실제 브라우저는 격리 PostgreSQL·실제 API를 사용한다. source-owned 공통 UI, light/dark,
승인 favicon과 기존 로그인/보기/초안/Task 완료 흐름도 변경 영향에 맞게 확인한다.
fixture나 모사 HTML의 성공은 실제 앱 AC 통과로 대체하지 않는다.

배포 전 운영 0013 assistant 기능·서버 설정·인증 비밀값을 보존한 이미지와 migration
lineage를 대조한다. migration 후 schema head·기존 데이터/assistant 회귀와 신규 API를
확인하고 공개 사이트에서 HTTP·브라우저 증거를 남긴다. 테스트·빌드·commit·배포·운영 확인을
각각 구분한다. 배포 실패 시 DB를 파괴적으로 되돌리지 않고 호환 가능한 앱 rollback과
추가 migration으로 복구한다.

최종 판정에는 17개 분모의 완료 수·진행률, 남은 실패/미검증, 실제 Hub/LLM·실계정/기기
한계와 검사 revision·운영 source를 기록한다. 이 문서 작성은 설계 artifact의 완료이며
구현·운영 완료를 대신하지 않는다.
