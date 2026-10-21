# 실제 앱 실행

Python 3.12 이상, Node.js 24, uv, Docker Compose를 사용합니다.
구현 DB는 PostgreSQL 17.11입니다. 아래 명령은 저장소 루트에서 실행합니다.

```powershell
docker compose up -d db
uv sync --locked
uv run projects migrate
uv run projects serve
```

다른 터미널에서 웹을 실행합니다.

```powershell
npm --prefix web ci
npm --prefix web run dev
```

웹은 `http://127.0.0.1:5173`, API는 `http://127.0.0.1:18731`입니다.
첫 화면에서 개인 계정을 생성합니다. 사용자 계정의 비밀번호는 해시로 저장하고
프로젝트별 소유권과 cookie 세션·CSRF를 확인합니다. 공개 가입·외부 운영을
승인한 구성은 아니며 서버 기본 바인딩은 loopback입니다.

## LLM 선택

기본은 현재 서버 사용자의 Codex 로그인입니다. Codex CLI가 설치되어 있고
로그인되어 있어야 합니다. `projects.example.yaml`을 `projects.local.yaml`로
복사하면 auth.json 경로·inline 인증 또는 OpenAI-compatible API를 설정할 수
있습니다. [설정 문서](llm-configuration.md)를 따르며 실제 키는 채팅·Git에
넣지 않습니다. `uv run projects check-config`는 값 없이 설정 형식만 확인합니다.

## 현재 문서 범위

산출물은 임시 Markdown 저장소입니다. 문서 제목·유형·본문 저장, 동시 수정
확인과 스킬 작성·수정·검수 결과의 적용을 제공합니다. 문서 관리의 본체는
향후 Note로 연결합니다. [Note 요구·전환 명세](note-document-handoff.md)에
필요 기능과 데이터 소유권을 정리했습니다.

아이디어 요건화는 기존 기능·요구를 함께 비교하고 후보를 개별 선택해 적용합니다.
채택 후보는 요건·설계 보완 작업·구현 작업·회귀 케이스로 연결하며,
중복·충돌·보류는 결정 기록으로 남깁니다. 문서 적용과 후보 적용은 별도 선택입니다.

## 검사

```powershell
uv run pytest
uv run ruff check src tests migrations
uv run ruff format --check src tests migrations
uv run mypy src/projects
npm --prefix web run check
npm --prefix web run build
```

API 통합 테스트는 기본 개발 PostgreSQL에 임의의 `projects_test_*` schema를
만들고 해당 schema만 정리합니다. `PROJECTS_TEST_DATABASE_URL`로 별도
PostgreSQL 연결을 지정할 수 있습니다. 테스트 자체가 개발 프로젝트나
기존 사용자 데이터를 삭제하지 않습니다.

[현재 검증 기록](verification.md)은 단위·mock 검사, 실제 PostgreSQL,
Hub·Codex, 독립 파일 실행과 브라우저 검사를 구분합니다.
다음 명령은 추가 검증용입니다. 브라우저·실제 LLM 검사는 합성 QA 계정과
프로젝트를 만들며, LLM 검사는 현재 공급자의 실제 사용량을 소비합니다.

```powershell
uv run python scripts/verify-postgres-backup.py
node scripts/verify-browser.cjs
uv run python scripts/verify-live-runtime.py
uv run python scripts/verify-document-profiles.py
uv run python scripts/verify-standalone-runtime.py
```

백업 검증 스크립트는 기본 Compose 개발 연결만 사용하고, 새 무작위
`projects_backup_*` schema에서만 dump/복원/정리를 수행합니다.
독립 실행 검사는 7종 검사에서 저장한 `.projects/qa-standalone-document.zip`을
읽으며 실행 중 API·DB·Hub를 사용하지 않습니다. 같은 Codex 인증을 쓰는
다른 실행이 끝난 뒤 순차로 실행합니다.

## 보존·복구

프로젝트 반출 ZIP에는 업무 데이터·revision·관계·기준선·SkillRun이 들어갑니다.
서버 계정·cookie·LLM 인증 설정은 들어가지 않습니다. 가져오기는 hash와
관계를 검증하고 같은 ID가 있으면 거부하므로 별도 복구 환경에서 확인합니다.
현재 ZIP은 스킬 bundle cache 전체를 포함하지 않습니다. 독립 문서 ZIP에는
선택한 스킬 원문을 포함합니다. 캐시가 사라지면 해당 과거 실행의 재현은
불가능할 수 있으므로 운영 백업은 PostgreSQL과 `.projects/skills`를 함께
보존해야 합니다. 인증 설정은 데이터 백업과 구분해 안전한 저장소에서 관리합니다.
