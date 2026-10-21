/** Pure metadata for the 21 supported design modes. */
import { designDefaultColormaps, type DesignDefaultColormap } from "./design-default-colormaps";
import { designTypography, type DesignTypography } from "./design-typography";
export type Appearance = "light" | "dark";
export const colorTokens = [
    { name: "Background", token: "--background" },
    { name: "Surface", token: "--surface" },
    { name: "Surface subtle", token: "--surface-subtle" },
    { name: "Foreground", token: "--foreground" },
    { name: "Muted", token: "--muted" },
    { name: "Border", token: "--border" },
    { name: "Accent", token: "--accent" },
    { name: "Accent text", token: "--accent-foreground" },
    { name: "Focus", token: "--focus" },
    { name: "Danger", token: "--danger" },
    { name: "Success", token: "--success" },
    { name: "Warning", token: "--warning" },
    { name: "User message", token: "--message-user-background" },
    { name: "User message text", token: "--message-user-foreground" },
] as const;

export const colormaps = [
    {
        id: "neutral", name: "Neutral", description: "기존 청록",
        colors: {
            light: ["#f7f8fa", "#245d70", "#103344"],
            dark: ["#131a21", "#83bfd2", "#245d70"],
        },
    },
    {
        id: "pydemia", name: "Pydemia", description: "로고 네이비·로즈",
        colors: {
            light: ["#f7f9fb", "#ba365b", "#103344"],
            dark: ["#111a24", "#f19ab1", "#20465d"],
        },
    },
    {
        id: "ocean", name: "Ocean", description: "선명한 파랑",
        colors: {
            light: ["#f5f8fc", "#205ca3", "#163f70"],
            dark: ["#111b2b", "#8fc0ff", "#285d96"],
        },
    },
    {
        id: "forest", name: "Forest", description: "차분한 초록",
        colors: {
            light: ["#f5f8f4", "#25684a", "#174a38"],
            dark: ["#121e19", "#91d4aa", "#276348"],
        },
    },
    {
        id: "violet", name: "Violet", description: "절제된 보라",
        colors: {
            light: ["#faf7fc", "#68438e", "#4e326e"],
            dark: ["#1d1726", "#d2a4f1", "#67418a"],
        },
    },
] as const;

export type ColorToken = (typeof colorTokens)[number]["token"];
export type ColormapId = (typeof colormaps)[number]["id"];
export type PaletteId = "design" | ColormapId;
export type ColorOverrides = Record<Appearance, Partial<Record<ColorToken, string>>>;
export type ThemeTokenMap = Record<`--${string}`, string>;
export type ColorPalette = Record<ColorToken, string>;

export const paletteTokens: Record<ColormapId, Record<Appearance, ColorPalette>> = {
    "neutral": {
        "light": {
            "--background": "#f7f8fa",
            "--foreground": "#202a35",
            "--surface": "#ffffff",
            "--surface-subtle": "#f2f4f6",
            "--border": "#d6dce2",
            "--muted": "#52606d",
            "--accent": "#245d70",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#103344",
            "--message-user-foreground": "#ffffff",
            "--focus": "#176c8a",
            "--danger": "#a22c36",
            "--success": "#236645",
            "--warning": "#8b5a06"
        },
        "dark": {
            "--background": "#131a21",
            "--foreground": "#e9eef2",
            "--surface": "#1b242d",
            "--surface-subtle": "#25313b",
            "--border": "#46545f",
            "--muted": "#afbec9",
            "--accent": "#83bfd2",
            "--accent-foreground": "#13232d",
            "--message-user-background": "#245d70",
            "--message-user-foreground": "#ffffff",
            "--focus": "#9ad6eb",
            "--danger": "#ff9aa0",
            "--success": "#8dd9ac",
            "--warning": "#f2c46f"
        }
    },
    "pydemia": {
        "light": {
            "--background": "#f7f9fb",
            "--foreground": "#1d2d3a",
            "--surface": "#ffffff",
            "--surface-subtle": "#f1f4f7",
            "--border": "#d2dce5",
            "--muted": "#536473",
            "--accent": "#ba365b",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#103344",
            "--message-user-foreground": "#ffffff",
            "--focus": "#9f274c",
            "--danger": "#a22c36",
            "--success": "#236645",
            "--warning": "#8b5a06"
        },
        "dark": {
            "--background": "#111a24",
            "--foreground": "#edf2f7",
            "--surface": "#1b2734",
            "--surface-subtle": "#263544",
            "--border": "#465b6d",
            "--muted": "#b3c3d1",
            "--accent": "#f19ab1",
            "--accent-foreground": "#301722",
            "--message-user-background": "#20465d",
            "--message-user-foreground": "#ffffff",
            "--focus": "#f6aec1",
            "--danger": "#ff9aa0",
            "--success": "#8dd9ac",
            "--warning": "#f2c46f"
        }
    },
    "ocean": {
        "light": {
            "--background": "#f5f8fc",
            "--foreground": "#182b43",
            "--surface": "#ffffff",
            "--surface-subtle": "#edf3f9",
            "--border": "#cbd9e8",
            "--muted": "#4d6077",
            "--accent": "#205ca3",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#163f70",
            "--message-user-foreground": "#ffffff",
            "--focus": "#166bb4",
            "--danger": "#a52b3a",
            "--success": "#236645",
            "--warning": "#8b5a06"
        },
        "dark": {
            "--background": "#111b2b",
            "--foreground": "#e8f1fb",
            "--surface": "#19263a",
            "--surface-subtle": "#23334a",
            "--border": "#425873",
            "--muted": "#aebfd4",
            "--accent": "#8fc0ff",
            "--accent-foreground": "#10243d",
            "--message-user-background": "#285d96",
            "--message-user-foreground": "#ffffff",
            "--focus": "#add4ff",
            "--danger": "#ff9b9f",
            "--success": "#8dd9ac",
            "--warning": "#f2c46f"
        }
    },
    "forest": {
        "light": {
            "--background": "#f5f8f4",
            "--foreground": "#1c3027",
            "--surface": "#ffffff",
            "--surface-subtle": "#eef4ee",
            "--border": "#cadbce",
            "--muted": "#4b6455",
            "--accent": "#25684a",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#174a38",
            "--message-user-foreground": "#ffffff",
            "--focus": "#1a7a52",
            "--danger": "#a33438",
            "--success": "#236645",
            "--warning": "#8b5a06"
        },
        "dark": {
            "--background": "#121e19",
            "--foreground": "#e7f3eb",
            "--surface": "#1b2a22",
            "--surface-subtle": "#27382d",
            "--border": "#455e4d",
            "--muted": "#adc7b3",
            "--accent": "#91d4aa",
            "--accent-foreground": "#122c1f",
            "--message-user-background": "#276348",
            "--message-user-foreground": "#ffffff",
            "--focus": "#afe8c0",
            "--danger": "#ff9da0",
            "--success": "#8dd9ac",
            "--warning": "#f2c46f"
        }
    },
    "violet": {
        "light": {
            "--background": "#faf7fc",
            "--foreground": "#30233e",
            "--surface": "#ffffff",
            "--surface-subtle": "#f4eff8",
            "--border": "#ddd1e7",
            "--muted": "#675875",
            "--accent": "#68438e",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#4e326e",
            "--message-user-foreground": "#ffffff",
            "--focus": "#7a4ca7",
            "--danger": "#a8324c",
            "--success": "#236645",
            "--warning": "#8b5a06"
        },
        "dark": {
            "--background": "#1d1726",
            "--foreground": "#f3ecfa",
            "--surface": "#292035",
            "--surface-subtle": "#372c45",
            "--border": "#604c70",
            "--muted": "#cab8d8",
            "--accent": "#d2a4f1",
            "--accent-foreground": "#291838",
            "--message-user-background": "#67418a",
            "--message-user-foreground": "#ffffff",
            "--focus": "#e4c3fa",
            "--danger": "#ff9eb8",
            "--success": "#8dd9ac",
            "--warning": "#f2c46f"
        }
    }
};

export const basicShapeTokens: ThemeTokenMap = {
    "--radius": "5px",
    "--density-control-height": "36px",
    "--density-row-block": "10px",
    "--control-height": "var(--density-control-height)",
    "--type-body-size": "14px",
    "--type-caption-size": "12px",
    "--type-body-leading": "1.5",
    "--space-1": "4px",
    "--space-2": "8px",
    "--space-3": "12px",
    "--space-4": "16px",
    "--space-6": "24px",
    "--shadow-float": "0 4px 16px rgb(20 35 45 / 8%)",
    "--overlay": "rgb(13 25 32 / 45%)",
    "--motion-fast": "150ms",
    "--font-ui": "Inter, \"Noto Sans KR\", system-ui, sans-serif"
};

export const designModeIds = [
    "basic", "glass", "material", "fluent", "neumorphic", "flat",
    "bento", "brutal", "clay", "skeuo", "dark-ui", "minimal", "swiss",
    "editorial", "aurora", "cyber", "terminal", "retro", "pixel",
    "drawn", "spatial",
] as const;
export type DesignModeId = (typeof designModeIds)[number];
export type DesignModeDefinition = {
    id: DesignModeId;
    name: string;
    group: string;
    kind: "기본" | "시각 스타일" | "디자인 시스템" | "레이아웃" | "테마" | "인터페이스 방식";
    description: string;
    atlasCaseId: string | null;
    releaseStatus: "released" | "ready" | "draft";
    appearances: readonly Appearance[];
    defaultAppearance: Appearance;
    colormaps: readonly PaletteId[];
    recipe: "standard" | "bento" | "spatial";
    tokens: ThemeTokenMap;
    palettes: Record<Appearance, ColorPalette>;
    defaultColormap: DesignDefaultColormap | null;
    typography: DesignTypography | null;
};
export type ThemeSettings = {
    version: 1;
    design: DesignModeId;
    appearance: Appearance;
    colormap: PaletteId;
    overrides: ColorOverrides;
};

// These values match the existing documentation literals.
export const basicDocumentTokens: ThemeTokenMap = {
    "--font-heading": "var(--font-ui)",
    "--heading-size": "clamp(38px, 4.5vw, 56px)",
    "--section-heading-size": "clamp(26px, 3vw, 33px)",
    "--heading-weight": "650",
    "--section-heading-weight": "640",
    "--panel-shadow": "var(--shadow-float)",
    "--panel-radius": "5px",
    "--docs-section-space": "42px",
    "--docs-preview-padding": "22px",
    "--border-width": "1px",
};

const allPalettes: readonly PaletteId[] = [
    "design", "neutral", "pydemia", "ocean", "forest", "violet",
];
const mono = '"Cascadia Code", Consolas, "Courier New", "Noto Sans KR", monospace';
const serif = 'Georgia, "Noto Serif KR", serif';

type ModeProfile = [
    DesignModeId, string, string, string, ColormapId, ThemeTokenMap,
    Partial<Record<Appearance, Partial<ColorPalette>>>?,
];
const profiles: ModeProfile[] = [
    ["basic", "Basic", "기본", "현재 pydemia UI의 기본 표현", "neutral", {}],
    ["glass", "Glassmorphism", "표면", "차가운 보라빛 배경 위에 겹치는 반투명 유리 패널", "violet", {
        "--radius": "12px", "--panel-radius": "18px",
        "--panel-shadow": "0 18px 44px rgb(55 48 120 / 20%), inset 0 1px 0 rgb(255 255 255 / 58%)",
        "--density-control-height": "40px", "--docs-preview-padding": "26px",
    }, {
        light: {
            "--background": "#f1efff",
            "--foreground": "#25233d",
            "--surface": "#ffffff",
            "--surface-subtle": "#e8e6fa",
            "--border": "#c8c4ec",
            "--muted": "#5d5a79",
            "--accent": "#5a55b8",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#393779",
            "--message-user-foreground": "#ffffff",
            "--focus": "#625ddd",
        },
        dark: {
            "--background": "#15152b",
            "--foreground": "#f0efff",
            "--surface": "#22223e",
            "--surface-subtle": "#2e2e52",
            "--border": "#56547e",
            "--muted": "#c0bee0",
            "--accent": "#b9b5ff",
            "--accent-foreground": "#211f45",
            "--message-user-background": "#514d9b",
            "--message-user-foreground": "#ffffff",
            "--focus": "#cfccff",
        },
    }],
    ["material", "Material Inspired", "표면", "보라색 tonal 표면과 squircle 주요 동작으로 구성한 Material 화면", "violet", {
        "--radius": "12px", "--panel-radius": "18px",
        "--density-control-height": "44px", "--heading-weight": "700",
        "--panel-shadow": "0 3px 8px rgb(40 30 80 / 12%), 0 1px 3px rgb(40 30 80 / 10%)",
        "--docs-preview-padding": "26px",
    }, {
        light: {
            "--background": "#f7f5fc",
            "--foreground": "#211b2e",
            "--surface": "#ffffff",
            "--surface-subtle": "#eee9f7",
            "--border": "#d9d0e8",
            "--muted": "#625a70",
            "--accent": "#6550a4",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#4b387f",
            "--message-user-foreground": "#ffffff",
            "--focus": "#775ec0",
        },
        dark: {
            "--background": "#17131f",
            "--foreground": "#f2edf8",
            "--surface": "#211b2b",
            "--surface-subtle": "#30283b",
            "--border": "#52465f",
            "--muted": "#c6bacf",
            "--accent": "#d0b9ff",
            "--accent-foreground": "#291a46",
            "--message-user-background": "#624a91",
            "--message-user-foreground": "#ffffff",
            "--focus": "#d7c4ff",
        },
    }],
    ["fluent", "Fluent Acrylic", "표면", "조용한 청회색 바탕과 얇은 아크릴 레이어, 절제된 파랑 강조", "ocean", {
        "--radius": "6px", "--panel-radius": "10px",
        "--panel-shadow": "0 10px 28px rgb(25 45 70 / 12%), inset 0 1px 0 rgb(255 255 255 / 72%)",
        "--density-control-height": "36px", "--docs-section-space": "38px",
    }, {
        light: {
            "--background": "#f2f5f8",
            "--foreground": "#202a36",
            "--surface": "#fbfcfe",
            "--surface-subtle": "#e8edf3",
            "--border": "#cbd4df",
            "--muted": "#556575",
            "--accent": "#276293",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#234766",
            "--message-user-foreground": "#ffffff",
            "--focus": "#2b78b3",
        },
        dark: {
            "--background": "#171d25",
            "--foreground": "#eff4f9",
            "--surface": "#202a35",
            "--surface-subtle": "#2a3643",
            "--border": "#475768",
            "--muted": "#b5c2cf",
            "--accent": "#9dc7eb",
            "--accent-foreground": "#172d40",
            "--message-user-background": "#315a7c",
            "--message-user-foreground": "#ffffff",
            "--focus": "#add8f7",
        },
    }],
    ["neumorphic", "Neumorphism", "표면", "경계선을 덜고 같은 회색 면에 밝고 어두운 이중 그림자를 새긴 표면", "neutral", {
        "--radius": "12px", "--panel-radius": "18px",
        "--border-width": "0px",
        "--panel-shadow": "8px 8px 18px rgb(0 0 0 / 22%), -7px -7px 18px var(--material-highlight)",
        "--shadow-float": "10px 10px 22px rgb(0 0 0 / 24%), -8px -8px 20px var(--material-highlight)",
        "--density-control-height": "42px",
    }, {
        light: {
            "--background": "#e5e8ed",
            "--foreground": "#303640",
            "--surface": "#e5e8ed",
            "--surface-subtle": "#e5e8ed",
            "--border": "#d5d9df",
            "--muted": "#59616d",
            "--accent": "#426d89",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#38546b",
            "--message-user-foreground": "#ffffff",
            "--focus": "#346b91",
        },
        dark: {
            "--background": "#252a32",
            "--foreground": "#e7eaf0",
            "--surface": "#252a32",
            "--surface-subtle": "#252a32",
            "--border": "#343b46",
            "--muted": "#b9c1cd",
            "--accent": "#9bbbd2",
            "--accent-foreground": "#202a34",
            "--message-user-background": "#40576d",
            "--message-user-foreground": "#ffffff",
            "--focus": "#b1d4ed",
        },
    }],
    ["flat", "Flat Design", "정돈", "그림자 대신 넓고 선명한 색면과 단순한 사각 구획을 사용", "ocean", {
        "--radius": "3px", "--panel-radius": "3px",
        "--shadow-float": "none", "--panel-shadow": "none",
        "--density-control-height": "42px", "--heading-weight": "750",
        "--docs-preview-padding": "26px",
    }, {
        light: {
            "--background": "#f5f7fb",
            "--foreground": "#172641",
            "--surface": "#ffffff",
            "--surface-subtle": "#e8effb",
            "--border": "#cbd7e9",
            "--muted": "#4b5d78",
            "--accent": "#175dd2",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#102e67",
            "--message-user-foreground": "#ffffff",
            "--focus": "#0d6bea",
        },
        dark: {
            "--background": "#111a2b",
            "--foreground": "#edf3ff",
            "--surface": "#19263c",
            "--surface-subtle": "#22334e",
            "--border": "#3d5577",
            "--muted": "#b1c2dc",
            "--accent": "#81b7ff",
            "--accent-foreground": "#102442",
            "--message-user-background": "#285292",
            "--message-user-foreground": "#ffffff",
            "--focus": "#a1cbff",
        },
    }],
    ["bento", "Bento Grid", "조합", "큰 주제 타일과 작은 정보 타일을 비대칭 격자로 묶는 카드 구성", "neutral", {
        "--radius": "12px", "--panel-radius": "18px",
        "--docs-preview-padding": "28px", "--space-6": "30px",
        "--docs-section-space": "46px", "--heading-weight": "720",
        "--panel-shadow": "0 8px 24px rgb(30 42 65 / 10%)",
    }, {
        light: {
            "--background": "#f3f5f8",
            "--foreground": "#222b3a",
            "--surface": "#ffffff",
            "--surface-subtle": "#e9edf3",
            "--border": "#d1d8e2",
            "--muted": "#586476",
            "--accent": "#3f62b4",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#2c416e",
            "--message-user-foreground": "#ffffff",
            "--focus": "#486fc7",
        },
        dark: {
            "--background": "#171c25",
            "--foreground": "#f1f3f7",
            "--surface": "#212936",
            "--surface-subtle": "#2b3544",
            "--border": "#465365",
            "--muted": "#bac3d0",
            "--accent": "#a9bcf5",
            "--accent-foreground": "#1b2644",
            "--message-user-background": "#3e5482",
            "--message-user-foreground": "#ffffff",
            "--focus": "#b8c9ff",
        },
    }],
    ["brutal", "Neobrutalism", "개성", "굵은 선과 단단한 offset 그림자", "neutral", {
        "--radius": "0px", "--panel-radius": "0px",
        "--border-width": "2px", "--heading-weight": "800",
        "--shadow-float": "4px 4px 0 var(--border)",
        "--panel-shadow": "6px 6px 0 var(--border)",
    }, { light: { "--background": "#fff9e9", "--border": "#202a35", "--accent": "#904315" }, dark: { "--accent": "#ffbd7c" } }],
    ["clay", "Claymorphism", "표면", "복숭아빛 종이 위 파스텔 블록과 푹신한 깊이를 가진 squircle 패널", "violet", {
        "--radius": "14px", "--panel-radius": "20px",
        "--density-control-height": "48px", "--heading-weight": "720",
        "--panel-shadow": "inset 8px 8px 14px color-mix(in srgb, var(--surface) 85%, white), inset -8px -8px 16px color-mix(in srgb, var(--accent) 16%, transparent), 10px 18px 26px rgb(97 61 78 / 24%)",
        "--shadow-float": "inset 0 2px 4px rgb(255 255 255 / 70%), 0 8px 0 rgb(191 136 151 / 13%), 0 14px 20px rgb(97 61 78 / 16%)",
        "--docs-preview-padding": "28px", "--space-6": "28px",
    }, {
        light: {
            "--background": "#fff4ee",
            "--foreground": "#3d2a33",
            "--surface": "#fffaf7",
            "--surface-subtle": "#fae9e5",
            "--border": "#e9d0ce",
            "--muted": "#755b64",
            "--accent": "#efafc2",
            "--accent-foreground": "#4b233b",
            "--message-user-background": "#704359",
            "--message-user-foreground": "#ffffff",
            "--focus": "#a84f6b",
        },
        dark: {
            "--background": "#241d2a",
            "--foreground": "#f8eef2",
            "--surface": "#302638",
            "--surface-subtle": "#403143",
            "--border": "#624a5e",
            "--muted": "#d3bfca",
            "--accent": "#efb0c0",
            "--accent-foreground": "#38212c",
            "--message-user-background": "#80566d",
            "--message-user-foreground": "#ffffff",
            "--focus": "#ffc2d0",
        },
    }],
    ["skeuo", "Skeuomorphism", "개성", "크림색 장치 패널과 금속성 테두리, 눌림·돌출 bevel로 물성을 표현", "forest", {
        "--radius": "7px", "--panel-radius": "9px",
        "--border-width": "2px", "--density-control-height": "38px",
        "--panel-shadow": "inset 0 2px 0 rgb(255 255 255 / 90%), inset 0 -2px 0 rgb(76 76 66 / 18%), 0 5px 9px rgb(43 47 39 / 20%)",
        "--shadow-float": "inset 0 1px 0 rgb(255 255 255 / 90%), 0 4px 8px rgb(43 47 39 / 24%)",
    }, {
        light: {
            "--background": "#e9e4d7",
            "--foreground": "#282d27",
            "--surface": "#f7f3e9",
            "--surface-subtle": "#ded8c9",
            "--border": "#a9a18f",
            "--muted": "#5d6258",
            "--accent": "#35614b",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#304c3c",
            "--message-user-foreground": "#ffffff",
            "--focus": "#28704e",
        },
        dark: {
            "--background": "#202821",
            "--foreground": "#f0eee5",
            "--surface": "#2a342c",
            "--surface-subtle": "#37443a",
            "--border": "#66705f",
            "--muted": "#c4c9b8",
            "--accent": "#a7c68f",
            "--accent-foreground": "#25321f",
            "--message-user-background": "#496348",
            "--message-user-foreground": "#ffffff",
            "--focus": "#bddca4",
        },
    }],
    ["dark-ui", "Dark UI", "표면", "검정에 가까운 무채색과 단계가 분명한 회색 표면을 쓰는 고대비 다크 화면", "neutral", {
        "--radius": "5px", "--panel-radius": "8px",
        "--panel-shadow": "0 12px 28px rgb(0 0 0 / 38%)",
        "--density-control-height": "38px", "--border-width": "1px",
    }, {
        dark: {
            "--background": "#090a0c",
            "--foreground": "#f4f5f7",
            "--surface": "#141619",
            "--surface-subtle": "#202328",
            "--border": "#3a3e45",
            "--muted": "#b8bdc6",
            "--accent": "#e1e4e9",
            "--accent-foreground": "#141619",
            "--message-user-background": "#30343a",
            "--message-user-foreground": "#ffffff",
            "--focus": "#ffffff",
            "--danger": "#ff9da3",
            "--success": "#8ce2aa",
            "--warning": "#ffd37d",
        },
    }],
    ["minimal", "Minimalist SaaS UI", "정돈", "넓은 여백, 얇은 구획선, 작은 강조색으로 정보 위계를 드러내는 절제된 화면", "neutral", {
        "--radius": "5px", "--panel-radius": "7px",
        "--panel-shadow": "none", "--docs-section-space": "58px",
        "--docs-preview-padding": "30px", "--space-6": "30px",
        "--heading-size": "clamp(36px, 4.2vw, 52px)", "--heading-weight": "650",
        "--density-row-block": "12px",
    }, {
        light: {
            "--background": "#ffffff",
            "--foreground": "#20252d",
            "--surface": "#ffffff",
            "--surface-subtle": "#f6f7f8",
            "--border": "#e0e3e7",
            "--muted": "#626a75",
            "--accent": "#34485f",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#27384d",
            "--message-user-foreground": "#ffffff",
            "--focus": "#456b91",
        },
        dark: {
            "--background": "#14171b",
            "--foreground": "#f1f3f5",
            "--surface": "#191d22",
            "--surface-subtle": "#22272e",
            "--border": "#353b43",
            "--muted": "#b5bbc4",
            "--accent": "#c1d2e2",
            "--accent-foreground": "#202a34",
            "--message-user-background": "#394957",
            "--message-user-foreground": "#ffffff",
            "--focus": "#c9e0f4",
        },
    }],
    ["swiss", "Swiss Style", "정돈", "큰 검정 제목과 빽빽한 격자, 포인트만 찍는 신호색 빨강", "neutral", {
        "--radius": "0px", "--panel-radius": "0px",
        "--panel-shadow": "none", "--heading-weight": "800",
        "--heading-size": "clamp(40px, 5vw, 64px)",
        "--type-body-size": "13px", "--type-caption-size": "11px",
        "--density-control-height": "34px", "--density-row-block": "8px",
        "--space-6": "20px", "--docs-section-space": "34px", "--docs-preview-padding": "20px",
    }, {
        light: {
            "--background": "#f7f7f5",
            "--foreground": "#151515",
            "--surface": "#ffffff",
            "--surface-subtle": "#eeeeeb",
            "--border": "#c9c9c5",
            "--muted": "#4e4e4a",
            "--accent": "#b42325",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#171717",
            "--message-user-foreground": "#ffffff",
            "--focus": "#b42325",
        },
        dark: {
            "--background": "#111111",
            "--foreground": "#f4f4f1",
            "--surface": "#1a1a1a",
            "--surface-subtle": "#252525",
            "--border": "#454545",
            "--muted": "#c1c1bd",
            "--accent": "#ff7777",
            "--accent-foreground": "#241111",
            "--message-user-background": "#303030",
            "--message-user-foreground": "#ffffff",
            "--focus": "#ff8c8c",
        },
    }],
    ["editorial", "Editorial UI", "정돈", "따뜻한 종이색과 잉크색 본문, 큰 serif 제목과 가는 편집 구획선", "neutral", {
        "--radius": "2px", "--panel-radius": "2px",
        "--font-heading": serif, "--heading-weight": "600",
        "--heading-size": "clamp(40px, 5vw, 62px)", "--section-heading-size": "clamp(28px, 3.2vw, 38px)",
        "--panel-shadow": "none", "--docs-section-space": "54px",
        "--docs-preview-padding": "28px", "--type-body-leading": "1.68",
    }, {
        light: {
            "--background": "#f6f0e6",
            "--foreground": "#302923",
            "--surface": "#fcfaf6",
            "--surface-subtle": "#eee7db",
            "--border": "#d8cbbb",
            "--muted": "#6d6257",
            "--accent": "#894b38",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#54382e",
            "--message-user-foreground": "#ffffff",
            "--focus": "#9d533b",
        },
        dark: {
            "--background": "#201c19",
            "--foreground": "#f5eee5",
            "--surface": "#2a2521",
            "--surface-subtle": "#38312b",
            "--border": "#65574b",
            "--muted": "#d0c1b1",
            "--accent": "#e4b394",
            "--accent-foreground": "#34251f",
            "--message-user-background": "#69483a",
            "--message-user-foreground": "#ffffff",
            "--focus": "#f0c4a4",
        },
    }],
    ["aurora", "Aurora Mesh", "표면", "보라·청록·분홍 빛이 번지는 다색 배경과 맑은 콘텐츠 표면", "violet", {
        "--radius": "12px", "--panel-radius": "18px",
        "--panel-shadow": "0 14px 38px rgb(99 77 178 / 20%), 0 2px 12px rgb(64 191 201 / 12%)",
        "--density-control-height": "40px", "--docs-preview-padding": "26px",
    }, {
        light: {
            "--background": "#f3f0ff",
            "--foreground": "#27223b",
            "--surface": "#ffffff",
            "--surface-subtle": "#ece9fa",
            "--border": "#d5cee9",
            "--muted": "#625a78",
            "--accent": "#6553bd",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#4d438c",
            "--message-user-foreground": "#ffffff",
            "--focus": "#6b62d0",
        },
        dark: {
            "--background": "#17152a",
            "--foreground": "#f3f0ff",
            "--surface": "#22203c",
            "--surface-subtle": "#302c51",
            "--border": "#575079",
            "--muted": "#c5bedf",
            "--accent": "#c7b5ff",
            "--accent-foreground": "#282044",
            "--message-user-background": "#62529c",
            "--message-user-foreground": "#ffffff",
            "--focus": "#d5c8ff",
        },
    }],
    ["cyber", "Cyberpunk UI", "개성", "검은 바탕의 날 선 패널, 시안·마젠타 네온 경계와 발광; Dark만 지원", "ocean", {
        "--radius": "0px", "--panel-radius": "2px",
        "--font-heading": mono, "--heading-weight": "750",
        "--heading-size": "clamp(38px, 4.8vw, 60px)",
        "--border-width": "1px",
        "--panel-shadow": "0 0 18px color-mix(in srgb, var(--accent) 32%, transparent), inset 0 0 12px color-mix(in srgb, var(--accent) 8%, transparent)",
        "--shadow-float": "0 0 14px color-mix(in srgb, var(--accent) 35%, transparent)",
    }, {
        dark: {
            "--background": "#090b16",
            "--foreground": "#eaf7ff",
            "--surface": "#11172a",
            "--surface-subtle": "#1a2340",
            "--border": "#3a4a70",
            "--muted": "#a9bdd5",
            "--accent": "#72f4e6",
            "--accent-foreground": "#092622",
            "--message-user-background": "#34285d",
            "--message-user-foreground": "#ffffff",
            "--focus": "#ff83dd",
            "--danger": "#ff7b91",
            "--success": "#67f2b0",
            "--warning": "#ffd36e",
        },
    }],
    ["terminal", "Terminal UI", "개성", "실제 콘솔처럼 전면 고정폭 글꼴과 녹색 상태 문자를 쓰는 단색 화면; Dark만 지원", "forest", {
        "--radius": "0px", "--panel-radius": "0px",
        "--font-ui": mono, "--font-heading": mono,
        "--type-body-size": "13px", "--type-caption-size": "11px", "--type-body-leading": "1.55",
        "--panel-shadow": "none", "--shadow-float": "none",
        "--density-row-block": "8px", "--density-control-height": "34px",
        "--border-width": "1px",
    }, {
        dark: {
            "--background": "#07120d",
            "--foreground": "#c8f3d2",
            "--surface": "#0c1c13",
            "--surface-subtle": "#102719",
            "--border": "#2b5638",
            "--muted": "#8ab99a",
            "--accent": "#8ff2a8",
            "--accent-foreground": "#102718",
            "--message-user-background": "#1d4b2b",
            "--message-user-foreground": "#d7ffe0",
            "--focus": "#a4ffb7",
            "--danger": "#ff8f88",
            "--success": "#8ff2a8",
            "--warning": "#f6d16d",
        },
    }],
    ["retro", "Retro Desktop UI", "개성", "회색 창틀과 남색 제목 띠, 밝고 어두운 bevel 버튼으로 만든 클래식 데스크톱", "ocean", {
        "--radius": "0px", "--panel-radius": "0px",
        "--border-width": "2px", "--font-heading": mono,
        "--density-control-height": "36px", "--panel-shadow": "inset 2px 2px 0 rgb(255 255 255 / 92%), inset -2px -2px 0 rgb(73 73 73 / 32%), 3px 3px 0 rgb(0 0 0 / 25%)",
        "--shadow-float": "inset 2px 2px 0 rgb(255 255 255 / 88%), inset -2px -2px 0 rgb(73 73 73 / 30%), 3px 3px 0 rgb(0 0 0 / 25%)",
    }, {
        light: {
            "--background": "#bfc3c8",
            "--foreground": "#171b24",
            "--surface": "#d8dadd",
            "--surface-subtle": "#c8cbd0",
            "--border": "#6f747c",
            "--muted": "#444b56",
            "--accent": "#173f75",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#173f75",
            "--message-user-foreground": "#ffffff",
            "--focus": "#164f98",
            "--warning": "#714905",
        },
        dark: {
            "--background": "#222831",
            "--foreground": "#f2f4f8",
            "--surface": "#303943",
            "--surface-subtle": "#3d4854",
            "--border": "#687583",
            "--muted": "#c0c9d4",
            "--accent": "#9fc8ff",
            "--accent-foreground": "#1a2b43",
            "--message-user-background": "#355985",
            "--message-user-foreground": "#ffffff",
            "--focus": "#b6d4ff",
        },
    }],
    ["pixel", "Pixel Art UI", "개성", "팔레트 타일과 세 칸 테두리, 계단식 그림자로 게임 화면의 픽셀 격자를 표현", "violet", {
        "--radius": "0px", "--panel-radius": "0px",
        "--border-width": "3px", "--font-heading": mono, "--font-ui": mono,
        "--heading-weight": "750", "--panel-shadow": "4px 4px 0 var(--border)",
        "--shadow-float": "4px 4px 0 var(--border)", "--density-control-height": "38px",
    }, {
        light: {
            "--background": "#f4f0df",
            "--foreground": "#25233c",
            "--surface": "#fffdf3",
            "--surface-subtle": "#e8e1cb",
            "--border": "#494566",
            "--muted": "#5b566e",
            "--accent": "#584b9b",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#3d3970",
            "--message-user-foreground": "#ffffff",
            "--focus": "#6252b4",
        },
        dark: {
            "--background": "#19182a",
            "--foreground": "#f7f0ff",
            "--surface": "#25243b",
            "--surface-subtle": "#33314f",
            "--border": "#6a6490",
            "--muted": "#c2badc",
            "--accent": "#d7c8ff",
            "--accent-foreground": "#2d2450",
            "--message-user-background": "#514b7e",
            "--message-user-foreground": "#ffffff",
            "--focus": "#e0d5ff",
        },
    }],
    ["drawn", "Hand drawn UI", "개성", "크림색 종이와 잉크 선, 비대칭 모서리와 손으로 그은 듯한 구획", "forest", {
        "--radius": "8px 4px 10px 5px", "--panel-radius": "12px 6px 14px 8px",
        "--font-heading": '"Segoe Print", "Comic Sans MS", "Noto Sans KR", cursive',
        "--heading-weight": "650", "--border-width": "2px",
        "--panel-shadow": "2px 3px 0 var(--border), 0 8px 18px rgb(77 62 43 / 9%)",
        "--docs-section-space": "48px", "--type-body-leading": "1.62",
    }, {
        light: {
            "--background": "#faf6e9",
            "--foreground": "#302b20",
            "--surface": "#fffdf6",
            "--surface-subtle": "#f1ead8",
            "--border": "#75664d",
            "--muted": "#655b49",
            "--accent": "#745137",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#514335",
            "--message-user-foreground": "#ffffff",
            "--focus": "#91633b",
        },
        dark: {
            "--background": "#211f19",
            "--foreground": "#f4eedf",
            "--surface": "#2c2a22",
            "--surface-subtle": "#3b372b",
            "--border": "#72694f",
            "--muted": "#cec3a9",
            "--accent": "#e3c58a",
            "--accent-foreground": "#322915",
            "--message-user-background": "#615338",
            "--message-user-foreground": "#ffffff",
            "--focus": "#efd392",
        },
    }],
    ["spatial", "Spatial UI", "조합", "청색 공간에 투명도와 깊이를 달리한 큰 부유 패널을 겹치는 공간형 작업면", "ocean", {
        "--radius": "12px", "--panel-radius": "18px",
        "--space-6": "34px", "--docs-preview-padding": "30px",
        "--panel-shadow": "0 22px 56px rgb(15 35 65 / 26%), 0 4px 14px rgb(53 111 176 / 12%)",
        "--shadow-float": "0 14px 34px rgb(15 35 65 / 24%)",
        "--docs-section-space": "48px",
    }, {
        light: {
            "--background": "#eaf2fb",
            "--foreground": "#1b2b3d",
            "--surface": "#fbfdff",
            "--surface-subtle": "#dce9f6",
            "--border": "#b8cadd",
            "--muted": "#51677d",
            "--accent": "#2875ad",
            "--accent-foreground": "#ffffff",
            "--message-user-background": "#245278",
            "--message-user-foreground": "#ffffff",
            "--focus": "#3188c5",
        },
        dark: {
            "--background": "#101b2b",
            "--foreground": "#edf5ff",
            "--surface": "#1b2a3d",
            "--surface-subtle": "#25384f",
            "--border": "#4a6681",
            "--muted": "#b4c8dc",
            "--accent": "#92ccf3",
            "--accent-foreground": "#15304a",
            "--message-user-background": "#315b7e",
            "--message-user-foreground": "#ffffff",
            "--focus": "#a9dcff",
        },
    }],
];

export const designModes: readonly DesignModeDefinition[] = profiles.map(
    ([id, name, group, description, palette, tokens, colors], index) => ({
        id, name, group, description,
        kind: id === "basic" ? "기본" : id === "material" || id === "fluent"
            ? "디자인 시스템" : id === "bento" ? "레이아웃"
                : id === "dark-ui" ? "테마" : id === "terminal" || id === "spatial"
                    ? "인터페이스 방식" : "시각 스타일",
        atlasCaseId: index === 0 ? null : String(index).padStart(2, "0"),
        releaseStatus: "released",
        appearances: ["dark-ui", "cyber", "terminal"].includes(id)
            ? ["dark"] : ["light", "dark"],
        defaultAppearance: ["dark-ui", "cyber", "terminal"].includes(id)
            ? "dark" : "light",
        colormaps: allPalettes,
        recipe: id === "bento" || id === "spatial" ? id : "standard",
        tokens: id === "basic" ? tokens : {
            ...tokens,
            "--font-ui": `"Pydemia Design ${designTypography[id].ui}", "Pydemia Design Nanum Gothic", system-ui, sans-serif`,
            "--font-heading": `"Pydemia Design ${designTypography[id].headline}", "Pydemia Design ${["editorial", "skeuo", "drawn"].includes(id) ? "Nanum Myeongjo" : "Nanum Gothic"}", system-ui, sans-serif`,
            "--font-data": `"Pydemia Design ${designTypography[id].data}", "Pydemia Design Nanum Gothic", ui-monospace, monospace`,
        },
        typography: id === "basic" ? null : designTypography[id],
        defaultColormap: id === "basic" ? null : designDefaultColormaps[id],
        palettes: {
            light: id === "basic" ? { ...paletteTokens[palette].light, ...colors?.light }
                : designDefaultColormaps[id].colors.light,
            dark: id === "basic" ? { ...paletteTokens[palette].dark, ...colors?.dark }
                : designDefaultColormaps[id].colors.dark,
        },
    }),
);

export function isDesignModeId(value: unknown): value is DesignModeId {
    return typeof value === "string"
        && designModeIds.some((id) => id === value);
}

export function getDesignMode(id: DesignModeId): DesignModeDefinition {
    return designModes.find((mode) => mode.id === id)!;
}

export const releasedDesignModes = designModes.filter(
    (mode) => mode.releaseStatus === "released",
);

// Metadata is shared by scopes and controllers; callers must not mutate it.
function freezeMetadata(value: object): void {
    Object.freeze(value);
    for (const child of Object.values(value)) {
        if (child && typeof child === "object" && !Object.isFrozen(child)) {
            freezeMetadata(child);
        }
    }
}
for (const value of [
    colorTokens, colormaps, paletteTokens, basicShapeTokens,
    basicDocumentTokens, designModeIds, designModes, releasedDesignModes, designDefaultColormaps, designTypography,
]) freezeMetadata(value);
