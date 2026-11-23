import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Markdown } from "./ui";

vi.mock("./MarkdownContent", () => { throw new Error("auth proxy rejected lazy chunk"); });

it("keeps the editing tree alive when an unloaded Markdown chunk fails and the session probe confirms expiry", async () => {
    const expired = vi.fn();
    window.addEventListener("projects:unauthorized", expired);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({detail: "expired"}), {status: 401}));
    vi.stubGlobal("fetch", fetchMock);
    try {
        render(<><input aria-label="활성 초안" defaultValue="작성 중" /><Markdown body="아직 표시하지 않은 본문" /></>);
        const editor = screen.getByLabelText("활성 초안");
        await screen.findByText("로그인 상태를 확인하고 있습니다…");
        expect(screen.getByLabelText("활성 초안")).toBe(editor);
        expect(expired).toHaveBeenCalledOnce();
        expect(fetchMock.mock.calls[0]![0]).toBe("/api/session");
    } finally { window.removeEventListener("projects:unauthorized", expired); }
});
