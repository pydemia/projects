# 공개 양식·작성 예시 라이브러리

2026-10-21 · 조회·다운로드 상태를 구분한 추천

| 순위 | 자료 | 적용 | 접근·재사용 | 선정 이유 |
|---:|---|---|---|---|
| 1 | [PM² v3.1](https://pm2.europa.eu/pm2-artefacts_en) | 프로젝트 관리 문서군의 편집 가능한 원본 | 공개 다운로드 확인. 이번에는 링크·구조 참조만 사용; 앱 재배포 전 파일·사이트 고지 확인 | DOCX / XLSX · ZIP 다운로드·33개 엔트리 확인, 주요 DOCX 8종·XLSX 4종 구조 확인 |
| 2 | [arc42](https://arc42.org/download/) | System·Application·Infra를 함께 설계할 양식 | CC BY-SA 4.0; 템플릿 변형 배포 시 출처·라이선스·변경 표시 | AsciiDoc ZIP; 사이트에 Markdown·Word 옵션 안내 · plain AsciiDoc ZIP 다운로드, 17개 파일·모듈/배포 섹션 확인 |
| 3 | [Atlassian PRD](https://www.atlassian.com/software/confluence/templates/product-requirements) | 기능·요구·UI를 연결하는 기획 양식 | 공개 안내 참조; 별도 재배포 권한은 미확인 | HTML / Confluence · 공개 목차·작성법·예시 확인, Confluence 내 복제는 로그인 필요 |
| 4 | [OpenAPI 예시](https://learn.openapis.org/examples/v3.0/petstore.html) | API·Interface를 기계 판독 계약으로 작성 | 예시 버전 3.0; 앱 계약 버전은 별도 선정, 원본 고지 유지 | JSON / YAML · paths·parameter·response·schema 실제 예시 확인 |
| 5 | [Atlassian Test Plan](https://www.atlassian.com/software/confluence/resources/guides/how-to/test-plan) | 테스트 계획과 실제 작성 예시 | 범용 구성만 참고; 예시 인원·일정·통과율은 채택하지 않음 | HTML / Confluence · 범위·전략·환경·보고·종료 조건 및 은행 앱 작성 예시 확인 |

## 편집 가능한 원본

- [PM² v3.1 DOCX·XLSX ZIP](https://pm2.europa.eu/document/download/f6ba050c-f9f4-4f74-99a3-eb6acc9b8ea9_en?filename=PM2-Project-Artefacts.v3.1.zip): 다운로드 성공·Office 파일 구조 확인. 사업성·작업계획·전환·회의·진척·변경과 리스크/품질 checklist 등이 있다. ZIP 33개 엔트리 모두의 시각 품질을 검수한 것은 아니다.
- [arc42 plain AsciiDoc ZIP](https://arc42.org/dl/arc42-template-EN-plain-asciidoc.zip): 다운로드 성공·17개 파일 확인. [다른 형식](https://arc42.org/download/)과 [라이선스](https://arc42.org/license/)는 원 제공처에서 확인한다.
- [설치 가이드용 빈 README](https://github.com/othneildrew/Best-README-Template/blob/main/BLANK_README.md): 사전조건·설치·사용법을 구성할 편집 가능한 Markdown 양식.
- [TestRail CSV 양식 안내](https://support.testrail.com/hc/en-us/articles/7101779988372-Import-test-cases-from-CSV-or-Excel): 공개 필드·1행/다중행 구조는 확인했다. 연결된 예시 CSV 파일은 웹에서 로그인 화면이므로 파일 내용까지 확인했다고 처리하지 않는다. 아래 자체 CSV로 시작할 수 있다.

## 종류별 보완 자료

아래는 원문 35종의 부족한 부분을 채우는 자료다. “가이드”, “빈 양식”, “작성 예시”, “실행 설정”을 구분한다. 특히 성능 보고·SLA는 예시의 숫자나 서비스 약정을 앱의 목표로 가져오지 않는다.

| ID·자료 | 형태·적용 | 확인 상태·제한 |
|---|---|---|
| PM2 · [European Commission PM² Artefacts v3.1](https://pm2.europa.eu/pm2-artefacts_en) | editable_template_package · DOCX / XLSX<br>사업성·WBS·품질·배포전환·회의·진척·리스크·변경 | ZIP 다운로드·33개 엔트리 확인, 주요 DOCX 8종·XLSX 4종 구조 확인<br>공개 다운로드 확인. 이번에는 링크·구조 참조만 사용; 앱 재배포 전 파일·사이트 고지 확인 |
| ARC42 · [arc42 architecture template](https://arc42.org/download/) | editable_template_package · AsciiDoc ZIP; 사이트에 Markdown·Word 옵션 안내<br>System·Application·Infra 설계 | plain AsciiDoc ZIP 다운로드, 17개 파일·모듈/배포 섹션 확인<br>CC BY-SA 4.0; 템플릿 변형 배포 시 출처·라이선스·변경 표시 |
| ARC42-EX · [HtmlSanityCheck architecture example](https://examples.arc42.org/systems/htmlsc/) | worked_example · HTML<br>설계 문서의 실제 작성 밀도·구성 | 전체 목차와 모듈·배포 본문 확인; 원 시스템 현행성 검증은 아님<br>예시 CC BY-SA 4.0; 링크 참조 |
| PRD · [Atlassian Product Requirements template](https://www.atlassian.com/software/confluence/templates/product-requirements) | template_preview · HTML / Confluence<br>기능 기획·기능 정의·UI 연계 | 공개 목차·작성법·예시 확인, Confluence 내 복제는 로그인 필요<br>공개 안내 참조; 별도 재배포 권한은 미확인 |
| FEAS · [Atlassian feasibility study format](https://www.atlassian.com/work-management/project-management/project-planning/feasibility-study) | guide_with_report_outline · HTML<br>타당성 분석 | 본문의 보고서 구성 표 확인<br>작성 항목 참고; 원문 복제 안 함 |
| MARKET · [SBA business planning and market research](https://www.sba.gov/counseling/plan-your-business/) | guide_with_examples · HTML<br>시장조사·사업계획 | 시장조사 질문과 사업계획 작성 안내 확인<br>질문·구조 참고; 통계·시장 사실은 별도 조사 |
| BMC · [Strategyzer Business Model Canvas](https://www.strategyzer.com/library/the-business-model-canvas) | official_template_landing · PDF 안내<br>비즈니스 모델 캔버스 | 공식 9개 영역·무료 다운로드 안내 확인; PDF 파일 자체 미다운로드<br>공식 도구 링크 사용, 앱 내 재배포 조건 미확인; 유료 playbook은 제외 |
| SWOT · [Atlassian SWOT template](https://www.atlassian.com/software/confluence/templates/swot-analysis) | template_preview · HTML / Confluence<br>SWOT | 첫 조회에서 본문·4분면 작성법 확인, 후속 재조회 timeout<br>공개 작성법 참고; 제품 내 복제는 별도 확인 |
| DIALOG · [Google Conversation Design sample dialogs](https://developers.google.com/assistant/conversation-design/write-sample-dialogs) | worked_example_and_guide · HTML<br>Chat 시나리오 | 사용자/시스템 발화·주석 표와 흐름 예시 확인<br>대화 문서 형식만 참조; 과거 플랫폼의 실행 방식은 채택하지 않음 |
| C4 · [C4 deployment diagram](https://c4model.com/diagrams/deployment) | diagram_guide_with_examples · HTML / 도식<br>시스템·네트워크·인프라 | 환경·배포 노드·구성 요소 설명과 예시 구간 확인<br>페이지·예시 CC BY 4.0, 출처 표시 |
| OAS · [OpenAPI Petstore example](https://learn.openapis.org/examples/v3.0/petstore.html) | machine_readable_example · JSON / YAML<br>API·Interface 계약 | paths·parameter·response·schema 실제 예시 확인<br>예시 버전 3.0; 앱 계약 버전은 별도 선정, 원본 고지 유지 |
| ERD · [Mermaid ER diagram examples](https://mermaid.js.org/syntax/entityRelationshipDiagram.html) | diagram_source_examples · Mermaid<br>DB 설계 | 엔티티·관계·속성·cardinality 문법과 예시 확인<br>도식 문법 참고, 샘플 업무내용은 복제하지 않음 |
| SEQ · [Mermaid sequence diagram examples](https://mermaid.js.org/syntax/sequenceDiagram.html) | diagram_source_examples · Mermaid<br>시퀀스·비동기 흐름 | 참여자·메시지·분기 표현 확인<br>도식 문법 참고 |
| STYLE · [PEP 8](https://peps.python.org/pep-0008/) | coding_conventions · HTML<br>코딩 표준 | 코드 구성·명명·주석·프로젝트 규칙 우선 원칙 확인<br>Python 조건에서만 참고; 기존 프로젝트 규칙 우선 |
| INSTALL · [Best-README-Template blank form](https://github.com/othneildrew/Best-README-Template/blob/main/BLANK_README.md) | editable_template · Markdown<br>설치·실행 가이드 | 원본 양식 링크·Prerequisites/Installation/Usage 구성, 저장소 Unlicense 표시 확인<br>Unlicense; 자산·이미지 권리는 별도 |
| BRANCH · [GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow) | workflow_guide · HTML<br>Git Branch | 브랜치·변경·PR·검토·merge 흐름 확인<br>예시 참고; 내부 프로젝트의 branch 명명·승인을 전역 규칙으로 강제하지 않음 |
| TESTPLAN · [Atlassian Test Plan template and filled example](https://www.atlassian.com/software/confluence/resources/guides/how-to/test-plan) | template_and_worked_example · HTML / Confluence<br>테스트 계획 | 범위·전략·환경·보고·종료 조건 및 은행 앱 작성 예시 확인<br>범용 구성만 참고; 예시 인원·일정·통과율은 채택하지 않음 |
| TESTCASE · [TestRail test case CSV formats](https://support.testrail.com/hc/en-us/articles/7101779988372-Import-test-cases-from-CSV-or-Excel) | template_schema_and_links · CSV<br>테스트 케이스 | 사전조건·절차·기대값, 1행/다중행 구조 확인; 연결 CSV 파일은 웹에서 로그인 화면<br>공개 필드 구조 참고; 제품 계정·유료 서비스 없이 자체 CSV 사용 |
| LOAD · [Grafana k6 end-of-test result example](https://grafana.com/docs/k6/latest/results-output/end-of-test/) | execution_report_example · console / JSON<br>부하 테스트 보고서 | 집계 결과·summary 출력 예시 확인<br>실행 결과 구조 참고; 부하·목표치·실제 측정값은 프로젝트별 입력 |
| CHATQA · [Dialogflow CX test case expectations](https://docs.cloud.google.com/dialogflow/cx/docs/concept/test-case) | test_design_and_result_guide · HTML / structured case<br>QA Chat 시나리오 | 대화 저장·기대 intent/action/flow/page·재실행 검증 확인<br>대화 검증 구조만 참고; Dialogflow 의존성 추가 안 함 |
| CI · [GitHub Actions example workflow](https://docs.github.com/en/enterprise-cloud%40latest/actions/tutorials/create-an-example-workflow) | executable_configuration_example · YAML<br>CI/CD | trigger·job·runner·step 실제 YAML 확인<br>예시 구조 참고; action·런타임 버전은 구현 시 고정·검증 |
| RELEASE · [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) | document_template_and_example · Markdown<br>릴리즈 노트 | 릴리즈 버전·날짜·변경 분류와 실제 기록 확인<br>형식 참고, 원문·샘플 릴리즈는 복사하지 않음 |
| DR · [Google Cloud disaster recovery planning guide](https://docs.cloud.google.com/architecture/dr-scenarios-planning-guide) | planning_guide_with_scenarios · HTML<br>백업·복구 | RTO/RPO·복구 계획·시나리오 구성 확인<br>계획 항목 참고; 클라우드 제품 선택·복구 목표는 별도 결정 |
| SLO · [Google SRE Example SLO Document](https://sre.google/workbook/slo-document/) | worked_service_objective_document · HTML<br>SLA의 측정 부속서 | 서비스 개요·SLI/SLO·측정 창과 수식 표 확인<br>측정 구조 참고; 예시 수치를 앱 목표로 사용하지 않음 |
| SLA · [Amazon Compute SLA example](https://aws.amazon.com/compute/sla/) | published_agreement_example · HTML<br>서비스 범위·책임·제외·보상 검토 | 서비스 약정 페이지 확인; 범용 빈 계약서가 아님<br>항목 대조용 링크; 회사별 약정·보상 조건을 앱에 복제하지 않음 |

## 바로 입력할 수 있는 자체 시작 양식

원본 자료를 조사해 이 앱의 연결 모델에 맞게 새로 만든 일반 필드 양식이다. 외부 제공자가 배포한 공식 번역본이나 공식 템플릿으로 표시하지 않는다. 비공개 예시 내용은 포함하지 않았다.

| 파일 | 용도 |
|---|---|
| [requirements.csv](forms/requirements.csv) | 아이디어·기능·요구·수용 조건·출처 연결 |
| [wbs.csv](forms/wbs.csv) | 계층·의존성·계획/실제·완료 근거 |
| [screen-list.csv](forms/screen-list.csv) | 화면 ID·요구·구성 단계와 링크 |
| [test-cases.csv](forms/test-cases.csv) | 케이스 정의; 실행 이력은 별도 run |
| [chat-qa.csv](forms/chat-qa.csv) | 턴별 맥락·입력·기대 도구/출력·예외 |
| [change-request.md](forms/change-request.md) | 아이디어를 기존 기능에 반영하는 변경 묶음 |
| [load-test-report.md](forms/load-test-report.md) | 부하 계획·측정 근거·실행 결과·한계 |
| [sla-outline.md](forms/sla-outline.md) | 서비스 약정 항목과 측정 부속서의 분리 |

나머지 산출물의 제안 작성 항목과 적용 스킬은 [JSON registry](references/artifact-templates.json)의 `starter_fields`와 `suggested_primary_skill`에 있다. 스킬 이름 매핑은 실행을 보장하지 않으며 실제 실행 때 bundle·도구 가용성을 확인한다.

## 앱이 참조를 사용하는 방식

SkillRun은 스킬 bundle을 작성 규칙으로 읽고, 양식은 목차·필드, 실제 예시는 밀도·표현 참고, 프로젝트 자료는 사실 근거로 사용한다. 기존 문서 수정은 원본 구조와 변경 계약을 우선한다. 외부 양식 선택 때문에 문서 전체를 재작성하거나 프로젝트 승인 단계를 추가하지 않는다.

참조에는 출처 URL·확인일·접근 상태·확인 범위·포맷·버전·reuse 정책을 남긴다. 앱 밖 문서 작업에도 동일한 참조 manifest를 전달하고, 접근하지 못한 원본 대신 새 양식을 썼다는 사실을 문서 이력에 남긴다.
