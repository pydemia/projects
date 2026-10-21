import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "./ui";
import { loadDraft, storeDraft } from "./hooks";

describe("untrusted document content", () => {
    it("renders Korean Markdown while disabling HTML, scripts and remote images", async () => {
        const { container } = render(<Markdown body={'## 한국어 본문\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>\n\n[위험 링크](javascript:alert%281%29)\n\n![외부 그림](https://example.com/tracking.png)\n\n|항목|결과|\n|---|---|\n|저장|확인|'} />);
        expect(await screen.findByRole("heading", { name: "한국어 본문" })).toBeTruthy();
        expect(container.querySelector("script")).toBeNull();
        expect(container.querySelector("img")).toBeNull();
        expect(screen.getByText("위험 링크").getAttribute("href")).toBeNull();
        expect(screen.getByRole("table")).toBeTruthy();
    });
    it("validates browser drafts and preserves a valid draft with its base revision", () => {
        localStorage.setItem("draft", '{"body": 12}');
        expect(loadDraft("draft")).toBeNull();
        const draft = { title: "내 초안", body: "보존할 본문", data: {}, baseRevision: 3, savedLocallyAt: "2026-10-21" };
        expect(storeDraft("draft", draft)).toBe(true);
        expect(loadDraft("draft")).toEqual(draft);
    });
});
