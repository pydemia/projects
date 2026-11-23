import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PreferencesPage } from "./PreferencesPage";
import { ProjectsThemeProvider } from "./theme";

describe("preferences page", () => {
    it("shows the account and labeled display, date and time settings", () => {
        render(<ProjectsThemeProvider><PreferencesPage username="사용자 이름" /></ProjectsThemeProvider>);
        expect(screen.getByRole("heading", { level: 1, name: "설정" })).toBeTruthy();
        expect(screen.getByRole("region", { name: "계정" })).toBeTruthy();
        expect(screen.getByRole("region", { name: "화면 설정" })).toBeTruthy();
        expect(within(screen.getByRole("region", { name: "계정" })).getByRole("definition").textContent).toBe("사용자 이름");
        expect(screen.getByRole("region", { name: "날짜와 시간" })).toBeTruthy();
        expect(screen.getByLabelText("UI 모드").id).toBe("preferences-design-mode");
        expect(screen.getByLabelText("색상 테마").id).toBe("preferences-appearance-mode");
        expect(screen.getByText("화면 설정은 현재 브라우저에 저장됩니다.")).toBeTruthy();
        expect(screen.queryByRole("switch")).toBeNull();
        expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
    });

    it("changes real shared theme settings immediately and preserves them on revisit", async () => {
        const user = userEvent.setup();
        const view = render(<ProjectsThemeProvider><PreferencesPage username="계정" /></ProjectsThemeProvider>);
        await user.selectOptions(screen.getByRole("combobox", { name: "UI 모드" }), "basic");
        await user.selectOptions(screen.getByRole("combobox", { name: "색상 테마" }), "dark");
        const scope = view.container.querySelector(".projects-theme");
        expect(scope?.getAttribute("data-design")).toBe("basic");
        expect(scope?.getAttribute("data-appearance")).toBe("dark");
        view.unmount();
        const reopened = render(<ProjectsThemeProvider><PreferencesPage username="계정" /></ProjectsThemeProvider>);
        expect((screen.getByRole("combobox", { name: "UI 모드" }) as HTMLSelectElement).value).toBe("basic");
        expect((screen.getByRole("combobox", { name: "색상 테마" }) as HTMLSelectElement).value).toBe("dark");
        expect(reopened.container.querySelector(".projects-theme")?.getAttribute("data-appearance")).toBe("dark");
    });

    it("retains system appearance choice and enforces released mode appearance limits", async () => {
        const user = userEvent.setup();
        const view = render(<ProjectsThemeProvider><PreferencesPage username="계정" /></ProjectsThemeProvider>);
        await user.selectOptions(screen.getByRole("combobox", { name: "UI 모드" }), "cyber");
        expect((screen.getByRole("combobox", { name: "색상 테마" }) as HTMLSelectElement).value).toBe("system");
        expect((screen.getByRole("option", { name: "Light" }) as HTMLOptionElement).disabled).toBe(true);
        expect(view.container.querySelector(".projects-theme")?.getAttribute("data-appearance")).toBe("dark");
    });

    it("calls the supplied logout action and prevents repeated interaction while busy", async () => {
        const user = userEvent.setup();
        const onLogout = vi.fn();
        const { rerender } = render(<ProjectsThemeProvider><PreferencesPage username="긴_사용자_이름" onLogout={onLogout} /></ProjectsThemeProvider>);
        await user.click(screen.getByRole("button", { name: "로그아웃" }));
        expect(onLogout).toHaveBeenCalledTimes(1);
        rerender(<ProjectsThemeProvider><PreferencesPage username="긴_사용자_이름" onLogout={onLogout} logoutBusy /></ProjectsThemeProvider>);
        const pending = screen.getByRole("button", { name: "로그아웃 중…" });
        expect((pending as HTMLButtonElement).disabled).toBe(true);
        await user.click(pending);
        expect(onLogout).toHaveBeenCalledTimes(1);
    });
});
