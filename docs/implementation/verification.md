# 구현·배포 검증 기록

2026-10-21 · Windows / Python 3.12.14 / Node 24.21.0 / PostgreSQL 17.11

최신 사용자 결정에 따른 개인용 로컬 MVP를 구현하고 검사했습니다.
문서는 Note 연계 전의 임시 Markdown 범위이며, Projects는 업무 관계와
SkillRun을 소유합니다. GitHub 게시·CI 실행·배포·팀 협업·Note 실연동은
원래 로컬 검증에 포함하지 않았습니다. 이후 배포 진행 상황은 아래
별도 절에 기록합니다.

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
- GitHub `main`의 커밋 `802c50d`에서
  [Actions 백엔드·웹 검사](https://github.com/pydemia/projects/actions/runs/39570658439)가
  모두 통과했습니다. 첫 CI에서 발견한 Linux mypy의 Windows 전용 상수
  오류는 같은 커밋에서 수정했습니다. 서버 앱 이미지는 수정한 소스 묶음
  `02fabbd610af5433`으로 재빌드했고 health check를 통과했습니다.
- Entra `pydemia Projects` 단일 테넌트 앱과 전용 client secret을
  등록해 서버 비공개 설정에 연결했습니다. 프록시의 로그인 시작 요청이
  실제 client ID·tenant·PKCE·정확한 callback으로 302 이동함을
  확인했습니다. DNS A 레코드가 아직 없어서 공개 HTTPS 접속·실제
  Microsoft 로그인·운영 브라우저 흐름은 **미검증**입니다.
- 발급 당시 사용한 로컬 임시 비밀 값 파일은 `.gitignore`의 `.projects/`
  아래에 있습니다. 서버 반영 후 정확한 파일만 삭제하려 했지만 자동 승인
  검토가 `blocked by policy`로 거부했습니다. 다른 방법으로 우회하지
  않았으며 로컬 사본의 수동 정리가 남습니다.

저장소는 초기 커밋이 없는 작업 트리입니다. commit SHA 대신
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
  않았습니다. 이후 GitHub push/CI와 부분 배포는 위 배포 절을 따릅니다.

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
