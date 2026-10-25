# Projects 온프레미스 이관 기록

2026-10-26. `projects.pydemia.ai`의 운영 서비스를 기존 `codex-devbox`에서
`pydemia-server`로 옮겼다. PostgreSQL, `state/`, 서버 전용 `.secrets/`,
OAuth2 Proxy와 Entra 로그인 설정을 함께 이관했다. Cloudflare Tunnel을
공개 진입점으로 사용하며 기존 클라우드 서버는 복구용으로 보존한다.

## 확인한 현재 상태

- 기존 서버의 앱과 OAuth2 Proxy는 최종 백업 전 중지했고 PostgreSQL과
  비공개 백업은 복구를 위해 보존했다. 이전 운영 이미지는
  `pydemia-projects:6e96df4f91428268`, Alembic은 `0006`이었다.
- 기존 서버의 최종 PostgreSQL custom dump와 `state/`·설정 백업은
  `/home/pydemia/.local/share/projects-backups/migration-final-20261025T174050Z`
  에 mode 0600으로 보관한다. `pg_restore --list`로 읽기 검사를 통과했다.
  새 서버의 `/home/pydemia/.local/share/projects-migration/`에도 검증된
  최종 dump와 상태 archive가 있다.
- 새 서버 `pydemia-server`는 Ubuntu 26.04.1, Docker 29.1.3과 Compose
  2.40.3을 사용한다. 앱 이미지는 `pydemia-projects:99bfc182a4744f3e`,
  DB는 PostgreSQL 17.11이며 앱·DB·OAuth2 Proxy·Caddy edge가 실행 중이다.
  앱과 비공개 bind mount는 호스트의 비특권 `pydemia` UID 1000으로 읽는다.
- Cloudflare `ubuntu-server` Tunnel
  (`4e23fb56-9e17-4918-95e2-c5b5c4351b5a`)에
  `projects.pydemia.ai` → `http://127.0.0.1:14324` ingress를 추가했다.
  기존 `atlas`·`colors`·`ui` ingress는 유지했다. DNS는 이전 proxied A
  `139.59.246.134`에서 proxied Tunnel CNAME으로 전환했다.

## 전환 절차와 재배포

1. 새 서버의 SSH 접근, OS·Docker·디스크·기존 서비스와
   `127.0.0.1:14323`·`14324` 포트를 확인한다. Cloudflare connector는
   같은 호스트의 systemd 서비스다.
2. 기존 운영 소스의 allowlist archive를 새 서버의 분리된 release
   디렉터리에 검증·배치하고 이미지를 빌드한다. 새 서버에 PostgreSQL
   전용 volume을 만들고 별도 이름의 백업 경로를 준비한다.
3. `.secrets/`는 SSH 보호 전송으로만 복사하고 대상 권한을 0700/0600으로
   확인한다. 인증 파일·inline auth·API 키를 Git, 로그, API, 공개 ZIP에
   넣지 않는다. `state/`와 PostgreSQL custom dump를 전송·복원한다.
4. 새 서버의 앱·DB·OAuth2 Proxy·Caddy edge를 외부 트래픽과 분리된 상태에서
   기동한다. `/health`, schema, 계정·프로젝트 수, 정적 자산·favicon,
   OAuth 시작의 Entra client/tenant/callback/`prompt=select_account`를
   확인한다. 기존 Caddy의 보안 헤더·업로드 제한을 새 진입 경로에도
   적용한다.
5. 쓰기 경계를 만들고 기존 서버에서 최종 PostgreSQL dump와 `state/`
   동기화를 수행한다. 새 서버에 재적용하고 데이터 수·핵심 작업 흐름을
   확인한다. 이 단계부터 DNS 전환 완료까지 기존 앱의 쓰기를 허용하지 않는다.
6. Cloudflare Tunnel ingress를 `projects.pydemia.ai`에서 새 서버의
   loopback 프록시로 연결한다. 다른 hostname의 규칙을 보존하고 마지막
   fallback을 404로 유지한다. DNS 레코드를 Tunnel CNAME으로
   전환하고 공개 HTTPS·로그인·API·UI를 검사한다.
7. 전환 후 일정 기간 기존 서버의 앱과 DB 백업을 유지한다. 실패 시
   Cloudflare DNS를 기존 A 레코드로 되돌리고 기존 앱을 다시 가동한다.
   새 서버에서 전환 후 쓰기가 발생했다면 역방향 데이터 이전을 검토한 뒤
   롤백한다. 두 DB를 동시에 쓰기 가능한 상태로 두지 않는다.

새 서버의 재배포 명령은 다음과 같다. `compose.onprem.yaml`은 앱 UID·tmpfs
권한을 새 호스트에 맞추고, `deploy/projects-tunnel.caddy`는 보안 헤더·요청
크기 제한·인증 헤더 제거를 적용한다. 프록시는 호스트 loopback에만 열린다.

```sh
cd /home/pydemia/git/projects
docker compose --env-file .secrets/server.env -f compose.production.yaml -f compose.onprem.yaml build app
docker compose --env-file .secrets/server.env -f compose.production.yaml -f compose.onprem.yaml up -d --no-build --wait
```

## 검증 결과와 범위

- 최종 source hash는 `99bfc182a4744f3eaeb413b92542f9c0c98ba8b49773f50e74b4bcc54f9595f2`,
  archive SHA-256은 `0480f80e67700b6b3ab5fe23202fb80c9cbb7cdbd687f8ce4015bf9ebac822b7`이다.
  새 서버에서 해시를 재검사한 뒤 압축을 풀고 이미지를 빌드했다.
- 최종 DB 복원 후 양쪽의 계정·프로젝트·작업 수는 `1·1·1`, Alembic은
  `0006`으로 일치했다. 앱·DB·OAuth2 Proxy는 healthy이고 edge는 실행
  중이며, Caddy 설정 검사도 통과했다.
- 공개 HTTPS 로그인 화면은 200, 미인증 `/api/session`은 401, OAuth 시작은
  302다. Microsoft 단일 테넌트와 `prompt=select_account`, 기존 CSP 및
  보안 헤더를 확인했다. 브라우저에서 Microsoft 로그인 화면까지 이동했다.
- 로컬 개발 검사는 백엔드 197개, 웹 46개 테스트와 웹 빌드, Ruff·mypy가
  통과했다. 실제 Microsoft 계정 인증 완료와 인증 후 UI 조작, 물리 기기
  검사는 이번 이관에서 수행하지 않았다.
