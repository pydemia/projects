# 기존 GitHub 저장소에서 프로젝트 시작

2026-10-24 · 출처: 사용자의 Git 저장소 이관 요청과 실제 공개 저장소 확인.
이 문서는 Projects의 기존 프로젝트 ZIP 복구와 다른 흐름을 정의한다.
이번 구현 대상은 `github.com` 저장소다. 다른 Git 호스트와 로컬 경로는
호스트별 인증·권한 계약을 정한 뒤 확장한다.

## 사용자의 과업

이미 코드와 문서가 있는 저장소를 다시 빈 아이디어로 시작하지 않고
Projects의 프로젝트로 등록한다. 사용자는 저장소 URL을 입력하고 기본
branch의 특정 commit에서 발견한 프로젝트 유형·대상 폴더·근거 파일을
확인한 뒤 이름·목표·프로필을 수정해 생성한다. 목표 초안은 package 또는
extension manifest의 이름·설명·유형을 사용한다. 작업 이력은 최근 commit과
PR의 제목·상태·링크를 읽기 전용으로 가져온다. 가져온 뒤에는 출처와 commit,
작업 이력을 확인하며 스킬로 기획/설계/작업을 이어간다. 저장소의 작업 이력을
Projects의 확정 요건·완료 작업으로 간주하지 않는다.

## 확인한 저장소 유형

| 공개 저장소 | 확인한 근거 | 가져오기에서 기대할 분류 |
|---|---|---|
| [statusline](https://github.com/pydemia/statusline) | 루트 `manifest.json`의 Manifest V3, `package.json` | 브라우저 확장 |
| [colors](https://github.com/pydemia/colors) | `package.json`의 Vite/React | 웹 앱 |
| [mengto-skills](https://github.com/pydemia/mengto-skills) | `agent-skills/**/SKILL.md` 경로 | 스킬 카탈로그, package 설명 부재 표시 |
| [pydantic-config](https://github.com/pydemia/pydantic-config) | 루트 `setup.py` | Python 패키지 |
| [vscode-extension-quickstart](https://github.com/pydemia/vscode-extension-quickstart) | 두 하위 폴더의 `package.json`에 `engines.vscode` | 대상 폴더별 VS Code 확장 |

파일 구성은 2026-10-24 GitHub 기본 branch에서 확인했다. 저장소 내용은
외부 입력이며 package의 설명은 구현·테스트의 확인 결과가 아니다.
GitHub의 [repository metadata](https://docs.github.com/en/rest/repos/repos#get-a-repository),
[Git trees](https://docs.github.com/en/rest/git/trees#get-a-tree),
[Git blobs](https://docs.github.com/en/rest/git/blobs#get-a-blob),
[commits](https://docs.github.com/en/rest/commits/commits#list-commits),
[pull requests](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests) API를
읽기 전용으로 사용한다. 재귀 tree 응답은 GitHub 자체 상한과 `truncated`
표시가 있으므로 잘린 목록을 완전한 분석으로 제시하지 않는다.

## 화면과 결정 흐름

1. 프로젝트 목록에서 `GitHub 저장소에서 만들기`를 연다. URL을 입력하고
   `저장소 분석`을 누른다. ZIP 복구·빈 프로젝트 생성은 별도 동작이다.
2. 분석 결과에서 기본 branch/commit, 공개·비공개 상태, 루트 및 발견한
   하위 프로젝트 폴더, package 근거·목표 초안, 최근 commit·PR과 분석 한계를 본다.
   하위 폴더를 고르면 해당 범위로 다시 분석한다.
3. 이름·목표·간편/표준 프로필을 수정해 생성한다. 생성 시 기본 branch가
   바뀌었으면 새 분석을 요구한다.
4. 프로젝트 개요에 저장소·폴더·commit 및 최근 commit·PR을 표시한다.
   이관 메모에는 package 근거와 수집 범위를 남긴다. 작업 이력은 별도 읽기
   전용 snapshot으로 저장하며, 사용자 확인 전 요건·작업·테스트로 승격하지 않는다.

비공개 저장소는 서버 전용 GitHub token과 정확한 저장소 허용 목록이
설정된 경우만 읽는다. 브라우저에서 토큰을 받거나 API·ZIP·Git·로그에
노출하지 않는다. 설정하지 않은 비공개 저장소는 접근 불가를 안내한다.
저장소 코드·setup.py 실행, clone, README·소스 전체 분석, Issue 동기화,
원격 수정, 주기적 동기화와
문서 본체 이관은 이번 단계에 포함하지 않는다. Note의 임시 Markdown
경계와 기존 SkillRun 소유권은 유지한다.

## 수용 조건

| ID | 관찰할 결과 |
|---|---|
| AC-59 | 정상 GitHub URL의 미리보기는 canonical URL·기본 branch·commit·선택 범위를 반환하고 잘못된 호스트·인증 정보·임의 경로를 거부한다. |
| AC-60 | 확장·웹 앱·스킬·Python 패키지·하위 폴더 확장의 분류와 목표 초안은 package/extension manifest 근거에 연결된다. 없는 경우 저장소 설명을 사용하고 한계를 표시한다. |
| AC-61 | 생성 시 이름·목표·프로필·commit·폴더가 저장되고 동일 사용자의 같은 저장소/폴더 중복과 변경된 commit은 409로 막는다. 다른 사용자 자료는 보이지 않는다. |
| AC-62 | 최근 commit·PR의 제목·상태·링크를 snapshot으로 저장하고 개요에서 본다. 하위 폴더 commit만 경로로 필터하며 PR은 저장소 전체임을 표시한다. 코드나 스킬 원문은 실행하지 않는다. |
| AC-63 | ZIP 반출/복구는 공개 출처 메타데이터를 보존하지만 토큰은 포함하지 않는다. 과거 ZIP은 새 필드의 빈 기본값으로 복구한다. |
| AC-64 | 모바일·데스크톱에서 입력→분석→범위 선택→생성·오류 복구가 가능하고 기존 공통 UI 컴포넌트와 favicon 연결을 유지한다. |

## Git 소스 ZIP과 백업 ZIP의 구분

사용자는 원격 GitHub URL 또는 Git 소스 ZIP으로 새 프로젝트를 만든다. Git 소스
ZIP은 GitHub의 [Download ZIP](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives)과
[`git archive --format=zip`](https://git-scm.com/docs/git-archive) 결과를 대상으로
한다. 이 파일들은 파일 트리의 snapshot으로, commit·PR 이력 전체를 담지
않는다. 따라서 Git ZIP에서는 package/extension manifest를 기준으로 이름과
목표를 제안하되 이력은 생성하지 않는다. 이력이 필요하면 원격 GitHub URL을
선택한다. ZIP에 든 소스는 실행하거나 Projects에 저장하지 않는다.

Projects가 저장한 백업 ZIP은 기존 프로젝트의 항목·관계·이력을 복원하는
별도 흐름이다. 화면에는 `백업 ZIP 복원`, `원격 GitHub에서 만들기`,
`Git ZIP에서 만들기`로 목적을 구분한다. 백업 안내에는 `Projects에서 저장한
백업 ZIP`이라는 표현을 사용한다. 소스 ZIP을 백업 복원 API에 보내거나
백업 ZIP을 소스 분석 API에 보내면 용도를 안내하며 거부한다.

Git ZIP 분석 API는 8 MB 압축 파일·3,000개 항목·100 MB 총 해제 크기로
한정하고, 경로 탈출·중복 경로·암호화·심볼릭 링크를 거부한다. 실제로 읽는
내용은 선택 폴더의 최대 64 KB manifest뿐이다. GitHub ZIP의 한 단계 루트
폴더와 루트 없는 `git archive` ZIP을 모두 처리하고, 하위 package 폴더를
선택할 수 있다. 미리보기의 SHA-256을 생성 요청에서 다시 검사한다. ZIP
파일명·package 설명은 사용자 검토 전 입력이며 신뢰할 수 있는 실행 근거가
아니다. ZIP 해시는 이관 메모에 남기지만 ZIP 원본은 저장하지 않는다.

| ID | 관찰할 결과 |
|---|---|
| AC-65 | GitHub Download ZIP과 루트 없는 `git archive` ZIP을 분석해 package 유형·폴더·목표 초안을 반환한다. |
| AC-66 | ZIP 생성은 해시 불일치와 위험한 경로·용량·암호화·링크를 차단하고, 소스 파일을 추출·실행·보관하지 않는다. |
| AC-67 | ZIP으로 생성한 프로젝트에는 manifest·선택 폴더·이관 메모가 남고 commit·PR 이력은 비어 있다. 원격 GitHub URL로 생성하면 기존 이력 수집이 유지된다. |
| AC-68 | 백업 복원과 두 소스 생성 경로를 별도 이름·설명·오류로 식별할 수 있다. 좁은 화면에서 버튼과 입력을 사용할 수 있다. |
