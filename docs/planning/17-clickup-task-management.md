# 입력은 짧게, 관리는 작업 화면에서

2026-11-02 사용자 확정 방향. 첫 입력의 복잡함을 늘리지 않고 ClickUp의
작업·필드·보기 관리 방식을 Projects에 적용한다. 기존 P-02와 모바일·체크·
프로젝트 유지 결정을 승계하며 Note 본문이나 팀 공유 권한으로 범위를 넓히지 않는다.

## 근거와 채택

ClickUp 공식 [List view](https://help.clickup.com/hc/en-us/articles/6310260883351-Intro-to-List-view)는
열의 추가/숨기기·순서 변경과 목록에서의 작업 편집을 제공한다. 여기서는
행과 열을 정렬해 비교하고, 값을 눌러 편집하며, 필드 관리를 목록 옆에 둔다.
초기 생성에는 제목만 요구하고 나머지는 생성 이후에 채운다.

공식 [Views](https://help.clickup.com/hc/en-us/articles/6329880717719-Intro-to-views)의
이름으로 보기를 여는 방식과 [Custom Field types](https://help.clickup.com/hc/en-us/articles/6303499162647-Custom-Field-types)의
타입에 따른 속성 입력을 적용한다. 저장 보기 탭·추가·이름 변경·복제·개인 기본·
명시 갱신과 삭제 확인을 제공한다. 이번 범위에 팀 공유, 자동 저장, Gantt,
수식·자동화·담당자 디렉터리를 포함하지 않는다. 공식 문서를 확인했으며
이번 실행에서 ClickUp 로그인 화면을 직접 조작하거나 비공개 JS를 재분석하지 않았다.

`skills.pydemia.ai`의 product-ui-ux-design을 source revision
`0e701b6ba104a846354b3d69a65fc51bf6082960`, SHA-256
`7a0505f52e5991f2d18be9af5c5ed93ea4f8d4d2b5a1a6e57bf87fbc8905d69c`로
읽었다. 기존 frontend-development·product-planning-with-ui·visual-grouping
지침과 source-owned pydemia UI를 적용한다. Microsoft 인증·PostgreSQL·기존
Task ID/revision·완료 gate·Hub 원문·Note 참조 책임은 유지한다.

## 화면과 데이터 계약

- 빠른 생성은 한 줄 제목과 Enter/+추가다. 프로젝트 화면은 현재 프로젝트,
  전체 작업은 마지막 사용한 접근 가능 프로젝트를 기본 소속으로 제시한다.
  생성 시 사용자 필드는 필수가 아니다. 상세 입력은 보조 행동이다.
- 데스크톱은 작업/상태와 선택한 속성이 정렬되는 행이다. 필드 값은 팝오버의
  저장/취소로 바꾸고, 충돌 시 입력을 보존한다. 날짜·우선순위·맥락·예상 시간
  등 기존 필드도 같은 방식으로 편집한다. 첫 작업이 화면 안에 보이는지 확인한다.
- 필드 추가는 기존 필드 표시/숨기기·순서와 새 속성 생성을 분리한다.
  새 타입은 텍스트/숫자/날짜/선택/체크박스이며 타입은 생성 후 고정한다.
  정의는 현재 사용자의 작업공간에서 공유하고 표시 열은 개인 보기별로 저장한다.
  숨기기는 값을 지우지 않는다. 숫자 0·체크 false·빈 값/지우기를 구별한다.
- 필드 값은 task.data.custom_fields에 stable ID로 저장한다. 프로젝트 이동과
  독립 ZIP 복원에서 정의·현재 값·과거 revision을 보존한다. 다른 사용자의
  정의는 API/쓰기/보기 설정에서 참조할 수 없다. 알 수 없는 정의를 추정하지 않는다.
- 저장 보기는 이름·레이아웃과 기본 표시를 가진 직접 선택 탭이다. 범위/검색/
  필터/열/카드 필드와 밀도를 함께 저장한다. 이름 변경·기본 변경은 저장된
  설정을 유지하고, 현재 미저장 설정을 덮어쓸 때는 ‘현재 보기 업데이트’를 누른다.
  보기 삭제는 확인 후 수행하고 작업과 현재 화면은 유지한다.
- 모바일은 기본 목록·직접 모드 선택·가로 칸반을 유지한다. 속성은 작은 편집
  단서로 표시하고 저장 보기는 가로 탐색한다. 좁은 화면에서 페이지 전체를
  가로로 밀지 않는다. 기존 작은 체크/44px 터치와 상태 드롭다운을 유지한다.

## 수용 조건

APP-REQ-045~048로 추적한다. 2026-11-02 실제 앱 구현·검증과 운영 배포를
완료했다. 아래 상태는 격리 DB/로컬 브라우저와 운영 서버·HTTP 증거이며,
물리 기기나 인증 후 운영 화면의 수동 조작 통과를 뜻하지 않는다.

| AC | 확인할 결과 |
|---|---|
| 85 | 제목만으로 생성하고 프로젝트 문맥·첫 화면 작업 가시성 유지 |
| 86 | 기존 필드의 행 내 편집·취소·실패 입력 보존과 revision 검사 |
| 87 | 다섯 타입 사용자 필드 생성·값 검증·계정 격리·0/false/null 구별 |
| 88 | 열/카드 필드의 표시·숨기기·순서와 개인 보기/메모리 복원 |
| 89 | 이름 있는 보기의 생성·이름 변경·복제·기본·명시 갱신·삭제 확인 |
| 90 | 보기 전환의 범위/검색/초안/선택/URL 보존과 legacy v1/v2 |
| 91 | 필드 정의/값/과거 revision의 프로젝트 이동·ZIP 보존 |
| 92 | 모바일 목록·직접 선택·가로 보드·필드 편집·320~430px·키보드 |
| 93 | PostgreSQL/API·웹·build·favicon·실제 앱 브라우저를 구별해 통과 |
| 94 | 비공개 백업·무손실 migration·운영 image/자산/인증 경로 검증 |

실행 증거는 [구현 검증](../implementation/verification.md),
운영 반영과 rollback 조건은 [배포 기록](../implementation/deployment.md)에 있다.
실제 로컬 앱의 합성 QA 화면은
[데스크톱](../implementation/screenshots/task-management/desktop-fields-views.png),
[필드 선택](../implementation/screenshots/task-management/field-chooser.png),
[모바일](../implementation/screenshots/task-management/mobile-fields-views.png)로 남겼다.
운영 QA 순서는 [추가 안내](../implementation/task-workspace-v2-qa.md)를 따른다.
독립 leaf는 backend/typed fields, 필드 UI, 저장 보기 UI로 나누고 주 에이전트가
TaskWorkspace·화면·브라우저·전체 검사와 배포를 통합한다. router의 실제 leaf
생성 설정은 gpt-6.1-sol/high이며 주 모델은 확인되지 않아 변경하지 않았다.
