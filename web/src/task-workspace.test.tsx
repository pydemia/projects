import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";
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
const moveResponse = (item: typeof task) => ({ ...item, undo_move: {
    source_state: "in_progress" as const, target_state: "todo" as const,
    before_id: null, after_id: null,
} });
const route: Route = {
    project: projectId, view: "tasks", item: "", kind: "", q: "", run: "", baseline: "",
};

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "taskViews").mockResolvedValue([]);
    sessionStorage.clear();
    window.history.replaceState(null, "", "/?view=tasks");
});

describe("task workspace", () => {
    it("creates a card in the chosen state column and reloads the shared task list", async () => {
        const create = vi.spyOn(api, "quickTask").mockResolvedValue(task);
        const changed = vi.fn();
        render(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...route, taskMode: "complex", taskView: "board" }} items={[]} onChanged={changed} />);
        fireEvent.click(screen.getByRole("button", { name: "+ 진행 중 작업" }));
        fireEvent.change(screen.getByRole("textbox", { name: "진행 중 새 작업 제목" }), { target: { value: "새 카드" } });
        fireEvent.click(screen.getByRole("button", { name: "추가" }));
        await waitFor(() => expect(create).toHaveBeenCalledWith(projectId, {
            title: "새 카드", state: "in_progress", cancellation_reason: "",
        }));
        await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    });

    it("bulk changes selected tasks with expected revisions", async () => {
        const second = itemSchema.parse({ ...task, id: "00000000-0000-4000-8000-000000000109", title: "두번째 작업" });
        const bulk = vi.spyOn(api, "bulkTasks").mockResolvedValue([task, second]);
        render(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...route, taskMode: "complex", taskView: "list" }} items={[task, second]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "현재 보기 전체 선택" }));
        expect(screen.getByText("2개 선택")).toBeTruthy();
        fireEvent.change(within(screen.getByRole("region", { name: "선택 작업 일괄 변경" }))
            .getByRole("combobox", { name: "상태" }), { target: { value: "in_progress" } });
        fireEvent.click(screen.getByRole("button", { name: "상태 적용" }));
        await waitFor(() => expect(bulk).toHaveBeenCalledWith(projectId, {
            tasks: [
                { id: task.id, expected_revision: task.revision },
                { id: second.id, expected_revision: second.revision },
            ],
            state: "in_progress",
        }));
    });

    it("shift-selects the visible range after list grouping", () => {
        const review = itemSchema.parse({ ...task, id: "00000000-0000-4000-8000-000000000111",
            title: "review", data: { ...task.data, state: "in_review" } });
        const todo = itemSchema.parse({ ...task, id: "00000000-0000-4000-8000-000000000112",
            title: "todo", data: { ...task.data, state: "todo" } });
        const progress = itemSchema.parse({ ...task, id: "00000000-0000-4000-8000-000000000113",
            title: "progress", data: { ...task.data, state: "in_progress" } });
        render(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...route, taskMode: "complex", taskView: "list" }}
            items={[review, todo, progress]} onChanged={vi.fn()} />);
        fireEvent.change(screen.getByRole("combobox", { name: "그룹" }), { target: { value: "state" } });
        fireEvent.click(screen.getByRole("checkbox", { name: "todo 일괄 선택" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "review 일괄 선택" }), { shiftKey: true });
        expect(screen.getByText("3개 선택")).toBeTruthy();
        expect(screen.getByRole("checkbox", { name: "progress 일괄 선택" }).getAttribute("data-state")).toBe("checked");
    });

    it("shows grouping only where it changes the view and keeps simple tasks ungrouped", () => {
        const complex = { ...route, taskMode: "complex", taskView: "list" };
        const view = render(<TaskWorkspace projectId={projectId} userId={userId}
            route={complex} items={[task]} onChanged={vi.fn()} />);
        fireEvent.change(screen.getByRole("combobox", { name: "그룹" }), { target: { value: "state" } });
        expect(document.querySelector(".task-group-label")).toBeTruthy();
        view.rerender(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...route, taskMode: "simple", taskView: "today" }} items={[task]} onChanged={vi.fn()} />);
        expect(document.querySelector(".task-group-label")).toBeNull();
        view.rerender(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...complex, taskView: "calendar" }} items={[task]} onChanged={vi.fn()} />);
        expect(screen.queryByRole("combobox", { name: "그룹" })).toBeNull();
        expect(screen.queryByRole("combobox", { name: "정렬" })).toBeNull();
        expect(screen.queryByRole("combobox", { name: "우선순위 기준" })).toBeNull();
    });

    it("keeps the selected tasks and failure reason after a rejected bulk change", async () => {
        vi.spyOn(api, "bulkTasks").mockRejectedValue(new ApiError("완료 조건과 결과 근거를 기록해 주세요.", 409));
        const changed = vi.fn();
        const props = { projectId, userId, route: { ...route, taskMode: "complex", taskView: "list" },
            items: [task], onChanged: changed };
        const view = render(<TaskWorkspace {...props} />);
        fireEvent.click(screen.getByRole("checkbox", { name: "짧은 작업 일괄 선택" }));
        fireEvent.change(within(screen.getByRole("region", { name: "선택 작업 일괄 변경" }))
            .getByRole("combobox", { name: "상태" }), { target: { value: "done" } });
        fireEvent.click(screen.getByRole("button", { name: "상태 적용" }));
        await waitFor(() => expect(screen.getByText(/완료 조건과 결과 근거.*다시 시도/)).toBeTruthy());
        expect(changed).toHaveBeenCalledOnce();
        view.unmount();
        render(<TaskWorkspace {...props} />);
        expect(screen.getByText(/완료 조건과 결과 근거.*다시 시도/)).toBeTruthy();
        expect(screen.getByText("1개 선택")).toBeTruthy();
    });

    it("plans an Inbox task for today without sending a due-date change", async () => {
        const inbox = itemSchema.parse({ ...task, data: { ...task.data, planned_date: "", due_date: "2026-11-01" } });
        const bulk = vi.spyOn(api, "bulkTasks").mockResolvedValue([inbox]);
        render(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...route, taskView: "inbox" }} items={[inbox]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "오늘로" }));
        await waitFor(() => expect(bulk).toHaveBeenCalledWith(projectId, {
            tasks: [{ id: inbox.id, expected_revision: inbox.revision }], planned_date: today,
        }));
    });

    it("saves a personal view with filters and card fields outside task data", async () => {
        const create = vi.spyOn(api, "createTaskView").mockResolvedValue({
            id: "00000000-0000-4000-8000-000000000110", project_id: projectId, owner_id: userId,
            name: "My board", scope: "personal", is_default: false, revision: 1,
            settings: { mode: "complex", view: "board", query: "", status: "all", lens: "gtd",
                minutes: 0, context: "", energy: "any", grouping: "state", sort: "gtd",
                card_fields: ["list_name", "due_date"] },
        });
        render(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...route, taskMode: "complex", taskView: "board" }} items={[task]} onChanged={vi.fn()} />);
        fireEvent.change(screen.getByRole("textbox", { name: "보기 이름" }), { target: { value: "My board" } });
        fireEvent.click(screen.getByRole("button", { name: "새 보기 저장" }));
        await waitFor(() => expect(create).toHaveBeenCalledWith(projectId, expect.objectContaining({
            name: "My board", scope: "personal", settings: expect.objectContaining({
                mode: "complex", view: "board", grouping: "state", card_fields: ["list_name", "due_date"],
            }),
        })));
    });
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

    it("moves a personal task from the board status menu using the position API", async () => {
        const moved = { ...task, revision: 2, data: { ...task.data, state: "in_progress" as const } };
        const move = vi.spyOn(api, "moveTask").mockResolvedValue(moveResponse(moved));
        const view = render(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...route, taskMode: "complex", taskView: "board" }} items={[task]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "짧은 작업 상태 메뉴" }));
        fireEvent.click(await screen.findByRole("button", { name: "진행 중" }));
        await waitFor(() => expect(move).toHaveBeenCalledWith(task.id, expect.objectContaining({
            expected_revision: task.revision, source_state: "todo", target_state: "in_progress",
        })));
        view.unmount();
        render(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...route, taskMode: "complex", taskView: "board" }} items={[moved]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "짧은 작업 이동 되돌리기" }));
        await waitFor(() => expect(move).toHaveBeenCalledWith(task.id, expect.objectContaining({
            expected_revision: 2, source_state: "in_progress", target_state: "todo",
        })));
    });

    it("restores the card after a conflicting board move", async () => {
        vi.spyOn(api, "moveTask").mockRejectedValue(new ApiError("다른 변경이 저장되었습니다.", 409));
        const changed = vi.fn();
        const view = render(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...route, taskMode: "complex", taskView: "board" }} items={[task]} onChanged={changed} />);
        fireEvent.click(screen.getByRole("button", { name: "짧은 작업 오른쪽 열로 이동" }));
        await waitFor(() => expect(screen.getByText(/다른 변경이 저장되었습니다.*다시 이동해 주세요/)).toBeTruthy());
        expect(changed).toHaveBeenCalledOnce();
        expect(screen.getByRole("button", { name: "짧은 작업 오른쪽 열로 이동" })).toBeTruthy();
        expect(screen.getByRole("heading", { name: /할 일\s*1/ })).toBeTruthy();
        view.unmount();
        render(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...route, taskMode: "complex", taskView: "board" }} items={[task]} onChanged={changed} />);
        expect(screen.getByText(/다른 변경이 저장되었습니다.*다시 이동해 주세요/)).toBeTruthy();
    });

    it("keeps auto sorting while moving across columns and omits visual neighbors", async () => {
        const move = vi.spyOn(api, "moveTask").mockResolvedValue(moveResponse({ ...task, revision: 2, data: { ...task.data, state: "in_progress" } }));
        const props = { projectId, userId, route: { ...route, taskMode: "complex", taskView: "board" }, items: [task], onChanged: vi.fn() };
        const view = render(<TaskWorkspace {...props} />);
        fireEvent.change(screen.getByRole("combobox", { name: "보드 정렬" }), { target: { value: "auto" } });
        fireEvent.click(screen.getByRole("button", { name: "짧은 작업 오른쪽 열로 이동" }));
        await waitFor(() => expect(move).toHaveBeenCalledWith(task.id, expect.objectContaining({
            target_state: "in_progress", before_id: null, after_id: null,
        })));
        view.unmount();
        render(<TaskWorkspace {...props} />);
        expect((screen.getByRole("combobox", { name: "보드 정렬" }) as HTMLSelectElement).value).toBe("auto");
    });

    it("anchors a filtered manual move on one visible neighbor", async () => {
        const next = itemSchema.parse({
            ...task, id: "00000000-0000-4000-8000-000000000103", title: "다음 작업", board_order: 2,
        });
        const move = vi.spyOn(api, "moveTask").mockResolvedValue(moveResponse(next as typeof task));
        render(<TaskWorkspace projectId={projectId} userId={userId}
            route={{ ...route, taskMode: "complex", taskView: "board" }}
            items={[{ ...task, board_order: 0 }, next]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "다음 작업 위로 이동" }));
        await waitFor(() => expect(move).toHaveBeenCalledWith(next.id, expect.objectContaining({
            before_id: task.id, after_id: null,
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
