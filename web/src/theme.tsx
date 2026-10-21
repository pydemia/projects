import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { ThemeScope } from "./pydemia-ui/foundation/theme-scope";
import { NativeSelect } from "./pydemia-ui/native-select";
import { defaultThemeSettings, resolveThemeSettings } from "./pydemia-ui/foundation/design-mode-settings";
import { releasedDesignModes, type Appearance, type DesignModeId, type ThemeSettings } from "./pydemia-ui/foundation/design-modes";

const storageKey = "projects:ui-theme:v1";
const ThemeContext = createContext<{
    settings: ThemeSettings;
    setDesign: (design: DesignModeId) => void;
    setAppearance: (appearance: Appearance) => void;
} | null>(null);

function readSettings(): ThemeSettings {
    try {
        const saved = localStorage.getItem(storageKey);
        return saved ? resolveThemeSettings(JSON.parse(saved)).settings : defaultThemeSettings;
    } catch {
        return defaultThemeSettings;
    }
}

export function ProjectsThemeProvider({ children }: { children: ReactNode }) {
    const [settings, updateSettings] = useState<ThemeSettings>(readSettings);
    function save(input: Partial<ThemeSettings>) {
        updateSettings(current => {
            const next = resolveThemeSettings({ ...current, ...input,
                colormap: input.design && input.design !== current.design ? "design" : current.colormap,
            }).settings;
            try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Private browsing may block storage. */ }
            return next;
        });
    }
    const value = useMemo(() => ({
        settings,
        setDesign: (design: DesignModeId) => save({ design }),
        setAppearance: (appearance: Appearance) => save({ appearance }),
    }), [settings]);
    return <ThemeContext.Provider value={value}>
        <ThemeScope settings={settings} className="projects-theme">{children}</ThemeScope>
    </ThemeContext.Provider>;
}

export function ThemeControls() {
    const theme = useContext(ThemeContext);
    if (!theme) throw new Error("ThemeControls requires ProjectsThemeProvider");
    const selected = releasedDesignModes.find(mode => mode.id === theme.settings.design);
    return <div className="theme-controls" role="group" aria-label="화면 스타일 설정">
        <label className="sr-only" htmlFor="design-mode">UI 모드</label>
        <NativeSelect id="design-mode" aria-label="UI 모드" value={theme.settings.design}
            onChange={event => theme.setDesign(event.target.value as DesignModeId)}>
            {releasedDesignModes.map(mode => <option key={mode.id} value={mode.id}>{mode.name}</option>)}
        </NativeSelect>
        <label className="sr-only" htmlFor="appearance-mode">색상 테마</label>
        <NativeSelect id="appearance-mode" aria-label="색상 테마" value={theme.settings.appearance}
            onChange={event => theme.setAppearance(event.target.value as Appearance)}>
            <option value="light" disabled={!selected?.appearances.includes("light")}>Light</option>
            <option value="dark" disabled={!selected?.appearances.includes("dark")}>Dark</option>
        </NativeSelect>
    </div>;
}
