# Projects

skills.pydemia.ai의 원문 스킬로 아이디어를 요건화하고 기획·설계·구현 계획·검증을 연결하는 개인용 웹 앱입니다.

현재 상태는 **로컬 MVP·GitHub CI 통과, [projects.pydemia.ai](https://projects.pydemia.ai) 배포와 Microsoft Entra 실제 로그인 확인 / 2026-10-21**입니다. React·FastAPI·PostgreSQL로 동작하며, 기본 LLM은 현재 Codex 로그인입니다. auth.json 경로 또는 inline 인증, OpenAI 호환 API를 YAML로 설정할 수 있습니다.

- [설치·실행·검사·복구 안내](docs/implementation/README.md)
- [LLM 설정](docs/implementation/llm-configuration.md) · [YAML 예시](projects.example.yaml)
- [실행 goal과 범위](docs/implementation/goal.md)
- [검증 결과와 요구별 근거](docs/implementation/verification.md)
- [Note 연계 명세](docs/implementation/note-document-handoff.md): 현재 문서는 간단한 임시 Markdown 저장소입니다.
- [원격 배포·Entra 운영 안내](docs/implementation/deployment.md)

로컬에서 `docker compose up -d db`, `uv sync --locked`, `uv run projects migrate`, `uv run projects serve`를 실행한 뒤, 별도 터미널에서 `npm --prefix web ci`, `npm --prefix web run dev`를 실행합니다. 웹 주소는 `http://127.0.0.1:5173`이며 첫 화면에서 개인 계정을 만듭니다.

아이디어·기존 기능·요구사항, 필수 7종/참고 35종의 임시 문서, 구현 작업·테스트 이력, 관계·변경 영향·기준선, 스킬 실행·선택 적용과 반출을 제공합니다. 실제 Hub와 Codex 실행을 확인했으며 OpenAI 원격 API 호출은 키 미설정으로 미검증입니다. 팀 협업과 Note 실연동은 후속 범위입니다.

아래 기획 자료는 초기 제안과 조사 기록입니다. 현재 구현 범위와 최신 사용자 결정은 위 실행 문서를 따릅니다.

- [기획서와 읽는 순서](docs/planning/README.md)
- [기능 기획](docs/planning/01-product-plan.md)
- [UI·UX 기획](docs/planning/02-ui-ux.md)
- [시스템·인프라·애플리케이션·인터페이스 설계 방향](docs/planning/03-architecture.md)
- [구현 계획과 테스트 기준](docs/planning/04-delivery-and-tests.md)
- [산출물 종류와 작성 항목](docs/planning/05-artifact-catalog.md)
- [근거·결정·미정 사항](docs/planning/06-sources-and-decisions.md)
- [아이디어 요건화·기존 기능 연결](docs/planning/07-idea-to-implementation.md)
- [스킬 실행·문서 독립성](docs/planning/08-skill-runtime-and-portability.md)
- [사용자 요구사항 기준](docs/planning/09-requirements.md)
- [산출물 35종 예시 확인·공개 보완 양식](docs/planning/10-reference-audit.md)
- [양식 라이브러리·다운로드](docs/planning/11-template-reference-library.md)
- [상호작용 화면 시안](docs/planning/prototype/index.html): 파일을 브라우저로 열면 됩니다.

제품 방향은 개인 사용으로 시작해 소규모 팀으로 확장하며, AI는 문서 초안·점검·작업 분해를 돕는 범위부터 제공합니다.
