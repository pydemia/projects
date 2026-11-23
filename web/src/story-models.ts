import { z } from "zod";
import { itemSchema, type Item, type Link } from "./models";

export const storyProcessingStateSchema = z.enum([
    "raised", "reviewing", "planned", "in_progress", "verifying", "fulfilled", "on_hold", "excluded",
]);
export type StoryProcessingState = z.infer<typeof storyProcessingStateSchema>;
export const storyStateLabels: Record<StoryProcessingState, string> = {
    raised: "제기됨", reviewing: "검토 중", planned: "계획됨", in_progress: "진행 중",
    verifying: "검증 중", fulfilled: "충족", on_hold: "보류", excluded: "제외",
};
export const storyVerificationSchema = z.object({
    id: z.string(), item_id: z.string(), item_revision: z.number().int().positive(),
    actor_id: z.string(), created_at: z.string(), evidence: z.string(), criteria_hash: z.string(),
    archived_unverified: z.boolean().optional(),
    criterion_results: z.array(z.object({criterion: z.string(), passed: z.boolean(), evidence: z.string()})),
});
export type StoryVerification = z.infer<typeof storyVerificationSchema>;
export const storiesSchema = z.object({
    stories: z.array(z.object({
        item: itemSchema, task_ids: z.array(z.string()), completed_task_count: z.number().int().nonnegative(),
        verification_current: z.boolean(),
    })),
    task_total: z.number().int().nonnegative(), task_done: z.number().int().nonnegative(),
    story_total: z.number().int().nonnegative(), story_fulfilled: z.number().int().nonnegative(),
});
export function storyState(item: Item): StoryProcessingState | null {
    const parsed = storyProcessingStateSchema.safeParse(item.data.processing_state);
    return parsed.success ? parsed.data : null;
}
export function storyCriteria(item: Item): string[] {
    return Array.isArray(item.data.acceptance_criteria)
        ? item.data.acceptance_criteria.filter((entry): entry is string => typeof entry === "string") : [];
}
/** Only canonical Task → Story links contribute to this relation and its count. */
export function contributingItems(item: Item, items: Item[], links: Link[]): Item[] {
    const ids = new Set(links.filter(link => link.relation === "implements" &&
        (item.kind === "requirement" ? link.target_id === item.id : item.kind === "task" && link.source_id === item.id))
        .map(link => item.kind === "requirement" ? link.source_id : link.target_id));
    return items.filter(entry => ids.has(entry.id) && entry.kind === (item.kind === "task" ? "requirement" : "task"));
}
/** Group legacy reverse duplicates without discarding the stored links or their revisions. */
export function visibleRelationGroups(item: Item, items: Item[], links: Link[]): Link[][] {
    const visible = new Set(items.map(entry => entry.id));
    const groups = new Map<string, Link[]>();
    for (const link of links) {
        if ((link.source_id !== item.id && link.target_id !== item.id) ||
            !visible.has(link.source_id) || !visible.has(link.target_id)) continue;
        const key = link.relation === "relates_to"
            ? `related:${[link.source_id, link.target_id].sort().join(":")}` : link.id;
        const group = groups.get(key) ?? [];
        group.push(link); groups.set(key, group);
    }
    return [...groups.values()];
}
