# ClickUp 개선 기획의 스킬 적용·검토 기록

2026-11-02 · 기획 P-01 → P-02 · 대상: [기획 16](16-clickup-task-discovery-and-transfer.md)

이번 작업은 개선 기획 검토·구체화다. 앱 구현·운영 반영은 미착수다.
사용자가 명시한 작업 이동·가시성·자연스러운 보기 전환을 기준으로 기존
APP-REQ-037, Note 연계 경계, PostgreSQL·Hub 원문 보존 조건을 대조했다.
제안 APP-REQ-038~044 / AC-73~84의 번호와 기준본 편입 전 상태를 유지했다.

## skills.pydemia.ai에서 읽고 적용한 내용

모두 `library`의 **Skills surface**에서 검색·본문 조회했다. 공통 source revision은
`0e701b6ba104a846354b3d69a65fc51bf6082960`이다. 각 원문의 SHA-256과 URL은
[manifest](16-clickup-skill-manifest.json)에 보존한다. 이 기록은 스킬의 로컬
설치나 앱 내부 SkillRun 실행을 뜻하지 않는다.

| 스킬 | P-02에 실제 적용한 기준 |
|---|---|
| [product-ui-ux-design](https://skills.pydemia.ai/skills/product-ui-ux-design) | 현재 UI·상태를 먼저 확인하고 범위/표시/정보량, 목록→상세, 모바일·초점·빈 상태와 실제 공통 source 인계를 정의 |
| [product-planning-with-ui](https://skills.pydemia.ai/skills/product-planning-with-ui) | 기능 계약과 배치 계약을 연결하고 같은 가상 데이터의 동작 가능한 HTML 시안·실제 렌더링 이미지 제공 |
| [reverse-engineer-anything](https://skills.pydemia.ai/skills/reverse-engineer-anything) | 과거 정적 REA Evidence, 로그인 브라우저 관찰, 공식 문서와 Projects 설계 제안을 구별. 저장소 소스 읽기를 REA 실행이라고 부르지 않음 |
| [requirements-authoring](https://skills.pydemia.ai/skills/requirements-authoring) | 사용자 확정·추천 기본값·기존 제약을 구별하고 날짜·초안·선택·멱등 실패의 관찰 가능한 수용 조건 보완 |
| [requirements-verification](https://skills.pydemia.ai/skills/requirements-verification) | 기획 반영/시안 일부 검증/앱 미착수/운영 미검증을 요구별로 구별 |
| [visual-grouping](https://skills.pydemia.ai/skills/visual-grouping) | 범위와 표시 도구줄, 비교 가능한 작업 행, 독립 편집 상세, 이동 확인의 조작 경계를 정의. 실제 로컬 core/UI reference hash가 원격 manifest와 일치함을 확인 |
| [persona-cross-review](https://skills.pydemia.ai/skills/persona-cross-review) | 업무 사용자·구현 통합·데이터 검증의 실패 조건과 반증으로 순차 검토. 같은 주 에이전트의 관점 검토이며 독립 persona agent 검토로 계산하지 않음 |

원격 `read_content(path=...)`는 이번 호출에서 본문을 다시 반환했으므로 참조를
원격으로 읽었다고 기록하지 않는다. visual-grouping 참조 2개는 이미 설치된
로컬 파일을 실제로 읽고 원격 resource hash와 대조했다. 모델 라우터 helper는
`local / router-unavailable:RouterArgumentError`를 반환하여 위임하지 않았다.
이를 모델 변경이나 독립 검토 성공으로 계산하지 않는다.

## 근거와 반증을 대조한 수정

| ID·관점 | P-01의 빈틈·실패 조건 | 기존 보호 장치/반증 | P-02 판정·수정 |
|---|---|---|---|
| R-01 업무 | `모든 작업`이 날짜 범위인지 완료 포함인지 모호 | 기존 정교 목록은 상태 필터를 가짐 | 채택. 날짜 범위와 상태 필터를 독립 정의하고 열림 기본·완료 탐색 경로 명시 |
| R-02 업무 | 지난 계획일·오늘 마감·Inbox가 겹치면 중복 또는 누락 가능 | 이미 과거 계획 누락을 발견했으나 날짜 우선순위가 없음 | 채택. Asia/Seoul 기준 날짜, 오늘 3개 그룹의 우선순위, 예정/Inbox 중첩과 전체 목록 경로 정의 |
| R-03 UX | 모든 조합 독립 지원과 전역 목록 우선 출시의 모순 | 전역 보드 미지원 안내 제안은 존재 | 채택. 단계별 지원 표와 소속 전환 예외, 프로젝트별 복원 명시 |
| R-04 UX | 표시 변경 때 정렬/날짜 기준이 달라져 작업이 사라져 보임 | 날짜 없음 영역만 있었음 | 채택. 표시별 정렬 복원, 캘린더 1회 배치·다른 기간/날짜 없음 합계, snapshot 집계 명시 |
| R-05 통합 | savedView 비동기 로드가 URL 변경분을 덮어쓸 수 있음 | 현재 `appliedSavedId`는 같은 ID 반복 적용 일부만 막음 | 채택. 로드→URL override→기본값 순서와 세대/취소, versioned 변환·replace 정의 |
| R-06 UX | 초안이 있는 이동·범위 밖 다중 선택의 실행 대상 모호 | 기존 session draft와 숨은 선택 안내 일부 존재 | 채택. 초안 저장/저장 버전 이동/취소, 조건 밖 상세 유지, 소속별 선택 묶음 계약 추가 |
| R-07 데이터 | preview 뒤 관계·실행이 생기면 오래된 영향으로 이동 확정 | 트랜잭션·expected_revision 제안만으로 관계 추가 감지 보장 없음 | 채택. preview 지문과 commit 재검사, 원자적 bulk, 시간 초과의 operation 결과 회복 정의 |
| R-08 데이터 | 이동이 revision을 올리면 `is_stale`이 모든 관계를 낡았다고 판정 | 현재 `is_stale`은 양 끝 revision 단순 비교 | 채택. 소속 이동만의 내용 동등성 판정, 원래 링크 revision/검토 이력 보존. 일반 수정·동시성·LLM 적용에는 완화 금지 |
| R-09 통합 | 완료된 `review_ready` SkillRun을 이동 후 원 프로젝트에 적용할 위험 | `jobs.apply_result`는 target expected_revision을 검사함 | 일부 채택. 보호 장치를 유지하며 이동 후 미적용 결과는 읽기만 제공·대상에서 재실행. target 없는 과거 실행이나 snapshot 원문은 이동하지 않음 |
| R-10 데이터 | 테스트·원 프로젝트 삭제·독립 ZIP 복구에서 관계 유실 가능 | 기존 같은 프로젝트 FK는 이동 자체를 막음 | 채택. case revision/SHA 근거, 교차 의존 조회·순환 검사, 삭제 거부와 외부 참조가 누락된 독립 복구 기준 인계 |
| R-11 업무 | 전역 빠른 생성이 첫 프로젝트에 조용히 저장될 수 있음 | 현재 생성 API는 projectId를 필수로 받음 | 채택. UI에서도 소속 명시·기본 날짜 공개·필터 밖 생성 결과 열기 정의 |
| R-12 범위 | 전역 Note 검색·문서 편집까지 넓히면 권한과 제품 책임 충돌 | 기존 Note 계약·개인 Projects/공유 Note 경계 있음 | 반증으로 확대 제외. 참조 링크부터 시작하고 실권한·revision API 대조 후 확장 |

R-08의 내용 동등성, 교차 관계 schema, 독립 ZIP 복구는 구현 실험이 필요한
핵심 위험이다. 문서에 규칙을 썼다는 이유로 데이터 이관 가능성을 통과시키지 않는다.

## 요구별 현재 판정과 후속 시나리오

기획 반영은 대상·기본값·예외·수용 조건·후속 검증을 찾을 수 있는지로 판정했다.
실행 가능성·운영 품질 판정과 구별한다.

| 요구/AC | 기획 단계 | 이번 시안에서 확인 | 앱에서 남은 검증 |
|---|---|---|---|
| 038 / 73 | 반영 | 전역 가상 작업 목록·소속 표시 | 서버 페이지/검색/건수·소유자 격리·갱신 중 일관성 |
| 039 / 74 | 반영 | 1440×900 첫 행·320~430px 가로 넘침 | 운영과 동일 데이터/viewport의 전후 비교·실사용 탐색 비용 |
| 040 / 75~77 | 반영 | 이동 preview·취소·가상 이동·되돌리기 | PostgreSQL 관계·이력·기준선·TestRun/SkillRun·revision·멱등·동시성·ZIP |
| 041 / 78 | 반영 | 일괄 이동은 시안 미구현 | 2개 이상·100개 경계, 숨은 선택, 1건 실패 시 전체 불변 |
| 042 / 79 | 반영 | 모바일 목록/상세·Dialog Escape·밝기·폭 | 실제 키보드/스크린리더·터치·이동 sheet·기기 키보드/safe area |
| 043 / 80 | 반영 | Note 버튼은 실제 호출 없는 안내 | Note API·위임 권한·revision/hash·문서 삭제·접근 차단 |
| 044 / 81~84 | 반영 | 표시·밀도·검색·ID·초안·범위 밖 상세, 뒤로/URL 새로고침, 저장 보기 변경/복원 | legacy 링크/DB migration, 비동기 경합, 큰 목록 anchor, 로그아웃 cache 정리, 실제 초점·모션 감소 |

검토용 시안 검사는 `node docs/planning/prototype/verify-task-workspace-v2.cjs`로
실행했다. 실제 Edge headless에서 성공했으며 JS 오류는 없었다. 생성 이미지의
전역 목록·보드/초안·이동 Dialog·모바일을 직접 열어 확인했다. 앱 서버/웹의
필수 검사 명령은 앱 변경이 없는 이번 기획 작업에서는 실행하지 않았다.
실제 Note·Hub SkillRun·LLM·운영 Projects 새 버전 검증도 수행하지 않았다.

## 착수 순서와 남은 결정

1. 보기 상태 분리·가시성·legacy 복원과 서버 전역 목록을 첫 묶음으로 구현한다.
2. 교차 관계/이력/ZIP의 작은 PostgreSQL 이관 실험을 먼저 통과시키고 단일
   이동을 연결한다. 연결된 구현 작업까지 AC-76을 통과해야 이동 묶음을 완료로 판정한다.
3. 원자적 일괄 이동과 실제 모바일·키보드 흐름을 완성한다.
4. Note의 실제 권한·API를 대조한 뒤 문서 참조를 연결한다.

첫 프로젝트 개요 진입은 기존 사용자 결정이다. `모든 작업·열림` 기본값,
전역 첫 출시의 목록 범위, 오늘의 날짜 규칙, 이동 후 목록 문맥 유지는 이번
추천안이다. 승인 대기라는 별도 절차를 만들지 않으며 구현 요청 시 이 기획을
설계 기준으로 구체화한다. preview 유효기간/멱등 결과 보관 기간과 성능 목표는
실제 규모·운영 조건을 확인해 API 명세에 정할 사항이다.
