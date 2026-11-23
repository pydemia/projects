import { z } from "zod";
import { itemSchema, linkSchema, relationSchema } from "./models";
import type { Item } from "./models";
import type { ProjectPermission } from "./ProjectPermissions";

export const planningProposalSchema = z.object({
    id: z.string().min(1), kind: z.enum(["create_story", "create_task", "link", "update_item", "record_decision"]),
    title: z.string().nullish(), body: z.string().nullish(), data: z.record(z.string(), z.unknown()).optional(),
    item_id: z.string().nullish(), source: z.string().nullish(), target: z.string().nullish(),
    relation: relationSchema.optional(), reopen: z.boolean().optional(), default_selected: z.boolean().optional(),
    disposition: z.string().optional(), rationale: z.string().optional(),
});
export type PlanningProposal = z.infer<typeof planningProposalSchema>;
export const planningReceiptSchema = z.object({
    operation_id: z.string(), draft_id: z.string(), created_items: z.array(itemSchema),
    updated_items: z.array(itemSchema), links: z.array(linkSchema), source_item_id: z.string().nullable(),
    audit_item_id: z.string().nullish(),
});
export type PlanningReceipt = z.infer<typeof planningReceiptSchema>;
export const planningDraftSchema = z.object({
    id: z.string(), project_id: z.string(), actor_id: z.string(), mode: z.enum(["initial", "incremental"]),
    status: z.enum(["draft", "cancelled", "applied"]), version: z.number().int().positive(), intent: z.string(),
    references: z.array(z.object({id: z.string(), revision: z.number(), project_id: z.string()})),
    proposals: z.array(planningProposalSchema), source_run_id: z.string().nullable(),
    created_at: z.string(), updated_at: z.string(), receipt: planningReceiptSchema.nullish(),
    provenance: z.record(z.string(), z.unknown()).optional(),
});
export type PlanningDraft = z.infer<typeof planningDraftSchema>;
export const planningPreviewSchema = z.object({
    draft_id: z.string(), version: z.number().int(), selected_proposal_ids: z.array(z.string()),
    changes: z.array(z.object({proposal_id: z.string(), kind: z.string(),
        before: z.record(z.string(), z.unknown()).nullable(), after: z.record(z.string(), z.unknown())})),
    source: z.object({kind: z.literal("idea"), title: z.string(), body: z.string()}).nullable(),
    audit: z.record(z.string(), z.unknown()).nullish(),
});
export type PlanningPreview = z.infer<typeof planningPreviewSchema>;
export type PlanningInput = {
    mode: "initial" | "incremental"; intent: string; reference_ids: string[];
    proposals: PlanningProposal[]; source_run_id?: string;
};
export function planningSelectionErrors(proposals: PlanningProposal[], selected: string[]): string[] {
    const chosen = new Set(selected);
    const newItems = new Map(proposals.filter(proposal => proposal.kind === "create_story" || proposal.kind === "create_task").map(proposal => [proposal.id, proposal]));
    const errors: string[] = [];
    for (const proposal of proposals) {
        if (proposal.kind !== "link" || !chosen.has(proposal.id)) continue;
        for (const target of [proposal.source, proposal.target]) {
            const dependency = target ? newItems.get(target) : undefined;
            if (dependency && !chosen.has(dependency.id)) errors.push(`연결의 새 항목 ‘${dependency.title ?? dependency.id}’을 선택하거나 해당 연결을 해제해 주세요.`);
        }
    }
    return errors;
}
export function proposalPermissions(proposal: PlanningProposal, items: Item[]): ProjectPermission[] {
    if (proposal.kind === "create_story" || proposal.kind === "record_decision") return ["item.write"];
    if (proposal.kind === "create_task") return ["task.create"];
    if (proposal.kind === "link") return ["relation.write"];
    const item = items.find(item => item.id === proposal.item_id);
    return [item?.kind === "task" ? "task.update" : item?.kind === "test_case" ? "test.write" : "item.write"];
}
export function selectedByDefault(proposal: PlanningProposal): boolean {
    return proposal.kind !== "update_item" && proposal.kind !== "record_decision" && proposal.default_selected !== false
        && !["duplicate", "conflict", "defer", "deferred"].includes(String(proposal.disposition ?? proposal.data?.disposition ?? ""));
}
export const planningAuthorSchema = z.object({
    kind: z.enum(["create_story", "create_task", "link", "update_item", "record_decision"]), title: z.string(), body: z.string(), criteria: z.string(),
    itemId: z.string(), source: z.string(), target: z.string(), relation: relationSchema, reopen: z.boolean(),
});
export type PlanningAuthor = z.infer<typeof planningAuthorSchema>;
export const emptyPlanningAuthor: PlanningAuthor = {kind: "create_story", title: "", body: "", criteria: "", itemId: "", source: "", target: "", relation: "implements", reopen: false};
export const planningRecoverySchema = z.object({
    draft: planningDraftSchema.nullable(), input: z.object({mode: z.enum(["initial", "incremental"]),
        intent: z.string(), reference_ids: z.array(z.string()), proposals: z.array(planningProposalSchema), source_run_id: z.string().optional()}),
    selected: z.array(z.string()), operation: z.string(), author: planningAuthorSchema,
    attempt: z.object({draft_id: z.string(), expected_version: z.number(), selected_proposal_ids: z.array(z.string()), operation_id: z.string()}).nullable(),
});
