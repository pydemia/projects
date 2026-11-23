import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { api } from "./api";
import { idea, projectId, userId } from "./fixtures.test-data";
import { itemSchema, type Project } from "./models";
import { ownerProject } from "./permissions.test-support";
import { canProject, ProjectPermissionsProvider } from "./ProjectPermissions";
import { TaskBoard } from "./TaskBoard";
import { TaskTransfer } from "./TaskTransfer";
import { TaskFieldCells } from "./TaskFields";
import { ProjectsThemeProvider } from "./theme";

vi.mock("./ProjectPages", async () => {
    const {useState} = await import("react");
    const {useAuthenticationDraft} = await import("./auth-drafts");
    const {z} = await import("zod");
    return {Overview: () => {
        const [text, setText] = useState("");
        useAuthenticationDraft("permission-fixture:revocation", z.object({text: z.string()}).strict(), () => text ? {text} : null);
        return <label>권한 초안<input value={text} onChange={event => setText(event.target.value)} /></label>;
    }, TracePage: () => null};
});

function withCapabilities(capabilities: string[], extra: Partial<NonNullable<Project["access"]>> = {}): Project {
    const owner = ownerProject();
    return {...owner, access: {...owner.access!, capabilities, ...extra}};
}

beforeEach(() => {vi.restoreAllMocks(); sessionStorage.clear();});

it("denies absent, mismatched and non-readable access metadata", () => {
    const owner = ownerProject();
    expect(canProject(undefined, "task.update")).toBe(false);
    expect(canProject({...owner, access: undefined}, "task.update")).toBe(false);
    expect(canProject(withCapabilities(["task.update"]), "task.update")).toBe(false);
    expect(canProject(withCapabilities(["project.read", "task.update"], {project_id: "another-project"}), "task.update")).toBe(false);
    expect(canProject(withCapabilities(["project.read", "future.write"]), "task.update")).toBe(false);
});

it("uses capabilities independently of the role name and blocks archived work writes", () => {
    const custom = withCapabilities(["project.read", "task.update", "project.export", "project.archive"], {role: {id: "custom", name: "기획 담당", preset: "custom"}});
    expect(canProject(custom, "task.update")).toBe(true);
    expect(canProject(custom, "run.execute")).toBe(false);
    const archived = {...custom, access: {...custom.access!, archived: true}};
    expect(canProject(archived, "task.update")).toBe(false);
    expect(canProject(archived, "project.export")).toBe(true);
    expect(canProject(archived, "project.archive")).toBe(true);
});

it("disables drag and keyboard board moves for a read-only task", () => {
    const task = itemSchema.parse({...idea, kind: "task", title: "읽기 전용 카드", data: {workflow: "personal", requires_test: false}});
    if (task.kind !== "task") throw new Error("Expected task");
    const changed = vi.fn();
    const move = vi.spyOn(api, "moveTask");
    const view = render(<ProjectPermissionsProvider projects={[withCapabilities(["project.read"])]}>
        <TaskBoard projectId={projectId} tasks={[task]} lens="gtd" savedSort="manual" onSortChange={vi.fn()}
            selectedIds={new Set()} onSelect={vi.fn()} cardFields={[]} onChanged={changed} onError={vi.fn()} />
    </ProjectPermissionsProvider>);
    expect(screen.getByRole("button", {name: "읽기 전용 카드 끌어서 이동"})).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", {name: "읽기 전용 카드 오른쪽 열로 이동"})).toHaveProperty("disabled", true);
    const card = view.container.querySelector(`[data-kanban-card="${task.id}"]`)!;
    expect(card.getAttribute("draggable")).toBe("false");
    const dataTransfer = {setData: vi.fn(), setDragImage: vi.fn()};
    fireEvent.dragStart(card, {dataTransfer});
    expect(dataTransfer.setData).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
});

it("uses the task's own project definition when two projects share a field ID", () => {
    const other = "00000000-0000-4000-8000-000000000615";
    const fieldId = "00000000-0000-4000-8000-000000000616";
    const task = itemSchema.parse({...idea, kind: "task", data: {custom_fields: {[fieldId]: "개발"}}});
    if (task.kind !== "task") throw new Error("Expected task");
    render(<ProjectPermissionsProvider projects={[ownerProject(), ownerProject(other)]}>
        <TaskFieldCells task={task} fields={[`custom:${fieldId}`]} onChanged={vi.fn()} definitions={[
            {id: fieldId, project_id: other, name: "타 프로젝트 수량", type: "number", options: [], revision: 1, created_at: idea.created_at},
            {id: fieldId, project_id: projectId, name: "현재 프로젝트 부서", type: "select", options: ["개발", "기획"], revision: 1, created_at: idea.created_at},
        ]} />
    </ProjectPermissionsProvider>);
    fireEvent.click(screen.getByRole("button", {name: `${task.title} 현재 프로젝트 부서 편집`}));
    expect(screen.getByRole("combobox")).toHaveProperty("value", "개발");
    expect(screen.getByRole("option", {name: "기획"})).not.toBeNull();
});

it("checkpoints drafts before a revoked project closes and returns to the readable list", async () => {
    const project = ownerProject();
    vi.spyOn(api, "session").mockResolvedValue({user: {id: userId, username: "fixture"}, csrf_token: "fixture"});
    const projects = vi.spyOn(api, "projects").mockResolvedValue([project]);
    vi.spyOn(api, "items").mockResolvedValue([]);
    vi.spyOn(api, "catalog").mockRejectedValue(new Error("unused fixture"));
    vi.spyOn(api, "runtime").mockRejectedValue(new Error("unused fixture"));
    window.history.replaceState(null, "", `/?project=${projectId}&view=overview`);
    render(<ProjectsThemeProvider><App /></ProjectsThemeProvider>);
    fireEvent.change(await screen.findByLabelText("권한 초안"), {target: {value: "프로젝트별로 보관할 입력"}});
    projects.mockResolvedValue([]);
    fireEvent(window, new Event("projects:access-changed"));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("view")).toBe("projects"));
    expect(screen.queryByLabelText("권한 초안")).toBeNull();
    const saved = Object.keys(sessionStorage).find(key => key.startsWith(`projects:authentication-draft:${userId}:`) && key.includes("permission-fixture"));
    expect(saved).toBeDefined();
    expect(JSON.parse(sessionStorage.getItem(saved!)!)).toMatchObject({owner: userId, value: {text: "프로젝트별로 보관할 입력"}});
    expect(new URLSearchParams(window.location.search).get("project")).toBeNull();
});

it("keeps a newly created project route while the permitted project list refreshes", async () => {
    const current = ownerProject();
    const created = ownerProject("00000000-0000-4000-8000-000000000617", "새 프로젝트");
    let resolveProjects!: (projects: Project[]) => void;
    vi.spyOn(api, "session").mockResolvedValue({user: {id: userId, username: "fixture"}, csrf_token: "fixture"});
    vi.spyOn(api, "projects").mockResolvedValueOnce([current]).mockImplementation(() => new Promise(resolve => {resolveProjects = resolve;}));
    vi.spyOn(api, "items").mockResolvedValue([]);
    vi.spyOn(api, "createProject").mockResolvedValue(created);
    vi.spyOn(api, "catalog").mockRejectedValue(new Error("unused fixture"));
    vi.spyOn(api, "runtime").mockRejectedValue(new Error("unused fixture"));
    window.history.replaceState(null, "", `/?project=${projectId}&view=overview`);
    render(<ProjectsThemeProvider><App /></ProjectsThemeProvider>);
    await screen.findByLabelText("권한 초안");
    fireEvent.click(screen.getByRole("button", {name: "+ 프로젝트 만들기"}));
    fireEvent.change(screen.getByLabelText("프로젝트 이름"), {target: {value: created.name}});
    fireEvent.click(screen.getByRole("button", {name: "프로젝트 만들기"}));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("project")).toBe(created.id));
    expect(new URLSearchParams(window.location.search).get("view")).toBe("overview");
    resolveProjects([current, created]);
    await screen.findByLabelText("권한 초안");
    expect(new URLSearchParams(window.location.search).get("project")).toBe(created.id);
});

it("shows changes to the reading audience before the explicit move confirmation", async () => {
    const other = "00000000-0000-4000-8000-000000000618";
    const task = itemSchema.parse({...idea, kind: "task", title: "공유 대상 변경 작업", data: {}});
    const commit = vi.spyOn(api, "transferTasks");
    vi.spyOn(api, "projects").mockResolvedValue([ownerProject(), ownerProject(other, "이동 대상")]);
    vi.spyOn(api, "previewTransfer").mockResolvedValue({preview_token: "preview", tasks: [task], target_project_id: other,
        blockers: [], impact: {tasks: 1, links: 0, baselines: 0, skill_runs: 0},
        audience_changes: [{id: task.id, audience_changed: true, new_reader_count: 2, removed_reader_count: 1}],
    });
    render(<ProjectPermissionsProvider projects={[ownerProject(), ownerProject(other)]}>
        <TaskTransfer tasks={[task]} hiddenCount={0} onClose={vi.fn()} onChanged={vi.fn()} />
    </ProjectPermissionsProvider>);
    fireEvent.change(await screen.findByLabelText("대상 프로젝트"), {target: {value: other}});
    fireEvent.click(screen.getByRole("button", {name: "이동 영향 미리보기"}));
    expect((await screen.findByRole("alert")).textContent).toContain("새로 읽는 사용자 2명 · 접근이 사라지는 사용자 1명");
    expect(screen.getByRole("button", {name: "전체 이동 확정"})).toHaveProperty("disabled", false);
    expect(commit).not.toHaveBeenCalled();
});
