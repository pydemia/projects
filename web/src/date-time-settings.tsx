import { useSyncExternalStore } from "react";
import { dateTimeParts, dateTimeSettingsSchema, defaultDateTimeSettings, type DateTimeSettings } from "./date-time";
import "./date-time.css";

export const dateTimeStorageKey = "projects:date-time-format:v1";
let cachedRaw: string | null | undefined;
let cachedSettings: DateTimeSettings = defaultDateTimeSettings;
const subscribers = new Set<() => void>();
function readRaw() {
    try { return localStorage.getItem(dateTimeStorageKey); } catch { return null; }
}
export function dateTimeSnapshot(): DateTimeSettings {
    const raw = readRaw();
    if (raw === cachedRaw) return cachedSettings;
    cachedRaw = raw;
    try {
        const parsed = dateTimeSettingsSchema.safeParse(raw ? JSON.parse(raw) : null);
        cachedSettings = parsed.success ? parsed.data : defaultDateTimeSettings;
    } catch { cachedSettings = defaultDateTimeSettings; }
    return cachedSettings;
}
function onStorage(event: StorageEvent) {
    if (event.key !== null && event.key !== dateTimeStorageKey) return;
    cachedRaw = undefined;
    subscribers.forEach(notify => notify());
}
function subscribe(notify: () => void) {
    subscribers.add(notify);
    if (subscribers.size === 1) window.addEventListener("storage", onStorage);
    return () => {
        subscribers.delete(notify);
        if (!subscribers.size) window.removeEventListener("storage", onStorage);
    };
}
export function saveDateTimeSettings(input: DateTimeSettings): boolean {
    const settings = dateTimeSettingsSchema.parse(input);
    const raw = JSON.stringify(settings);
    const previousRaw = readRaw();
    let persisted = false;
    try { localStorage.setItem(dateTimeStorageKey, raw); persisted = true; } catch { /* Apply in this tab and report persistence failure. */ }
    cachedRaw = persisted ? raw : previousRaw;
    cachedSettings = settings;
    subscribers.forEach(notify => notify());
    return persisted;
}
export function useDateTimeSettings() {
    return useSyncExternalStore(subscribe, dateTimeSnapshot, () => defaultDateTimeSettings);
}
export function DateTimeValue({value, dateOnly = false, settings: override}: {value: string; dateOnly?: boolean; settings?: DateTimeSettings}) {
    const settings = useDateTimeSettings();
    const parts = dateTimeParts(value, override ?? settings);
    if (!parts) return <span className="date-time-invalid">{value ? "날짜 확인 필요" : "—"}</span>;
    const time = dateOnly ? null : parts.time;
    return <time className="date-time-value" dateTime={parts.canonical} aria-label={[parts.date, time].filter(Boolean).join(" ")}>
        <span className="date-time-date">{parts.date}</span>{time && <span className="date-time-clock">{time}</span>}
    </time>;
}
