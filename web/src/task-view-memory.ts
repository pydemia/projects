import { z } from "zod";
import { taskViewSettingsSchema } from "./models";
import type { TaskViewSettings } from "./models";
import type { Route } from "./hooks";

export const taskListVariants = {
    state: "상태별 목록",
    deadline: "마감 우선",
    split: "목록·상세",
} as const;
export type TaskListVariant = keyof typeof taskListVariants;
const projectIdSchema = z.uuid();

export function taskListVariant(value?: string | null): TaskListVariant | undefined {
    return value && Object.hasOwn(taskListVariants, value) ? value as TaskListVariant : undefined;
}

export function taskProjectIds(route: Pick<Route, "taskProjects" | "taskProject">, settings?: TaskViewSettings): string[] {
    const explicit = route.taskProjects ?? (route.taskProject || undefined);
    const values = explicit === undefined ? settings?.project_ids ?? [] : explicit.split(",");
    return [...new Set(values.map(id => id.trim().toLowerCase()).filter(id => projectIdSchema.safeParse(id).success))].sort().slice(0, 100);
}

export const taskViewMemorySchema = z.object({
    settings: taskViewSettingsSchema,
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    anchors: z.record(z.string(), z.string().uuid()),
});
export function readTaskViewMemory(key: string) {
    try {
        const parsed = taskViewMemorySchema.safeParse(JSON.parse(sessionStorage.getItem(key) ?? "null"));
        return parsed.success ? parsed.data : null;
    } catch { return null; }
}
export function layoutSorts(settings?: TaskViewSettings): {list: TaskViewSettings["sort"]; board: Exclude<TaskViewSettings["sort"], "deadline">} {
    const boardSort = settings?.layout_sorts?.board ?? (settings?.view === "board" ? settings.sort : "manual");
    return {
        list: settings?.layout_sorts?.list ?? (settings?.view === "list" ? settings.sort : "gtd"),
        board: boardSort === "deadline" ? "due_date" : boardSort,
    };
}
