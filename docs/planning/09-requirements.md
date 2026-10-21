# 앱 요구사항 현황

2026-10-21 · 단계: 로컬 MVP 구현·검증 · 최신 사용자 결정 우선

아래 ID는 Projects 자체의 요구사항입니다. 정적 시안의 예시 데이터와
테스트 개수만으로 달성을 판정하지 않습니다.
실제 명령·환경·수용 조건별 범위는 [검증 기록](../implementation/verification.md)에 있습니다.

| ID | 사용자 요구 | 현재 구현·검증 | 후속·한계 |
|---|---|---|---|
| APP-REQ-001 | 아이디어부터 기획·설계·구현 계획·테스트 관리 | 프로젝트별 아이디어·기능·요구·문서·작업·케이스·run과 관계·추적·기준선. 실제 PostgreSQL/API·브라우저 확인 | 코드 구현·배포를 실행하는 agent는 범위 밖 |
| APP-REQ-002 | 기능/UI, System/Infra/Application/Interface, 구현 계획 7종 | 핵심 7종 프로필을 원문 35종에 매핑. 문서 생성·수정·검수 공통 실행과 반출 | Markdown 초안 범위. 실제 화면 시안·Office·다이어그램 렌더링 검수 미제공 |
| APP-REQ-003 | 개인 중심 → 소규모 팀 확장 | 개인 가입·세션·프로젝트 소유권·CSRF·타 사용자 자료 차단 검증 | 팀 역할·공동 편집·OIDC 후속 |
| APP-REQ-004 | AI 문서·계획 보조 | 작성·국소 수정·검수·요건/작업/회귀 케이스 후보와 선택 적용. 실제 Codex 흐름 확인 | 제안의 업무 적합성은 사용자 검토 필요 |
| APP-REQ-005 | 메모를 요건화하고 기존 기능과 연결 | 기존 기능·요건 자동 snapshot, 신규/확장/변경/통합/중복/충돌/보류 분류. 선택한 요건·설계 보완 작업·구현 작업·테스트 연결 | 충돌·중복·보류는 결정 기록까지만 생성; 기존 기능과 설계를 자동 덮어쓰지 않음 |
| APP-REQ-006 | Hub 스킬 원문을 사용 | 원문 bundle·resource·revision·SHA-256 검증과 고정 cache, 실행 lock. 실제 Hub·Codex 연결 | 읽지 못한 binary·추가 스킬·도구는 미검증으로 기록 |
| APP-REQ-007 | 개별 문서를 같은 스킬로 별도 작성·수정 | 일반 Markdown, 원문 스킬·lock·입력·참조 실행 ZIP, 외부 diff·기준 hash 대조 API | 외부 재연결의 고급 UI는 Note 범위. 결과 문구의 동일성은 보장하지 않음 |
| APP-REQ-008 | 앱 기능이 스킬 기반 LLM 동작 | 영속 SkillRun·입력 기준·실패/취소/재시도·lease 복구·검토·명시 적용. 실제 4종 동작 확인 | 텍스트 생성 도구만 제공; 앱이 스킬 스크립트를 자동 실행하지 않음 |
| APP-REQ-009 | Notion 35종·예시 확인과 공개 양식 보완 | 35종·공개 출처 25개·자체 양식 8개 조사, 원본 접근 상태 구분. 핵심 7종 선택·참조 manifest·반출 구현 | 공개 URL은 실행 시 metadata만 전달. 본문을 제공한 프로젝트 자료만 읽은 근거로 취급 |
| APP-REQ-010 | 문서는 Note 연계 전까지 간단히 임시 구현 | 임시 Markdown 편집·저장·충돌/초안 보존·SkillRun 연결·파일 반출. [NOTE-01~08](../implementation/note-document-handoff.md) 명세 | Note 실제 저장소/API 확인 및 이관은 후속 |
| APP-REQ-011 | DB는 PostgreSQL | Compose 17.11·SQLAlchemy·Alembic, 실제 DB 통합 테스트와 전용 schema dump/복구 | SQLite 대체 없음. 운영 환경 복구 훈련은 별도 |
| APP-REQ-012 | Codex 로그인 기본, auth 경로/inline YAML 및 OpenAI API YAML | 안전한 YAML·경로 해석·provider 선택·비노출, Codex 실제 호출 및 API HTTP 계약 검증 | OpenAI 원격 API는 키 미설정으로 미검증. Codex 인증 refresh 복사본의 한계는 설정 문서 참고 |
| APP-REQ-013 | `ui.pydemia.ai` 컴포넌트와 UI 모드·light/dark 테마 | 선택한 registry 소스·토큰을 고정해 공통 화면 요소와 전체 테마에 적용. 모드·테마 저장 및 브라우저 전환 확인 | 일부 업무별 고유 레이아웃과 native 컨트롤은 Projects CSS를 유지. 전체 모드별 접근성 수동 검수는 후속 |
| APP-REQ-014 | 프런트엔드 배포에 favicon 포함 | 승인 pydemia 엠블럼 파생 SVG, head·Vite 빌드 검증, 운영 `/favicon.svg`의 `image/svg+xml`·SHA-256 일치 및 로그인 브라우저 직접 표시 확인 | 브라우저 확장의 탭 배지가 원래 아이콘을 덮어써 탭 이미지 자체의 독립 확인은 제한됨 |
| APP-REQ-015 | 간편/정교 작업 화면을 같은 데이터의 보기로 전환 | `taskMode`·`taskView` URL, 오늘·Inbox·예정과 목록·보드·캘린더·집계. 전환 시 ID·revision 불변 | 전 프로젝트 Today와 저장된 보기 공유는 후속 |
| APP-REQ-016 | GTD 실행 조건과 Franklin ABC 가치 우선순위를 혼용 | 다음 행동·맥락·가용 시간·에너지와 A/B/C·그룹 내 순서·목표를 별도 필드/정렬 기준으로 구현 | 자동 우선순위 추천·일정 최적화는 후속 |
| APP-REQ-017 | 개인 할 일을 빠르게 추가·완료하면서 구현 작업 완료 gate 유지 | 개인/구현 작업 유형, 한 줄 추가·완료·다시 열기, 유형 변경 차단. 구현 작업의 근거·테스트 gate 유지 | 반복·알림·실측 시간은 후속 |
| APP-REQ-018 | 작업을 여러 보기와 집계 그래프로 관리 | 상태 보드·월간 실행/마감 캘린더·상태/지난 마감/ABC 현재 분포·예상 분 합계 | 이력 추세·Gantt·작업량·드래그·저장 필터는 후속 |
| APP-REQ-019 | GitHub Issue와 작업 연결 | 정규화된 Issue URL을 저장·링크로 열람하고 외부 호스트 거부 | 인증·비공개 Issue·상태 읽기/양방향 동기화는 별도 연동 계약 후 구현 |

APP-REQ-009는 상시 웹 수집이나 공개 양식 전체의 재배포를 요구하지 않습니다.
양식·예시는 입력 자료이며 스킬 원문 규칙과 구분합니다. 원본 접근 실패를
공개 보완 자료의 존재로 바꾸지 않고, 실행 시 URL을 읽지 않았다면
`read_in_this_run=false`를 유지합니다.

APP-REQ-015~019의 제품 비교·화면·수용 기준은
[작업공간 벤치마크](12-task-workspace-benchmark.md)에 있습니다.
