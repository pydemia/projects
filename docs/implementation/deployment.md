# Projects 원격 배포와 Microsoft Entra 로그인

## 2026-11-23 Kanban 카드 조작 운영 반영

[공용 Kanban](https://ui.pydemia.ai/?component=kanban#components)을 먼저 게시한 뒤 Projects 작업 보드에 적용했다. 카드 표면에서 상세를 열거나 드래그한다. `···` 작업 메뉴에서는 열을 바꾸거나 수동 정렬 순서를 조정한다. 관련 Story는 개수를 눌러 펼친다.

- 운영 앱 이미지 `sha256:702aa3ff630c7bb36f3cfbc2ca4ead1ddb7c9d3925d5cf5a56ae79860c97420d`에 칸반 정적 자산을 추가해 `sha256:64541b5c4692407950eff7dfe374df8905da6f7027fdf37ffbea5642d75f1f45`로 전환했다. DB·edge·oauth2-proxy 컨테이너와 앱 실행 설정 및 마운트를 대조했다.
- 운영 릴리스 디렉터리는 `20261112-agent-track-dependencies-33dfdfe3c12a0ffb/kanban-card-controls-20261123-771045f96b01ef5b-51932899`다. 게시 자산의 해시와 이전 Compose 구성을 해당 디렉터리에 보관했다.
- 공개 HTML·CSS·JS·favicon 해시, 앱 health, Microsoft 로그인 방식과 비로그인 세션 거부를 확인했다.
- 웹 테스트 280개와 빌드가 통과했다. 격리 PostgreSQL과 Edge에서 제목 표시·편집·드래그를 확인했다. 운영 자산은 테스트 API 응답으로 Edge 1440·390·320px에서 카드 열기와 이동을 확인했다.

## 2026-11-23 Story·Task 목록 운영 반영

Story 목록은 제목 행만 표시한다. Task는 제목 버튼이나 행 여백에서 본문을 열고,
관련 Story 제목은 개수 표시를 펼쳤을 때 표시한다. 소스 변경은 `33ee591`이다.

- 기존 앱 이미지 `sha256:7611ef7be69201f3b8ba4d61753034ce18b851856415720a85d62562eb77016d`에 목록 UI 정적 자산 네 개를 추가해 이미지 `sha256:32f446962e6aa5c182ae5923032ced3b4ba8ce73f3c40808431615bff40a6608`로 전환
- 현재 운영의 로그아웃 변경과 작업 요약을 포함한 기존 번들에서 목록 UI에 필요한 부분만 수정. 마크다운 모듈이 새 진입점과 같은 React 인스턴스를 사용하도록 양쪽 import 경로를 갱신
- 첫 release `story-task-lists-20261123-fa7d22fa19ef8f9a-df33fb47`에 상세 선택 안내를 보완해 운영 이미지 `sha256:702aa3ff630c7bb36f3cfbc2ca4ead1ddb7c9d3925d5cf5a56ae79860c97420d`로 전환
- 현재 release는 `20261112-agent-track-dependencies-33dfdfe3c12a0ffb/story-task-lists-20261123-b9cd22c597f95af8-e65e280f`. 적용 목록과 이전 Compose 파일 목록은 서버 release의 `manifest.json`과 `previous-config-files.json`에 보관
- 앱 health, 환경변수 값, 실행 설정과 마운트, DB·edge·oauth2-proxy 컨테이너 ID 보존 확인. 공개 HTML·정적 자산·favicon의 해시와 비로그인 세션 거부 확인
- 실제 Edge·격리 PostgreSQL에서 소스 빌드 흐름 11개 확인. 공개 운영 자산은 테스트 API 응답을 사용해 Edge 1720·390·320px에서 목록·본문·키보드 조작 확인

다음 전체 프런트엔드 빌드 배포 전에는 현재 운영 로그아웃 연동과 작업 요약 동작을 소스에서 재현하고 확인한다.

## 2026-11-09 목록 상태점 드롭다운 운영 반영

후속 사용자 요청에 따라 완료 checkbox를 제거하고 원형 상태점+펼침 메뉴로 바꿨다.
선택 checkbox는 일괄 선택 전용이다. 개인/구현 작업의 상태 조작을 통일했고 기존
완료 gate·취소 사유·revision·현재 권한 검사를 그대로 사용한다.

- source `b313610cb90a73bceee1b1fcad1d0e02c7aca5162c578461aa04d040f20010bd`
- image `pydemia-projects:story-b313610cb90a73bc`, ID `sha256:2279f9eec447e0924f79eb282bd340c02a935266dd19d7aab2269b8d7470a7d3`
- base는 직전 Story/기획 운영 image `sha256:058fa35f32be33e8b18a6b069bf663d7a88b148222018012f1adbe22de94ede4`다.
- backend/migration source hash는 직전과 동일하다. migration을 실행하지 않았고 schema0016을 유지했다.
- private backup 후 모든 기존/신규 업무 테이블 fingerprint, env/mount/Cmd/User,
  assistant principals·Caddy·동일 ingress container ID 보존을 확인했다.
- 웹 279개·build/favicon, 격리 PostgreSQL+실제 Edge 5개 흐름·모바일 light/dark를 통과했다.
- 운영 app/DB healthy·edge/proxy running, 92개 payload·내부 정적 27개·공개 16개 bytes/MIME,
  CSP·API 비로그인 거부·폰트의 기존 11개 인증 보호를 확인했다. 실제 공개 Edge의
  583/390px dark·1440px light 로그인/자산/401·Microsoft 시작·원래 경로 보존도 통과했다.

현재 실제 설정은 서버 private release
`/home/pydemia/.local/share/projects-releases/20261109-task-status-b313610cb90a73bc/runtime.compose.json`이다.
백업은 같은 private release의 `backup-20261109T064301Z`다. resolved credentials·인증 파일은
서버 전용이며 공개 source/hash/검사 결과만 로컬 ignored artifact로 보관했다.
운영 업무 자료에 QA 쓰기는 하지 않았다. 실제 상태 변경·완료 거부·취소 저장은
격리 PostgreSQL/API·React의 실제 Edge로 확인했으며 backend 전체 재검사와 구분한다.
commit/push/PR은 하지 않았다.


## 2026-11-09 Story·Task와 반복 기획 운영 반영

최신 사용자 goal과 기존 배포 승인에 따라 설계·구현·검증 뒤 운영에 반영했다.
[실행 기준표](story-task-goal.md) 21/21(100%)와 [통합 검증](story-task-verification.md)을 따른다.

| 항목 | 실제 값·결과 |
|---|---|
| source | `15728ec5d0015de84be04f61d147bcd29f9a24588dbdbb2c411323c8a712b8e5` |
| 운영 image | `pydemia-projects:story-15728ec5d0015de8` |
| image ID | `sha256:058fa35f32be33e8b18a6b069bf663d7a88b148222018012f1adbe22de94ede4` |
| 보존한 runtime base | `sha256:3b0973c7959524742fb53101c19fb8d5a195ab501db8c441f02345482f9b2dd8` |
| source archive SHA-256 | `c8e11e43b65a0dd0ff76c0a95bf8d1b35d5ec545294f3aa613ed8b52d378116b` |
| runtime payload archive SHA-256 | `cc849c5b4d33c1bf93c8bee7535be77fdabd71153a20d7873d86f7e1c431d0a5` |
| migration | 원문 assistant 0013 보존, 기획0014→일정0015→Story 검증0016 |
| 기존 자료 | cutover 전후 모든 기존 업무 테이블 내용 hash·count 동일, 새 8개 테이블 비어 있음 |
| 서비스·설정 | app/DB healthy, edge/oauth2-proxy running; env/mount/Cmd/User·principals·Caddy·동일 ingress ID 보존 |
| 공개 검증 | 16개 shell/JS/CSS/favicon bytes·MIME·CSP, API 인증 거부, 실제 Edge 4개 묶음 통과 |

서버 private release는
`/home/pydemia/.local/share/projects-releases/20261109-story-task-15728ec5d0015de8`이며
그 안의 `runtime.compose.json`이 실제 현재 설정이다. resolved credentials·Docker inspect·
PG dump·bind mount 백업은 mode0700 디렉터리의 서버 전용 자료이며 내려받거나 출력하지 않았다.
private 백업 `backup-20261109T061128Z`의 pg_dump를 pg_restore --list로 확인한 뒤 이관했다.
공개 가능한 source/archive/hash·검사 결과만 로컬 ignored release에 보관했다.

현재 frontend만 교체한 상태가 아니라 assistant-aware backend에 Story/기획/일정을 통합한
실행 이미지다. 서버 Git checkout의 오래된 backend나 기존 두 compose만으로 재생성하지 않는다.
향후 배포는 현재 private compose의 실제 env/mount와 immutable source artifact를 기준으로 한다.
앱 실패 시 helper는 이전 base 이미지로 복귀하되 additive schema를 유지하도록 준비했으며
이번에는 rollback 없이 완료했다. 임의 DB downgrade/restore는 수행하지 않았다.

공개 요청에서 Python 기본 UA가 403을 받은 뒤 browser UA와 실제 Edge로 같은 경로를
검증했다. 기존 font 공개 인증 정책(11개 403)은 유지했으며 내부 bytes는 모두 일치했다.
운영 업무 자료에 QA 쓰기를 하지 않고 read-only로 기존 7개 프로젝트의 새 읽기 모델을
확인했다. 인증 후 쓰기 QA는 격리 PostgreSQL·실제 API/Edge 10개 흐름으로 구분한다.
다른 Microsoft 실계정·신규 실제 Hub/LLM 호출은 실행하지 않았다. commit/push/PR은 하지 않았다.


## 2026-11-09 로그인 화면 공간 활용 배포

APP-REQ-064 / AC-142~143. 로고/테마 선택을 상단 헤더로 묶고 로그인 화면의
세로 중앙 정렬을 해제했다. 최대 폭을 넓혀 desktop 안내/로그인을 두 열로
배치하고 모바일은 한 열의 본문 폭을 활용한다. 좁은 화면에서 테마 선택은
겹침 없이 줄바꿈한다. `App.tsx`·`app.css`·`theme-overrides.css` 세 파일만 바뀌었다.
웹 247개·host build/favicon, 실제 Edge의 배치/짧은 화면 7개·기존 startup
5개 checkpoint를 통과했다. 실제 Microsoft-only 로그인 표시를 대상으로 한
공개 운영 Edge의 583/390px dark·1440px light 배치와 자산/인증 4개도 확인했다.

- frontend source: `7721890b4eeda52b29181e9ffe8e20fdf8f7864593232aee268a77787315bf2b`
- source archive SHA-256: `49d835cd4c271465569210425f5665abf694e0d3b3fa377bc6521965515af47a`
- public frontend archive SHA-256: `5b4ea65e560a92be89ba95cbff3d8fdc0df933773f47833ab84635dea6e7fb17`
- runtime image: `pydemia-projects:login-7721890b4eeda52b`
- runtime image ID: `sha256:3b0973c7959524742fb53101c19fb8d5a195ab501db8c441f02345482f9b2dd8`
- 보존한 runtime base: `sha256:dbfa5091f556837764af9b581a788bc08603814ca3b15a124bb913342291a20e`
- release/backup: `/home/pydemia/.local/share/projects-releases/20261109-login-layout-7721890b4eeda52b/backup-20261109T031651Z`

public frontend 27개 파일의 hash·앱 사용자 읽기 preflight 후 현재 runtime base에
COPY했다. private 환경·설정·state·web/deploy·DB dump와 목록을 백업하고
app만 교체했다. schema 0013·backend/migration·integration Caddy·환경/마운트·
명령/사용자와 전후 업무/권한 fingerprint가 같다. 프로젝트 7·항목 29·revision
48·assistant operation 3을 보존했다. 자격 원문은 서버 private release에만 둔다.
관리 진입점은 이 release의 `runtime.compose.json`, 복구는 backup의
`runtime-before.compose.json`과 위 runtime base다. DB downgrade/restore와
과거 전체 이미지 교체를 하지 않는다.

app/DB healthy, 기존 proxy/edge running이다. 공개 운영 Edge에서 브랜드 상단이
583px에서22px, 390px에서20px이며 가로 넘침이 없었다. desktop은 두 열 상단이
일치하고 로그인 폭이 약593px다. 테마 선택·JS/CSS/favicon bytes/MIME·비로그인
데이터/session 401·Microsoft 시작 302/S256을 확인했다. 실제 Microsoft 승인이나
물리 모바일 키보드 조작을 검증한 것으로 확대하지 않는다.
[실제 화면·검사 범위](verification.md)의 최신 절을 따른다.

## 2026-11-09 테두리 없는 홈 컨트롤 배포

APP-REQ-062 / AC-138 후속 피드백을 반영했다. `startup.css` 한 파일의 변경으로
엠블럼·제목의 hover/누름/포커스 밑줄과 별도 엠블럼 테두리를 제거했다. 배경
변화·클릭 영역·pointer·텍스트 선택 방지를 적용하고 홈 이동·키보드 표시는 보존한다.
웹 34파일·247개, host build/favicon과 실제 Edge 5개 checkpoint를 통과했다.
전체 웹 이후 CSS 여백·focus offset 조정은 build/실제 Edge로 다시 확인했다.

- frontend source: `0caa92609f21d56f6ec6ae2ed9a71812a719ab6a4834d80e2019443e38236c5a`
- source archive SHA-256: `bdb5069c683790e17ece9f654560f180820fe75c7987466641ed8173d0a932d0`
- 검증한 public frontend archive SHA-256: `ca3ccbd63ff6fdf9250c7c0224bc2f42d0c9705f29ac8a6b4340f11ab3853e06`
- runtime image: `pydemia-projects:brand-0caa92609f21d56f`
- runtime image ID: `sha256:dbfa5091f556837764af9b581a788bc08603814ca3b15a124bb913342291a20e`
- 보존한 runtime base: `sha256:78061a90c0ffdcdfac3297459c937fcfcbceabcd5a640906c7942721c2dfd303`
- release/backup: `/home/pydemia/.local/share/projects-releases/20261109-brand-button-0caa92609f21d56f/backup-20261109T014215Z`

기존 assistant-aware runtime에 public frontend 27개 파일만 COPY했다.
backend·schema 0013·integration Caddy·환경·비공개 마운트·명령·사용자와
기존 업무 fingerprint가 같았다. 프로젝트 7·항목 29·revision 48·assistant
operation 3을 보존했다. DB dump/목록과 private 설정·state/web/deploy 백업을
확인했으며 비밀값은 서버의 private release에만 둔다. 현재 관리 진입점은
이 release의 `runtime.compose.json`이다. 복구는 같은 backup의
`runtime-before.compose.json`과 위 runtime base를 사용하고 DB를 내리지 않는다.

첫 preflight는 동등한 image tag/ID 표기 차이를 거부해 실제 image ID 비교로
정리했다. 첫 실제 전환에서는 private umask로 생성된 정적 디렉터리가 0700이
돼 앱 사용자에게 읽기 거부가 발생했다. 내부 자산 검사가 401로 실패해 기존
runtime으로 자동 복구됐다. public 파일만 디렉터리 0755/파일 0644로 정리하고
앱 사용자에서 27개 파일의 bytes/hash 읽기를 서비스 중지 전에 검사한 뒤
다시 배포해 내부 자산 검사까지 통과했다. release·credential 부모 디렉터리의
private 권한은 유지했다. [실제 화면·운영 검사](verification.md)의 최신 절을 따른다.
app/DB healthy, 기존 proxy/edge running이다. 공개 Edge에서 초기/React 홈의
hover에 밑줄·테두리가 없음을 확인하고 token 복귀·API 인증·Microsoft 시작과
JS/CSS/favicon bytes·MIME의 6 checkpoint를 통과했다. 실제 auth-options 응답과
로그인 UI 렌더를 순서대로 기다려 자산 로딩 시간과 UI 단언 시간을 구분했다.

## 2026-11-08 홈 링크·프런트엔드 로딩 배포

APP-REQ-062~063 / AC-138~141을 운영에 반영했다. 엠블럼·Projects 제목을
프로젝트 목록의 홈 링크로 연결하고, 앱 JS/API를 기다리는 초기 HTML과
React의 세션·프로젝트 목록/내용 대기에 로딩 상태·스켈레톤을 표시한다.
웹 247개·배포 설정 29개·host/Linux build/favicon·실제 Edge 지연 검사 5개를
통과했다. [검증 범위](verification.md)의 최신 절을 따른다.

**이번에는 현재 운영 runtime 위에 frontend layer만 추가했다.** 배포 전
대조에서 별도 assistant rollout이 backend와 schema 0013, private principal
마운트와 Caddy integration 경로를 추가한 것을 확인했다. 기존 986 source
baseline으로 전체 이미지를 교체하는 작업은 preflight에서 차단돼 서비스에
영향을 주지 않았다. 별도 변경을 로컬 workspace로 무단 병합하지 않고
현재 image·환경·마운트·명령·사용자·Caddy를 보존했다.

| 식별 | 값 |
|---|---|
| frontend build source SHA-256 | `3f5f287a22895e6425d389f66fb972bb37914b317e377995b87fc8f327168567` |
| source archive SHA-256 | `322e9de1540fd4b8a69967cdbb28dedae67d2a715798b8711e15e4e312e766d9` |
| frontend 검증용 image | `pydemia-projects:3f5f287a22895e64` |
| 검증용 image tar SHA-256 | `0d494a6c463dcd7a6b7f3e7972d0d7beffdc786d5afd00ec4be18361aad9e7ed` |
| 실제 runtime image | `pydemia-projects:home-3f5f287a22895e64` |
| 실제 runtime image ID | `sha256:78061a90c0ffdcdfac3297459c937fcfcbceabcd5a640906c7942721c2dfd303` |
| 보존한 runtime base ID | `sha256:308745acce76177b3d184e2682a9ea672a4665255b3670326d7f72268832888a` |
| schema | 기존 `0013` 유지, 추가 이관 없음 |
| release/backup | `/home/pydemia/.local/share/projects-releases/20261108-home-loading-3f5f287a22895e64/backup-20261108T054753Z` |

234개 allowlist 중 기존 986 대비 web의 6개 파일만 다르다. 검증용 Linux image의
web/dist를 추출해 서버의 현 runtime base 위에 COPY했다. Dockerfile은 이 static
복사와 frontend-source/runtime-base label만 추가한다. 기존 backend/의존성·
integration을 검증용 이미지의 옛 backend로 교체하지 않는다. 따라서 frontend
build source hash를 전체 운영 backend source 식별로 해석하면 안 된다.

현재 container의 실제 compose 파일을 읽고 환경·마운트·명령을 대조해 private
resolved compose를 만들었다. interpolation에 영향을 주는 `$`는 보존하고
환경·credential은 서버의 mode-0700 release/backup 안에 mode-0600으로만 둔다.
이 원문 파일은 로컬 산출물·Git·로그로 가져오지 않는다. 기존 edge/proxy container는
그대로 중지/시작하고 app만 교체했다. PostgreSQL dump/목록 검사와 private
state/config/web/deploy 백업 후 전후 전체 업무/권한 레코드 fingerprint가 같았다.
프로젝트 7·항목 29·revision 45·assistant operation 3·역할 21·멤버십 7을
보존했고 backend/migrations의 모든 파일 hash, 환경·마운트·명령·사용자와
integration Caddy 파일 hash도 동일했다.

현재 배포의 관리 진입점은 다음 private resolved compose다. 별도 assistant
overlay를 빠뜨린 기본 두 compose 파일만으로 app을 재생성하지 않는다.

```sh
docker compose -p pydemia-projects -f /home/pydemia/.local/share/projects-releases/20261108-home-loading-3f5f287a22895e64/runtime.compose.json ps
```

복구 시 같은 release backup의 `runtime-before.compose.json`과 위 runtime base를
사용해 기존 assistant-aware app을 되살린다. DB downgrade/자료 restore나
구형 owner/ACL 전체 이미지 복귀는 하지 않는다. 롤백용 web source는 이전
986 archive의 변경 대상 6개 파일에 한정한다. 기존 integration 코드·Caddy·
principal 설정은 복구 과정에서도 덮어쓰지 않는다.

app/DB healthy, edge/proxy running이다. 공개 운영 Edge에서 JS 다운로드를
실제로 보류한 초기 로딩·홈 링크, App 로그인 전환·초대 token 보존과 token-free
rd, 비로그인 데이터/session/preview와 위조 헤더 401, Microsoft 로그인 시작,
JS/CSS 및 light/dark favicon PNG·SVG·ICO bytes/MIME 일치를 확인했다.
첫 공개 로그인 UI의 5초 대기는 한 차례 실패했으나 진단을 추가한 같은 기준의
재실행에서 코드·제한 변경 없이 5 checkpoint 모두 통과했다. 실제 사용자
Microsoft 승인이나 assistant bearer 호출의 기능 재검증으로 확대하지 않는다.

## 2026-11-07 프로젝트별 멤버·권한·초대 진입 배포

프로젝트별 오너·에디터·뷰어·사용자 지정 역할과 동작 권한을 운영에 반영했다.
목록·검색·집계·직접 API·작업 이동·ZIP·SkillRun은 요청자의 현재 멤버십과
권한을 검사한다. 로그인은 기존 pydemia.ai 조직 하나로 유지하며 자동 공유하지
않는다. 앱의 **프로젝트 설정 · 멤버·권한**에서 관리한다.
[수용 기준](project-access-goal.md)과 [검증 범위](verification.md)의 최신 절을 따른다.

| 식별 | 최초 권한 이관 | 최종 로그인 진입 보완 |
|---|---|---|
| image | `pydemia-projects:ea7acc4fbce89dd6` | `pydemia-projects:986e0a1af12655bb` |
| source SHA-256 | `ea7acc4fbce89dd600ba7c1a8d6aff5a2d793b1b52eee2d9055764d102d8b03f` | `986e0a1af12655bbe367a154abe303ab350c71a07a29c1c1d63ebc8dd36c1bcc` |
| archive SHA-256 | `fd7c5bce2d2681f8dbd74f7d473aebe8921fefcc893b19bb01de35765b07e7b1` | `4a1c523b3efbc60893b9a4f39f6be37e7f3d9b5ad0cabfe48f93e3cd439cd74b` |
| image tar SHA-256 | `fda76146dc8ac399a22bbe20b621f32e3ce6ea041b551e8cd551d3d6ef6caa05` | `acce1a84f3fe45962afb7ecb4042335a1c9a2ba383976f387662cf0644c17b1f` |
| schema | `0010 → 0012` | `0012` 유지 |
| allowlist | 230개, 직전 대비 63개 변경 | 231개, 직전 대비 2개 변경 |

private release/backup 위치는 다음과 같다. secret이나 사용자 자료의 원문은
검증 산출물·Git에 포함하지 않는다.

- `/home/pydemia/.local/share/projects-releases/20261107-project-access-ea7acc4fbce89dd6/backup-20261107T041344Z`
- `/home/pydemia/.local/share/projects-releases/20261107-project-access-login-986e0a1af12655bb/backup-20261107T042456Z`

PC에서 allowlist archive를 고정해 Linux amd64 이미지를 빌드하고 서버의 직전
source, archive/image hash와 source label을 대조했다. 각 전환은 ingress/app을
멈춘 상태에서 PostgreSQL custom dump와 pg_restore 목록, private config/state/
source 백업을 확인한 뒤 진행했다. 최초 이관은 이전 schema의 column 집합으로
기존 업무 fingerprint를 비교해 새 ACL column 추가와 자료 변경을 구분했다.
프로젝트 6개·항목 28개·revision 42개·보기 3개·개인 순서 24개·기준선 1개·관계
4개를 보존했다. 기존 오너에게만 멤버십 6개·기본 역할 18개를 만들었다.
0012는 초기 로컬 0011 draft의 index/역할 정합성도 복구하며 운영의 최종 0011
정책은 유지한다. 사용자 업무 값을 재작성하거나 DB를 초기화하지 않았다.

최종 전환은 `compose.production.yaml`과 `acceptance-bootstrap.test.tsx`만 다르다.
운영 첫 점검의 프록시 자체 로그인 화면 대신 App이 초대 fragment를 보존한 뒤
Microsoft로 연결하도록 GET root·flat JS/CSS·favicon·auth options·health를 공개했다.
데이터/session API와 인증 쓰기는 계속 보호한다. 실제 프록시 14 checkpoint와
245개 웹 검사, 새 이미지의 config-test와 기존 모든 업무/ACL 레코드 fingerprint
일치를 확인했다. 공개 Edge에서 App 200, 초대 token의 sessionStorage 보존과
token-free rd, 위조 헤더/비로그인 데이터 401, Microsoft authority·계정 선택·
S256·nonce를 확인했다. 실계정 Microsoft 승인은 조작하지 않았다.

app/DB healthy, proxy/edge running이다. 실제 공개 HTML이 참조하는 JS/CSS와
light/dark favicon PNG·SVG·ICO의 bytes·MIME·SHA-256이 image 산출물과 같다.
런타임 브라우저 오류도 없었다. 운영에 QA용 업무나 타 사용자 권한을 추가하지 않았다.

**복구 경계:** 멤버 초대·역할 변경 후 owner-only 이미지 `47b682394f07d58d`로
무조건 복귀하면 안 된다. 최초 이관의 구형 이미지 복구는 owner-only backfill만
있고 새 초대/공유/감사/사용자 역할/보관이 없는지 ingress 차단 후 확인한 경우로
제한했다. 최종 진입 보완은 같은 0012 ACL을 지원하는 직전 이미지
`ea7acc4fbce89dd6`로 복구할 수 있다. DB downgrade/자료 restore를 자동 실행하지
않으며 source·compose·app/proxy를 함께 맞추거나 ACL을 유지한 새 revision으로
앞으로 복구한다. private backup은 임의로 사용자 자료에 덮어쓰지 않는다.

## 2026-11-07 Entra 계정 로그인·인증 멀티테넌시 배포

다른 계정의 Entra 승인 후 프록시가 email 클레임을 찾지 못하는 500을 재현하고,
로그인 이름 표시 claim과 안정된 subject 식별을 구분했다. 공통 허용 조직 정책과
검증된 tid/iss 헤더, `(tenant_id, subject)` identity 연결을 반영했다.
기존 계정·소유권을 보존하고 팀 공유는 열지 않았다.
[기획/역할 설계](../planning/20-tenancy-and-project-permissions.md)와
[현재 검증·미검증](verification.md)의 최신 절을 따른다.

- source hash: `47b682394f07d58df1c50ee068e52fb80121966fab36de8eeacf0fa06cf6e5b4`
- archive SHA-256: `08efcf0349714b12c2d46baec18bc7e5f3205b10c1dfe0884dae22e5b89550cf`
- image: `pydemia-projects:47b682394f07d58d` · Linux amd64
- image tar SHA-256: `292538a7f68a8ff4737d90674063d8f93352b07db4f033c8a282722654ef48a3`
- previous image: `pydemia-projects:b8efb8b43cd14806`
- release/backup: `/home/pydemia/.local/share/projects-releases/20261107-entra-47b682394f07d58d/backup-20261107T013310Z`

215개 allowlist 중 직전 배포와 다른 13개 파일을 고정해 PC에서 이미지로 빌드했다.
서버 source baseline·archive/image hash·source label을 확인하고, edge/proxy/app을
멈춘 뒤 private 설정·state·기존 source·PostgreSQL custom dump를 백업했다.
`pg_restore --list`와 실제 proxy config-test를 통과한 후 additive migration
`0010`과 app/proxy를 전환했다. 기존 계정 및 업무 레코드의 전체 fingerprint가
이관 전후 동일하며 새 identity 테이블은 기존 데이터를 재작성하지 않는다.

app/DB healthy, proxy/edge running이다. 프로젝트 6개·항목 28개·revision 42개,
개인 보기 3개·QA 프로젝트 4개/24개 태스크가 보존됐다. 실제 HTML/JS/CSS/favicon
bytes·MIME가 image 산출물과 일치한다. 공개 root 403/signin, 세션 401, 로그인
화면 200, Microsoft 시작 302·기존 조직 authority·계정 선택·S256·nonce를 확인했다.
공개 API에 위조한 user/email/tid/iss를 보내도 401이다. 실제 계정의 Microsoft
승인 이후 로그인 완료는 이번 배포에서 직접 확인하지 않았다.

공통 `deploy/entra-policy.json`은 현재 원래 조직과 `pydemia.ai`만 허용한다.
`scripts/render-entra-proxy.py`로 공개 alpha 설정을 생성하며 실제 secret은 기존
서버 환경변수에서만 읽는다. 앱은 같은 정책 파일을 readonly mount로 읽는다.
정책 또는 proxy 버전을 바꾸면 생성물 일치·실제 이미지의 config-test와 합성
콜백 검사를 다시 실행한다. Entra 앱 등록은 현재 `AzureADMyOrg`로 보존했다.

복구 시 DB를 덮어쓰거나 identity 테이블을 자동 삭제하지 않는다. schema 0010을
모르는 직전 이미지로 돌아가야 하면 private backup의 compose override에서
`uv run --no-sync projects serve ...`를 사용해 시작 시 migrate를 건너뛰고,
app/proxy/edge 전체에 같은 override를 적용한다. 이후 호환되는 새 revision으로
복구한다. 이미 활성화한 외부 조직의 계정 연결은 옛 인증 코드로 돌아가면
사용할 수 없으므로 배포 이후 임의로 과거 이미지를 재시작하지 않는다.

## 2026-11-03 데스크톱 작업 제목 너비 보완 배포

작업 제목의 외곽 100% 너비·어절 줄바꿈과 데스크톱 최소 제목 열을 반영했다.
웹 215개·실제 제목 5개/기존 편집 13개 브라우저 checkpoint·host/Linux image
build/favicon을 통과했다. backend와 migration은 직전 배포와 동일하다.

- source hash: `b8efb8b43cd148061621faaf7e577927efd5d9c6ee15237a4618063cd6e610f7`
- archive SHA-256: `dea3b1c5c4f87438b07eb504ab3d86f178eef81fa4c70ee032a4c13f8123ffd5`
- image: `pydemia-projects:b8efb8b43cd14806` · Linux amd64
- image tar SHA-256: `0568385d621adf9cea41b4f19ea88a99741631306a12fb506f9888bb4f1def7f`
- previous image: `pydemia-projects:0796e0207e9cf01c`
- release/backup: `/home/pydemia/.local/share/projects-releases/20261103-task-title-b8efb8b43cd14806/backup-20261103T092558Z`

210개 allowlist의 파일 집합은 같고 `inline-edit.css`, `task-management.css` 두
파일만 다름을 manifest로 확인했다. 기존 서버 source·전송 hash/image label·
private 백업·PostgreSQL dump/pg_restore list를 검사하고, 앱 중지 중 migration
전후 업무 fingerprint 일치와 schema `0009`를 확인했다.

app/DB healthy, proxy/edge running이다. 프로젝트 6개·항목 28개·revision 42개·
보기 3개와 QA 프로젝트 4개/24개 태스크를 보존했다. 실제 HTML/JS/CSS/favicon
bytes·Content-Type과 새 제목 CSS marker, 공개 인증 401/200/Microsoft 302·계정
선택을 확인했다. rollback은 직전 0796… image/source이며 DB 복원/downgrade는
하지 않는다. [기능 검증과 미검증 범위](verification.md)를 따른다.

## 2026-11-03 사용자 시간대·날짜/시간 UI 구분 배포

설정의 IANA 시간대·UTC 시각 변환, raw T/offset 없는 날짜/시간의 별도 요소와
CSS gap을 배포했다. 응답 전 DB commit을 보장해 로그인 직후 가시성 경쟁도
수정했다. backend 261개·web 215개·실제 시간대/UI 8개·재인증 11 checkpoint와
host/Linux image build/favicon이 통과했다. [검증 범위](verification.md)를 따른다.

- source hash: `0796e0207e9cf01cdc1bee36c076865b14efd9b8189d311319d1d570adb9912f`
- archive SHA-256: `b930da359965d872708ddfaecfa5ed884fc49733d0ff7c20cd83b6d770b179c8`
- image: `pydemia-projects:0796e0207e9cf01c` · Linux amd64
- image tar SHA-256: `9e73778a6c74e035c20a7d7619dac54ce1ce9f19cabc743d5da26ce32b9aadf8`
- previous image: `pydemia-projects:0996c4144d63a840`
- release/backup: `/home/pydemia/.local/share/projects-releases/20261103-timezone-0796e0207e9cf01c/backup-20261103T085541Z`

210개 allowlist 중 변경 13개·추가 1개다. backend source 차이는 DB dependency의
function scope/주석뿐임을 archive와 대조했다. schema·의존성·서버 배포 설정은
동일하다. 기존 서버 source manifest·신규 파일 충돌, 전송 archive/image hash·
label을 확인하고 private 백업·PostgreSQL custom dump/pg_restore list를 검사했다.
앱 중지 중 migration 전후 업무 fingerprint가 같고 schema `0009`를 유지했다.

app/DB healthy, proxy/edge running이다. 프로젝트 6개·항목 28개·revision 42개·
보기 3개, QA 프로젝트 4개/24개 태스크를 보존했다. 실제 HTML/JS/CSS/favicon
bytes/Content-Type과 새 UI marker를 확인했다. 운영 Python의 DB dependency scope가
function이고 DB TimeZone이 UTC 계열임을 검사했다. 공개 session 401·로그인 200·
Microsoft 시작 302/계정 선택도 확인했다. 실제 인증 완료 후 운영 UI와 물리
기기는 미검증이다. rollback은 직전 `0996c4144d63a840` 이미지·source이며 DB
복원/downgrade를 하지 않는다.

## 2026-11-03 날짜·시간 표시 형식 배포

사용자 설정의 `날짜와 시간`, preset/직접 입력·예시·적용, 브라우저 저장과 다른
탭 반영을 배포했다. 작업 날짜·기록 시각의 표시를 통일하고 ISO 원문과 기기
시간대·정렬/필터를 보존한다. backend 260개·web 211개·실제 날짜 브라우저 6개·
재인증 회귀 11 checkpoint, host/Linux image build·favicon이 통과했다.

- source hash: `0996c4144d63a840308be13b1a6d9aa6840ec8ce177b2b2bc19e2b8fc48ac7db`
- archive SHA-256: `32444922b604fa10ded536e69647f8451748d81e8a706028033ece51a2702bb7`
- image: `pydemia-projects:0996c4144d63a840` · Linux amd64
- image tar SHA-256: `664000e0087670746ab859a2b7dd5cf959d661c92c2c2c883c5f7dd1533c518d`
- previous image: `pydemia-projects:9694861dedf78888`
- release/backup: `/home/pydemia/.local/share/projects-releases/20261103-datetime-0996c4144d63a840/backup-20261103T082738Z`

기능 배포 `9694861dedf78888` 뒤 models.ts의 EOF 빈 줄을 정리한 최종본이다.
정리 전후 source 차이는 이 공백 하나뿐이며 image TypeScript/build/favicon을
다시 통과했다. 최종 운영 자산 bytes는 기능 검증본과 동일하다. 기능 배포의
직전 이미지는 `0ad513fbaadbd676`, 백업은 datetime-9694861dedf78888의
`backup-20261103T082343Z`다.

재인증 배포 `0ad513fbaadbd676` 기준 209개 allowlist 중 변경 19개·추가 5개는 모두 web/src이며 backend·migration·
의존성·서버 설정은 동일하다. immutable archive/image hash·label과 기존 서버
source manifest·신규 파일 충돌을 검사했다. 서버 private 0700/0600 백업과
PostgreSQL custom dump·pg_restore list 검사 후 앱 중지 중 migration 전후
업무 fingerprint 일치를 확인했다. schema는 `0009`다.

app/DB healthy, proxy/edge running을 확인했다. 프로젝트 6개·항목 28개·revision
42개·보기 3개와 QA 프로젝트 4개/24개 태스크를 보존했다. 실제 HTML/JS/CSS와
favicon bytes/Content-Type을 image와 비교하고 새 날짜 저장소 marker·CSS를
확인했다. 공개 session 401·로그인 200·Microsoft 시작 302/계정 선택을 확인했다.
rollback은 직전 `9694861dedf78888` 또는 기능 배포 전 `0ad513fbaadbd676` 이미지·source로 가능하고 DB 복원/downgrade는
하지 않는다. 인증 후 운영 UI·물리 기기는 미검증이다. [검증 범위](verification.md)를 따른다.

## 2026-11-03 로그인 만료 후 재인증·복귀 배포

로그인한 API/ZIP의 401을 모드별 재로그인과 원래 pathname/query/hash 복귀로
연결했다. 초안 checkpoint·revision/계정 격리·반복 이동 방지를 포함한다.
backend 260개·web 197개·실제 Edge 재인증 11개·기존 편집 13 checkpoint와
host/Linux image build·favicon이 통과했다. [기획 19](../planning/19-session-expiry-and-return.md),
[검증 범위](verification.md)를 따른다.

- source hash: `0ad513fbaadbd676f3e7b2dd3d4dc397ddf23e092b1c271ed34872d5a7611cf7`
- archive SHA-256: `8add16a02d70ac45278a09e9bbcc4c72bb4e061cb539bcbc9363f95cd88dc731`
- image: `pydemia-projects:0ad513fbaadbd676` · Linux amd64
- image tar SHA-256: `f32efe6f30495c443d4ebf6df23ba29a468d1f54abf709c391e3412629c745e5`
- previous image: `pydemia-projects:e98b178e00b49c17`
- release/backup: `/home/pydemia/.local/share/projects-releases/20261103-reauth-0ad513fbaadbd676/backup-20261103T070500Z`

204개 allowlist 파일을 immutable archive에서 빌드하고 전송 hash·image label·
기존 서버 source manifest·신규 파일 충돌을 확인했다. backend 변경은 성공
Session DTO의 auth_mode 추가이며 DB migration·의존성·compose/Caddy·인증 정책은
동일하다. private 0700/0600 백업과 PostgreSQL custom dump·pg_restore list 검증 후,
앱 중지 중 schema `0009` migration 전후 업무 테이블 fingerprint가 같음을 확인했다.

전환 후 app/DB healthy, proxy/edge running이다. 프로젝트 6개·항목 28개·revision
42개·보기 3개·QA 4개 프로젝트/24개 태스크를 보존했다. 실제 HTML/JS/CSS/favicon
bytes·Content-Type을 image와 대조하고 새 reauthentication marker·CSS를 확인했다.
공개 session은 401, 로그인 페이지는 200, 시작은 Microsoft 302/계정 선택이며
direct rd와 URL 검색/hash를 감싼 wrapper rd의 보존을 합성 운영 요청으로 검사했다.
OAuth state/cookie/token 원문은 기록하지 않았다.

rollback은 직전 `e98b178e00b49c17` 이미지·source로 가능하다. 실패 시 추가 파일은
현재 배포 hash와 root 내부 경로를 확인한 경우만 제거하며 DB 복원/downgrade는
하지 않는다. 실제 Microsoft 로그인 완료·인증 후 운영 UI·물리 기기는 미검증이다.

## 2026-11-03 모바일 프로젝트 메뉴 포커스 보완 배포

아래 기능 배포의 마지막 모바일 프로젝트 선택창 검사에서 중첩 메뉴가
Dialog 밖으로 portal되어 바로 닫히는 것을 확인했다. `ProjectActions.tsx`의
메뉴와 이름 편집을 해당 Dialog 내부 portal에 연결했다. 실제 앱/격리 DB에서
수정 전 실패와 수정 후 메뉴·입력 포커스·패널/저장 버튼의 화면 경계·이름 저장을
확인했고 inline 13 checkpoint·웹 142개·host/image build/favicon이 통과했다.

- 최종 source hash: `e98b178e00b49c17f7c5e1652921fb3b20293c62c3e9e55bd03e34be1cb67d25`
- archive SHA-256: `5dc4ef1cd5c6143488287f3098d5d827587833a50151b62a0027037957db8a96`
- image: `pydemia-projects:e98b178e00b49c17` · Linux amd64
- image tar SHA-256: `d60d3d101b6f055fc814ca645697e567a782a271ac92a803822632eb039710e1`
- previous image: `pydemia-projects:116796745adb1838`
- release/backup: `/home/pydemia/.local/share/projects-releases/20261103-project-menu-e98b178e00b49c17/backup-20261103T063009Z`

직전 194개 source manifest와 비교해 달라진 파일은 `ProjectActions.tsx` 하나다.
backend·migration·의존성·서버 설정은 동일하며 schema `0009`를 유지한다.
서버 기존 source·전송 hash·image label·DB dump/비공개 백업을 확인하고,
앱 중지 중 업무 fingerprint 일치 후 전환했다. app/DB healthy, Proxy/edge running,
프로젝트 6개·항목 28개·revision 42개와 QA 4개 프로젝트·24개 태스크가 보존됐다.
HTML·JS·CSS·favicon 실제 bytes/Content-Type과 공개 인증 401/200/302도 확인했다.
rollback은 직전 `116796…` 이미지·소스로 가능하며 DB 복원/downgrade는 하지 않는다.
인증 후 운영 UI·물리 기기는 미검증이다.

## 2026-11-03 직접 편집·환경설정·프로젝트 ZIP 메뉴 운영 배포

프로젝트명·작업 제목/본문/속성/유형의 직접 편집, 사용자 설정 화면과 테마
이동, 좁은 GNB·입력/검색 여백, 프로젝트 항목의 이름 수정/ZIP을 배포했다.
backend 253개·web 142개·실제 Edge+격리 PostgreSQL의 편집/충돌/설정/ZIP·
기존 discovery/drag/이동 회귀, host/image build·favicon 검사를 통과했다.
[기획](../planning/18-inline-editing-and-preferences.md)과 [검증](verification.md)을 따른다.

- source hash: `116796745adb1838119178cb94988b210b4b20338020fdf24a102d67f445a7f8`
- archive SHA-256: `db23dc74591982c070173a603b28ab1897d5cab77c60fe9e00a74eeffef46104`
- image: `pydemia-projects:116796745adb1838` · Linux amd64
- image tar SHA-256: `3977854d2345e79849f063c89d2d936654cd96acaa168daf0c10db71998f2ca2`
- previous image: `pydemia-projects:c7d87d5d997943c7`
- release/backup: `/home/pydemia/.local/share/projects-releases/20261103-inline-preferences-116796745adb1838/backup-20261103T061944Z`

194개 allowlist source 중 직전 대비 36개가 다르다. backend 변경은 api/
schemas/records뿐이며 migration·의존성·서버 배포 설정은 같고 schema `0009`를
유지한다. archive/image 전송 hash·image label·추출 파일을 확인했다. 서버
소스를 직전 release manifest와 모두 대조하고 새 파일이 사용자 미추적 파일을
덮어쓰지 않는지 검사했다. 앱 중지 중 PostgreSQL custom dump를 만들고
`pg_restore --list`로 검사했으며 소스·상태·비밀 설정은 서버의 비공개
0700/0600 백업에 보관했다. 무변경 migration 전후 업무 테이블 fingerprint가
일치한 뒤 앱을 시작했다.

전환 후 app/DB healthy, Proxy/edge running, 프로젝트 6개·항목 28개·revision
42개·보기 3개, QA 프로젝트 4개·태스크 24개가 보존됐다. 새 project PATCH·
task-type PATCH 경로, HTML·JS·CSS·favicon 실제 bytes/Content-Type과 이미지
일치를 확인했다. 공개 API는 401, 로그인 화면 200, Microsoft 시작은 302/
계정 선택이다. 공개 OAuth URL·cookie·비밀값을 로그나 문서에 남기지 않는다.
인증 후 운영 UI와 물리 기기는 직접 재검증하지 않았다. Git commit/push는 하지 않았다.

rollback은 이전 `c7d…` 이미지·소스·서버 설정으로 전환하며 DB downgrade나
업무 데이터 복원은 필요 없다. 새 필드/유형도 기존 schema와 payload 형식이므로
데이터를 지우지 않는다. 새로 추가된 source는 알려진 hash와 root 내부 경로를
확인한 파일만 제거하고 이전 source archive를 복원하는 failure 경로를 준비했다.
사용자가 저장한 최신 업무 데이터를 배포 전 dump로 덮어쓰지 않는다.

## 2026-11-02 개요 가독성·테스트 지표 조건 운영 배포

개요의 범위 제목/프로필 간격과 모바일 줄바꿈을 복구하고, 등록된 테스트
케이스가 없는 프로젝트에서는 테스트 지표·테스트를 전제한 안내문을 숨겼다.
간편/표준 프로필을 개발 여부로 취급하지 않으며 테스트가 있는 경우 기존
집계는 유지한다. 웹 113개·실제 React+격리 PostgreSQL의 수정 전 실패/후 통과,
320~430px 양 테마·host/image build와 favicon 검사를 확인했다.

- source hash: `c7d87d5d997943c7f352fa86674139c5754c140555a6654e9706ced3b8a8853e`
- archive SHA-256: `6b442b83ce8a06b2193e9c232f245c36c8852f05d50469316d7c6820a4423e1e`
- image: `pydemia-projects:c7d87d5d997943c7` · Linux amd64
- image tar SHA-256: `b7a3a1dc81e333f05e9ed0ec2a87375540e0eb9cdf132a72c6ec89dbf068a81b`
- previous image: `pydemia-projects:a42a5228487807a8`
- release/backup: `/home/pydemia/.local/share/projects-releases/20261102-overview-c7d87d5d997943c7/backup-20261102T123051Z`

180개 allowlist source manifest를 직전 운영과 비교했고 변경은
`ProjectPages.tsx`·`app.css`·`workspace-refresh.css`뿐이다. backend·migration·
의존성은 동일하다. 전송 archive/image hash·image label·추출 파일을 확인하고,
서버 전용 비공개 디렉터리에 DB dump·소스·상태·설정을 백업했다. dump는
`pg_restore --list`로 검사했다. 앱 중지 중 무변경 migration과 업무 테이블
fingerprint 일치를 확인했다. schema는 `0009`이며 DB downgrade는 필요 없다.
rollback은 `a42a…` 이미지·소스·기존 서버 설정으로 수행한다.

전환 후 app/DB healthy, Proxy/edge running, 프로젝트 6개·항목 28개·revision
42개와 QA 4개 프로젝트·24개 태스크가 유지됐다. 내부 HTTP의 HTML·JS·CSS·
favicon bytes/Content-Type이 이미지와 일치하고 새 CSS 선택자를 확인했다.
공개 API 401·로그인 200·Microsoft 시작 302/계정 선택도 유지했다.
인증 후 운영 UI·물리 기기는 직접 재검증하지 않았다. Git commit/push는 하지 않았다.
[로컬 행동 검사와 화면](verification.md)을 따른다.

## 2026-11-02 작업 필드·이름 있는 보기 운영 배포

제목만 입력하는 빠른 생성, 행 내 속성 편집, 열/카드 필드 관리, 다섯 타입
사용자 필드, 이름 있는 개인 보기의 생성·이름 변경·복제·기본·명시 갱신·삭제를
배포했다. [기획 17](../planning/17-clickup-task-management.md)과
[검증 기록](verification.md)의 backend 236개·web 113개, 실제 Edge+격리 DB
시나리오·host/image build·favicon 검사를 통과했다. Git commit/push는 하지 않았다.

최종 운영 이미지:

- source hash: `a42a5228487807a84f51a6d11729d2e07acb5dabae989579c29ed8cfc1bd1835`
- archive SHA-256: `14fe0faefede5fb4f6c41dbd774a3ddc0a30c21be14ddc05ec2684b89e31f5b5`
- image: `pydemia-projects:a42a5228487807a8` · Linux amd64
- image tar SHA-256: `2fa3dc6e37caa6b02468f5ed6fb0936e5b4fda797c944feaf92747561e2aaf38`
- release/backup: `/home/pydemia/.local/share/projects-releases/20261102-field-chooser-a42a5228487807a8/backup-20261102T072836Z`
- previous image: `pydemia-projects:67a495521633c916`

먼저 기능 전체를 source
`67a495521633c916a9b4198bebbb81fc0a4a20ebb559d2160d2afa67a521094a`로
배포했다. archive SHA-256은
`b7e3d638d71452ebf0b17d8f4979f77347541750a04558698755ef9d0e3ad8b2`,
image tar SHA-256은
`57cef0317b4abc3692a348e677cba55f4a2b0eb98b05f673cc926244fdaf6779`다.
이 단계의 이전 이미지는 `4d90b4687f43c7ca`이며 비공개 백업은
`/home/pydemia/.local/share/projects-releases/20261102-clickup-management-67a495521633c916/backup-20261102T071913Z`다.
앱을 중지한 상태에서 migration `0008→0009`를 별도 실행하고 기존 업무
테이블별 건수/hash가 전부 같은지 확인한 뒤 앱을 시작했다. 유일한 새 테이블은
빈 `task_field_definitions`다. 기존 revision이나 task payload를 재작성하지 않았다.

마지막 화면 점검에서 새 필드 선택창의 흰 체크 배경과 높이를 발견해 수정했다.
최종 `a42a…`와 `67a…`의 180개 allowlist 파일을 비교했으며 달라진 것은
`web/src/task-fields.css` 하나다. 체크 20px·색 대비와 선택창 높이를 실제
브라우저에서 재검사했다. 백엔드와 schema는 그대로이며 무변경 migration과
업무 fingerprint 일치를 앱 중지 중 확인하고 최종 이미지를 시작했다.
두 단계 모두 archive/image 전송 hash·image label·실제 추출 파일을 검사하고,
전환 전에 PostgreSQL custom dump를 `pg_restore --list`로 확인했다.
소스·상태·비밀 설정 백업은 서버의 권한 0700/0600 디렉터리에만 둔다.

최종 app/DB healthy, Proxy/edge running, Alembic `0009`다. 프로젝트 6개·
항목 28개·revision 42개·보기 3개, QA 프로젝트 4개·태스크 24개가 보존됐다.
실사용자 필드나 가짜 실행 결과를 운영 QA 명목으로 추가하지 않았다.
내부 HTTP의 HTML·JS·CSS·favicon bytes/Content-Type이 이미지 파일과 일치했다.
새 OpenAPI 경로와 공개 `/api/session` 401·로그인 200·Microsoft 시작 302 및
`prompt=select_account`를 확인했다. 인증 후 운영 UI·물리 기기는 미검증이다.

최종 CSS release의 rollback은 `67a…` 이미지·소스와 기존 서버 설정으로
가능하며 DB를 되돌릴 필요가 없다. `0009→0008` downgrade는 필드 정의가
하나라도 있으면 손실 방지를 위해 거부한다. 필드를 사용한 뒤에는 `4d90…`로
단순 전환하거나 DB dump를 덮어쓰지 말고 `0009`를 유지하는 수정 이미지를
배포한다. 운영 사용자 변경을 배포 전 백업으로 덮어쓰지 않는다.

## 2026-11-02 목록 체크박스·상태 선택 운영 배포

개인 작업의 완료 체크와 일괄 선택은 20px 표시·44px 터치 영역으로 분리했다.
구현 작업은 현재 상태 드롭다운을 제공하며 revision·완료 gate·취소 사유를
기존 API로 검사한다. 간단 모드에서는 과거 일괄 선택이 완료 조작을 숨기지
않는다. 웹 86개, 실제 Edge+격리 DB의 체크/상태 저장·취소·새로고침과 기존
브라우저 회귀, 이미지 build·favicon 검사가 통과했다.

- source hash: `4d90b4687f43c7ca3cc0c9ae0304105501519dbc019e4e6ca437a2a7d4d670a3`
- archive SHA-256: `6bfb8ffa925ef44a2f7087109c75251b305d10282930739894b508eb2b8acdf8`
- image: `pydemia-projects:4d90b4687f43c7ca` · Linux amd64
- image tar SHA-256: `1f9c3b7c9f96c702364c9d2cd37d2931fe9788b898b77fc870a57187ef906524`
- previous image: `pydemia-projects:116f98b88de106e1`
- release/backup: `/home/pydemia/.local/share/projects-releases/20261102-list-controls-4d90b4687f43c7ca/backup-20261102T042225Z`

171개 allowlist 소스에서 바뀐 것은 웹 3개이며 backend·migration·서버 설정은
동일하다. archive/image hash·label과 DB dump `pg_restore --list`를 확인하고
이전 소스·상태·비밀 설정의 비공개 백업 후 앱을 전환했다. 전환 전후 업무
테이블 fingerprint가 같으며 프로젝트 6개·항목 28개와 QA 태스크 24개가
보존됐다. app/DB healthy, Proxy/edge running, schema 0008이다. 내부 HTTP의
HTML·JS·CSS·favicon bytes/Content-Type은 이미지와 일치했고 공개 인증
401/200/302·Microsoft 계정 선택도 유지했다. 인증 후 운영 UI·물리 기기는
직접 검증하지 않았다. Git commit/push는 수행하지 않았다.

## 2026-11-02 모바일 직접 선택·가로 칸반 운영 배포

모바일 기본 목록과 명시 보기 복원을 유지하며 네 보기·간단/상세를 헤더의
직접 선택기로 바꿨다. 다섯 상태 열을 좌우 스크롤하고 상태 버튼으로 바로
이동하며 최근 열과 선택 표시를 복원한다. 키보드용 하단 탐색 숨김 조건에서
radio/checkbox를 제외했다. 실제 Edge+격리 DB의 모바일 터치 재현과 기존 회귀,
웹 81개·이미지 안의 build/favicon 검사를 통과했다.

- source hash: `116f98b88de106e1d4bed0f54b43d78ecf8f03809ed1ec04360be7a57cdf18b8`
- archive SHA-256: `5bd9ede118222c5779b304d62647278fbc4bc2642a05e180557c95c8b5a1f545`
- image: `pydemia-projects:116f98b88de106e1` · Linux amd64
- image tar SHA-256: `762990a68b111c0953d170172c9461438bb50f36ee0398e13e0c778653ccb0a7`
- previous image: `pydemia-projects:628370ac40eb3022`
- release/backup: `/home/pydemia/.local/share/projects-releases/20261102-mobile-kanban-116f98b88de106e1/backup-20261102T022306Z`

170개 allowlist 소스 중 직전과 달라진 것은 웹 5개뿐이다. 전송 hash·이미지
label을 확인하고 기존 DB dump의 `pg_restore --list`·소스/상태/비밀 설정의
비공개 백업 후 앱을 전환했다. 전환 전후 업무 테이블 fingerprint가 같으며
프로젝트 6개·항목 28개, QA 프로젝트 4개·태스크 24개를 보존했다.
app/DB healthy, Proxy/edge running, schema 0008이다. 운영 내부 HTTP의
HTML·JS·CSS·favicon이 이미지 bytes/Content-Type과 일치했고 공개 인증의
401/200/302와 Microsoft 계정 선택을 확인했다. 인증 후 운영 UI·실제 물리
기기 조작은 미검증이다. Git commit/push는 수행하지 않았다.

## 2026-11-02 카드 본문 드래그 운영 배포

카드 제목·설명·여백에서도 드래그를 시작하도록 수정했다. 핸들은 유지하며
링크·버튼·체크박스·입력 영역의 조작은 드래그에서 제외한다. 웹 81개와
실제 Edge+격리 DB의 native drag·순서 저장/새로고침·undo·조작 충돌 회귀가
통과한 소스를 Linux amd64 이미지로 배포했다.

- source hash: `628370ac40eb3022cf1fd0b6f8e41537dc815ea41b8234452e1ca6ac5b8d00fb`
- archive SHA-256: `25350945c48a6f0209369d338fd653bb79f79b7554fab854a466007f17ebbf62`
- image: `pydemia-projects:628370ac40eb3022`
- image tar SHA-256: `42498cb5403b2f33cb67d0188954e40ab320507ed3a75eb564d78d680c418c15`
- previous image: `pydemia-projects:784c6c91d5d3ae05`
- release/backup: `/home/pydemia/.local/share/projects-releases/20261102-card-drag-628370ac40eb3022/backup-20261102T011545Z`

allowlist 170개 소스·archive/image 전송 hash·이미지 label을 검증했다.
DB dump의 `pg_restore --list`와 기존 소스/상태/설정의 비공개 백업을 확보하고
앱만 전환했다. 전환 전후 업무 테이블 fingerprint가 같으며 프로젝트 6개,
항목 28개, QA 프로젝트 4개·태스크 24개를 보존했다. app/DB healthy,
Proxy/edge running, schema 0008이다. 내부 HTTP HTML·JS·CSS·favicon은
이미지 bytes·Content-Type과 일치했고 공개 인증 진입 401/200/302와 Microsoft
계정 선택을 확인했다. 운영 로그인 후 drag는 미검증이며 로컬 실제 브라우저
검증과 구별한다. Git commit/push는 하지 않았다.

## 2026-11-02 보기 전환·프로젝트 선택 유지 수정 배포

목록·보드·캘린더·집계를 전역/프로젝트의 간단/상세 양쪽에서 제공한다.
프로젝트 선택은 메뉴·프로젝트 목록·모바일 하단 탐색·새로고침에서 유지하고,
계정별 마지막 접근 가능 프로젝트를 복원한다. `보기 모드 · 간단/상세`를
선택 상태가 분명한 컨트롤로 표시하며 legacy 저장 보기 응답도 읽는다.

| 산출물 | 검증 값 |
|---|---|
| source hash | `784c6c91d5d3ae05213f099262c1ac6f8677b31c1e9fda214f4501bf9d4adc74` |
| archive SHA-256 | `3cae13af1e33a2c2c1f4978b943d50a600d1bbed14ed13acbf397cad3659051e` |
| image | `pydemia-projects:784c6c91d5d3ae05` · Linux amd64 |
| image tar SHA-256 | `148de696f0fd2a6cb352aa5c1b9d20258a80129a6ec165ad8c9808079d1cfadc` |
| release | `/home/pydemia/.local/share/projects-releases/20261102-view-context-784c6c91d5d3ae05` |
| backup | 위 release의 `backup-20261102T002204Z` · DB custom dump/기존 소스·상태·설정 · 디렉터리 0700/파일 0600 |

allowlist archive 170개 소스와 이미지 label, 전송 전후 hash를 확인했다.
기존 `bfccaad354feddcf`와 비교해 웹 소스/검사 9개만 달라졌고 서버 설정·DB
코드는 동일하다. 앱을 중지하고 `pg_restore --list`로 읽을 수 있는 DB dump를
확보한 뒤 소스·`PROJECTS_IMAGE`만 전환했다. Compose production+onprem의
`--no-build --wait` 후 app/DB healthy, OAuth2 Proxy·edge running, schema 0008이다.
인증 정보를 제외한 업무 테이블의 전체 fingerprint가 전환 전후 동일하고
프로젝트 6개·항목 28개, QA 프로젝트 4개·태스크 24개를 확인했다.

운영 내부 HTTP의 HTML·JS·CSS·light/dark PNG·SVG/ICO가 이미지 build와
bytes/SHA-256·Content-Type까지 일치했다. 공개 HTTPS `/api/session`은 401,
`/oauth2/sign_in`은 200, `/oauth2/start`는 Microsoft로 302이며
`prompt=select_account`를 유지했다. 운영 로그인 후 실제 화면 조작은
미검증이며 로컬 실제 Edge+격리 DB의 사용자 흐름 검증과 구별한다.
이번 배포는 Git commit/push 없이 검증한 작업 트리의 source hash를 기준으로 했다.

## 2026-11-02 작업 탐색·보기 전환·이동 운영 배포

사용자 지시에 따라 P-02 검증본을 온프레미스 서버에 배포하고 QA 프로젝트
4개·태스크 24개를 생성했다. [QA 링크·확인 순서](task-workspace-v2-qa.md)를
따른다. 기존 프로젝트·태스크는 생성 전후 동일하다.

- source hash: `bfccaad354feddcfd4a8bde5c8d1dae4f26269998e5e21e8f165f7e0b7d7b32b`
- source archive SHA-256: `7df1cd906323b965d69779f07c90a3c83c590cc4a32ca77237298418f774ebb3`
- image: `pydemia-projects:bfccaad354feddcf`
- image tar SHA-256: `7bdafcf0c87c7f4875aa1278dd62ee30694eafc311e98b9231a46e5b9f225dcd`
- previous image: `pydemia-projects:38e1a05d4237bc0b`
- private backup: `/home/pydemia/.local/share/projects-releases/20261102-task-workspace-bfccaad354feddcf/backup-20261101T233044Z`

이전 서버 빌드 중단 이력에 따라 개발 PC에서 allowlist 168개 파일과 해시를
검사한 Linux amd64 이미지를 빌드했다. 전송 전후 image/source hash가
일치했다. 앱을 중지한 쓰기 경계에서 PostgreSQL custom dump를 생성해
`pg_restore --list` 검사를 통과했고 이전 소스·state·비밀 설정을 서버 전용
0700/0600 백업에 보존했다. Compose·Caddy hash가 새 소스와 동일했으며
Tunnel·Entra 설정은 변경하지 않았다.

`up -d --no-build --wait` 후 앱·DB healthy, Proxy·edge 실행, Alembic `0008`,
새 API·favicon 응답 bytes/Content-Type을 확인했다. 공개 HTTPS API 401,
로그인 200, Microsoft 시작 302와 계정 선택 설정도 유지됐다. 운영 DB에서
QA 건수·지난 계획·완료 차단·이동 이력·시드의 중복 방지를 확인했다.

검증한 작업 트리 source hash를 배포했으며 Git commit/push는 수행하지 않았다.
인증된 운영 UI는 브라우저 제어 환경 오류로 미확인이다. 실제 Hub/LLM 호출,
Note 본문/위임·물리 기기 QA를 이번 배포의 통과 근거로 계산하지 않는다.

2026-10-26 현재 `projects.pydemia.ai`는 온프레미스 `pydemia-server`의
Cloudflare Tunnel로 제공합니다. 이 문서의 2026-10-21~25 기록은 이전
`codex-devbox` 운영 이력입니다. 새 구성·백업·복구와 검증 범위는
[온프레미스 이관 기록](onprem-migration.md)에 있습니다.

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

## 2026-10-25 Git 소스 가져오기·모바일 모달 운영 배포

GitHub URL·Git 소스 ZIP 가져오기와 모바일 모달 보완을 포함한
`d65b4ca1c577745ed60505c12b348806389b419a`의 GitHub Actions
`checks`가 backend·web 모두 성공했다. 작업 트리는 깨끗했고 allowlist
배포 archive의 149개 파일을 해당 HEAD의 Git blob과 대조했다. source hash는
`9041e44edb611919737158ce99a3cf4d850300c666346faeb36e4028a3ff1519`,
archive SHA-256은
`56aec70958ca28face2071ab12c6fa0cd02a7fb1a1d3b7ac614f830ff834149b`다.

서버의 분리된 release 디렉터리에서 archive hash를 다시 확인하고
`pydemia-projects:9041e44edb611919` 이미지를 빌드했다. 전환 전에
PostgreSQL custom dump를 생성해 `pg_restore --list`로 읽을 수 있음을
확인하고, `state/`·`.secrets/`·Compose 설정과 기존 배포 소스를
`/home/pydemia/.local/share/projects-backups/20261024T201857Z`에 백업했다.
백업 파일은 서버의 비공개 디렉터리에만 둔다.

전환 후 app·DB가 healthy이고 OAuth2 Proxy가 실행 중이며 Alembic은
`0006`이다. 앱 내부 `/health`와 HTML·JS·CSS·favicon 응답이 이미지의
빌드 파일과 바이트 단위로 일치한다. 배포 CSS에 모바일 dialog 규칙이,
앱 OpenAPI에 Git URL·Git ZIP의 미리보기/생성 네 경로가 있는지 확인했다.
favicon SHA-256은
`210e38b2f2f4dace4d0bf32f76dc54c17c8b335a5a056868aebf4795ae8eae33`다.
공개 HTTPS에서 비로그인 `/api/session`은 401, `/oauth2/sign_in`은
로그인 화면 200, `/oauth2/start`는 Microsoft 단일 테넌트로 302이며
`prompt=select_account`가 유지됐다. Edge에서 로그인 화면과 계정 선택까지
열었고, 계정 로그인은 Microsoft Authenticator 승인 대기 중이다. 따라서
인증 후 실제 화면 조작과 물리 기기의 OS 키보드·안전 영역은 아직 검증하지 않았다.

## 2026-10-25 모바일 모달 위치 재수정 배포

물리 기기 사진에서 확인된 프로젝트 생성 모달의 가로 이탈에 대응해
`2d37f3d`를 배포했다. 운영 source hash는
`6e96df4f91428268367a8091a99af12ae7cce95999b11844376867c5ff192824`,
archive SHA-256은
`39db63f8aa3f69a0be54575d4cbc2f1c5fe0795daffad8d0f36bd613c35918e4`다.
허용된 149개 파일을 Git HEAD blob과 대조하고 서버에서 archive hash를
다시 확인했다. 분리된 release 디렉터리에서
`pydemia-projects:6e96df4f91428268` 이미지를 빌드했다.

전환 전에 PostgreSQL custom dump를 `pg_restore --list`로 검사하고,
`state/`·`.secrets/`·Compose 설정·기존 배포 소스를 서버 전용
`/home/pydemia/.local/share/projects-backups/20261024T205533Z`에 저장했다.
전환 후 앱과 DB가 healthy, OAuth2 Proxy가 실행 중이며 Alembic은 `0006`이다.
앱 내부 `/health`·HTML·JS·CSS·favicon 응답은 새 이미지의 빌드 파일과
바이트 단위로 일치했다. 공개 HTTPS의 미인증 API는 401, 로그인 화면은
200, Microsoft 인증 시작은 302 및 `prompt=select_account`다.
인증된 운영 모바일 화면과 물리 기기 safe area·OS 키보드는 이 배포에서
직접 검증하지 못했다. 로컬 모바일 브라우저 검사는
[별도 기록](verification.md#2026-10-25-모바일-모달-재점검)에 있다.

## 2026-10-27 프로젝트 순서 변경 운영 배포

`38e1a05d4237bc0baf2e5e25d838e051220d2f83`의 backend·web·GitGuardian
GitHub 검사가 통과했다. 이 커밋의 archive SHA-256은
`68f6eeee9b2851c7b7a37b4e5f5e2b499cfb36247e8a1ca2ce7e7cfec5df7d11`이다.
처음 서버에서 이미지를 빌드하던 중 호스트가 네트워크에서 사라졌다. 서비스
전환 전 단계였고, 복구 후 기존 앱·DB가 healthy이고 Alembic `0006`, 프로젝트
2건임을 확인했다. 종료 직전 커널 로그에 OOM·panic 근거는 확인되지 않아
중단 원인은 확정하지 않았다.

서버 재빌드를 반복하지 않고 검증된 소스로 개발 PC에서 만든
`pydemia-projects:38e1a05d4237bc0b` Linux amd64 이미지를 전송했다.
이미지 tar의 전송 전후 SHA-256은
`ef7a6a57db3dd5e1ab6d6ee919aa8307ae9fb32e56a520bfebbaf154dbe2cd3a`로
일치한다. 전환 직전 PostgreSQL custom dump를 생성해 `pg_restore -l`로
읽을 수 있음을 확인하고, 기존 소스를 백업했다. 백업 경로는 서버의
`/home/pydemia/.local/share/projects-releases/38e1a05d4237bc0b/`이며
`.secrets/`와 `state/`는 원래 위치에 보존했다. 인증 파일·설정 권한 0600과
사용자 데이터 디렉터리 권한 0700을 유지했다.

Compose를 `--no-build --wait`로 전환한 뒤 앱·DB·OAuth2 Proxy·edge가
healthy이고 Alembic `0007`, 프로젝트 2건, `sort_order` 컬럼을 확인했다.
공개 로그인 페이지는 HTTPS 200으로 열렸다. 기존 Entra 로그인 상태인 실제
Edge에서 새 세로 프로젝트 목록과 첫 프로젝트 자동 선택을 확인했다.
드래그로 두 프로젝트 순서를 바꾼 뒤 새로고침 후에도 유지됨을 확인하고,
위로 이동 버튼으로 원래 순서를 복원해 다시 새로고침했다. 물리 기기의
터치 드래그는 이번 검사에 포함하지 않았다.
