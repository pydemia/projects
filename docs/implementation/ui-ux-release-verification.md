# UI·UX 전면 개편 릴리스 검증

2026-10-21. 적용 범위와 수용 조건은 [실행 계획](ui-ux-overhaul.md)의
AC-35~39이며, 제품별 근거는 [벤치마크](../planning/12-task-workspace-benchmark.md)에
있다. UI·UX 변경은 Git `78dd487`까지 `main`에 게시했다.
[GitHub Actions checks](https://github.com/pydemia/projects/actions/runs/39594805680)는
해당 커밋에서 통과했다.

| 조건 | 확인한 결과 | 검증 경계 |
|---|---|---|
| AC-35 | AppShell·SideNav, 목록/상세 Card·SearchInput·Tabs·DataList, 작업 SegmentedControl·Checkbox·BarList, 추적 Table·Accordion, 편집 Dialog를 `ui.pydemia.ai` 고정 source로 연결했다. 운영 브라우저에서 개요·기획·임시 문서·작업·테스트·추적·스킬 작업을 열었다. | 공통 컴포넌트 원본과 hash는 [편입 기록](ui-component-integration.md)을 따른다. |
| AC-36 | 간편 화면의 빠른 입력, 오늘·Inbox·예정, GTD·ABC 선택을 운영에서 확인했다. 빠른 추가·날짜 기본값·동일 작업 데이터의 전환은 Vitest로 검사했다. | 운영 개인 자료에 테스트 작업을 생성하지 않았다. |
| AC-37 | 같은 프로젝트 작업을 정교 목록·보드·2026년 10월 캘린더·집계에서 확인했다. 집계에는 상태와 ABC 분포가 표시된다. 보드 상태 저장과 완료 gate는 웹/API 테스트로 검사했다. | 집계는 현재 스냅샷이며 이력 추세나 실측 시간은 아니다. |
| AC-38 | 기획·문서·테스트 빈 상태, 추적 기준선, SkillRun 생성/이력 화면을 운영 로그인 세션에서 열었다. 목록/상세·검색·탭과 Dialog 동작은 웹 테스트로 검사했다. | 실제 Hub·LLM 새 실행은 이 릴리스에서 다시 수행하지 않았다. |
| AC-39 | Edge 운영 로그인 세션에서 간편/정교, 4개 정교 보기, Glassmorphism의 Light/Dark 선택과 새로고침 유지, 스크롤 중 사이드바·상단 도구 고정을 확인했다. 확대율을 조정해 CSS 폭 398px에서 수평 넘침이 없고 탐색이 가로 목록으로 바뀌는 것을 확인한 뒤 확대율을 100%로 복원했다. | 실제 휴대전화·스크린리더 수동 감사는 수행하지 않았다. |

필수 명령 `docker compose up -d db`, `uv run projects migrate`,
`uv run pytest` **156개**, Ruff check/format, mypy,
`npm --prefix web run check`, `npm --prefix web run build`가 통과했다.
웹 검사 때 작업 폴더에는 별도로 진행 중인 테마 변경도 있어 **32개**가
통과했다. 고정 UI 커밋의 독립 CI 통과와 이 작업 폴더 검사를 구분한다.

운영 `projects.pydemia.ai`는 앱·PostgreSQL health와 OAuth2 Proxy 실행을
확인했다. UI 배포 직전에 운영에 있던 Entra 조직 계정 인증 변경을 결합해
기존 인증 흐름을 보존했다. 같은 서버에서 뒤이어 배포된 테마 이미지
`pydemia-projects:theme-975e0fa1f46d07d3`에서도 개편된 작업 화면,
Light 밝기, 스크롤 고정과 로그인 데이터를 다시 확인했다. 해당 이미지의
파비콘 SHA-256은 `c23569224b1640ac5667776a6997c8e8bbafc9facce2364c0d7641c5807a4c82`다.
인증·테마 추가 변경은 이 UI 커밋 밖의 별도 작업이며, 그 변경의 Git 게시와
CI 판정까지 이 기록이 대신하지 않는다.
