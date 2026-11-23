import { createContext, useContext, type ReactNode } from "react";
import type { Kind, Project } from "./models";

export const projectPermissions = ["project.read", "project.update", "task.create", "task.update", "task.delete", "task.move", "item.write", "relation.write", "baseline.write", "test.write", "field.manage", "run.execute", "run.apply", "project.export", "project.import", "project.archive", "project.delete", "member.manage", "role.manage", "ownership.transfer"] as const;
export type ProjectPermission = typeof projectPermissions[number];
const readOnlyPermissions = new Set<string>(["project.read", "project.export", "project.archive", "member.manage", "role.manage", "ownership.transfer"]);

export function canProject(project: Project | undefined, permission: ProjectPermission): boolean {
    const access = project?.access;
    return !!access && access.project_id === project?.id && access.capabilities.includes("project.read")
        && access.capabilities.includes(permission) && (!access.archived || readOnlyPermissions.has(permission));
}
export function itemWritePermission(kind: Kind, create = false): ProjectPermission {
    return kind === "task" ? create ? "task.create" : "task.update" : kind === "test_case" ? "test.write" : "item.write";
}
const ProjectPermissionsContext = createContext<readonly Project[]>([]);
export function ProjectPermissionsProvider({projects, children}: {projects: readonly Project[]; children: ReactNode}) {
    return <ProjectPermissionsContext.Provider value={projects}>{children}</ProjectPermissionsContext.Provider>;
}
export function useProjectCatalog() {return useContext(ProjectPermissionsContext);}
export function useProjectPermissions() {
    const projects = useContext(ProjectPermissionsContext);
    return (projectId: string, permission: ProjectPermission) => canProject(projects.find(project => project.id === projectId), permission);
}
export function ProjectAccessStatus({project}: {project: Project}) {
    const writable = projectPermissions.some(permission => !readOnlyPermissions.has(permission) && canProject(project, permission));
    return <p className="muted small" role="status">{project.access?.role.name ?? "권한 확인 필요"}{project.access?.archived ? " · 보관됨 · 읽기 전용" : !writable ? " · 읽기 전용" : ""}</p>;
}
