import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { idea, projectId } from "./fixtures.test-data";
import { defaultData, itemSchema } from "./models";
import { TracePage } from "./ProjectPages";

describe("trace workspace", () => {
    it("narrows the same requirement table to items needing review", async () => {
        const settled = itemSchema.parse({ ...idea, id: "00000000-0000-4000-8000-000000000201",
            kind: "requirement", title: "연결된 요건", data: defaultData("requirement") });
        const changed = itemSchema.parse({ ...settled, id: "00000000-0000-4000-8000-000000000202",
            title: "재검토할 요건" });
        vi.spyOn(api, "trace").mockResolvedValue({ requirements: [
            { item: settled, links: [], needs_review: false },
            { item: changed, links: [], needs_review: true },
        ], stale_links: [] });
        vi.spyOn(api, "baselines").mockResolvedValue([]);
        render(<TracePage projectId={projectId} items={[settled, changed]}
            baselineId="" revision={1} onChanged={vi.fn()} />);
        expect(await screen.findByRole("table")).toBeTruthy();
        expect(screen.getByText("연결된 요건")).toBeTruthy();
        fireEvent.click(screen.getByRole("radio", { name: "재검토 필요" }));
        expect(screen.queryByText("연결된 요건")).toBeNull();
        expect(screen.getByText("재검토할 요건")).toBeTruthy();
    });
});
