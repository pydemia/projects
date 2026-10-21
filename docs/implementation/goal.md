# Projects 구현 goal

2026-10-21 · 상태: 로컬 MVP·CI 통과, 공개 HTTPS 배포·실제 Entra 로그인 확인 · 최신 요구: APP-REQ-001~019

사용자의 후속 요청으로 `projects.pydemia.ai` 배포와
`pydemia@pydemia.ai` Microsoft Entra 로그인 연결을 현재 실행 범위에
추가했다. 아래 원래 goal 메시지의 외부 배포 제외 문구는 작성 당시의 범위다.
배포 구현과 검증은 [배포 안내](deployment.md) 및
[검증 기록](verification.md)에 이어서 기록한다.

최신 범위 조정: 구현 DB는 PostgreSQL로 확정했다. 문서 관리 본체는 향후
Note 앱으로 연계하며, 이번 구현은 [임시 문서 기능](note-document-handoff.md)으로
제한한다. 아래 초기 goal보다 이 사용자 지시를 우선한다.
LLM 기본은 Codex 로그인이며 auth.json 파일 경로 또는 inline 인증을 YAML로
설정한다. OpenAI-compatible API의 키·모델·주소도 YAML로 선택할 수 있다.
전체 최신 요구 ID는 APP-REQ-001~019다.

후속 UI 작업: [공통 UI 편입 기록](ui-component-integration.md)에 따라
`ui.pydemia.ai`의 실제 컴포넌트·토큰·21개 출시 UI 모드를 적용하고
light/dark 선택을 제공한다. favicon을 빌드·배포 검증 대상으로 추가한다.
따라서 현재 요구 ID는 APP-REQ-001~019다. 아래 초기 구현 판정은 UI 개편
이전 근거이므로 신규 UI 검증과 구분한다.

후속 작업공간 goal: [제품 벤치마크](../planning/12-task-workspace-benchmark.md)를
근거로 개인 할 일과 구현 작업을 한 PostgreSQL 작업 모델에 유지한다.
간편/정교 모드는 항목 유형이 아니라 보기 밀도이며, 오늘·Inbox·예정과
목록·보드·캘린더·집계 사이의 전환은 동일 ID·revision을 사용한다.
GTD의 행동·시간·맥락·에너지와 Franklin ABC의 가치·순서를 독립 입력/정렬
축으로 구현한다. GitHub Issue는 이번 단계에서 유효한 URL 연결까지만 하며
원격 상태 동기화는 후속 계약이다. 실행 항목·단계별 판정은
[작업공간 구현 계획](task-workspace.md)을 따른다.

2026-10-21 로컬 재검증: Docker가 다시 동작해 PostgreSQL migration,
`uv run pytest` 135개, 웹 TypeScript/Vitest 17개, Ruff·mypy·웹 빌드가
통과했다. 작업공간 운영 배포/브라우저 판정은 별도로 기록한다.

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
