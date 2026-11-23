# 프로젝트별 권한 구현 goal

2026-11-07 사용자 `goal로 구현해 줘`, `subagent도 사용해 줘`에 따라 착수했다.
기준은 [기획 20](../planning/20-tenancy-and-project-permissions.md)의 최신
APP-REQ-061 / AC-133~137이다. 로그인은 pydemia.ai 조직 계정으로 유지한다.
프로젝트별 멤버십·기본/사용자 지정 역할·동작별 권한과 기존 자료 이관을
구현·검증하고 기존 배포 권한에 따라 운영에 반영한다.

## 완료 기준과 진행률

아래 16개는 동일 가중치다. 구현과 해당 검증이 모두 끝난 항목만 완료로 센다.
부분 구현·미검증·운영 대기는 분모에서 제외하지 않는다. 기존 로그인 검사와
설계 문서 완료를 이번 구현 완료로 소급하지 않는다.

| ID | 수용 조건 | 현재 상태·필수 증거 |
|---|---|---|
| PG-01 | 기존 프로젝트/역할/오너/필드/개인 순서 이관 | 검증 완료; 실제 0010→0011 이관 fixture의 version·필드 ID/revision·오너·개인 순서 보존 |
| PG-02 | 프로젝트별 멤버십과 기본 역할·사용자 지정 권한 | 검증 완료; core PostgreSQL 16개, composite role FK·기본/사용자 지정 권한 검증 |
| PG-03 | 멤버·역할 관리, revision·감사, 마지막 오너 보호 | 검증 완료; core+HTTP의 동시 변경·권한 상승·마지막 오너 거부 |
| PG-04 | 일회성 초대 수락·철회·만료 및 명시적 오너 이전 | 검증 완료; 실제 API/Edge의 최신 미리보기·명시 수락·타 계정/재사용 거부 |
| PG-05 | 목록/검색/전체 작업/집계/cursor의 현재 읽기 권한 | 검증 완료; 실제 API/Edge의 A 에디터/B 뷰어/C 비멤버와 권한 변경 cursor |
| PG-06 | 제목/본문/속성/유형/상태/드래그/일괄 변경의 권한 | 검증 완료; HTTP 24개 변경 경로 거부+자료 보존, Edge 실제 편집/상태/드래그 |
| PG-07 | 문서/관계/기준선/테스트의 권한·외부 참조 제한 | 검증 완료; HTTP 숨은 link/run/기준선 ID 비노출 및 실제 두 transaction의 경합 409 |
| PG-08 | 프로젝트 필드와 개인 보기·개인 목록 순서 격리 | 검증 완료; 필드/ZIP/HTTP 개인 보기·개인 순서·현재 읽기 범위 검사 |
| PG-09 | 프로젝트 이동·미리보기·되돌리기·receipt 권한 | 검증 완료; 실제 PostgreSQL 양쪽/전체 원본 권한·활성 입력 제한·독자 변화·경합/receipt 재검사 |
| PG-10 | ZIP/portable/Git 가져오기·내보내기 권한 | 검증 완료; PostgreSQL 원본 이동/외부 provenance/반출 경합 409·개인 보기 격리·Git 현재 권한 중복 검사 |
| PG-11 | SkillRun 생성/실행/재시도/적용 시 현재 권한 | 검증 완료; 실행 검사 38개+기존 private source 회귀. 현재 원본·삭제 후 재가입·실행 직전/재시도/적용 권한 |
| PG-12 | 프로젝트 멤버·권한 설정 UI와 초대/오너 수락 UI | 검증 완료; 실제 Edge 10개 묶음과 설정 13개 웹 검사. 320/390px light/dark 선택 대비·token mask 캡처 |
| PG-13 | 역할별 기존 UI·모바일·권한 철회/재로그인 복원 | 검증 완료; Edge 읽기 전용/403/철회·cache/draft/소유권, 기존 재로그인 11개 통과 |
| PG-14 | 지정 backend/web 정적·회귀·실제 브라우저 검사 | 검증 완료; backend 369개, Ruff check/format 73개 파일·mypy 32개 소스, 웹 34개 파일·245개 검사, host/Linux build와 실제 Edge 통과 |
| PG-15 | 독립 리뷰와 지적 수정·최종 source/hash 일치 | 검증 완료; 독립 리뷰의 8개 권한 경계 지적 수정·회귀 통과, 최종 배포 source/hash 대조 |
| PG-16 | private 백업·운영 이관·서비스/자산/auth 검증 | 검증 완료; private 백업·0010→0012 이관·기존 자료 fingerprint 보존·최종 이미지/서비스 확인, 실제 공개 Edge의 로그인 진입·token 보존·API 인증·Microsoft 시작·자산 일치 4개 checkpoint 통과 |

착수 시 0/16에서 core 1/16, API/Edge 수용 검증 후 10/16, 추가 경계와
브라우저 검사 후 13/16, 전체 회귀·리뷰 후 15/16으로 진행했다.
최종 운영 공개 Edge와 source/archive 재대조까지 마쳐 **16/16(100%) 완료**다.
분모와 동일 가중치를 유지했고 남은 필수 구현·배포 작업은 없다. 완료 판정의
신뢰도는 높으며 실제 Microsoft 다른 계정 승인 후 조작·실제 Hub/LLM/Note·
물리 모바일 기기는 실행 범위와 구분한 미검증이다. 최종 근거는
[검증](verification.md)과 [배포](deployment.md)의 최신 절을 따른다.

초기 통합에서 읽을 수 없는 target을 404 대신 422로 반환하던 문제, 웹
fixture 이름과 읽기 전용 초안 복원 문제를 수정했다. 독립 리뷰의 원본 이동·반출/관계 경합·기준선/실행 이력
지적도 수정하고 회귀로 확인했다. mocked Hub/LLM·합성 Entra·격리 DB 계정과
실제 Microsoft 계정 검사는 구분하며 실행하지 않은 실계정 검사는 미검증으로
남긴다.

실제 앱에 삭제 기능이 없으므로 작업/프로젝트 삭제를 동작 설정의 체크 항목으로
표시하지 않는다. `task.delete`/`project.delete`는 미제공 동작으로 문서에서만
예약하고 활성 서버 권한 목록(18개)과 UI에서 제외했다. 보관·복원은 서버와 UI 모두
오너 전용으로 맞췄다. 이는 이번 권한 goal에 새 파괴적 삭제 기능을 추가하지
않으면서 설정 가능한 동작을 실제 기능과 일치시키는 구현 판단이며 분모 16개는
유지한다.

로컬 기본 DB는 개발 초기에 0011 draft를 먼저 실행해 기존 creator/repository
index와 이전 역할 목록이 남아 있었다. 기존 자료를 재작성하거나 DB를 초기화하지
않도록 `0012_acl_policy_consistency`로 정합성을 보완했다. 이미 최종 0011을
실행하는 운영 이관에서는 의미 변경이 없다. draft의 잔여 index를 제거하고
기본/사용자 지정 역할을 지원 권한에 맞춰 정리하며, 권한의 의미가 바뀐 역할과
프로젝트의 revision만 갱신한다. 실제 PostgreSQL draft→0012 복구 및
기존 0010→head 보존 검사가 17개 통과했고 독립 읽기 검토를 받았다.

## 작업 경계와 실행 순서

- core agent: database/migration, project_access 정책·관리 서비스·DTO와 핵심 PostgreSQL 검사.
- data agent: records/trace/context, ZIP/portable, transfer의 actor·현재 프로젝트 권한.
- run agent: SkillRun 요청자·멤버십, 실제 실행 직전 재검사·권한 철회 회귀.
- settings UI agent: 프로젝트 멤버/역할 관리·초대/오너 수락 화면과 계약.
- UI integration agent: 기존 화면의 capability 제어·권한 갱신·프로젝트 설정 route.
- root: API/전역 조회/필드·lock 순서 통합, 전체 검사·리뷰 수용·배포·최종 판정.

공유 checkout의 소유 파일을 구분하고 subagent는 재위임하지 않는다. root가
현재 checkout의 기존 미커밋 수정·첨부를 보존한다. push/commit/PR은 요청하지
않았으므로 이 goal에 추가하지 않는다. 인증·Hub 원문/revision/hash·Note 문서
권한 경계를 유지하고 DB는 PostgreSQL만 사용한다.

프로젝트 접근 검사는 owner_id fallback 없이 멤버십·역할로 통일한다. 서버의
현재 권한이 최종 기준이며 UI는 같은 capabilities를 표시한다. 변경 잠금은
account(있는 경우) → project ID 순 → item 순을 따르고, 공유 관계 그래프의
경쟁 삽입과 권한 변경을 명시적으로 직렬화한다. worker의 외부 LLM 호출 전
요청 당시 membership ID와 현재 실행 권한을 다시 확인한다.

## 검사와 운영

AGENTS.md의 PostgreSQL/pytest/Ruff/mypy·웹 check/build를 모두 실행한다.
격리 PostgreSQL schema와 실제 Edge에서 여러 계정·여러 역할·권한 철회·
이동/ZIP/worker와 모바일·desktop 조작을 검사한다. mocked Hub/LLM·합성 Entra와
실제 운영 Microsoft 계정 조작은 각각 구분한다.

운영 기준 이미지 `47b682394f07d58d`의 PostgreSQL/state/config를 private 백업한
뒤 `ea7acc4fbce89dd6`로 최초 이관했다. schema 0010→0012, 프로젝트 6개·오너
멤버십 6개·역할 18개를 확인했다. 기존 프로젝트 6개·items 28개·revisions
42개 등을 기존 legacy columns의 fingerprint로 대조해 자료 보존을 확인했다.

최종 이미지 `986e0a1af12655bb`를 배포했고 전환 전후 DB 자료가 같았다.
app·DB는 healthy이며 proxy·edge도 정상 동작했다. shell proxy의 공개 허용은
GET root·정적 자산·auth options·health에 한정하고 업무 데이터 API의 인증은
유지했다. 공개 실제 Edge에서 앱 shell, 초대 fragment checkpoint 보존과
토큰을 포함하지 않는 로그인 `rd`, 비로그인 API와 위조 헤더 차단,
Microsoft authority·계정 선택·S256·nonce, JS/CSS/favicon bytes·MIME 일치와
브라우저 runtime 오류 없음의 4개 checkpoint가 통과했다. 최종 source/archive
hash 재생성도 운영 식별과 일치해 root가 PG-16을 완료로 판정했다.

additive/권한 schema 이관 후 옛 owner-only 이미지로 무작정 복귀하지 않고
호환 가능한 복구 경로를 유지한다. 사용자 업무 데이터나 인증 자료를 검사
산출물로 내보내지 않는다.
