import { z } from "zod";
import { request } from "./api";
import { planningDraftSchema, planningPreviewSchema, planningReceiptSchema } from "./planning-models";
import type { PlanningInput } from "./planning-models";
const projectPath = (id: string) => `/api/projects/${encodeURIComponent(id)}/planning-drafts`;
const draftPath = (id: string) => `/api/planning-drafts/${encodeURIComponent(id)}`;
export type PlanningApply = {expected_version: number; selected_proposal_ids: string[]; operation_id: string};
export const planningApi = {
    list: (projectId: string, signal?: AbortSignal) => request(projectPath(projectId), z.array(planningDraftSchema), {signal}),
    get: (id: string, signal?: AbortSignal) => request(draftPath(id), planningDraftSchema, {signal}),
    create: (projectId: string, body: PlanningInput) => request(projectPath(projectId), planningDraftSchema, {method: "POST", body}),
    save: (id: string, body: Omit<PlanningInput, "mode" | "source_run_id"> & {expected_version: number; status: "draft" | "cancelled"}) => request(draftPath(id), planningDraftSchema, {method: "PATCH", body}),
    preview: (id: string, body: {expected_version: number; selected_proposal_ids: string[]}) => request(`${draftPath(id)}/preview`, planningPreviewSchema, {method: "POST", body}),
    apply: (id: string, body: PlanningApply) => request(`${draftPath(id)}/apply`, planningReceiptSchema, {method: "POST", body}),
};
