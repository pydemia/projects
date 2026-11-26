import { z } from "zod";

export const scheduleKindSchema = z.enum(["epic", "phase", "milestone", "iteration"]);
export const phaseResultSchema = z.object({
    task_id: z.string(), title: z.string(), result: z.enum(["completed", "closed", "carryover"]),
    reason: z.string(), target_phase_id: z.string().nullable(),
});
export const phaseSchema = z.object({
    status: z.enum(["not_started", "in_progress", "closed"]), predecessor_id: z.string().nullable(),
    started_at: z.string().nullable(), closed_at: z.string().nullable(), results: z.array(phaseResultSchema),
});
export const scheduleSchema = z.object({
    id: z.string(), project_id: z.string(), kind: scheduleKindSchema, title: z.string(), revision: z.number().int().positive(),
    start_date: z.string().nullable(), end_date: z.string().nullable(), due_date: z.string().nullable(), confirmed_date: z.string().nullable(),
    evidence: z.string(), member_ids: z.array(z.string()), created_at: z.string(), phase: phaseSchema.optional(),
});
export type Schedule = z.infer<typeof scheduleSchema>;
export type ScheduleKind = Schedule["kind"];
export type Phase = z.infer<typeof phaseSchema>;
export const assignmentSchema = z.object({task_id: z.string(), iteration_id: z.string().nullable(), revision: z.number().int().nonnegative()});
export const assignmentChangeSchema = z.object({id: z.string(), previous_iteration_id: z.string().nullable(), iteration_id: z.string().nullable(), revision: z.number(), reason: z.string(), created_at: z.string()});
export const itemPlanSchema = z.object({id: z.string(), title: z.string(), kind: z.string(), revision: z.number(), planned_date: z.string(), due_date: z.string()});
export const snapshotSchema = z.object({
    id: z.string(), project_id: z.string(), title: z.string(), reason: z.string(), actor_id: z.string(),
    schedules: z.array(scheduleSchema), items: z.array(itemPlanSchema), created_at: z.string(),
});
export type ScheduleSnapshot = z.infer<typeof snapshotSchema>;
export const snapshotDiffSchema = z.object({snapshot: snapshotSchema, scope: z.string(), changes: z.array(z.object({
    entity: z.enum(["schedule", "item"]), id: z.string(), change: z.enum(["new", "changed", "removed"]),
    before: z.union([scheduleSchema, itemPlanSchema]).nullable(), after: z.union([scheduleSchema, itemPlanSchema]).nullable(), recheck_required: z.boolean(), recheck_item_ids: z.array(z.string()).optional(),
}))});
export type ScheduleDiff = z.infer<typeof snapshotDiffSchema>;
