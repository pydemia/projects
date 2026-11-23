import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";
import { taskViewSchema, taskViewSettingsSchema } from "./models";
import type { TaskViewBarProps } from "./TaskViewBar";
import { TaskViewBar } from "./TaskViewBar";

const projectId = "00000000-0000-4000-8000-000000000111";
const saved = taskViewSchema.parse({
    id: "00000000-0000-4000-8000-000000000112", project_id: projectId,
    owner_id: "00000000-0000-4000-8000-000000000113", scope: "personal",
    name: "이번 주", is_default: true, revision: 7,
    settings: { schema_version: 2, mode: "simple", view: "list", task_scope: "today",
        query: "저장한 검색", status: "open", lens: "gtd", minutes: 30, context: "집",
        energy: "low", grouping: "none", sort: "gtd", layout_sorts: {list: "gtd", board: "manual"},
        calendar_date_field: "due", card_fields: ["due_date", "custom:priority"],
        list_fields: ["state", "custom:effort"] },
});
const current = taskViewSettingsSchema.parse({...saved.settings, query: "화면 검색", context: "회사", list_fields: ["planned_date", "custom:score"]});
beforeEach(() => { vi.restoreAllMocks(); });
function mount(patch: Partial<TaskViewBarProps> = {}) {
    const props = {projectId, views: [saved], activeId: saved.id, settings: current,
        dirty: true, onSelect: vi.fn(), onChanged: vi.fn(), ...patch};
    const result = render(<TaskViewBar {...props} />);
    return {...props, rerender: result.rerender};
}
async function openMenu(action: string) {
    await userEvent.click(screen.getByRole("button", {name: "이번 주 보기 관리"}));
    await userEvent.click(await screen.findByRole("menuitem", {name: action}));
}

it("creates a named board from current filters and fields without making it default", async () => {
    const create = vi.spyOn(api, "createTaskView").mockResolvedValue({...saved, id: "00000000-0000-4000-8000-000000000114"});
    const props = mount();
    await userEvent.click(screen.getByRole("button", {name: "보기"}));
    await userEvent.type(screen.getByRole("textbox", {name: "저장 보기 이름"}), "출근 보드");
    await userEvent.selectOptions(screen.getByRole("combobox", {name: "저장 보기 레이아웃"}), "board");
    await userEvent.click(screen.getByRole("button", {name: "새 보기 만들기"}));
    await waitFor(() => expect(create).toHaveBeenCalledWith(projectId, {name: "출근 보드", scope: "personal", is_default: false,
        settings: {...current, schema_version: 2, view: "board", grouping: "state"}}));
    expect(props.onSelect).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000114");
    expect(props.onChanged).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
});

it("renames using the saved settings and original revision, preserving unsaved screen changes", async () => {
    const update = vi.spyOn(api, "updateTaskView").mockResolvedValue({...saved, name: "다음 주"});
    const props = mount();
    await openMenu("이름 변경");
    const input = screen.getByRole("textbox", {name: "저장 보기 이름"});
    await userEvent.clear(input); await userEvent.type(input, "다음 주");
    await userEvent.click(screen.getByRole("button", {name: "이름 변경 저장"}));
    await waitFor(() => expect(update).toHaveBeenCalledWith(saved.id, {name: "다음 주", scope: "personal", is_default: true,
        expected_revision: 7, settings: saved.settings}));
    expect(props.onChanged).toHaveBeenCalledOnce();
});

it("retains rename input on a revision conflict and offers the parent reload", async () => {
    vi.spyOn(api, "updateTaskView").mockRejectedValue(new ApiError("최신 버전을 확인해 주세요.", 409));
    const props = mount();
    await openMenu("이름 변경");
    const input = screen.getByRole("textbox", {name: "저장 보기 이름"});
    await userEvent.clear(input); await userEvent.type(input, "내 이름 유지");
    await userEvent.click(screen.getByRole("button", {name: "이름 변경 저장"}));
    await within(screen.getByRole("dialog")).findByText("최신 버전을 확인해 주세요.");
    expect(input).toHaveProperty("value", "내 이름 유지");
    expect(props.onChanged).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", {name: "다시 시도"}));
    expect(props.onChanged).toHaveBeenCalledOnce();
});

it("duplicates saved settings and clears default instead of copying current unsaved filters", async () => {
    const create = vi.spyOn(api, "createTaskView").mockResolvedValue(saved);
    mount();
    await openMenu("보기 복제");
    await userEvent.click(screen.getByRole("button", {name: "복제 보기 만들기"}));
    await waitFor(() => expect(create).toHaveBeenCalledWith(projectId, {name: "이번 주 복사", scope: "personal", is_default: false, settings: saved.settings}));
});

it("requires explicit adoption of a refreshed revision while retaining the entered rename", async () => {
    const update = vi.spyOn(api, "updateTaskView")
        .mockRejectedValueOnce(new ApiError("보기가 변경되었습니다.", 409)).mockResolvedValue(saved);
    const props = mount();
    await openMenu("이름 변경");
    const input = screen.getByRole("textbox", {name: "저장 보기 이름"});
    await userEvent.clear(input); await userEvent.type(input, "입력한 이름");
    await userEvent.click(screen.getByRole("button", {name: "이름 변경 저장"}));
    await screen.findByText("보기가 변경되었습니다.");
    const latest = {...saved, revision: 8, settings: {...saved.settings, query: "다른 창에서 저장한 검색"}};
    props.rerender(<TaskViewBar {...props} views={[latest]} />);
    expect(input).toHaveProperty("value", "입력한 이름");
    await userEvent.click(screen.getByRole("button", {name: "최신 보기 버전 사용"}));
    await userEvent.click(screen.getByRole("button", {name: "이름 변경 저장"}));
    await waitFor(() => expect(update).toHaveBeenLastCalledWith(saved.id, {name: "입력한 이름", scope: "personal", is_default: true,
        expected_revision: 8, settings: latest.settings}));
});

it("changes default with compare-and-swap and saved configuration", async () => {
    const update = vi.spyOn(api, "updateTaskView").mockResolvedValue({...saved, is_default: false});
    const props = mount();
    await openMenu("기본 보기 해제");
    await waitFor(() => expect(update).toHaveBeenCalledWith(saved.id, {name: saved.name, scope: "personal", is_default: false,
        expected_revision: 7, settings: saved.settings}));
    expect(props.onChanged).toHaveBeenCalledOnce();
});

it("requires concrete delete confirmation, allows cancel, and retains the view on failure", async () => {
    const remove = vi.spyOn(api, "deleteTaskView").mockRejectedValue(new ApiError("삭제할 수 없습니다.", 500));
    const props = mount();
    await openMenu("보기 삭제");
    expect(screen.getByRole("dialog").textContent).toContain("‘이번 주’ 보기를 삭제");
    await userEvent.click(screen.getByRole("button", {name: "취소"}));
    expect(remove).not.toHaveBeenCalled();
    await openMenu("보기 삭제");
    await userEvent.click(screen.getByRole("button", {name: "보기 삭제 확인"}));
    await within(screen.getByRole("dialog")).findByText("삭제할 수 없습니다.");
    expect(remove).toHaveBeenCalledWith(saved.id);
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onChanged).not.toHaveBeenCalled();
});

it("writes current fields only after explicit update and sends the saved revision", async () => {
    const update = vi.spyOn(api, "updateTaskView").mockResolvedValue(saved);
    const props = mount();
    expect(screen.getByLabelText("저장하지 않은 변경")).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", {name: "현재 보기 업데이트"}));
    await waitFor(() => expect(update).toHaveBeenCalledWith(saved.id, {name: saved.name, scope: "personal", is_default: true,
        expected_revision: 7, settings: current}));
    expect(props.onChanged).toHaveBeenCalledOnce();
});

it("clears only the active saved-view selection after confirmed deletion", async () => {
    vi.spyOn(api, "deleteTaskView").mockResolvedValue({ok: true});
    const props = mount();
    await openMenu("보기 삭제");
    await userEvent.click(screen.getByRole("button", {name: "보기 삭제 확인"}));
    await waitFor(() => expect(props.onSelect).toHaveBeenCalledWith(""));
    expect(props.onChanged).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
});

it("selects a named view through the parent callback without saving it", async () => {
    const update = vi.spyOn(api, "updateTaskView");
    const props = mount({dirty: false});
    const tab = screen.getByRole("button", {name: "이번 주 목록 기본 보기"});
    expect(tab.getAttribute("aria-current")).toBe("page");
    await userEvent.click(tab);
    expect(props.onSelect).toHaveBeenCalledWith(saved.id);
    expect(update).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", {name: "현재 보기 업데이트"})).toBeNull();
});
