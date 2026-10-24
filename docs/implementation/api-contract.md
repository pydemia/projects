# 첫 제품 API 명세

2026-10-21 · 구현 기준 · `/api` · JSON · snake_case

오류는 `{detail: string}`과 HTTP 400/401/403/404/409/422/503으로 구분한다.
리스트 응답은 배열이며 생성·수정은 객체를 반환한다. 모든 ID는 UUID 문자열이다.
인증 cookie는 HttpOnly·SameSite=Lax이며 POST/PUT/DELETE에는 로그인 응답의
`csrf_token`을 `X-CSRF-Token`으로 보낸다. Vite는 `/api`를 API로 proxy한다.

## 계정·프로젝트

- `GET /health` → `{status: "ok"}`
- `GET /api/session` → `{user: {id, username}, csrf_token}` 또는 401
- `POST /api/auth/register`, `/api/auth/login` 입력 `{username, password}`
  → session 응답. `POST /api/auth/logout` → `{ok: true}`
- `GET /api/projects`, `POST /api/projects` 입력 `{name, goal, profile}`
  → Project `{id, name, goal, profile, version, created_at}`
- `GET /api/projects/{id}` → Project
- `GET /api/projects/{id}/summary` → `{items_by_kind, tasks: {done, total, cancelled},
  artifacts: {confirmed, total}, tests: {passed, total}, needs_review}`

## 업무 객체·revision

- `GET /api/projects/{id}/items?kind=&q=` → Item[]
- `POST /api/projects/{id}/items` 입력 `{kind, title, body, data}`
- `GET /api/items/{id}` → Item
- `PUT /api/items/{id}` 입력 `{expected_revision, title, body, data}`
  → 새 revision. `POST /api/items/{id}/confirm` 입력 `{expected_revision}`
- `GET /api/items/{id}/revisions` → ItemRevision[]
- `POST /api/items/{id}/restore` 입력 `{expected_revision, revision}`
  → 과거 내용을 새 초안 revision으로 복원

Item = `{id, project_id, kind, title, body, data, revision, status,
created_at, updated_at}`. status는 `draft|confirmed|archived`다.
ItemRevision = `{revision, title, body, data, status, created_at}`.
동시 저장의 기준 revision이 다르면 409이며 어느 본문도 삭제하지 않는다.

kind별 data는 다음과 같다. 생략 시 기본값을 적용한다.

| kind | data |
|---|---|
| idea | `{source_url: "", notes: ""}` |
| feature | `{current_behavior: "", evidence_url: "", target_sha: ""}` |
| requirement | `{category: "functional", acceptance_criteria: [], priority: "medium", disposition: "new", feature_ids: [], excluded_reason: ""}` |
| artifact | `{artifact_type: "application-design", template_ref: null, template_version: null, example_refs: [], inspection_status: "unverified", project_source_refs: []}` |
| task | `{state: "todo", acceptance_criteria: [], result_url: "", target_sha: "", requires_test: true, cancellation_reason: ""}` |
| test_case | `{steps: [], expected: ""}` |
| decision | `{reason: "", alternatives: []}` |

task.state는 `todo|in_progress|in_review|done|cancelled`이며 done 전환은
결과·수용 조건·연결된 현행 테스트를 확인한다. 데이터 필드는 종류별로 검증한다.
cancelled 전환에는 취소 사유가 필요하며 작업 완료율의 분모에서 제외한 건수를
별도로 반환한다. 기준선의 revision으로 당시 사유를 조회할 수 있다.

## 관계·테스트·기준선·영향

- `GET /api/projects/{id}/links` → Link[]
- `POST /api/projects/{id}/links` 입력 `{source_id, target_id, relation}`
  → `{id, project_id, source_id, target_id, relation, source_revision,
  target_revision}`. relation=`source|implements|verifies|depends_on|relates_to`.
  작업 선행 관계는 `작업 → 선행 작업` 방향이며 순환·타 프로젝트 연결을 거부한다.
- `DELETE /api/links/{id}` → `{ok: true}`
- `GET /api/projects/{id}/test-runs` → TestRun[]
- `POST /api/items/{test_case_id}/test-runs` 입력
  `{outcome, actual, environment, target_sha, evidence_url}`
  → `{id, project_id, case_id, case_revision, outcome, actual, environment,
  target_sha, evidence_url, created_at}`. outcome=`passed|failed|aborted`.
- `GET /api/projects/{id}/baselines`, `POST /api/projects/{id}/baselines`
  입력 `{name}` → `{id, name, revisions: {item_id: revision}, created_at}`
- `GET /api/projects/{id}/trace` → `{requirements: [{item: Item,
  links: Link[], needs_review: boolean}], stale_links: Link[]}`
- `POST /api/links/{id}/review` 입력 `{expected_source_revision,
  expected_target_revision, impact: "none"|"action_required", reason}`
  → Link. 영향 없음은 현재 revision에 연결, 영향 있음은 조치 전까지 재검토 유지.

## 양식·스킬·실행

- `GET /api/catalog` → `artifact-templates.json` 구조. `artifacts` 35종과
  핵심 7종의 `document_profiles` 매핑을 분리한다.
- `GET /api/runtime` → `{configured, provider, model, capabilities: string[]}`
- `POST /api/skills/resolve` 입력 `{skill_ids: string[]}`
  → `{bundles: [{id, source_revision, cache_key, files: [{path, sha256}]}]}`
- `GET /api/projects/{id}/runs` → SkillRun[]
- `POST /api/projects/{id}/runs` 입력
  `{operation, instruction, target_id: string|null, skill_ids: string[],
  source_ids: string[], reference_manifest: object}` → SkillRun
  operation=`write_document|revise_document|review_document|analyze_idea|plan`.
  target_id=null이면 독립 문서 초안을 결과로 만든다. source_ids는 현재
  프로젝트 객체만 허용한다. reference_manifest는 artifact data 필드와 같다.
- `GET /api/runs/{id}` → SkillRun `{id, project_id, operation, instruction,
  target_id, target_revision, status, skills_lock, reference_manifest,
  source_snapshots, result, error, created_at, updated_at, applied_ids}`
  status=`queued|running|review_ready|failed|cancelled|applied`.
- `POST /api/runs/{id}/cancel`, `/retry` → SkillRun
- `POST /api/runs/{id}/apply` 입력 `{selected_indices: number[], apply_document: boolean}` → SkillRun
  apply_document 기본값은 false다. 문서와 요건 후보를 독립적으로 선택한다.
  문서 결과는 target revision을 대조하고 새 초안으로 저장한다.
  아이디어 후보는 선택한 요건·설계 변경 요청·작업·테스트만 연결 생성한다.
  적용한 run은 반복 적용해도 중복 생성하지 않는다. 충돌은 409다.

result = `{document: string|null, review: string,
requirements: Candidate[], assumptions: string[], questions: string[],
source_ids: string[]}`.
Candidate = `{title, body, acceptance_criteria: string[], feature_ids: string[],
disposition: "new|extend|change|merge|duplicate|conflict|defer", rationale,
design_changes: [{artifact_id, instruction}],
tasks: [{title, body, acceptance_criteria: string[]}],
tests: [{title, steps: string[], expected}]}`.
LLM 결과는 이 스키마와 실제 source/feature/artifact ID를 검증한다.
conflict/defer 후보는 결정 기록까지만 남기며 실행 작업을 자동 채택하지 않는다.

## 독립 문서·반출·재연결

- `GET /api/items/{id}/portable` → ZIP 다운로드. 문서·기준 hash·
  request.md·skills.lock.json·원문 bundle·참조 manifest·standalone 안내 포함.
- `POST /api/items/{id}/reconnect` 입력
  `{base_revision, base_sha256, body, provenance: object|null, preview: true}`
  → `{conflict, diff, current_revision, body_sha256}`.
  preview=false이면 충돌 없는 외부 결과를 새 초안으로 저장한다.
  충돌 시 409이며 수동 병합 전 양쪽을 보존한다.
- `GET /api/projects/{id}/export` → manifest·현재/과거 revision·관계·
  baseline·실행·검증 기록을 포함한 ZIP 다운로드.
- `POST /api/projects/import` 입력 `{archive_base64}` → Project.
  해시·형식·크기·경로·참조를 검증하며 ID 충돌을 거부한다.

## Git 소스에서 프로젝트 생성

- `POST /api/projects/from-git/preview` 입력 `{repository_url, path?}` →
  URL·기본 branch SHA·package 근거·선택 가능 폴더·최근 commit/PR 미리보기.
- `POST /api/projects/from-git` 입력 `{repository_url, path?, expected_sha,
  name, goal?, profile?}` → Project. 변경된 SHA와 동일 출처/폴더 중복은 409.
- `POST /api/projects/from-git-zip/preview` 입력 `{archive_base64,
  archive_name?, path?}` → ZIP SHA-256·package 근거·폴더·목표 초안·경고.
- `POST /api/projects/from-git-zip` 입력 `{archive_base64, archive_name?,
  path?, expected_sha256, name, goal?, profile?}` → Project. 변경된 ZIP은
  409. ZIP 원본과 commit/PR 이력은 저장하지 않는다.

네 경로는 로그인·CSRF가 필요하다. `projects/import`는 Projects 백업 복원
전용이며 Git 소스 ZIP과 다른 형식이다.

## 스킬 모듈 Python 인터페이스

루트는 DB·worker·API를 소유한다. runtime leaf는 아래 순수 Python/HTTP
구현을 `src/projects/runtime/`에서 제공한다. core DB/설정은 import하지 않는다.

```python
from projects.runtime import (
    BundleResolver, ReferenceCatalog, RunRequest, RunResult,
    build_messages, OpenAICompatibleRunner, RuntimeFailure,
)

# resolver = BundleResolver(cache_dir: Path, hub_url: str = default,
#                           transport: httpx.BaseTransport | None = None)
# resolver.resolve(skill_id: str) -> dict  # lock entry + immutable cached files
# resolver.read_bundle(cache_key: str) -> dict  # full source files
# catalog = ReferenceCatalog(registry_path: Path)
# catalog.load() -> dict
# catalog.validate_manifest(manifest: dict) -> dict
# RunRequest Pydantic: operation, instruction, target: str|None,
#     sources: list[dict], reference_manifest: dict
# build_messages(request: RunRequest, bundles: list[dict]) -> list[dict]
# runner = OpenAICompatibleRunner(base_url, api_key, model,
#                                 transport=None, timeout=120)
# runner.run(messages: list[dict]) -> RunResult
# RunResult: document, review, requirements, assumptions, questions, source_ids
# RuntimeFailure(code: str, message: str)
```

bundle 원문 규칙을 변경하지 않으며 구체적인 Python 반환 구조는 담당 agent와 조정한다.
