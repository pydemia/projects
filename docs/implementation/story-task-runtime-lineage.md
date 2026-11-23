# Story·Task 구현 전 운영 assistant 계보 정합화

2026-11-09 · 운영 소스 회수 및 로컬 병합 완료. 배포·commit·push 없음.

## 확인한 실행 원본

- 로컬 출발 HEAD: `79c42b39d4a644b85de6ba8e69711f5d623fb1d4`. 기존 dirty 변경을 유지했다.
- SSH host: `pydemia-server`, 실행 app container: `2a2668cade9c`.
- 실행 image: `pydemia-projects:login-7721890b4eeda52b`.
- 실행 image ID: `sha256:3b0973c7959524742fb53101c19fb8d5a195ab501db8c441f02345482f9b2dd8`.
- image source label: `986e0a1af12655bbe367a154abe303ab350c71a07a29c1c1d63ebc8dd36c1bcc`. 이 label을 overlay 전체 소스 revision으로 간주하지 않는다.
- 실행 DB에서 읽은 Alembic revision: `0013`.
- 운영 compose 경로: `/home/pydemia/.local/share/projects-releases/20261109-login-layout-7721890b4eeda52b/runtime.compose.json`. 내용·env·credential은 회수하거나 출력하지 않았다.

app image ID를 먼저 검증한 뒤 실행 container의 `/app/src`와 `/app/migrations`만 archive로 회수했다. Python·migration 소스만 허용하고 `__pycache__`와 `.pyc`를 제외했다. Caddy 공개 소스 2개를 함께 회수했다. archive SHA-256은 `084d47077662de5d9a307b7713ee5c20ae51aa441b6ac766b62349b04a3f1ac4`다. 원본 archive·전후 사본은 Git에서 제외된 `.projects/deployment/runtime-lineage-20261109*`에 있다.

실행 edge container `859f2af5879e`의 `/etc/caddy/Caddyfile` hash와 운영 `deploy/projects-tunnel.caddy` hash가 모두 `a3a3c4ec7bd9c8c076ca5ef3dcee11e117e857ac8631469312764d39ffd9284e`이며 bytes가 일치함을 별도 확인했다. `deploy/projects.caddy`는 운영 공개 소스와 로컬이 이미 일치했다.

## 병합 범위와 보존 계약

회수한 runtime 파일과 작업 직전 로컬 diff를 확인했다. database/domain/api/note_references의 차이는 assistant 추가 코드뿐이었다. 기존 함수·필드·권한 구현을 삭제하거나 이전 backend로 되돌리지 않고 이 추가분을 반영했다. assistant_result·assistant_integration·0013을 원본 그대로 추가했다. 이후 Story·Task 구현으로 공용 파일이 변경되므로 아래 반영 hash는 **운영 원본 병합 직후** 기준이다.

- `0013_assistant_operations.py`: `down_revision="0012"`; 신규 기능 migration은 `0014` 이후를 사용한다.
- assistant principal 설정·서명 key는 서버 설정으로 남긴다. 회수 archive·API·ZIP·문서·Git에 인증 원문을 추가하지 않았다.
- Bearer 요청 method/raw path/query/body hash, principal binding/revision, 60초 token 유효기간을 검증한다. 브라우저 cookie나 전달 사용자 header로 owner를 선택하지 않는다.
- receipt는 principal/operation ID와 payload hash에 묶인다. 재시도·receipt 조회 때 현재 scope, account, 프로젝트 허용 목록, 현재 ACL 및 이동 대상 권한을 다시 검사한다.
- 결과 첨부는 기존 revision gate·Task 완료 정책을 거친다. 기존 manual Note 참조를 보존하고 workspace/page가 일치하는 canonical Note URL만 읽기용 참조로 투영한다.
- tunnel Caddy의 assistant 경로만 app으로 전달하며 Authorization은 보존하고 Cookie·전달 신원 header를 제거한다. 일반 브라우저 경로는 기존 oauth2-proxy 흐름이다.

## 파일 SHA-256

| 파일 | 병합 직전 로컬 | 운영 원본 = 병합 직후 |
|---|---|---|
| `src/projects/database.py` | `12b5e0d87ccd5539479790925205ea16db7a5a9b2c6475f129a27b3b0140e660` | `42cac21e114c92ccadcd993b641886d2db9b2d404bad088d5dc9519194deaf7c` |
| `src/projects/domain.py` | `5882ffc9969543277cd9ec7c4022300e2f88030a839a6fd97f3b09e48efb705f` | `51f7df0334890f9be80461aa677586f183fdebd3b57cdb01d2edcd9ff89c4172` |
| `src/projects/api.py` | `b4c611adf7e57951e0f97e3e4b4149eef84260d56b682457019860753881e1b1` | `f2c783a2a4d15ebebffbdbe692d5ccc06f0a8b0f7e0adee71a0ba33fab7cd784` |
| `src/projects/note_references.py` | `4c2c9a63b24d6965a091073bdd6f118148dbda3f0375201eaba1754b832d2c13` | `d3be82726b5c2742ce4d4a31b00c09c48606b7664d4fa79857c1ce810b17704b` |
| `src/projects/assistant_result.py` | `없음` | `dccbba43ee93f839afc7442f6db783d94b584dd33eebf1dfc6902a22bf041214` |
| `src/projects/assistant_integration.py` | `없음` | `5e5d132cc79fef7d74f1037c80e37380fd8989b934e26c9047a6bb9b8595b8ed` |
| `migrations/versions/0013_assistant_operations.py` | `없음` | `324db2e384762a1ae32b150efbc8a77c661bed02b4ee8f156c34a4e9853bc9ff` |
| `deploy/projects-tunnel.caddy` | `226bae2c2178b012d4e03fc0761d187bd69fd753b9790e29595971f8b2a9ac59` | `a3a3c4ec7bd9c8c076ca5ef3dcee11e117e857ac8631469312764d39ffd9284e` |
| `deploy/projects.caddy` | `6d82aae60b609dcced530b22fa0b4f9d4c88e62a6cf3ab7b9ad564dcf935ddca` | `6d82aae60b609dcced530b22fa0b4f9d4c88e62a6cf3ab7b9ad564dcf935ddca` |

## 검증 상태

- 앱 구현: 위 source·migration·Caddy 병합 완료.
- 로컬 정적 검사: assistant_integration, assistant_result, note_references, 0013의 `ruff check` 통과. 위 파일과 database/domain/api의 `ruff format --check` 통과.
- 로컬 타입 검사: `uv run mypy src/projects/assistant_result.py src/projects/assistant_integration.py src/projects/note_references.py` 통과(3개 파일).
- PostgreSQL: `docker compose up -d db` 실행, 기존 테스트 fixture가 임의 이름 전용 schema에서 0013까지 migration을 실행한 것을 첫 회차에서 확인했다.
- PostgreSQL 통합 검사: `uv run pytest tests/test_assistant_integration.py tests/test_note_references.py -q` **22 passed** (12.98초). 실제 PostgreSQL의 invocation별 무작위 전용 schema를 사용했다. 서명 요청 바인딩·브라우저 신원 거부·owner 주입 거부·프로젝트 허용 범위·멱등 receipt·현재 권한 재검사·Note 보존·CAS 검사를 포함한다. 동시 작성 중이던 migration0014~0016이 연결된 이후 재실행한 결과다.
- fixture 보강: migration 실패 때도 이 invocation에서 생성한 무작위 schema만 finally에서 정리하도록 `tests/conftest.py`를 수정했다. 의도한 migration 실패를 주입한 별도 실행으로 해당 invocation schema가 PostgreSQL에서 제거됨을 확인했다. 기존 실패로 남았을 수 있는 다른 invocation schema는 열거·삭제하지 않았다.
- 최종 범위 검사: assistant_integration·assistant_result·note_references·0013·conftest·assistant tests의 `ruff check`와 `ruff format --check` 통과(6개 파일).
- 실제 운영: 실행 image/source 회수, DB revision 읽기, Caddy bytes/hash 대조만 수행. 운영 쓰기·migration·배포·실제 assistant 호출 없음.
- 실제 Hub·LLM·브라우저: 이 계보 정합화 작업에서는 실행하지 않음. 전체 구현 검증에서 별도로 기록한다.
