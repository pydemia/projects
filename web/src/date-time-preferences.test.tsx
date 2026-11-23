import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PreferencesPage } from "./PreferencesPage";
import { DateTimeValue, dateTimeStorageKey, saveDateTimeSettings } from "./date-time-settings";
import { defaultDateTimeSettings } from "./date-time";
import { ProjectsThemeProvider } from "./theme";

const timestamp = new Date(2026, 10, 3, 16, 5, 9).toISOString();
const mount = () => render(<ProjectsThemeProvider><PreferencesPage username="사용자" />
    <output data-testid="day"><DateTimeValue value="2026-11-03" dateOnly /></output>
    <output data-testid="timestamp"><DateTimeValue value={timestamp} /></output></ProjectsThemeProvider>);
afterEach(() => { saveDateTimeSettings(defaultDateTimeSettings); localStorage.clear(); });

it("previews formats, applies shared displays without server writes, and keeps preferences on revisit", () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const first = mount();
    fireEvent.change(screen.getByLabelText("날짜 표시 형식"), {target: {value: "DD/MM/YYYY"}});
    fireEvent.change(screen.getByLabelText("시간 표시 형식"), {target: {value: "A h:mm:ss"}});
    expect(screen.getByTestId("day").textContent).toBe("2026-11-03");
    fireEvent.click(screen.getByRole("button", {name: "형식 적용"}));
    expect(screen.getByTestId("day").textContent).toBe("03/11/2026");
    expect(screen.getByTestId("timestamp").querySelector("time")?.getAttribute("aria-label")).toBe("03/11/2026 오후 4:05:09");
    expect(fetchMock).not.toHaveBeenCalled();
    first.unmount(); mount();
    expect((screen.getByLabelText("날짜 표시 형식") as HTMLSelectElement).value).toBe("DD/MM/YYYY");
    expect(screen.getByTestId("timestamp").querySelector("time")?.getAttribute("aria-label")).toBe("03/11/2026 오후 4:05:09");
});
it("validates custom definitions before applying and supports literal Korean separators", () => {
    mount();
    fireEvent.change(screen.getByLabelText("날짜 표시 형식"), {target: {value: "custom"}});
    fireEvent.change(screen.getByLabelText("시간 표시 형식"), {target: {value: "custom"}});
    fireEvent.change(screen.getByLabelText("사용자 지정 날짜 형식"), {target: {value: "YYYY/MM"}});
    fireEvent.change(screen.getByLabelText("사용자 지정 시간 형식"), {target: {value: "hh:mm"}});
    expect((screen.getByRole("button", {name: "형식 적용"}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText("사용자 지정 시간 형식").getAttribute("aria-invalid")).toBe("true");
    expect(localStorage.getItem(dateTimeStorageKey)).toBeNull();
    fireEvent.change(screen.getByLabelText("사용자 지정 날짜 형식"), {target: {value: "DD.MM.YYYY"}});
    fireEvent.change(screen.getByLabelText("사용자 지정 시간 형식"), {target: {value: "hh시 mm분 A"}});
    fireEvent.click(screen.getByRole("button", {name: "형식 적용"}));
    expect(screen.getByTestId("timestamp").querySelector("time")?.getAttribute("aria-label")).toBe("03.11.2026 04시 05분 오후");
    fireEvent.click(screen.getByRole("button", {name: "기본값 선택"}));
    fireEvent.click(screen.getByRole("button", {name: "형식 적용"}));
    expect(screen.getByTestId("timestamp").querySelector("time")?.getAttribute("aria-label")).toBe("2026-11-03 16:05");
});
it("rejects corrupt storage and responds to other-tab changes and storage clearing", () => {
    localStorage.setItem(dateTimeStorageKey, JSON.stringify({version: 99, dateFormat: "broken", timeFormat: "broken"}));
    mount();
    expect(screen.getByTestId("day").textContent).toBe("2026-11-03");
    act(() => {
        localStorage.setItem(dateTimeStorageKey, JSON.stringify({...defaultDateTimeSettings, dateFormat: "MM/DD/YYYY", timeFormat: "h:mm a"}));
        window.dispatchEvent(new StorageEvent("storage", {key: dateTimeStorageKey}));
    });
    expect(screen.getByTestId("timestamp").querySelector("time")?.getAttribute("aria-label")).toBe("11/03/2026 4:05 pm");
    act(() => {localStorage.clear(); window.dispatchEvent(new StorageEvent("storage", {key: null}));});
    expect(screen.getByTestId("day").textContent).toBe("2026-11-03");
});
it("reports storage failure, applies in memory, and lets the user retry persistence", () => {
    mount();
    fireEvent.change(screen.getByLabelText("날짜 표시 형식"), {target: {value: "DD/MM/YYYY"}});
    const denied = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {throw new DOMException("Quota", "QuotaExceededError");});
    fireEvent.click(screen.getByRole("button", {name: "형식 적용"}));
    expect(screen.getByTestId("day").textContent).toBe("03/11/2026");
    expect(screen.getByRole("alert").textContent).toContain("브라우저에 저장하지 못했습니다");
    denied.mockRestore();
    fireEvent.click(screen.getByRole("button", {name: "형식 적용"}));
    expect(JSON.parse(localStorage.getItem(dateTimeStorageKey)!).dateFormat).toBe("DD/MM/YYYY");
    expect((screen.getByRole("button", {name: "형식 적용"}) as HTMLButtonElement).disabled).toBe(true);
});
it("applies an explicit timezone across reload and renders date/time as separate UI elements", () => {
    const first = render(<ProjectsThemeProvider><PreferencesPage username="사용자" />
        <output data-testid="instant"><DateTimeValue value="2026-11-03T16:05:09+09:00" /></output>
        <output data-testid="date-only"><DateTimeValue value="2026-11-03" dateOnly /></output></ProjectsThemeProvider>);
    fireEvent.change(screen.getByLabelText("시간대"), {target: {value: "UTC"}});
    fireEvent.click(screen.getByRole("button", {name: "형식 적용"}));
    const time = screen.getByTestId("instant").querySelector("time")!;
    expect(time.querySelector(".date-time-date")?.textContent).toBe("2026-11-03");
    expect(time.querySelector(".date-time-clock")?.textContent).toBe("07:05");
    expect(Array.from(time.childNodes).every(node => node.nodeType === Node.ELEMENT_NODE)).toBe(true);
    expect(time.textContent).not.toMatch(/T|\+09:00/);
    expect(time.getAttribute("datetime")).toBe("2026-11-03T07:05:09.000Z");
    expect(screen.getByTestId("date-only").textContent).toBe("2026-11-03");
    first.unmount();
    mount();
    expect((screen.getByLabelText("시간대") as HTMLSelectElement).value).toBe("UTC");
});
