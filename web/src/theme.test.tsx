import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ProjectsThemeProvider, ThemeControls } from "./theme";
import { Button } from "./pydemia-ui/button";

beforeEach(() => localStorage.clear());

describe("shared UI theme", () => {
    it("applies a released mode, persists dark appearance, and keeps shared controls", async () => {
        const user = userEvent.setup();
        const view = render(<ProjectsThemeProvider><ThemeControls /><Button>실행</Button></ProjectsThemeProvider>);
        const scope = view.container.querySelector(".projects-theme");
        expect(scope?.getAttribute("data-design")).toBe("basic");
        expect(screen.getByRole("button", { name: "실행" }).getAttribute("data-ui")).toBe("button");

        await user.selectOptions(screen.getByRole("combobox", { name: "UI 모드" }), "glass");
        await user.selectOptions(screen.getByRole("combobox", { name: "색상 테마" }), "dark");
        expect(scope?.getAttribute("data-design")).toBe("glass");
        expect(scope?.getAttribute("data-appearance")).toBe("dark");

        view.unmount();
        const reopened = render(<ProjectsThemeProvider><ThemeControls /></ProjectsThemeProvider>);
        expect(reopened.container.querySelector(".projects-theme")?.getAttribute("data-design")).toBe("glass");
        expect(reopened.container.querySelector(".projects-theme")?.getAttribute("data-appearance")).toBe("dark");
    });

    it("keeps dark-only modes dark", async () => {
        const user = userEvent.setup();
        const view = render(<ProjectsThemeProvider><ThemeControls /></ProjectsThemeProvider>);
        await user.selectOptions(screen.getByRole("combobox", { name: "UI 모드" }), "cyber");
        expect(view.container.querySelector(".projects-theme")?.getAttribute("data-appearance")).toBe("dark");
        expect((screen.getByRole("option", { name: "Light" }) as HTMLOptionElement).disabled).toBe(true);
    });
});
