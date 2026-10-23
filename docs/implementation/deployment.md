# Projects 원격 배포와 Microsoft Entra 로그인

2026-10-21 현재 기존 Ubuntu 서버 `codex-devbox`에서
`projects.pydemia.ai`를 제공합니다. DNS, Let's Encrypt HTTPS와
`pydemia@pydemia.ai`의 실제 Microsoft Entra 로그인을 확인했습니다.

## 구성과 데이터 경계

기존 시스템 Caddy가 `projects.pydemia.ai` 요청을 서버의
`127.0.0.1:14323`으로 전달합니다. 이 포트는 OAuth2 Proxy의 loopback
바인딩이며, 앱과 PostgreSQL은 호스트 포트를 열지 않습니다. 프록시가
Microsoft Entra ID의 OIDC 로그인을 마치면 검증한 이메일과 사용자
subject를 앱에 전달합니다. 허용 범위는 단일 `pydemia` 테넌트의
`@pydemia.ai` 계정입니다. 기존 `pydemia@pydemia.ai`는 `pydemia`
계정과 자료를 유지하고, 다른 계정은 첫 로그인 때 개인 계정을 만듭니다.
프로젝트 소유권과 자료는 사용자마다 분리됩니다. 운영 모드의 자체 가입·
암호 로그인은 비활성화됩니다.

앱의 `PROJECTS_PROXY_AUTH_DOMAIN=pydemia.ai`와 프록시의
`--email-domain=pydemia.ai`를 함께 설정합니다. 하위 도메인·유사 도메인은
허용하지 않습니다. 앱은 `X-Forwarded-User`의 OIDC `sub`를
`accounts.entra_subject`에 유일하게 연결하므로 이메일 변경·재사용으로
다른 계정의 자료가 합쳐지지 않습니다. 기존 계정 연결은
`PROJECTS_PROXY_AUTH_EMAIL`·`PROJECTS_PROXY_AUTH_USERNAME` 설정만
사용하며, 운영 전환 시 실제 인증된 기존 사용자의 subject를 먼저 고정합니다.
브라우저에서 Microsoft 계정을 바꾸면 `/api/session`이 새 사용자의 세션을
발급하고, 기존 쿠키만으로 다른 사용자의 API에 접근할 수 없습니다.

DB는 PostgreSQL 17.11의 전용 Docker volume입니다. 앱의 임시 Markdown,
스킬 cache, 실행 자료는 `state/`에 있습니다. Codex 로그인 `auth.json`,
DB 접속 값, Entra client secret과 cookie secret은 `.secrets/`에 mode 0600
파일로 둡니다. 두 디렉터리는 Git과 배포 패키지에서 제외합니다. 원격
호스트의 rootless Docker는 컨테이너 root를 서버의 비특권 `pydemia`
계정에 매핑합니다. 앱이 mode 0600 인증 파일을 읽도록 컨테이너 내부만
UID 0으로 실행하고 권한 상승·Linux capability를 제거했습니다.

## 외부 설정과 확인 결과

1. **완료:** Squarespace DNS에 `projects` A 레코드를 서버 IPv4
   `139.59.246.134`, TTL 30분으로 저장했습니다. 권한 DNS와 일반 조회에서
   같은 주소를 확인했습니다.
2. **완료:** Entra의 `pydemia` 테넌트에 단일 테넌트 Web 앱
   `pydemia Projects`(client ID `6e82235b-8b6b-441c-a944-8a443d78b390`)
   를 등록했습니다. redirect URI는
   `https://projects.pydemia.ai/oauth2/callback`입니다. 전용 client
   secret은 2027-04-19에 만료되며 서버 `.secrets/oauth.env`에 mode 0600으로
   저장했습니다. `scripts/activate-entra.py`는 비밀 값을 표준 입력으로
   전송하고 서버의 `deploy/activate-entra.py`가 원자적으로 설정을
   교체합니다. 비밀 값은 채팅·로그·Git에 기록하지 않습니다.
3. **완료:** Let's Encrypt 인증서와 공개 HTTPS, 미인증 `/api/session`의
   401, OAuth 시작 시 지정 tenant/client/callback/PKCE로 이동, 실제
   `pydemia@pydemia.ai` Entra 동의·로그인 및 기존 `pydemia` 개인 작업공간
   표시를 확인했습니다. 조직 전체 동의는 적용하지 않았습니다.
4. **완료:** 브라우저 로그아웃 후 로그인 화면 복귀와 동일 계정 재로그인을
   확인했습니다. 재로그인 때는 Microsoft 동의가 다시 요구되지 않았습니다.
5. **추가 운영 검사:** 허용 목록 밖 계정 차단과 운영 LLM 문서 생성은 이번
   실제 브라우저 검사에서 수행하지 않았습니다.

기존 `deploy/authenticated-emails.txt`의 단일 이메일 제한은 도메인 정책으로
대체했습니다. 운영 배포의 엔트라 issuer는 실제 단일 테넌트 ID로 지정됐고,
`--entra-id-allowed-tenant`도 동일 테넌트로 제한합니다. 앱
등록의 redirect URI와 프록시의 URI가 정확히 일치해야 합니다.
OAuth2 Proxy의 로그인 버튼은 `/oauth2/start` 폼을 제출한 뒤
`login.microsoftonline.com`으로 이동합니다. Caddy의 CSP `form-action`은
두 주소를 허용해야 합니다. 처음에는 `'self'`만 허용해 버튼을 눌러도
브라우저가 Microsoft 리디렉션을 차단했습니다. Microsoft 로그인 주소만
추가한 뒤 실제 버튼 클릭으로 계정 선택과 작업공간 진입을 확인했습니다.
다른 Microsoft 계정으로 시도한 뒤 접근 거부(403)가 발생해도 다음 로그인에서
계정을 바꿀 수 있도록 OAuth2 Proxy에 `--prompt=select_account`를 설정합니다.
이 값은 Microsoft 인증 요청마다 계정 선택을 요구합니다. 단일 테넌트와
`@pydemia.ai` 허용 정책은 그대로 적용되며, 다른 계정을 고르려면
`https://projects.pydemia.ai/oauth2/start?rd=%2F`에서 다시 시작합니다.

정책 근거는 [OAuth2 Proxy의 Entra 설정](https://oauth2-proxy.github.io/oauth2-proxy/configuration/providers/ms_entra_id/),
[프록시 도메인·헤더 설정](https://oauth2-proxy.github.io/oauth2-proxy/configuration/overview/),
[Microsoft 인증 요청의 prompt 매개변수](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow),
[Microsoft ID token claim](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference)입니다.
테넌트·토큰 검증은 프록시가 담당하며 앱은 외부에 직접 포트를 열지 않습니다.

## 재배포와 운영 확인

`scripts/package-deployment.py`는 allowlist의 소스만 묶고 해시를
남깁니다. `scripts/configure-deployment.py --source-hash <sha256>`는
비공개 설정을 SSH 표준 입력으로 전송합니다. 원격에서 archive 해시를
확인하고 `/home/pydemia/git/projects`에 배치한 뒤 다음 명령을 실행합니다.

```sh
docker compose --env-file .secrets/server.env -f compose.production.yaml build app
docker compose --env-file .secrets/server.env -f compose.production.yaml up -d --no-build
docker compose --env-file .secrets/server.env -f compose.production.yaml ps
```

기존 Caddy `/etc/caddy/Caddyfile`과 `sites-enabled`는 root 소유입니다.
`deploy/projects-caddy-sync.timer`는 시스템 Caddy 재시작으로 런타임
구성이 초기화되면 기존 Caddyfile을 기준으로 Projects 사이트만 다시
적용합니다. 사용자의 systemd manager에서 다음을 확인합니다.

```sh
systemctl --user status projects-caddy-sync.timer
systemctl --user start projects-caddy-sync.service
```

`caddy validate`와 `reload`는 Caddyfile adapter를 사용합니다. 다른
사이트의 설정을 유지한 상태에서 Caddy admin의 호스트 목록에
`projects.pydemia.ai`가 있는지 확인합니다. DNS 설정 후 인증서 발급을
다시 시도하도록 Caddy를 강제로 reload했고, 기존 네 사이트와 Projects
사이트가 함께 등록된 것을 확인했습니다.

PostgreSQL volume, `state/`, `.secrets/`는 배포 패키지와 별도로 백업해야
합니다. `auth.json`을 운영 서버에 복사한 상태이므로 원본 인증의 갱신·
만료 상태도 점검해야 합니다. Note 문서 관리가 구현되면
`note-document-handoff.md`의 소유권·이관 계약으로 임시 Markdown을
대체합니다.

## 2026-10-22 운영 배포

모바일 작업공간과 작업 보드·개인 저장 보기를 포함한 소스
`5216fa3f71b0c39cec7e4042c6515f9ab2d102755570d5b39a6256334a2d46e6`를
allowlist archive로 묶어 해시를 확인한 뒤 운영 서버의 별도 release 디렉터리에서
`pydemia-projects:5216fa3f71b0c39c` 이미지를 빌드했다. 기존 이미지를
유지한 채 새 이미지로 전환했고 앱 시작 시 Alembic `0003`→`0005`가 적용됐다.
패키징 과정의 임시 Python bytecode 포함을 제거하고 파일 순서·메타데이터를
고정했다. Windows 작업 트리에서 줄바꿈이 달라지는 텍스트 파일도 Git blob과
동일한 바이트로 정규화했다. 최종 archive의 139개 파일이 커밋의 해당 파일과
모두 일치하고 두 번의 패키징에서 동일 archive SHA-256이 나온 뒤 이미지
태그를 이 해시로 맞췄다.

전환 전에 전체 PostgreSQL custom dump와 `state/`·`.secrets/`·기존 Compose
설정을 mode 0700/0600의 서버 전용 백업 디렉터리
`/home/pydemia/.local/share/projects-backups/20261022T041240Z`에 저장했다.
`pg_restore --list`로 덤프를 읽을 수 있음을 확인했다. 전환 스크립트는 앱
상태 확인에 실패하면 이전 Compose 설정과 이미지로 돌아가도록 준비했다.
최종 이미지 전환 직전의 추가 백업은 같은 경로의 `20261022T042409Z`이다.

전환 후 앱과 DB health가 정상이고 DB 버전·`task_positions`·`task_views`를
확인했다. 앱 내부 HTTP에서 `/health`, HTML, 새 CSS·JS와 favicon SVG의
응답 및 favicon 원본 SHA-256 일치를 확인했다. 공개 HTTPS에서 미인증
`/api/session`은 401, 로그인 페이지는 200, 로그인 시작은 Microsoft
단일 테넌트로 302를 반환했다. 실제 Edge에서 기존 `pydemia@pydemia.ai`
계정으로 다시 로그인해 개인 작업공간과 새 `개인 저장 보기` UI를 확인했다.
물리 기기의 터치·safe area·OS 키보드 검증은 사용자가 수행하고 피드백을
전달하기로 했다. 운영 Hub/LLM 실행은 이번 배포 검사에 포함하지 않았다.

## 2026-10-24 Microsoft 계정 전환 수정

허용되지 않은 계정으로 시도한 뒤 403 화면에서 다시 시도해도 Microsoft
세션이 같은 계정을 선택하는 문제에 대응해 OAuth2 Proxy에
`--prompt=select_account`를 추가했다. 수정 전 공개 `/oauth2/start`의
Microsoft 인증 요청에는 `prompt`가 없었고, 수정 후에는
`prompt=select_account`가 포함되는 것을 확인했다. 단일 테넌트·이메일
도메인 제한은 유지했다.

소스 `3a5dd77591ea9d4d371329f5945732ca8cea373aec455cc8ea53458e43cf1a61`를
검증된 archive와 `pydemia-projects:3a5dd77591ea9d4d` 이미지로 배포했다.
전환 직전 PostgreSQL·`state/`·`.secrets/`·Compose 설정을 서버 전용
`/home/pydemia/.local/share/projects-backups/20261023T161612Z`에 백업했다.
전환 후 앱·DB health, Alembic `0005`, 공개 `/api/session` 401,
로그인 페이지 200, Microsoft 로그인 시작 302와 `prompt=select_account`,
앱 정적 자산과 favicon 응답을 확인했다. 다른 계정으로 실제 403을 거친
브라우저 재시도는 이번 검사에 포함하지 않았다.
