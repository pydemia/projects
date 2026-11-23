import { z } from "zod";
import { taskViewSettingsSchema } from "./models";
import type { TaskViewSettings } from "./models";

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
export function layoutSorts(settings?: TaskViewSettings): {list: TaskViewSettings["sort"]; board: TaskViewSettings["sort"]} {
    return {
        list: settings?.layout_sorts?.list ?? (settings?.view === "list" ? settings.sort : "gtd"),
        board: settings?.layout_sorts?.board ?? (settings?.view === "board" ? settings.sort : "manual"),
    };
}
