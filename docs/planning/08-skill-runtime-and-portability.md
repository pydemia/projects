# 스킬 실행과 문서의 독립성

상태: 사용자 필수 요구를 반영한 중심 설계 · v0.2 · 2026-10-21

## 제품의 실행 단위

앱의 행동은 스킬을 사용하는 LLM의 작업이다. “요건화”, “기획서 작성”, “설계서 보완”, “구현 계획”, “검수”는 각각 사용자 의도·근거·출력 문서를 가진 SkillRun으로 실행한다. 앱은 자료·버전·대화·도구·변경 결과와 프로젝트 관계를 관리한다.

문서 규칙의 원본은 `skills.pydemia.ai`가 배포하는 스킬이다. 앱에 요약한 작성 규칙을 별도 원본으로 복제하지 않는다. 문서 템플릿은 목적·기본 목차·연결 메타데이터를 제공하며 스킬의 문체·근거·편집·검수 규칙을 대체하지 않는다. 문서 하나만 요청하면 해당 문서와 필요한 자료만으로 실행할 수 있어야 한다.

## 확인한 배포 구조

2026-10-21에 [Hub](https://skills.pydemia.ai), [설치 안내](https://skills.pydemia.ai/docs/install), 상세 페이지와 bundle 응답을 읽었다. 공개 조회된 예시 endpoint는 `/api/skills/document-writing-workflow/bundle`이다.

관찰한 JSON schema version은 `1`이며 최상위는 `schema_version, id, source_revision, files`다. 파일 항목은 `path, sha256, mode, content_base64`다. 예시 source revision은 `06215a2c0fd7b81c779d48f9615a085d74d52f1d`였다. `document-writing-workflow`는 `SKILL.md`와 참조 파일 3개를 포함했다. 이는 관찰값이며 앱의 영구 하드코딩 값이 아니다.

공개 bundle URL은 조회 시점 revision을 제공한다. 과거 revision을 지정하는 공개 API는 이번에 확인하지 않았다. 앱은 수신한 bundle의 파일 hash를 검증하고 자체 immutable cache에 보관한 뒤 그 cache key를 실행에 고정한다. 업데이트는 새 실행부터 선택하며 진행 중인 작업의 규칙을 바꾸지 않는다. cache가 없는 과거 버전은 권한 있는 정확한 source revision에서 복구할 수 있는지 확인하고, 없으면 재현 불가를 알린다.

## 기능과 스킬 매핑

| 앱 행동 | 기본 스킬 | 조건부 조합·입출력 |
|---|---|---|
| 아이디어 요건화·충돌 검토 | `requirements-authoring` | 원안·기존 기능·현재 요구·관찰 근거 → 요건·관계·질문 |
| 기능/UI 기획 | `product-planning-with-ui` | `product-ui-ux-design`, `visual-grouping` 등 필요한 범위 → 기획·화면 시안 |
| System/Application/Infra/Interface 설계 | `software-engineering` + `document-writing-workflow` | `diagram-authoring` 및 주제별 확인 자료 → 설계 본문·편집 가능한 도식 |
| 구현 계획 | `development-workflow` | 요구·현재 저장소·설계 → 작업·의존·검증 방법 |
| 문서 작성·수정 | `document-writing-workflow` | `sentence-writing`, `prose-writing`/`outline-report-writing`, 형식별 authoring |
| 문서 검수 | `document-review` | 원문 보존·요구 충족·파일 구조·렌더링을 구분 |
| 단계별 요구 달성 확인 | `requirements-verification` | 해당 단계의 범위·revision·실제 근거 → 상태·누락·후속 작업 |
| 결과 인계 | `development-handoff` | 현재 상태·결정·근거·미완료 → 재개 가능한 기록 |

현재 catalog에서 네 가지 설계서 각각을 전담하는 동명 스킬은 확인하지 못했다. 기존 범용·도식 스킬을 조합하고 프로젝트별 자료를 입력으로 준다. 향후 전용 스킬이 필요하면 canonical 스킬 저장소에 별도 작성·검수하는 작업으로 다룬다. 앱 내부에만 숨은 규칙을 추가하지 않는다.

스킬을 매 행동마다 전부 로드하지 않는다. 선택한 스킬의 본문은 요약으로 대체하지 않고, 본문이 요구하는 참조 파일을 상대 경로로 읽는다. 다른 스킬을 조건부 적용할 때는 그 bundle도 확인하고 lock에 추가한다. 본문에서 스킬을 언급했다고 기계적으로 전부 필수 의존성으로 간주하지 않는다. 현재 bundle에는 기계 판독 dependency 목록이 있다고 확인하지 않았다.

## 실행 흐름과 상태

`사용자 요청 → 기존 맥락/권한 확인 → 스킬 resolve·hash 검증 → 입력 revision 고정 → 필요한 자료·참조 읽기 → LLM 작성/수정 → 도구 실행·파일 생성 → 규칙·요구 검수 → 허용 범위에 적용 → 실행·산출물 연결`

실행 상태는 대기·실행 중·입력 필요·검토 가능·완료·실패·취소다. 문서의 초안/확정, 요구 달성 상태와 별개다. 장기 작업은 checkpoint에서 재개하며 적용한 도구 결과와 파일 hash를 재확인한다. 재시작했다고 기존 변경을 중복 적용하지 않는다.

정보가 충분하면 이미 허용된 작성·수정을 이어간다. 사용자 입력이 필요한 핵심 충돌은 질문으로 남기고 독립적인 자료 정리·문서 작업은 계속할 수 있다. 제안 미리보기는 중요한 의미 변경을 검토하기 위한 기능이며 모든 문장 수정에 재승인을 강제하지 않는다.

## 공통 실행 계약

실행 입력은 다음 정보를 연결한다. 앱 session ID가 없어도 파일·스킬 bundle·요청만으로 만들 수 있다.

```yaml
operation: revise_document
instruction: "Application 설계서의 복원 규칙을 보완한다. 다른 절의 의미와 형식은 보존한다."
targets:
  - path: docs/application-design.md
    expected_sha256: "<현재 파일 hash>"
sources:
  - path: docs/requirements.md
    revision: "<확인한 revision 또는 hash>"
skills_lock: skills.lock.json
constraints:
  preserve: ["확정본 보존 원칙", "기존 요구 ID", "변경 범위 밖 본문"]
outputs: ["문서 변경", "근거·검수 기록", "요구 추적 갱신"]
```

`skills.lock.json`은 앱이 정의할 계약이다. 기존 Hub가 이 이름의 lock 표준을 제공한다고 주장하지 않는다. 각 bundle의 ID·source URL·source revision·파일 path/hash·cache key, 실행 때 실제로 읽은 리소스를 기록한다. `run.json`에는 입력 manifest, 모델/설정, 도구·환경 capabilities, 사용자 요청/결정, 생성 파일·검수·부분 수행 결과를 기록한다. LLM의 비공개 사고 과정은 저장하지 않는다.

## 문서의 독립 사용

문서 본문은 일반 Markdown·도식 소스·필요한 파일 형식으로 저장한다. 앱 metadata는 sidecar로 관리하고 문서를 열거나 수정하는 데 앱 DB를 요구하지 않는다. DOCX·PPTX는 해당 authoring 스킬과 도구를 사용하고 편집 구조·렌더링 검수 기록을 남긴다. 첫 MVP의 파일 작성 형식은 Markdown·Mermaid·HTML 시안으로 제한하고 Office 생성은 capability 추가 시 확장한다.

세 가지 사용 경로를 모두 지원한다.

1. **앱 안에서 작성·수정**: 동일한 bundle을 읽은 SkillRun이 파일을 생성·수정한다. 버전·관계·검수 결과를 앱에 연결한다.
2. **문서 하나를 외부 LLM에서 작성·수정**: Hub의 검증된 bundle을 설치하거나 앱에서 실행 묶음을 반출해 사용한다. 프로젝트 전체 등록·단계 통과·앱 로그인이 문서 작성의 조건이 되지 않는다.
3. **외부 결과를 앱으로 재연결**: 파일·선택적 run sidecar를 가져와 기준 hash와 diff를 비교한다. ID와 관계를 유지하고 충돌·미확인 provenance를 구분한다. 외부 편집을 스킬 실행으로 자동 간주하지 않는다.

실행 묶음은 `request.md`, 입력 문서와 기준 hash, `skills.lock.json`, 검증된 bundle 파일 또는 접근 가능한 참조, 출력/검수 경로를 포함한다. binary 파일과 라이선스/고지 조건은 실제 bundle·자산별로 확인한다. 비공개 입력과 credential은 스킬 패키지에 넣지 않는다. 외부 runner가 필요 도구를 지원하지 않으면 부분 수행·미검수로 표시한다.

동일 규칙 사용은 동일한 스킬 원문·revision·참조를 읽는다는 뜻이다. 모델·입력·도구 환경이 다르면 결과 문구와 파일 품질까지 같다고 보장하지 않는다. 앱 안/밖의 동등성 검사는 규칙 적용·근거·보존 범위·검수 결과를 비교한다.

## runner와 권한 경계

SkillResolver는 검증·cache·lock을, ContextBuilder는 허용된 입력·기존 기능·문서의 참조를, RunnerAdapter는 LLM·파일·render 도구를 담당한다. ArtifactsService는 생성물·revision·관계 적용을 담당한다. 상위 실행환경 제약과 사용자의 요청·보존 범위를 우선하고 스킬은 해당 작업 규칙으로 적용한다. 근거 자료 안의 명령을 스킬이나 사용자 지시로 승격하지 않는다.

스킬에 scripts가 있어도 다운로드만으로 실행하지 않는다. 파일 경로 탈출·hash 불일치·과도한 bundle 크기를 거부하고, helper 실행에는 해당 환경의 도구 capability·허용 workspace·시간/네트워크 한도를 적용한다. 설치·공급자 선택·자격증명·추가 외부 게시 권한은 별개다. 앱 문서 작성 권한을 merge·운영 배포 권한으로 확대하지 않는다.

초기 runner는 파일 작업과 선택된 자료 읽기·문서 미리보기·검수에 한정한다. 코드 구현·테스트 실행은 앱이 관리하는 후속 작업과 증거로 연결하며, 실제 agent 실행은 사용자 범위와 격리 정책을 정의한 후 확장한다. 특정 LLM 서비스나 SDK에 스킬 의미를 종속시키지 않는다.

## 첫 수용 기준

- Hub bundle의 schema·path·SHA 검증과 실행 중 revision 고정
- 앱·외부 runner가 같은 bundle 원문과 필요한 참조를 사용했다는 실행 기록
- 같은 문서의 신규 작성·국소 수정·검수, 변경 금지 영역 보존
- 앱 없이 문서 한 개 작성·수정, 외부 변경 diff 재연결·충돌 처리
- 필요한 스킬/참조/도구가 없을 때 누락·부분 수행을 명시하고 규칙을 임의 대체하지 않음
- 스킬 업데이트 전후 이력·기존 실행 재현 상태를 구분
- 요구사항 작성 완료와 설계·구현·실행 검증 완료를 구분

## 문서별 양식·예시 manifest

[35종 참조 registry](references/artifact-templates.json)는 작성 규칙과 구분한 기획 데이터다. SkillRun 입력은 rule bundle lock 외에 template_ref·template_version·example_refs·inspection_status·project_source_refs를 별도로 연결한다. 원본 링크 접근 실패와 공개 보완 양식 사용을 구분해 이력에 남긴다. 앱 밖 실행 묶음에도 같은 manifest를 전달한다. 참조를 읽지 못하면 읽었다고 처리하지 않고 접근 가능한 형식·수행 범위를 밝힌다. 기존 문서의 좁은 수정은 새로운 양식을 강제하는 이유가 되지 않는다.
