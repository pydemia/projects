import { z } from "zod";
import { request } from "./api";
import { projectAccessSchema, projectRoleSummarySchema } from "./project-permission-models";
export { projectAccessSchema, projectRoleSummarySchema, projectRolePresetSchema } from "./project-permission-models";
export type { ProjectAccess } from "./project-permission-models";
export const projectRoleSchema = projectRoleSummarySchema.extend({
    permissions: z.array(z.string()), revision: z.number().int().positive(), member_count: z.number().int().nonnegative().optional(),
});
export type ProjectRole = z.infer<typeof projectRoleSchema>;
export const projectMemberSchema = z.object({
    membership_id: z.string(), account_id: z.string(), username: z.string(), role: projectRoleSummarySchema,
});
export type ProjectMember = z.infer<typeof projectMemberSchema>;
export const projectInvitationSchema = z.object({
    id: z.string(), project_id: z.string(), role_id: z.string(), kind: z.string(), target_account_id: z.string().nullable(), expires_at: z.string(),
    claimed_by: z.string().nullable(), revoked_at: z.string().nullable(),
});
export type ProjectInvitation = z.infer<typeof projectInvitationSchema>;
export const ownershipTransferSchema = projectInvitationSchema.extend({access_revision: z.number().int().positive(), token: z.string().optional()});
export type OwnershipTransfer = z.infer<typeof ownershipTransferSchema>;
const stampSchema = z.object({access_revision: z.number().int().nonnegative()});
const acceptedSchema = z.object({project_id: z.string()});
export const invitationPreviewSchema = z.object({project_id: z.string(), project_name: z.string(),
    access_revision: z.number().int().positive(), role: projectRoleSummarySchema, kind: z.enum(["membership", "ownership"]), expires_at: z.string()});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
export type AccessMutation = {expected_revision: number; operation_id: string};
const path = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;
export const accessApi = {
    access: (pid: string, signal?: AbortSignal) => request(`${path(pid)}/access`, projectAccessSchema, {signal}),
    roles: (pid: string, signal?: AbortSignal) => request(`${path(pid)}/roles`, z.array(projectRoleSchema), {signal}),
    members: (pid: string, signal?: AbortSignal) => request(`${path(pid)}/members`, z.array(projectMemberSchema), {signal}),
    invitations: (pid: string, signal?: AbortSignal) => request(`${path(pid)}/invitations`, z.array(projectInvitationSchema), {signal}),
    createRole: (pid: string, body: AccessMutation & {name: string; permissions: string[]}) =>
        request(`${path(pid)}/roles`, projectRoleSchema, {method: "POST", body}),
    updateRole: (pid: string, rid: string, body: AccessMutation & {name: string; permissions: string[]}) =>
        request(`${path(pid)}/roles/${encodeURIComponent(rid)}`, projectRoleSchema, {method: "PATCH", body}),
    deleteRole: (pid: string, rid: string, body: AccessMutation) =>
        request(`${path(pid)}/roles/${encodeURIComponent(rid)}`, stampSchema, {method: "DELETE", body}),
    updateMember: (pid: string, accountId: string, body: AccessMutation & {role_id: string}) =>
        request(`${path(pid)}/members/${encodeURIComponent(accountId)}`, stampSchema.extend({account_id: z.string(), membership_id: z.string(), role_id: z.string()}), {method: "PATCH", body}),
    removeMember: (pid: string, accountId: string, body: AccessMutation) =>
        request(`${path(pid)}/members/${encodeURIComponent(accountId)}`, stampSchema, {method: "DELETE", body}),
    createInvitation: (pid: string, body: AccessMutation & {role_id: string; account_id?: string; expires_in_hours: number}) =>
        request(`${path(pid)}/invitations`, ownershipTransferSchema, {method: "POST", body}),
    revokeInvitation: (pid: string, invitationId: string, body: AccessMutation) =>
        request(`${path(pid)}/invitations/${encodeURIComponent(invitationId)}`, stampSchema, {method: "DELETE", body}),
    acceptInvitation: (invitationId: string, body: AccessMutation & {token: string}) =>
        request(`/api/project-invitations/${encodeURIComponent(invitationId)}/accept`, acceptedSchema,
            {method: "POST", body}),
    previewInvitation: (invitationId: string, token: string, signal?: AbortSignal) =>
        request(`/api/project-invitations/${encodeURIComponent(invitationId)}/preview`, invitationPreviewSchema,
            {method: "POST", body: {token}, signal}),
    transferOwnership: (pid: string, body: AccessMutation & {account_id: string}) =>
        request(`${path(pid)}/ownership`, ownershipTransferSchema, {method: "POST", body}),
    acceptOwnership: (pid: string, transferId: string, body: AccessMutation & {token: string}) =>
        request(`${path(pid)}/ownership/${encodeURIComponent(transferId)}/accept`, acceptedSchema, {method: "POST", body}),
    leave: (pid: string, body: AccessMutation) => request(`${path(pid)}/leave`, stampSchema, {method: "POST", body}),
    archive: (pid: string, body: AccessMutation & {archived: boolean}) =>
        request(`${path(pid)}/archive`, stampSchema, {method: "PATCH", body}),
};

export const permissionGroups = [
    {name: "보기", permissions: [["project.read", "프로젝트와 업무 자료 보기"]]},
    {name: "프로젝트", permissions: [["project.update", "이름·목표 수정"]]},
    {name: "작업", permissions: [["task.create", "작업 생성"], ["task.update", "작업 수정"], ["task.move", "프로젝트 간 이동"]]},
    {name: "업무 자료", permissions: [["item.write", "문서·업무 항목 편집"], ["relation.write", "관계 편집"], ["baseline.write", "기준선 편집"], ["test.write", "테스트 편집"]]},
    {name: "필드", permissions: [["field.manage", "사용자 필드 관리"]]},
    {name: "스킬", permissions: [["run.execute", "스킬 실행·취소·재시도"], ["run.apply", "스킬 결과 적용"]]},
    {name: "자료 전송", permissions: [["project.export", "ZIP 내보내기"], ["project.import", "ZIP·Git 가져오기"]]},
] as const;
export const permissionLabels: Readonly<Record<string, string>> = Object.fromEntries(permissionGroups.flatMap(group => [...group.permissions] as readonly (readonly [string, string])[]));
export function editablePermissions(permissions: readonly string[]): string[] {
    return permissions.filter(permission => permission in permissionLabels);
}
export function invitationUrl(id: string, token: string, revision: number): string {
    const url = new URL(window.location.pathname, window.location.origin);
    url.search = new URLSearchParams({view: "project-invitation", invitationId: id, expectedRevision: String(revision)}).toString();
    url.hash = new URLSearchParams({invitationToken: token}).toString();
    return url.href;
}
export function ownershipUrl(projectId: string, id: string, token: string, revision: number): string {
    const url = new URL(window.location.pathname, window.location.origin);
    url.search = new URLSearchParams({view: "ownership-accept", project: projectId, ownershipId: id, expectedRevision: String(revision)}).toString();
    url.hash = new URLSearchParams({ownershipToken: token}).toString();
    return url.href;
}
