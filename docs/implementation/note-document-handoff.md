# Note 연계와 임시 문서 기능

2026-10-21 · 사용자 결정 · APP-REQ-010

산출물 문서 관리의 본체는 개발 중인 Note 앱과 연계한다. Projects에서
문서 관리 제품을 중복 구현하지 않는다. 제공된 `github.com/note`만으로는
정확한 owner/repository와 구현 API를 확인하지 못했으므로 아래는 필요한
기능과 제안 인터페이스이며 Note의 현행 기능이라고 주장하지 않는다.

## 지금 구현할 범위

- 임시 문서 ID, 제목, 산출물 유형, Markdown 본문을 PostgreSQL에 저장한다.
- 수정 시 기대 revision을 대조해 충돌을 알리고 사용자 초안을 보존한다.
- Hub 스킬을 사용한 작성·국소 수정·검수와 결과 선택 적용을 연결한다.
- 스킬 lock, 양식·예시 참조, 입력 기준과 실행 이력을 Projects에 남긴다.
- 문서를 일반 Markdown과 실행 manifest로 반출할 수 있게 한다.
- 요구·아이디어·작업·테스트에서 같은 문서 ID를 참조한다.
- 화면에 임시 저장소임을 표시한다. 문서 승인·공동 편집·고급 이력 UI·
  Office 편집기·Notion 동기화를 별도 제품으로 구현하지 않는다.

DB의 revision snapshot은 동시 수정 방지와 SkillRun 입력 근거 보존을 위한
최소 기록이다. Note 수준의 문서 관리 기능을 완성했다는 뜻이 아니다.

## Projects가 계속 소유할 정보

프로젝트·요구·기능·작업·테스트·기준선·문서 연결 관계와 SkillRun을 관리한다.
문서 참조에는 provider, 외부 문서 ID, URL, 선택 revision, 본문 hash를 둔다.
실행 시 확인한 문서 snapshot은 나중에 Note 본문이 바뀌어도 유지한다.

## Note에 필요한 기능

| 요구 ID | 필요한 동작 | 확인 기준 |
|---|---|---|
| NOTE-01 | 문서 생성·단건 조회·Markdown 읽기/수정 | 제목·본문·안정된 ID와 revision 반환 |
| NOTE-02 | 문서 유형·태그·프로젝트 참조 metadata | 필수 7종과 선택 35종을 문서에 연결 |
| NOTE-03 | 낙관적 동시 수정 제어 | expected revision 또는 ETag 불일치는 409/412 |
| NOTE-04 | 명시 revision 조회·변경 이력 | 실행 입력을 같은 revision/hash로 대조 |
| NOTE-05 | 문서 권한과 자격증명 위임 | 허용 문서만 읽기/쓰기·검색·반출 |
| NOTE-06 | 스킬 작성·수정 결과의 적용 | 초안 저장과 사용자 확정 상태 구분 |
| NOTE-07 | Markdown·첨부의 반입/반출 | 본문·파일·출처·hash 보존 |
| NOTE-08 | 문서 URL과 변경 알림 또는 최신 revision 조회 | Projects의 재검토 대상을 갱신 |

## 제안 연결 인터페이스

```text
DocumentRef(provider, document_id, url, revision, sha256)
read_document(ref) -> DocumentSnapshot(title, markdown, metadata, ref)
create_document(project_ref, title, markdown, metadata) -> DocumentRef
update_document(ref, expected_revision, markdown, metadata) -> DocumentRef
export_document(ref) -> Markdown + manifest
```

상세 API 경로·인증·오류 형식·webhook schema는 Note의 실제 명세를 읽은 뒤
확정한다. 임의의 Note URL로 자동 요청하거나 문서를 이중 쓰기하지 않는다.

## 전환 순서와 검증

1. Note의 실제 API·권한·revision·반출 구조와 위 요구를 대조한다.
2. 임시 문서 ID → Note 문서 ID 매핑과 snapshot/hash를 작성한다.
3. 사용자가 선택한 문서를 옮기고 제목·본문·출처·hash를 비교한다.
4. Projects 관계와 과거 SkillRun은 유지하고 현재 문서 참조를 전환한다.
5. 충돌·미이관·권한 실패를 기록하고 검증 전 임시 원본을 삭제하지 않는다.

Note 미가용 시 임시 문서 기능으로 작업을 계속한다. Note 연계 성공은
실제 API에 대한 별도 통합 검사 전까지 미검증으로 둔다.
