import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { ThemeScope } from "./pydemia-ui/foundation/theme-scope";
import { NativeSelect } from "./pydemia-ui/native-select";
import { defaultThemeSettings, resolveThemeSettings } from "./pydemia-ui/foundation/design-mode-settings";
import { getDesignMode, releasedDesignModes, type Appearance, type DesignModeId, type ThemeSettings } from "./pydemia-ui/foundation/design-modes";
import { pydemiaGlassColors } from "./pydemia-palette";

type AppearancePreference = Appearance | "system";
type ProjectsThemeSettings = Omit<ThemeSettings, "appearance"> & { appearance: AppearancePreference };

const storageKey = "projects:ui-theme:v2";
const legacyStorageKey = "projects:ui-theme:v1";
const projectsDefaults: ProjectsThemeSettings = {
    ...defaultThemeSettings, design: "glass", appearance: "system", colormap: "pydemia",
    overrides: pydemiaGlassColors,
};
const systemQuery = "(prefers-color-scheme: dark)";

const ThemeContext = createContext<{
    settings: ProjectsThemeSettings;
    setDesign: (design: DesignModeId) => void;
    setAppearance: (appearance: AppearancePreference) => void;
} | null>(null);

function resolveProjectsTheme(input: Record<string, unknown>): ProjectsThemeSettings {
    const preference = input.appearance === "light" || input.appearance === "dark"
        ? input.appearance : "system";
    const resolved = resolveThemeSettings({
        ...defaultThemeSettings, design: projectsDefaults.design, colormap: projectsDefaults.colormap,
        ...input, appearance: preference === "system" ? undefined : preference,
    }).settings;
    return { ...resolved, appearance: preference === "system" ? "system" : resolved.appearance,
        colormap: resolved.design === "glass" ? "pydemia" : resolved.colormap,
        overrides: resolved.design === "glass" ? pydemiaGlassColors : resolved.overrides };
}

function readSettings(): ProjectsThemeSettings {
    try {
        const saved = localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey);
        if (!saved) return projectsDefaults;
        const parsed: unknown = JSON.parse(saved);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
            || !("version" in parsed) || parsed.version !== 1) return projectsDefaults;
        return resolveProjectsTheme({ ...parsed });
    } catch {
        return projectsDefaults;
    }
}

function systemIsDark(): boolean {
    return typeof window.matchMedia === "function" && window.matchMedia(systemQuery).matches;
}

function subscribeSystemAppearance(onChange: () => void): () => void {
    if (typeof window.matchMedia !== "function") return () => {};
    const media = window.matchMedia(systemQuery);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
}

export function ProjectsThemeProvider({ children }: { children: ReactNode }) {
    const [settings, updateSettings] = useState<ProjectsThemeSettings>(readSettings);
    const systemDark = useSyncExternalStore(subscribeSystemAppearance, systemIsDark, () => false);
    const resolved = useMemo(() => {
        const definition = getDesignMode(settings.design);
        const preferred = settings.appearance === "system" ? (systemDark ? "dark" : "light") : settings.appearance;
        return resolveThemeSettings({
            ...settings,
            appearance: definition.appearances.includes(preferred) ? preferred : definition.defaultAppearance,
        }).settings;
    }, [settings, systemDark]);
    useEffect(() => {
        try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Private browsing may block storage. */ }
    }, [settings]);
    function save(input: Partial<ProjectsThemeSettings>) {
        updateSettings(current => {
            const designChanged = input.design && input.design !== current.design;
            return resolveProjectsTheme({ ...current, ...input,
                colormap: designChanged ? "design" : current.colormap,
                overrides: designChanged ? { light: {}, dark: {} } : current.overrides,
            });
        });
    }
    const value = useMemo(() => ({
        settings,
        setDesign: (design: DesignModeId) => save({ design }),
        setAppearance: (appearance: AppearancePreference) => save({ appearance }),
    }), [settings]);
    return <ThemeContext.Provider value={value}>
        <ThemeScope settings={resolved} className="projects-theme">{children}</ThemeScope>
    </ThemeContext.Provider>;
}

export function ThemeControls({ idPrefix = "" }: { idPrefix?: string }) {
    const theme = useContext(ThemeContext);
    if (!theme) throw new Error("ThemeControls requires ProjectsThemeProvider");
    const selected = releasedDesignModes.find(mode => mode.id === theme.settings.design);
    return <div className="theme-controls" role="group" aria-label="화면 스타일 설정">
        <label className="sr-only" htmlFor={`${idPrefix}design-mode`}>UI 모드</label>
        <NativeSelect id={`${idPrefix}design-mode`} aria-label="UI 모드" value={theme.settings.design}
            onChange={event => theme.setDesign(event.target.value as DesignModeId)}>
            {releasedDesignModes.map(mode => <option key={mode.id} value={mode.id}>{mode.name}</option>)}
        </NativeSelect>
        <label className="sr-only" htmlFor={`${idPrefix}appearance-mode`}>색상 테마</label>
        <NativeSelect id={`${idPrefix}appearance-mode`} aria-label="색상 테마" value={theme.settings.appearance}
            onChange={event => theme.setAppearance(event.target.value as AppearancePreference)}>
            <option value="system">System</option>
            <option value="light" disabled={!selected?.appearances.includes("light")}>Light</option>
            <option value="dark" disabled={!selected?.appearances.includes("dark")}>Dark</option>
        </NativeSelect>
    </div>;
}
