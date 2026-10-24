# 구현·배포 검증 기록

2026-10-21 · Windows / Python 3.12.14 / Node 24.21.0 / PostgreSQL 17.11

## 2026-10-25 모바일 모달·키보드 사용성 보완

사용자 제보에 따라 공통 Dialog의 모바일 위치와 스크롤 소유권을 다시 검사했다.
기존 320×568 프로젝트 생성은 528px 높이의 가운데 모달이었고, 작업·더보기
시트는 레이아웃 viewport 하단에 고정되어 가상 키보드가 보이는 영역을 줄일
때 버튼이 가려질 수 있었다. 일반 긴 폼은 모바일 전체 화면, 짧은 작업·더보기는
하단 시트로 표시하도록 조정했다. `visualViewport` resize/scroll에서 가시
영역의 상단·폭·높이·하단을 반영하고, 폼 저장 행과 짧은 시트의 주요 행동은
스크롤 중 접근 가능하게 했다. 닫기 후 원래 버튼으로 초점이 돌아오는지
확인했다. 공통 `pydemia-ui/Dialog`를 계속 사용한다.

| 검증 층위 | 결과 |
|---|---|
| 모바일 브라우저 mock | Edge 모바일 에뮬레이션에서 390×844·320×568·667×375의 프로젝트 생성, Git ZIP, 아이디어 긴 폼, 더보기, 작업 추가 모달을 열고 가시 영역 밖으로 벗어나지 않는지 검사. 320×568에서 `visualViewport.height`를 300/200px, `offsetTop`을 30px로 모사해 헤더·확인 버튼 위치와 초점 복귀를 검증. 실제 OS 키보드 조작은 아님. |
| 실제 앱·PostgreSQL | 무작위 전용 schema를 만드는 `scripts/verify-mobile-browser.py`를 실행해 작업 추가·필터·일괄 변경·더보기 시트의 실제 API 흐름과 위치, Today/Inbox/보드·문서 초안, 320~430px 넘침, 데스크톱·테마·favicon을 확인. 테스트 schema만 정리. |
| 회귀·정적 검사 | `docker compose up -d db`, `uv run projects migrate`, 전체 `uv run pytest -q` 196개, Ruff check/format, mypy, `npm --prefix web run check` 46개, 웹 빌드·favicon 검사 통과. |
| 운영 반영 | `d65b4ca`의 GitHub Actions backend·web 성공을 확인하고 `pydemia-projects:9041e44edb611919`로 배포. app·DB healthy, Alembic `0006`, 내부 HTML·JS·CSS·favicon 바이트 일치와 공개 HTTPS의 로그인 시작을 확인. 인증 후 실제 화면은 Microsoft Authenticator 승인 대기. [배포 기록](deployment.md#2026-10-25-git-소스-가져오기모바일-모달-운영-배포). |

시각 근거: [프로젝트 만들기 320px](screenshots/mobile-dialogs/project-create-320.png),
[긴 아이디어 폼 하단 320px](screenshots/mobile-dialogs/idea-create-bottom-320.png),
[작업 추가 시트 320px](screenshots/mobile-dialogs/task-add-320.png),
[더보기 시트 390px](screenshots/mobile-experience/more-390.png).
물리 기기의 iOS/Android 키보드, 노치·안전 영역과 확대 동작은 이번 브라우저
모사로 판정하지 않았다. 운영 배포는 위와 같이 진행했으며, 인증 후 화면
조작과 물리 기기 사용성은 별도 확인이 필요하다.

## 2026-10-25 Git ZIP 생성·백업 복원 문구

APP-REQ-035~036·AC-65~68의 로컬 변경을 검사했다. 프로젝트 목록은
`백업 ZIP 복원`·`원격 GitHub에서 만들기`·`Git ZIP에서 만들기`를 구분하고,
백업 안내는 `Projects에서 저장한 백업 ZIP`이라고 표시한다. Git 소스 ZIP은
package manifest만 읽어 목표를 제안하며 commit·PR 이력을 생성하지 않는다.

| 검증 층위 | 결과 |
|---|---|
| 실제 공개 ZIP 읽기 | GitHub `statusline` main Download ZIP 73,426바이트를 실제로 받아 브라우저 확장·`manifest.json`·`Statusline`을 확인. `vscode-extension-quickstart` main ZIP 393,301바이트에서 하위 폴더 두 개를 찾고 `quickstart-extension`을 VS Code 확장으로 분류. |
| 실제 로컬 Git archive | 현재 저장소 HEAD의 `git archive --format=zip` 6,655,213바이트를 메모리에서 분석해 `pyproject.toml`·Python 패키지·`projects-app`을 확인. 소스 추출·실행·DB 저장 없음. |
| PostgreSQL·단위 검사 | GitHub ZIP·루트 없는 archive·하위 scope·위험 경로·백업 ZIP 혼동·해시 충돌·인증/CSRF·이력 없음 검사. `docker compose up -d db`, `uv run projects migrate`, 전체 `uv run pytest -q` 196개 통과. |
| 웹·브라우저 mock | `npm --prefix web run check` 46개 통과. Playwright/Edge의 1440px·390px에서 백업 문구, Git ZIP 선택→목표 확인→생성과 기존 원격 GitHub 흐름·가로 넘침 없음 확인. Mock이므로 브라우저에서 실제 ZIP 파서와 PostgreSQL을 연결한 결과는 아님. |
| 정적 검사·빌드 | Ruff check/format, mypy, `npm --prefix web run build` 통과. favicon SVG·10종 PNG·ICO 확인. |

실제 공개 ZIP은 읽기 전용으로 내려받아 메모리에서 분석했다. 비공개 ZIP,
이 절의 로컬 판정 당시 운영 배포와 물리 기기 검증은 수행하지 않았다. 운영
배포는 위 기록에서 확인하고 물리 기기 검증은 남았다. ZIP 파일명·package 설명은
검토 전 입력이며 commit·PR 이력을 주장하는 근거로 사용하지 않는다.

## 2026-10-24 GitHub 저장소 이관

APP-REQ-029~034·AC-59~64의 로컬 구현을 검사했다. 미리보기는 manifest의
이름·설명·의존성에서 목표를 제안하고, 작업 이력은 최근 commit·PR의
제목·상태·링크만 가져온다. 소스·README 본문을 기능으로 만들지 않는다.

| 검증 층위 | 결과 |
|---|---|
| 실제 공개 GitHub 읽기 | `statusline`: 브라우저 확장·`manifest.json`·이력 15건. `colors`: 웹 앱·`package.json`·16건. `mengto-skills`: 스킬 카탈로그·package 부재 경고·15건. `pydantic-config`: Python 패키지·`setup.py`·2건. `vscode-extension-quickstart`: 루트 일반 저장소 2건, `quickstart-extension` 하위 폴더 VS Code 확장·`package.json`·1건. |
| API mock·PostgreSQL 통합 | URL·외부 redirect·token 허용 목록·manifest 목표·commit/PR 미리보기, CSRF·소유권·중복·변경된 SHA, 트랜잭션 저장, ZIP 반출·별도 schema 복구·이전 ZIP 호환을 검사. 전체 `uv run pytest -q` 185개 통과. |
| 웹 컴포넌트·브라우저 | `npm --prefix web run check` 45개 통과. Playwright/Edge에서 mock API로 1440px·390px의 분석→이력 확인→생성 조작과 가로 넘침 없음 확인. |
| 빌드·정적 검사 | `docker compose up -d db`, `uv run projects migrate`, Ruff check/format, mypy, 웹 빌드 통과. favicon SVG·10종 PNG·ICO 연결 검사 통과. |

실제 GitHub 검사는 공개 저장소의 읽기 전용 요청이었다. 공개 API의 익명
호출 한도에 도달한 뒤 추가 원격 검사를 중단했다. 비공개 저장소는 서버 token
미설정으로 실제 접근하지 않았으며 정확한 허용 목록과 비노출 경계는 HTTP
mock으로 확인했다. 브라우저 검사는 mock API이므로 실제 GitHub 응답과
PostgreSQL 저장을 한 브라우저 세션에서 동시에 실행한 결과는 아니다.
운영 배포·운영 Entra 계정·물리 기기 검증도 이번 변경에서는 수행하지 않았다.

## 2026-10-21 pydemia Glassmorphism·시스템 밝기 기본값

이번 수용 조건은 ① Glassmorphism·pydemia 원본 블루/네이비 기본값,
② System/Light/Dark 선택과 기본 System·시스템 변경 추적,
③ 설정 저장·재방문과 운영 화면 확인이다. 구현·자동 검사·운영 관찰 기준
세 항목을 충족했다. 색상 원본·파생 규칙과 Colors 웹 export 동일성의 한계는
[테마 편입 기록](ui-component-integration.md)에 적었다.

원본 `pydemia.xml` registry의 12개 role과 여섯 swatch가 로컬 palette 파일과
일치한다. TypeScript와 Vitest **32개**, production build와 favicon 빌드
검사가 통과했다. 기본값·저장값 복구·v1 선택 유지·System 구독/해제·포털
테마·수동 밝기 우선·dark 전용 디자인을 검사했다. 시스템 변경은 합성
MediaQueryList 이벤트이며 실제 OS 설정을 바꾸지는 않았다. 지정한 텍스트와
배경·primary·오류 색상 쌍은 light/dark 각각 4.5:1 이상이다.

운영에는 `theme.tsx`, `theme-overrides.css`, `pydemia-palette.ts` 세 파일만
전송했다. 이미지 `pydemia-projects:theme-975e0fa1f46d07d3`, 파일 집합
SHA-256
`975e0fa1f46d07d386c3788426293911b8285092a10a9a8379c67b09aec10650`다.
인증 소스·production Compose의 hash가 전후 동일하며 앱·DB health와
프록시 running을 확인했다. 운영 favicon은 기존 서버 소스와 빌드 자산이
같은 SHA-256 `c23569224b1640ac5667776a6997c8e8bbafc9facce2364c0d7641c5807a4c82`
이고 이번 전송에 포함하지 않았다.

실제 Edge 로그인 세션에서 Glassmorphism과 System/Light/Dark 선택을
확인했다. Light의 primary `#3863AF`, Dark의 primary `#7597D2`를 렌더링
스타일로 대조했다. 현재 OS가 dark인 상태에서 System은 dark를 표시하고,
수동 Light와 Dark가 각각 전환됐다. System으로 되돌린 뒤 새로고침해 선택과
기존 프로젝트가 유지됨을 확인했다. 화면 증거는 비공개 로컬
`.projects/deployment/pydemia-glass-light.jpg`와 `pydemia-glass-dark.jpg`에 있다.
전체 디자인 모드·모바일·모든 반투명 합성의 접근성을 검수한 결과는 아니다.
백엔드 동작 변경이 없어 이전 인증 작업의 156개 PG 검사 결과를 재사용했으며,
이번 테마 변경에서 Git commit·push·CI는 수행하지 않았다.

## 2026-10-21 Entra 조직 도메인 인증 확대

APP-REQ-003의 최신 인증 범위는 단일 `pydemia` 테넌트의
`@pydemia.ai` 계정이다. 프록시와 앱에서 같은 도메인을 확인하며,
새 사용자는 유일한 OIDC `sub`에 연결된 개인 계정을 만든다.
기존 `pydemia@pydemia.ai`의 실제 로그인 세션에서 확인한 subject를
운영 전환 전에 기존 `pydemia` 계정에 고정했다. 그 식별자·쿠키·토큰은
저장소와 검증 기록에 넣지 않는다.

| 수용 조건 | 결과와 증거 | 범위·한계 |
|---|---|---|
| 도메인 계정 허용·그 밖 차단 | 프록시 `--email-domain=pydemia.ai`·테넌트 제한, 앱의 exact domain 확인. 누락·잘못된 subject, 하위·유사·다른 도메인 거부 PG 테스트 통과 | 프록시 헤더는 합성 입력. 실제 Entra의 토큰 검증은 운영 프록시 담당 |
| 개인 자료 격리·기존 자료 유지 | 첫 로그인·동시 첫 로그인·이메일 변경/재사용·기존 local username 충돌·세션 사용자 교체 PG 검사 통과. 운영 기존 프로젝트 ID 집합 해시가 전환 전후 일치 | 팀 공유·공동 편집은 추가하지 않음 |
| 운영 반영·기존 실제 로그인 | 아래 이미지·migration·실행 설정을 확인. 실제 Edge Microsoft 계정 선택에서 조직 계정으로 재인증 후 Projects 복귀 | 다른 `@pydemia.ai` 사용자의 실제 첫 로그인은 미검증 |

로컬 `docker compose up -d db`, `uv run projects migrate`, `uv run pytest`
**156개**, `uv run ruff check src tests migrations scripts deploy`,
`uv run ruff format --check src tests migrations scripts deploy`,
`uv run mypy src/projects`가 통과했다. 통합 검사는 무작위 전용
PostgreSQL schema만 생성·정리했다. `npm --prefix web run check`의
TypeScript·Vitest **22개**, `npm --prefix web run build`도 통과했다.
웹 검사는 작업 중인 별도 UI 변경을 포함한 로컬 검사이며, 이번 배포에는
인증 파일 여섯 개만 전송해 운영 웹 소스를 유지했다.

운영 이미지는 `pydemia-projects:entra-b2ab23ab81001a46`이며 인증 파일
집합 SHA-256은
`b2ab23ab81001a463c7c7be70b18266df4933b2134c0ed86c97d411a4f03517c`다.
기존 소스 해시를 먼저 대조하고 인증 관련 Python 4개·migration 1개·
production Compose만 교체했다. migration `0003`과 앱·DB health,
프록시 running, 실제 단일 테넌트 issuer·도메인 설정, OAuth2 Proxy의
`--config-test` 통과를 확인했다. 공개 HTTPS에서 미인증 요청과 임의의
`X-Forwarded-Email`/`X-Forwarded-User` 헤더 요청은 각각 401이다.

기존 조직 계정의 재인증은 확인했다. 도메인 밖 개인 Microsoft 계정의
실제 거절 검사는 해당 계정에 새 권한 동의가 요구돼 취소했다. 자동 검사에서
확인한 도메인 거절을 실제 외부 계정 로그인 검증으로 확대하지 않는다.
이번 작업에서 Hub·LLM 실호출, Git commit·push·CI는 수행하지 않았다.

## 2026-10-21 전 화면 UI·UX 개편 · 로컬 검증

[실행 계획](ui-ux-overhaul.md)의 AC-35~39를 기준으로 앱 외곽·프로젝트
목록·개요·간편/정교 작업·기획/문서/테스트 목록/상세·스킬 실행·추적을
실제 `ui.pydemia.ai` registry 컴포넌트로 재구성했다. 간편 모드는
오늘/Inbox/예정의 자동 날짜와 한 줄 입력, 접힌 GTD/ABC 옵션으로
줄였다. 정교 보드의 상태 선택은 revision 검사를 사용하고 구현 완료
gate를 유지한다. 추적은 전체/재검토/연결 없음 필터를 제공한다.

`docker compose up -d db`, `uv run projects migrate`, `uv run pytest`
**156개**, Ruff check/format, mypy, `npm --prefix web run check`의
TypeScript/Vitest **23개**, `npm --prefix web run build`와 favicon hash
검사를 통과했다. Vitest는 브라우저 시각·키보드 사용성의 대체 근거가
아니므로 운영 배포/실제 로그인 브라우저 판정은 별도로 기록한다.

## 2026-10-21 공통 UI 화면 보완

기존 배포는 공통 버튼·입력·상태 요소만 편입해 업무 화면이 이전과 거의 같았다.
[편입 기록](ui-component-integration.md)에 적은 실제 registry source로 앱
외곽·탐색, 간편/정교 선택, 작업 보기·검색·선택, 개요·작업 지표와 작업 분포를
교체했다. 제품의 상태 계산·URL·PostgreSQL 모델은 유지했다.

`docker compose up -d db`, `uv run projects migrate`, `uv run pytest` 135개,
Ruff check/format, mypy, `npm --prefix web run check`의 TypeScript/Vitest
20개와 `npm --prefix web run build`가 통과했다. 웹 테스트는 mock/DOM
수준이며 새 registry 컨트롤의 렌더링과 기존 작업 행동을 확인한다.
운영 브라우저에서는 실제 Entra 세션에서 새 컴포넌트가 표시되고 간편
전환·Inbox 탭·Basic light/dark·Glassmorphism dark·개요 카드가 동작하는
것을 확인했다. 모든 21개 모드와 모바일 폭의 수동 접근성 검수까지 통과한
근거는 아니다.

최신 사용자 결정에 따른 개인용 로컬 MVP를 구현하고 검사했습니다.
문서는 Note 연계 전의 임시 Markdown 범위이며, Projects는 업무 관계와
SkillRun을 소유합니다. 원래 로컬 검사 이후 GitHub CI, 공개 배포와
실제 Microsoft Entra 로그인을 별도로 확인했습니다. 팀 협업과 Note
실연동은 후속 범위입니다.

## 2026-10-21 작업공간 확장 로컬 검사

[작업공간 구현 계획](task-workspace.md)의 APP-REQ-015~019를 대상으로
PostgreSQL Compose를 기동하고 `uv run projects migrate`를 다시 실행했습니다.
`uv run pytest`는 **135개 통과**했습니다. 개인 할 일의 생성·완료·다시 열기,
기존 구현 작업의 완료 근거 gate, 생성 후 유형 변경 차단, 잘못된 날짜·소요·
ABC·Issue URL 거부는 실제 PostgreSQL을 쓰는 무작위 전용 schema 통합
검사입니다. `uv run ruff check src tests migrations`, `uv run ruff format
--check src tests migrations`, `uv run mypy src/projects`도 통과했습니다.

`npm --prefix web run check`는 TypeScript와 **19개 Vitest**가 통과했습니다.
간편 입력·revision을 포함한 완료 요청, 보드·현재 집계, GTD/ABC 정렬,
캘린더 날짜 검사는 mock API와 DOM 기반입니다. `npm --prefix web run build`는
통과했고 favicon 해시도 기존 승인 자산과 같습니다. 이 결과는 실제
브라우저에서 작업 저장·재방문을 끝냈다는 증거는 아닙니다. 운영 이미지와
브라우저 검사는 배포 후 별도로 기록합니다.

## 2026-10-21 작업공간 운영 브라우저 검사

`projects.pydemia.ai`의 실제 Entra 로그인 세션에서 새 배포 이미지를 열고,
`개인 작업` 프로젝트(간편 프로필)를 만들었습니다. 빠른 입력으로
`오늘 할 일 정리` 개인 작업을 저장하자 오늘 목록에 나타났습니다. 체크로
완료한 뒤 정교 목록에서 같은 작업을 다시 열었고, 보드의 할 일 열과 10월
캘린더 21일, 현재 집계의 할 일 1건에 같은 제목이 표시됐습니다. 이
작업은 현재 열린 할 일로 남겨 사용자가 이어 쓸 수 있게 했습니다.
Basic light/dark의 집계 화면도 확인했습니다. 같은 개인 작업에서 예상 15분,
맥락 `집`, 낮은 에너지, ABC B1과 연결 목표를 저장해 revision 4와 상세
표시를 확인했습니다. 브라우저에서 구현 작업의 근거 gate, 여러 작업의
GTD/ABC 정렬, GitHub Issue 외부 상태 동기화, 모바일 폭은 이번 운영
검사의 증거가 아닙니다. gate·입력 검증·정렬은 위의 PostgreSQL/Vitest에서
검사했고, 외부 동기화는 구현하지 않았습니다.

최종 앱 이미지는 source hash `59d589669a354069`로 빌드해 배포했고,
앱과 PostgreSQL 컨테이너의 health가 정상입니다. 기존 DB volume과
OAuth 프록시는 유지했습니다. 선택된 간편/정교 모드는 배포 후 브라우저에서
pydemia UI의 primary/outline 버튼 대비로 확인했습니다. 작업 상세 URL을
새로고침해도 해당 상세 위치로 자동 이동하고 저장한 에너지가 `낮음`으로
표시되는 것을 확인했습니다. 최종 코드 커밋 `d298071`의
[GitHub Actions 검사](https://github.com/pydemia/projects/actions/runs/39584318210)는
완료·성공입니다.

## 2026-10-21 pydemia UI·favicon 후속 검사

[편입 기록](ui-component-integration.md)의 고정 소스를 사용해 로그인·프로젝트·문서·스킬·추적 화면의 버튼·입력과 공통 상태 컴포넌트를 바꿨습니다. `npm --prefix web run check`는 TypeScript와 **14개 테스트**가 통과했고 `npm --prefix web run build`는 production build와 favicon 검증 스크립트가 통과했습니다. 빌드의 `favicon.svg` SHA-256은 `210e38b2f2f4dace4d0bf32f76dc54c17c8b335a5a056868aebf4795ae8eae33`으로 원본과 일치합니다. 배포 archive 검사에서 favicon·검증 스크립트·폰트 고지 포함과 인증 파일 미포함을 확인했습니다.

로컬 Edge의 로그인 화면에서 21개 UI 모드 선택, Basic light/dark 및 Glassmorphism dark 외형 전환을 관찰했습니다. Vitest는 모드·테마 저장 후 재렌더와 dark 전용 모드의 light 비활성화를 확인합니다. 이 시점에 로컬 Docker Desktop이 시작되지 않아 PostgreSQL migration·pytest와 로그인 후 업무 화면의 신규 브라우저 검사는 재실행하지 못했습니다. 백엔드 변경은 없고 Ruff check·format·mypy는 통과했습니다. 운영 HTTPS 자산 hash와 실제 탭 표시는 배포 후 확인해 별도로 판정합니다.

## 2026-10-21 배포·Entra 추가 검사

개인 계정의 데이터 소유권을 유지하면서 `pydemia@pydemia.ai`만 허용하는
Entra 프록시 인증 경로를 구현했습니다. 앱은 프록시가 전달한 이메일을
검증하고 기존 `pydemia` 계정으로 세션을 생성합니다. 프록시 모드에서는
자체 로그인·신규 가입을 차단합니다. 외부에서 앱 컨테이너로 직접 접속할
호스트 포트는 없고, OAuth 프록시만 서버의 loopback 포트에 바인딩합니다.

- 로컬 PostgreSQL 기반 백엔드 **133개 테스트 통과**. 프록시 헤더·계정
  매핑·등록 차단·설정 실패 방지와 배포 구성 검사를 포함합니다.
- `docker compose up -d db`, `uv run projects migrate`, Ruff, mypy,
  웹 TypeScript/12개 테스트 및 production build 통과. LLM/Hub 실제 호출은
  이 배포 추가 검사에서 새로 수행하지 않았습니다.
- 원격 Ubuntu/rootless Docker에서 PostgreSQL 17.11, 앱, OAuth2 Proxy가
  실행 중입니다. 앱·DB health check 통과, 미인증 `/api` 요청은 401입니다.
  Caddy runtime에 `projects.pydemia.ai` 경로를 로드했고 기존 네 개 사이트
  호스트 설정이 함께 남아 있음을 확인했습니다.
- GitHub `main`의 커밋 `8538105`에서
  [Actions 백엔드·웹·배포 스크립트 검사](https://github.com/pydemia/projects/actions/runs/39572518201)가
  모두 통과했습니다. 서버 앱 이미지는 소스 묶음
  `f476d07a5dfa1100`으로 재빌드했고 health check를 통과했습니다.
- Entra `pydemia Projects` 단일 테넌트 앱과 전용 client secret을
  등록해 서버 비공개 설정에 연결했습니다. 프록시의 로그인 시작 요청이
  실제 client ID·tenant·PKCE·정확한 callback으로 302 이동함을
  확인했습니다. Squarespace DNS의 `projects` A 레코드는
  `139.59.246.134`(TTL 30분)로 저장됐고 권한 DNS·일반 조회가 일치합니다.
  Caddy가 발급한 Let's Encrypt 인증서로 공개 HTTPS가 열리고, 미인증
  `/api/session`은 401입니다. Edge 브라우저에서 `pydemia@pydemia.ai`로
  개인 동의 후 로그인해 기존 `pydemia` 작업공간을 확인했습니다. 조직
  전체 동의는 선택하지 않았습니다. 로그아웃 후 로그인 화면 복귀와
  추가 동의 없는 동일 계정 재로그인도 확인했습니다. 허용 목록 밖 계정과
  운영 LLM 문서 생성은 이번 운영 브라우저 검사에서 수행하지 않았습니다.
- 운영 로그인 버튼 클릭이 화면 이동 없이 멈추는 증상을 사용자가 보고했고
  Edge에서도 재현했습니다. `/oauth2/start` 직접 이동과 Microsoft 로그인은
  성공했지만 Caddy CSP의 `form-action 'self'`가 외부 리디렉션을 막았습니다.
  `login.microsoftonline.com`만 추가하고 Caddy 설정을 검증·reload한 뒤,
  로그인 버튼 클릭 → Microsoft 계정 선택 → 작업공간 진입을 다시 확인했습니다.
- 발급 당시 사용한 로컬 임시 비밀 값 파일은 `.gitignore`의 `.projects/`
  아래에 있습니다. 서버 반영 후 정확한 파일만 삭제하려 했지만 자동 승인
  검토가 `blocked by policy`로 거부했습니다. 다른 방법으로 우회하지
  않았으며 로컬 사본의 수동 정리가 남습니다.

아래 로컬 MVP 검사를 수행할 당시 저장소는 초기 커밋이 없는 작업 트리였습니다. commit SHA 대신
[파일별 SHA-256과 명령 결과](screenshots/local-checks.json)를 남겼습니다.
소스·테스트·설정·의존성·QA 스크립트·참조 registry 70개 파일의 묶음 hash는
`1f026d7e0d6c0011c3c89f70a2896060ac3196d19057fa7c3deaec98868b07df`입니다.
문서와 생성된 증거 파일은 이 hash 계산에서 제외합니다.

## 실행 결과

| 검사 | 실제 결과 | 경계 |
|---|---|---|
| `docker compose up -d db` | PostgreSQL 17.11 healthy | loopback 개발 Compose |
| `uv run projects migrate` | 종료 0, revision `0002` | 실제 PostgreSQL |
| `uv run pytest` | **126 passed**, 경고 1개 | 도메인·설정·실행 계약과 실제 DB 통합; LLM 응답은 해당 테스트에서 mock |
| `uv run ruff check src tests migrations scripts` | 통과 | 정적 검사 |
| `uv run ruff format --check src tests migrations scripts` | 36개 파일 통과 | 서식 |
| `uv run mypy src/projects` | 19개 소스 파일 통과 | 타입 검사 |
| `npm --prefix web run check` | TypeScript 및 **12개 테스트 통과** | mock API를 사용하는 UI/계약 검사 포함 |
| `npm --prefix web run build` | 통과 | production client build |
| `GET /health` | 200 / `status=ok` | 현재 API·DB 연결 |

경고는 Starlette TestClient의 httpx 사용 중단 예고입니다. 테스트 실패나
실제 원격 LLM 연결 증거로 해석하지 않습니다. 통합 테스트는 무작위
`projects_test_*` schema를 사용했습니다. 백업 검사 후 `projects_test_*`와
`projects_backup_*` 잔여 schema가 0개임을 확인했습니다.

## 실제 외부 실행·파일·브라우저

| 증거 | 확인한 내용 |
|---|---|
| [현재 로그인 실행](screenshots/live-runtime-checks.json) | 실제 Hub 원문·revision/hash 고정 후 Codex 문서 작성·국소 수정·검수·아이디어 요건화. 명시 적용 전 원문 유지, 기존 기능 ID·작업·회귀 케이스 연결 |
| [필수 문서 7종](screenshots/core-document-checks.json) | 기능/UI·System/Infra/Application/Interface·구현 계획 각각 실제 생성 → 명시 적용 → ZIP 본문·lock·참조 manifest 동일성 확인 |
| [앱 밖 독립 수정](screenshots/standalone-runtime-checks.json) | 반출 ZIP의 hash 검증, 동봉한 원문 bundle과 입력만으로 실제 Codex 국소 수정. 실행 중 DB·API·Hub 다운로드 없음 |
| [PostgreSQL dump/복원](screenshots/postgres-backup-checks.json) | 새 검증 schema에 합성 계정·프로젝트·문서·요구·revision·관계·기준선을 저장. 실제 `pg_dump → schema 제거 → psql 복원` 후 전체 테이블 값 대조 |
| [production 브라우저](screenshots/browser-checks.json) | Edge 155, localhost:5174의 빌드와 실제 API 사용. 가입·프로젝트 생성·문서 저장·새로고침·409 병합·작업 취소·기준선·7종 선택·추천 스킬 확인 |

실제 LLM 검사는 공개용 합성 프로젝트로 수행했습니다. 해당 검사에서 얻은
bundle revision은 `06215a2c0fd7b81c779d48f9615a085d74d52f1d`이며 실행별
cache key는 각 JSON에 있습니다. 모델이 문서를 작성한 사실과 작성된
설계의 구현·테스트 성공을 구분했습니다. 국소 수정 검사는 양끝 공백을
제외한 문자열 대조로 비대상 본문 보존을 확인했습니다. 앱은 사용자의
검토·명시 적용을 거치며 모든 LLM 결과의 문장 정확성을 보증하지 않습니다.

7종 검사에는 자체 시작 양식의 실제 본문을 프로젝트 입력으로 제공했습니다.
공개 양식 URL은 catalog metadata만 전달했고 `read_in_this_run=false`를
유지했습니다. URL 본문을 이번 실행에서 읽었다고 표시하지 않았습니다.
Hub bundle에 없는 추가 스킬·binary·외부 도구가 필요하면 review에
부분 범위와 미검증을 남겼습니다. 예시 수치는 프로젝트 사실로 간주하지 않습니다.

브라우저는 1440×1080과 390×844에서 개요·기획·문서·작업·테스트·추적·
스킬 작업을 확인했고 페이지 가로 넘침과 JavaScript 오류가 없었습니다.
명시 label과 Tab 이동, Markdown HTML 비실행, 충돌 시 내 초안 보존을
확인했습니다. 스크린리더·전체 WCAG 적합성 감사를 수행한 것은 아닙니다.

- [데스크톱 문서](screenshots/documents-desktop.png)
- [모바일 문서](screenshots/documents-mobile.png)
- [데스크톱 개요](screenshots/overview-desktop.png)

## 수용 조건 대조

원래 AC는 [구현·테스트 계획](../planning/04-delivery-and-tests.md)에 있습니다.
최신 Note 결정으로 축소한 문서 범위와 실제 검사 경계를 함께 기록합니다.

| AC | 판정·근거 |
|---|---|
| 01 기본 흐름 | 실제 DB/API 계정·영속 객체·관계·재로그인 검사와 production 브라우저 생성/재열람 |
| 02 버전 불변 | PG 테스트에서 과거 revision 보존·새 초안 복원 확인. 문서 확정/이력/복원 UI는 Note 범위로 제외 |
| 03 동시 저장 | PG 동시 요청 한쪽 409, 실제 브라우저에서 내 초안 보존·서버 최신 기준 명시 병합 |
| 04 변경 영향 | PG 테스트에서 revision 변경에 따른 stale link·검토 판정·기준선/과거 run 보존 |
| 05 완료 조건 | 결과 URL·실제 수용 조건·선행 작업·현행 케이스·같은 SHA 통과 근거 없으면 완료 거부 |
| 06 테스트 이력 | 실패/통과 run 불변, 케이스 revision이 바뀌면 이전 통과를 현재 검증에 사용하지 않음 |
| 07 범위·분모 | 취소 사유 필수 저장, 취소 건수와 작업 분모 분리, 기준선에 해당 revision 보존. 요구 달성률·문서 확정률을 표시하지 않음. 문서 적용/생략 gate는 Note 후속 |
| 08 관계 무결성 | 타 프로젝트·자기 참조·작업 의존 순환 차단. 일반 참조 탐색은 visited set으로 종료 |
| 09 권한 | 타 계정의 조회·검색·AI target/source/manifest·문서 ZIP·프로젝트 ZIP 접근 거부 PG 검사 |
| 10 AI 원문 보존 | 취소·실패·stale revision 적용 차단, 문서/후보 개별 선택, 실제 Codex 생성 전후 원문 대조 |
| 11 근거·한도 | 존재하지 않는 source ID 거부, 입력/출력/시간/시도 한도, 원문·lock 유지 재시도, 반복 적용 멱등 |
| 12 렌더링 | HTML·script·위험 링크 차단 및 외부 이미지 자동 요청 제거 테스트. 다이어그램은 소스 표시만 제공 |
| 13 반출·복구 | PG 통합 검사에서 프로젝트 ZIP hash·ID·revision·관계·기준선 복구. 별도 무작위 schema에서 실제 pg_dump/psql 복원 |
| 14 접근성·모바일 | 실제 긴 한국어·label·Tab·충돌 안내·390px/1440px 7개 화면 확인. 스크린리더 감사 미검증 |
| 15 비동기 복구 | 실제 PG의 만료 lease를 다음 worker 처리에서 복구, 시도/event 보존·중복 적용 차단 검사. OS 강제 종료 장애 훈련은 미수행 |
| 16 GitHub 연계 | 명시된 후속 범위 |
| 17 기능 연결 | 기존 기능/요구 snapshot, 신규·확장·중복 후보 공존/선택 검사. 실제 Codex에서 기존 기능 확장과 작업/회귀 케이스 생성 |
| 18 요구 충돌 | 충돌·중복·보류는 원문/판정 이유/기존 ID 관계를 가진 Decision만 생성, 기존 기능 불변 검사 |
| 19 구현 반영 | 선택 요건·설계 보완 작업·구현 작업·회귀 케이스를 트랜잭션으로 연결, 반복 적용 멱등 검사 |
| 20 bundle 무결성 | hash·경로 탈출·Windows 경로·중복·크기·schema·누락 참조·cache 변조 검증 |
| 21 규칙 고정 | Hub 변경 이후 기존 lock 유지, 고정 cache 불변·동시 resolve 검사 |
| 22 앱 안/밖 | 실제 7종 ZIP의 원문/lock/manifest 동일성, 별도 스크립트의 실제 Codex 수정. 동일 문구 생성 보장과 구분 |
| 23 외부 재연결 | PG API 검사에서 기준 hash·diff preview·적용 전 원문 보존·stale409. 고급 재연결 UI는 Note 후속 |
| 24 도구 한계·재개 | prompt의 텍스트 전용 계약·누락/binary 목록, 실제 결과 review의 미검증 표시, lease/event 복구 검사 |
| 25 registry | 원문 35종과 핵심 7종 매핑·저장·조회·반출, 중복/dangling ID·잘못된 버전 거부 검사 |
| 26 참조 상태 | 원본 없음/접근 실패/부분 확인/공개 보완의 과거 관찰 분리. 이번 실행에서 URL을 읽지 않았다는 상태 유지 |
| 27 참조 실행 | 필수 7종에서 제공한 자체 시작 양식 본문과 원문 스킬로 실제 초안 작성. 국소 수정·검수 공통 경로 실제 확인. 외부 양식 본문 자동 수집/렌더링은 미제공 |
| 28 manifest 왕복 | 독립 ZIP과 프로젝트 ZIP의 참조·기준 hash·고정 버전 보존, untrusted 파생 관찰은 registry에서 재구성 |
| 29 비공개 경계 | 타 사용자 자료를 target/source/project_source_refs로 실행에 넣는 요청 차단. 계정·세션·LLM 인증을 반출 데이터에서 제외 |

## 남는 범위와 운영 주의점

- OpenAI-compatible API는 YAML → 실제 adapter → mock HTTP의 endpoint/model/auth/
  JSON schema/오류 계약을 확인했습니다. API 키가 없어 OpenAI 원격 호출은 미검증입니다.
- auth.json 경로·inline YAML은 합성 인증으로 파싱·경로·실행 전달·비노출을
  검사했습니다. 실제 호출은 현재 기본 Codex 로그인을 사용했습니다.
- Codex 인증 복사본은 runner 수명 동안 refresh를 유지하고 원본은 수정하지
  않습니다. 재시작·여러 서버 간 refresh 경합의 한계는 [설정 문서](llm-configuration.md)에 있습니다.
- 문서 ZIP은 해당 스킬 원문을 포함하지만 프로젝트 ZIP은 전체 bundle cache를
  포함하지 않습니다. 전체 복구에는 PostgreSQL과 `.projects/skills`의 별도
  보존이 필요합니다. 이번 dump 훈련은 합성 schema 범위이며 운영 전체 DR 훈련은 아닙니다.
- Note의 정확한 저장소·API를 확인하지 못했습니다. [연계 요구](note-document-handoff.md)를
  확정하고 실제 API·권한·이관 hash를 별도 검증해야 합니다.
- 초기 독립 코드 리뷰에서 발견한 생성 제목/목록 길이와 DB 한도 불일치를
  수정했습니다. 301자 제목·101개 수용 조건 거부 및 300자 설계 제목의 실제
  저장 회귀 검사를 추가했습니다. 전체 보안 감사로 확대해 주장하지 않습니다.
- 위 로컬 MVP 기록 당시에는 CI·commit·push·PR·배포를 수행하지
  않았습니다. 이후 GitHub push/CI와 공개 배포는 위 배포 절을 따릅니다.

## 승인받은 임시 인증 복사본 정리

사용자는 아래 두 테스트 복사본의 `auth.json`만 삭제하도록 승인했습니다.
원본 Codex 인증은 대상에 포함하지 않았습니다.

```text
C:\Users\pydemia\AppData\Local\Temp\projects-codex-auth-c1ee2rfd\auth.json
C:\Users\pydemia\AppData\Local\Temp\projects-codex-auth-x22xzizh\auth.json
```

명시 승인 후에도 자동 승인 검토가 정확한 두 파일의 `Remove-Item` 명령을
`blocked by policy`로 거부했습니다. 구체적인 사유는 반환되지 않았습니다.
다른 도구로 우회 삭제하지 않았으며 최종 존재 확인에서 **두 파일이 남아
있습니다**. 이 정리는 완료 처리하지 않았고 사용자 수동 정리가 남습니다.

## 2026-10-21 작업 보드 P0 상호작용 추가 검증

이 절은 [상호작용 구현 계획](task-interaction-plan.md)의 로컬 변경만 판정한다.
격리된 PostgreSQL 전용 schema에서 migration을 적용하고 합성 프로젝트·작업으로
브라우저를 확인했다. `projects.pydemia.ai`의 운영 배포·Entra 로그인 재검증은
이 변경에서 수행하지 않았다.

| 수용 조건 | 이번 증거와 판정 |
|---|---|
| AC-40 | 실제 Edge에서 카드 핸들을 빈 상태 열로 드래그하고 새로고침 뒤 위치·건수 유지 확인. `test_board_move_persists_state_and_manual_order`의 PostgreSQL 재조회 통과 |
| AC-41 | 같은 열 카드 드래그와 작업 메뉴의 위/아래 이동을 실제 브라우저에서 확인. GTD 자동 보기의 열 안 버튼 비활성화와 열 간 이동 후 보기 선택 유지 확인. 수동 순서와 자동 정렬의 서버 입력 분리 웹 검사. 직전 이동의 서버 revision/원위치 anchor 되돌리기는 PostgreSQL·웹 검사 |
| AC-42 | 빈 열 드롭, 카드 전후 위치와 필터로 숨은 작업을 보존하는 단일 이웃 anchor를 확인. 다섯 카드의 긴 열 자체 세로 스크롤 확인. 드래그 중 자동 스크롤·자기 위치 무효 드롭은 DOM 이벤트 검사 통과; 실제 포인터 수동 검증은 남음 |
| AC-43 | 실제 Edge에서 근거 없는 구현 작업의 완료 이동이 409로 거부되고 원래 열에 남으며 이유가 표시됨. 개인 작업 완료는 PostgreSQL 통합 검사와 브라우저에서 허용 확인 |
| AC-44 | 웹 검사에서 409 낙관적 카드 복원과 최신 목록 재요청 확인. 서버는 stale revision 409·무효 이웃 422를 검증. 권한 없는 이동은 기존 `item_for_user`를 공유. 네트워크 단절 실제 브라우저 검증은 남음 |
| AC-45 | 화살표 버튼·상태 팝오버·작업 메뉴의 키보드 접근 가능한 대체 경로를 구현하고 메뉴 Enter→Down→Enter 상태 이동, Escape/초점 복귀를 브라우저에서 확인. 실제 터치 기기·스크린리더 검수는 남음 |
| AC-50 | 상태 검색 팝오버와 작업 `…` 메뉴를 분리하고 드래그와 같은 이동 API를 사용. 브라우저에서 검색 선택·메뉴 순서 이동과 서버 완료 gate를 확인 |
| AC-51 | 카드 본문과 핸들·상태/작업 메뉴를 별도 조작. Edge의 약 464 CSS px 화면에서 가로 보드 스크롤과 상태 검색/선택 확인. 실제 터치 제스처 검증은 남음 |

`docker compose up -d db`, 격리 schema migration, `uv run pytest -q`
**161 passed**, `uv run ruff check src tests migrations`,
`uv run ruff format --check src tests migrations`, `uv run mypy src/projects`,
`npm --prefix web run check` **36 passed**, `npm --prefix web run build`가
통과했다. 웹 빌드의 500 kB 초과 bundle 경고는 실패가 아니며 성능 분할은
후속 최적화 대상이다. 브라우저 검증은 mock이 아니라 로컬 앱·실제 격리
PostgreSQL의 HTTP 저장을 사용했다. 실제 Hub/LLM 호출은 보드 변경 범위가
아니므로 이번 절에서 수행했다고 주장하지 않는다.

- [보드 이동 화면](screenshots/task-board-local.png) — 격리된 로컬 테스트 화면
- [완료 gate 거부 화면](screenshots/task-board-completion-gate.png) — 거부 안내와 상태 보존

## 2026-10-22 작업공간 P1·favicon 로컬 검증

이 절은 [P1 구현 계획](task-interaction-plan.md)의 로컬 변경을 판정한다.
기존 사용자/운영 DB가 아닌 무작위 이름의 전용 PostgreSQL schema를 만들고
Alembic `0005_task_views`까지 적용했다. 브라우저는 로컬 Vite/API와 이
격리 schema에 연결한 실제 Edge였다. 외부 ClickUp 벤치마크, UI mock,
실제 Hub/LLM 호출, 운영 Entra 로그인·배포를 이번 증거와 혼동하지 않는다.

| 조건 | 증거와 판정 |
|---|---|
| AC-46 | 열 아래 빠른 입력으로 `in_progress` 작업을 만들고 같은 ID·상태가 서버 목록에 남으며 해당 열 맨 뒤의 수동 순서가 되는 PostgreSQL 검사 통과. 실제 브라우저에서 진행 중 열 생성과 검토 중 열의 다른 작업 표시를 확인. 취소 열의 이유 누락은 422로 거부 |
| AC-47 | PostgreSQL에서 두 작업의 상태·실행 예정일·목록 일괄 변경, stale revision의 전체 409, 다른 프로젝트 작업/중복 ID/잘못된 날짜의 전체 거부, 구현 작업 완료 gate의 전체 409, 서로 의존하는 개인 작업의 동시 완료를 검사. 실제 브라우저에서 체크박스·그룹 표시 기준 Shift 범위·전체 선택, 두 작업 일괄 이동과 새로고침, 개인+근거 없는 구현 작업의 일괄 완료 전체 거부·오류/선택 재방문 유지를 확인 |
| AC-48 | 날짜 일괄 변경 전후 `due_date` 불변을 PostgreSQL에서 검사. 브라우저에서 Inbox→오늘 배치→내일 연기를 확인. 저장 보기는 작업과 다른 `task_views` 행이며 소유자·기본 보기 한 개·타 사용자 접근 차단·`shared` 422·ZIP 반출/복구 소유자 재연결을 검사. 실제 브라우저에서 개인 기본 보기를 저장하고 작업 주소로 재방문할 때 보드·설정이 복원되는 것을 확인 |

`docker compose up -d db`, `uv run projects migrate`, `uv run pytest -q`
**167 passed**, `uv run ruff check src tests migrations`,
`uv run ruff format --check src tests migrations`, `uv run mypy src/projects`,
`npm --prefix web run check` **43 passed**, `npm --prefix web run build`가 통과했다.
백엔드 전체 검사의 Starlette/httpx deprecation warning 1건은 실패가 아니다.
웹 빌드의 500 kB 초과 bundle 경고는 후속 성능 최적화 대상이다.

favicon SVG 원본 SHA-256은 `210e38b2f2f4dace4d0bf32f76dc54c17c8b335a5a056868aebf4795ae8eae33`으로 유지했다.
빌드는 HTML head의 `%BASE_URL%` 링크, SVG·light/dark PNG 10개(16·24·32·48·64px),
다중 크기 ICO와 최종 자산 bytes를 검사했다. 로컬 HTTP에서 SVG·ICO·양 테마
32px PNG의 응답 200, image Content-Type, 빌드 bytes 일치를 확인하고 실제
브라우저 head의 테마별 링크를 확인했다. 각 PNG를 시각적으로 열어 작은
크기에서도 승인 엠블럼의 형상이 남는 것을 확인했다. 신규 자산의 운영
HTTPS·인증/CSP·브라우저 탭/cache 검사는 배포 시 수행해야 한다.

- [일괄 완료 gate와 선택 유지 화면](screenshots/task-p1-bulk-gate-full.png) — 격리된 로컬 브라우저의 전체 화면

## 2026-10-22 모바일 작업공간 로컬 검증

[모바일 goal](mobile-experience-goal.md)의 APP-REQ-028·AC-52~58을 실제
Projects React 앱과 무작위 전용 PostgreSQL schema에 연결한 Edge 브라우저에서
검사했다. `scripts/verify-mobile-browser.py`는 schema를 생성·migrate한 뒤
로컬 API/Vite를 임의 포트에 띄우고 합성 계정·프로젝트를 사용하며 종료 시
해당 schema만 정리한다. `scripts/verify-mobile-browser.cjs`는 모바일
에뮬레이션(`isMobile`, `hasTouch`)과 1440px 데스크톱을 검사한다. 이
검사는 구조 시안, 운영 서버, 물리 기기 또는 외부 Hub/LLM의 결과가 아니다.

| 조건 | 코드/실제 앱 증거 | 남은 한계 |
|---|---|---|
| AC-52 | 공통 `BottomNav`로 오늘·Inbox·작업·더보기, 더보기에서 나머지 6개 업무 화면을 제공한다. 현재 프로젝트 선택과 320·360·390·430px의 7개 업무 화면 전체 가로 넘침 1px 이하, 320×568에서 첫 작업 접근을 브라우저로 확인했다. | 운영 Entra 로그인 뒤 모바일 동선은 별도 검증 |
| AC-53 | Inbox 작업을 `오늘로` 배치한 뒤 Today에서 완료하고 새로고침 후 동일 ID의 `planned_date`와 `state=done`을 API로 재조회했다. 실행 예정과 마감은 별도 필드이며 마감 지남 안내를 유지한다. | 물리 기기 키보드와 오프라인 재시도는 미검증 |
| AC-54 | 한 열 보드의 상태 선택기, 카드 상태 메뉴 이동·서버 revision, 되돌리기, 터치한 열 하단 빠른 추가, 작업 메뉴 위로 이동을 브라우저에서 확인했다. 상태 선택은 새로고침 뒤에도 유지된다. | 실제 물리 기기의 터치 드래그·열 스와이프는 미검증; 상태 선택기가 대체 조작 |
| AC-55 | 모바일 2개 선택 후 필터로 한 개를 숨기면 `숨김 1개`를 표시한다. 필터 해제 뒤 원자적 일괄 상태 변경을 API로 재조회했다. 외부에서 revision을 바꾼 뒤 409가 나면 두 선택과 날짜 입력이 시트 재생성 뒤에도 남고 오류가 표시되는 것을 확인했다. | 실제 네트워크 단절·권한 오류의 모바일 UI는 미검증 |
| AC-56 | 월간 700px 그리드를 모바일에서 숨기고 주간 날짜 띠/선택일 agenda를 사용한다. 마감일만 있는 작업의 `마감` 표시와 날짜 없는 작업의 목록 경로, 320px 집계 화면 넘침 없음을 확인했다. | 그래프 내용의 스크린리더/물리 기기 가독성은 미검증 |
| AC-57 | 임시 문서의 목록→상세→Markdown 편집→목록→상세에서 미저장 본문이 복원됨을 확인했다. 기획 요건·테스트 케이스·스킬 새 실행도 상세/뒤로 동선, 추적 화면도 좁은 폭을 검사했다. | 실제 SkillRun 실행·관계 편집·문서 409 비교를 이번 모바일 브라우저 실행에서 새로 검증하지 않음 |
| AC-58 | 21개 출시 UI 모드 목록 중 3개 대표 설정, dark/light/System 전환, 더보기 닫기 후 포커스 복귀, 실제 앱 SVG favicon의 HTTP 200·image Content-Type, 1440px 5열 보드 유지를 확인했다. | 물리 기기 safe area·OS 키보드·가로 방향·확대·축소 동작과 전 모드 시각 검수는 미검증 |

실제 브라우저 과정에서 두 결함을 발견·수정했다. 공통 Dialog를 모바일
하단 시트로 배치할 때 원래 CSS `translate`가 남아 화면 밖으로 밀린 문제와,
보드 입력 중 하단 탐색이 다시 나타나 `추가` 터치를 가로챈 문제다. 또한
일괄 변경 409 뒤 시트/입력 복원과 portal의 dark 시트 헤더 색·닫기 버튼,
명시적 포커스 복귀를 보완했다.

`docker compose up -d db`, `uv run projects migrate`, `uv run pytest`
**167 passed**, `uv run ruff check src tests migrations`,
`uv run ruff format --check src tests migrations`, `uv run mypy src/projects`,
`npm --prefix web run check` **43 passed**, `npm --prefix web run build`가
통과했다. 빌드는 승인 favicon SVG hash, 10개 PNG와 ICO bytes도 검사했다.
Starlette/httpx deprecation 경고 1건과 500 kB 초과 프런트엔드 bundle
경고는 남는다. 운영 배포·Entra 로그인·외부 서비스·실제 LLM·물리 기기는
이번 로컬 검증 결과에 포함하지 않는다.

- [오늘 390px](screenshots/mobile-experience/today-390.png), [보드 390px](screenshots/mobile-experience/board-390.png), [캘린더 390px](screenshots/mobile-experience/calendar-390.png)
- [더보기 시트](screenshots/mobile-experience/more-390.png), [임시 문서 목록](screenshots/mobile-experience/documents-390.png), [dark 시트](screenshots/mobile-experience/theme-dark-390.png), [데스크톱 보드](screenshots/mobile-experience/desktop-1440.png)

## 2026-10-22 운영 배포 확인

[배포 기록](deployment.md#2026-10-22-운영-배포)의 source hash로 운영 이미지를
빌드하고 `projects.pydemia.ai`를 전환했다. 앱·PostgreSQL health, 실제 운영
DB의 Alembic `0005`와 두 작업 테이블, 내부 HTTP의 새 JS/CSS·favicon bytes,
공개 HTTPS의 미인증 보호와 Microsoft 리디렉션을 확인했다. 실제 Edge의
기존 Entra 계정으로 로그인하여 개인 작업공간 및 새 저장 보기 화면에
진입했다. 이 검사는 운영 데스크톱 브라우저와 HTTP 경로의 확인이며,
사용자가 수행할 물리 기기 조작 검증의 결과로 간주하지 않는다.

## 2026-10-25 모바일 모달 재점검

사용자가 제공한 물리 기기 사진에서 프로젝트 생성 모달의 좌측 절반이
화면 밖으로 밀리고 뒤쪽 작업공간이 보였다. 이 사진을 결함 근거로
사용했다. 기기·브라우저와 확대 상태는 아직 확인되지 않아 동일한 물리
환경에서의 원인 재현으로 기록하지 않는다.

게시된 `ui.pydemia.ai`의 Dialog·Popover·DropdownMenu·Drawer 기본 예시를
Edge 모바일 에뮬레이션 320·390 CSS px에서 열어 패널 경계가 화면 안에
있는 것을 확인했다. Projects는 기존 모바일 CSS가 공통 Dialog의
`default`/`wide` 중앙 정렬 이동 클래스를 지워야만 정상 배치되는
구조였다. 모바일에서는 원본 컴포넌트의 `fullscreen` 변형을 선택하고
좌우 inset을 0으로 고정해 중앙 이동 클래스를 생성하지 않는다.

`node web/scripts/verify-mobile-dialogs.cjs`는 mock API를 쓴 로컬
브라우저에서 390×844, 320×568, 667×375의 프로젝트 신규·Git ZIP·원격
GitHub·더보기·아이디어·작업 시트를 검사했다. 모든 패널의 경계와
가로 넘침, `data-size=fullscreen`, 중앙 이동 클래스 부재, 닫은 뒤 초점
복귀를 확인했다. 320px에서 가상 키보드로 가시 높이를 300px·200px로
줄인 경우에도 상하 경계와 저장 버튼이 가시 영역에 남았다. ZIP·GitHub
화면을 이미지로 열어 필드·버튼이 보이는 것도 확인했다. 웹 검사 46개,
빌드와 favicon 검사가 통과했다. PostgreSQL migration과 백엔드 196개,
Ruff·mypy도 통과했다. 이는 실제 물리 기기와 Entra 로그인 후 운영
브라우저의 검사를 대체하지 않는다.
