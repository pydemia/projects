import { ownerProject, renderWithOwnerPermissions as render } from "./permissions.test-support";
import userEvent from "@testing-library/user-event";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";
import { idea, projectId, userId } from "./fixtures.test-data";
import { GlobalTasks } from "./GlobalTasks";
import { useRoute } from "./hooks";
import { itemSchema, linkSchema, taskViewSchema } from "./models";
import { TaskWorkspace } from "./TaskWorkspace";

vi.mock("./ItemsPage", () => ({ NewItem: () => null, RecordEditor: () => <input aria-label="상세 초안" defaultValue="" /> }));
vi.mock("./TaskNoteReferences", () => ({TaskNoteReferences: () => null}));
vi.mock("./TaskContext", () => ({TaskContext: () => null}));
const task = itemSchema.parse({...idea, kind: "task", title: "전역 작업", data: {workflow: "personal"}});
const rows = Array.from({length: 151}, (_, index) => itemSchema.parse({...task,
    id: `00000000-0000-4000-8000-${String(index + 1000).padStart(12, "0")}`, title: `전역 작업 ${index + 1}`}));
function page(items = [task], cursor: string | null = null, total = items.length) {
    return {items, next_cursor: cursor, total, as_of: "2026-11-02T00:00:00Z", scope_counts: {all: total, today: 0, inbox: total, upcoming: 0}};
}
beforeEach(() => {
    vi.restoreAllMocks(); sessionStorage.clear();
    vi.spyOn(api, "projects").mockResolvedValue([]);
    vi.spyOn(api, "taskViews").mockResolvedValue([]);
    vi.spyOn(api, "links").mockResolvedValue([]);
    window.history.replaceState(null, "", "/?view=tasks&taskScope=all&taskLayout=list&taskDensity=compact&taskStatus=open");
});
afterEach(() => vi.unstubAllGlobals());
function Global() { const route = useRoute(); return <GlobalTasks userId={userId} route={route} />; }
function Workspace() { const route = useRoute(); return <TaskWorkspace projectId="" userId={userId} route={route} items={[task]} onChanged={vi.fn()} />; }

it.each(["compact", "detailed"])("opens every global layout in %s mode without losing the selected draft", async density => {
    window.history.replaceState(null, "", `/?view=tasks&taskLayout=list&taskDensity=${density}&item=${task.id}&q=전역&taskStatus=open`);
    render(<Workspace />);
    const editor = screen.getByRole("textbox", {name: "상세 초안"});
    const save = vi.spyOn(api, "saveItem");
    const move = vi.spyOn(api, "moveTask");
    fireEvent.change(editor, {target: {value: "보존할 초안"}});
    for (const [name, layout] of [["보드", "board"], ["그래프", "graph"], ["캘린더", "calendar"], ["집계", "insights"], ["목록", "list"]]) {
        const tab = screen.getByRole("tab", {name});
        expect((tab as HTMLButtonElement).disabled).toBe(false);
        await userEvent.click(tab);
        expect(tab.getAttribute("aria-selected")).toBe("true");
        expect(new URLSearchParams(location.search).get("taskLayout")).toBe(layout);
        expect(new URLSearchParams(location.search).get("item")).toBe(task.id);
        expect(new URLSearchParams(location.search).get("q")).toBe("전역");
        expect(screen.getByRole("textbox", {name: "상세 초안"})).toBe(editor);
        expect((editor as HTMLInputElement).value).toBe("보존할 초안");
        if (layout === "board") {
            expect(screen.getByRole("combobox", {name: "보드 정렬"})).toHaveProperty("value", "auto");
            expect(screen.queryByRole("button", {name: "+ 할 일 작업"})).toBeNull();
        }
        if (layout === "graph") expect(screen.getByRole("region", {name: "작업 그래프"})).toBeTruthy();
        if (layout === "calendar") expect(screen.getByRole("combobox", {name: "캘린더 날짜 기준"})).toBeTruthy();
        if (layout === "insights") expect(screen.getByRole("region", {name: "작업 집계"})).toBeTruthy();
    }
    expect(save).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
});

it("shows a visible 보기 모드 legend with concise selectable modes", () => {
    render(<Workspace />);
    const group = screen.getByRole("group", {name: "보기 모드"});
    expect(group.querySelector("legend")?.textContent).toBe("보기 모드");
    expect(within(group).getByRole("radio", {name: "간단"})).toHaveProperty("checked", true);
    fireEvent.click(within(group).getByRole("radio", {name: "상세"}));
    expect(within(group).getByRole("radio", {name: "상세"})).toHaveProperty("checked", true);
    expect(new URLSearchParams(location.search).get("taskDensity")).toBe("detailed");
});

it.each(["board", "graph", "calendar", "insights"])("aggregates every bounded server page for global %s", async layout => {
    window.history.replaceState(null, "", `/?view=tasks&taskLayout=${layout}&taskDensity=compact`);
    const tasks = vi.spyOn(api, "tasks").mockResolvedValueOnce(page(rows.slice(0, 100), "next", 151)).mockResolvedValueOnce(page(rows.slice(100), null, 151));
    render(<Global />);
    await waitFor(() => expect(document.querySelector(".task-result-count")?.textContent).toContain("151개 작업"));
    expect(tasks).toHaveBeenCalledTimes(2);
    expect(tasks.mock.calls[0]?.[0]).toEqual(expect.objectContaining({limit: "100"}));
    expect(tasks.mock.calls[1]?.[0]).toEqual(expect.objectContaining({cursor: "next", limit: "100"}));
    expect(tasks.mock.calls.every(call => call[1] instanceof AbortSignal)).toBe(true);
    expect(screen.queryByRole("button", {name: "다음 작업 더 보기"})).toBeNull();
});

it("keeps a partial aggregate visibly incomplete and retries from a fresh snapshot after a later-page error", async () => {
    window.history.replaceState(null, "", "/?view=tasks&taskLayout=insights");
    const tasks = vi.spyOn(api, "tasks").mockResolvedValueOnce(page(rows.slice(0, 100), "next", 151))
        .mockRejectedValueOnce(new Error("두번째 페이지 실패"))
        .mockResolvedValueOnce(page(rows.slice(0, 100), "fresh", 151)).mockResolvedValueOnce(page(rows.slice(100), null, 151));
    render(<Global />);
    const error = await screen.findByText(/두번째 페이지 실패/);
    expect(screen.getByRole("status").textContent).toContain("100 / 151개");
    expect(screen.getByRole("status").textContent).toContain("일부 결과");
    expect(document.querySelector(".task-result-count")?.textContent).toContain("불러온 작업 100개");
    fireEvent.click(within(error.closest('[role="alert"]') as HTMLElement).getByRole("button", {name: "다시 시도"}));
    await waitFor(() => expect(document.querySelector(".task-result-count")?.textContent).toContain("151개 작업"));
    expect(tasks.mock.calls[2]?.[0]).not.toHaveProperty("cursor");
});

it("resets an expired cursor once, discards the old snapshot and reports repeated conflicts", async () => {
    window.history.replaceState(null, "", "/?view=tasks&taskLayout=calendar");
    const tasks = vi.spyOn(api, "tasks").mockResolvedValueOnce(page(rows.slice(0, 100), "expired", 151))
        .mockRejectedValueOnce(new ApiError("조회 기준이 변경되었습니다", 409))
        .mockResolvedValueOnce(page(rows.slice(100), "expired-again", 151))
        .mockRejectedValueOnce(new ApiError("조회 기준이 다시 변경되었습니다", 409));
    render(<Global />);
    await screen.findByText(/조회 기준이 다시 변경되었습니다/);
    expect(tasks).toHaveBeenCalledTimes(4);
    expect(tasks.mock.calls[2]?.[0]).not.toHaveProperty("cursor");
    expect(document.querySelector(".task-result-count")?.textContent).toContain("불러온 작업 51개");
    expect(screen.queryByRole("link", {name: "전역 작업 1"})).toBeNull();
});

it("selects a canonical project while preserving layout and density", async () => {
    const selectedProject = ownerProject(projectId, "선택 프로젝트");
    vi.mocked(api.projects).mockResolvedValue([selectedProject]);
    vi.spyOn(api, "tasks").mockResolvedValue(page());
    window.history.replaceState(null, "", "/?view=tasks&taskLayout=calendar&taskDensity=detailed&taskScope=today&q=전역&taskStatus=open");
    render(<Global />, undefined, [selectedProject]);
    const selector = screen.getByRole("combobox", {name: "소속 프로젝트"});
    await within(selector).findByRole("option", {name: "선택 프로젝트"});
    fireEvent.change(selector, {target: {value: projectId}});
    const params = new URLSearchParams(location.search);
    expect(params.get("project")).toBe(projectId);
    expect(params.get("taskProject")).toBeNull();
    expect(params.get("taskLayout")).toBe("calendar");
    expect(params.get("taskDensity")).toBe("detailed");
    expect(params.get("taskScope")).toBe("today");
    expect(params.get("q")).toBe("전역");
});

it("loads a saved project filter and deadline layout before requesting tasks", async () => {
    const otherProjectId = "00000000-0000-4000-8000-000000000992";
    const otherTask = itemSchema.parse({...rows[0], project_id: otherProjectId, title: "다른 프로젝트 작업"});
    const saved = taskViewSchema.parse({id: "00000000-0000-4000-8000-000000000993", project_id: null, owner_id: userId,
        name: "내 마감 일정", scope: "personal", is_default: false, revision: 1,
        settings: {schema_version: 2, task_scope: "all", view: "list", mode: "complex", query: "", status: "open",
            lens: "gtd", minutes: 0, context: "", energy: "any", grouping: "state", sort: "deadline",
            layout_sorts: {list: "gtd"}, card_fields: [], list_variant: "deadline", project_ids: [projectId]}});
    vi.mocked(api.taskViews).mockResolvedValue([saved]);
    const tasks = vi.spyOn(api, "tasks").mockImplementation(async params => page(params.project_ids ? [task] : [task, otherTask]));
    window.history.replaceState(null, "", `/?view=tasks&savedView=${saved.id}`);
    render(<Global />, undefined, [ownerProject(projectId, "선택 프로젝트"), ownerProject(otherProjectId, "다른 프로젝트")]);

    await screen.findByRole("button", {name: "전역 작업"});
    expect(tasks.mock.calls[0]?.[0]).toMatchObject({project_ids: projectId, sort: "deadline"});
    expect(screen.getByRole("radio", {name: "마감 우선"})).toHaveProperty("checked", true);
    expect(screen.queryByRole("button", {name: "다른 프로젝트 작업"})).toBeNull();

    await userEvent.click(screen.getByRole("button", {name: /프로젝트 필터/}));
    await userEvent.click(screen.getByRole("button", {name: "모두 보기"}));
    await screen.findByRole("button", {name: "다른 프로젝트 작업"});
    expect(new URLSearchParams(location.search).get("taskProjects")).toBe("");
    expect(tasks.mock.lastCall?.[0]).not.toHaveProperty("project_ids");
    expect(tasks.mock.lastCall?.[0].sort).toBe("deadline");

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", {name: /내 마감 일정 마감 우선/}));
    await screen.findByRole("button", {name: "전역 작업"});
    expect(tasks.mock.lastCall?.[0]).toMatchObject({project_ids: projectId, sort: "deadline"});
    expect(screen.queryByRole("button", {name: "다른 프로젝트 작업"})).toBeNull();
});

it("aborts an old aggregate and ignores its late page when the filter changes", async () => {
    window.history.replaceState(null, "", "/?view=tasks&taskLayout=insights&taskDensity=detailed");
    let finishOld!: (value: ReturnType<typeof page>) => void;
    const oldPage = new Promise<ReturnType<typeof page>>(resolve => {finishOld = resolve;});
    const tasks = vi.spyOn(api, "tasks").mockResolvedValueOnce(page(rows.slice(0, 100), "old-next", 151))
        .mockReturnValueOnce(oldPage).mockResolvedValueOnce(page([rows[150]!]));
    render(<Global />);
    await waitFor(() => expect(tasks).toHaveBeenCalledTimes(2));
    expect(document.querySelector(".global-task-summary [role=status]")?.textContent).toContain("나머지 불러오는 중");
    fireEvent.change(screen.getByRole("searchbox", {name: "작업 검색"}), {target: {value: "151"}});
    await waitFor(() => expect(document.querySelector(".task-result-count")?.textContent).toContain("1개 작업"));
    expect(tasks.mock.calls[1]?.[1]?.aborted).toBe(true);
    await act(async () => {finishOld(page(rows.slice(100), null, 151)); await oldPage;});
    expect(document.querySelector(".task-result-count")?.textContent).toContain("1개 작업");
    expect(document.querySelector(".global-task-summary [role=status]")?.textContent).toContain("1 / 1개");
});

it("retains an independently fetched selection without adding it to aggregate results", async () => {
    const selectionProjectId = "00000000-0000-4000-8000-000000000990";
    const selection = itemSchema.parse({...task, project_id: selectionProjectId});
    const parentLink = linkSchema.parse({id: rows[1]!.id, project_id: selectionProjectId, source_id: selection.id, target_id: rows[2]!.id,
        relation: "subtask_of", source_revision: 1, target_revision: 1});
    window.history.replaceState(null, "", `/?view=tasks&taskLayout=insights&taskProjects=${projectId}&item=${selection.id}`);
    vi.spyOn(api, "tasks").mockResolvedValue(page([rows[0]!]));
    vi.spyOn(api, "item").mockResolvedValue(selection);
    vi.mocked(api.links).mockImplementation(async id => id === selectionProjectId ? [parentLink] : []);
    render(<Global />, undefined, [ownerProject(projectId, "결과 프로젝트"), ownerProject(selectionProjectId, "선택 작업 프로젝트")]);
    const editor = await screen.findByRole("textbox", {name: "상세 초안"});
    await screen.findByRole("button", {name: "부모 작업 변경"});
    fireEvent.change(editor, {target: {value: "보존할 초안"}});
    await waitFor(() => expect(document.querySelector(".task-result-count")?.textContent).toContain("1개 작업"));
    expect(screen.getByText(/선택한 작업은 현재 조건 밖/)).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", {name: "보드"}));
    expect(screen.getByRole("textbox", {name: "상세 초안"})).toBe(editor);
    expect(screen.queryByRole("button", {name: "전역 작업 작업 메뉴"})).toBeNull();
    expect(document.querySelector(".task-result-count")?.textContent).toContain("1개 작업");
    await userEvent.click(screen.getByRole("tab", {name: "그래프"}));
    const graph = screen.getByRole("region", {name: "작업 그래프"});
    await within(graph).findByText("작업 1개 · 관계 0개");
    expect(graph.querySelector(`[data-task-graph-id="${selection.id}"]`)).toBeNull();
});

it("keeps global list pagination explicit", async () => {
    const tasks = vi.spyOn(api, "tasks").mockResolvedValueOnce(page(rows.slice(0, 50), "list-next", 151))
        .mockResolvedValueOnce(page(rows.slice(50, 100), "list-last", 151));
    render(<Global />);
    const more = await screen.findByText("다음 작업 더 보기", {selector: "button"});
    expect(tasks).toHaveBeenCalledTimes(1);
    expect(tasks.mock.calls[0]?.[0].limit).toBe("50");
    fireEvent.click(more);
    await waitFor(() => expect(document.querySelector(".task-result-count")?.textContent).toContain("불러온 작업 100개"));
    expect(tasks.mock.calls[1]?.[0].cursor).toBe("list-next");
});

it("appends an individual global board status move without cross-project anchors", async () => {
    window.history.replaceState(null, "", "/?view=tasks&taskLayout=board&taskDensity=detailed");
    const destination = itemSchema.parse({...task, id: rows[0]!.id, project_id: "00000000-0000-4000-8000-000000000999", project_name: "카드 소속 프로젝트", title: "다른 프로젝트 카드", data: {...task.data, state: "in_progress"}});
    const move = vi.spyOn(api, "moveTask").mockResolvedValue({...task, revision: task.revision + 1, undo_move: {source_state: "in_progress", target_state: "todo", before_id: null, after_id: null}});
    const route = {project: "", view: "tasks", item: "", kind: "", q: "", run: "", baseline: "", taskLayout: "board", taskDensity: "detailed"};
    render(<TaskWorkspace projectId="" userId={userId} route={route} items={[task, destination]} onChanged={vi.fn()} />);
    const sort = screen.getByRole("combobox", {name: "보드 정렬"});
    expect(sort).toHaveProperty("value", "auto");
    expect(screen.getByText(/카드 소속 프로젝트/)).toBeTruthy();
    expect(within(sort).getByRole("option", {name: "수동 순서 · 드래그 가능"})).toHaveProperty("disabled", true);
    fireEvent.keyDown(screen.getByRole("button", {name: "전역 작업 작업 메뉴"}), {key: "Enter"});
    fireEvent.click(await screen.findByRole("menuitem", {name: "진행 중 열로 이동"}));
    await waitFor(() => expect(move).toHaveBeenCalledWith(task.id, {
        expected_revision: task.revision, source_state: "todo", target_state: "in_progress", before_id: null, after_id: null,
    }));
});

it.each(["compact", "detailed"])("keeps every layout available for empty and completed results in %s mode", async density => {
    const completed = itemSchema.parse({...task, data: {...task.data, state: "done"}});
    const route = {project: "", view: "tasks", item: "", kind: "", q: "", run: "", baseline: "", taskLayout: "list", taskDensity: density, taskStatus: "done"};
    const view = render(<TaskWorkspace projectId="" userId={userId} route={route} items={[]} onChanged={vi.fn()} />);
    for (const layout of ["list", "board", "graph", "calendar", "insights"]) {
        view.rerender(<TaskWorkspace projectId="" userId={userId} route={{...route, taskLayout: layout}} items={[]} onChanged={vi.fn()} />);
        for (const tab of screen.getAllByRole("tab")) expect(tab).toHaveProperty("disabled", false);
        view.rerender(<TaskWorkspace projectId="" userId={userId} route={{...route, taskLayout: layout}} items={[completed]} onChanged={vi.fn()} />);
        expect(document.querySelector(".task-result-count")?.textContent).toContain("1개 작업");
        expect(screen.getByRole("tab", {name: {list: "목록", board: "보드", graph: "그래프", calendar: "캘린더", insights: "집계"}[layout]}).getAttribute("aria-selected")).toBe("true");
    }
});

it("keeps delivery completion gates and restores a rejected global board move", async () => {
    const delivery = itemSchema.parse({...task, data: {...task.data, workflow: "delivery", state: "in_review"}});
    vi.spyOn(api, "moveTask").mockRejectedValue(new ApiError("완료 조건과 결과 근거를 기록해 주세요.", 409));
    const changed = vi.fn();
    const route = {project: "", view: "tasks", item: "", kind: "", q: "", run: "", baseline: "", taskLayout: "board", taskDensity: "compact"};
    render(<TaskWorkspace projectId="" userId={userId} route={route} items={[delivery]} onChanged={changed} />);
    fireEvent.keyDown(screen.getByRole("button", {name: "전역 작업 작업 메뉴"}), {key: "Enter"});
    fireEvent.click(await screen.findByRole("menuitem", {name: "완료 열로 이동"}));
    await screen.findByText(/작업 상세에서 완료 근거를 확인/);
    expect(screen.getByRole("heading", {name: /검토 중\s*1/})).toBeTruthy();
    expect(changed).toHaveBeenCalledOnce();
});

it.each([
    {mode: "simple", view: "inbox", layout: "list", density: "compact", scope: "inbox"},
    {mode: "complex", view: "board", layout: "board", density: "detailed", scope: "all"},
])("loads and restores a serialized version 1 $view saved view", async legacy => {
    vi.mocked(api.taskViews).mockRestore();
    const saved = {id: "00000000-0000-4000-8000-000000000777", project_id: projectId, owner_id: userId, name: "기존 보기", scope: "personal", is_default: false, revision: 1,
        settings: {schema_version: 1, task_scope: null, calendar_date_field: "planned", layout_sorts: {}, mode: legacy.mode, view: legacy.view, query: "전역", status: "open", lens: "gtd", minutes: 0, context: "", energy: "any", grouping: "state", sort: "manual", card_fields: []}};
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([saved]), {status: 200})));
    window.history.replaceState(null, "", `/?project=${projectId}&view=tasks&savedView=${saved.id}`);
    function SavedWorkspace() {const route = useRoute(); return <TaskWorkspace projectId={projectId} userId={userId} route={route} items={[task]} onChanged={vi.fn()} />;}
    render(<SavedWorkspace />);
    await waitFor(() => expect(new URLSearchParams(location.search).get("taskLayout")).toBe(legacy.layout));
    const params = new URLSearchParams(location.search);
    expect(params.get("taskDensity")).toBe(legacy.density);
    expect(params.get("taskScope")).toBe(legacy.scope);
    expect(params.get("q")).toBe("전역");
    expect(screen.queryByText(/저장된 보기를 불러오지 못했습니다/)).toBeNull();
});

it("offers mobile layouts and density directly as mode selectors, with horizontal board navigation", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn()})));
    render(<Workspace />);
    expect(screen.queryByRole("combobox", {name: "작업 보기"})).toBeNull();
    const header = document.querySelector<HTMLElement>(".mobile-task-header")!;
    const selector = within(header).getByRole("group", {name: "작업 보기"});
    for (const name of ["보드", "캘린더", "집계", "목록", "보드"]) {
        fireEvent.click(within(selector).getByRole("radio", {name}));
        expect(within(selector).getByRole("radio", {name})).toHaveProperty("checked", true);
    }
    expect(screen.queryByRole("combobox", {name: "상태 열"})).toBeNull();
    const columns = screen.getByRole("navigation", {name: "보드 상태 열"});
    expect(within(columns).getAllByRole("button")).toHaveLength(5);
    fireEvent.click(within(columns).getByRole("button", {name: /진행 중/}));
    expect(within(columns).getByRole("button", {name: /진행 중/}).getAttribute("aria-current")).toBe("true");
    expect(screen.queryByRole("button", {name: "+ 할 일 작업"})).toBeNull();
    expect(screen.getAllByRole("button", {name: "+ 추가"}).length).toBeGreaterThan(0);
    const group = within(header).getByRole("group", {name: "보기 모드"});
    fireEvent.click(within(group).getByRole("radio", {name: "상세"}));
    expect(within(group).getByRole("radio", {name: "상세"})).toHaveProperty("checked", true);
    expect(new URLSearchParams(location.search).get("taskLayout")).toBe("board");
});
