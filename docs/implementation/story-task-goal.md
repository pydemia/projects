# Story·Task와 반복 기획 실행 goal

2026-11-09 사용자의 설계·구현계획·구현 goal 및 subagent 지시에 따라 착수했다.
[기획 21](../planning/21-planning-story-task-improvement.md)의 APP-REQ-065~072와
AC-144~160 전체를 구현한다. 기존 운영 배포 권한을 유지하며 commit/push/PR은 추가하지 않는다.

## 기준표

아래 21개는 동일 가중치다. 구현과 해당 검증이 모두 끝나야 완료로 센다.
부분 구현·미검증·운영 대기는 분모를 줄이거나 완료로 세지 않는다.

| ID | 완료 조건 | 상태·증거 |
|---|---|---|
| ST-01 | 설계·계약·의존 순서와 요구사항 추적 | 완료; [설계](story-task-design.md)·[구현계획](story-task-implementation-plan.md), 전체 AC·실패/호환 계약 대조 |
| ST-02 | 운영 assistant 소스/schema0013 정합화·호환성 | 완료; [소스 정합성](story-task-runtime-lineage.md), 실제 PG assistant/Note 22개·정적 검사 |
| AC-144 | 제목으로 프로젝트 생성, 선택적 최초 기획·Task 우선 | 완료; 실제 Edge 최초 생성 분기·선택적 입력 |
| AC-145 | 최초 기획 취소 시 프로젝트 보존·후보 미집계 | 완료; 실제 PG·Edge 기획 취소와 프로젝트/목록 보존 |
| AC-146 | 진행 중 기획의 선택되지 않은 기존 자료 보존 | 완료; planning PG·UI 선택 적용과 실제 Edge 반복 기획 |
| AC-147 | Story–Task 다대다·독립 Task·Task 없는 Story | 완료; Story PG·실제 Edge 공유 Task/독립 생성·고유 집계 |
| AC-148 | 대칭 관련 관계·역방향 중복 방지·안전한 연결 해제 | 완료; PG 역방향 재사용·UI legacy 그룹/확인·삭제 범위 검사 |
| AC-149 | 의존 순환·완료 제한·시작 허용 | 완료; PG 시작 허용·완료 제한·순환 및 기획 최종 graph 검사 |
| AC-150 | 명시적 Story 검증·범위 변경 후 재확인 | 완료; PG·Edge 검증·scope 변경/되돌림, 독립 리뷰 재현 |
| AC-151 | Story/Task 목록·기존 보기·필터·프로젝트 기억 | 완료; 실제 Edge 목록/보드 공유 Task의 두 Story chip·4개 보기·프로젝트 기억 |
| AC-152 | 고유 Task 집계·Story 별도 집계·현재 권한 | 완료; PG 현재 ACL·고유 Task와 별도 Story 집계, Edge 공유 Task |
| AC-153 | 유효한 후보 선택과 원자적 적용·취소/오류 보존 | 완료; planning PG 16개·화면 10개·실제 Edge 선택/취소/적용 |
| AC-154 | 중복 재시도·revision/이동/권한/재로그인·초안 | 완료; PG 중복/409/이동/재가입·UI 동일 요청 retry, Edge 실제 401 재로그인과 초안 복원/무재전송 |
| AC-155 | legacy ID·revision·자료·개인 보기 보존 | 완료; 실제 migration·legacy schema1/2 archive 보존 및 기존 보기 회귀 |
| AC-156 | Hub·Note·ZIP/portable/이동·assistant 호환 | 완료; mock Hub/저장 SkillRun provenance·실제 PG Note/assistant·archive/transfer 회귀, 실제 외부 provider 별도 미검증 |
| AC-157 | 선택적 Epic/Phase/Milestone/Iteration·이력·날짜 보존 | 완료; 일정 PG 8개·화면 6개·Edge 배정/이력·Task 날짜 보존 |
| AC-158 | 일정 snapshot/기준선·현재 계획 차이·Item 기준선 분리 | 완료; PG·Edge snapshot 비교와 현재 접근 가능한 재확인 대상 |
| AC-159 | 기획 SNB 제거·진입 동작·기존 route/인증 복귀 | 완료; 새 탐색/자료 동작·웹 project context·Edge 과거 requirement route |
| AC-160 | 모바일/desktop/키보드·오류·권한 UI | 완료; 실제 Edge 1440×1000·390×844의 10개 흐름, viewer·키보드·빈 검증/근거 차단·runtime 오류 없음 |
| ST-20 | 전체 지정 검사·실제 PG/브라우저·독립 리뷰·수정 | 완료; [통합 검증](story-task-verification.md), 전체 PG 424개+후속 receipt 경합 18개·웹 277개·Edge 10개·정적/build·독립 리뷰 |
| ST-21 | private 백업·운영 이관·자료/자산/auth·최종 source 일치 | 완료; 운영 `15728ec5d0015de8`·schema0016, 기존 자료 fingerprint 동일·설정/assistant 보존·공개 16개 자산/인증·실제 Edge 4개 묶음·소스 대조 |

착수 기준 0/21 → 설계/소스 2/21 → 기능 검증 16/21 → 실제 브라우저 취합 후
**21/21(100%) 완료**다. 필수 잔여 작업은 없으며 완료 판정 신뢰도는 높다.
운영 image `pydemia-projects:story-15728ec5d0015de8`와 schema0016을 확인했다.
실제 외부 Hub/LLM 신규 호출·다른 Microsoft 실계정·물리 모바일 검사는
이 goal의 실제 PG/합성 provider/Edge 검증과 구분해 미검증으로 남긴다.

## 책임과 순서

- lineage worker: 실제 운영 소스만 수집·hash 확인, assistant 기능을 기존 dirty 소스에 병합.
- design worker: 데이터/API/실패·복구·호환 계약과 구현 순서 문서.
- Story core/UI workers: requirement 확장, 명시 검증, 관계·집계와 관리 화면.
- planning core/UI workers: 영속 초안·미리보기·선택 적용·재로그인 복원.
- schedules worker: 선택적 상위 계획과 독립적인 일정 snapshot.
- root: 메타데이터/라우터/화면 통합, 전체 회귀와 독립 검토 수용, 배포·최종 판정.

공유 파일의 소유권을 구분하며 worker는 재위임하지 않는다. 기존 미커밋 변경·첨부를
보존한다. PostgreSQL만 사용하고 실제 Hub/LLM·합성 인증·mock·실제 브라우저의 증거를 구분한다.
0013 assistant를 보존하고 새 migration은 0014 기획 → 0015 일정 → 0016 Story 검증 순이다.

AGENTS.md의 DB/pytest/Ruff/mypy·웹 check/build와 무작위 전용 PG schema 검증을 실행한다.
운영 배포 시 현재 mount/env/assistant principal·Caddy를 보존하고 private 백업과
기존 업무 자료 fingerprint 및 공개 정적 자산·인증 경계를 확인한다.
