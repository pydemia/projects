# Story·Task·반복 기획 구현 검증

2026-11-09 · [실행 기준표](story-task-goal.md)의 동일 가중치 21개 조건 중
현재 **21/21(100%) 완료**다. 운영 반영·공개 검증까지 통과했고 필수 잔여 작업은 없다.
완료 판정 신뢰도는 높으며 실행하지 않은 외부 경계는 아래에 구분한다.

## 구현과 검증 범위

[설계](story-task-design.md)·[구현계획](story-task-implementation-plan.md)을 기준으로
Story를 requirement에 확장하고 Task·처리 상태·자료 확정·명시 검증을 분리했다.
기획은 최초/진행 중 동작이며 영속 초안·선택 미리보기·원자 적용·현재 권한과 revision·
중복 receipt를 사용한다. 선택적인 상위 일정과 일정 snapshot은 기존 Item 기준선과 분리했다.
private 초안은 ZIP으로 반출하지 않으며 schema 3는 1/2를 읽고 imported proof를 과거 근거로만 표시한다.

| 검사 | 실제 결과·경계 |
|---|---|
| `docker compose up -d db`, `uv run projects migrate` | 실제 PostgreSQL·0016 이관 성공 |
| `uv run pytest -q` | 424개 통과, 529.88초. 실행 중 UI mock과 구분. 기존 Starlette deprecation warning 1개 |
| 후속 기획 receipt 경합 변경 | `tests/test_planning.py` 18개 통과; 현재 결과 소속 프로젝트 전체 잠금·멤버 철회 양쪽 lock winner 검증 |
| 일정/이동 통합 변경 | `test_story_schedule_transfer.py` + 기존 transfer 9개 통과; preview fingerprint·배정 종료·날짜 보존·undo/오래된 배정 거부 |
| `uv run ruff check src tests migrations` | 통과 |
| `uv run ruff format --check src tests migrations` | 95개 파일 통과 |
| `uv run mypy src/projects` | 44개 소스 통과 |
| `npm --prefix web run check` | 38개 파일·277개 검사 통과; provider 응답 mock 검사는 실제 서버 증거와 분리 |
| `npm --prefix web run build` | TypeScript·Vite·favicon 통과; 기존 큰 bundle 안내는 남음 |
| 실제 Edge | 실제 FastAPI·PostgreSQL·React, network mock 없이 1440×1000·390×844 10개 흐름 통과, 페이지 runtime 오류 없음 |
| 소스/assistant 보존 | 실제 운영 0013 원문/hash 복원, assistant/Note PG 22개 통과; [lineage 기록](story-task-runtime-lineage.md) |

전체 pytest 최초 실행에서 작성 중이던 새 테스트 fixture 두 개가 잘못된 완료 생성·문서 전용
portable endpoint 호출로 실패했다. 각 fixture를 실제 계약으로 수정하고 전체 424개를 다시
통과했다. 이후 receipt 잠금 보강은 해당 전체 18개와 정적 검사를 다시 실행했다.

실제 브라우저의 10개 흐름은 최초 생성/취소, 반복 기획·독립 선택·공유 Task, 명시 검증과
범위 변경 후 재확인, 4개 Task 보기·이전 URL, Iteration·snapshot diff·날짜 보존,
모바일 overflow, 실제 401→로그인 후 초안 복원/무재전송, viewer 제어와 runtime 오류를 확인했다.
목록·보드의 두 Story chip, 수용 조건 없는 검증 차단과 조건별 근거 입력도 실제로 확인했다.
무작위 전용 schema는 각 실행 finally에서 제거했고 최종 harness가 제거 여부를 확인했다.
실행 파일은 [브라우저 검사](../../tests/browser-story-task.cjs), screenshots/결과는
로컬 `.projects/research/story-task/`에 있다. 물리 모바일 기기 검사는 하지 않았다.

## 독립 리뷰와 수정

- 선택한 새 선행 관계보다 완료 변경이 먼저 검사되던 문제를 최종 graph·선택 state map으로 수정했다.
  선행 Task 동시 완료를 순서와 무관하게 허용하며, 관계만 추가할 때 과거 Done을 임의 재검사하지 않는다.
- Story 범위를 바꿨다가 되돌려 과거 검증이 다시 유효해지던 문제를 수정했다. 이후 모든 불변 revision과
  최신 proof를 대조하며 일반 PUT으로 보류→충족을 다시 만들 수 없다. 명시 검증은 가능하다.
- SkillRun seed의 정상 Task/설계 변경 연결 위치·ID와 run.apply/검토 Decision 감사 계약을 보강했다.
- 일정 배정 revision이 이동 후 초기화되는 ABA 문제를 단조 증가 revision으로 수정했다.
- receipt 재시도의 현재 프로젝트 소속·관계 프로젝트·현재 권한을 한 번의 정렬 잠금 범위로 재검사한다.
- 실제 브라우저에서 조건별 근거 없이 검증 버튼이 활성화되던 문제를 필수 입력·submit guard로 수정했다.
- mobile Story의 짧은 속성 본문에 불필요한 최소 높이를 줄이고 기획 checkbox 선택 대비를 보정했다.

새 Graph 완료/검증 재사용 문제는 reviewer가 실제 PG로 재현·수정 후 재검증했다.
후속 기획/이동 17개도 reviewer가 독립 실행했다. 마지막 receipt 경합은 source 검토 의견에서
파생한 보강이며 구현 담당자의 deterministic PostgreSQL 경합 검사로 확인했다.

## 실행하지 않은 외부 경계

실제 Hub·실제 LLM 신규 호출·Note 서비스 원격 쓰기·다른 Microsoft 실계정 승인은 실행하지 않았다.
기존 API 계약과 실제 PostgreSQL assistant/Note 검사를 보존하고, SkillRun은 저장한 합성 결과의
원문/revision/hash·선택 적용 경계를 검사했다. 이를 실제 외부 provider 성공으로 확대하지 않는다.
운영 배포와 공개 브라우저 검증은 아래 후속 기록으로 별도 판정한다. commit/push/PR은 하지 않았다.

## 운영 반영과 최종 공개 검증

- source: `15728ec5d0015de84be04f61d147bcd29f9a24588dbdbb2c411323c8a712b8e5`
- image: `pydemia-projects:story-15728ec5d0015de8`, ID `sha256:058fa35f32be33e8b18a6b069bf663d7a88b148222018012f1adbe22de94ede4`
- private 백업 후 0013→0016 이관, 기존 모든 업무 테이블의 count·내용 hash 동일. 새 8개 테이블은 cutover 시 비어 있었다.
- 기존 app env/mount/Cmd/User, assistant principals, Caddy와 ingress container ID를 보존했다. app/DB healthy·proxy/edge running.
- 계정 1개·프로젝트 7개·Item 29개·역할 21개·멤버십 7개 보존. 실제 운영의 7개 계정/프로젝트 읽기 모델을 read-only transaction으로 확인했다(Story 1·Task 26).
- 내부 모든 92개 payload 파일·27개 정적 자산 bytes를 대조했다. 공개 16개 shell/JS/CSS/favicon의 bytes·MIME·CSP와 데이터/assistant API의 비로그인 거부를 확인했다. 폰트 11개는 기존 공개 인증 정책을 유지한다.
- 기본 Python client UA의 공개 요청은 403이었다. 같은 경로의 browser UA·실제 Edge는 통과했다. 공개 정책을 완화하지 않고 두 결과를 구분했다.
- 실제 운영 Edge 583/390px dark·1440px light 로그인 공간/overflow, 자산 hash, 데이터 API 401, Microsoft 시작의 302·S256, 새 Story/기획 draft 경로의 rd 보존과 runtime 오류 없음을 확인했다.
- 최종 앱·migration·웹·테스트 및 dist bytes를 frozen manifest와 다시 대조했다. 이후 완료 문서 갱신은 배포 전 source snapshot과 별도인 검증 기록이다.

운영 인증 후 Story 쓰기·실제 Microsoft 계정 승인은 대신 실행하지 않았다. 동일 구현의
실제 PostgreSQL·API·React 쓰기 흐름은 격리 schema의 실제 Edge 10개 검사로 확인했다.
배포 상세·서버의 private 복구 경로는 [배포 기록](deployment.md)의 최신 절을 따른다.
