import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { idea, projectId, userId } from "./fixtures.test-data";
import type { Route } from "./hooks";
import { itemSchema } from "./models";
import { TaskWorkspace } from "./TaskWorkspace";

const today = (() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
})();
const taskRecord = itemSchema.parse({
    ...idea, id: "00000000-0000-4000-8000-000000000101", kind: "task", title: "짧은 작업",
    data: { workflow: "personal", planned_date: today, estimated_minutes: 15, abc_priority: "B" },
});
if (taskRecord.kind !== "task") throw new Error("Expected a task fixture");
const task = taskRecord;
const route: Route = {
    project: projectId, view: "tasks", item: "", kind: "", q: "", run: "", baseline: "",
};

beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/?view=tasks");
});

describe("task workspace", () => {
    it("creates a personal task from the simple quick-add without delivery evidence", async () => {
        const create = vi.spyOn(api, "createItem").mockResolvedValue(task);
        const changed = vi.fn();
        render(<TaskWorkspace projectId={projectId} userId={userId} route={route} items={[]} onChanged={changed} />);
        fireEvent.change(screen.getByLabelText("빠른 할 일"), { target: { value: "오늘 처리할 일" } });
        fireEvent.click(screen.getByRole("button", { name: "+ 추가" }));
        await waitFor(() => expect(create).toHaveBeenCalledWith(projectId, expect.objectContaining({
            title: "오늘 처리할 일",
            data: expect.objectContaining({ workflow: "personal", planned_date: today, requires_test: false }),
        })));
        await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    });

    it("keeps Inbox capture undated while keeping the same personal workflow", async () => {
        const create = vi.spyOn(api, "createItem").mockResolvedValue(task);
        render(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...route, taskView: "inbox" }} items={[]} onChanged={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("빠른 할 일"), { target: { value: "나중에 분류할 일" } });
        fireEvent.click(screen.getByRole("button", { name: "+ 추가" }));
        await waitFor(() => expect(create).toHaveBeenCalledWith(projectId, expect.objectContaining({
            data: expect.objectContaining({ workflow: "personal", planned_date: "", list_name: "Inbox" }),
        })));
    });

    it("quickly completes a personal task with revision control", async () => {
        const save = vi.spyOn(api, "saveItem").mockResolvedValue({ ...task, data: { ...task.data, state: "done" } });
        render(<TaskWorkspace projectId={projectId} userId={userId} route={route} items={[task]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("checkbox", { name: "짧은 작업 완료" }));
        await waitFor(() => expect(save).toHaveBeenCalledWith(task.id, expect.objectContaining({
            expected_revision: task.revision, data: expect.objectContaining({ state: "done", workflow: "personal" }),
        })));
    });

    it("shows board and current-state charts from the same tasks", () => {
        const complex = { ...route, taskMode: "complex", taskView: "board" };
        const { rerender } = render(<TaskWorkspace projectId={projectId} userId={userId} route={complex} items={[task]} onChanged={vi.fn()} />);
        expect(screen.getByRole("heading", { name: /할 일/ })).toBeTruthy();
        expect(screen.getByText("짧은 작업")).toBeTruthy();
        rerender(<TaskWorkspace projectId={projectId} userId={userId} route={{ ...complex, taskView: "insights" }} items={[task]} onChanged={vi.fn()} />);
        expect(screen.getByRole("figure").getAttribute("data-ui")).toBe("bar-list");
        expect(screen.getByText("ABC B")).toBeTruthy();
        expect(screen.getAllByText("1건").length).toBeGreaterThan(0);
        expect(screen.getByText(/현재 스냅샷입니다/)).toBeTruthy();
    });

    it("changes a personal task from the board using the same revision-checked task", async () => {
        const save = vi.spyOn(api, "saveItem").mockResolvedValue({ ...task, data: { ...task.data, state: "in_progress" } });
        render(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...route, taskMode: "complex", taskView: "board" }} items={[task]} onChanged={vi.fn()} />);
        fireEvent.change(screen.getByRole("combobox", { name: "짧은 작업 상태" }), { target: { value: "in_progress" } });
        await waitFor(() => expect(save).toHaveBeenCalledWith(task.id, expect.objectContaining({
            expected_revision: task.revision, data: expect.objectContaining({ state: "in_progress" }),
        })));
    });

    it("renders the shared task controls with the current view and theme contracts", () => {
        render(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...route, taskMode: "complex", taskView: "list" }} items={[task]} onChanged={vi.fn()} />);
        expect(document.querySelector('[data-ui="segmented-control"]')).toBeTruthy();
        expect(screen.getByRole("tab", { name: "목록" }).getAttribute("aria-selected")).toBe("true");
        expect(screen.getByRole("searchbox", { name: "작업 검색" }).getAttribute("data-ui")).toBe("input");
        expect(screen.getByRole("combobox", { name: "우선순위 기준" }).getAttribute("data-ui")).toBe("native-select");
        expect(screen.getByRole("group", { name: "오늘 처리할 일" }).getAttribute("data-ui")).toBe("card");
    });

    it("switches between GTD available-time and ABC value ordering without changing tasks", () => {
        const longTask = itemSchema.parse({
            ...task, id: "00000000-0000-4000-8000-000000000102", title: "긴 핵심 작업",
            data: { ...task.data, estimated_minutes: 90, abc_priority: "A", abc_order: 1 },
        });
        const complex = { ...route, taskMode: "complex", taskView: "list" };
        render(<TaskWorkspace projectId={projectId} userId={userId} route={complex} items={[longTask, task]} onChanged={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("가용 시간"), { target: { value: "15" } });
        expect(Array.from(document.querySelectorAll(".task-row .task-title"), node => node.textContent)).toEqual(["짧은 작업", "긴 핵심 작업"]);
        fireEvent.change(screen.getByLabelText("우선순위 기준"), { target: { value: "abc" } });
        expect(Array.from(document.querySelectorAll(".task-row .task-title"), node => node.textContent)).toEqual(["긴 핵심 작업", "짧은 작업"]);
    });

    it("places a planned task on the monthly calendar", () => {
        render(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...route, taskMode: "complex", taskView: "calendar" }} items={[task]} onChanged={vi.fn()} />);
        expect(screen.getByRole("link", { name: "짧은 작업" })).toBeTruthy();
        expect(screen.getByText(/실행 예정일과 마감일/)).toBeTruthy();
    });
});
