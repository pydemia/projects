import {
    basicDocumentTokens, basicShapeTokens, colorTokens, colormaps,
    getDesignMode, isDesignModeId, paletteTokens,
    type Appearance, type ColorOverrides, type ColorToken,
    type PaletteId, type ThemeSettings, type ThemeTokenMap,
} from "./design-modes";

export type ThemeResolutionOptions = { allowUnreleased?: boolean };
export type ThemeResolution = { settings: ThemeSettings; issues: string[] };
export const defaultThemeSettings: ThemeSettings = Object.freeze({
    version: 1, design: "basic", appearance: "light", colormap: "neutral",
    overrides: Object.freeze({
        light: Object.freeze({}), dark: Object.freeze({}),
    }),
});
const appearances: Appearance[] = ["light", "dark"];
const tokenNames = new Set<string>(colorTokens.map(({ token }) => token));
const paletteIds = new Set<string>(["design", ...colormaps.map(({ id }) => id)]);
const hexColor = /^#[0-9a-fA-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function resolveThemeSettings(
    input: unknown,
    options: ThemeResolutionOptions = {},
): ThemeResolution {
    const issues: string[] = [];
    const source = isRecord(input) ? input : {};
    if (input !== undefined && !isRecord(input)) issues.push("Invalid settings object.");
    if (source.version !== undefined && source.version !== 1) {
        return {
            settings: { ...defaultThemeSettings, overrides: { light: {}, dark: {} } },
            issues: ["Unsupported settings version."],
        };
    }
    let design = isDesignModeId(source.design) ? source.design : "basic";
    if (source.design !== undefined && !isDesignModeId(source.design)) {
        issues.push("Unknown design; using Basic.");
    }
    if (!options.allowUnreleased && getDesignMode(design).releaseStatus !== "released") {
        issues.push("Unreleased design; using Basic.");
        design = "basic";
    }
    let definition = getDesignMode(design);
    let appearance: Appearance = source.appearance === "dark" ? "dark"
        : source.appearance === "light" ? "light" : definition.defaultAppearance;
    if (source.appearance !== undefined && !appearances.includes(source.appearance as Appearance)) {
        issues.push("Unknown appearance; using design default.");
    }
    if (design === "dark-ui" && appearance === "light") {
        design = "basic";
        definition = getDesignMode(design);
        issues.push("Dark UI Light resolves to Basic Light.");
    } else if (!definition.appearances.includes(appearance)) {
        appearance = definition.defaultAppearance;
        issues.push("Unsupported appearance; using design default.");
    }
    const fallbackPalette = design === "basic" ? "neutral" : "design";
    let colormap: PaletteId = fallbackPalette;
    if (typeof source.colormap === "string" && paletteIds.has(source.colormap)) {
        colormap = source.colormap as PaletteId;
    } else if (source.colormap !== undefined) {
        issues.push("Unknown colormap; using design default.");
    }
    const overrides: ColorOverrides = { light: {}, dark: {} };
    if (source.overrides !== undefined) {
        if (!isRecord(source.overrides)) {
            issues.push("Invalid color overrides.");
        } else {
            for (const [mode, values] of Object.entries(source.overrides)) {
                if (!appearances.includes(mode as Appearance) || !isRecord(values)) {
                    issues.push(`Invalid override appearance: ${mode}.`);
                    continue;
                }
                for (const [token, value] of Object.entries(values)) {
                    if (!tokenNames.has(token)) {
                        issues.push(`Unknown color token: ${token}.`);
                    } else if (typeof value !== "string" || !hexColor.test(value)) {
                        issues.push(`Invalid hex color: ${mode}.${token}.`);
                    } else {
                        overrides[mode as Appearance][token as ColorToken] = value.toLowerCase();
                    }
                }
            }
        }
    }
    return { settings: { version: 1, design, appearance, colormap, overrides }, issues };
}

function ownedKey(key: string): boolean {
    if (["design", "mode", "colormap"].includes(key)) return true;
    return appearances.some((appearance) => colorTokens.some(
        ({ token }) => key === `${appearance}.${token.slice(2)}`,
    ));
}

export function parseThemeUrl(
    url: URL,
    options: ThemeResolutionOptions = {},
): ThemeResolution {
    const input: Record<string, unknown> = { version: 1 };
    for (const [key, property] of [
        ["design", "design"], ["mode", "appearance"], ["colormap", "colormap"],
    ] as const) {
        if (url.searchParams.has(key)) input[property] = url.searchParams.get(key);
    }
    const overrides: ColorOverrides = { light: {}, dark: {} };
    for (const appearance of appearances) {
        for (const { token } of colorTokens) {
            const value = url.searchParams.get(`${appearance}.${token.slice(2)}`);
            if (value !== null) overrides[appearance][token] = value;
        }
    }
    input.overrides = overrides;
    const result = resolveThemeSettings(input, options);
    for (const key of new Set(url.searchParams.keys())) {
        if (ownedKey(key) && url.searchParams.getAll(key).length > 1) {
            result.issues.push(`Duplicate theme query: ${key}; using first value.`);
        }
    }
    return result;
}

export function writeThemeUrl(
    url: URL,
    settings: ThemeSettings,
    options: ThemeResolutionOptions = {},
): URL {
    const next = new URL(url.href);
    const value = resolveThemeSettings(settings, options).settings;
    for (const key of [...next.searchParams.keys()]) {
        if (ownedKey(key)) next.searchParams.delete(key);
    }
    if (value.design !== "basic") next.searchParams.set("design", value.design);
    if (value.appearance !== "light") next.searchParams.set("mode", value.appearance);
    const defaultPalette = value.design === "basic" ? "neutral" : "design";
    if (value.colormap !== defaultPalette) next.searchParams.set("colormap", value.colormap);
    for (const appearance of appearances) {
        for (const { token } of colorTokens) {
            const color = value.overrides[appearance][token];
            if (color) next.searchParams.set(`${appearance}.${token.slice(2)}`, color);
        }
    }
    return next;
}

export function resolveThemeTokens(
    settings: ThemeSettings,
    options: ThemeResolutionOptions = {},
): ThemeTokenMap {
    const value = resolveThemeSettings(settings, options).settings;
    const definition = getDesignMode(value.design);
    const tokens: ThemeTokenMap = {
        ...basicShapeTokens,
        ...basicDocumentTokens,
        ...(value.appearance === "dark" ? {
            "--shadow-float": "0 4px 16px rgb(0 0 0 / 20%)",
            "--overlay": "rgb(0 0 0 / 65%)",
        } : {}),
        ...definition.tokens,
    };
    const colors = value.colormap === "design"
        ? definition.palettes[value.appearance]
        : paletteTokens[value.colormap][value.appearance];
    for (const { token } of colorTokens) {
        const paletteToken = `--palette-${token.slice(2)}` as const;
        tokens[paletteToken] = colors[token];
        tokens[token] = value.overrides[value.appearance][token]
            ?? `var(${paletteToken})`;
        const alias = token === "--message-user-background"
            ? "--color-message-user" : `--color-${token.slice(2)}` as const;
        tokens[alias] = `var(${token})`;
    }
    tokens["--radius-sm"] = "var(--radius)";
    tokens["--radius-md"] = value.design === "basic"
        ? "0.375rem" : "var(--radius)";
    tokens["--font-sans"] = "var(--font-ui)";
    tokens["--text-sm"] = "var(--type-body-size)";
    tokens["--text-xs"] = "var(--type-caption-size)";
    return tokens;
}
