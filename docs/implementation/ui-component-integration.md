# pydemia UI 편입·테마·favicon

2026-10-21. Projects는 [ui.pydemia.ai](https://ui.pydemia.ai/)의 source-owned registry를 사용한다. `@pydemia/ui`는 해당 저장소의 private workspace 패키지이므로 공개 npm 의존성으로 선언하지 않았다. [pydemia/ui 소스](https://github.com/pydemia/ui/tree/eed2173e54bc82478dc9781ec4c0e67b0a480f54)를 고정해 필요한 파일만 `web/src/pydemia-ui/`에 편입했다.

| 원본 항목 | 현재 적용 위치 | 역할 |
|---|---|---|
| `pyd-button`, `pyd-input`, `pyd-textarea`, `pyd-label` | `App.tsx`, `ui.tsx` | 로그인·프로젝트 생성·공통 필드·오류 재시도·대화상자 닫기 |
| `pyd-page-header`, `pyd-badge`, `pyd-alert`, `pyd-empty` | `ui.tsx` 공통 adapter | 페이지 제목, 상태, 실패, 빈 목록 |
| `pyd-tokens`, `pyd-design-modes`, `ThemeScope` | `pydemia.css`, `theme.tsx` | 공통 semantic token, 디자인 모드·appearance·portal 스타일 |
| 승인 pydemia 엠블럼 | `web/public/favicon.svg`, `web/index.html`, `App.tsx` | 브라우저 favicon과 작업공간 브랜드 표식 |

React 19와 Vite 8을 유지하고 Tailwind CSS 4/Vite plugin 및 선택한 컴포넌트의 `class-variance-authority`, `clsx`, `tailwind-merge`만 추가했다. 기존 업무 화면의 구조·고유 컨트롤은 Projects 코드에 남겼다. `theme-overrides.css`는 기존 색 상수를 `--background`, `--surface`, `--foreground`, `--border`, `--accent` 등 공통 의미 토큰에 대응시킨다. 따라서 모든 업무별 컨트롤이 독립 pydemia UI 컴포넌트로 대체된 상태는 아니다.

`releasedDesignModes`의 21개 모드만 선택 UI에 표시한다. 기본값은 Basic/light이며 브라우저 `localStorage`에 설정을 저장한다. light/dark는 독립 설정이고 dark 전용 모드로 변경하면 원본 resolver 규칙대로 dark가 된다. 잘못된 저장값은 Basic으로 복구한다. 사용자 설정은 로컬 브라우저에만 적용되며 DB, 문서 본문, 프로젝트 ZIP에 들어가지 않는다. 모드별 폰트 파일은 원본 저장소의 OFL 고지와 함께 `web/public/fonts/design/`으로 복사해 운영 CSP에서 외부 폰트 호스트를 요구하지 않는다.

소스 고정 근거: `pyd-button` SHA-256 `30b018d552d8a6faf62aa43609da3eec2711790d409f39e063e289734783df48`; `design-modes.ts` `d7da1cd02fe3f08fe73d60a703324c9398a473e24b466dfc4097a2a9fe9c7504`; `tokens.css` `03df6a02139a0270df57059fd6ac59eaea27d977bd1de3f41531cd71e44004bf`; `design-modes.css` `184adcb78bad817d4e881ebca64164d3c487c9483a45fe6d4bf7dd81d10539ce`. 원본과 다른 곳은 TypeScript 7의 `noUncheckedIndexedAccess`에 맞춘 tuple 추론(`design-mode-settings.ts`)과 자체 호스팅 폰트 URL(`design-fonts.css`)이다. 원본 [provenance](https://github.com/pydemia/ui/blob/eed2173e54bc82478dc9781ec4c0e67b0a480f54/registry/provenance.json)의 shadcn/ui 수정 항목 고지는 `web/src/pydemia-ui/SHADCN_UI_LICENSE.md`에, 폰트 고지는 `web/public/fonts/design/notices.txt`에 보존했다. 원본 목록의 screen-reader 수동 검수 대기 항목을 Projects 검수 완료로 해석하지 않는다.

favicon은 승인된 [pydemia 엠블럼](https://github.com/pydemia/agent-skills/blob/main/library/templates/logo-design/assets/pydemia/logo-colorful.svg)과 `p-module` path를 바이트 단위로 동일하게 유지하고, 64px SVG 파생본에서 dark 탭의 navy 부분만 승인된 반전 색 `#EEF3F5`로 바꾼다. `web/index.html`의 `rel="icon"`은 `/favicon.svg`를 가리킨다. source SHA-256은 `210e38b2f2f4dace4d0bf32f76dc54c17c8b335a5a056868aebf4795ae8eae33`이다. 설치형 앱 범위가 없어 manifest/apple-touch 아이콘은 만들지 않았다. `npm run build`는 `web/scripts/verify-favicon.cjs`로 최종 HTML 링크와 빌드 자산의 실제 bytes 일치를 검사하고 배포 패키지에도 해당 스크립트를 넣는다. 배포 완료 판정은 운영 HTTPS 응답의 Content-Type/hash와 브라우저 탭 표시를 확인한 후 기록한다.

검증은 `npm --prefix web run check`와 `npm --prefix web run build`를 사용한다. 브라우저에서는 로그인 전후의 주요 화면, 모드·테마 전환과 재방문, 모바일 폭 및 키보드 조작을 확인한다. 테스트·로컬 브라우저·운영 브라우저의 수행 여부는 [검증 기록](verification.md)에 각각 남긴다.
