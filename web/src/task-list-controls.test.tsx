import { ownerProject, renderWithOwnerPermissions as render } from "./permissions.test-support";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";
import { idea, projectId, userId } from "./fixtures.test-data";
import { itemSchema } from "./models";
import { TaskWorkspace } from "./TaskWorkspace";

const personal = itemSchema.parse({...idea, kind: "task", title: "개인 목록 작업", data: {workflow: "personal", requires_test: false}});
const delivery = itemSchema.parse({...idea, id: "00000000-0000-4000-8000-000000000930", kind: "task", title: "구현 목록 작업", body: "원본", data: {workflow: "delivery", state: "in_review"}});
beforeEach(() => {
    vi.restoreAllMocks(); sessionStorage.clear();
    vi.spyOn(api, "taskViews").mockResolvedValue([]);
    vi.spyOn(api, "projects").mockResolvedValue([]);
    window.history.replaceState(null, "", `/?project=${projectId}&view=tasks`);
});
afterEach(() => vi.unstubAllGlobals());
function mount(density = "compact", items = [personal, delivery], projects = [ownerProject()]) {
    const changed = vi.fn();
    render(<TaskWorkspace projectId={projectId} userId={userId} route={{project: projectId, view: "tasks", item: "", kind: "", q: "", run: "", baseline: "", taskLayout: "list", taskDensity: density, taskStatus: "all"}} items={items} onChanged={changed} />, undefined, projects);
    return changed;
}

it("separates bulk selection from the leading status bullet dropdown", async () => {
    const save = vi.spyOn(api, "saveItem").mockResolvedValue(personal);
    mount("detailed");
    const status = screen.getByRole("button", {name: "개인 목록 작업 상태: 할 일 · 변경"});
    const row = status.closest(".task-row")!;
    expect(within(row as HTMLElement).getAllByRole("checkbox")).toHaveLength(1);
    expect(within(row as HTMLElement).getByRole("checkbox", {name: "개인 목록 작업 일괄 선택"})).toBeTruthy();
    expect(status.querySelector(".task-status-dot")?.getAttribute("data-state")).toBe("todo");
    await userEvent.click(status);
    expect(screen.getAllByRole("menuitem")).toHaveLength(5);
    expect(save).not.toHaveBeenCalled();
});

it("changes a personal task's progress with one explicit menu choice", async () => {
    const save = vi.spyOn(api, "saveItem").mockResolvedValue(personal);
    const changed = mount();
    await userEvent.click(screen.getByRole("button", {name: "개인 목록 작업 상태: 할 일 · 변경"}));
    await userEvent.click(screen.getByRole("menuitem", {name: "진행 중"}));
    await waitFor(() => expect(save).toHaveBeenCalledWith(personal.id, expect.objectContaining({expected_revision: personal.revision, data: expect.objectContaining({state: "in_progress"})})));
    expect(new URL(location.href).searchParams.get("item")).toBeNull();
    expect(changed).toHaveBeenCalledOnce();
});

it("shows the delivery state and saves an explicit status choice with the original revision", async () => {
    const save = vi.spyOn(api, "saveItem").mockResolvedValue(delivery);
    const changed = mount();
    await userEvent.click(screen.getByRole("button", {name: "구현 목록 작업 상태: 검토 중 · 변경"}));
    expect(screen.getByRole("menuitem", {name: "검토 중"}).getAttribute("aria-current")).toBe("true");
    await userEvent.click(screen.getByRole("menuitem", {name: "진행 중"}));
    await waitFor(() => expect(save).toHaveBeenCalledWith(delivery.id, expect.objectContaining({expected_revision: delivery.revision, body: "원본", data: expect.objectContaining({state: "in_progress"})})));
    expect(changed).toHaveBeenCalledOnce();
});

it("keeps a rejected completion at its original state and explains the delivery gate", async () => {
    vi.spyOn(api, "saveItem").mockRejectedValue(new ApiError("완료 근거가 필요합니다.", 409));
    mount();
    await userEvent.click(screen.getByRole("button", {name: "구현 목록 작업 상태: 검토 중 · 변경"}));
    await userEvent.click(screen.getByRole("menuitem", {name: "완료"}));
    await screen.findByText(/작업 상세에서 완료 근거/);
    expect(screen.getByRole("button", {name: "구현 목록 작업 상태: 검토 중 · 변경"}).querySelector(".task-status-dot")?.getAttribute("data-state")).toBe("in_review");
});

it("requires a cancellation reason before saving and preserves it on conflict", async () => {
    const save = vi.spyOn(api, "saveItem").mockRejectedValue(new ApiError("다른 창에서 변경됐습니다.", 409));
    mount();
    await userEvent.click(screen.getByRole("button", {name: "구현 목록 작업 상태: 검토 중 · 변경"}));
    await userEvent.click(screen.getByRole("menuitem", {name: "취소"}));
    expect(save).not.toHaveBeenCalled();
    const submit = screen.getByRole("button", {name: "취소 확정"});
    expect(submit).toHaveProperty("disabled", true);
    await userEvent.type(screen.getByRole("textbox", {name: "취소 사유"}), "범위에서 제외");
    await userEvent.click(submit);
    await waitFor(() => expect(save).toHaveBeenCalledWith(delivery.id, expect.objectContaining({expected_revision: delivery.revision, data: expect.objectContaining({state: "cancelled", cancellation_reason: "범위에서 제외"})})));
    await within(screen.getByRole("dialog", {name: "작업 취소"})).findByText(/다른 창에서 변경/);
    expect(screen.getByRole("textbox", {name: "취소 사유"})).toHaveProperty("value", "범위에서 제외");
});

it("keeps compact mobile state menus usable after a remembered bulk selection", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn()})));
    sessionStorage.setItem(`projects:task-selection:${projectId}`, JSON.stringify([personal.id, delivery.id]));
    mount();
    expect(document.querySelector(".task-workspace")?.getAttribute("data-mobile-selecting")).toBe("false");
    expect(screen.getByRole("button", {name: "구현 목록 작업 상태: 검토 중 · 변경"})).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", {name: "개인 목록 작업 상태: 할 일 · 변경"})).toBeTruthy();
    expect(screen.queryByRole("checkbox", {name: "개인 목록 작업 완료"})).toBeNull();
});

it("uses the keyboard menu without completing a task on open or Escape", async () => {
    const save = vi.spyOn(api, "saveItem");
    mount();
    const trigger = screen.getByRole("button", {name: "개인 목록 작업 상태: 할 일 · 변경"});
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menuitem", {name: "완료"});
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(save).not.toHaveBeenCalled();
});

it("shows a completed task as a status and keeps read-only controls disabled", async () => {
    const completed = itemSchema.parse({...personal, data: {...personal.data, state: "done"}});
    const project = ownerProject();
    project.access!.capabilities = ["project.read"];
    const save = vi.spyOn(api, "saveItem");
    mount("detailed", [completed], [project]);
    const trigger = screen.getByRole("button", {name: "개인 목록 작업 상태: 완료 · 변경"});
    expect(trigger).toHaveProperty("disabled", true);
    expect(trigger.querySelector(".task-status-dot")?.getAttribute("data-state")).toBe("done");
    trigger.click();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(save).not.toHaveBeenCalled();
});
