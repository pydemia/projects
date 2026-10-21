# LLM 설정과 Codex 실행

`Settings.from_env()`는 `PROJECTS_CONFIG`가 가리키는 YAML을 읽습니다.
지정하지 않으면 작업 디렉터리의 `projects.local.yaml`을 사용합니다.
기본 파일이 없으면 현재 Codex 로그인을 사용합니다. 명시한 파일이
없거나 잘못되면 안전한 설정 오류를 반환합니다.
`PROJECTS_LLM_PROVIDER`, `PROJECTS_LLM_BASE_URL`, `PROJECTS_LLM_MODEL`,
`PROJECTS_LLM_API_KEY`는 YAML보다 우선합니다. 기존 DB·worker·cookie
환경 설정은 유지합니다. YAML은 최상위 `llm` mapping을 받습니다.
`projects.example.yaml`에 두 provider의 예시가 있습니다.

YAML은 256 KiB 이하이며 safe loader로 읽습니다. 중복 키, 알 수 없는
필드, 비문자열 설정, 인증 출처 중복, 잘못된 URL과 timeout을 거부합니다.
`auth_file` 상대 경로는 YAML 파일 디렉터리를 기준으로 해석합니다.
`auth_inline`은 auth.json과 같은 JSON object입니다. 실제 키와 토큰은
예시·Git·공개 runtime metadata에 넣지 않습니다. 설정 repr는 API 키,
auth 내용·경로, DB URL, 모델과 API URL을 표시하지 않습니다.

`codex_login`은 CLI가 설치되어 있어야 합니다. 기본 인증은
`CODEX_HOME/auth.json`, CODEX_HOME이 없으면 `~/.codex/auth.json`에서
내부적으로 읽습니다. `auth_file` 또는 `auth_inline`으로 대체할 수
있습니다. API 키를 직접 쓰는 경우 `openai_compatible`을 선택하고
`api_key`, `model`, `base_url`을 설정합니다.

`CodexLoginRunner(settings).run(messages, cancelled=callback)`은
`RunResult`를 반환합니다. runner는 앱 수명 동안 재사용하고 종료할 때
`close()`를 호출합니다. 인증 파일은 private 임시 CODEX_HOME에 복사하여
원본을 보존합니다. 동일 runner의 실행은 lock으로 직렬화합니다.
CLI가 refresh한 인증은 복사본에 유지되지만 앱을 재시작하면 사라집니다.
원본 refresh token이 이미 회전하여 사용할 수 없으면 재로그인 또는
새 인증 파일이 필요할 수 있습니다. 서로 다른 서버 프로세스의 refresh
경합은 조정하지 않으므로 같은 인증으로 여러 서버를 병렬 실행하지
않는 운영 구성이 필요합니다.

CLI에는 임시 작업 디렉터리, read-only sandbox, ephemeral 실행,
ignore-user-config, skip_host_skill_discovery, project_doc_max_bytes=0을
적용합니다. shell, apps, plugins, hooks, multi_agent, browser_use,
computer_use, view_image와 web search를 끕니다. 메시지는 stdin으로
전달하며 모델은 명시한 경우에만 선택합니다. 반환 JSON을 RunResult
스키마로 검증하며 command/tool/file-change 이벤트를 거부합니다.
Windows npm launcher는 cmd shell 대신 node와 codex.js로 실행합니다.

timeout·취소·출력 4 MiB 초과는 실행 실패로 처리하고 프로세스를
종료합니다. Windows는 자식 프로세스도 종료합니다. CLI stdout/stderr,
인증 원문과 모델 응답 원문을 오류 메시지에 포함하지 않습니다.
실행 실패에는 인증 실패·모델 사용 불가 등이 포함될 수 있으며 성공으로
대체하지 않습니다. read-only sandbox는 OS 수준의 읽기 접근 차단을
뜻하지 않습니다. 도구 비활성화와 별도 작업 디렉터리가 프로젝트 소스
접근을 막는 애플리케이션 구성입니다.
