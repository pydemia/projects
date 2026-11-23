import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthenticationRecovery } from "./AuthenticationRecovery";
import { reauthentication } from "./reauthentication";
import { Modal } from "./ui";
import { ProjectsThemeProvider } from "./theme";

afterEach(() => { reauthentication.configure(null); });

it("places blocked recovery inside the active editor dialog so its retry remains accessible", async () => {
    reauthentication.configure({mode: "password", userId: "owner"});
    const unregister = reauthentication.register(() => false);
    try {
        render(<ProjectsThemeProvider><Modal title="작성 중인 항목" onClose={() => undefined}>
            <input aria-label="보관할 입력" defaultValue="초안" />
        </Modal><AuthenticationRecovery /></ProjectsThemeProvider>);
        const editor = screen.getByRole("dialog", {name: "작성 중인 항목"});
        const input = screen.getByLabelText("보관할 입력");
        act(() => { reauthentication.required(); });
        const retry = await screen.findByRole("button", {name: "다시 로그인"});
        expect(editor.contains(retry)).toBe(true);
        expect(within(editor).getByRole("alert").textContent).toContain("보관하지 못해");
        expect(screen.getByLabelText("보관할 입력")).toBe(input);
        const run = vi.spyOn(reauthentication, "run").mockResolvedValue();
        fireEvent.click(retry);
        expect(reauthentication.snapshot().phase).toBe("required");
        run.mockRestore();
    } finally { unregister(); }
});
