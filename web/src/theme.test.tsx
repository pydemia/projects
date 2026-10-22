import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsThemeProvider, ThemeControls } from "./theme";
import { Button } from "./pydemia-ui/button";

function systemAppearance(initialDark = false) {
    let dark = initialDark;
    const media = new EventTarget();
    Object.defineProperty(media, "matches", { get: () => dark });
    vi.stubGlobal("matchMedia", vi.fn(() => media));
    return {
        media,
        change(next: boolean) {
            dark = next;
            act(() => { media.dispatchEvent(new Event("change")); });
        },
    };
}

beforeEach(() => { localStorage.clear(); systemAppearance(); });

describe("shared UI theme", () => {
    it("applies a released mode, persists dark appearance, and keeps shared controls", async () => {
        const user = userEvent.setup();
        const view = render(<ProjectsThemeProvider><ThemeControls /><Button>실행</Button></ProjectsThemeProvider>);
        const scope = view.container.querySelector(".projects-theme");
        expect(scope?.getAttribute("data-design")).toBe("glass");
        expect(scope?.getAttribute("data-colormap")).toBe("pydemia");
        expect((scope as HTMLElement).style.getPropertyValue("--accent")).toBe("#3863af");
        expect((screen.getByRole("combobox", { name: "색상 테마" }) as HTMLSelectElement).value).toBe("system");
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

    it("follows system changes and updates portaled theme surfaces", () => {
        const system = systemAppearance(true);
        const view = render(<ProjectsThemeProvider><ThemeControls /></ProjectsThemeProvider>);
        const scope = view.container.querySelector(".projects-theme");
        expect(scope?.getAttribute("data-appearance")).toBe("dark");
        expect(document.querySelector("[data-theme-portal]")?.getAttribute("data-colormap")).toBe("pydemia");
        expect((scope as HTMLElement).style.getPropertyValue("--accent")).toBe("#7597d2");
        system.change(false);
        expect(scope?.getAttribute("data-appearance")).toBe("light");
        expect(document.querySelector("[data-theme-portal]")?.getAttribute("data-appearance")).toBe("light");
        expect((screen.getByRole("combobox", { name: "색상 테마" }) as HTMLSelectElement).value).toBe("system");
    });

    it("respects explicit appearance and resumes system tracking when selected", async () => {
        const system = systemAppearance();
        const user = userEvent.setup();
        const view = render(<ProjectsThemeProvider><ThemeControls /></ProjectsThemeProvider>);
        const appearance = screen.getByRole("combobox", { name: "색상 테마" });
        await user.selectOptions(appearance, "light");
        system.change(true);
        expect(view.container.querySelector(".projects-theme")?.getAttribute("data-appearance")).toBe("light");
        await user.selectOptions(appearance, "system");
        expect(view.container.querySelector(".projects-theme")?.getAttribute("data-appearance")).toBe("dark");
        view.unmount();
        const reopened = render(<ProjectsThemeProvider><ThemeControls /></ProjectsThemeProvider>);
        expect((screen.getByRole("combobox", { name: "색상 테마" }) as HTMLSelectElement).value).toBe("system");
        expect(reopened.container.querySelector(".projects-theme")?.getAttribute("data-appearance")).toBe("dark");
    });

    it("preserves saved choices while migrating glass to the blue palette", () => {
        localStorage.setItem("projects:ui-theme:v1", JSON.stringify({
            version: 1, design: "glass", appearance: "dark", colormap: "design",
        }));
        const view = render(<ProjectsThemeProvider><ThemeControls /></ProjectsThemeProvider>);
        const scope = view.container.querySelector(".projects-theme");
        expect(scope?.getAttribute("data-design")).toBe("glass");
        expect(scope?.getAttribute("data-colormap")).toBe("pydemia");
        expect(scope?.getAttribute("data-appearance")).toBe("dark");
        expect(localStorage.getItem("projects:ui-theme:v2")).toContain('"appearance":"dark"');
    });

    it.each(["{broken", JSON.stringify({ version: 99, design: "cyber" })])(
        "recovers invalid saved settings to the Projects defaults", saved => {
            localStorage.setItem("projects:ui-theme:v2", saved);
            const view = render(<ProjectsThemeProvider><ThemeControls /></ProjectsThemeProvider>);
            expect(view.container.querySelector(".projects-theme")?.getAttribute("data-design")).toBe("glass");
            expect((screen.getByRole("combobox", { name: "색상 테마" }) as HTMLSelectElement).value).toBe("system");
        },
    );

    it("removes the system appearance listener when unmounted", () => {
        const system = systemAppearance();
        const removeListener = vi.spyOn(system.media, "removeEventListener");
        const view = render(<ProjectsThemeProvider><ThemeControls /></ProjectsThemeProvider>);
        view.unmount();
        expect(removeListener).toHaveBeenCalledWith("change", expect.any(Function));
    });

    it("keeps system preference across dark-only modes and restores the glass palette", async () => {
        const user = userEvent.setup();
        const view = render(<ProjectsThemeProvider><ThemeControls /></ProjectsThemeProvider>);
        const design = screen.getByRole("combobox", { name: "UI 모드" });
        await user.selectOptions(design, "dark-ui");
        const scope = view.container.querySelector(".projects-theme");
        expect(scope?.getAttribute("data-design")).toBe("dark-ui");
        expect(scope?.getAttribute("data-appearance")).toBe("dark");
        expect((screen.getByRole("combobox", { name: "색상 테마" }) as HTMLSelectElement).value).toBe("system");
        await user.selectOptions(design, "basic");
        expect((scope as HTMLElement).style.getPropertyValue("--accent")).not.toBe("#3863af");
        await user.selectOptions(design, "glass");
        expect(scope?.getAttribute("data-appearance")).toBe("light");
        expect((scope as HTMLElement).style.getPropertyValue("--accent")).toBe("#3863af");
    });
});
