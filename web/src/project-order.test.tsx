import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { api } from "./api";
import type { Project } from "./models";
import { ProjectOrderList } from "./ProjectOrderList";
import { ProjectsThemeProvider } from "./theme";

const projects: Project[] = ["첫째", "둘째", "셋째"].map((name, index) => ({
    id: `ca673a01-4200-4b42-a1f4-614c78235c4${index}`,
    name, goal: `${name} 목표`, profile: "simple", version: 1,
    created_at: `2026-10-21T00:00:0${index}Z`, sort_order: index,
    repository_url: null, repository_path: "", repository_branch: null,
    repository_sha: null, repository_kind: null, repository_manifest: null,
    repository_imported_at: null,
}));

afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
});

describe("project order and initial selection", () => {
    it("opens the first ordered project automatically when no project is in the URL", async () => {
        window.history.replaceState(null, "", "/?view=overview");
        vi.spyOn(api, "session").mockResolvedValue({ user: { id: projects[0]!.id, username: "tester" }, csrf_token: "test" });
        vi.spyOn(api, "projects").mockResolvedValue([projects[2]!, projects[0]!, projects[1]!]);
        vi.spyOn(api, "catalog").mockRejectedValue(new Error("No catalog in this fixture"));
        vi.spyOn(api, "runtime").mockRejectedValue(new Error("No runtime in this fixture"));
        vi.spyOn(api, "items").mockResolvedValue([]);
        vi.spyOn(api, "summary").mockRejectedValue(new Error("No summary in this fixture"));

        render(<ProjectsThemeProvider><App /></ProjectsThemeProvider>);
        await waitFor(() => expect(new URLSearchParams(window.location.search).get("project")).toBe(projects[2]!.id));
        expect(window.location.search).toContain("view=overview");
    });

    it("moves a project by drag and supports button movement", async () => {
        const onReorder = vi.fn().mockResolvedValue(undefined);
        render(<ProjectOrderList projects={projects} currentId={projects[0]!.id} busy={false} onReorder={onReorder} />);
        const transfer = { effectAllowed: "", dropEffect: "", setData: vi.fn() };
        fireEvent.dragStart(screen.getByRole("button", { name: "첫째 순서 끌어서 이동" }), { dataTransfer: transfer });
        const target = screen.getByRole("link", { name: /셋째/ }).closest("li");
        expect(target).not.toBeNull();
        fireEvent.dragOver(target!, { dataTransfer: transfer });
        fireEvent.drop(target!, { clientY: 20, dataTransfer: transfer });
        expect(onReorder).toHaveBeenCalledWith([projects[1]!.id, projects[0]!.id, projects[2]!.id]);

        fireEvent.click(screen.getByRole("button", { name: "셋째 위로 이동" }));
        expect(onReorder).toHaveBeenLastCalledWith([projects[0]!.id, projects[2]!.id, projects[1]!.id]);
    });
});
