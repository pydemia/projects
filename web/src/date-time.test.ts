import { describe, expect, it } from "vitest";
import { dateFormatError, dateFormats, dateTimeParts, dateTimeSettingsSchema, defaultDateTimeSettings, formatDateOnly, formatDateTime, formatTime, parseUtcInstant, timeFormatError, timeFormats } from "./date-time";

describe("date and time display", () => {
    it("formats calendar days independently of timezone, including leap years and early years", () => {
        expect(dateFormats.map(pattern => formatDateOnly("2026-11-03", pattern))).toEqual([
            "2026-11-03", "2026.11.03", "2026/11/03", "03/11/2026", "11/03/2026", "2026년 11월 3일",
        ]);
        expect(formatDateOnly("2024-02-29", "YY년 M월 D일")).toBe("24년 2월 29일");
        expect(formatDateOnly("0001-01-01", "YYYY/MM/DD")).toBe("0001/01/01");
        expect(formatDateOnly("2000-02-29", "DD.MM.YYYY")).toBe("29.02.2000");
        expect(formatDateTime("2026-11-03", {...defaultDateTimeSettings, dateFormat: "DD/MM/YYYY"})).toBe("03/11/2026");
    });
    it.each(["1900-02-29", "2026-02-29", "2026-13-01", "2026-00-10", "2026-11-31", "0000-01-01", "not-a-date"])("preserves invalid input %s instead of inventing another date", value => {
        expect(formatDateOnly(value, "DD/MM/YYYY")).toBe(value);
    });
    it("uses local time for timestamps and supports 12/24 hours, seconds, midnight and noon", () => {
        const afternoon = new Date(2026, 10, 3, 16, 5, 9);
        expect(timeFormats.map(pattern => formatTime(afternoon, pattern))).toEqual(["16:05", "16:05:09", "오후 4:05", "오후 4:05:09", "4:05 pm", "4:05:09 pm"]);
        expect(formatDateTime(afternoon.toISOString())).toBe("2026-11-03 16:05");
        expect(formatTime(new Date(2026, 10, 3, 0, 0), "A hh:mm")).toBe("오전 12:00");
        expect(formatTime(new Date(2026, 10, 3, 12, 0), "A hh:mm:ss")).toBe("오후 12:00:00");
        expect(formatTime(new Date(2026, 10, 3, 0, 0), "HH:mm")).toBe("00:00");
        expect(formatDateTime("invalid")).toBe("invalid");
        expect(formatDateTime("")).toBe("—");
    });
    it("validates supported patterns and rejects ambiguous or unsupported definitions", () => {
        for (const pattern of dateFormats) expect(dateFormatError(pattern)).toBeNull();
        for (const pattern of timeFormats) expect(timeFormatError(pattern)).toBeNull();
        expect(dateFormatError("YYYY년 M월 D일")).toBeNull();
        expect(timeFormatError("hh시 mm분 ss초 A")).toBeNull();
        for (const pattern of ["", "YYYY/MM", "YYYY-YY-MM-DD", "YYYY-MMM-DD", "YYYY\nMM\nDD", "x".repeat(65)]) expect(dateFormatError(pattern)).not.toBeNull();
        for (const pattern of ["", "HH:MM", "hh:mm", "HH:mm A", "HH:mm:ss:ss", "HH:mm\nss"]) expect(timeFormatError(pattern)).not.toBeNull();
        expect(dateTimeSettingsSchema.safeParse({...defaultDateTimeSettings, timeFormat: "hh:mm"}).success).toBe(false);
        expect(dateTimeSettingsSchema.safeParse({...defaultDateTimeSettings, password: "unexpected"}).success).toBe(false);
    });
    it("normalizes UTC, offset and legacy zone-less instants once and hides ISO syntax", () => {
        const settings = {...defaultDateTimeSettings, timeZone: "Asia/Seoul", timeFormat: "HH:mm:ss"};
        for (const value of ["2026-11-03T07:05:09Z", "2026-11-03T16:05:09+09:00", "2026-11-03 07:05:09", "2026-11-03T16:05:09+0900"]) {
            expect(parseUtcInstant(value)?.toISOString()).toBe("2026-11-03T07:05:09.000Z");
            expect(dateTimeParts(value, settings)).toEqual({date: "2026-11-03", time: "16:05:09", canonical: "2026-11-03T07:05:09.000Z"});
        }
        expect(formatDateTime("2026-11-03T07:05:09Z", {...settings, timeZone: "UTC"})).toBe("2026-11-03 07:05:09");
        expect(formatDateTime("2026-11-03T07:05:09Z", {...settings, timeZone: "America/Los_Angeles"})).toBe("2026-11-02 23:05:09");
        expect(formatDateOnly("2026-11-03T07:05:09Z", "YYYY-MM-DD", "America/Los_Angeles")).toBe("2026-11-02");
        expect(formatDateOnly("2026-11-03", "YYYY-MM-DD", "America/Los_Angeles")).toBe("2026-11-03");
    });
    it("handles daylight saving transitions using the selected IANA timezone", () => {
        const settings = {...defaultDateTimeSettings, timeZone: "America/New_York"};
        expect(formatDateTime("2026-03-08T06:59:00Z", settings)).toBe("2026-03-08 01:59");
        expect(formatDateTime("2026-03-08T07:00:00Z", settings)).toBe("2026-03-08 03:00");
        expect(formatDateTime("2026-11-01T05:30:00Z", settings)).toBe("2026-11-01 01:30");
        expect(formatDateTime("2026-11-01T06:30:00Z", settings)).toBe("2026-11-01 01:30");
        expect(formatDateTime("2026-11-03T00:00:00Z", {...settings, timeZone: "Asia/Kolkata"})).toBe("2026-11-03 05:30");
    });
    it("preserves old v1 formats and rejects unsupported zones or invalid instants", () => {
        expect(dateTimeSettingsSchema.parse({version: 1, dateFormat: "DD/MM/YYYY", timeFormat: "h:mm a"})).toEqual({
            version: 1, dateFormat: "DD/MM/YYYY", timeFormat: "h:mm a", timeZone: "system",
        });
        expect(dateTimeSettingsSchema.safeParse({...defaultDateTimeSettings, timeZone: "+09:00"}).success).toBe(false);
        expect(dateTimeSettingsSchema.safeParse({...defaultDateTimeSettings, timeZone: "Invalid/Place"}).success).toBe(false);
        for (const value of ["2026-02-30T00:00:00Z", "2026-11-03T24:00:00Z", "2026-11-03T11:60:00Z", "2026-11-03T11:00:00+99:00"])
            expect(dateTimeParts(value)).toBeNull();
    });
});
