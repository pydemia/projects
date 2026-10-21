# 근거·결정·검수 기록

v0.2 · 2026-10-21

## 읽은 자료와 반영 범위

| 자료 | 확인한 내용 | 반영 |
|---|---|---|
| [pydemia/projects](https://github.com/pydemia/projects) 및 로컬 Git | 초기 커밋·파일 없음, GitHub 조회 size 0 | 기존 구현·idea 파일이 있다고 가정하지 않고 새 기획 작성 |
| [원안: project ideation → 기획 → 구현 → 진척관리](https://app.notion.com/p/3ffefe226cee80afaab6f2b95c7e7e82) | 아이디어·기능/UI 기획·4종 설계·구현계획 메모 | 기본 업무 흐름과 필수 문서 |
| [프로젝트 문서](https://app.notion.com/p/3ffefe226cee8145b64ad659e30a43ab) | 기획·설계·개발·테스트·운영·보고의 산출물과 관리 도구 | 산출물 카탈로그·원본/링크·운영 확장 |
| [프로젝트 문서 가이드](https://app.notion.com/p/032efe226cee83088c44814bc72e455a) | 단계별 문서 안내·첨부 PDF 텍스트와 연결 예시 추가 확인 | 10·11 문서에 확인 범위·공개 양식 보완; ISO 표준 개발 맥락으로 한정 |
| [Linear Documents](https://linear.app/docs/documents) | 업무 객체에 문서 연결, 템플릿, 버전 기록 | 문서 본문과 관련 작업·근거를 함께 보는 구성 |
| [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects) | issue·PR을 표·보드·roadmap으로 조회 | 같은 작업의 여러 보기와 코드 근거 연결 |
| [Notion Relations & rollups](https://www.notion.com/help/relations-and-rollups) | 관계와 집계 | 구조화된 요구·작업·검증 관계와 지표 분모 |
| [FastAPI](https://fastapi.tiangolo.com/features/), [React](https://react.dev/learn) | 검증/OpenAPI, component 구성 | 기술 후보; 실제 설치·버전 호환 검사 전 |
| [GitHub webhook 검증](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) | signature 검증 | 후속 읽기 연동 계약 |
| [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) | 행 정책과 소유자 예외 | 프로젝트 권한의 추가 방어 후보 |

외부 제품은 공식 문서의 구조·기능을 참고했다. 해당 제품의 비공개 화면을 열거나 실제 사용성을 비교 측정하지 않았다. 참고 Notion 페이지의 특정 업무 데이터·하위 외부 파일을 예시 데이터로 복제하지 않았다.

Hub 페이지·설치 안내·bundle endpoint는 웹 검색 도구로 접근되지 않아 Python HTTPS 요청으로 직접 읽었다. 관찰한 source revision과 schema는 [08 문서](08-skill-runtime-and-portability.md)에 기록했다. `requirements-authoring`과 `requirements-verification`은 bundle의 SHA-256을 검증한 뒤 SKILL.md 전체를 읽었다. 해당 규칙으로 [사용자 요구사항](09-requirements.md)의 출처·상태·수용 조건과 현재 기획 단계를 구분했다. Hub 최신 catalog와 로컬 설치 목록이 다를 수 있으므로 런타임은 로컬 이름만으로 최신 제공 여부를 판단하지 않는다.

## 결정 상태

| ID | 내용 | 상태·근거 |
|---|---|---|
| D-01 | 개인 중심으로 시작해 소규모 팀 확장 | 사용자 선택 확정 |
| D-02 | AI는 문서·계획 보조부터 제공 | 사용자 선택 확정 |
| D-03 | 프로젝트 안에서 요구·설계·작업·테스트 revision 연결 | 이번 기획의 추천 |
| D-04 | 간편/표준 프로필, 기능별 반복·병행 진행 | 추천, 문서 부담 조정 |
| D-05 | MVP-A 단일 스킬 문서 작업 → MVP-B 아이디어·프로젝트 통합 → P1 팀·연동 | 최신 요구를 반영한 추천, 일정 미확정 |
| D-06 | React/TypeScript + FastAPI + PostgreSQL의 모듈형 단일 앱 | 기술 추천, 사용자·개발 여건 검토 전 |
| D-07 | A-02 아이디어/스킬 작업창 + 산출물 + 프로젝트 근거 영역 | UI 추천, 사용자 선택 전 |
| D-08 | Projects라는 작업명 | 임시, 브랜드·도메인 미결정 |
| D-09 | 아이디어 요건화·기존 기능 연결·구현 반영 | 사용자 필수 요구 |
| D-10 | Hub 스킬 원문 사용·개별 문서 독립 작성/수정 | 사용자 필수 요구 |
| D-11 | 앱 기능을 스킬 기반 LLM 실행으로 구성 | 사용자 필수 요구 |

## 구현 전 확정할 사항

- 앱 이름과 배포 방식: 개인 서버·클라우드 호스팅·로컬 전용 중 운영 대상
- 첫 실제 사용 프로젝트와 필수 산출물 목록: 간편 프로필로 검증 후 조정
- AI 공급자·모델·데이터 처리·비용 한도: 공급자 키와 실제 호출은 아직 없음
- 인증 공급자, 운영 예산, 저장·백업·삭제/복구 정책과 성능 목표
- 첫 릴리즈에서 간편/표준 모두 제공할지, 팀 초대와 GitHub 연동의 우선순위

이 항목들은 기획을 막는 질문이 아니라 개발 착수·외부 운영 전에 결정할 기술·제품 조건이다.

## 검수 기록

계획과 시안의 ID·용어·상태·범위를 대조한다. 실제 브라우저 결과와 정적 검사 결과는 실행 후 아래에 기록한다. 제품 API·DB·인증·AI·GitHub 연동·운영 테스트는 현재 미구현·미실행이다.

| 검수 | 결과 |
|---|---|
| 브라우저 | Playwright로 Chromium 계열 155.0.4283.62 실행 |
| 화면 크기 | 데스크톱 1440×1080, 모바일 390×844 |
| 아이디어 | 요건화 고정 결과, 충돌 보류, 관계 선택, 반복 적용 차단 확인 |
| 문서 | 검색·빈 결과, 문서 전환 시 초안 보존, 편집 취소, 스킬 제안 선택·저장 확인 |
| 대화상자 | Escape 닫기·이전 버튼으로 포커스 복귀 확인; 전체 접근성 인증은 미실시 |
| 테스트·영향 | 필수 결과 입력, 기존 run 보존, 영향 검토 후 남은 조치 표시 확인 |
| 화면 오류 | 페이지 JavaScript 오류 없음, 두 크기에서 문서 페이지 전체 가로 넘침 없음 |
| 시각 확인 | 아이디어·문서·스킬 대화상자·모바일 문서 이미지를 직접 확인, 모바일 넘침 수정 후 재촬영 |
| 독립 작업 | 시안의 실행 묶음 안내 표시만 확인; 실제 bundle 반출·외부 runner·재연결은 미구현 |
| 미검증 | 제품 API·DB·로그인·실제 LLM/스킬 실행·파일 반출·GitHub 연동·운영 동작 |

재실행 소스는 [verify.cjs](prototype/verify.cjs), 화면은 [screenshots](prototype/screenshots/)에 있다. 12개 시안 검증 묶음이 통과했으며 이는 제품 수용 조건 AC-01~24의 통과를 의미하지 않는다. 예시 데이터는 메모리에서만 변경되고 새로고침 시 초기화된다.

## 후속 요청: 산출물 예시·양식 조사

사용자 요청에 따라 원문 35종을 항목별로 조사했다. 예시 확인 8종·부분 확인 2종·접근 실패/경로만 5종·빈 페이지 1종·생략 2종·참조 없음 17종이다. 공개 출처 25개와 편집 가능한 PM²·arc42 원본을 확인했고, [상세 대조표](10-reference-audit.md)·[양식 라이브러리](11-template-reference-library.md)·[registry](references/artifact-templates.json)·자체 시작 양식 8개를 추가했다. Notion 첨부·원본 Sheet는 임시 폴더에서 읽고 업무 예시 내용은 저장소에 복제하지 않았다. PDF는 텍스트 확인이며 시각 렌더링 검수는 미실시다.
