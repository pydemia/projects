# 앱 요구사항 현황

2026-10-21 · 단계: 로컬 MVP 구현·검증 · 최신 사용자 결정 우선

아래 ID는 Projects 자체의 요구사항입니다. 정적 시안의 예시 데이터와
테스트 개수만으로 달성을 판정하지 않습니다.
실제 명령·환경·수용 조건별 범위는 [검증 기록](../implementation/verification.md)에 있습니다.

| ID | 사용자 요구 | 현재 구현·검증 | 후속·한계 |
|---|---|---|---|
| APP-REQ-001 | 아이디어부터 기획·설계·구현 계획·테스트 관리 | 프로젝트별 아이디어·기능·요구·문서·작업·케이스·run과 관계·추적·기준선. 실제 PostgreSQL/API·브라우저 확인 | 코드 구현·배포를 실행하는 agent는 범위 밖 |
| APP-REQ-002 | 기능/UI, System/Infra/Application/Interface, 구현 계획 7종 | 핵심 7종 프로필을 원문 35종에 매핑. 문서 생성·수정·검수 공통 실행과 반출 | Markdown 초안 범위. 실제 화면 시안·Office·다이어그램 렌더링 검수 미제공 |
| APP-REQ-003 | 개인 중심 → 소규모 팀 확장 | 개인 가입·세션·프로젝트 소유권·CSRF·타 사용자 자료 차단. 단일 Entra 테넌트의 `@pydemia.ai` 계정을 OIDC subject로 분리 연결하고 기존 개인 계정 보존 | 팀 역할·공동 편집은 후속. 인증 확대의 실제 검사 범위는 검증 기록 참고 |
| APP-REQ-004 | AI 문서·계획 보조 | 작성·국소 수정·검수·요건/작업/회귀 케이스 후보와 선택 적용. 실제 Codex 흐름 확인 | 제안의 업무 적합성은 사용자 검토 필요 |
| APP-REQ-005 | 메모를 요건화하고 기존 기능과 연결 | 기존 기능·요건 자동 snapshot, 신규/확장/변경/통합/중복/충돌/보류 분류. 선택한 요건·설계 보완 작업·구현 작업·테스트 연결 | 충돌·중복·보류는 결정 기록까지만 생성; 기존 기능과 설계를 자동 덮어쓰지 않음 |
| APP-REQ-006 | Hub 스킬 원문을 사용 | 원문 bundle·resource·revision·SHA-256 검증과 고정 cache, 실행 lock. 실제 Hub·Codex 연결 | 읽지 못한 binary·추가 스킬·도구는 미검증으로 기록 |
| APP-REQ-007 | 개별 문서를 같은 스킬로 별도 작성·수정 | 일반 Markdown, 원문 스킬·lock·입력·참조 실행 ZIP, 외부 diff·기준 hash 대조 API | 외부 재연결의 고급 UI는 Note 범위. 결과 문구의 동일성은 보장하지 않음 |
| APP-REQ-008 | 앱 기능이 스킬 기반 LLM 동작 | 영속 SkillRun·입력 기준·실패/취소/재시도·lease 복구·검토·명시 적용. 실제 4종 동작 확인 | 텍스트 생성 도구만 제공; 앱이 스킬 스크립트를 자동 실행하지 않음 |
| APP-REQ-009 | Notion 35종·예시 확인과 공개 양식 보완 | 35종·공개 출처 25개·자체 양식 8개 조사, 원본 접근 상태 구분. 핵심 7종 선택·참조 manifest·반출 구현 | 공개 URL은 실행 시 metadata만 전달. 본문을 제공한 프로젝트 자료만 읽은 근거로 취급 |
| APP-REQ-010 | 문서는 Note 연계 전까지 간단히 임시 구현 | 임시 Markdown 편집·저장·충돌/초안 보존·SkillRun 연결·파일 반출. [NOTE-01~08](../implementation/note-document-handoff.md) 명세 | Note 실제 저장소/API 확인 및 이관은 후속 |
| APP-REQ-011 | DB는 PostgreSQL | Compose 17.11·SQLAlchemy·Alembic, 실제 DB 통합 테스트와 전용 schema dump/복구 | SQLite 대체 없음. 운영 환경 복구 훈련은 별도 |
| APP-REQ-012 | Codex 로그인 기본, auth 경로/inline YAML 및 OpenAI API YAML | 안전한 YAML·경로 해석·provider 선택·비노출, Codex 실제 호출 및 API HTTP 계약 검증 | OpenAI 원격 API는 키 미설정으로 미검증. Codex 인증 refresh 복사본의 한계는 설정 문서 참고 |
| APP-REQ-013 | `ui.pydemia.ai` 컴포넌트와 UI 모드·light/dark 테마 | 고정 registry 소스를 앱 외곽·탐색·목록/상세·작업 보기·폼·대화상자·추적/집계에 적용. 모드·테마를 저장 | 업무 규칙은 Projects가 소유. 전체 출시 모드의 수동 접근성 검수는 별도 |
| APP-REQ-014 | 프런트엔드 배포에 favicon 포함 | 승인 pydemia 엠블럼 파생 SVG와 16~64px light/dark PNG·ICO fallback, head·Vite 빌드·로컬 HTTP Content-Type/bytes 검사. 기존 운영 SVG의 hash와 로그인 브라우저 표시 확인 | 신규 PNG/ICO의 운영 HTTPS·인증/CSP·cache·탭 표시는 이번 로컬 변경의 배포 후 재검증 대상 |
| APP-REQ-015 | 간편/정교 작업 화면을 같은 데이터의 보기로 전환 | `taskMode`·`taskView` URL, 오늘·Inbox·예정과 목록·보드·캘린더·집계. 전환 시 ID·revision 불변 | 전 프로젝트 Today와 저장된 보기 공유는 후속 |
| APP-REQ-016 | GTD 실행 조건과 Franklin ABC 가치 우선순위를 혼용 | 다음 행동·맥락·가용 시간·에너지와 A/B/C·그룹 내 순서·목표를 별도 필드/정렬 기준으로 구현 | 자동 우선순위 추천·일정 최적화는 후속 |
| APP-REQ-017 | 개인 할 일을 빠르게 추가·완료하면서 구현 작업 완료 gate 유지 | 개인/구현 작업 유형, 한 줄 추가·완료·다시 열기, 유형 변경 차단. 구현 작업의 근거·테스트 gate 유지 | 반복·알림·실측 시간은 후속 |
| APP-REQ-018 | 작업을 여러 보기와 집계 그래프로 관리 | 상태 보드의 항목별 상태 변경·월간 실행/마감 캘린더·상태/지난 마감/ABC 현재 분포·예상 분 합계. 보드 드래그는 APP-REQ-021, 개인 저장 필터·보기는 APP-REQ-024에서 로컬 구현 | 이력 추세·Gantt·작업량은 후속 |
| APP-REQ-019 | GitHub Issue와 작업 연결 | 정규화된 Issue URL을 저장·링크로 열람하고 외부 호스트 거부 | 인증·비공개 Issue·상태 읽기/양방향 동기화는 별도 연동 계약 후 구현 |
| APP-REQ-020 | 벤치마크를 적용한 전 화면 UI·UX 개편 | 간편 수집/정교 운영의 단계적 노출, 공통 목록→상세 탐색, 편집/근거 탭, SkillRun 이력 검색, 추적 필터·기준선과 복구 가능한 Dialog 흐름. 작업 조작·개인 저장 보기는 APP-REQ-021~024에서 로컬 구현 | Note 편집기의 고급 기능·공유 저장 보기·시계열 그래프는 후속. AC-35~39의 이전 운영 검증과 이번 로컬 변경은 별도 |
| APP-REQ-021 | [확정·로컬 구현] 보드에서 작업을 직접 움직이고 저장 | PostgreSQL 수동 순서·상태 이동 API, 실제 브라우저 드래그/메뉴 후 새로고침 지속성, 완료 gate 테스트 | AC-40~43. 긴 열·모바일 폭의 수동 브라우저 검증 및 운영 배포는 별도 |
| APP-REQ-022 | [기획 필수·로컬 구현] 드래그의 사용성과 실패 복구 | 빈 열/카드 위치 표시, 자동 스크롤, 취소, 409 rollback·최신 목록 요청·재시도 안내, 키보드/터치 대체 버튼 | AC-42~45. 실제 터치 기기·스크린리더·긴 열 수동 검증은 남음 |
| APP-REQ-023 | [확정·로컬 구현] 열별 빠른 생성과 다중 작업 선택·일괄 변경 | 상태·끝 순서 상속, 체크박스/Shift/전체 선택, 원자적 상태·실행 예정일·목록 변경. PostgreSQL·브라우저 확인 | AC-46~47. 구현 작업 완료 gate 전체 거부·재시도 확인. 운영 미배포 |
| APP-REQ-024 | [확정·로컬 구현] 간편 오늘 계획과 저장된 보기 | Inbox→오늘 배치/내일 연기 시 마감일 보존. 작업 외부의 개인 보기와 기본 보기·검색/그룹/정렬/카드 필드 저장·재방문 확인 | AC-48. 팀 권한 계약 전 공유 보기는 API에서 거부하며 운영 미배포 |
| APP-REQ-025 | [제안·미구현] 섹션형 개인 보드와 일정 직접 조작 | TickTick식 섹션은 상태와 분리하고, 달력에서 실행 예정일을 직접 조정 | 섹션 데이터와 시간대·반복 계약 결정 후 별도 수용 조건 확정 |
| APP-REQ-026 | [제안·미구현] 이력에 근거한 작업 집계 | 변경 이벤트 저장 이후의 처리량·체류시간만 추세로 표시 | AC-49. 현행 그래프는 현재 스냅샷으로 유지 |
| APP-REQ-027 | [확정·로컬 구현] 드래그와 작업 메뉴를 실제 조작에 맞게 설계 | 검색 상태 팝오버와 작업 `…` 메뉴 분리, 드래그/메뉴가 같은 API 사용. 정교 보드에서만 관리 동작 노출 | AC-50~51. 실제 모바일 폭·터치 검증과 운영 배포는 남음 |
| APP-REQ-028 | [기획·미구현] 휴대전화에서 한 과업에 집중하는 UI·UX | 현재 프로젝트를 밝히는 상단 바, 오늘·Inbox·작업·더보기 하단 탐색, 목록→전체 화면 상세, 한 열 보드·주간 agenda·한 열 집계, 빠른 추가·필터·일괄 변경의 모바일 조작을 [별도 기획](14-mobile-experience.md)에 정의 | AC-52~58. 앱 코드 적용·실제 모바일 브라우저와 물리 기기 검증은 후속 |
| APP-REQ-029 | [확정·로컬 구현] 기존 GitHub 저장소에서 프로젝트 생성 | URL 입력과 생성 전 저장소 분석·대상 폴더 선택 | AC-59. 다른 Git 호스트는 후속 계약 |
| APP-REQ-030 | [확정·로컬 구현] package 중심 목표 초안 | 고정 commit의 package/extension manifest와 경로만 읽어 확장·웹·스킬·Python 패키지 및 하위 프로젝트를 구분하고 목표를 제안 | AC-60. 내용 없는 manifest는 저장소 설명 fallback과 한계 표시 |
| APP-REQ-031 | [확정·로컬 구현] 출처와 commit·PR 중심 작업 이력 | 사용자 소유 프로젝트에 URL·폴더·branch·SHA를 저장하고 최근 commit·PR 제목·상태·링크를 읽기 전용 snapshot으로 연결 | AC-61~62. 요건·작업 완료 자동 승격 금지 |
| APP-REQ-032 | [확정·로컬 구현] 저장소 가져오기 안전성과 복구 | 서버 전용 token·비공개 허용 목록, 코드 미실행, 중복·stale commit 차단, ZIP 출처 보존 | AC-61·63. 비공개 실제 연동은 서버 credential 설정 후 검증 |
| APP-REQ-033 | [확정·로컬 구현] 저장소 가져오기 UI/UX | 공통 컴포넌트로 입력→분석→범위·목표 확인→생성/오류 복구, 모바일 한 열 | AC-64. 기존 favicon 연결 보존 |
| APP-REQ-034 | [확정·공개 저장소 검증] 서로 다른 실제 저장소로 이관 검사 | 공개 statusline·colors·skills catalog·Python package·VS Code extension 하위 폴더를 읽기 전용 검사 | mock/PostgreSQL/실제 GitHub 결과를 구분하고 비공개 미검증을 명시 |
| APP-REQ-035 | [확정·로컬 구현] Git 소스 ZIP으로 프로젝트 생성 | GitHub Download ZIP·`git archive` ZIP에서 작은 package/extension manifest와 대상 폴더만 분석하고 이름·목표를 수정해 생성 | AC-65~67. ZIP에는 commit·PR 이력이 없으며 Projects 백업 ZIP 복원과 분리 |
| APP-REQ-036 | [확정·로컬 구현] 가져오기 용어 구분 | `백업 ZIP 복원`·`원격 GitHub에서 만들기`·`Git ZIP에서 만들기`를 각각 표시하고 백업 설명에 `반출한` 표현을 쓰지 않음 | AC-68. 모바일·데스크톱에서 각 입력의 용도를 식별 가능 |

APP-REQ-009는 상시 웹 수집이나 공개 양식 전체의 재배포를 요구하지 않습니다.
양식·예시는 입력 자료이며 스킬 원문 규칙과 구분합니다. 원본 접근 실패를
공개 보완 자료의 존재로 바꾸지 않고, 실행 시 URL을 읽지 않았다면
`read_in_this_run=false`를 유지합니다.

APP-REQ-015~019의 제품 비교·화면·수용 기준은
[작업공간 벤치마크](12-task-workspace-benchmark.md)에 있습니다.
APP-REQ-020의 전 화면 과업 흐름과 검증 범위는
[UI·UX 개편 계획](../implementation/ui-ux-overhaul.md)에 있습니다.
APP-REQ-021~027의 출처·확정/제안 구분과 동작별 경계는
[REA 기반 상호작용 재분석](13-task-interaction-rea.md)에 있습니다. P0·P1의
로컬 구현·검증 범위는 [상호작용 구현 계획](../implementation/task-interaction-plan.md)에
기록했습니다. 제안 P2와 운영 검증 완료를 뜻하지 않습니다.
APP-REQ-028의 화면별 모바일 흐름·공통 UI 인계·구현 순서와 수용 조건은
[모바일 UI·UX 기획](14-mobile-experience.md)에 있습니다. 기존 390px 캡처와
구조 시안은 문제·설계 근거이며 앱 수정·운영 검증의 완료 근거가 아닙니다.
APP-REQ-029~034의 과업·저장소별 근거·AC-59~64는
[GitHub 저장소 이관 기획](15-git-repository-import.md)과
[구현 goal](../implementation/git-repository-import-goal.md)에 연결합니다.
APP-REQ-035~036과 AC-65~68은 같은 기획 문서의 Git ZIP 확장 절을 따릅니다.
