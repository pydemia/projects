# ClickUp 벤치마크와 Projects 작업 목록 개선

## 승인된 시안 적용

2026-11-24 사용자는 세 시안을 모두 적용하고, 전체 작업에서 여러 프로젝트를
한꺼번에 보거나 필요한 프로젝트를 골라 개인 보기로 저장하기로 결정했다.
부모·하위 작업 관계와 그래프를 추가해 같은 작업을 목적에 따라 다른 보기로 확인한다.
[Proto R1](https://proto.pydemia.ai/projects/task-list-ux/r1/)

| 목록 보기 | 표시와 동작 |
| --- | --- |
| 상태별 목록 | 상태별로 접을 수 있는 작업 그룹을 표시한다. 기존의 목록별·그룹 없음 설정도 선택할 수 있다. 기존 오늘 범위 진입은 오늘의 그룹 순서를 사용한다. |
| 마감 우선 | 열린 작업을 마감일 순서로 조회한 뒤 기한 지남, 오늘 마감, 다음 마감, 마감일 없음으로 묶는다. 같은 부모 아래 보이는 작업은 가장 급한 작업의 기한에 맞춰 함께 배치한다. 종료한 독립 작업은 마지막에 배치한다. 넓은 목록의 첫 열은 마감일이다. |
| 목록·상세 | 선택한 작업은 넓은 화면에서 오른쪽에 표시한다. 좁은 데스크톱에서는 대화상자, 모바일에서는 상세 화면으로 연다. 보기 전환 중에도 선택과 입력 내용이 유지된다. |

전체 작업에서는 읽을 수 있는 프로젝트를 한 목록에 표시한다. 프로젝트 필터에서
하나 이상을 고르면 선택 범위가 서버의 집계·검색·페이지 나누기에 먼저 적용된다.
개인 보기는 프로젝트 선택과 목록 방식, 기존 검색 조건을 함께 저장한다. 접근 권한이
사라진 프로젝트가 저장된 경우 현재 권한 범위에서 조회하며, 해당 프로젝트만 선택한
보기는 비어 있는 결과를 표시한다.

| 작업 보기 | 표시 기준 |
| --- | --- |
| 목록 | 상태별 목록, 마감 우선, 목록·상세 중에서 선택한다. |
| 보드 | 작업을 상태별 칸반 열에 표시한다. |
| 그래프 | 부모에서 하위 작업으로 실선을, 선행 작업에서 후행 작업으로 점선을 표시한다. 연결이 없는 작업은 별도로 열 수 있다. 노드를 선택하면 같은 상세 화면을 연다. 현재 필터에 포함된 작업 사이의 관계를 표시한다. |
| 캘린더 | 실행 예정일이나 마감일을 기준으로 날짜별 작업을 확인한다. |
| 집계 | 현재 범위의 작업 상태와 집계를 확인한다. |

작업 상세에서 같은 프로젝트의 작업 하나를 부모로 지정하거나 해제한다.
목록은 하위 작업을 부모 바로 아래로 들여쓰고 부모 행에서 접거나 펼친다.
부모가 현재 결과에 없으면 조건에 맞는 하위 작업을 목록에 표시하고 하위 작업임을
표기한다. 계층 안의 작업을 다른 프로젝트로 이동할 때는 연결된 작업을 함께 선택한다.
저장은 기존 관계의 `subtask_of` 유형을 사용하며 순환과 프로젝트 간 부모 지정을 차단한다.

ClickUp의 목록·보드·캘린더 전환, 하위 작업 펼치기, 선행 관계 표시 방식을 참고했다.
[작업 보기](https://help.clickup.com/hc/en-us/articles/6310172583831-Use-Task-views) ·
[하위 작업](https://help.clickup.com/hc/en-us/articles/6310382044567-Create-and-edit-subtasks-in-List-and-Board-view) ·
[선행 관계](https://help.clickup.com/hc/en-us/articles/12305064244247-Create-Dependency-Relationships-in-views)

## 승인된 보기와 하위 작업 검증

| 환경 | 확인 결과 |
| --- | --- |
| Chromium · 합성 API | 데스크톱·모바일의 세 목록 보기와 프로젝트 선택·저장·복원, 부모 지정·해제, 검색 결과 밖 상세, 그래프의 연결·상세·저장을 확인했다. 기본 14개, 계층·그래프 14개, 추가 경계·중첩 대화상자 6개를 통과했다. 계층 제목은 1440px와 390px에서 깊이마다 들여쓰고 같은 깊이에서는 같게 정렬했다. `final-summary.json`과 화면 캡처에 기록했다. |
| PostgreSQL·Python | 격리된 schema에서 442개가 통과했다. 계층 저장·권한·순환·동시 변경·프로젝트 이동·내보내기/가져오기와 전역 프로젝트 필터를 검사했다. Ruff lint·format, mypy도 통과했다. |
| 웹 자동 검사 | TypeScript, Vitest 292개, 프로덕션 빌드와 favicon 검사가 통과했다. Vite는 번들 크기 경고를 표시했다. |

반영과 검증 범위는 로컬 작업공간이다.

## 관찰 근거

2026-11-24에 REA 6.7.0의 `capture-browser-scenario`로 새 Chromium 프로필에서
ClickUp 공개 List view 두 곳을 1440 × 920으로 열었다. 접근성 트리와 캡처를
확인하고 공개 목록에서 그룹 접기, 제목 검색, 상세 열기를 시도했다. 앱 화면은
공개 공유 권한으로 관찰했고 편집·저장 보기·상세 배치는 ClickUp 도움말에서 확인했다.

| 근거 | 확인 내용 | REA Evidence |
| --- | --- | --- |
| [Worktivity 공개 로드맵](https://sharing.clickup.com/4614022/l/h/4ctw6-2880/a36c6fb9d1c9886) | 상태명과 개수를 접힌 그룹에도 표시한다. `Collapse group` 실행 후 작업 행이 숨겨지고 그룹 헤더가 유지됐다. | `worktivity-evidence.json`, `clickup-interactions-evidence.json` |
| 같은 로드맵의 제목 검색 | 검색을 실행하자 여섯 건의 검토 그룹이 한 건으로 줄었다. 해당 작업의 체크박스, 상태, 제목 링크와 유형이 각각 노출됐다. | `clickup-search-evidence.json` |
| [Earth Stripes 공개 로드맵](https://sharing.clickup.com/10552948/l/h/a21km-1267/756c96ab4c4577c) | 작업 제목, 마감일, 우선순위가 같은 열에 반복 정렬되고 보조 필드는 오른쪽으로 이어진다. | `earth-stripes-evidence.json` |
| 공개 로드맵의 상세 링크와 [ClickUp 상세 배치 도움말](https://help.clickup.com/hc/en-us/articles/29665520762647-Task-layouts) | 공개 링크 클릭 후 접근성 트리에 상세 패널이 나타나지 않았다. 오른쪽에 작업을 여는 배치는 공식 문서에서 확인했다. | `clickup-detail-evidence.json` |

## 시안 검토 전 목록 개선

| 읽기 동작 | 적용 내용 |
| --- | --- |
| 목록을 열고 작업 찾기 | 빠른 추가는 제목 줄에 배치한다. 검색·상태·그룹을 목록 바로 위에 두고 모바일에서는 보기·필터에서 접근한다. 전역 목록의 프로젝트 선택과 서버 조회 범위·일부 결과 안내를 유지한다. |
| 상태나 목록 단위로 훑기 | 두 밀도에서 상태별·목록별 그룹을 선택할 수 있다. 각 그룹에 현재 불러온 작업 수를 표시하고 헤더에서 접거나 편다. 기존 보기 설정이 없는 경우 기존 정렬과 그룹 없음으로 시작한다. 오늘 범위는 마감 지남·오늘·미처리 계획 순서를 사용한다. |
| 다음에 처리할 작업 확인 | 한국 날짜 기준으로 열린 작업에 `지연` 또는 `오늘`을 표시한다. ABC 구분에는 문자와 색을 함께 사용한다. 좁은 화면에서는 필드명과 값을 제목 아래에 둔다. 넓은 표를 가로로 움직여도 작업 제목과 상태 조작이 표시된다. |
| 작업의 맥락 유지 | 넓은 화면에서 목록 옆에 상세를 열고 현재 행을 표시한다. 모바일에서는 상세에서 목록으로 돌아간다. Story 펼치기, 제목 열기, 상태 변경, 일괄 선택을 개별 조작으로 제공한다. |

그룹 접기 상태는 현재 작업 화면에서 유지한다. 이미 선택한 작업은 그룹을 접어도
일괄 선택에 남고 선택 도구에 숨김 수를 표시한다. 화면에 있는 작업을 전체 선택하거나
Shift로 범위를 선택할 때는 펼쳐진 행을 사용한다.

Projects의 기존 색상·폼·메뉴를 재사용했다. 작업 상태, 완료 요건, 권한과 revision
검사, 조회 경로는 기존 계약을 따른다. 목록 상단 컨트롤의 배치는 ClickUp의 List view
설계와 공식 보기 문서를 참고했다. [ClickUp List view](https://help.clickup.com/hc/en-us/articles/6310260883351-Intro-to-List-view) · [보기 컨트롤](https://help.clickup.com/hc/en-us/articles/35368731425175-The-views-control-bar)

## 시안 검토 전 검증

| 환경 | 결과 | 재현 근거 |
| --- | --- | --- |
| Chromium · 전체 작업 | 1440px에서 제목 검색, 상태 필터, 선택, 상태 변경, Story 펼치기, 두 밀도의 그룹 접기·펼치기, 목록 옆 상세, 8개 필드 스크롤 시 제목 고정을 확인했다. 1024px와 390px에서 페이지의 가로 넘침을 검사했고 390px에서 필터와 상세 복귀를 실행했다. | `final-verification.json`, `final-extended.json` |
| Chromium · 프로젝트 작업 | 1440px와 390px에서 검색, 상태 필터, 선택, 상태 변경, 상세 복귀를 실행했다. | `project-local-verification.json` |
| Chromium · 화면 비교 | 같은 합성 데이터에서 1440px 첫 작업 행은 y=732px에서 y=548px로 올라갔고, Story가 연결된 첫 행은 약 105px에서 66px로 줄었다. 390px와 기본 다크 테마에서 제목·날짜 표시를 확인했다. | `original-geometry.json`, `final-geometry.json`, `original-desktop.png`, `final-desktop.png`, `final-mobile.png`, `final-dark-mobile.png` |
| 웹 자동 검사 | TypeScript와 Vitest 290개, 프로덕션 빌드 및 favicon 검사 통과 | `npm --prefix web run check`, `npm --prefix web run build` |
| PostgreSQL·Python | 로컬 DB 기동과 마이그레이션 및 테스트 428개, Ruff lint·format, mypy 통과. 기본 pytest 임시 경로가 Windows에서 접근 거부되어 새 전용 `--basetemp` 경로로 재실행했다. | `docker compose up -d db`, `uv run projects migrate`, `uv run pytest --basetemp <새 경로>`, `uv run ruff check src tests migrations`, `uv run ruff format --check src tests migrations`, `uv run mypy src/projects` |

브라우저에서는 합성 API 응답을 사용했다. Python 통합 검사는 각각의 전용 PostgreSQL
schema에서 실행했다. 이번 검증 범위는 로컬 작업 화면과 저장소 검사이며 운영 배포와 실제
Hub·LLM 호출은 수행 범위에 포함되지 않았다. Vite 빌드에는 번들 크기 경고가 남았다.
