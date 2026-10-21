# Projects 개발 기준

- 현재 사용자 결정과 [실행 goal](docs/implementation/goal.md)을 우선한다.
- DB는 PostgreSQL이다. SQLite 대체 구현을 추가하지 않는다.
- 문서 관리는 [Note 연계 명세](docs/implementation/note-document-handoff.md)의
  임시 Markdown 기능으로 제한한다. Projects는 업무 관계와 SkillRun을 소유한다.
- Hub 스킬 원문·revision·hash를 유지한다. 참조 양식을 스킬 규칙으로 대체하지 않는다.
- 인증 파일·inline auth·API 키는 서버 설정이다. 로그·API·ZIP·Git에 넣지 않는다.
- 테스트는 `docker compose up -d db`, `uv run projects migrate`,
  `uv run pytest`, `uv run ruff check src tests migrations`,
  `uv run ruff format --check src tests migrations`, `uv run mypy src/projects`를 사용한다.
- 웹 검사는 `npm --prefix web run check`, `npm --prefix web run build`다.
- 통합 테스트는 무작위 이름의 전용 PostgreSQL schema만 생성·정리한다.
- 앱 구현·mock 검사·실제 Hub·실제 LLM·브라우저 검증을 구분해 기록한다.
