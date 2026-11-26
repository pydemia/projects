# 프로젝트 보관과 Phase 시작·종료 기획

2026-11-26 · 구현 기준 · Projects 종료·재개와 Phase 관리 상담 반영

프로젝트를 닫기 전 오너가 남은 Task를 확인하고 보관 여부를 결정한다. 프로젝트 안에서는 Phase별로 작업을 마무리하고, 다음 Phase에서 계속할 Task를 같은 작업으로 이어 간다.

## 프로젝트 보관·복원

프로젝트를 닫고 다시 열 때는 `멤버·권한`의 기존 보관(Archive)과 복원(Restore)을 사용한다.
오너가 보관하면 업무 자료가 읽기 전용이 된다. 오너가 복원하면 멤버는 각자의 권한에 따라
다시 업무 자료를 편집할 수 있다. [기존 보관·복원 계약](20-tenancy-and-project-permissions.md#확정-요구와-프로젝트-권한-구현-계약)

보관을 확정하기 전에 해당 프로젝트의 열린 Task를 안내한다. 열린 Task는 할 일, 진행 중,
검토 중 상태이며 Phase 연결 여부와 관계없이 Task 하나를 한 건으로 센다. 확인창에서
`미완료 Task 보기`를 선택하면 작업 목록으로 이동해 직접 작업을 처리할 수 있다.
`그대로 보관`을 선택하면 Task 상태와 Phase 연결·종료 기록을 보존한 채 기존 보관을 실행한다.
열린 Task가 0건이면 기존 보관 확인으로 진행한다. [현재 보관 확인창](../../web/src/ProjectAccessSettings.tsx#L250) · [현재 열린 작업 기준](../../src/projects/task_queries.py#L101)

## Phase 기간과 Task 연결

Phase는 프로젝트 안의 일정 구간이다. Phase마다 시작·종료 예정일을 관리하며,
시작·종료 처리 시 실제 전환 시점을 기록한다. 상태 흐름은 `시작 전 → 진행 중 → 종료`다.
Phase 전환은 사용자가 실행하며 예정일은 일정 계획에 사용한다. [기존 상위 일정 기획](21-planning-story-task-improvement.md#7-선택적인-waterfallagile-계획)

Task에서 같은 프로젝트의 Phase를 멀티셀렉트한다. 같은 Task가 `Phase 1`, `Phase 2`에 함께 표시되어도
ID, 담당자, 상태, 변경 이력은 하나의 Task에 귀속된다. Task는 Phase 지정 여부와 해당 Phase의
시작 여부와 관계없이 기존 작업 흐름에 따라 처리할 수 있다. [기존 일정 연결 동작](../../src/projects/schedules.py#L162)

## Phase 종료 시 Task 처리

Phase를 종료할 때 연결된 Task의 결과를 다음과 같이 기록한다. Task별 처리 결과는 Phase 종료 시점의 기록으로 남긴다.

| 결과 | 적용 기준 | 저장 결과 |
|---|---|---|
| **Completed** | Task의 완료 요건을 충족했다. | Task를 완료 상태로 기록하고 완료 실적에 반영한다. 작업 유형별 기존 완료 조건을 적용한다. |
| **Closed** | 미완료 Task를 종료하기로 했다. | 사유를 필수로 기록하고 Task를 닫는다. 집계에서는 `Closed`로 표시한다. |
| **Carryover** | 같은 Task를 다음 Phase에서 계속한다. | 기존 Phase 연결과 Task 상태를 보존하고 대상 Phase를 연결한다. 이미 연결된 대상 Phase는 그 연결을 사용한다. |

`Closed`는 Task 자체의 상태로, 해당 Task가 연결된 모든 Phase에 표시된다.
기존 `Cancelled` Task도 화면·필터·집계에서 `Closed`로 처리하며 당시 취소 사유와 변경 이력을 보존한다.
`Carryover`는 Phase 종료 결과로 기록하며, Task는 현재 상태로 계속 진행한다.
이후 대상 Phase에서 그 Task를 완료해도 앞 Phase의 종료 기록에는 `Carryover`와 당시 지정한
대상 Phase가 남는다. [현재 취소 사유 검증](../../src/projects/domain.py#L209)

## 다음 Phase의 시작 조건

1. 진행 중인 Phase를 종료할 때 Task별 결과와 종료 시점을 기록한다. 종료 화면에서 미처리 Task를
   확인하고 모든 연결 Task의 결과를 정한 뒤 종료를 확정한다.
2. 선행 Phase가 지정된 경우 해당 Phase가 종료된 뒤 다음 Phase를 시작할 수 있다.
   첫 Phase는 선행 Phase 없이 시작할 수 있다. 다음 Phase의 기간 설정과 Task 연결은
   시작 전에 할 수 있으므로 종료 시 `Carryover` 대상을 미리 지정할 수 있다.
3. 다음 Phase를 시작하면 선행 Phase의 종료 상태가 확정된다. 이후 선행 Phase는 계속 종료 상태로 표시된다.

Phase 1에서 `인증 검증`은 `Completed`, `제외된 보고서`는 사유를 남겨 `Closed`,
`성능 개선`은 Phase 2로 `Carryover` 처리할 수 있다. 오너가 프로젝트 자체를 보관할 때에는
열린 `성능 개선`을 안내받고 보관 여부를 정할 수 있다.

## 요구사항과 수용 조건

### 요구사항

| 요구 ID | 요구 | 근거 | 수용 조건 |
|---|---|---|---|
| APP-REQ-073 | 기존 프로젝트 보관·복원을 사용하고 보관 전 열린 Task를 안내한다. | 기존 Archive를 사용하며 미완료 처리 여부는 사용자 판단에 맡긴다는 결정. APP-REQ-061과 연결. | AC-161~164 |
| APP-REQ-074 | Phase의 기간을 관리하고 Task에 Phase를 여러 개 연결할 수 있다. | 기간과 관련 Task의 의미, 태그처럼 여러 Phase 선택. APP-REQ-071과 연결. | AC-165~166 |
| APP-REQ-075 | `Completed`와 `Closed`를 구분하고 `Cancelled`를 `Closed`로 통일한다. | 완료와 사유를 기록하는 종료의 의미 구분, 용어 통일 결정. | AC-167~168 |
| APP-REQ-076 | Phase 종료 시 Task별 결과를 저장하고 `Carryover`로 다음 Phase에 같은 Task를 이어 간다. | 세 결과 명칭과 연속 작업 관리 결정. | AC-169~170 |
| APP-REQ-077 | 선행 Phase의 종료 후 다음 Phase를 시작하며, 시작 뒤 선행 Phase의 종료 상태를 확정한다. | Phase 1 종료를 Phase 2 시작 조건으로 삼고, Phase 2 시작 후 Phase 1 재개를 허용하지 않는다는 결정. | AC-171~173 |

### 수용 조건

| ID | 확인 상황 | 관찰할 결과 |
|---|---|---|
| AC-161 | 오너가 프로젝트를 보관하고 복원한다. 별도로 오너가 아닌 멤버가 같은 작업을 시도한다. | 오너의 기존 보관·복원이 성공하고, 업무 화면에서 읽기 전용과 역할별 편집 가능 상태가 각각 확인된다. 다른 멤버의 시도에는 기존 오너 권한 제한이 적용된다. |
| AC-162 | 열린 Task 두 개와 `Completed`, `Closed` Task가 있는 프로젝트에서 보관 확인을 연다. 열린 Task 하나는 Phase 두 개에 속한다. | 미완료 안내에는 해당 프로젝트의 열린 Task 두 개를 표시한다. 보관 확인만 열면 프로젝트와 Task의 상태가 유지된다. |
| AC-163 | 오너가 미완료 안내에서 `미완료 Task 보기` 또는 `그대로 보관`을 선택한다. | `미완료 Task 보기`로 이동하면 프로젝트는 활성 상태여서 Task를 직접 처리할 수 있다. `그대로 보관`은 열린 Task가 있어도 성공하며 보관 직전 Task 상태와 Phase 연결·종료 기록을 보존한다. |
| AC-164 | 열린 Task가 0건인 프로젝트에서 보관을 요청한다. | 기존 보관 확인으로 진행하고 오너가 보관을 확정할 수 있다. |
| AC-165 | 날짜가 다른 Phase 1과 Phase 2를 만든 뒤 동일한 Task에 두 Phase를 선택한다. | 두 Phase의 기간과 두 연결이 다시 조회된다. 어느 쪽에서 열어도 Task ID와 이력이 같고 Task 수정 내용이 두 Phase에서 확인된다. |
| AC-166 | Phase를 지정하지 않은 Task와 시작 전 Phase에 연결된 Task를 각각 만들고 완료한다. | 두 경우 모두 해당 작업 유형의 기존 생성·완료 절차를 수행할 수 있다. |
| AC-167 | 완료 조건을 충족한 Task를 `Completed`로 처리하고, 두 Phase에 연결된 미완료 Task를 `Closed`로 처리한다. `Closed`에 빈 사유도 제출한다. | 완료 실적에는 `Completed`만 반영된다. 사유를 입력해 종료한 Task는 두 Phase에서 `Closed`로 표시된다. 빈 사유를 제출하면 입력 오류가 표시되고 Task 상태가 유지된다. |
| AC-168 | `Cancelled` 상태와 취소 사유가 저장된 기존 Task를 연다. | 화면과 필터·집계에는 `Closed`로 표시되며 기존 사유와 상태 변경 이력을 조회할 수 있다. |
| AC-169 | 종료 대상 Phase에 처리 방향이 결정되지 않은 Task가 있다. 모든 연결 Task의 결과를 정한 뒤 다시 종료한다. | 최초 시도에는 확인이 필요한 Task가 표시되고 Phase는 진행 중이다. 모든 결과를 정한 뒤에는 Phase 종료 시점과 Task별 결과가 저장된다. |
| AC-170 | Phase 1의 진행 중 Task를 Phase 2로 `Carryover`한 뒤 Phase 2에서 해당 Task를 완료한다. Phase 2에 미리 연결된 Task에도 같은 흐름을 수행한다. | 이월 직후 같은 ID와 진행 상태로 두 Phase에 각각 한 번 연결된다. 이후 Task가 `Completed`가 되어도 Phase 1의 종료 기록은 `Carryover` 및 대상 `Phase 2`를 보여 준다. |
| AC-171 | 선행 Phase가 없는 첫 Phase를 시작한다. 별도로 예정일이 지난 시작 전 Phase를 조회한다. | 첫 Phase의 실제 시작이 기록된다. 예정일만 경과한 Phase는 사용자가 시작하기 전까지 `시작 전`으로 표시된다. |
| AC-172 | Phase 1이 진행 중일 때 Phase 2 시작을 시도한다. Phase 1 종료 후 같은 요청을 다시 한다. | 최초 시도에는 Phase 1의 종료가 필요하다는 안내를 받고 Phase 2는 시작 전 상태를 유지한다. Phase 1 종료 후의 시도에서는 Phase 2가 진행 중으로 전환된다. |
| AC-173 | Phase 2를 시작한 뒤 앞서 종료한 Phase 1을 다시 열려고 한다. Phase 2가 종료된 뒤 같은 시도를 한다. | 두 시도 모두 Phase 1의 종료 상태, 종료 시점, Task별 종료 결과가 유지된다. |

## 구현 판단

- 모든 연결 Task의 결과를 확인한 뒤 Phase를 닫는 상세안을 적용했다.
- 기존 상위 일정 편집 권한 `project.update`로 선행 Phase를 지정할 수 있다. 시작한 Phase는
  설정된 선행 관계를 유지한다.
- 다음 Phase가 시작되기 전까지 종료 Phase를 재개할 수 있다. 이전 종료 건은 일정 변경 이력에
  남기고, Task의 Phase 연결은 이월 시점에 확정한 분류로 보존한다.

기존 권한 계약과 일정 연결은 저장소 코드와 검증 기록을 참고했다.
[프로젝트 권한 검증 기록](../implementation/project-access-goal.md) · [기존 일정 연결 검사](../../tests/test_schedules.py#L30)

실행과 확인 결과는 [구현 검증](../implementation/verification.md#2026-11-26-프로젝트-보관과-phase-시작종료)에 기록했다.
