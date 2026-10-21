# pydemia UI 편입·테마·favicon

2026-10-21. Projects는 [ui.pydemia.ai](https://ui.pydemia.ai/)의 source-owned registry를 사용한다. `@pydemia/ui`는 해당 저장소의 private workspace 패키지이므로 공개 npm 의존성으로 선언하지 않았다. [pydemia/ui 소스](https://github.com/pydemia/ui/tree/eed2173e54bc82478dc9781ec4c0e67b0a480f54)를 고정해 필요한 파일만 `web/src/pydemia-ui/`에 편입했다.

| 원본 항목 | 현재 적용 위치 | 역할 |
|---|---|---|
| `pyd-button`, `pyd-input`, `pyd-textarea`, `pyd-label` | `App.tsx`, `ui.tsx` | 로그인·프로젝트 생성·공통 필드·오류 재시도·대화상자 닫기 |
| `pyd-page-header`, `pyd-badge`, `pyd-alert`, `pyd-empty` | `ui.tsx` 공통 adapter | 페이지 제목, 상태, 실패, 빈 목록 |
| `pyd-app-shell`, `pyd-navigation`, `pyd-native-select` | `App.tsx`, `theme.tsx` | 작업공간 외곽·탐색·프로젝트/테마 선택 |
| `pyd-segmented-control`, `pyd-tabs`, `pyd-search-input` | `TaskWorkspace.tsx` | 간편/정교 전환, 작업 보기, 검색 |
| `pyd-card`, `pyd-metric-card`, `pyd-bar-list` | `TaskWorkspace.tsx`, `ProjectPages.tsx` | 빠른 입력·상세·개요·작업 집계 |
| `pyd-field`, `pyd-dialog` | `ui.tsx` | 공통 필드와 신규/복원/영향 판단 Dialog |
| `pyd-checkbox`, `pyd-native-select` | `ItemFields.tsx`, `RunsPage.tsx`, `TaskWorkspace.tsx`, `Relations.tsx`, `ProjectPages.tsx` | 완료·보드 상태·근거/결과 선택·관계/영향 입력 |
| `pyd-card`, `pyd-navigation`, `pyd-search-input`, `pyd-tabs` | `ItemsPage.tsx`, `RunsPage.tsx`, `App.tsx` | 프로젝트 카드, 기획/문서/테스트/스킬 이력의 공통 목록→상세·검색·탭 |
| `pyd-table`, `pyd-segmented-control`, `pyd-accordion`, `pyd-data-list` | `ProjectPages.tsx`, `TaskWorkspace.tsx`, `ItemsPage.tsx` | 추적 연결표/필터/기준선, 간편 GTD/ABC 옵션, 속성 |
| `pyd-tokens`, `pyd-design-modes`, `ThemeScope` | `pydemia.css`, `theme.tsx` | 공통 semantic token, 디자인 모드·appearance·portal 스타일 |
| 승인 pydemia 엠블럼 | `web/public/favicon.svg`, `web/index.html`, `App.tsx` | 브라우저 favicon과 작업공간 브랜드 표식 |

React 19와 Vite 8을 유지하고 Tailwind CSS 4/Vite plugin, `class-variance-authority`, `clsx`, `tailwind-merge`를 사용한다. registry 의존성인 `@radix-ui/react-tabs@1.1.21`, `@radix-ui/react-dialog@1.1.23`, `@radix-ui/react-checkbox@1.3.11`, `@radix-ui/react-accordion@1.2.20`, `lucide-react@0.468.0`도 설치했다. 초기의 기본 요소 교체는 사용자 요구에 불충분했다. [전면 개편 계획](ui-ux-overhaul.md)에 따라 화면 구조와 업무 조작까지 공통 source로 재구성한다. `workspace-refresh.css`는 제품 배치·밀도와 semantic token 연결에 사용한다. Projects는 URL/API·업무 상태·완료 gate를, Note 이관 전까지 임시 Markdown 본문만 소유한다.

추가 항목은 2026-10-21에 `https://ui.pydemia.ai/r/pyd-<item>.json`에서 받은 source이며, 당시 [원본 저장소 HEAD](https://github.com/pydemia/ui/tree/eed2173e54bc82478dc9781ec4c0e67b0a480f54)는 기존 편입 revision과 같았다. 설치한 로컬 source SHA-256은 `app-shell.tsx` `ec9a476527bf338d4b162c29c3872449a1ee5ff85d4162c22e8a110a5ba27c30`, `navigation.tsx` `b2ad196078c044221434b4345e747576ab0be9fe88b370d616dc75c442398e71`, `segmented-control.tsx` `52ffa1851cd9a52ff0ee24ab256ebd3f498f870faacebb483d39ee876a0a13d8`, `tabs.tsx` `c9563105b08f71ca697cff2ae2db7c7598142fdca380857cb4836470887b3aa9`, `card.tsx` `34b4553126fac83311c7fc227d4d4d83919be5824bb03f2faf07e3173dd01cb8`, `metric-card.tsx` `d8aed951fdf725b5df8019a4532d7b7270ee7ee60a7b3c47a3d81252045af432`, `bar-list.tsx` `ac5dcbe002f473c101bcd9e82865cdb22883478ae899279e9c7c102d29942169`, `search-input.tsx` `ac60181dfe58a32f400d2fbf701f3a8a993d016441e1a1c2a6e50a2a2fcaf518`, `native-select.tsx` `ff0af44ff5ee406b17dcaef390b571cd90b9516c04fd17debd3655930b310220`이다. 라이선스·접근성 상태는 같은 revision의 [provenance](https://github.com/pydemia/ui/blob/eed2173e54bc82478dc9781ec4c0e67b0a480f54/registry/provenance.json)와 [third-party notices](https://github.com/pydemia/ui/blob/eed2173e54bc82478dc9781ec4c0e67b0a480f54/THIRD_PARTY_NOTICES.md)를 따른다. 컴포넌트 카탈로그의 prototype/수동 접근성 검수 대기 상태를 제품의 접근성 통과로 해석하지 않는다.

전면 개편에 더한 registry source SHA-256은 `field.tsx` `7a68ca173e8de316f5dcd525cde0b7d489e9712c03b9afb7c49bb462b001f5ab`, `dialog.tsx` `66c0d4cf3623f8579e7ba981077a40072174d43981d4cea8860cad1da1f4df72`, `checkbox.tsx` `626edfd24f3b2864f03ff75b5cc5682ffcf3b9ab46990d192caaed6bcda47106`, `table.tsx` `658ab64dd8d544ddefa4db74178adb2cf0d998dfe4bd51a7523f86808d828a96`, `data-list.tsx` `65b825ae60e475aacefdce2a7894b90247a735bd8f88fbe34d17e69bb23120be`, `accordion.tsx` `cf3077dcffa4d70ab36f451a9bf17e9847b3525e81d259121ca2960af401c842`이다. Radix 기반 `dialog`, `checkbox`, `accordion`의 상위 출처/라이선스 고지는 기존 `web/src/pydemia-ui/SHADCN_UI_LICENSE.md`에 보존한다.

`releasedDesignModes`의 21개 모드만 선택 UI에 표시한다. 기본값은 Basic/light이며 브라우저 `localStorage`에 설정을 저장한다. light/dark는 독립 설정이고 dark 전용 모드로 변경하면 원본 resolver 규칙대로 dark가 된다. 잘못된 저장값은 Basic으로 복구한다. 사용자 설정은 로컬 브라우저에만 적용되며 DB, 문서 본문, 프로젝트 ZIP에 들어가지 않는다. 모드별 폰트 파일은 원본 저장소의 OFL 고지와 함께 `web/public/fonts/design/`으로 복사해 운영 CSP에서 외부 폰트 호스트를 요구하지 않는다.

소스 고정 근거: `pyd-button` SHA-256 `30b018d552d8a6faf62aa43609da3eec2711790d409f39e063e289734783df48`; `design-modes.ts` `d7da1cd02fe3f08fe73d60a703324c9398a473e24b466dfc4097a2a9fe9c7504`; `tokens.css` `03df6a02139a0270df57059fd6ac59eaea27d977bd1de3f41531cd71e44004bf`; `design-modes.css` `184adcb78bad817d4e881ebca64164d3c487c9483a45fe6d4bf7dd81d10539ce`. 원본과 다른 곳은 TypeScript 7의 `noUncheckedIndexedAccess`에 맞춘 tuple 추론(`design-mode-settings.ts`)과 자체 호스팅 폰트 URL(`design-fonts.css`)이다. 원본 [provenance](https://github.com/pydemia/ui/blob/eed2173e54bc82478dc9781ec4c0e67b0a480f54/registry/provenance.json)의 shadcn/ui 수정 항목 고지는 `web/src/pydemia-ui/SHADCN_UI_LICENSE.md`에, 폰트 고지는 `web/public/fonts/design/notices.txt`에 보존했다. 원본 목록의 screen-reader 수동 검수 대기 항목을 Projects 검수 완료로 해석하지 않는다.

favicon은 승인된 [pydemia 엠블럼](https://github.com/pydemia/agent-skills/blob/main/library/templates/logo-design/assets/pydemia/logo-colorful.svg)과 `p-module` path를 바이트 단위로 동일하게 유지하고, 64px SVG 파생본에서 dark 탭의 navy 부분만 승인된 반전 색 `#EEF3F5`로 바꾼다. `web/index.html`의 `rel="icon"`은 `/favicon.svg`를 가리킨다. source SHA-256은 `210e38b2f2f4dace4d0bf32f76dc54c17c8b335a5a056868aebf4795ae8eae33`이다. 설치형 앱 범위가 없어 manifest/apple-touch 아이콘은 만들지 않았다. `npm run build`는 `web/scripts/verify-favicon.cjs`로 최종 HTML 링크와 빌드 자산의 실제 bytes 일치를 검사하고 배포 패키지에도 해당 스크립트를 넣는다. 배포 완료 판정은 운영 HTTPS 응답의 Content-Type/hash와 브라우저 탭 표시를 확인한 후 기록한다.

검증은 `npm --prefix web run check`와 `npm --prefix web run build`를 사용한다. 브라우저에서는 로그인 전후의 주요 화면, 모드·테마 전환과 재방문, 모바일 폭 및 키보드 조작을 확인한다. 테스트·로컬 브라우저·운영 브라우저의 수행 여부는 [검증 기록](verification.md)에 각각 남긴다.
