import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InlineBodyEdit, InlineTextEdit } from "./InlineEdit";

describe("inline title editing", () => {
    it("opens from the value by keyboard, saves with Enter and restores focus", async () => {
        const user = userEvent.setup();
        const save = vi.fn().mockResolvedValue(undefined);
        const begin = vi.fn();
        const editingChange = vi.fn();
        const { rerender } = render(<InlineTextEdit label="제목" value="원래 제목" onSave={save}
            onBegin={begin} onEditingChange={editingChange} variant="title" />);
        await user.tab();
        await user.keyboard("{Enter}");
        expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "제목" }));
        expect(begin).toHaveBeenCalledTimes(1);
        await user.keyboard("새 제목");
        await user.keyboard("{Enter}");
        expect(save).toHaveBeenCalledWith("새 제목");
        expect(editingChange.mock.calls).toEqual([[true], [false]]);
        rerender(<InlineTextEdit label="제목" value="새 제목" onSave={save} />);
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "제목 수정" }));
    });

    it("retains the draft through server refresh and failure, reports the actual error and retries", async () => {
        const user = userEvent.setup();
        const save = vi.fn().mockRejectedValueOnce(new Error("다른 변경과 충돌했습니다."))
            .mockResolvedValueOnce(undefined);
        const changes = vi.fn();
        const props = { label: "프로젝트명", value: "기존 이름", onSave: save, onDraftChange: changes };
        const { rerender } = render(<InlineTextEdit {...props} />);
        await user.click(screen.getByRole("button", { name: "프로젝트명 수정" }));
        await user.clear(screen.getByRole("textbox"));
        await user.type(screen.getByRole("textbox"), "보존할 이름");
        rerender(<InlineTextEdit {...props} value="서버에서 바뀐 이름" />);
        expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("보존할 이름");
        await user.click(screen.getByRole("button", { name: "저장" }));
        expect(screen.getByRole("alert").textContent).toBe("다른 변경과 충돌했습니다.");
        expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("보존할 이름");
        expect(changes).not.toHaveBeenCalledWith(null);
        await user.click(screen.getByRole("button", { name: "저장" }));
        expect(save).toHaveBeenCalledTimes(2);
        expect(changes).toHaveBeenLastCalledWith(null);
    });

    it("does not save or cancel IME composition and discards the draft with Escape afterward", async () => {
        const user = userEvent.setup();
        const save = vi.fn();
        render(<InlineTextEdit label="제목" value="기존" onSave={save} />);
        await user.click(screen.getByRole("button", { name: "제목 수정" }));
        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "한글 초안" } });
        fireEvent.keyDown(input, { key: "Enter", isComposing: true });
        fireEvent.keyDown(input, { key: "Escape", isComposing: true });
        fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
        expect(save).not.toHaveBeenCalled();
        expect(screen.getByRole("textbox")).toBeTruthy();
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("textbox")).toBeNull();
        expect(screen.getByRole("button", { name: "제목 수정" }).textContent).toBe("기존");
    });

    it("prevents duplicate submissions, changes and cancellation during an outstanding save", async () => {
        const user = userEvent.setup();
        let finish: () => void = () => {};
        const save = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
        render(<InlineTextEdit label="제목" value="기존" onSave={save} />);
        await user.click(screen.getByRole("button", { name: "제목 수정" }));
        const input = screen.getByRole("textbox");
        await user.clear(input);
        await user.type(input, "변경");
        await user.keyboard("{Enter}{Enter}{Escape}");
        expect(save).toHaveBeenCalledTimes(1);
        expect((input as HTMLInputElement).readOnly).toBe(true);
        expect((screen.getByRole("button", { name: "취소" }) as HTMLButtonElement).disabled).toBe(true);
        await user.type(input, "추가 입력");
        expect((input as HTMLInputElement).value).toBe("변경");
        await act(async () => finish());
        expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("rejects whitespace for required names and allows cancelling without saving", async () => {
        const user = userEvent.setup();
        const save = vi.fn();
        const changes = vi.fn();
        render(<InlineTextEdit label="프로젝트명" value="기존" onSave={save} required onDraftChange={changes} />);
        await user.click(screen.getByRole("button", { name: "프로젝트명 수정" }));
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "  " } });
        await user.click(screen.getByRole("button", { name: "저장" }));
        expect(screen.getByRole("alert").textContent).toContain("값을 입력");
        expect(save).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "취소" }));
        expect(changes).toHaveBeenLastCalledWith(null);
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "프로젝트명 수정" }));
    });

    it("restores an empty draft without capturing a new revision or overwriting it on refresh", () => {
        const begin = vi.fn();
        const props = { label: "제목", value: "기존", onSave: vi.fn(), initialDraft: "", onBegin: begin };
        const { rerender } = render(<InlineTextEdit {...props} />);
        expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
        rerender(<InlineTextEdit {...props} value="최신 값" initialDraft="갱신된 다른 초안" />);
        expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
        expect(begin).not.toHaveBeenCalled();
    });
});

describe("inline Markdown editing", () => {
    it("keeps semantic Markdown and safe links interactive, and opens when clicking body text", async () => {
        // Test editing and content safety after the lazy module has transformed.
        await import("./MarkdownContent");
        const user = userEvent.setup();
        const { container } = render(<InlineBodyEdit label="본문" value={'## 본문 제목\n\n[참조](https://example.com)\n\n일반 문장\n\n<script>alert(1)</script>\n\n[위험](javascript:alert%281%29)'} onSave={vi.fn()} />);
        expect(await screen.findByRole("heading", { name: "본문 제목" })).toBeTruthy();
        expect(container.querySelector("script")).toBeNull();
        expect(screen.getByText("위험").getAttribute("href")).toBeNull();
        const link = screen.getByRole("link", { name: "참조" });
        fireEvent.click(link);
        expect(link.getAttribute("href")).toBe("https://example.com");
        expect(screen.queryByRole("textbox")).toBeNull();
        await user.click(screen.getByText("일반 문장"));
        expect(screen.getByRole("textbox", { name: "본문" })).toBeTruthy();
    });

    it("does not turn selected text into an editing action", async () => {
        render(<InlineBodyEdit label="본문" value="선택할 본문" onSave={vi.fn()} />);
        const text = await screen.findByText("선택할 본문");
        const range = document.createRange();
        range.selectNodeContents(text);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        fireEvent.click(text);
        expect(screen.queryByRole("textbox")).toBeNull();
        selection?.removeAllRanges();
        fireEvent.click(text);
        expect(screen.getByRole("textbox")).toBeTruthy();
    });

    it("keeps newlines and blur as draft edits, and saves only with the explicit shortcut", async () => {
        const user = userEvent.setup();
        const save = vi.fn().mockResolvedValue(undefined);
        render(<InlineBodyEdit label="본문" value="첫 줄" onSave={save} />);
        await user.click(screen.getByRole("button", { name: "본문 수정" }));
        const textarea = screen.getByRole("textbox");
        await user.type(textarea, "{End}{Enter}둘째 줄");
        expect((textarea as HTMLTextAreaElement).value).toBe("첫 줄\n둘째 줄");
        await user.tab();
        expect(save).not.toHaveBeenCalled();
        fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true, isComposing: true });
        expect(save).not.toHaveBeenCalled();
        fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
        await waitFor(() => expect(save).toHaveBeenCalledWith("첫 줄\n둘째 줄"));
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "본문 수정" })));
    });

    it("supports empty-body clicks and the keyboard edit control while respecting disabled state", async () => {
        const user = userEvent.setup();
        const props = { label: "본문", value: "", onSave: vi.fn(), placeholder: "본문 추가" };
        const { rerender } = render(<InlineBodyEdit {...props} disabled />);
        await user.click(screen.getByText("본문 추가"));
        expect(screen.queryByRole("textbox")).toBeNull();
        rerender(<InlineBodyEdit {...props} />);
        await user.tab();
        await user.keyboard("{Enter}");
        expect(screen.getByRole("textbox", { name: "본문" })).toBeTruthy();
    });
});
