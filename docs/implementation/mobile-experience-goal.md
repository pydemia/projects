# 모바일 UI·UX 구현 goal

2026-10-22 · 상태: **로컬 goal 완료 · 운영/물리 기기 검증은 별도** · 대상: `github.com/pydemia/projects`

[모바일 UI·UX 기획](../planning/14-mobile-experience.md)의 APP-REQ-028과
AC-52~58을 실제 Projects 앱에 반영한다. 현재의 760px 이하 사이드바 적층,
가로 메뉴, 월간 달력의 700px 최소 폭을 휴대전화 UX로 교체한다. 목표는
작은 화면에서 **현재 프로젝트의 오늘 할 일 확인 → 수집 → 상세/상태/일정 변경**을
작업보다 앞선 설정·탐색 적층이나 페이지 전체의 가로 스크롤 없이 마치는 것이다.
데스크톱의 정보 밀도와 다중 영역은 유지한다. HTML [구조 시안](../planning/prototype/mobile-workspace.html)은
의사결정 자료이며 앱 구현·공통 컴포넌트 사용·API 검증의 증거가 아니다.

## 구현 순서

1. **기준선과 공통 UI 확인.** 로컬 실제 앱과 가능한 운영 로그인 화면의
   320·360·390·430 CSS px, 짧은/긴 높이, 태블릿·1440px 캡처를 남긴다.
   첫 과업까지의 거리, 가로 넘침, 키보드/포커스/터치 충돌을 기록한다.
   `ui.pydemia.ai`에 편입된 source revision·hash를 확인하고 모바일 탐색과
   sheet에 필요한 variant가 실제 registry에 있는지 점검한다.
2. **탐색과 정보 구조.** 휴대전화에는 현재 프로젝트를 밝히는 짧은 상단 바,
   `오늘·Inbox·작업·더보기` 하단 탐색, `더보기`의 기존 6개 업무 화면을
   구현한다. 프로젝트 미선택 상태와 계정/설정/반출 경로도 유지한다.
   기존 URL의 `project`·`view`·`taskMode`·`taskView`·`savedView`·`item`과
   브라우저 뒤로/앞으로를 보존한다. 목록→상세는 한 번에 한 영역으로 보이고
   돌아오면 검색·보기·스크롤·선택 상태를 복원한다.
3. **일상 작업.** 모바일 Today/Inbox와 현재 보기의 기본값을 보여 주는 빠른
   추가, 검색·필터 sheet, 완료·오늘 계획·내일 연기·상태 행동을 구현한다.
   같은 PostgreSQL 작업 ID·revision과 `planned_date`/`due_date` 의미를
   사용하고, 구현 작업 완료 근거 gate를 우회하지 않는다. 입력 초안·409·
   권한·네트워크 실패를 복구 가능하게 표시한다.
4. **정교 작업.** 한 번에 상태 열 하나를 읽는 보드에 상태 선택기와 메뉴 기반
   상태/순서 이동, 열 끝 빠른 생성을 제공한다. 터치 드래그는 보조 수단으로
   검증하며 메뉴만으로도 모든 이동을 수행한다. 다중 선택 하단 행동은 선택
   수·숨은 선택을 밝히고 기존 원자적 API를 사용한다. 캘린더는 주간 날짜 띠와
   선택일 agenda, 집계는 현재 스냅샷을 한 열로 표현한다. 개인 저장 보기와
   간편/정교 전환은 작업 데이터 및 UI 모드/테마와 독립적으로 유지한다.
5. **나머지 업무와 품질.** 기획·임시 문서·테스트·추적·스킬 작업을 모바일
   목록→전체 화면 상세→편집/관계/근거 흐름으로 연결한다. 임시 Markdown과
   Note 이관 경계, SkillRun·요건 관계, 원문·revision·hash를 유지한다.
   입력 키보드, safe area, 긴 한국어/URL, 확대, 가로 방향, 축소된 동작,
   포커스 복귀, light/dark/System과 출시 UI 모드의 대표 유형을 확인한다.

## 완료 조건과 검증

- AC-52~58의 각 항목에 **코드 변경, 실제 앱 화면, 검사 결과, 남은 한계**를
  대응시킨다. 320~430px에서 페이지 전체 가로 넘침이 없고 필수 행동이 첫
  화면에서 접근 가능해야 한다. 보드·문서·추적처럼 내부 탐색이 필요한 영역은
  대체 조작과 범위를 명시한다.
- 같은 계정·프로젝트·작업으로 모바일/데스크톱에서 URL, ID, revision,
  상태·날짜·완료 gate, 선택/필터/저장 보기의 일관성을 확인한다. 실제
  브라우저에서는 터치 메뉴, 키보드, Escape/뒤로, sheet 포커스 복귀,
  409 복구와 새로고침 지속성을 검사한다. 물리 기기 검사가 불가능하면
  그 항목은 미검증으로 기록한다. 시안 smoke test는 실제 앱 수용 증거가 아니다.
- PostgreSQL 통합 검사는 무작위 전용 schema만 생성·정리한다. 저장소
  `AGENTS.md`에 따라 `docker compose up -d db`, `uv run projects migrate`,
  `uv run pytest`, `uv run ruff check src tests migrations`,
  `uv run ruff format --check src tests migrations`, `uv run mypy src/projects`,
  `npm --prefix web run check`, `npm --prefix web run build`를 실행한다.
- 승인된 pydemia 엠블럼의 기존 SVG, 16~64px light/dark PNG, ICO fallback과
  head metadata·정적 경로를 유지한다. 빌드 파일과 로컬 HTTP의 실제
  bytes·Content-Type을 검사한다. 새 브랜드나 로고를 요구하지 않는다.
  운영 배포를 수행할 때에는 인증·CSP·HTML fallback·cache와 브라우저 탭의
  실제 표시까지 따로 검증한다.
- 이번 goal의 완료 분모는 **로컬 구현과 실제 앱 검증**이다. 운영 배포·병합,
  Note 본체, 전 프로젝트 통합 Today, 섹션형 보드, 일정 드래그·이력 추세,
  GitHub 양방향 동기화는 포함하지 않는다. 외부 서비스·실제 LLM 검사는
  관련 코드를 변경하지 않았다면 새 성공으로 주장하지 않는다.

## 복사 가능한 goal 메시지

```text
github.com/pydemia/projects에서 docs/planning/14-mobile-experience.md의
APP-REQ-028·AC-52~58을 실제 웹 앱에 구현하고 검증한다. 현재 모바일의
사이드바 적층·가로 메뉴·700px 월간 달력 때문에 첫 과업이 밀리고 조작이
어려운 문제를 해결한다. 데스크톱 구조는 유지하며 휴대전화에는 현재 프로젝트
상단 바, 오늘·Inbox·작업·더보기 하단 탐색, 한 화면씩 열리는 상세를 제공한다.

먼저 실제 앱의 320·360·390·430px/태블릿/1440px 기준선을 남기고
ui.pydemia.ai의 편입 source revision·hash와 모바일 variant를 확인한다.
이어서 탐색과 URL/뒤로 상태 → Today/Inbox·빠른 추가·필터·실패 복구 →
한 열 보드·메뉴 이동·다중 선택·주간 agenda·집계 → 기획/임시 문서/테스트/
추적/스킬 작업의 목록→상세 흐름 순으로 구현한다. 드래그 없이도 상태·순서
이동이 가능해야 한다. 같은 PostgreSQL ID·revision·planned_date/due_date,
원자적 일괄 변경, 구현 작업 완료 gate, 개인 저장 보기와 Note 임시 Markdown
경계를 유지한다. 새 SQLite 경로나 독립 시각 컴포넌트를 만들지 않는다.

AC-52~58을 실제 앱의 PostgreSQL·웹·브라우저 검사에 각각 연결한다. 긴
콘텐츠·키보드·safe area·포커스·터치 메뉴·409 복구·모드/테마를 확인하고
물리 기기 미검증은 그대로 기록한다. AGENTS.md의 서버·웹 검사를 실행한다.
기존 pydemia SVG와 16~64px light/dark PNG·ICO favicon, head·정적 경로·
빌드/로컬 HTTP bytes·Content-Type을 다시 확인한다. 구조 시안 검사를 앱
완료 근거로 쓰지 않는다. 결과와 미검증 범위를 docs/implementation에 남긴다.
운영 배포·병합과 별도 후속 기능은 이 goal의 완료 분모에 넣지 않는다.
```

## 실행 기록

2026-10-22에 Goal 도구에 이 목표를 등록하고 실제 앱 코드를 변경했다. 모바일
상단 프로젝트 선택, `BottomNav` 네 목적지, `Dialog` 기반 더보기·필터·추가·
일괄 변경 시트, 목록→상세, 한 열 보드, 주간 agenda, 모바일 추적 관계 행을
구현했다. 보드의 터치 추가 버튼을 하단 탐색이 가로채던 결함과 dark 시트
헤더/닫기 대비, 시트 닫기 후 포커스 복귀, 409 뒤 일괄 변경 초안 복원을
실제 브라우저 검사로 찾아 수정했다. 상세 결과는 [검증 기록](verification.md)의
모바일 절과 `scripts/verify-mobile-browser.py`에 있다. 운영 배포와 물리 기기
검사는 이 로컬 goal과 별개로 남는다.
