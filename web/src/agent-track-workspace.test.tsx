import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { idea, projectId, userId } from "./fixtures.test-data";
import { useRoute } from "./hooks";
import { itemSchema } from "./models";
import { ownerProject, renderWithOwnerPermissions as render } from "./permissions.test-support";
import { TaskWorkspace } from "./TaskWorkspace";

vi.mock("./ItemsPage", () => ({ NewItem: () => null, RecordEditor: () => <input aria-label="업무 초안" defaultValue="보존할 초안" /> }));
vi.mock("./TaskNoteReferences", () => ({ TaskNoteReferences: () => null }));
vi.mock("./TaskContext", () => ({ TaskContext: () => null }));

const task = itemSchema.parse({ ...idea, kind: "task", title: "연결 실행이 있는 작업", data: { workflow: "personal" } });
const runId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const statuses = ["queued", "leasing", "running", "waiting_for_permission", "cancelling", "succeeded", "failed", "cancelled", "expired", "interrupted", "unknown"];

beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(api, "projects").mockResolvedValue([ownerProject()]);
    vi.spyOn(api, "taskViews").mockResolvedValue([]);
    vi.spyOn(api, "taskFields").mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
        const taskScope = input.includes("/tasks/");
        return new Response(JSON.stringify({ state: "connected", summary: {
            version: 1, context: { kind: taskScope ? "task" : "project", sourceId: "projects", projectId, ...(taskScope ? { taskId: task.id } : {}) },
            observedAt: "2026-11-12T00:00:00Z", task: taskScope ? { id: task.id, revision: "1", state: "todo", requiresTest: false } : null,
            runs: [{ sourceId: "projects", runId, sessionId, status: "running", binding: { projectSourceId: "projects", projectId, taskId: task.id, revision: "1" },
                observedAt: "2026-11-12T00:00:00Z", cursor: "1", highWater: "1", stale: false, incomplete: false, url: `https://track.example/?run=${runId}` }],
            counts: { runs: 1, sessions: 1, byStatus: Object.fromEntries(statuses.map(status => [status, status === "running" ? 1 : 0])) },
            coverage: { kind: "observed-window", limit: 50, capped: false, unavailable: false }, trackUrl: null,
        } }), { status: 200 });
    }));
    window.history.replaceState(null, "", `/?project=${projectId}&view=tasks&taskLayout=list&taskDensity=detailed&item=${task.id}`);
});

it("retains project activity, selected-task execution context and the draft across all task layouts", async () => {
    function Workspace() {
        const route = useRoute();
        return <TaskWorkspace projectId={projectId} userId={userId} route={route} items={[task]} onChanged={vi.fn()} />;
    }
    render(<Workspace />);
    await waitFor(() => expect(document.querySelector(".task-row .agent-track-activity")?.textContent).toContain("관측 실행 1"));
    expect(screen.getByRole("region", { name: "이 작업의 연결 실행" })).toBeTruthy();
    const draft = screen.getByRole("textbox", { name: "업무 초안" });
    for (const layout of ["보드", "그래프", "캘린더", "집계", "목록"]) {
        fireEvent.click(screen.getByRole("tab", { name: layout }));
        expect(screen.getByRole("region", { name: "이 작업의 연결 실행" })).toBeTruthy();
        expect(screen.getByRole("textbox", { name: "업무 초안" })).toBe(draft);
        expect(document.querySelector(".task-workspace > .agent-track-activity")?.textContent).toContain("관측 실행 1");
    }
    const paths = vi.mocked(fetch).mock.calls.map(([input]) => input);
    expect(paths.filter(path => path === `/api/projects/${projectId}/agent-track`)).toHaveLength(1);
    expect(paths.filter(path => path === `/api/projects/${projectId}/tasks/${task.id}/agent-track`)).toHaveLength(1);
});
