import { ownerProject, renderWithOwnerPermissions as render } from "./permissions.test-support";
import { useState } from "react";
import { fireEvent, render as renderUi, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";
import { idea } from "./fixtures.test-data";
import { itemSchema, type Item } from "./models";
import { TaskQuickProperties } from "./TaskQuickProperties";
import { ProjectPermissionsProvider } from "./ProjectPermissions";

const parsed = itemSchema.parse({ ...idea, kind: "task", title: "빠른 작업", data: { workflow: "personal", requires_test: false } });
if (parsed.kind !== "task") throw new Error("Expected a task fixture");
const task = parsed;

describe("quick task properties", () => {
    it("saves all status values through property patches and requires a cancellation reason", async () => {
        const updated = { ...task, revision: 2, data: { ...task.data, state: "closed" as const, cancellation_reason: "범위 제외" } };
        const update = vi.spyOn(api, "updateTaskProperties").mockResolvedValue(updated);
        const saved = vi.fn();
        const user = userEvent.setup();
        render(<TaskQuickProperties task={task} definitions={[]} onSaved={saved} />);
        await user.click(screen.getByRole("button", { name: "빠른 작업 상태 편집" }));
        expect(screen.getByRole("combobox", { name: "상태" }).querySelectorAll("option")).toHaveLength(5);
        await user.selectOptions(screen.getByRole("combobox", { name: "상태" }), "closed");
        await user.click(screen.getByRole("button", { name: "저장" }));
        expect(screen.getByRole("alert").textContent).toContain("종료 사유");
        expect(update).not.toHaveBeenCalled();
        await user.type(screen.getByRole("textbox", { name: "종료 사유" }), "범위 제외");
        await user.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(update).toHaveBeenCalledWith(task.id, { expected_revision: 1, values: { state: "closed", cancellation_reason: "범위 제외" } }));
        expect(saved).toHaveBeenCalledWith(updated);
    });

    it("surfaces completion gates and preserves the selected status", async () => {
        const update = vi.spyOn(api, "updateTaskProperties").mockRejectedValue(new ApiError("통과한 테스트가 필요합니다.", 409));
        const saved = vi.fn();
        render(<TaskQuickProperties task={{ ...task, data: { ...task.data, workflow: "delivery" } }} definitions={[]} onSaved={saved} />);
        fireEvent.click(screen.getByRole("button", { name: "빠른 작업 상태 편집" }));
        fireEvent.change(screen.getByRole("combobox", { name: "상태" }), { target: { value: "done" } });
        fireEvent.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("통과한 테스트"));
        expect((screen.getByRole("combobox", { name: "상태" }) as HTMLSelectElement).value).toBe("done");
        expect(update).toHaveBeenCalledWith(task.id, { expected_revision: 1, values: { state: "done" } });
        expect(saved).not.toHaveBeenCalled();
    });

    it("explains type conversion, saves explicitly, and retains a failed completed-task conversion", async () => {
        const update = vi.spyOn(api, "updateTaskType").mockRejectedValueOnce(new ApiError("완료 조건: 결과 URL이 필요합니다.", 409)).mockResolvedValueOnce(task);
        vi.spyOn(api, "item").mockResolvedValue(task);
        const properties = vi.spyOn(api, "updateTaskProperties");
        const user = userEvent.setup();
        render(<TaskQuickProperties task={{ ...task, data: { ...task.data, state: "done" } }} definitions={[]} onSaved={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "빠른 작업 유형 편집" }));
        expect(screen.getByText(/전환하면 테스트 필수가 켜집니다/)).toBeTruthy();
        await user.selectOptions(screen.getByRole("combobox", { name: "유형" }), "delivery");
        expect(update).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("결과 URL"));
        expect((screen.getByRole("combobox", { name: "유형" }) as HTMLSelectElement).value).toBe("delivery");
        expect(update).toHaveBeenCalledWith(task.id, { expected_revision: 1, workflow: "delivery" });
        expect(properties).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "최신 작업 불러오기" }));
        await waitFor(() => expect(screen.getByRole("status").textContent).toContain("최신 저장 값"));
        await user.selectOptions(screen.getByRole("combobox", { name: "유형" }), "personal");
        await user.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(update).toHaveBeenLastCalledWith(task.id, { expected_revision: 1, workflow: "personal" }));
    });

    it("keeps the status draft across conflicts, loads the latest value, and retries separately", async () => {
        const latest = { ...task, revision: 8, data: { ...task.data, state: "in_review" as const, context: "서버 값" } };
        const update = vi.spyOn(api, "updateTaskProperties").mockRejectedValueOnce(new ApiError("revision conflict", 409)).mockResolvedValueOnce({ ...latest, revision: 9 });
        const get = vi.spyOn(api, "item").mockResolvedValue(latest);
        function Harness() {
            const [item, setItem] = useState<Item>(task);
            return item.kind === "task" ? <TaskQuickProperties task={item} definitions={[]} onSaved={setItem} /> : null;
        }
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole("button", { name: "빠른 작업 상태 편집" }));
        await user.selectOptions(screen.getByRole("combobox", { name: "상태" }), "in_progress");
        await user.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("입력 내용은 유지"));
        expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(true);
        expect(get).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "최신 작업 불러오기" }));
        await waitFor(() => expect(screen.getByRole("status").textContent).toContain("검토 중"));
        expect((screen.getByRole("combobox", { name: "상태" }) as HTMLSelectElement).value).toBe("in_progress");
        expect(update).toHaveBeenCalledTimes(1);
        await user.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(update).toHaveBeenLastCalledWith(task.id, { expected_revision: 8, values: { state: "in_progress" } }));
    });

    it("saves typed builtin values and reuses current revisions between sibling properties", async () => {
        const update = vi.spyOn(api, "updateTaskProperties").mockResolvedValueOnce({ ...task, revision: 2 }).mockResolvedValueOnce({ ...task, revision: 3 }).mockResolvedValueOnce({ ...task, revision: 4 }).mockResolvedValueOnce({ ...task, revision: 5 });
        function Harness() {
            const [item, setItem] = useState<Item>({ ...task, data: { ...task.data, workflow: "delivery" } });
            return item.kind === "task" ? <TaskQuickProperties task={item} definitions={[]} onSaved={value => setItem(value.kind === "task" ? { ...value, data: { ...value.data, workflow: "delivery" } } : value)} /> : null;
        }
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole("button", { name: "빠른 작업 예상 시간 편집" }));
        fireEvent.change(screen.getByRole("textbox", { name: "예상 시간" }), { target: { value: "0" } });
        await user.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(update).toHaveBeenLastCalledWith(task.id, { expected_revision: 1, values: { estimated_minutes: 0 } }));
        await user.click(screen.getByRole("button", { name: "빠른 작업 다음 행동 편집" }));
        await user.click(screen.getByRole("checkbox", { name: "다음 행동" }));
        await user.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(update).toHaveBeenLastCalledWith(task.id, { expected_revision: 2, values: { next_action: false } }));
        await user.click(screen.getByRole("button", { name: "빠른 작업 에너지 편집" }));
        await user.selectOptions(screen.getByRole("combobox", { name: "에너지" }), "low");
        await user.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(update).toHaveBeenLastCalledWith(task.id, { expected_revision: 3, values: { energy: "low" } }));
        fireEvent.click(screen.getByText("추가 속성"));
        await user.click(screen.getByRole("button", { name: "빠른 작업 수용 기준 편집" }));
        fireEvent.change(screen.getByRole("textbox", { name: "수용 기준" }), { target: { value: " 첫 기준 \n\n둘째 기준" } });
        await user.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(update).toHaveBeenLastCalledWith(task.id, { expected_revision: 4, values: { acceptance_criteria: ["첫 기준", "둘째 기준"] } }));
    });

    it("blocks all property writes when another editor owns the task", () => {
        render(<TaskQuickProperties task={task} definitions={[]} onSaved={vi.fn()} disabled />);
        expect((screen.getByRole("button", { name: "빠른 작업 상태 편집" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "빠른 작업 유형 편집" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "빠른 작업 맥락 편집" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("uses each task's project permissions when the same account edits one project and views another", () => {
        const update = vi.spyOn(api, "updateTaskProperties");
        const otherProject = ownerProject("00000000-0000-4000-8000-000000000999", "읽기 프로젝트");
        const viewerProject = {...otherProject, access: {...otherProject.access!,
            role: {...otherProject.access!.role, name: "뷰어", preset: "viewer" as const},
            capabilities: ["project.read", "project.export"],
        }};
        const viewerTask = {...task, id: "00000000-0000-4000-8000-000000000998",
            project_id: viewerProject.id, title: "읽기 작업"};
        renderUi(<ProjectPermissionsProvider projects={[ownerProject(task.project_id), viewerProject]}>
            <TaskQuickProperties task={task} definitions={[]} onSaved={vi.fn()} />
            <TaskQuickProperties task={viewerTask} definitions={[]} onSaved={vi.fn()} />
        </ProjectPermissionsProvider>);
        expect(screen.getByRole("button", {name: "빠른 작업 상태 편집"})).toHaveProperty("disabled", false);
        for (const property of ["상태", "유형", "맥락"]) {
            const control = screen.getByRole("button", {name: `읽기 작업 ${property} 편집`});
            expect(control).toHaveProperty("disabled", true);
            fireEvent.click(control);
        }
        expect(screen.queryByRole("combobox", {name: "상태"})).toBeNull();
        expect(update).not.toHaveBeenCalled();
    });

    it("blocks submission of an open state draft after project write permission is revoked", async () => {
        const update = vi.spyOn(api, "updateTaskProperties");
        const owner = ownerProject(task.project_id);
        const props = {task, definitions: [], onSaved: vi.fn()};
        const view = renderUi(<ProjectPermissionsProvider projects={[owner]}><TaskQuickProperties {...props} /></ProjectPermissionsProvider>);
        await userEvent.click(screen.getByRole("button", {name: "빠른 작업 상태 편집"}));
        fireEvent.change(screen.getByRole("combobox", {name: "상태"}), {target: {value: "in_progress"}});
        const revoked = {...owner, access: {...owner.access!, capabilities: ["project.read"], access_revision: 2}};
        view.rerender(<ProjectPermissionsProvider projects={[revoked]}><TaskQuickProperties {...props} /></ProjectPermissionsProvider>);
        fireEvent.submit(screen.getByRole("button", {name: "저장"}).closest("form")!);
        expect(update).not.toHaveBeenCalled();
        expect(screen.getByRole("combobox", {name: "상태"})).toHaveProperty("value", "in_progress");
    });
});
