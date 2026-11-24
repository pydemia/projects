# 기획·Story·Task 설계

2026-11-09 · 설계 계약. 구현·검사·운영 반영 상태는
[실행 계획](story-task-implementation-plan.md)과 최종 검증 기록에서 판정한다.

[기획 21](../planning/21-planning-story-task-improvement.md) 전체와
APP-REQ-065~072 / AC-144~160을 구현 대상으로 삼는다. 기획안의 1·2·3차는
의존 순서이며 선택적인 상위 일정과 일정 기준선을 완료 범위에서 제외하지 않는다.
현재 사용자 실행 지시가 이전 문서의 ‘구현 전’ 표기보다 우선한다.

## 1. 객체와 소유권

Story는 `Item.kind=requirement`의 표시 이름과 기능 확장이다. 별도 Story 복제본이나
새 Item 종류를 만들지 않는다. Task는 `kind=task`와 기존 personal/delivery workflow,
다섯 상태·완료 gate를 유지한다. 독립 Task와 Task 없는 Story는 정상 상태다.
2026-11-24 사용자가 선택한 부모 작업은 같은 프로젝트의 Task 간 `subtask_of`
관계로 저장한다. 하위 작업도 기존 Task 종류를 사용한다. Epic·Phase·Iteration의
연결은 선택 사항이다.
[작업 보기와 하위 작업](task-list-ux-benchmark.md)에 적용 범위를 기록한다.

Idea는 기획 원문, Feature는 확인한 현재 기능, Decision은 선택과 이유를 보존한다.
기획을 적용해도 프로젝트 목표·원문 Idea·현재 Feature를 암묵적으로 수정하지 않는다.
Projects는 업무 관계·SkillRun을 소유한다. 문서는
[Note 인계 경계](note-document-handoff.md)의 임시 Markdown과 참조 snapshot으로 제한한다.
GitHub Issue는 기존 URL 연결을 유지한다.

## 2. Story 데이터와 검증

기존 RequirementData 필드를 유지하고 다음 선택 필드를 추가한다. Python 검증,
TypeScript 타입·편집기와 LLM 결과 변환에서 이름과 enum을 일치시킨다.

| 필드 | 형식 | 의미 |
|---|---|---|
| `problem` | string, 기본 빈 문자열 | 현재 상태·해결할 문제 |
| `expected_outcome` | string, 기본 빈 문자열 | 기대 결과 |
| `scope` | string, 기본 빈 문자열 | 포함 범위 |
| `exclusions` | string, 기본 빈 문자열 | 제외 범위 |
| `processing_state` | nullable enum | 처리 상태 |
| `acceptance_criteria` | 기존 string 배열 | 현재 수용 조건 |

`processing_state`는 `raised`, `reviewing`, `planned`, `in_progress`, `verifying`,
`fulfilled`, `on_hold`, `excluded`다. 화면에서는 제기됨·검토 중·계획됨·진행 중·
검증 중·충족·보류·제외로 표시한다. 새 Story의 기본은 `raised`이며, 기존 데이터에
키가 없으면 `null`/미설정으로 읽는다. legacy Item을 조회하거나 migration을 실행하는
것만으로 data·revision을 다시 저장하지 않는다. Item.status의 draft/confirmed/archived,
category, disposition과 처리 상태는 독립이다. 상태 순서 통과는 강제하지 않는다.

`fulfilled` 진입은 명시적 검증 API를 사용한다. 일반 Item 수정으로 검증 근거 없는
신규 충족 판정을 만들 수 없다. 열린 Task의 존재는 검증 자체를 일괄 거부하는 조건이
아니며, 모든 Task가 Done이어도 자동 충족으로 바꾸지 않는다. 보류·제외 역시 Task를
취소하거나 재개하지 않는다.

검증은 append-only `StoryVerification`으로 남긴다. 논리 필드는 검증 ID, Item ID,
검증한 Item revision, 수용 범위 hash, 전체 근거, 조건별 결과, 검증자, 검증 시각이다.
조건별 결과는 `{criterion, passed, evidence}`이며 현재 수용 조건과 대응해야 한다.
전체 충족 판정은 적어도 한 개의 현재 수용 조건 전체의 통과와 명시 근거를 확인한다.
제목만으로 등록한 Story는 먼저 수용 조건을 보완한 뒤 충족을 확인한다. 미통과·부분
입력은 422로 반환하고 판정이나 Story를 변경하지 않는다. 이 API는 충족 검증 기록을
추가하며 별도의 실패 결과 기록 기능을 암묵적으로 추가하지 않는다.

수용 범위 hash는 `acceptance_criteria`, `expected_outcome`, `scope`, `exclusions`의
정규 JSON을 SHA-256한 값이다. 순서를 포함한 실제 내용 변경은 재확인 대상으로 본다.
제목·우선순위·단순 상태 변경으로 이전 근거를 삭제하지 않는다. 과거 충족 이후 hash가
달라지면 현재 상태와 별도로 `재확인 필요`를 반환하고 현재 충족 집계에서 제외한다.
AC를 되돌려도 과거 이력은 유지한다. 재확인은 현재 revision에 대한 새 검증을 추가한다.

| HTTP | 계약 |
|---|---|
| `GET /api/items/{id}/story-verifications` | 현재 읽기 권한으로 검증 이력 조회 |
| `POST /api/items/{id}/story-verifications` | `{expected_revision, evidence, criterion_results}`를 검증·저장하고 `{item, verification}` 반환 |
| 기존 Item GET/PUT | 같은 ID·revision 계약으로 Story 본문/필드 수정; 충족 진입은 위 검증 계약 유지 |

검증 쓰기는 `item.write`를 요구한다. Item과 현재 소속 프로젝트의 권한 잠금 후
expected_revision을 확인하고 검증 기록·처리 상태 revision을 같은 transaction에 저장한다.
검증자가 현재 접근권을 잃으면 과거 기록을 삭제하지 않으며 현재 actor의 읽기 범위를 적용한다.

## 3. 관계·집계

| 관계 | 저장·조회·변경 |
|---|---|
| Story 기여 | `Task → requirement`, `implements`; 양쪽 상세에서 M:N 조회 |
| 선행 | `후행 Task → 선행 Task`, `depends_on`; 자기 연결·순환 거부, 기존 Done gate 유지 |
| 관련 | API 이름 `relates_to`; 양쪽에 대칭 표시, 완료/시작/소유 의미 없음 |
| 검증 | Test case → Story/Task `verifies`; 기존 검증 revision·결과 유지 |

Story 전용 조작은 Task→requirement 방향을 생성한다. 일반 Link의 legacy 반대 방향이나
다른 용도 `implements`는 일괄 역전하지 않는다. 추적 화면에 원본 ID·방향·revision을 유지한다.

새 `relates_to`는 양쪽 방향을 모두 찾아 기존 링크를 재사용한다. 같은 unordered pair의
동시 생성은 공통 프로젝트 잠금 또는 pair 잠금으로 직렬화한다. legacy A→B/B→A가 둘 다
존재하면 표시만 한 쌍으로 묶고 저장 ID·review·revision은 남긴다. 해제는 실제 해제할
대표 링크와 범위를 표시하며 대상 Task를 삭제하지 않는다. legacy 두 저장 링크를 한 번에
해제하는 경우에는 두 ID를 명시한 원자 동작이어야 한다.

기본 검색 범위는 현재 프로젝트다. 명시적인 프로젝트 간 연결은 양쪽 현재 읽기와
`relation.write`를 요구한다. 현재 소속을 다시 확인한 뒤 생성/해제한다. 숨은 대상은
제목·ID·개수·후보 오류 상세로 노출하지 않는다. 미접근 참조가 있어 완료 불가한 경우에도
현재 기존 오류 정책에 따라 접근할 수 없는 참조라는 원인만 표시한다.

전체 Task 수는 접근 가능한 Task ID의 distinct 수다. Story별 Task 진행과 프로젝트 전체
Task 진행은 따로 집계한다. 공유 Task가 두 Story에 보여도 전체 Task는 하나다.
`Task 완료 수/전체 수`, `Story 현재 충족 수/전체 수`, `수용 조건 검증`은 독립된 지표다.
미설정·재확인 필요를 표시하고 단일 프로젝트 진행률로 합산하지 않는다.

## 4. 기획 초안과 API

최초 기획과 증분 기획은 같은 draft 모델의 `mode=initial|incremental`로 구분한다.
프로젝트 생성은 먼저 완료하며 기획 취소는 프로젝트를 삭제하지 않는다. 프로젝트 생성
직후 ‘지금 기획하기’와 ‘작업부터 시작’을 제공한다. 기존 프로젝트는 증분이 기본이다.
Story만, Task만, 기존 연결만 추가할 수 있다. 제목 한 줄 Task 생성은 기존 quick API를 쓴다.

기획은 반복 생성 가능하며 미적용 draft는 실제 Item/backlog 집계에 포함하지 않는다.
직접 작성과 SkillRun 결과는 같은 proposal 형태로 검토한다. 원문 의도·참고 선택은 draft에
보존하고 source_run_id가 있으면 원문 SkillRun·skills_lock·manifest를 그대로 참조한다.

| HTTP | 입력/결과 |
|---|---|
| `POST /api/projects/{id}/planning-drafts` | `{mode,intent,reference_ids,proposals,source_run_id?}` → draft |
| `GET /api/projects/{id}/planning-drafts` | 현재 actor가 읽을 수 있는 프로젝트 초안 |
| `GET /api/planning-drafts/{id}` | 현재 원본 전체의 접근권을 확인한 draft |
| `PATCH /api/planning-drafts/{id}` | `{expected_version,intent?,reference_ids?,proposals?,status?}` |
| `POST /api/planning-drafts/{id}/preview` | `{expected_version,selected_proposal_ids}` → 변경 diff·의존 오류·선택 결과 |
| `POST /api/planning-drafts/{id}/apply` | preview 입력 + `operation_id` → 적용 receipt |

draft의 status는 편집 중 `draft`, 명시 취소 `cancelled`, 적용 완료 상태를 구분한다.
닫기는 UI를 닫는 동작이며 취소 저장·입력 폐기와 구분한다. 취소·빈 선택·실패 결과는
업무 Item·Link·프로젝트 정보에 영향을 주지 않는다.

proposal은 다음 공통 형태를 쓴다.

```json
{
  "id": "draft-local-stable-id",
  "kind": "create_story",
  "title": "제목",
  "body": "본문",
  "data": {}
}
```

| `kind` | 추가 필드/선택 계약 |
|---|---|
| `create_story` | title/body/data; kind=requirement Item 생성 |
| `create_task` | title/body/data; 기존 workflow·완료 gate로 검증 |
| `link` | source/target/relation; endpoint는 기존 Item ID 또는 같은 draft의 proposal ID |
| `update_item` | item_id, 변경 title/body/data, 필요 시 명시 `reopen`; 기본 선택 해제 |

새 항목과 연결은 독립된 후보다. 선택하지 않은 새 Story를 참조하는 link는 오류이며
자동 선택하지 않는다. Task만 선택하고 해당 link를 해제하면 독립 Task가 된다.
기존 공통 Task를 연결할 때 Task를 복제하지 않는다. 기존 수정은 필드별 전/후, 영향
대상과 기준 revision을 표시한다. 완료 Task 재개는 `reopen`의 명시 선택과 기존 완료
전이 규칙을 적용한다. disposition duplicate/conflict/defer는 기본 생성 선택에서 제외하고
근거·Decision 기록을 별도 선택한다. AI 유사도만으로 병합/재사용을 확정하지 않는다.

참고·기존 수정·기존 link endpoint는 `{id, revision, project_id}` snapshot을 보존한다.
draft version과 Item revision은 다른 축이다. 전체 읽기는 별도 선택이며 기본으로 프로젝트
전체 snapshot을 수집하지 않는다. preview는 현재 접근권과 revision을 확인한 결과다.
성공한 preview는 이후 apply의 권한/내용 검사를 대체하지 않는다.

## 5. 적용 transaction·권한·재시도

적용 순서는 다음과 같다. 검증 오류는 업무 변경 전에 모두 발견해야 하며 DB 오류를
포함한 어느 실패도 부분 Item·Link·receipt를 남기지 않는다. 초안은 이전 상태로 보존한다.

1. actor·operation ID의 기존 receipt를 확인한다. 동일 payload hash이면 현재 읽기 권한을
   확인해 같은 결과를 반환한다. 다른 payload면 409다. 여러 기획은 서로 다른 operation ID다.
2. 초안/actor와 영향을 받는 프로젝트를 정해 기존 `lock_project_access`의 정렬 잠금을
   사용한다. source_run·원본·대상 전체 출처를 포함한다. 잠금 후 소속·현재 멤버십 ID·
   access fingerprint·현재 권한을 다시 읽는다. 제거 후 재가입도 이전 초안의 권한으로 간주하지 않는다.
3. draft expected_version, 모든 기존 원본의 현재 revision·프로젝트 소속, source_run의
   현재 가독성, 선택 후보 ID·종류·데이터·의존 선택을 검사한다. 이동·권한 철회·내용 변경은
   409/기존 비노출 정책으로 중단하고 초안을 재미리보기하도록 보존한다.
4. 변경별 실제 권한을 검사한다. Story·Decision·Idea 쓰기는 item.write, Task 생성은
   task.create, Task 수정은 task.update, 연결은 양쪽 relation.write다. AI 적용은 추가로
   run.apply를 요구한다. 실행 생성은 run.execute다. 기존 review Decision을 기록하는
   SkillRun 적용의 공통 item.write 요구를 우회하지 않는다. owner_id 대체 actor도 금지한다.
5. 기존 항목을 안정된 순서로 잠그고 필요한 선행 graph 잠금을 취한다. 선택된 전체
   depends_on graph의 순환과 Task 전이 gate를 검사한다. A 시작 자체는 차단하지 않는다.
6. 새 항목 생성 → 명시 기존 수정 → 링크 생성 → 감사 Decision/SkillRun 적용 이력 →
   draft 완료/버전 → receipt를 한 transaction에 기록한다. 생성 proposal ID→Item ID,
   변경 전/후 revision, 기존 재사용 Link ID와 적용 범위를 receipt에 보존한다.

UI는 더블 클릭 중 적용을 막고 불명확한 응답은 같은 operation ID로 receipt를 조회/명시
재시도할 수 있게 한다. 401 이후에는 로그인 복귀 URL·프로젝트·draft·선택을 복구하고
쓰기 요청을 자동 재전송하지 않는다. 재로그인 후 다시 preview하고 사용자가 적용한다.
실패를 성공 toast로 표시하거나 draft를 지우지 않는다. 적용 후 되돌림은 이력 있는 별도
보정이며 공유 Task를 자동 삭제하는 역연산을 만들지 않는다.

## 6. 선택적 상위 일정과 기준선

Epic·Phase·Milestone·Iteration은 별도 일정/묶음 객체로 저장한다. Item.kind의 확장이나
Task 필수 부모가 아니다. 공통 식별자·project_id·title·revision과 명시 예정 날짜를 가진다.
kind별 필드와 검증은 분리하고 실제 확인일·근거는 계획 날짜와 구분한다.

| 객체/관계 | 제약 |
|---|---|
| Epic membership | Story/Task와 0..N 연결; 같은 Task 복제 금지 |
| Phase/Milestone membership | 선택적 계획/보고 연결; 상태 gate 없음 |
| Iteration assignment | Task의 현재 배정은 0..1, 과거 배정은 append-only 이력 |
| 재배정 | expected revision과 현재 actor 권한으로 이전 배정 종료·새 배정 생성; 자동 이월 없음 |
| 날짜 | Iteration 기간과 Task.planned_date/due_date는 서로 덮어쓰지 않음 |
| Story 기여 Iteration | 관련 Task로 탐색; Story의 고정 부모 필드 없음 |

일정 기준선은 별도 `ScheduleBaseline`에 선택한 Phase/Milestone의 ID·revision·날짜
snapshot, 기준 시점·이름·변경 사유·actor를 불변 저장한다. 현재 날짜와 비교해 이전/현재,
변경 이유와 재확인 대상을 보여 준다. 기존 `Baseline.revisions`는 Item 내용 기준선으로
유지하며 일정 기준선으로 변환하거나 같은 집계에 섞지 않는다. 과거 일정 객체를 수정해도
snapshot을 갱신하지 않는다. 보이지 않는 일정/참조 제목·ID·개수는 비교에서도 노출하지 않는다.

일정 API는 프로젝트 하위 목록/생성, 객체 expected_revision 수정, membership/배정,
schedule-snapshots 생성/비교로 나눈다. 상위 계획 쓰기는 기존 project.update,
일정 snapshot 쓰기는 baseline.write를 실제
동작에 연결하며 Task 배정 변경은 task.update도 검사한다. 새 권한 체계를 암묵 추가하지 않는다.
구현 담당자가 확정한 경로·DTO는 이 문서와 클라이언트 타입에 함께 반영한다.

## 7. schema·기존 데이터·반출/이동

운영 assistant-aware migration 0013의 원문·lineage를 먼저 복원한다. 로컬 다음 번호로
0013을 덮어쓰거나 assistant runtime을 이전 backend로 교체하지 않는다. 신규 공유 테이블은
0014, 일정 테이블은 그 후 0015로 연결한다. 새 SQLAlchemy 선언 모듈은 기존 database
모델 정의 이후 import해 Base.metadata에 등록하며 순환 import를 회피한다.

마이그레이션은 기존 Item/Revision/Link/TestRun/TaskView ID·data·revision을 변경하지 않는다.
Story 기본 필드는 읽기 기본값과 신규 생성에만 적용한다. relates_to legacy 역방향 중복은
파괴적인 unique index 도입 전에 보존/표시 정책을 적용한다. 데이터 삭제로 제약을 맞추지 않는다.

project archive는 **schema 3**으로 반출하고 reader는 **1/2/3**을 허용한다. 최상위
`planning` extension에 Story 검증 이력·일정 객체·membership/배정 이력·일정 기준선과
관련 provenance를 둔다. 기존 data.json/manifest.json의 schema_version을 함께 3으로
설정하고 data.json hash를 갱신한다. 기존 schema 1/2와 portable manifest 1의 reader와
기존 필드 의미는 유지한다. 구버전 백업에 신규 필드/테이블이 없으면 빈 이력·미설정으로
복구하고 충족 근거를 만들어 내지 않는다. 신규 버전을 이해하지 못하는 구버전 프로그램은
오류를 명시해야 하며 이력을 조용히 누락한 ‘완전 복구’로 표시하지 않는다.
새 버전 writer와 기존 1/2 reader fixture를 함께 검사한다.

Story·공유 Task·관계·검증·일정 배정은 각 ID를 한 번만 반출한다. 관계 endpoint와 원본 출처를
보존하고 import의 명시 ID 매핑을 모든 신규 테이블에 적용한다. private draft·브라우저 선택·
재로그인 checkpoint는 공유 ZIP의 업무 데이터로 반출하지 않는다. import한 과거 receipt는
과거 provenance이며 현재 actor로 자동 재실행할 수 없다. 외부 actor 정보는 현재 계정 권한을
생성하지 않는 provenance로 남긴다. 특히 과거 verified_by를 importer로 바꾸어 importer가
검증한 것처럼 기록하지 않는다. 외부 검증은 원래 revision/hash·근거·검증자·시각·ID 매핑을
`ProjectArchiveReferences`의 planning extension에 역사 자료로 보존할 수 있다. 이 경우 현재
Story의 `fulfilled` 필드는 보존하되 현재 유효 검증으로 집계하지 않고 재확인 필요로 표시한다.
이전 proof가 없거나 현재 범위 hash와 다르면 동일하게 새 명시 검증이 필요하다. live 검증으로
복구할 때에도 remapped Item/revision/hash와 현재 적용 가능한 proof의 대응을 검사하고 외부
검증의 출처를 숨기지 않는다. Hub 원문·revision·hash와 원본 manifest를 유지하며 인증
파일·inline auth·키·서버 설정은 ZIP·API·로그·Git에 넣지 않는다.

portable/ZIP/receipt/초안 반출은 출력 항목만이 아니라 모든 원본의 현재 접근권과 소속을
잠금 후 재검사한다. Task 이동도 Story 연결·관련 source_run·일정 배정·공유 이력의
현재 양쪽 권한을 다시 확인한다. 이동해도 Task ID·Story 관계·과거 배정·검증 근거를 자동
삭제하지 않는다. Task 이동은 Story 자체를 옮기지 않으므로 StoryVerification의 소속을
Task와 함께 바꾸지 않는다. 프로젝트 한정 일정의 **현재 membership·Iteration 배정은
이동 transaction에서 종료**하고 reason=`task_transfer`와 이전 배정·시작/종료 시점·source
schedule을 이력/receipt로 남긴다. Task의 planned_date/due_date는 바꾸지 않는다. 같은
Task가 과거에 어떤 일정에 있었는지는 보존하되 현재 다른 프로젝트 일정에 속하는 것처럼
조회하지 않는다. 이동 취소로 복원할 때도 현재 일정/Task 양쪽 ACL과 revision·이후 배정
변경을 검사한다. 이동에 따른 membership 종료는 프로젝트 한정 선택 배정의 명시 이동
효과로 preview에 표시한다. source 일정 참조를 포함한 이력은 source 일정 프로젝트와 현재
Task 프로젝트를 모두 읽을 수 있는 actor에게만 반환한다. 그 외에는 해당 ID·제목·개수·
미리보기 영향 상세를 생략한다. 개인의 미적용 초안이나 private 적용 receipt를 이유로
다른 사용자의 Task 이동을 막거나 그 존재·개수를 알리지 않는다. 오래된 draft는
이동을 감지해 409로 재검토한다. 개인 저장
보기·필드·순서·기존 transfer/undo 계약은 유지한다.

## 8. 탐색·반응형·오류 상태

SNB는 개요/Story·요구사항/Task/임시 문서/테스트/추적·변경/스킬 작업과 설정으로 구성한다.
기획은 프로젝트 도구·Story·Task의 동작이다. 과거 `?view=planning&kind=requirement&item=...`는
같은 ID의 Story 상세로, idea/feature/decision은 개요 자료 상세로 연결한다. 관계 itemRoute,
SkillRun 결과·북마크와 로그인 복귀도 함께 처리한다. URL 정리 과정에서 선택 프로젝트·개인
보기·필터·Task 선택·초안·스크롤을 지우지 않는다.

390px와 desktop에서 후보의 종류·선택 의존성·기존 수정 전/후·오류·취소/보존·적용 결과를
구분한다. 키보드로 선택·오류 이동·닫기를 수행할 수 있게 하고 긴 미리보기의 본문 스크롤과
하단 동작 접근성을 유지한다. 기존 source-owned 공통 UI와 테마·승인 favicon을 사용한다.
뷰어는 읽기만, 사용자 지정 역할은 허용된 실제 동작만 제공하며 서버도 동일하게 거부한다.
