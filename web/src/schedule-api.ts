import { z } from "zod";
import { request } from "./api";
import { assignmentChangeSchema, assignmentSchema, scheduleSchema, snapshotDiffSchema, snapshotSchema } from "./schedule-models";

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;
const schedule = (projectId: string, scheduleId: string) => `${base(projectId)}/schedules/${encodeURIComponent(scheduleId)}`;
const assignment = (projectId: string, taskId: string) => `${base(projectId)}/task-iterations/${encodeURIComponent(taskId)}`;
export const scheduleApi = {
    list: (pid: string, signal?: AbortSignal) => request(`${base(pid)}/schedules`, z.array(scheduleSchema), {signal}),
    create: (pid: string, body: unknown) => request(`${base(pid)}/schedules`, scheduleSchema, {method: "POST", body}),
    update: (pid: string, sid: string, body: unknown) => request(schedule(pid, sid), scheduleSchema, {method: "PATCH", body}),
    remove: (pid: string, sid: string, expected_revision: number) => request(schedule(pid, sid), z.object({ok: z.literal(true)}), {method: "DELETE", body: {expected_revision, reason: "일정 삭제"}}),
    members: (pid: string, sid: string, expected_revision: number, item_ids: string[]) => request(`${schedule(pid, sid)}/members`, scheduleSchema, {method: "PUT", body: {expected_revision, item_ids, reason: "묶음 변경"}}),
    assignment: (pid: string, tid: string, signal?: AbortSignal) => request(assignment(pid, tid), assignmentSchema, {signal}),
    assign: (pid: string, tid: string, expected_schedule_revision: number, iteration_id: string | null, reason: string) => request(assignment(pid, tid), assignmentSchema, {method: "PUT", body: {expected_schedule_revision, iteration_id, reason}}),
    assignmentHistory: (pid: string, tid: string, signal?: AbortSignal) => request(`${assignment(pid, tid)}/history`, z.array(assignmentChangeSchema), {signal}),
    snapshots: (pid: string, signal?: AbortSignal) => request(`${base(pid)}/schedule-snapshots`, z.array(snapshotSchema), {signal}),
    snapshot: (pid: string, title: string, reason: string) => request(`${base(pid)}/schedule-snapshots`, snapshotSchema, {method: "POST", body: {title, reason}}),
    diff: (pid: string, sid: string, signal?: AbortSignal) => request(`${base(pid)}/schedule-snapshots/${encodeURIComponent(sid)}/diff`, snapshotDiffSchema, {signal}),
};
