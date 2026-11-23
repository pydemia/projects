import type { ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { projectId } from "./fixtures.test-data";
import type { Project } from "./models";
import { ProjectPermissionsProvider } from "./ProjectPermissions";
import type { ProjectAccess } from "./project-access";

// Existing interaction tests explicitly exercise the owner's editing permissions.
// Keep this list fixed: newly introduced capabilities need deliberate test coverage.
const ownerCapabilities = [
    "project.read", "project.update", "task.create", "task.update", "task.delete", "task.move",
    "item.write", "relation.write", "baseline.write", "test.write", "field.manage",
    "run.execute", "run.apply", "project.export", "project.import", "project.archive", "project.delete",
    "member.manage", "role.manage", "ownership.transfer",
];

export function ownerAccess(id: string): ProjectAccess {
    return {
        project_id: id, access_revision: 1,
        membership_id: "00000000-0000-4000-8000-000000000901",
        role: {id: "00000000-0000-4000-8000-000000000902", name: "오너", preset: "owner"},
        capabilities: [...ownerCapabilities], archived: false,
    };
}

export function ownerProject(id = projectId, name = "테스트 프로젝트"): Project {
    return {
        id, name, goal: "", profile: "simple", version: 1, created_at: "2026-11-02T00:00:00Z",
        sort_order: 0, repository_url: null, repository_path: "", repository_branch: null,
        repository_sha: null, repository_kind: null, repository_manifest: null,
        repository_imported_at: null, access: ownerAccess(id),
    };
}

export function renderWithOwnerPermissions(ui: ReactNode, options?: Omit<RenderOptions, "wrapper">,
    projects: readonly Project[] = [ownerProject()]) {
    const Wrapper = ({children}: {children: ReactNode}) =>
        <ProjectPermissionsProvider projects={projects}>{children}</ProjectPermissionsProvider>;
    return render(ui, {...options, wrapper: Wrapper});
}
