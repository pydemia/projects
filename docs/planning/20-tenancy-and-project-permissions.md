# Entra 로그인·멀티테넌시와 프로젝트 권한

2026-11-07 사용자 요청. 다른 계정의 로그인 500 조사, 인증 멀티테넌시와
프로젝트별 멤버·역할·동작 권한의 구현 및 로컬 검증 결과를 구분한다.
조직에 로그인할 수 있다는 사실만으로 다른 사용자의 프로젝트가 공유되지는 않는다.

2026-11-07 후속 사용자 결정: 로그인 대상은 `pydemia.ai` 조직 계정이고,
업무 데이터의 테넌시·접근 권한은 **프로젝트 단위**다. 프로젝트별로 허용된
사용자만 해당 프로젝트를 목록에서 보고 부여된 권한에 따라 조작한다.
아래 구현 계약은 이 결정을 반영했다. 앞서 제안한 Workspace 역할 상속과
프로젝트별 ACL 후순위 방침은 채택하지 않는다. 프로젝트 권한 구현과 실제
PostgreSQL·HTTP·Edge의 로컬 검증을 완료했다. 운영 `986e0a1af12655bb`에 반영하고
schema `0012`·현재 멤버십·기존 자료 fingerprint 보존 및 공개 Edge 4개 checkpoint를
확인했다. 상세 운영 결과는 [배포 기록](../implementation/deployment.md)을 따른다.
실제 Microsoft 다른 계정의 승인 후 로그인은 미검증이다.

## 최초 Entra 조사 이력과 현재 상태

운영 `b8efb8b43cd14806`에서 app/DB는 healthy, 앱 예외는 없었다. OAuth2 Proxy
로그의 두 콜백(2026-11-07 01:04:17·01:04:26)은 다음 이유로 실패했다.

> unable to enrich session: neither the id_token nor the profileURL set an email

Entra 승인·코드 교환 이후 프록시 세션 생성 단계에서 실패하며 Projects API에
도달하기 전이다. 따라서 DB 계정을 주 소유자에 합치거나 권한을 넓혀 고칠 문제가 아니다.
현재 고정된 프록시 v7.15.2에 합성 RSA 서명 토큰을 넣어 기존 email 기반
사용자 클레임 설정의 500을 재현했다. `preferred_username` 표시 이름과 `sub`
식별자로 변경하면 email 클레임 없이 정상 콜백이 된다.

운영 자격으로 Microsoft Graph에서 해당 앱 등록을 실제 읽었다. 앱 이름은
`pydemia Projects`, `signInAudience=AzureADMyOrg`다. 현재 로그인 조직은
`fb44f64f-973f-480d-ab48-f30f3bababb6`, 앱에서 허용하는 도메인은 `pydemia.ai`다.
앱 등록을 읽은 사실과 관리자 변경 권한은 별개다. 앱 등록 유형은 변경하지 않았다.
사용자가 말한 계정 표시 이름과 앱 등록 이름을 같은 객체로 간주하지 않는다.

최초 조사 당시 Projects에는 계정별 `Project.owner_id` 격리만 있었고 프로젝트
멤버십·역할 지정 API·관리 UI는 없었다. 이후 프로젝트별 멤버십과 기본/사용자
지정 역할, 동작 권한 API·UI를 구현했다. 현재 접근 검사는 `owner_id` fallback
없이 멤버십과 현재 역할로 판단한다. 팀 공유 저장 보기는 계속 비활성 상태다.

## 이번 구현: 인증 멀티테넌시

- `deploy/entra-policy.json`이 신뢰 조직 ID·조직 이름·각 조직의 허용 도메인과
  기존 계정 연결 조직을 정의한다. 빈 목록·와일드카드·중복 조직·알 수 없는
  설정을 거부한다. 사용자 화면이나 HTTP 헤더로 이 서버 정책을 바꿀 수 없다.
- `uv run python scripts/render-entra-proxy.py`로 같은 정책의 공개 프록시
  `deploy/entra-proxy.json`을 생성한다. 자격은 기존 서버 환경변수에서 프록시가
  메모리로 치환한다. Git·API·로그에 값이 들어가지 않는다. 프록시 버전을
  변경할 때는 alpha 설정의 호환성을 실제 이미지로 다시 검사한다.
- 프록시가 서명·audience·만료·nonce·PKCE와 허용 issuer를 검사하고 `sub`,
  `tid`, `iss`만 앱에 주입한다. 프록시의 claim 주입은 기존 헤더를 제거하고,
  두 Caddy 설정도 인증 헤더를 제거한다. ID/access token은 앱에 전달하지 않는다.
- 앱은 `tid` 허용 목록, 정확한 Microsoft issuer와 해당 조직의 도메인을
  다시 검사한다. 프록시의 email-domain은 `*`지만 앱의 조직별 제한은 유지된다.
  이메일·로그인 이름은 계정 병합이나 프로젝트 권한의 식별자가 아니다.
- `entra_identities(tenant_id, subject)`가 안정된 계정 ID에 연결된다. 같은
  이메일·subject라도 조직이 다르면 다른 계정이다. 동시 첫 로그인은 PostgreSQL
  transaction advisory lock과 username 충돌 처리로 수렴한다.
- 기존 `Account.entra_subject`와 프로젝트 ID·소유권·revision·자료는 보존한다.
  기존 연결은 지정한 원래 조직에서만 한 번 연결하며 새 조직이 차지할 수 없다.
  DB migration `0010`은 새 identity 테이블만 추가하고 기존 계정을 다시 쓰지 않는다.
- 운영 허용 범위는 현재 조직 하나다. 두 조직 동작은 합성 토큰·실제 프록시 및
  실제 PostgreSQL에서 검사한다. 실제 외부 Microsoft 계정 로그인과 동일시하지 않는다.

다른 조직을 실제 활성화할 때는 허용할 조직 UUID·도메인을 정책에 추가하고
앱 등록을 `AzureADMultipleOrgs`로 변경한다. 개인 Microsoft 계정까지 포함하면
`AzureADandPersonalMicrosoftAccount`와 consumer tenant·허용 식별자 정책을 함께
검토한다. 다중 조직에서는 `organizations`(개인 포함 시 `common`) discovery를
쓰고, 프록시의 명시적 tenant 목록 및 앱의 issuer/tid 검사를 유지한다. 현재
조직의 서명 검증을 해제하고 모든 issuer를 허용하는 방식으로 전환하지 않는다.
후속 답변으로 현재 로그인 대상이 `pydemia.ai` 조직임을 확정했다. 이번 프로젝트
권한 구현을 위해 앱 등록을 다중 조직으로 변경할 필요는 없다. 위 외부 조직·개인
계정 절은 확장 시 참고 조건이며 현재 실행 범위에 넣지 않는다.

## 확정 요구와 프로젝트 권한 구현 계약

Entra tenant는 로그인 발급 조직이고, 프로젝트는 업무 자료와 권한의 경계다.
한 조직 계정이 여러 프로젝트에 서로 다른 역할로 참여할 수 있다. 프로젝트의
이름·생성자·조직 소속만으로 권한을 부여하지 않는다. 예를 들어 같은 사용자가
‘파이데미아 AI’ 프로젝트에서는 에디터, 다른 프로젝트에서는 뷰어일 수 있다.
이 예시는 요구 설명이며 운영 프로젝트·멤버를 새로 만들거나 변경한 기록이 아니다.

| 구분 | 기준 |
|---|---|
| 사용자 확정 | pydemia.ai 조직 로그인, 프로젝트별 멤버십·역할, 권한 있는 프로젝트만 목록에 표시, 권한별 가능한 동작 설정 |
| 구현·로컬 검증 완료 | 오너·에디터·뷰어 기본 역할과 프로젝트별 사용자 지정 역할, capabilities 응답, 일회성 초대 미리보기·명시 수락 |
| 대체한 이전 제안 | 새 Workspace catalog·선택기, Workspace 역할의 프로젝트 일괄 상속, 프로젝트별 ACL 후순위 |
| 현재 구현 | Entra identity 분리, 프로젝트별 멤버·권한 설정과 현재 권한에 따른 API 강제, 기존 owner·필드·개인 순서 이관 |

`Project.id`를 업무 테넌시의 기준으로 재사용하고 멤버십을 프로젝트에 직접 연결한다.
새 프로젝트를 만들면 생성자에게 그 프로젝트의 오너 역할을 부여한다. 기존 프로젝트는
현 `owner_id`를 오너 멤버십으로 이관한다. 다른 조직 사용자나 같은 조직 전체에
자동 공유하지 않으며, 새 Workspace·별도 DB/schema를 만들 필요가 없다.

| 저장 모델 | 제약과 책임 |
|---|---|
| project_memberships | project_id/account_id unique, membership_id UUID, role_id; 제거 후 재가입은 새 membership_id. role FK는 같은 프로젝트의 역할만 허용 |
| project_roles | project_id/role_id, name, preset(owner/editor/viewer/custom), permissions, revision. 오너의 필수 관리 권한은 보호 |
| project_invitations | project_id, 대상의 tenant+subject 또는 일회성 수락 코드 hash, role_id, expires_at, claimed_by, revoked_at; 만료·철회·다른 계정 재사용 거부 |
| project_access_events | actor_id, project_id, action, 대상, 이전/이후 역할, 시각; 인증 토큰 제외 |
| projects | 기존 ID와 owner_id·version 보존, 별도 access_revision. 이관 완료 후 owner_id를 일반 접근 허용의 우회로로 사용하지 않음 |
| project_preferences | account_id/project_id unique, sort_order. 기존 소유자의 프로젝트 순서를 보존하고 다른 멤버의 목록 순서와 분리 |
| project_task_field_definitions / task_field_definitions | 프로젝트 공유 필드와 본인 전용 필드 라이브러리를 분리. 기존 필드 ID·revision·값을 보존해 프로젝트별로 이관하며, 본인 라이브러리의 명시적 사용도 field.manage 필요 |
| task_views | 개인 소유 유지; global 결과는 현재 읽을 수 있는 프로젝트로 제한, project 보기는 본인+해당 프로젝트 접근권. 팀 보기는 별도 권한 계약 전 비활성 |
| skill_runs | requested_by, requested_membership_id 기록; 대기/재시도/실행 직전/결과 적용 시 현재 권한·동일 멤버십 재검사. 원본·적용 항목과 구조화된 참조의 현재 프로젝트 읽기 권한도 검사 |

프로젝트 멤버십·역할 변경은 같은 프로젝트의 access_revision을 증가시킨다.
역할 수정은 해당 역할을 사용하는 멤버 전체에 영향을 주므로 적용 전 대상 수와
권한 변경을 표시한다. 사용자별 임의 allow/deny를 겹치기보다 한 멤버에 역할
하나를 지정하고 필요한 동작 조합은 해당 프로젝트의 사용자 지정 역할로 만든다.

초대는 가능한 경우 이미 로그인한 계정의 불변 tenant+subject를 선택한다.
이메일은 Microsoft가 변경 가능하다고 명시하므로 단독으로 권한을 부여하거나
기존 계정을 연결하지 않는다. 미가입자에게는 만료 기한이 있는 일회성 수락 링크를 발급하고
본인이 로그인한 뒤 해당 계정으로 수락한다. 주소와 실제 수신 여부를 확인하지
않은 현재 시스템에서는 이메일 문자열만 맞으면 초대를 자동 수락하지 않는다.

| 기능 | 오너 | 에디터 | 뷰어 |
|---|:---:|:---:|:---:|
| 프로젝트·작업·관계·이력·스킬 결과 보기 | O | O | O |
| 프로젝트 이름 수정, 작업·필드·관계·기준선 편집 | O | O | — |
| 스킬 실행·취소·재시도·결과 적용 | O | O | — |
| 읽을 수 있는 자료 ZIP 내보내기 | O | O | O |
| ZIP/Git 가져오기 | O | O | — |
| 멤버 초대·제거·역할 변경·소유권 이전 | O | — | — |
| 프로젝트 보관·복원 | O | — | — |
| 개인 보기 저장·수정 | 본인 | 본인 | 본인 |

위 표는 구현된 기본 역할이다. 뷰어 내보내기 허용은 읽기 권한에 따른 기본값이며
프로젝트의 사용자 지정 역할에서 제한할 수 있다. 프로젝트 생성은 현재와 같이
로그인한 조직 계정에 허용하며, 생성한 프로젝트의 오너가 되는 것과 다른 프로젝트의
권한은 별개다. 보관된 프로젝트의 업무 데이터는 역할과 관계없이 쓰기를 거부하고,
오너의 복원·권한 관리만 별도 명령으로 허용한다.
마지막 오너의 제거·탈퇴·강등은 프로젝트 행 잠금과
같은 transaction 안에서 차단한다. 오너 이전은 대상의 명시적 수락을 거친다.

활성 서버 권한은 아래 18개다. 일반 동작은 프로젝트별 사용자 지정 역할의
체크 항목으로 제공하고 보관·복원과 권한 관리 4개는 오너 전용으로 고정한다.

| 설정 그룹 | 서버 permission 코드 | 적용 범위 |
|---|---|---|
| 보기 | project.read | 목록·직접 링크·작업/문서/관계/스킬 결과 읽기의 필수 조건 |
| 프로젝트 수정 | project.update | 이름·목표·일반 속성 변경 |
| 작업 | task.create, task.update, task.move | 생성, 제목/본문/유형/속성/상태 변경, 프로젝트 이동 |
| 문서·업무 항목 | item.write, relation.write, baseline.write, test.write | 임시 문서/요건/관계/기준선/테스트 변경 |
| 필드 | field.manage | 프로젝트 사용자 필드 추가·정의 변경 |
| 스킬 | run.execute, run.apply | 생성·재시도·취소, 결과의 업무 자료 반영 |
| 자료 전송 | project.export, project.import | ZIP 내보내기, ZIP/Git 가져오기 |
| 프로젝트 관리 | project.archive | 오너 전용 보관·복원. 사용자 지정 역할에는 부여 불가 |
| 권한 관리 | member.manage, role.manage, ownership.transfer | 멤버·역할 관리, 소유권 이전. 오너에게만 제공하며 사용자 지정 역할에는 부여 불가 |

`task.delete`와 `project.delete`는 향후 동작을 위한 예약 코드다. 실제 삭제
기능은 제공하지 않으며 활성 권한 목록·capabilities·설정 체크 항목에서 제외한다.

기본 역할을 복사해 이름과 허용 동작을 바꾼 `사용자 지정` 역할을 만든다.
기본 뷰어를 편집 가능하게 바꿔도 계속 ‘뷰어’라고 표시하는 혼동을 피한다.
쓰기·스킬·내보내기는 project.read가 필요하고 run.apply는 결과로 바뀌는
task/item/relation 등의 쓰기 권한도 함께 필요하다. 서버가 permission 코드의
허용 목록과 조합을 검증한다. 새 capability는 자동으로 기존 사용자 지정 역할에
부여하지 않는다. 멤버·역할 관리와 마지막 오너 보호는 임의 체크로 우회할 수 없다.
초대에는 에디터·뷰어·사용자 지정 역할을 지정하고 오너 승격은 별도 소유권
절차에서 처리한다. 에디터 기본 권한은 보기·프로젝트 수정·작업/업무 항목/필드
편집·이동·스킬 실행/적용·자료 전송이며, 뷰어는 보기·내보내기다. 오너만
프로젝트 보관·복원과 멤버·역할·소유권 관리를 갖는다.

## 화면과 API

기존 프로젝트 선택기·목록을 그대로 사용하고 접근 가능한 프로젝트만 표시한다.
프로젝트 메뉴에 `프로젝트 설정 → 멤버·권한`을 둔다. 멤버 탭에서 계정·역할과
초대/역할 변경/제거를, 역할 탭에서 기본 역할과 사용자 지정 역할의 허용 동작을
관리한다. 계정·테마 설정과 프로젝트 권한 설정을 구분하고 새 Workspace 선택기를
추가하지 않는다. 현재 프로젝트 역할과 서버 capabilities로 직접 편집·상태 변경·
드래그·필드 추가·스킬 실행·ZIP 메뉴를 제어한다. 뷰어에게는 읽기 전용 상태를 표시한다.

프로젝트 선택은 기존 URL project로 유지한다. 전체 작업은 읽을 수 있는 프로젝트의
합집합이고, 생성·일괄 변경·이동의 대상 선택에는 해당 쓰기 권한이 있는 프로젝트만
나온다. 메뉴 숨김만으로 제한하지 않고 API가 매번 권한을 확인한다. 직접 URL이나
item/run ID를 알아도 권한 없는 프로젝트 이름·개수·내용을 반환하지 않는다.
초안·보기 기억·최근 프로젝트는 account×project로 구분한다. 접근권 철회 시 해당
프로젝트 화면을 닫고 접근 가능한 프로젝트 목록으로 돌아간다. 복원 초안은 다른
프로젝트로 자동 제출하지 않으며 기존 로그인 복귀·revision 충돌 계약을 유지한다.
UI는 15초 주기와 화면 복귀 시 권한을 새로 읽고 접근권을 잃은 cache·선택·초안을
정리한다. 서버는 이 갱신을 기다리지 않고 요청마다 현재 권한을 즉시 강제한다.

초대·소유권 수락 화면은 bearer token과 현재 계정을 확인한 뒤 프로젝트명·역할·
최신 `access_revision`을 미리 보여 주고 사용자가 명시적으로 수락하도록 한다.
역할·멤버 구성이 바뀌면 새 미리보기를 받아야 한다. token은 URL fragment에 두고
로그인 이동 전 같은 탭의 `sessionStorage`에 최대 15분 동안 checkpoint한 뒤
인증 복귀 시 복원한다. 인증 redirect URL에는 token을 넣지 않으며, 복귀만으로
초대를 자동 수락하지 않는다. 수락·만료·복원 실패 시 임시 token 상태를 정리한다.

| API | 용도 |
|---|---|
| GET /api/projects | project.read 멤버십으로 필터한 목록과 프로젝트별 role/capabilities |
| POST /api/projects | 생성자 오너 멤버십·기본 역할을 같은 transaction에서 생성 |
| GET /api/projects/{id}/access | 본인의 현재 역할·유효 권한·access_revision |
| GET /api/projects/{id}/members | 관리 권한자의 멤버·미수락 초대 목록 |
| POST /api/projects/{id}/invitations | 해당 프로젝트 역할로 초대 |
| DELETE /api/projects/{id}/invitations/{invitation_id} | 초대 철회 |
| POST /api/project-invitations/{id}/preview | token·대상 계정을 확인하고 프로젝트·역할·최신 revision 미리보기 |
| POST /api/project-invitations/{id}/accept | 인증 계정의 일회성 수락 |
| PATCH/DELETE /api/projects/{id}/members/{account_id} | 프로젝트별 역할 변경/제거 |
| GET/POST/PATCH /api/projects/{id}/roles[/{role_id}] | 기본 역할 조회, 사용자 지정 역할 생성·변경 |
| POST /api/projects/{id}/ownership, /leave | 해당 프로젝트 오너 이전, 본인 탈퇴 |
| POST /api/projects/{id}/ownership/{invitation_id}/accept | 대상의 명시적 소유권 수락 |
| PATCH /api/projects/{id}/archive | 오너의 보관·복원 |

변경은 `expected_revision`과 재시도 operation ID를 받고 동일 transaction에서
현재 프로젝트 멤버십·역할·대상·revision을 검사한다. 오래된 변경은 409, 알 수
없거나 접근할 수 없는 프로젝트는 404, 읽기는 가능하지만 요청 동작의 권한이
없으면 403이다. 헤더나 body의 project ID는 대상일 뿐 권한의 근거가 아니다.
membership/role revision과 일반 프로젝트 version을 구분해 이름 편집과 멤버 편집의
충돌을 명확히 한다. 다른 프로젝트의 role_id를 지정하는 요청은 FK·API 양쪽에서 거부한다.

## 구현한 권한 경계

`records.project_for_user()`의 멤버십 읽기 검사와 각 변경 동작의 capability
검사를 분리했다. 아래 경로는 실제 요청 actor와 현재 권한을 사용하며,
PostgreSQL·HTTP·브라우저 검증 및 독립 리뷰의 회귀 검사로 확인했다.

| 경로 | 구현·로컬 검증한 계약 |
|---|---|
| api.py 직접 owner 조건 | 목록·검색·Git 중복·이름 변경 모두 프로젝트 멤버십/capability 사용. 목록 순서는 본인 preferences만 변경 |
| task_queries.py | 목록/집계/snapshot 같은 허용 프로젝트 범위; cursor에 account/멤버십/역할 정책 fingerprint 포함. 권한 변경 후 cursor 무효화 |
| records.trace/add_link | 실제 actor로 양쪽 프로젝트 읽기/관계 쓰기 검사. 숨은 프로젝트 정보 미노출; 프로젝트 ID 순서 잠금으로 교차 관계 검증 |
| records.equivalent_revision | revision의 동등성 판단에 해당 항목의 필요한 이동 이력만 조회하고 다른 이동 receipt를 응답하지 않음 |
| task_context.py | 읽을 수 없는 과거 프로젝트 ID·이름·SkillRun·기준선 미노출 |
| task_transfers.py | source/target 각각 task.move와 target task.create, 전체 관련 run·현재 원본 읽기 검사. 프로젝트 ID 순서 잠금 후 참조 소속 재검사, actor별 receipt와 commit/undo/retry의 현재 권한 검사 |
| portable export | 요청 actor 전달, 개인 보기는 본인 것만. 문서/프로젝트 ZIP의 현재 원본·전체 run provenance를 검사하고 잠금 후 소속 변경이나 참조 접근 불가 시 409로 중단 |
| portable import | 백업 ZIP은 새 프로젝트로 복원하고 인증 계정을 오너로 지정. 기존 문서 재연결은 project.import+쓰기 권한 검사. ZIP 속 owner/멤버십·역할을 권한으로 복원하지 않음 |
| jobs.py | enqueue/retry/apply 및 실제 LLM 전송 직전 현재 멤버십 확인; 철회된 대기 실행 중단 |
| 사용자 필드·개인 보기 | 필드는 프로젝트 공유, 개인 보기는 본인 소유 유지. 전역 보기도 현재 접근 가능 프로젝트로만 평가; 다른 멤버 ZIP·API에 개인 설정 미포함 |
| Note 참조 | Projects 역할은 Note 문서 권한을 부여하지 않음; Note가 독립 검사 |

프로젝트 간 작업 이동은 기존 기능을 유지하되 양쪽 프로젝트의 현재 권한과
독자 변화를 미리보기에서 확인한다. 원본·대상 프로젝트 멤버가 다르면 새로 읽게
되는 사람과 잃는 사람의 범위를 표시하고 이동을 확정한다. 관련 원본 자료를
읽을 수 없거나 preview 후 멤버·역할이 달라졌으면 commit을 거부한다. 이동 이력의
옛 프로젝트명·ID도 현재 권한으로 제한한다. 일괄 변경은 대상 전부의 권한을
확인하고 하나라도 거부되면 기존 원자성 계약에 따라 전체를 거부한다.

## 구현·로컬 검증 결과와 수용 조건

1. Entra 실패 재현·identity namespace·기존 계정 연결 회귀와 현재 조직 제한을 확인했다.
2. 프로젝트 역할·멤버십·access_revision을 구현하고 기존 owner·개인 순서·필드를 보존하는 실제 PostgreSQL 이관을 검사했다.
3. API·worker·ZIP·transfer의 동작별 현재 권한과 잠금 후 소속 재검사를 구현·검증했다.
4. 멤버·역할·수락 UI와 기존 편집·드래그·선택·초안·로그인 복귀의 권한 제어를 구현했다.
5. 격리 PostgreSQL의 여러 계정 fixture, 실제 HTTP와 Edge의 desktop/모바일 폭에서 권한 조합·철회·오류 복구를 검사했다. 운영 결과와 실제 Microsoft 계정 승인은 별도로 기록한다.

| 요구/AC | 이번 단계 수용 조건 | 상태 |
|---|---|---|
| APP-REQ-059 / AC-129 | 운영 실패 경계 확인, email 없는 정상 조직 토큰이 콜백 통과 | 실제 프록시 합성 검사 충족; 실제 계정 재로그인 미검증 |
| APP-REQ-060 / AC-130 | tenant+subject 분리, 기존 연결 보존, 동시 생성 수렴 | PostgreSQL 검사 충족 |
| APP-REQ-060 / AC-131 | policy 기반 허용 issuer/domain, 위조 헤더 제거, nonce/audience/외부 tenant 거부 | 실제 프록시/앱 검사 충족 |
| APP-REQ-060 / AC-132 | 운영 앱 등록 유형·설정 가능 경로 확인 | 실제 Graph 읽기 충족; 후속 결정은 현재 pydemia.ai 조직 유지, 외부 조직 활성화 해당 없음 |
| APP-REQ-061 / AC-133 | 프로젝트별 멤버·역할·초대·API·UI·자료 이관 | 구현·로컬 검증·운영 반영 완료; 실제 PostgreSQL 이관 보존과 API·Edge 멤버/역할/수락 검사 |
| APP-REQ-061 / AC-134 | trace/ZIP/transfer/worker의 현재 actor·원본·권한 경계 | 구현·로컬 검증 완료; 숨은 참조 비노출, 원본 이동과 실제 두 transaction의 경합 거부 |
| APP-REQ-061 / AC-135 | 권한 있는 프로젝트만 목록/검색/전체 작업/집계에 표시, 직접 ID 우회 거부 | 구현·로컬 검증 완료; A 에디터/B 뷰어/C 비멤버의 실제 PostgreSQL·HTTP·Edge 검사 |
| APP-REQ-061 / AC-136 | 한 사용자가 프로젝트마다 다른 역할, 역할별 동작 설정과 서버 강제 | 구현·로컬 검증 완료; 18개 활성 권한, 사용자 지정 역할·쓰기 거부와 자료 보존 검사 |
| APP-REQ-061 / AC-137 | 역할 변경/철회가 UI·진행 중 작업·cursor/preview/worker에 반영 | 구현·로컬 검증 완료; 서버 즉시 강제, UI 15초 갱신·cache/초안 정리·실행 직전/재가입/receipt 재검사 |

AC-133의 이전 Workspace 기준은 위 후속 사용자 결정으로 대체했다. AC-135~137은
이후 명시한 동작을 추적하며 기존 로그인 검사 통과를 새 권한 구현의 증거로 쓰지 않는다.

로컬 검사는 기존 데이터 보존, 역할별 변경 API 거부, 같은 조직의 다른
계정·다른 조직·로컬 사용자 이름 충돌, 초대 만료/철회/재사용, 마지막 오너,
제거 후 재가입, 오래된 cursor/transfer receipt, 외부 참조 ZIP·개인 보기 유출,
대기 실행의 권한 철회, 모바일/desktop 및 로그인 원래 화면 복귀를 포함한다.
권한 fixture는 A, B, C 세 프로젝트와 여러 격리 계정이다.
한 계정은 A 에디터/B 뷰어/C 비멤버로 두고 A만 편집 성공, B 편집 403, C는
목록·개수·검색·직접 URL에서 미노출/404를 확인했다. A의 run/필드/이동을 제한한
사용자 지정 역할, B 역할이 A에 영향을 주지 않는 경우, 권한 철회 직후 옛 초안·
cursor·transfer preview·queued run의 쓰기 차단도 독립된 기대값으로 검사했다.
실제 Hub·실제 LLM 호출·Microsoft 다른 계정 승인과 합성 Entra·mock Hub/LLM
검사는 구분한다. 이번 권한 검사로 실제 Microsoft 다른 계정 승인을 검증했다고
보지 않는다. 운영 반영 후 schema `0012`·현재 멤버십·서비스 정상 상태와 기존 자료
fingerprint 보존 및 공개 Edge 4개 checkpoint를 확인했다. 상세 검사·제약은
[구현 goal](../implementation/project-access-goal.md)과
[검증 기록](../implementation/verification.md), 운영 전환 결과는
[배포 기록](../implementation/deployment.md)을 따른다.

## 참고한 근거

- [Microsoft ID token claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference): email/preferred_username은 변경 가능하며 권한 식별자로 사용하지 않는다.
- [Microsoft claims validation](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation): issuer/tenant와 불변 식별자 검증.
- [Microsoft 다중 테넌트 전환](https://learn.microsoft.com/en-us/entra/identity-platform/howto-convert-app-to-be-multi-tenant): 앱 등록 계정 유형과 issuer 검증.
- [OAuth2 Proxy Entra 문서](https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.2/docs/docs/configuration/providers/ms_entra_id.md): 명시 허용 tenant와 common authority.
- 로컬 Note `src/core/workspaces.ts`, `docs/workspaces-design.md`: 중앙 catalog·불변 계정 ID·재가입 membership ID·철회 재검사. Projects는 기존 중앙 PostgreSQL을 유지한다.
- 읽기 전용 독립 agent 검토에서 확인한 기존 owner 전제·외부 이력·ZIP·worker·잠금 경합 지적을 수정하고 최신 source를 재검토했다. 구현·로컬 검사와 운영 전환·실제 Microsoft 계정 승인은 구분한다.
