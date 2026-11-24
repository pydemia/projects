import { ownerProject, renderWithOwnerPermissions as render } from "./permissions.test-support";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";
import { idea, projectId, userId } from "./fixtures.test-data";
import { navigate, useRoute } from "./hooks";
import { itemSchema, taskViewSchema } from "./models";
import { TaskWorkspace } from "./TaskWorkspace";
import { TaskTransfer } from "./TaskTransfer";

vi.mock("./ItemsPage", () => ({NewItem: () => null, RecordEditor: () => {
    const [draft, setDraft] = useState("");
    return <input aria-label="상세 초안" value={draft} onChange={event => setDraft(event.target.value)} />;
}}));
vi.mock("./TaskNoteReferences", () => ({TaskNoteReferences: () => null}));
vi.mock("./TaskContext", () => ({TaskContext: () => null}));
const task = itemSchema.parse({...idea, kind: "task", title: "날짜 없는 작업", data: {workflow: "personal"}});
beforeEach(() => {
    vi.restoreAllMocks(); sessionStorage.clear();
    vi.spyOn(api, "projects").mockResolvedValue([]);
    vi.spyOn(api, "taskViews").mockResolvedValue([]);
    window.history.replaceState(null, "", `/?project=${projectId}&view=tasks&item=${task.id}&taskScope=all&taskLayout=list&taskDensity=detailed&q=날짜&taskStatus=open&savedView=`);
});
function Workspace() {
    const route = useRoute();
    return <TaskWorkspace projectId={projectId} userId={userId} route={route} items={[task]} onChanged={vi.fn()} />;
}
it("changes each axis independently while retaining URL filters, selection and the mounted draft", async () => {
    render(<Workspace />);
    fireEvent.change(screen.getByRole("textbox", {name: "상세 초안"}), {target: {value: "미저장 초안"}});
    const editor = screen.getByRole("textbox", {name: "상세 초안"});
    await userEvent.click(screen.getByRole("tab", {name: "캘린더"}));
    expect(new URLSearchParams(location.search).get("taskScope")).toBe("all");
    expect(new URLSearchParams(location.search).get("q")).toBe("날짜");
    expect(new URLSearchParams(location.search).get("item")).toBe(task.id);
    expect(screen.getByRole("textbox", {name: "상세 초안"})).toBe(editor);
    expect((editor as HTMLInputElement).value).toBe("미저장 초안");
    fireEvent.click(screen.getByRole("radio", {name: "간단"}));
    expect(new URLSearchParams(location.search).get("taskLayout")).toBe("calendar");
    fireEvent.click(screen.getByRole("radio", {name: "오늘"}));
    expect(new URLSearchParams(location.search).get("taskDensity")).toBe("compact");
    expect(screen.getByText(/선택한 작업은 현재 조건 밖/)).toBeTruthy();
    expect(screen.getByRole("textbox", {name: "상세 초안"})).toBe(editor);
});

it("restores list GTD sorting after changing the board to manual order", async () => {
    render(<Workspace />);
    await userEvent.click(screen.getByRole("tab", {name: "보드"}));
    fireEvent.change(screen.getByRole("combobox", {name: "보드 정렬"}), {target: {value: "auto"}});
    fireEvent.change(screen.getByRole("combobox", {name: "보드 정렬"}), {target: {value: "manual"}});
    await userEvent.click(screen.getByRole("tab", {name: "목록"}));
    fireEvent.click(screen.getByText("보기 설정 · GTD/ABC·정렬"));
    expect((screen.getByRole("combobox", {name: "정렬"}) as HTMLSelectElement).value).toBe("gtd");
    const memory = JSON.parse(sessionStorage.getItem(`projects:task-view-memory:${userId}:${projectId}`)!);
    expect(memory.settings.layout_sorts).toEqual({list: "gtd", board: "manual"});
});

it("restores separate user-scoped project and global views, filters and calendar month on round trips", async () => {
    function SwitchingWorkspace() {
        const route = useRoute();
        return <><button onClick={() => navigate({project: "", view: "tasks"})}>전역으로</button><button onClick={() => navigate({project: projectId, view: "tasks"})}>프로젝트로</button>
            <TaskWorkspace key={route.project || "global"} projectId={route.project} userId={userId} route={route} items={[task]} onChanged={vi.fn()} /></>;
    }
    window.history.replaceState(null, "", `/?project=${projectId}&view=tasks&taskLayout=list&taskDensity=detailed`);
    render(<SwitchingWorkspace />);
    fireEvent.click(screen.getByText("보기 설정 · GTD/ABC·정렬"));
    fireEvent.change(screen.getByRole("textbox", {name: "현재 맥락"}), {target: {value: "desk"}});
    await userEvent.click(screen.getByRole("tab", {name: "캘린더"}));
    fireEvent.change(screen.getByRole("combobox", {name: "캘린더 날짜 기준"}), {target: {value: "due"}});
    fireEvent.click(screen.getByRole("button", {name: "다음 달"}));
    const month = document.querySelector(".task-calendar-head h2")?.textContent;
    const memoryKey = `projects:task-view-memory:${userId}:${projectId}`;
    const storedMonth = JSON.parse(sessionStorage.getItem(memoryKey)!).month;
    fireEvent.click(screen.getByRole("button", {name: "전역으로"}));
    fireEvent.click(screen.getByRole("radio", {name: "Inbox"}));
    fireEvent.click(screen.getByRole("button", {name: "프로젝트로"}));
    await waitFor(() => expect(screen.getByRole("tab", {name: "캘린더"}).getAttribute("aria-selected")).toBe("true"));
    expect((screen.getByRole("combobox", {name: "캘린더 날짜 기준"}) as HTMLSelectElement).value).toBe("due");
    expect(JSON.parse(sessionStorage.getItem(memoryKey)!).month).toBe(storedMonth);
    expect(document.querySelector(".task-calendar-head h2")?.textContent).toBe(month);
    await userEvent.click(screen.getByRole("tab", {name: "목록"}));
    fireEvent.click(screen.getByText("보기 설정 · GTD/ABC·정렬"));
    expect((screen.getByRole("textbox", {name: "현재 맥락"}) as HTMLInputElement).value).toBe("desk");
    fireEvent.click(screen.getByRole("button", {name: "전역으로"}));
    expect((screen.getByRole("radio", {name: "Inbox"}) as HTMLInputElement).checked).toBe(true);
    expect(sessionStorage.getItem(`projects:task-view-memory:another-user:${projectId}`)).toBeNull();
});

it("shows an unchanged past planned-only task in today's pending-plan group", () => {
    const pending = itemSchema.parse({...task, title: "지난 계획", data: {...task.data, list_name: "집필", planned_date: "2000-01-01", due_date: ""}});
    function TodayWorkspace({global = false}: {global?: boolean}) {
        const route = useRoute();
        return <TaskWorkspace projectId={global ? "" : projectId} userId={userId} route={route} items={[pending]} onChanged={vi.fn()} />;
    }
    window.history.replaceState(null, "", "/?view=tasks&taskScope=today&taskLayout=list&taskDensity=compact");
    const view = render(<TodayWorkspace />);
    expect(screen.getByRole("button", {name: "지난 계획 제목 수정"})).toBeTruthy();
    expect(screen.getByText("미처리 계획")).toBeTruthy();
    expect(document.querySelectorAll(".task-row")).toHaveLength(1);
    expect(pending.data.planned_date).toBe("2000-01-01");
    expect(pending.data.due_date).toBe("");
    view.rerender(<TodayWorkspace global />);
    expect(screen.getByRole("button", {name: "지난 계획 제목 수정"})).toBeTruthy();
    expect(screen.getByText("미처리 계획")).toBeTruthy();
    expect(document.querySelectorAll(".task-row")).toHaveLength(1);
    expect(pending.data.planned_date).toBe("2000-01-01");
});

it("places a task matching several today conditions once in its highest-priority group", () => {
    const today = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
    const cases = [
        itemSchema.parse({...task, id: "00000000-0000-4000-8000-000000000781", title: "지난 계획만", data: {...task.data, planned_date: "2000-01-01"}}),
        itemSchema.parse({...task, id: "00000000-0000-4000-8000-000000000782", title: "과거 계획과 오늘 마감", data: {...task.data, planned_date: "2000-01-01", due_date: today}}),
        itemSchema.parse({...task, id: "00000000-0000-4000-8000-000000000783", title: "오늘 계획과 지난 마감", data: {...task.data, planned_date: today, due_date: "2000-01-01"}}),
    ];
    function TodayWorkspace() {
        const route = useRoute();
        return <TaskWorkspace projectId={projectId} userId={userId} route={route} items={cases} onChanged={vi.fn()} />;
    }
    window.history.replaceState(null, "", "/?view=tasks&taskScope=today&taskLayout=list&taskDensity=compact");
    render(<TodayWorkspace />);
    expect(Array.from(document.querySelectorAll(".task-group-label"), node => node.textContent)).toEqual(["마감 지남", "오늘", "미처리 계획"]);
    expect(Array.from(document.querySelectorAll(".task-title"), node => node.textContent)).toEqual(["오늘 계획과 지난 마감", "과거 계획과 오늘 마감", "지난 계획만"]);
    expect(document.querySelectorAll(".task-row")).toHaveLength(3);
});

it("preserves a deliberately cleared saved-view query on refresh and explicitly restores its saved query", async () => {
    const saved = taskViewSchema.parse({id: "00000000-0000-4000-8000-000000000777", project_id: projectId, owner_id: userId, name: "검토", scope: "personal", is_default: false, revision: 1,
        settings: {schema_version: 2, layout_sorts: {}, task_scope: "all", calendar_date_field: "planned", mode: "complex", view: "list", query: "old", status: "open", lens: "gtd", minutes: 0, context: "", energy: "any", grouping: "none", sort: "gtd", card_fields: ["list_name", "due_date"]}});
    vi.mocked(api.taskViews).mockResolvedValue([saved]);
    window.history.replaceState(null, "", `/?project=${projectId}&view=tasks&savedView=${saved.id}`);
    const first = render(<Workspace />);
    await waitFor(() => expect((screen.getByRole("searchbox", {name: "작업 검색"}) as HTMLInputElement).value).toBe("old"));
    fireEvent.change(screen.getByRole("searchbox", {name: "작업 검색"}), {target: {value: ""}});
    expect(new URLSearchParams(location.search).has("q")).toBe(true);
    expect(new URLSearchParams(location.search).get("q")).toBe("");
    first.unmount();
    render(<Workspace />);
    await screen.findByText("저장 보기·설정 · 검토 · 변경 중");
    expect((screen.getByRole("searchbox", {name: "작업 검색"}) as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("radio", {name: "간단"}));
    expect(new URLSearchParams(location.search).get("q")).toBe("");
    fireEvent.click(screen.getByText("저장 보기·설정 · 검토 · 변경 중"));
    fireEvent.click(screen.getByRole("button", {name: "저장 상태 복원"}));
    await waitFor(() => expect((screen.getByRole("searchbox", {name: "작업 검색"}) as HTMLInputElement).value).toBe("old"));
    expect(new URLSearchParams(location.search).get("taskDensity")).toBe("detailed");
});

const transferTargetId = "00000000-0000-4000-8000-000000000999";

it("shows preview blockers and never submits a blocked batch", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([ownerProject(transferTargetId, "대상")]);
    vi.spyOn(api, "previewTransfer").mockResolvedValue({preview_token: "token", tasks: [task], target_project_id: transferTargetId, audience_changes: [], blockers: [{id: task.id, reason: "active_run"}], impact: {tasks: 1, links: 2, baselines: 1, skill_runs: 1}});
    const commit = vi.spyOn(api, "transferTasks");
    render(<TaskTransfer tasks={[task]} hiddenCount={1} onClose={vi.fn()} onChanged={vi.fn()} />, undefined, [ownerProject(projectId), ownerProject(transferTargetId)]);
    await screen.findByRole("option", {name: "대상"});
    fireEvent.change(screen.getByRole("combobox", {name: "대상 프로젝트"}), {target: {value: transferTargetId}});
    fireEvent.click(screen.getByRole("button", {name: "이동 영향 미리보기"}));
    await screen.findByText(/실행 중인 SkillRun/);
    expect((screen.getByRole("button", {name: "전체 이동 확정"}) as HTMLButtonElement).disabled).toBe(true);
    expect(commit).not.toHaveBeenCalled();
});

it("recovers an uncertain transfer by the same operation ID and conditionally undoes it", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([ownerProject(transferTargetId, "대상")]);
    vi.spyOn(api, "previewTransfer").mockResolvedValue({preview_token: "token", tasks: [task], target_project_id: transferTargetId, audience_changes: [], blockers: [], impact: {tasks: 1, links: 0, baselines: 0, skill_runs: 0}});
    const result = {transfer_id: "transfer", operation_id: "operation", undo_of: null, tasks: [task], projects: []};
    const commit = vi.spyOn(api, "transferTasks").mockRejectedValue(new Error("timeout"));
    const recover = vi.spyOn(api, "transferOperation").mockResolvedValue(result);
    const undo = vi.spyOn(api, "undoTransfer").mockResolvedValue({...result, undo_of: "transfer"});
    const close = vi.fn();
    render(<TaskTransfer tasks={[task]} hiddenCount={0} onClose={close} onChanged={vi.fn()} />, undefined, [ownerProject(projectId), ownerProject(transferTargetId)]);
    await screen.findByRole("option", {name: "대상"});
    fireEvent.change(screen.getByRole("combobox", {name: "대상 프로젝트"}), {target: {value: transferTargetId}});
    fireEvent.click(screen.getByRole("button", {name: "이동 영향 미리보기"}));
    fireEvent.click(await screen.findByRole("button", {name: "전체 이동 확정"}));
    fireEvent.click(await screen.findByRole("button", {name: "이동 결과 확인"}));
    await screen.findByText("1개 작업 이동 완료");
    expect(recover).toHaveBeenCalledWith((commit.mock.calls[0]![0] as {operation_id: string}).operation_id);
    fireEvent.click(screen.getByRole("button", {name: "조건 확인 후 되돌리기"}));
    await waitFor(() => expect(undo).toHaveBeenCalledWith("transfer", expect.any(String)));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
});

it("allows a fresh preview after a definite conflict instead of freezing in an unknown result", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([ownerProject(transferTargetId, "대상")]);
    vi.spyOn(api, "previewTransfer").mockResolvedValue({preview_token: "token", tasks: [task], target_project_id: transferTargetId, audience_changes: [], blockers: [], impact: {tasks: 1, links: 0, baselines: 0, skill_runs: 0}});
    const commit = vi.spyOn(api, "transferTasks").mockRejectedValue(new ApiError("revision conflict", 409));
    render(<TaskTransfer tasks={[task]} hiddenCount={0} onClose={vi.fn()} onChanged={vi.fn()} />, undefined, [ownerProject(projectId), ownerProject(transferTargetId)]);
    await screen.findByRole("option", {name: "대상"});
    fireEvent.change(screen.getByRole("combobox", {name: "대상 프로젝트"}), {target: {value: transferTargetId}});
    fireEvent.click(screen.getByRole("button", {name: "이동 영향 미리보기"}));
    fireEvent.click(await screen.findByRole("button", {name: "전체 이동 확정"}));
    await screen.findByText("revision conflict");
    expect(screen.queryByRole("button", {name: "이동 결과 확인"})).toBeNull();
    fireEvent.click(screen.getByRole("button", {name: "이동 영향 미리보기"}));
    fireEvent.click(await screen.findByRole("button", {name: "전체 이동 확정"}));
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
    const operations = commit.mock.calls.map(call => (call[0] as {operation_id: string}).operation_id);
    expect(operations[1]).not.toBe(operations[0]);
});
