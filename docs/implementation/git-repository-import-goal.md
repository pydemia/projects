# GitHub 저장소 이관 구현 goal

2026-10-24 · 상태: 로컬 구현·검증 완료 · 기준 요구: APP-REQ-029~034,
[수용 조건 AC-59~64](../planning/15-git-repository-import.md)

## 구현 순서와 책임

1. `repository_import.py`에서 GitHub URL·고정 API 호스트·응답 크기와
   시간 상한을 검증한다. 원격 metadata→기본 branch commit→tree→작은
   package/extension manifest blob 순으로 읽고 유형·범위·목표 초안을 반환한다.
   최근 commit·PR은 제목·상태·링크만 제한된 개수로 읽는다.
   비공개 token은 서버 설정이며 정확한 저장소 허용 목록에만 적용한다.
2. Alembic `0006`과 `Project` 출처 필드에 URL·폴더·branch·commit·유형·
   manifest·이관 시점을 저장한다. 최근 commit·PR snapshot 테이블을 추가한다.
   사용자별 저장소/폴더 중복을 PostgreSQL 제약으로 막는다.
3. 인증·CSRF를 적용한 분석과 생성 API를 추가한다. 생성은 현행 commit
   재확인 후 프로젝트·이관 메모·작업 이력을 한 트랜잭션에 기록한다.
   기존 ZIP 계약에는 출처와 작업 이력의 검증과 이전 archive 호환을
   추가한다.
4. 프로젝트 목록에 분석/선택/생성 흐름을, 개요에 출처를 표시한다.
   공통 UI 컴포넌트를 사용하고 좁은 화면에서도 한 열로 읽고 조작한다.
5. HTTP mock·PostgreSQL 통합·웹 상호작용을 검사하고, 공개 실저장소
   `statusline`, `colors`, `mengto-skills`, `pydantic-config`,
   `vscode-extension-quickstart`를 읽기 전용으로 검증한다. 비공개 저장소는
   서버 token이 없어 실제 import를 검증하지 못하면 그렇게 기록한다.

## 완료 조건과 검증 경계

AC-59~64를 코드·테스트·실제 저장소 결과에 대조한다. package 설명과
commit·PR 제목은 검토 전 입력이므로 기능 완료의 근거가 아니다. `docker compose up -d db`,
`uv run projects migrate`, `uv run pytest`, Ruff, mypy,
`npm --prefix web run check`, `npm --prefix web run build`를 실행한다.
웹 변경은 기존 승인 favicon SVG·PNG/ICO 및 head 연결을 유지하고 빌드
검사를 통과해야 한다. 실제 브라우저·비공개 저장소·운영 배포의 미실행은
별도로 표시하며 사용자 요청 없이 운영 배포를 이번 goal에 포함하지 않는다.

## 실행 판정

APP-REQ-029~034와 AC-59~64의 로컬 구현·검증을 완료했다. PostgreSQL
`0006` migration, API·ZIP 복구, GitHub 공개 저장소 다섯 유형의 읽기 전용
분석과 API mock·PostgreSQL·웹 검사를 구분한 결과는
[검증 기록](verification.md#2026-10-24-github-저장소-이관)에 있다.
실제 비공개 저장소는 서버 token이 설정되지 않아 읽지 않았고, 운영 배포도
수행하지 않았다. 실제 GitHub와 실제 브라우저를 결합한 최종 로그인 흐름은
운영 설정에서 후속 확인한다.

## goal 실행 메시지

```text
github.com/pydemia/projects에서 기존 GitHub 저장소를 Projects 프로젝트로
가져오는 기능을 구현한다. docs/planning/15-git-repository-import.md의
APP-REQ-029~034, AC-59~64를 기준으로 statusline·colors·공개 skill
catalog·Python package·하위 폴더 VS Code extension을 분석한다.
미리보기에서 출처 commit과 근거를 확인하고 이름/목표/범위를 선택한 뒤
PostgreSQL에 프로젝트, 이관 메모, commit·PR snapshot을 원자적으로 저장한다.
기본 branch 변경·중복·권한·토큰 비노출·ZIP 호환을 확인한다.
공통 UI와 favicon을 보존하고 AGENTS.md의 백엔드·웹 검사를 실행한다.
실제 공개 GitHub 저장소와 mock/private 경계를 구분해 기록한다.
```

## Git ZIP 생성 확장 · 2026-10-25

사용자 결정에 따라 백업 복원의 `반출한 ZIP` 표현을 `Projects에서 저장한
백업 ZIP`으로 바꾸고, 프로젝트 목록의 세 동작을 `백업 ZIP 복원`·`원격
GitHub에서 만들기`·`Git ZIP에서 만들기`로 구분한다. 기존 원격 URL 가져오기는
유지한다. Git ZIP은 [AC-65~68](../planning/15-git-repository-import.md#git-소스-zip과-백업-zip의-구분)에
따라 구현한다.

1. `git_zip_import.py`가 base64 ZIP의 압축 크기·항목 수·총 해제 크기·경로·
   암호화·링크를 검사한다. ZIP을 풀거나 `setup.py`를 실행하지 않고 선택한
   폴더의 작은 manifest만 읽어 종류와 목표를 제안한다.
2. 인증·CSRF가 적용된 분석·생성 API를 분리한다. 생성 시 ZIP SHA-256을
   다시 확인하고 PostgreSQL에 프로젝트와 이관 메모를 한 트랜잭션으로
   저장한다. ZIP 원본과 commit·PR 행은 저장하지 않는다.
3. 공통 UI 컴포넌트로 파일 선택→분석→폴더·목표 검토→생성을 제공한다.
   좁은 화면과 백업/소스 ZIP의 혼동 없는 문구를 검사한다.
4. 실제 ZIP 형식은 GitHub Download ZIP의 루트 폴더와 `git archive`의
   루트 없는 파일 구성을 단위·PostgreSQL 통합 검사로 재현한다. 웹
   component·브라우저 mock과 백엔드 실검증을 구분해 기록한다.

이 확장은 기존 GitHub 가져오기 goal의 완료 판정을 변경하지 않는다.
Git ZIP은 파일 snapshot이므로 commit·PR 이력을 제공하지 않는다는 제약을
사용자가 분석 단계에서 확인하도록 한다.
