# Projects 원격 배포와 Microsoft Entra 로그인

2026-10-21 현재 기존 Ubuntu 서버 `codex-devbox`에서
`projects.pydemia.ai`를 제공합니다. DNS, Let's Encrypt HTTPS와
`pydemia@pydemia.ai`의 실제 Microsoft Entra 로그인을 확인했습니다.

## 구성과 데이터 경계

기존 시스템 Caddy가 `projects.pydemia.ai` 요청을 서버의
`127.0.0.1:14323`으로 전달합니다. 이 포트는 OAuth2 Proxy의 loopback
바인딩이며, 앱과 PostgreSQL은 호스트 포트를 열지 않습니다. 프록시가
Microsoft Entra ID의 OIDC 로그인을 마치면 허용 이메일
`pydemia@pydemia.ai`를 앱에 전달합니다. 앱은 그 이메일을 확인한 후 기존
`pydemia` 계정으로 Projects 세션을 만듭니다. 운영 모드의 자체 가입·암호
로그인은 비활성화됩니다.

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

`deploy/authenticated-emails.txt`가 허용 이메일을 관리합니다. 운영
배포의 엔트라 issuer는 실제 단일 테넌트 ID로 지정됐습니다. 앱
등록의 redirect URI와 프록시의 URI가 정확히 일치해야 합니다.

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
