# Projects 작업 관리 기획안

작성일: 2026-11-09  
대상: projects.pydemia.ai / `pydemia/projects`  
상태: 대화에서 합의한 방향과 구현 제안을 정리한 인계 문서

## 1. 배경과 목적

Project의 큰 일정은 Waterfall 방식의 단계와 주요 완료 시점으로 관리하고, 실제 구현은 Agile의 backlog와 반복 계획을 사용해 유연하게 진행한다. User Story와 Task를 기본 관리 요소로 두되, 단계·Iteration·Epic을 모든 항목에 강제하지 않는다.

이 문서는 기획과 후속 구현의 입력이다. 기재된 제안은 아직 앱에 적용되거나 운영 환경에서 검증된 사실을 뜻하지 않는다. 예시의 aftersum 항목·상태·일정은 이해를 돕기 위한 가상 데이터다.

### 사용자 요청과 확정된 방향

- 현재 상태, 문제 제기, 기대 결과, 요구사항을 기록하고 처리 현황을 확인한다.
- User Story와 실행 Task를 각각 관리하고 서로 연결한다.
- 전체 Task backlog와 요구사항 처리 현황을 각각 제공한다.
- 작업끼리 관계를 유연하게 연결한다. Task를 고정된 상하위 유형으로 나누거나 단일 부모를 강제하지 않는다.
- `depends_on`은 선행관계, `related_to`는 선후관계와 무관한 폭넓은 연관관계로 정의한다.
- Story와 Task를 다대다로 연결하고, Story에 연결되지 않은 독립 Task도 허용한다.
- Epic은 관련 Story나 작업을 묶어 볼 필요가 있을 때 선택적으로 사용한다.
- 큰 일정은 Phase·Milestone으로, 구현은 backlog 및 선택적인 Iteration으로 관리한다.
- 사용자 합의와 마지막 피드백은 이전 제안보다 우선한다. 특히 기존에 제안된 단일 부모·Parent–Child 계층 추가는 채택하지 않는다.

## 2. 기존 제품과의 연결

2026-11-09 대화 중 확인한 저장소 `main`은 commit `f0a11c768bb169ece77ff2f79e50b235321824db`다. 아래는 그 시점의 코드·문서에 근거한 관찰이며, 현재 운영 사이트와 이후 변경분의 상태를 보증하지 않는다. 구현 전 최신 branch·운영 상태·기존 요구사항을 다시 확인한다.

- `Item`에는 `idea`, `feature`, `requirement`, `artifact`, `task`, `test_case`, `decision`이 있다.
- 기존 관계에는 `source`, `implements`, `verifies`, `depends_on`, `relates_to`가 있다. `depends_on`은 Task 간 관계로 검사하며 순환을 허용하지 않는다.
- 기존 구현은 선행 Task가 완료되지 않으면 후행 Task의 완료를 제한한다. 작업 시작을 자동 차단하는 것으로 해석하지 않는다.
- Task에는 `personal`과 `delivery` workflow가 있다. 기존 delivery의 수용 조건·결과 근거·필요한 테스트/commit 확인과 personal의 간편 완료를 보존한다.
- 작업 목록·보드·캘린더·집계 및 개인 저장 보기, Task revision과 수동 순서에 관한 구현 기록이 있다. 일부는 로컬 구현과 운영 배포·검증 상태가 다르므로 최신 근거를 확인한다.
- 기존 baseline은 Item ID와 revision의 snapshot이다. 일정 비교용 baseline 기능이 이미 있다는 의미는 아니다.
- GitHub Issue는 현 단계에서 URL 연결 범위다. 외부 상태 읽기나 양방향 동기화가 구현됐다고 가정하지 않는다.
- 문서 본문은 Note 연계 전 임시 Markdown 범위를 따르며, Projects가 업무 관계와 SkillRun을 소유한다.

참조: [저장소 README](https://github.com/pydemia/projects/blob/main/README.md), [작업공간 구현 계획](https://github.com/pydemia/projects/blob/main/docs/implementation/task-workspace.md), [아이디어 요건화 기획](https://github.com/pydemia/projects/blob/main/docs/planning/07-idea-to-implementation.md), [도메인 모델](https://github.com/pydemia/projects/blob/main/src/projects/domain.py).

## 3. 핵심 요소

| 요소 | 역할 | 필수 여부 |
|---|---|---|
| Project | 제품 또는 지속적으로 관리하는 작업 영역 | 작업의 소속 |
| User Story / Requirement | 문제·기대 결과·수용 조건과 처리 현황 | 필요할 때 생성 |
| Task | 조사·설계·구현·검증·운영 등 수행할 일 | 필요할 때 생성 |
| Epic | 함께 추진하거나 보고할 Story·작업의 선택적 묶음 | 선택 |
| Phase | 큰 일정상의 단계 | 선택 |
| Milestone | 주요 결과나 확인 시점 | 선택 |
| Iteration | 일정 기간에 선택한 작업 묶음 | 선택 |

### Idea, Feature, User Story의 역할

- **Idea**: 원래 메모와 제안·문제 제기. 후속 검토의 원문과 출처를 보존한다.
- **Feature**: 제품에 존재하는 안정적인 기능과 확인된 현재 동작.
- **User Story / Requirement**: 해결할 문제, 기대 결과, 범위와 수용 조건.
- **Task**: Story 해결과 운영에 필요한 실제 활동. 관련 Story 없이 존재할 수 있다.

Story는 사용자 요구뿐 아니라 문제, 기능 개선, 기술·품질 요구도 표현한다. 모든 항목을 억지로 “사용자로서 …하고 싶다” 형식으로 변환하지 않는다. 관찰된 현재 동작, 확정 요구, 가정과 제안은 구분한다.

**구현 제안:** 기존 `requirement`를 확장해 화면에서 User Story / 요구사항으로 제공하는 방안을 우선 검토한다. 기존 항목을 복제하거나 일괄적으로 확정 요구로 바꾸지 않는다. 최종 명칭·분류와 기존 데이터 표현은 현행 모델을 확인한 뒤 정한다.

## 4. 관계 모델

### 4.1 Story와 Task

- 하나의 Story에 여러 Task를 연결할 수 있다.
- 하나의 Task가 여러 Story에 기여할 수 있다.
- Story에 연결되지 않은 Task와 Task가 아직 없는 Story도 허용한다.
- Story에서 관련 Task를, Task에서 관련 Story를 각각 확인한다.
- 기존 `implements` 관계의 방향·의미·추적 동작을 조사해 재사용을 우선 검토한다. 재사용이 부적합하면 기존 이력과 호환되는 확장안을 설계한다.

### 4.2 Task 간 관계

| 관계 | 의미 | 방향과 표시 | 동작 |
|---|---|---|---|
| `depends_on` | 다른 Task가 선행되어야 함 | A가 B에 의존하면 A → B. B에서는 A가 자신에 의존한다고 표시 | 기존 완료 제한과 순환 검사 유지 |
| `related_to` | 선후관계와 무관하게 참고하거나 함께 볼 관련 작업 | 사용자는 양쪽 Task에서 대칭적인 연관으로 확인 | 자동 선후관계·완료 제한 없음 |

`related_to`는 같은 기능의 세부 작업, 공통 구성요소, 유사한 문제 등 폭넓은 연관에 사용한다. 특정 Task를 중심으로 관련 작업을 모아 볼 수 있지만, 이 관계만으로 포함·소유·부모–자식 의미를 추론하지 않는다.

저장소에서 `relates_to`가 방향성 링크로 저장되는지와 기존 자료를 먼저 확인한다. 사용자에게 양쪽에서 동일하게 보이도록 조회·표시하는 방안을 우선 검토하며 기존 링크를 임의로 재작성하거나 중복 생성하지 않는다. 자기 관계, 같은 쌍의 중복, 삭제·수정, 권한과 revision의 구체적 동작은 기존 계약을 확인한 뒤 정의한다.

Task를 세분화하더라도 각각 독립 Task로 생성한다. 단일 부모, 고정된 Subtask 유형이나 새 Parent–Child 관계를 기본으로 도입하지 않는다. 관계의 더 세밀한 의미가 실제로 필요해지면 별도 검토한다.

### 4.3 Epic

Epic은 함께 추진하거나 현황을 볼 큰 목표를 선택적으로 표현한다. Epic이 없는 Story와 Task도 생성·조회·완료할 수 있어야 한다. 여러 Story가 공통 Task를 공유할 때 Epic 소속 때문에 연결이 제한되거나 작업이 중복되어서는 안 된다. Epic의 구체적인 소속·다중 묶음 방식은 기존 제품 모델과 함께 설계한다.

## 5. 상태와 완료

### Story 상태 제안

`제기됨 → 검토 중 → 계획됨 → 진행 중 → 검증 중 → 충족`, 필요 시 `보류`와 `제외`.

필요한 정보는 현재 상태·문제, 기대 결과, 적용 범위, 수용 조건, 관련 Feature·Task, 검증 근거, 미정 사항과 변경 이력이다. 처음부터 모든 필드를 필수로 요구하지 않는다. 기존 requirement의 상태·분류와 새 표현을 비교하고 이관 정책을 정한다.

연결된 Task가 모두 Done이어도 수용 조건의 검증이 끝나지 않았다면 Story를 자동으로 충족 처리하지 않는다. 요구사항 변경 시 기존 검증이 여전히 유효한지 확인할 수 있어야 한다.

### Task 상태

기존 `todo → in_progress → in_review → done`과 `cancelled`를 기준으로 기존 상태·행동을 유지한다. Blocked는 우선 상태와 별개의 표시로 제안한다. `depends_on` 미완료에 따른 완료 제한을 설명할 수 있어야 한다. 시작 차단, 알림 또는 자동 상태 전이는 별도 합의 없이 추가하지 않는다.

## 6. 계획과 실행

### Waterfall 성격의 상위 계획

- Phase는 요구 검토, 설계, 구현, 통합 검증, 배포처럼 프로젝트의 큰 일정과 산출물을 표시한다.
- Milestone은 예를 들어 MVP 범위 확인, 설계 검토 완료, MVP 검증 완료 같은 주요 시점이다.
- 실제 선행조건이 있는 곳에만 의존성을 지정한다.
- Milestone 표시는 자동 승인이나 실제 검증 완료를 의미하지 않는다. 공식 확인이 필요한 경우 관련 결정과 근거를 기록한다.
- Phase는 일정의 관점이며, Task 관계나 Story의 필수 부모가 아니다.

### Agile 성격의 실행

- 우선순위가 높은 Story를 검토하고 필요한 Task를 backlog에서 선택한다.
- Iteration은 일정 기간의 작업 묶음이며 선택 사항이다. 고정 Sprint 없이 Kanban으로도 운영할 수 있다.
- 각 Iteration에서 조사·설계·구현·검증을 필요한 만큼 반복한다.
- 완료되지 않은 Task는 사용자 판단에 따라 다음 Iteration으로 재배정한다.
- 시작 예정일, 마감일과 Iteration은 다른 개념으로 관리하고 서로를 임의로 덮어쓰지 않는다.

### 일정 기준선

Phase·Milestone의 계획 날짜와 사용자가 선택한 시점의 snapshot을 비교하는 기능을 후속으로 제안한다. 현재 날짜와 baseline 날짜를 구분하며, 일정 변경 이유는 필요한 경우 기록한다. 기존 Item revision baseline과 일정 baseline의 범위를 구분한다.

## 7. 화면과 보기

같은 데이터의 필터·보기로 구성하고, 목록마다 작업을 복사하지 않는다. 기존 간편/정교 모드, Today·Inbox·예정, GTD·ABC, 개인 작업과 저장 보기의 기존 계약을 보존한다.

| 화면 | 목적 | 주요 내용 |
|---|---|---|
| Project Overview | 전체 흐름 확인 | 현재 Phase, 다음 Milestone, Story 현황, 현재 작업과 미해결 사항 |
| User Stories | 요구사항 처리 현황 | 문제·기대 결과·상태·수용 조건·관련 Task·검증 상태 |
| Tasks | 전체 실행 backlog | 독립 Task를 포함한 목록·보드·캘린더, 상태·우선순위·관련 Story |
| 관련 작업 보기 | Task 관계 탐색 | 선택 Task를 중심으로 `depends_on` 방향과 `related_to` 연결 표시 |
| Iteration | 반복 실행 계획 | 현재 주기와 작업, 완료·미완료 항목. Iteration 미사용도 허용 |
| Roadmap | 상위 계획 | Phase·Milestone·Iteration의 기간과 현재 일정; 후속으로 일정 baseline 비교 |
| Trace / 검증 현황 | 요구 충족 확인 | Story–Task–테스트·검증 근거 및 revision 변경 영향 |

요구사항 목록에서 관련 Task 없음, 수용 조건 미정, Task 완료 후 Story 미검증 등을 확인할 수 있게 한다. 전체 backlog에는 Story·Epic·Iteration이 없는 Task도 표시한다. 관계 탐색에서 관련 Task를 그룹으로 보여 주더라도 고정 계층이나 선후관계로 오해하게 하지 않는다.

Overview에서 Task 완료 수와 Story 충족 수는 별도로 표시한다. 서로 다른 항목 수를 임의의 단일 진행률로 합치지 않는다.

## 8. 사용 예시

**Project:** aftersum  
**선택적 Epic:** 알림 기반 지출 기록

**Story S1 — 카드 결제 알림을 지출 내역으로 등록**

- 현재 상태: 사용자가 알림을 보고 직접 지출을 입력한다.
- 기대 결과: 추출된 금액과 가맹점을 확인·수정한 뒤 저장한다.
- 수용 조건: 지원 대상으로 정한 알림 예시에서 결과를 확인하고 저장할 수 있다.
- 처리 상태: 진행 중.

**연결된 Task**

- T1. Android 알림 수집 기반 구현.
- T2. 카드사 알림 형식 조사.
- T3. 카드 결제 정보 추출 구현.
- T4. 금액 추출.
- T5. 가맹점 추출.
- T6. 확인 및 저장 화면 구현.

T1은 추후 송금 알림 Story에도 연결할 수 있다. T3·T4·T5는 `related_to`로 연결해 함께 볼 수 있으며, 그 자체가 부모–자식이나 선후관계를 뜻하지 않는다. T3이 완료되기 전에 T2가 선행돼야 한다면 T3 `depends_on` T2를 별도로 설정한다. T1~T6이 완료되어도 S1의 수용 조건은 별도로 확인한다.

상위 일정은 요구 검토·MVP 개발·통합 검증 Milestone으로 계획하고, 구현 Task는 여러 Iteration에 나누어 수행할 수 있다. 이 구성과 일정은 설명을 위한 예시다.

## 9. 단계적 구현 제안

### 1차: Story·Task·관계와 두 목록

- 기존 requirement와 Story 표현을 연결하고 중복 없는 목록·상세를 제공한다.
- Story–Task 다대다 관계와 양방향 조회를 제공한다.
- Task 간 `depends_on`과 `related_to`의 의미·방향을 UI에서 구분한다.
- 독립 Task를 포함한 전체 backlog와 Story 처리 현황을 제공한다.
- 기존 personal/delivery 완료 규칙, 권한·revision과 저장된 보기를 유지한다.

**수용 예시:** 하나의 Task를 두 Story에 연결하고, Story가 없는 Task와 관련 Task를 각각 등록했을 때 두 목록에서 누락 없이 확인한다. `related_to`는 완료를 제한하지 않으며 `depends_on`은 기존 완료 제한과 순환 검사를 유지한다.

### 2차: 상위 계획과 반복 실행

- 선택적 Epic·Phase·Milestone·Iteration을 제공한다.
- Overview와 기본 Roadmap을 제공한다.
- 미완료 Task는 사용자 판단으로 다음 Iteration에 배정한다.

**수용 예시:** Epic 없이 Story와 Task를 운영하고, 하나의 Milestone을 향해 여러 Iteration을 계획할 수 있다.

### 3차: 일정 기준선과 변경 영향

- 일정 snapshot과 현재 일정 비교.
- Story 변경 시 관련 Task와 검증 근거의 재확인 표시.
- 계획 변경 이력과 필요 시 사유 기록.

**수용 예시:** 수용 조건이나 Milestone 날짜 변경 후 이전 기준과 현재 값, 재확인 대상이 구분된다.

## 10. 구현 전 확인·호환성

- 최신 저장소와 운영 배포 상태를 먼저 확인한다. 이 문서의 과거 commit을 현재 기준으로 간주하지 않는다.
- 기존 requirement·task·link·revision·test run·baseline의 ID와 이력을 보존한다.
- PostgreSQL migration과 API 계약, 프로젝트별 소유권, `expected_revision` 충돌 처리, 데이터 반출·복구 및 기존 ZIP과의 호환을 검토한다.
- `related_to`의 양방향 표시는 기존 저장 방식과 데이터 중복 여부를 확인한 후 설계한다.
- 같은 Task의 다중 Story 연결과 링크 revision 변경에 따른 추적·검증 재확인 동작을 검사한다.
- 기존 delivery 완료 gate 및 personal 작업의 간편 완료를 우회하거나 일괄 변경하지 않는다.
- 문서는 기존 Note 연계 범위와 충돌하지 않게 한다. GitHub 동기화는 별도 연동 계약이 필요하며 이 문서의 적용 범위로 자동 확대하지 않는다.
- 데이터 모델·화면·상태별 수용 조건과 단계별 검증 계획은 기존 요구사항 문서와 ID 체계를 확인한 후 연결한다.

## 11. 참고한 서비스와 적용 관점

Jira, GitHub Issues, GitLab, Linear, Azure Boards, YouTrack, ClickUp, Asana의 작업 유형과 관리 방식을 비교했다. Jira식 Epic → Story → Task 계층을 그대로 강제하기보다, GitHub·Linear 등의 Issue 관계 및 ClickUp 등의 여러 보기에서 필요한 관점을 참고했다. 각 서비스의 실제 유형·요금제·기능 차이를 Projects의 구현 완료 사실로 취급하지 않는다.

사용자의 최종 선택은 **유연한 relation 중심**이며, 비교 과정에서 논의한 고정 Task 계층보다 우선한다.
