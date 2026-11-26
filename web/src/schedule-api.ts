import { z } from "zod";
import { request } from "./api";
import { assignmentChangeSchema, assignmentSchema, scheduleSchema, snapshotDiffSchema, snapshotSchema } from "./schedule-models";

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;
const schedule = (projectId: string, scheduleId: string) => `${base(projectId)}/schedules/${encodeURIComponent(scheduleId)}`;
const assignment = (projectId: string, taskId: string) => `${base(projectId)}/task-iterations/${encodeURIComponent(taskId)}`;
const taskPhases = (projectId: string, taskId: string) => `${base(projectId)}/task-phases/${encodeURIComponent(taskId)}`;
export const scheduleApi = {
    list: (pid: string, signal?: AbortSignal) => request(`${base(pid)}/schedules`, z.array(scheduleSchema), {signal}),
    create: (pid: string, body: unknown) => request(`${base(pid)}/schedules`, scheduleSchema, {method: "POST", body}),
    update: (pid: string, sid: string, body: unknown) => request(schedule(pid, sid), scheduleSchema, {method: "PATCH", body}),
    start: (pid: string, sid: string, expected_revision: number) => request(`${schedule(pid, sid)}/start`, scheduleSchema, {method: "POST", body: {expected_revision}}),
    close: (pid: string, sid: string, expected_revision: number, carryovers: {task_id: string; target_phase_id: string}[]) => request(`${schedule(pid, sid)}/close`, scheduleSchema, {method: "POST", body: {expected_revision, carryovers}}),
    reopen: (pid: string, sid: string, expected_revision: number) => request(`${schedule(pid, sid)}/reopen`, scheduleSchema, {method: "POST", body: {expected_revision}}),
    remove: (pid: string, sid: string, expected_revision: number) => request(schedule(pid, sid), z.object({ok: z.literal(true)}), {method: "DELETE", body: {expected_revision, reason: "일정 삭제"}}),
    members: (pid: string, sid: string, expected_revision: number, item_ids: string[]) => request(`${schedule(pid, sid)}/members`, scheduleSchema, {method: "PUT", body: {expected_revision, item_ids, reason: "묶음 변경"}}),
    assignment: (pid: string, tid: string, signal?: AbortSignal) => request(assignment(pid, tid), assignmentSchema, {signal}),
    assign: (pid: string, tid: string, expected_schedule_revision: number, iteration_id: string | null, reason: string) => request(assignment(pid, tid), assignmentSchema, {method: "PUT", body: {expected_schedule_revision, iteration_id, reason}}),
    assignmentHistory: (pid: string, tid: string, signal?: AbortSignal) => request(`${assignment(pid, tid)}/history`, z.array(assignmentChangeSchema), {signal}),
    taskPhases: (pid: string, tid: string, phase_ids: string[], expected_revisions: Record<string, number>) => request(taskPhases(pid, tid), z.object({phase_ids: z.array(z.string())}), {method: "PUT", body: {phase_ids, expected_revisions}}),
    snapshots: (pid: string, signal?: AbortSignal) => request(`${base(pid)}/schedule-snapshots`, z.array(snapshotSchema), {signal}),
    snapshot: (pid: string, title: string, reason: string) => request(`${base(pid)}/schedule-snapshots`, snapshotSchema, {method: "POST", body: {title, reason}}),
    diff: (pid: string, sid: string, signal?: AbortSignal) => request(`${base(pid)}/schedule-snapshots/${encodeURIComponent(sid)}/diff`, snapshotDiffSchema, {signal}),
};
