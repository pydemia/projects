import { ownerProject, renderWithOwnerPermissions as render } from "./permissions.test-support";
import { useState } from "react";
import { fireEvent, render as renderUi, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";
import { idea, projectId } from "./fixtures.test-data";
import { itemSchema } from "./models";
import type { TaskFieldDefinition } from "./models";
import { formatTaskField, TaskFieldCells, TaskFieldManager } from "./TaskFields";
import { ProjectPermissionsProvider } from "./ProjectPermissions";

const numberId = "00000000-0000-4000-8000-000000000301";
const checkId = "00000000-0000-4000-8000-000000000302";
const createdId = "00000000-0000-4000-8000-000000000303";
const dateId = "00000000-0000-4000-8000-000000000304";
const numberField: TaskFieldDefinition = { id: numberId, name: "비용", type: "number", options: [], revision: 1, created_at: idea.created_at };
const checkField: TaskFieldDefinition = { ...numberField, id: checkId, name: "검수", type: "checkbox" };
const dateField: TaskFieldDefinition = { ...numberField, id: dateId, name: "검수일", type: "date" };
const taskRecord = itemSchema.parse({ ...idea, kind: "task", title: "필드 작업", data: {
    list_name: "개발", estimated_minutes: 20, abc_priority: "B", context: "사무실",
    due_date: "2026-11-03", custom_fields: { [numberId]: 8, [checkId]: true, [dateId]: "2026-11-04" },
} });
if (taskRecord.kind !== "task") throw new Error("Expected a task fixture");
const task = taskRecord;

beforeEach(() => { vi.restoreAllMocks(); });

describe("task field management", () => {
    it("allows personal field visibility choices without granting a task editor field creation", () => {
        const create = vi.spyOn(api, "createTaskField");
        const changed = vi.fn();
        const owner = ownerProject(projectId);
        const editor = {...owner, access: {...owner.access!,
            role: {...owner.access!.role, name: "작업 편집 담당", preset: "custom" as const},
            capabilities: ["project.read", "task.update"],
        }};
        renderUi(<ProjectPermissionsProvider projects={[editor]}>
            <TaskFieldManager projectId={projectId} definitions={[numberField]} selectedFields={[]}
                onCreated={vi.fn()} onChange={changed} />
        </ProjectPermissionsProvider>);
        fireEvent.click(screen.getByRole("button", {name: "필드 관리"}));
        fireEvent.click(screen.getByRole("checkbox", {name: "비용 표시"}));
        expect(changed).toHaveBeenCalledWith([`custom:${numberId}`]);
        const add = screen.getByRole("button", {name: "+ 사용자 필드 추가"});
        expect(add).toHaveProperty("disabled", true);
        fireEvent.click(add);
        expect(screen.queryByRole("dialog", {name: "사용자 필드 추가"})).toBeNull();
        expect(create).not.toHaveBeenCalled();
    });

    it("prevents showing or creating a 33rd field and explains how to make space", () => {
        const definitions = Array.from({ length: 32 }, (_, index) => ({ ...numberField, id: `field-${index}`, name: `속성 ${index}` }));
        const create = vi.spyOn(api, "createTaskField");
        const changed = vi.fn();
        function Manager() {
            const [fields, setFields] = useState(definitions.map(field => `custom:${field.id}`));
            return <TaskFieldManager projectId={projectId} definitions={definitions} selectedFields={fields} onCreated={vi.fn()} onChange={values => { changed(values); setFields(values); }} />;
        }
        render(<Manager />);
        fireEvent.click(screen.getByRole("button", { name: "필드 관리" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "마감일 표시" }));
        expect(screen.getByRole("alert").textContent).toContain("최대 32개");
        expect(changed).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "+ 사용자 필드 추가" }));
        expect(screen.queryByRole("dialog", { name: "사용자 필드 추가" })).toBeNull();
        expect(create).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("checkbox", { name: "속성 31 표시" }));
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "+ 사용자 필드 추가" }));
        expect(screen.getByRole("dialog", { name: "사용자 필드 추가" })).toBeTruthy();
    });

    it("checks the display limit again before creating from an already open dialog", () => {
        const create = vi.spyOn(api, "createTaskField");
        const props = { definitions: [], onCreated: vi.fn(), onChange: vi.fn() };
        const view = render(<TaskFieldManager projectId={projectId} {...props} selectedFields={[]} />);
        fireEvent.click(screen.getByRole("button", { name: "필드 관리" }));
        fireEvent.click(screen.getByRole("button", { name: "+ 사용자 필드 추가" }));
        fireEvent.change(screen.getByRole("textbox", { name: "필드 이름" }), { target: { value: "추가 속성" } });
        view.rerender(<TaskFieldManager projectId={projectId} {...props} selectedFields={Array.from({ length: 32 }, (_, index) => `custom:field-${index}`)} />);
        fireEvent.click(screen.getByRole("button", { name: "필드 추가" }));
        expect(screen.getByRole("alert").textContent).toContain("최대 32개");
        expect(create).not.toHaveBeenCalled();
    });

    it("opens lazily, shows load failures, retries, and disables creation while definitions load", () => {
        const open = vi.fn();
        const retry = vi.fn();
        const load = vi.spyOn(api, "taskFields");
        const props = { definitions: [], selectedFields: [], onCreated: vi.fn(), onChange: vi.fn(), onOpen: open, onRetry: retry };
        const view = render(<TaskFieldManager projectId={projectId} {...props} error="필드를 가져오지 못했습니다." />);
        expect(open).not.toHaveBeenCalled();
        expect(load).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "필드 관리" }));
        expect(open).toHaveBeenCalledOnce();
        expect(screen.getByRole("alert").textContent).toContain("가져오지 못했습니다");
        fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
        expect(retry).toHaveBeenCalledOnce();
        view.rerender(<TaskFieldManager projectId={projectId} {...props} loading />);
        expect(screen.getByRole("status").textContent).toContain("불러오는 중");
        fireEvent.click(screen.getByRole("button", { name: "+ 사용자 필드 추가" }));
        expect((screen.getByRole("button", { name: "필드 추가" }) as HTMLButtonElement).disabled).toBe(true);
        expect(load).not.toHaveBeenCalled();
    });

    it("creates a real select field, shows it, reorders it, and hides it without deleting the definition", async () => {
        const created: TaskFieldDefinition = { ...numberField, id: createdId, name: "담당 팀", type: "select", options: ["개발", "디자인"] };
        const create = vi.spyOn(api, "createTaskField").mockResolvedValue(created);
        const changed = vi.fn();
        const added = vi.fn();
        function Manager() {
            const [definitions, setDefinitions] = useState<TaskFieldDefinition[]>([]);
            const [fields, setFields] = useState(["due_date", "abc_priority"]);
            return <TaskFieldManager projectId={projectId} definitions={definitions} selectedFields={fields}
                onCreated={definition => { added(definition); setDefinitions(values => [...values, definition]); }}
                onChange={values => { changed(values); setFields(values); }} />;
        }
        render(<Manager />);
        fireEvent.click(screen.getByRole("button", { name: "필드 관리" }));
        fireEvent.click(screen.getByRole("button", { name: "+ 사용자 필드 추가" }));
        const dialog = screen.getByRole("dialog", { name: "사용자 필드 추가" });
        fireEvent.change(within(dialog).getByRole("textbox", { name: "필드 이름" }), { target: { value: "담당 팀" } });
        fireEvent.change(within(dialog).getByRole("combobox", { name: "필드 유형" }), { target: { value: "select" } });
        fireEvent.change(within(dialog).getByRole("textbox", { name: "선택 항목" }), { target: { value: "개발\n개발" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "필드 추가" }));
        expect(within(dialog).getByRole("alert").textContent).toContain("중복되지 않는");
        expect(create).not.toHaveBeenCalled();
        fireEvent.change(within(dialog).getByRole("textbox", { name: "선택 항목" }), { target: { value: "개발\n디자인" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "필드 추가" }));
        await waitFor(() => expect(create).toHaveBeenCalledWith({ project_id: projectId, name: "담당 팀", type: "select", options: ["개발", "디자인"] }));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "사용자 필드 추가" })).toBeNull());
        expect(added).toHaveBeenCalledWith(created);
        expect(changed).toHaveBeenLastCalledWith(["due_date", "abc_priority", `custom:${createdId}`]);
        fireEvent.click(screen.getByRole("button", { name: "필드 관리" }));
        expect(screen.getByRole("checkbox", { name: "담당 팀 표시" }).getAttribute("data-state")).toBe("checked");
        fireEvent.click(screen.getByRole("button", { name: "담당 팀 위로" }));
        expect(changed).toHaveBeenLastCalledWith(["due_date", `custom:${createdId}`, "abc_priority"]);
        fireEvent.click(screen.getByRole("checkbox", { name: "담당 팀 표시" }));
        expect(changed).toHaveBeenLastCalledWith(["due_date", "abc_priority"]);
        expect(screen.getByRole("checkbox", { name: "담당 팀 표시" }).getAttribute("data-state")).toBe("unchecked");
        expect(added).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole("checkbox", { name: "담당 팀 표시" }));
        expect(changed).toHaveBeenLastCalledWith(["due_date", "abc_priority", `custom:${createdId}`]);
    });

    it("keeps the field creation draft and error after a rejected request", async () => {
        vi.spyOn(api, "createTaskField").mockRejectedValue(new ApiError("이미 같은 이름의 필드가 있습니다.", 409));
        const added = vi.fn();
        render(<TaskFieldManager projectId={projectId} definitions={[]} selectedFields={[]} onCreated={added} onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "필드 관리" }));
        fireEvent.click(screen.getByRole("button", { name: "+ 사용자 필드 추가" }));
        fireEvent.change(screen.getByRole("textbox", { name: "필드 이름" }), { target: { value: "담당 팀" } });
        fireEvent.click(screen.getByRole("button", { name: "필드 추가" }));
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("이미 같은 이름"));
        expect((screen.getByRole("textbox", { name: "필드 이름" }) as HTMLInputElement).value).toBe("담당 팀");
        expect(added).not.toHaveBeenCalled();
    });
});

describe("task property inline editing", () => {
    it("prevents duplicate submissions and closing while a save is pending", async () => {
        let complete: ((item: typeof task) => void) | undefined;
        const update = vi.spyOn(api, "updateTaskProperties").mockImplementation(() => new Promise(resolve => { complete = resolve; }));
        const user = userEvent.setup();
        render(<TaskFieldCells task={task} fields={["context"]} definitions={[]} onChanged={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "필드 작업 맥락 편집" }));
        fireEvent.change(screen.getByRole("textbox", { name: "맥락" }), { target: { value: "집" } });
        await user.click(screen.getByRole("button", { name: "저장" }));
        expect((screen.getByRole("button", { name: "저장 중…" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "취소" }) as HTMLButtonElement).disabled).toBe(true);
        await user.keyboard("{Escape}");
        expect(screen.getByRole("textbox", { name: "맥락" })).toBeTruthy();
        expect(update).toHaveBeenCalledOnce();
        complete?.(task);
        await waitFor(() => expect(screen.queryByRole("textbox", { name: "맥락" })).toBeNull());
    });

    it("saves numeric zero and checkbox false without treating them as missing values", async () => {
        const update = vi.spyOn(api, "updateTaskProperties").mockResolvedValue(task);
        const changed = vi.fn();
        const user = userEvent.setup();
        render(<TaskFieldCells task={task} fields={[`custom:${numberId}`, `custom:${checkId}`]} definitions={[numberField, checkField]} onChanged={changed} />);
        await user.click(screen.getByRole("button", { name: "필드 작업 비용 편집" }));
        const input = screen.getByRole("textbox", { name: "비용" });
        await user.clear(input); await user.type(input, "0{Enter}");
        await waitFor(() => expect(update).toHaveBeenLastCalledWith(task.id, { expected_revision: task.revision, values: { [`custom:${numberId}`]: 0 } }));
        await user.click(screen.getByRole("button", { name: "필드 작업 검수 편집" }));
        await user.click(screen.getByRole("checkbox", { name: "검수" }));
        await user.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(update).toHaveBeenLastCalledWith(task.id, { expected_revision: task.revision, values: { [`custom:${checkId}`]: false } }));
        expect(changed).toHaveBeenCalledTimes(2);
    });

    it("rejects malformed numbers and negative or fractional estimated minutes before sending", async () => {
        const update = vi.spyOn(api, "updateTaskProperties").mockResolvedValue(task);
        render(<TaskFieldCells task={task} fields={["estimated_minutes"]} definitions={[]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "필드 작업 예상 시간 편집" }));
        const input = screen.getByRole("textbox", { name: "예상 시간" });
        for (const value of ["abc", "0x10", "-1", "1.5", ""]) {
            fireEvent.change(input, { target: { value } });
            fireEvent.click(screen.getByRole("button", { name: "저장" }));
            expect(screen.getByRole("alert")).toBeTruthy();
        }
        expect(update).not.toHaveBeenCalled();
        fireEvent.change(input, { target: { value: "0" } });
        fireEvent.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(update).toHaveBeenCalledWith(task.id, { expected_revision: task.revision, values: { estimated_minutes: 0 } }));
    });

    it("keeps a conflicting draft open and retries with only the changed built-in property", async () => {
        const latest = { ...task, revision: task.revision + 1, data: { ...task.data, context: "외근" } };
        const update = vi.spyOn(api, "updateTaskProperties")
            .mockRejectedValueOnce(new ApiError("최신 작업을 확인해 주세요.", 409)).mockResolvedValue(task);
        const load = vi.spyOn(api, "item").mockResolvedValue(latest);
        const changed = vi.fn();
        const failed = vi.fn();
        render(<TaskFieldCells task={task} fields={["context"]} definitions={[]} onChanged={changed} onError={failed} />);
        fireEvent.click(screen.getByRole("button", { name: "필드 작업 맥락 편집" }));
        fireEvent.change(screen.getByRole("textbox", { name: "맥락" }), { target: { value: "집" } });
        fireEvent.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("입력 내용은 유지됩니다"));
        expect((screen.getByRole("textbox", { name: "맥락" }) as HTMLInputElement).value).toBe("집");
        expect(changed).not.toHaveBeenCalled();
        expect(failed).toHaveBeenCalledOnce();
        expect(load).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "최신 작업 불러오기" }));
        await waitFor(() => expect(screen.getByRole("status").textContent).toContain("최신 저장 값: 외근"));
        expect(load).toHaveBeenCalledWith(task.id);
        expect(changed).toHaveBeenCalledWith(latest);
        expect(update).toHaveBeenCalledOnce();
        expect((screen.getByRole("textbox", { name: "맥락" }) as HTMLInputElement).value).toBe("집");
        fireEvent.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(changed).toHaveBeenCalledWith(task));
        expect(update).toHaveBeenLastCalledWith(task.id, { expected_revision: latest.revision, values: { context: "집" } });
        expect(task.data.list_name).toBe("개발");
        expect(task.data.custom_fields[numberId]).toBe(8);
    });

    it.each([
        { field: numberField, value: 0, saved: 15, formatted: "15" },
        { field: checkField, value: false, saved: true, formatted: "체크됨" },
    ])("preserves a $field.type draft when the parent adopts the freshly loaded revision", async ({ field, value, saved, formatted }) => {
        const key = `custom:${field.id}`;
        const latest = { ...task, revision: task.revision + 3, data: { ...task.data, custom_fields: { ...task.data.custom_fields, [field.id]: saved } } };
        const updated = { ...latest, revision: latest.revision + 1, data: { ...latest.data, custom_fields: { ...latest.data.custom_fields, [field.id]: value } } };
        const update = vi.spyOn(api, "updateTaskProperties").mockRejectedValueOnce(new ApiError("최신 작업을 확인해 주세요.", 409)).mockResolvedValue(updated);
        vi.spyOn(api, "item").mockResolvedValue(latest);
        function Editable() {
            const [current, setCurrent] = useState(task);
            return <TaskFieldCells task={current} fields={[key]} definitions={[field]} onChanged={item => { if (item.kind === "task") setCurrent(item); }} />;
        }
        render(<Editable />);
        fireEvent.click(screen.getByRole("button", { name: `필드 작업 ${field.name} 편집` }));
        if (typeof value === "number") fireEvent.change(screen.getByRole("textbox", { name: field.name }), { target: { value: String(value) } });
        else fireEvent.click(screen.getByRole("checkbox", { name: field.name }));
        fireEvent.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
        fireEvent.click(screen.getByRole("button", { name: "최신 작업 불러오기" }));
        await waitFor(() => expect(screen.getByRole("status").textContent).toContain(`최신 저장 값: ${formatted}`));
        expect(update).toHaveBeenCalledOnce();
        if (typeof value === "number") expect((screen.getByRole("textbox", { name: field.name }) as HTMLInputElement).value).toBe("0");
        else expect(screen.getByRole("checkbox", { name: field.name }).getAttribute("data-state")).toBe("unchecked");
        fireEvent.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(update).toHaveBeenLastCalledWith(task.id, { expected_revision: latest.revision, values: { [key]: value } }));
        await waitFor(() => expect(screen.queryByRole("button", { name: "저장" })).toBeNull());
        fireEvent.click(screen.getByRole("button", { name: `필드 작업 ${field.name} 편집` }));
        expect(screen.queryByRole("status")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(update).toHaveBeenLastCalledWith(task.id, { expected_revision: updated.revision, values: { [key]: value } }));
    });

    it("preserves a draft and blocks editing, closing, and extra requests while loading the latest task", async () => {
        let complete: ((item: typeof task) => void) | undefined;
        const update = vi.spyOn(api, "updateTaskProperties").mockRejectedValue(new ApiError("다른 변경", 409));
        const load = vi.spyOn(api, "item").mockImplementation(() => new Promise(resolve => { complete = resolve; }));
        const user = userEvent.setup();
        render(<TaskFieldCells task={task} fields={["context"]} definitions={[]} onChanged={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "필드 작업 맥락 편집" }));
        fireEvent.change(screen.getByRole("textbox", { name: "맥락" }), { target: { value: "집" } });
        await user.click(screen.getByRole("button", { name: "저장" }));
        await user.click(await screen.findByRole("button", { name: "최신 작업 불러오기" }));
        expect((screen.getByRole("textbox", { name: "맥락" }) as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "취소" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "불러오는 중…" }) as HTMLButtonElement).disabled).toBe(true);
        await user.keyboard("{Escape}");
        expect(screen.getByRole("textbox", { name: "맥락" })).toBeTruthy();
        expect(load).toHaveBeenCalledOnce();
        complete?.({ ...task, revision: task.revision + 1 });
        await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
        expect((screen.getByRole("textbox", { name: "맥락" }) as HTMLInputElement).value).toBe("집");
        expect(update).toHaveBeenCalledOnce();
    });

    it.each(["denied", "wrong-kind"])("keeps the input and recovery action after latest task loading fails: %s", async failure => {
        const update = vi.spyOn(api, "updateTaskProperties").mockRejectedValue(new ApiError("다른 변경", 409));
        const load = vi.spyOn(api, "item");
        if (failure === "denied") load.mockRejectedValue(new ApiError("이 작업을 읽을 권한이 없습니다.", 403));
        else load.mockResolvedValue(idea);
        const changed = vi.fn();
        render(<TaskFieldCells task={task} fields={["context"]} definitions={[]} onChanged={changed} />);
        fireEvent.click(screen.getByRole("button", { name: "필드 작업 맥락 편집" }));
        fireEvent.change(screen.getByRole("textbox", { name: "맥락" }), { target: { value: "집" } });
        fireEvent.click(screen.getByRole("button", { name: "저장" }));
        fireEvent.click(await screen.findByRole("button", { name: "최신 작업 불러오기" }));
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(failure === "denied" ? "권한이 없습니다" : "해당 작업과 일치하지 않습니다"));
        expect((screen.getByRole("textbox", { name: "맥락" }) as HTMLInputElement).value).toBe("집");
        expect(screen.getByRole("button", { name: "최신 작업 불러오기" })).toBeTruthy();
        expect(changed).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledOnce();
    });

    it("clears built-in dates as empty strings and custom dates as null", async () => {
        const update = vi.spyOn(api, "updateTaskProperties").mockResolvedValue(task);
        render(<TaskFieldCells task={task} fields={["due_date", `custom:${dateId}`]} definitions={[dateField]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "필드 작업 마감일 편집" }));
        fireEvent.change(screen.getByLabelText("마감일"), { target: { value: "" } });
        fireEvent.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(update).toHaveBeenLastCalledWith(task.id, { expected_revision: task.revision, values: { due_date: "" } }));
        await waitFor(() => expect(screen.queryByRole("button", { name: "저장" })).toBeNull());
        fireEvent.click(screen.getByRole("button", { name: "필드 작업 검수일 편집" }));
        fireEvent.click(screen.getByRole("button", { name: "값 지우기" }));
        await waitFor(() => expect(update).toHaveBeenLastCalledWith(task.id, { expected_revision: task.revision, values: { [`custom:${dateId}`]: null } }));
    });

    it("discards an edit on Escape without sending a request", async () => {
        const update = vi.spyOn(api, "updateTaskProperties").mockResolvedValue(task);
        const user = userEvent.setup();
        render(<TaskFieldCells task={task} fields={["goal"]} definitions={[]} onChanged={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "필드 작업 목표 편집" }));
        await user.type(screen.getByRole("textbox", { name: "목표" }), "임시 입력{Escape}");
        expect(screen.queryByRole("textbox", { name: "목표" })).toBeNull();
        expect(update).not.toHaveBeenCalled();
    });

    it("formats zero and false values without displaying an empty placeholder", () => {
        const zeroTask = { ...task, data: { ...task.data, custom_fields: { [numberId]: 0, [checkId]: false } } };
        expect(formatTaskField(zeroTask, `custom:${numberId}`, [numberField])).toBe("0");
        expect(formatTaskField(zeroTask, `custom:${checkId}`, [checkField])).toBe("체크 안 됨");
    });
});
