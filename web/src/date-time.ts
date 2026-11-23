import { z } from "zod";

export const dateFormats = ["YYYY-MM-DD", "YYYY.MM.DD", "YYYY/MM/DD", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY년 M월 D일"];
export const timeFormats = ["HH:mm", "HH:mm:ss", "A h:mm", "A h:mm:ss", "h:mm a", "h:mm:ss a"];
export const defaultDateTimeSettings = {version: 1 as const, dateFormat: "YYYY-MM-DD", timeFormat: "HH:mm", timeZone: "system"};

export function validTimeZone(value: string): boolean {
    if (value === "system") return true;
    if (value.length > 100 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(value)) return false;
    try { new Intl.DateTimeFormat("en", {timeZone: value}); return true; } catch { return false; }
}
export function resolveTimeZone(value: string): string {
    return value === "system" ? Intl.DateTimeFormat().resolvedOptions().timeZone : value;
}

export function dateFormatError(pattern: string): string | null {
    if (!pattern.trim() || pattern.length > 64 || /[\u0000-\u001f\u007f]/.test(pattern)) return "1~64자의 한 줄 형식을 입력해 주세요.";
    const tokens = pattern.match(/YYYY|YY|MM|M|DD|D/g) ?? [];
    if (/[a-z]/i.test(pattern.replace(/YYYY|YY|MM|M|DD|D/g, ""))) return "날짜에는 YYYY 또는 YY, MM 또는 M, DD 또는 D를 사용해 주세요.";
    if ([/^Y/, /^M/, /^D/].some(kind => tokens.filter(token => kind.test(token)).length !== 1)) return "연·월·일을 각각 한 번씩 포함해 주세요.";
    return null;
}

export function timeFormatError(pattern: string): string | null {
    if (!pattern.trim() || pattern.length > 64 || /[\u0000-\u001f\u007f]/.test(pattern)) return "1~64자의 한 줄 형식을 입력해 주세요.";
    const tokens = pattern.match(/HH|H|hh|h|mm|m|ss|s|A|a/g) ?? [];
    if (/[a-z]/i.test(pattern.replace(/HH|H|hh|h|mm|m|ss|s|A|a/g, ""))) return "시간에는 HH/H, hh/h, mm/m, ss/s, A 또는 a를 사용해 주세요.";
    if (tokens.filter(token => /^[Hh]/.test(token)).length !== 1 || tokens.filter(token => /^m/.test(token)).length !== 1
        || tokens.filter(token => /^s/.test(token)).length > 1 || tokens.filter(token => /^[Aa]/.test(token)).length > 1) return "시·분은 한 번씩, 초와 오전·오후는 최대 한 번 포함해 주세요.";
    const twelveHour = tokens.some(token => /^h/.test(token));
    if (twelveHour !== tokens.some(token => /^[Aa]/.test(token))) return "12시간제(h/hh)는 A 또는 a와 함께, 24시간제(H/HH)는 단독으로 사용해 주세요.";
    return null;
}

export const dateTimeSettingsSchema = z.object({
    version: z.literal(1),
    dateFormat: z.string().refine(value => !dateFormatError(value)),
    timeFormat: z.string().refine(value => !timeFormatError(value)),
    // Older v1 preferences contain only formats; preserve their device timezone.
    timeZone: z.string().refine(validTimeZone).default("system"),
}).strict();
export type DateTimeSettings = z.infer<typeof dateTimeSettingsSchema>;

const pad = (value: number, size = 2) => String(value).padStart(size, "0");
function renderDate(year: number, month: number, day: number, pattern: string) {
    const parts: Record<string, string> = {YYYY: pad(year, 4), YY: pad(year % 100), MM: pad(month), M: String(month), DD: pad(day), D: String(day)};
    return pattern.replace(/YYYY|YY|MM|M|DD|D/g, token => parts[token]!);
}

/** A due/planned date is a calendar day, never an instant to shift by timezone. */
export function formatDateOnly(value: string, pattern = defaultDateTimeSettings.dateFormat, timeZone = "system"): string {
    if (!value) return "—";
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        const instant = parseUtcInstant(value);
        if (!instant) return /\d{4}-\d{2}-\d{2}[T ]/.test(value) ? "날짜 확인 필요" : value;
        const parts = zonedParts(instant, timeZone);
        return renderDate(parts.year, parts.month, parts.day, pattern);
    }
    if (!validCalendarDay(value)) return value;
    return renderDate(Number(match[1]), Number(match[2]), Number(match[3]), pattern);
}

type ZonedParts = {year: number; month: number; day: number; hour: number; minute: number; second: number};
function zonedParts(value: Date, timeZone: string): ZonedParts {
    const parts = new Intl.DateTimeFormat("en", {timeZone: resolveTimeZone(timeZone), calendar: "gregory", numberingSystem: "latn",
        year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23"}).formatToParts(value);
    const numbers = Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
    return {year: numbers.year!, month: numbers.month!, day: numbers.day!, hour: numbers.hour!, minute: numbers.minute!, second: numbers.second!};
}

/** Parse ISO instants into UTC epoch time; legacy zone-less values are UTC. */
export function parseUtcInstant(value: string): Date | null {
    const match = /^(\d{4}-\d{2}-\d{2})[Tt ](\d{2}:\d{2})(:\d{2}(?:\.\d{1,6})?)?([Zz]|[+-]\d{2}:?\d{2})?$/.exec(value);
    if (!match) return null;
    const datePart = match[1]!, clock = match[2]! + (match[3] ?? "");
    if (!validCalendarDay(datePart)) return null;
    const [hours, minutes, seconds = "0"] = clock.split(":");
    if (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) >= 60) return null;
    const zone = (match[4] ?? "Z").toUpperCase();
    if (zone !== "Z") {
        const offset = zone.replace(":", "");
        if (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(3)) > 59) return null;
    }
    const instant = new Date(`${datePart}T${clock}${zone}`);
    return Number.isFinite(instant.valueOf()) ? instant : null;
}

function renderTime(value: ZonedParts, pattern: string): string {
    const hour = value.hour, twelveHour = hour % 12 || 12;
    const parts: Record<string, string> = {HH: pad(hour), H: String(hour), hh: pad(twelveHour), h: String(twelveHour),
        mm: pad(value.minute), m: String(value.minute), ss: pad(value.second), s: String(value.second),
        A: hour < 12 ? "오전" : "오후", a: hour < 12 ? "am" : "pm"};
    return pattern.replace(/HH|H|hh|h|mm|m|ss|s|A|a/g, token => parts[token]!);
}

export function formatTime(value: Date, pattern = defaultDateTimeSettings.timeFormat, timeZone = "system"): string {
    return Number.isFinite(value.valueOf()) ? renderTime(zonedParts(value, timeZone), pattern) : "—";
}

export function dateTimeParts(value: string, settings: DateTimeSettings = defaultDateTimeSettings): {date: string; time: string | null; canonical: string} | null {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const date = formatDateOnly(value, settings.dateFormat);
        return validCalendarDay(value) ? {date, time: null, canonical: value} : null;
    }
    const instant = parseUtcInstant(value);
    if (!instant) return null;
    const parts = zonedParts(instant, settings.timeZone);
    return {date: renderDate(parts.year, parts.month, parts.day, settings.dateFormat), time: renderTime(parts, settings.timeFormat), canonical: instant.toISOString()};
}

function validCalendarDay(value: string): boolean {
    const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!;
}

export function formatDateTime(value: string, settings: DateTimeSettings = defaultDateTimeSettings): string {
    if (!value) return "—";
    const parts = dateTimeParts(value, settings);
    return parts ? [parts.date, parts.time].filter(Boolean).join(" ") : value;
}
