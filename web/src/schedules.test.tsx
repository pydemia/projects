import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchedulesPage } from "./SchedulesPage";
import { api } from "./api";
import { scheduleApi } from "./schedule-api";
import type { Schedule } from "./schedule-models";
import { itemSchema } from "./models";

const permissions = vi.hoisted(() => ({write: true}));
vi.mock("./ProjectPermissions", () => ({useProjectPermissions: () => (_pid: string, capability: string) => capability === "project.read" || permissions.write}));
vi.mock("./api", () => ({api: {items: vi.fn(), links: vi.fn()}}));
vi.mock("./schedule-api", () => ({scheduleApi: {list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), members: vi.fn(), assignment: vi.fn(), assign: vi.fn(), assignmentHistory: vi.fn(), snapshots: vi.fn(), snapshot: vi.fn(), diff: vi.fn()}}));
const pid = "27c433b4-df57-44c2-a679-4a5063cb99c0";
const tid = "27c433b4-df57-44c2-a679-4a5063cb99c1";
const sid = "27c433b4-df57-44c2-a679-4a5063cb99c2";
const task = itemSchema.parse({id: tid, project_id: pid, kind: "task", title: "기존 Task", body: "", data: {workflow: "personal", planned_date: "2026-11-11", due_date: "2026-11-20"}, status: "draft", revision: 7, updated_at: "2026-11-01T00:00:00Z", created_at: "2026-11-01T00:00:00Z"});
const iteration: Schedule = {id: sid, project_id: pid, kind: "iteration", title: "11월 반복", revision: 1, start_date: "2026-11-10", end_date: "2026-11-20", due_date: null, confirmed_date: null, evidence: "", member_ids: [], created_at: "2026-11-01T00:00:00Z"};

beforeEach(() => {
    vi.resetAllMocks(); permissions.write = true;
    vi.mocked(api.items).mockResolvedValue([]); vi.mocked(api.links).mockResolvedValue([]);
    vi.mocked(scheduleApi.list).mockResolvedValue([]); vi.mocked(scheduleApi.snapshots).mockResolvedValue([]);
    vi.mocked(scheduleApi.assignment).mockResolvedValue({task_id: tid, iteration_id: null, revision: 0});
    vi.mocked(scheduleApi.assignmentHistory).mockResolvedValue([]);
});

describe("optional project schedules", () => {
    it("creates with only title and type and keeps dates optional", async () => {
        render(<SchedulesPage projectId={pid} />);
        await screen.findByText("등록한 상위 일정이 없습니다. Story·Task는 일정 없이도 사용할 수 있습니다.");
        fireEvent.change(screen.getByLabelText("제목"), {target: {value: "새 목표"}});
        fireEvent.click(screen.getByRole("button", {name: "추가"}));
        await waitFor(() => expect(scheduleApi.create).toHaveBeenCalledWith(pid, {kind: "epic", title: "새 목표"}));
    });

    it("requires an explicit iteration save and sends no Task date changes", async () => {
        vi.mocked(api.items).mockResolvedValue([task]); vi.mocked(scheduleApi.list).mockResolvedValue([iteration]);
        render(<SchedulesPage projectId={pid} />);
        const select = await screen.findByLabelText("기존 Task Iteration");
        await waitFor(() => expect((select as HTMLSelectElement).disabled).toBe(false));
        fireEvent.change(select, {target: {value: sid}});
        expect(scheduleApi.assign).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText("기존 Task 재배정 사유"), {target: {value: "남은 작업 선택"}});
        fireEvent.click(screen.getByRole("button", {name: "배정 저장"}));
        await waitFor(() => expect(scheduleApi.assign).toHaveBeenCalledWith(pid, tid, 0, sid, "남은 작업 선택"));
        expect(task.data).toMatchObject({planned_date: "2026-11-11", due_date: "2026-11-20"});
        expect(await screen.findByLabelText("기존 Task 배정 이력")).toBeTruthy();
    });

    it("preserves an inline draft after a revision conflict", async () => {
        vi.mocked(scheduleApi.list).mockResolvedValue([iteration]);
        vi.mocked(scheduleApi.update).mockRejectedValue(new Error("일정이 변경되었습니다."));
        render(<SchedulesPage projectId={pid} />);
        fireEvent.click(await screen.findByRole("button", {name: "일정 편집"}));
        const title = screen.getAllByLabelText("제목").find(input => (input as HTMLInputElement).value === "11월 반복")!;
        fireEvent.change(title, {target: {value: "내 일정 초안"}});
        fireEvent.click(screen.getByRole("button", {name: "저장"}));
        expect(await screen.findByRole("alert")).toHaveProperty("textContent", "일정이 변경되었습니다.");
        expect((title as HTMLInputElement).value).toBe("내 일정 초안");
    });

    it("shows changed/removed/new snapshot entries with dates and recheck scope", async () => {
        const snapshot = {id: "baseline", project_id: pid, title: "확정 계획", reason: "합의", actor_id: "actor", schedules: [iteration], items: [], created_at: "2026-11-01T00:00:00Z"};
        vi.mocked(scheduleApi.snapshots).mockResolvedValue([snapshot]);
        vi.mocked(scheduleApi.diff).mockResolvedValue({snapshot, scope: "현재 접근 가능한 프로젝트 항목", changes: [
            {entity: "schedule", id: sid, change: "changed", before: iteration, after: {...iteration, end_date: "2026-11-25", revision: 2}, recheck_required: true},
            {entity: "schedule", id: "removed", change: "removed", before: {...iteration, title: "삭제한 계획"}, after: null, recheck_required: false},
            {entity: "schedule", id: "new", change: "new", before: null, after: {...iteration, title: "추가 계획"}, recheck_required: false},
        ]});
        render(<SchedulesPage projectId={pid} />);
        fireEvent.click(await screen.findByRole("button", {name: "현재 계획과 비교"}));
        const comparison = await screen.findByRole("region", {name: "확정 계획 비교"});
        expect(within(comparison).getByText("변경 · 재확인 필요")).toBeTruthy();
        expect(within(comparison).getByText("제거", {exact: true})).toBeTruthy();
        expect(within(comparison).getByText("신규", {exact: true})).toBeTruthy();
        expect(comparison.textContent).toContain("2026-11-25");
        expect(comparison.textContent).not.toContain("T00:");
    });

    it("keeps failed loads distinct from an empty successful project", async () => {
        vi.mocked(scheduleApi.list).mockRejectedValue(new Error("권한이 변경되었습니다."));
        render(<SchedulesPage projectId={pid} />);
        expect(await screen.findByRole("alert")).toHaveProperty("textContent", "권한이 변경되었습니다.");
        expect(scheduleApi.create).not.toHaveBeenCalled();
    });

    it("hides write forms and retains comparisons for readers", async () => {
        permissions.write = false; vi.mocked(scheduleApi.list).mockResolvedValue([iteration]);
        render(<SchedulesPage projectId={pid} />);
        await screen.findByText("11월 반복");
        expect(screen.queryByRole("button", {name: "일정 편집"})).toBeNull();
        expect(screen.queryByRole("button", {name: "일정 기준선 저장"})).toBeNull();
        expect(screen.queryByRole("button", {name: "추가"})).toBeNull();
    });
});
