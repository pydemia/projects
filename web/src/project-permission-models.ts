import { z } from "zod";

export const projectRolePresetSchema = z.enum(["owner", "editor", "viewer", "custom"]);
export const projectRoleSummarySchema = z.object({id: z.string(), name: z.string(), preset: projectRolePresetSchema});
export const projectAccessSchema = z.object({
    project_id: z.string(), access_revision: z.number().int().nonnegative(), membership_id: z.string(),
    role: projectRoleSummarySchema, capabilities: z.array(z.string()), archived: z.boolean(),
});
export type ProjectAccess = z.infer<typeof projectAccessSchema>;
