import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskPhaseField } from "./TaskPhaseField";
import { scheduleApi } from "./schedule-api";
import type { Schedule } from "./schedule-models";

const permissions = vi.hoisted(() => ({write: true}));
vi.mock("./ProjectPermissions", () => ({useProjectPermissions: () => (_pid: string, capability: string) => capability === "project.read" || permissions.write}));
vi.mock("./schedule-api", () => ({scheduleApi: {list: vi.fn(), taskPhases: vi.fn()}}));
const pid = "27c433b4-df57-44c2-a679-4a5063cb99c0";
const tid = "27c433b4-df57-44c2-a679-4a5063cb99c1";
const phase = (id: string, title: string, revision: number, member_ids: string[] = []): Schedule => ({id, project_id: pid, kind: "phase", title, revision, start_date: null, end_date: null, due_date: null, confirmed_date: null, evidence: "", member_ids, created_at: "2026-11-01T00:00:00Z", phase: {status: "not_started", predecessor_id: null, started_at: null, closed_at: null, results: []}});

describe("TaskPhaseField", () => {
    beforeEach(() => {vi.resetAllMocks(); permissions.write = true; vi.mocked(scheduleApi.list).mockResolvedValue([phase("one", "Phase 1", 3, [tid]), phase("two", "Phase 2", 5)]); vi.mocked(scheduleApi.taskPhases).mockResolvedValue({phase_ids: ["one", "two"]});});
    it("saves multiple selected Phase IDs with every listed Phase revision", async () => {
        render(<TaskPhaseField projectId={pid} taskId={tid} />);
        fireEvent.click(await screen.findByLabelText("Phase 2"));
        fireEvent.click(screen.getByRole("button", {name: "Phase 연결 저장"}));
        await waitFor(() => expect(scheduleApi.taskPhases).toHaveBeenCalledWith(pid, tid, ["one", "two"], {one: 3, two: 5}));
    });
    it("does not offer a write action without project.update", async () => {
        permissions.write = false; render(<TaskPhaseField projectId={pid} taskId={tid} />);
        await screen.findByText("Phase 1");
        expect(screen.queryByRole("button", {name: "Phase 연결 저장"})).toBeNull();
    });
});
