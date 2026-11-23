# 로그인 만료 후 재인증·원래 화면 복귀

2026-11-03 사용자 요청: Note처럼 로그인 만료 시 로그인 화면으로 이동하고,
로그인 후 원래 경로로 복귀한다. APP-REQ-055 / AC-110~115의 실행 기준이다.

## 동작 계약

- 로그인한 앱의 API/프로젝트 ZIP 요청이 401이면 화면을 유지하고 checkpoint를
  실행한다. Microsoft는 `/oauth2/start`, 로컬 계정은 `/?view=login&returnTo=...`로
  이동한다. 로그인 후 pathname/search/hash를 복원한다.
- 프로젝트·작업·범위/표시/밀도/검색과 알 수 없는 query·fragment를 유지한다.
  마지막 보기 기억이나 저장 보기 적용이 명시 URL을 재작성하지 않는다.
- 첫 접속의 401은 정상 로그인이다. 잘못된 비밀번호/가입 401, 권한/CSRF 403,
  네트워크 실패는 재인증을 시작하지 않는다. 저장·생성·이동·다운로드는 자동
  재전송하지 않는다. 사용자가 다시 저장하며 기존 revision/version을 유지한다.
- 외부 origin, `//`, backslash/control, 반복 인코딩 위험 경로, OAuth/API/자산
  경로와 재귀 로그인은 복귀 대상으로 거부한다. 안전하지 않으면 `/`로 간다.
- 동시 401은 한 번만 이동한다. 같은 계정·주소의 60초 내 재발은 자동 이동을
  멈추고 `다시 로그인`을 제공한다. 정상 session bootstrap만으로 기록을 지우지
  않으며 명시 재시도 또는 60초 경과로 풀린다.

## 초안과 이동 실패

8초 이내 모든 checkpoint가 성공해야 이동한다. 기존 항목 초안은 사용자별
localStorage에 즉시 flush하고, 제목/속성/상태/유형·생성·보기 이름은 사용자별
sessionStorage에 strict schema로 보관한다. 이름/속성 편집은 입력을 시작한
version/revision을 복원하며 최신 서버 값으로 자동 rebase하지 않는다.

복구 표면: 기존 항목 제목/본문/data·새 항목, 프로젝트 이름/생성, 목록/보드 제목,
보드 새 카드, 빠른/모바일 입력, 목록/상세 속성, 상태/유형과 취소 이유, 필드 생성,
저장 보기 대화상자. 중복 마운트되는 목록/상세·프로젝트 메뉴/개요는 별도 키다.
사용자 변경 시 authenticated subtree를 remount하고 다른 계정 초안을 읽지 않는다.

이동·Note 참조·관계·테스트 결과의 미저장 입력 및 불확실한 이동 결과는 이동을
차단한다. 입력을 보관하고 창을 닫거나 편집을 끝낸 뒤 재시도한다. 저장 공간/
스키마 오류·timeout·다른 beforeunload 차단도 화면을 유지한다. 안내는 기존 Dialog
안에 두어 focus trap 중에도 접근할 수 있다. 모든 임시 폼 자동 복구를 보장하지
않는다. 비밀번호·CSRF·cookie·OAuth code/token은 복구 저장소에 넣지 않는다.

아직 받지 않은 Markdown chunk 실패는 `/api/session`의 실제 401을 확인한 경우에만
부모 편집기를 유지하고 같은 복구 경로로 보낸다. 일반 오류를 만료로 추정하지 않는다.

## 실제 참고 구현·프록시 경계

Note 로컬 source `src/web/reauthentication.ts`, `use-reauthentication-checkpoint.ts`,
`components/AuthenticationRecovery.tsx`와 client 401 처리를 읽었다. 경로/검색/hash,
checkpoint·60초 반복 방지를 Projects의 비밀번호 모드·revision·입력 폼에 적용했다.
이 Note checkout은 HEAD가 없어 고정 commit을 확인한 것으로 표시하지 않는다.

운영 oauth2-proxy v7.15.2의 [director](https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.2/pkg/app/redirect/director.go),
[validator](https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.2/pkg/app/redirect/validator.go),
[fallback](https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.2/pkg/app/redirect/getters.go)를 확인했다.
상대 `rd` 전체의 `//`, `/../` 등을 거부하므로 검색 값에 `https://...` 또는 hash에
`//`가 있으면 안전한 원문도 `/`로 돌아갈 수 있다. 이 경우에만 검증한 원문을
`/?view=login&returnTo=<인코딩한 원문>`으로 감싸 `rd`에 넣고 인증된 bootstrap에서
원래 주소를 복원한다. 일반 주소는 직접 `rd`를 사용한다. 운영 합성 요청에서 raw
주소의 fallback과 wrapper 보존을 확인했다. 초기 미인증 deep link는 기존 proxy가
path/query를 보존하므로 compose/Caddy 변경은 필요하지 않다.

## 수용 조건과 증거

| ID | 수용 조건 | 검사 |
|---|---|---|
| AC-110 | 401→모드별 로그인→전체 원래 주소 | controller/App/API, 실제 로컬 세션 무효화·Edge 복귀 |
| AC-111 | 초안/old revision 보존·자동 재전송 없음 | typed checkpoint, 실제 편집·동시 409 |
| AC-112 | storage/timeout/미저장 폼 차단·재시도 | controller/form, 실제 quota 실패·속성 복구 |
| AC-113 | 동시 401·재발·권한·로그인 오류 구분 | 실제 비밀번호 오류, 합성 provider/401 storm/403/network/loop |
| AC-114 | 안전한 복귀·계정 격리·프록시 제한 | URL/owner, 실제 로컬 로그인, 합성 provider·운영 HTTP |
| AC-115 | 전체 검사·기존 회귀·무손실 배포 | [검증](../implementation/verification.md), [배포](../implementation/deployment.md) |

실제 Microsoft 로그인 완료·물리 휴대전화·OS 키보드·스크린리더·Hub/LLM/Note
호출은 별도 미검증이다. 합성 provider와 실제 API/DB 검사를 구별한다.

2026-11-03 시간대 표시 작업의 회귀에서 로그인 직후 독립 요청이 401을 받는
경쟁을 재현했다. 기본 yield dependency는 HTTP 응답 이후 DB transaction을
commit했고, 응답 시작 시 다른 PostgreSQL 연결에서 새 세션이 보이지 않았다.
DB dependency를 function scope로 바꿔 응답 전에 commit한다. 같은 ASGI 응답
경계 검사가 수정 전 실패/수정 후 통과했으며 기존 인증·CSRF 정책은 유지한다.
API는 DB를 필요로 하는 streaming 응답을 사용하지 않는다.
[FastAPI scope 문서](https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-with-yield/#early-exit-and-scope)를
확인했고 최종 회귀 결과는 [검증](../implementation/verification.md)에 남긴다.
