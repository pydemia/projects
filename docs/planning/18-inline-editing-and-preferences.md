# 선택한 자리에서 수정하기

2026-11-03 사용자 결정. 프로젝트명·작업 제목·본문·속성·유형을 선택해
수정하고, 좁은 GNB와 작업 입력/검색의 여백을 보완한다. 테마는 사용자 설정
화면으로, 프로젝트 ZIP은 해당 프로젝트의 메뉴로 옮긴다. 기존 데이터·ID·
revision·완료 조건·프로젝트 선택·보기 전환·초안 복원 계약은 유지한다.

## 확인한 근거

- [ClickUp 작업 메뉴](https://help.clickup.com/hc/en-us/articles/34908401465111-Task-settings-menu):
  항목에 속한 유형·사용자 필드·관계·이력 등의 행동을 항목 문맥에 둔다.
- [Notion 데이터베이스](https://www.notion.com/help/intro-to-databases)와
  [속성](https://www.notion.com/help/database-properties): 상세에서 값 자체를
  선택해 타입별 입력을 여는 방식과 목록 안의 이름 수정을 참고한다.
- [Google Calendar](https://support.google.com/calendar/answer/72143?co=GENIE.Platform%3DDesktop&hl=en):
  필요한 필드를 수정하고 저장을 구분하는 흐름을 참고한다. 이 문서는 제목을
  클릭하면 자동 저장된다는 근거가 아니며 Projects도 자동 저장으로 바꾸지 않는다.
- Note 실제 로컬 소스 `src/web/App.tsx`의 제목 입력, `DatabaseProperties.tsx`와
  `PropertyValueInput.tsx`의 값별 입력·초안·IME·취소·날짜 UI,
  `AccountSettings.tsx`/`AppearanceSettings.tsx`의 설정 분리를 읽었다.
  공개 Note 페이지는 웹 읽기 도구에서 열리지 않아 인증 후 운영 화면을
  직접 조작한 결과로 기록하지 않는다. Note의 블록 편집기나 서버 동기화는 복사하지 않는다.
- 공통 UI의 실제 공개 `https://ui.pydemia.ai/r/pyd-editable.json` 200과
  local `packages/ui/src/components/editable.tsx`를 확인했다. registry SHA-256은
  `e46dcb26843f2e478bc1120adffe229e98e660c8b6f59558b3aa1e34c118a846`,
  local 원본 파일 hash는
  `751dacdee9668fa3f05f0e2e16fb1b258e50a5d61edf19ebfe8b4fa2db8a19a5`다.
  upstream의 별도 수정 버튼 예시를 근거로 기존 Pydemia Input/Button/Textarea/
  Popover/DropdownMenu를 조합했다. 값 클릭·실제 API 오류·revision 관리는 Projects가
  맡고 새 패키지나 registry source를 추가하지 않는다. upstream 검수 대기를
  스크린리더 통과로 해석하지 않는다.

skills.pydemia.ai의 `frontend-development` 원문을 skills/library 표면에서
revision `5059f7155c0caad9ec06dfa7126000dbca11ebef`, SHA-256
`84dc2e99f20cecd32d9bd29f48638a3a03024135a957f5bc422421b47ca1ca19`로
읽고 적용했다. product-ui-ux-design·visual-grouping·JS/TS·개발 검증 지침을
조합했다. 독립 leaf는 API/유형 전환, 입력 컨트롤, 속성 컨트롤로 나누고
주 에이전트가 host 상태·초안·탐색·검증·배포를 통합한다. router의 실행 leaf는
gpt-6.1-sol/high이며 주 설정은 확인되지 않아 변경하지 않았다.

## 편집과 저장 계약

제목은 원래 텍스트 크기의 버튼이다. 클릭/키보드 선택으로 입력란이 나타나고,
Enter/저장으로 확정하거나 Esc/취소로 돌아간다. IME 조합 중 Enter/Esc는 저장·
취소로 처리하지 않는다. 본문은 Markdown의 의미와 링크·선택을 유지하며
본문 클릭 또는 수정 버튼으로 같은 자리에 textarea를 연다. Ctrl/⌘+Enter가
저장이고 일반 Enter는 줄바꿈이다. blur는 저장하지 않는다.

상태·유형·기본/추가/사용자 속성은 라벨과 현재 값의 행으로 비교한다. 값의
선택만 작은 Popover 입력으로 바꾼다. 모바일은 44px 조작 높이와 한 열 속성,
데스크톱은 같은 속성 라벨을 정렬한다. 모든 속성을 항상 입력 상자로 만들지
않는다. 작업 유형은 개인 할 일/구현 작업이며 arbitrary 객체 종류 변환은 범위 밖이다.

프로젝트명은 개요 제목과 프로젝트 항목의 메뉴에서 수정한다. owner와 현재
version을 검사하고 이름만 바꾼다. 작업 제목/본문은 기존 revision 저장을,
속성은 제공된 키만 합치는 PATCH를 사용한다. 0/false/빈 값의 의미는 유지한다.
실패는 입력을 보존하고 충돌은 최신 내용을 명시적으로 불러오고 다시 저장한다.
최신 데이터를 읽었다는 이유로 자동 재시도하거나 다른 속성을 덮어쓰지 않는다.
편집 중 도착한 다른 속성 응답은 제목/본문 초안과 그 기준 revision을 유지한다.

현재 사용자 결정이 과거 APP-REQ-017의 ‘생성 후 유형 불변’을 수정한다.
유형 변경은 별도 API의 명시 행동이다. 구현 작업으로 바꾸면 테스트 필수가
켜지고 완료 상태라면 기존 의존·수용 기준·결과·테스트 조건을 검사한다.
조건이 없는 완료 작업은 재개 후 전환하도록 안내한다. 개인 할 일로 바꾸면
개인 완료 규칙을 적용하며, UI에 두 유형의 의미를 표시한다. 일반 PUT으로
유형을 몰래 바꾸는 것은 여전히 거부한다. ID·관계·이력·본문·다른 값은 보존한다.

## 설정·탐색·프로젝트 행동

`?view=settings`는 프로젝트 데이터 화면과 구별되는 계정/화면 설정이다.
GNB·사이드바·모바일 더보기에서 접근하고 선택한 프로젝트는 유지한다.
기존 테마 공급자와 브라우저 저장을 재사용하며 계정 간/기기 간 동기화를
새로 제공한 것으로 표현하지 않는다. 테마 선택창·AI 연결 상태는 GNB에서
설정으로 옮겨 좁은 폭에서 탐색 제목과 겹치지 않게 한다.

프로젝트 ZIP은 프로젝트 항목/개요의 `…` 메뉴에서 내려받는다. GNB와 모바일
전역 설정에는 두지 않는다. 같은 메뉴의 이름 수정은 바로 입력란을 연다.
작업 입력 Card의 양 옆 여백을 16px로 맞추고 검색의 내부 간격과 중간 폭
도구 줄바꿈을 조정한다. 내용 범위·읽는 순서·기존 theme token을 보존하며
장식 카드나 탐색 강조 줄을 추가하지 않는다.

## 수용 조건과 추적

| AC | 요구·관찰 |
|---|---|
| 97 | APP-REQ-050: 프로젝트명 직접 수정·owner/version·소속/URL/목표/순서 보존 |
| 98 | APP-REQ-051: 목록/보드/상세 제목과 상세 본문을 편집 탭 전환 없이 수정 |
| 99 | 상태·취소 사유·개인 완료·구현 완료 gate를 유지하는 속성 조작 |
| 100 | 기본/추가/사용자 필드의 타입별 입력·0/false·다른 값 보존 |
| 101 | APP-REQ-052: 명시 유형 전환·과거 이력과 완료 조건·개인/구현 의미 |
| 102 | 실패/409·초안 재방문·동시 속성 응답과 명시 병합·재시도 |
| 103 | 제목 drag/클릭 구분·기존 handle·IME·키보드·포커스 복귀·44px |
| 104 | Note/UI/공식 문서와 skills 원문 출처·기존 PostgreSQL/Note/Hub 경계 |
| 105 | 실제 앱/격리 DB 브라우저·전체 검사·build/favicon·mock 범위 구별 |
| 106 | 운영 백업·image/source 일치·기존 데이터·인증·무변경 schema |
| 107 | APP-REQ-053: 설정·테마 저장·선택 프로젝트 유지·좁은 GNB |
| 108 | APP-REQ-054: 프로젝트 항목의 이름 수정/ZIP, GNB ZIP 제거 |
| 109 | 작업 입력/검색 좌우 간격·320~1440px·light/dark의 넘침 |

현재 실행 증거와 한계는 [검증 기록](../implementation/verification.md),
운영 결과와 rollback은 [배포 기록](../implementation/deployment.md)에 연결한다.

2026-11-03 구현·운영 반영을 완료했다. backend 253개·web 142개와 실제 앱/
격리 DB의 inline 13 checkpoint, 기존 discovery/drag/전환 회귀가 통과했다.
모바일 프로젝트 선택창의 메뉴·이름 입력도 Dialog 내부 portal로 연결해
포커스/패널 경계를 확인했다. 물리 기기·인증 후 운영 UI 조작과 외부 서비스
실연동은 미검증이다. [환경설정 화면](../implementation/screenshots/inline-editing/preferences-mobile.png),
[직접 편집 화면](../implementation/screenshots/inline-editing/detail-mobile-light.png),
[프로젝트 항목 이름 수정](../implementation/screenshots/inline-editing/project-picker-rename.png)을 남겼다.

## 2026-11-03 날짜·시간 표시 설정 추가

APP-REQ-056: 사용자 설정의 `날짜와 시간`에서 두 표시 형식을 각각 정의한다.
날짜 6종과 시간 6종(12/24시간·초 포함)을 제공하고, 직접 입력도 지원한다.
선택/입력→예시 미리보기→`형식 적용`으로 저장한다. `기본값 선택`은 기본
형식을 미리 보여주며 적용 버튼을 눌러 확정한다. 기본값은 `YYYY-MM-DD`, `HH:mm`이다.

날짜 token은 YYYY/YY·MM/M·DD/D, 시간은 HH/H 또는 hh/h·mm/m·선택 ss/s와
A(오전/오후)/a(am/pm)다. 한 줄 64자 이내에서 연·월·일 및 시·분을 한 번씩
사용한다. 12시간은 오전/오후를 필수로 함께 쓰고 24시간과 혼합하지 않는다.
지원하지 않는 token·중복·필수 값 누락은 설명과 함께 적용을 차단한다.

현재 브라우저의 별도 version 1 저장소를 쓰며 서버 계정/기기 간 동기화를
추정하지 않는다. 다른 열린 탭의 적용은 storage event로 반영한다. 저장 실패는
현재 탭에서 적용하고 경고·명시 재시도를 제공한다. 미적용 변경은 재인증
checkpoint에서 이동을 차단한다. UI/날짜 formatter는 기존 Pydemia Input·
NativeSelect·Field·Button을 조합하며 새 dependency나 공통 registry 편입은 없다.

작업의 기본/사용자 날짜, 목록/보드/상세, 달력의 전체 날짜·기간 밖 작업,
프로젝트 생성·최근 편집·revision·기준선·스킬 실행·테스트·Git·소속 이동 이력에
적용한다. 월/요일 탐색 제목은 한국어 탐색 레이블을 유지한다. 날짜 입력기의
표시는 브라우저/OS에 맡기고 저장 값은 ISO 날짜를 유지한다.
[MDN date input](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/date)의
표시/값 구분과 [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)의
시각/현지 시간 구분을 확인했다. 날짜 전용 값은 연·월·일을 직접 포맷해
시간대 이동을 피하며 timestamp는 기존 기기 시간대로 표시한다. 예정일/마감일의
정렬·필터·오늘 집계와 API/DB·revision·ZIP 원문은 표시 설정 때문에 바꾸지 않는다.

| 조건 | 수용 기준 |
|---|---|
| AC-116 | 기본/직접 입력 형식·예시·적용·기본값 선택, invalid 적용 차단 |
| AC-117 | 새로고침/메뉴 방문·다른 탭 반영, 저장소 손상 fallback·실패 안내/재시도 |
| AC-118 | 목록/보드/상세·날짜 필드·기록 시각의 공통 표시, ISO 편집/저장 보존 |
| AC-119 | 12/24시간·초·자정/정오·윤년·다른 시간대·모바일 light/dark |
| AC-120 | 전체 검사·재인증 회귀·image/source·운영 업무 데이터 보존 |

최종 실행·배포 증거와 미검증 범위는 [검증](../implementation/verification.md)과
[배포](../implementation/deployment.md)에 기록한다.

## 2026-11-03 시간대·날짜/시간의 UI 구분

APP-REQ-057: 날짜·시간 속성에서 `T`와 `+09:00` 같은 전송용 표기를 생략한다.
후속 사용자 지시로 날짜와 시간 사이의 구분은 문자열 whitespace가 아니라
별도 요소와 CSS gap으로 구현한다. 위 AC-116~120의 표시 계약을 확장한다.

- `설정 → 날짜와 시간`에 IANA 시간대 선택을 둔다. 기기 설정·UTC·서울 등 주요
  지역과 실행 환경이 지원하는 나머지 지역을 제공한다. 기존 v1 형식은 유지하고
  시간대가 없으면 이전처럼 기기 설정을 따른다. 명시 선택은 기기 시간대보다
  우선하며 브라우저 저장·다른 탭 갱신·적용 전 미리보기를 유지한다.
- 시각은 UTC epoch으로 해석하고 Intl.DateTimeFormat의 timeZone으로 표시한다.
  offset이 있는 값은 한 번만 변환하고, 과거 zone-less timestamp는 UTC로 해석한다.
  DST와 30분 등 차이는 IANA 규칙을 따른다. 잘못된 시각은 정상 속성 UI에서
  `날짜 확인 필요`로 표시한다. 날짜 전용 YYYY-MM-DD는 시간대 변환하지 않는다.
- DateTimeValue는 의미 있는 time 요소 아래 날짜와 시간을 별도 span으로 두고
  flex gap을 준다. 사이에 텍스트 공백을 넣지 않는다. 접근 가능한 이름은 자연스러운
  날짜/시간이고 datetime 속성은 내부 UTC 시각이다. 중첩 time은 제거한다. native
  기준선 option은 이름/날짜 텍스트만 두고, 선택한 기준선의 시각을 별도 UI로 보여준다.
- 서버의 기존 UTC-aware utcnow·PostgreSQL timestamptz와 API/ZIP 원문은 유지한다.
  사용자 시간대는 표시 설정이며 업무 날짜·오늘 필터·저장된 revision을 바꾸지 않는다.
  [PostgreSQL 17](https://www.postgresql.org/docs/17/datatype-datetime.html)과
  [Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)의
  내부 시각/표시 시간대 구분을 확인했다.

| 조건 | 수용 기준 |
|---|---|
| AC-121 | UTC/Z·offset·zone-less 시각 정규화와 사용자 시간대 변환, raw 표기 생략 |
| AC-122 | 날짜/시간의 별도 DOM 요소·실제 CSS gap·접근 가능한 이름·좁은 화면 줄바꿈 |
| AC-123 | 기존 형식 유지, 명시 시간대의 기기 설정 우선·저장/새로고침·다른 탭 반영 |
| AC-124 | 날짜 전용 값 보존·DST/반시간·날짜 경계·invalid timezone/timestamp 검사 |
| AC-125 | 전체 검사·실제 앱/격리 DB 브라우저·재인증 회귀·운영 무손실 반영 |

회귀 과정에서 확인한 응답 전 DB commit 보완은 APP-REQ-055 / AC-110~115의
로그인 직후 가시성 계약으로 함께 검증한다. schema·인증 정책은 바꾸지 않는다.

## 2026-11-03 데스크톱 작업 제목의 이른 줄바꿈

APP-REQ-058: 작업 제목이 확보된 열 너비를 채우고 데스크톱에서 너무 짧게
줄바꿈하지 않도록 한다. 실제 1440px에서 제목 열 547.625px에 비해 제목 버튼은
283.922px만 사용했다. legacy inline-block과 내부 100% 버튼의 intrinsic sizing을
외곽 제목의 명시 100% 너비로 보완한다. 한글은 어절을 우선해 줄바꿈하고 긴
단일 문자열은 필요한 경우 분리한다. 보드/inline edit도 같은 너비 계약을 쓴다.

데스크톱 목록의 제목 열은 최소 400px를 확보하며 기존 속성과 계획/메뉴 열은
목록 내부 가로 스크롤로 접근한다. 모바일은 기존 유동 열과 줄바꿈을 유지한다.
편집·카드 drag·상세 전환·저장 값은 바꾸지 않는다.

| 조건 | 수용 기준 |
|---|---|
| AC-126 | 1024~1920px·간단/상세·2/8개 필드에서 제목이 열을 채우고 최소 너비 확보 |
| AC-127 | 전역 제목 입력/저장·보드 편집/drag·상세 폭과 내부 스크롤의 마지막 메뉴 접근 |
| AC-128 | 320/390/430px 및 공백 없는 긴 제목의 페이지 넘침 방지·전체 웹 검사/빌드·운영 보존 |
