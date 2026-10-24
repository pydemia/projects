import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "./api";
import { GitImport } from "./GitImport";
import { gitPreviewSchema, projectSchema } from "./models";

it("previews package goal and commit/PR history before creating a project", async () => {
    const source = "https://github.com/pydemia/statusline";
    const sha = "a".repeat(40);
    const preview = gitPreviewSchema.parse({
        repository_url: source, repository_full_name: "pydemia/statusline", branch: "main", sha,
        path: "", kind: "browser_extension", visibility: "public",
        scopes: [{ path: "", label: "저장소 전체" }], manifest_path: "manifest.json",
        suggested_name: "Statusline", suggested_goal: "Browser status helper",
        activities: [{ kind: "commit", external_id: sha, title: "Fix toolbar", url: `${source}/commit/${sha}`, state: "committed", occurred_at: "2026-10-20T00:00:00Z" },
            { kind: "pr", external_id: "3", title: "Support dark mode", url: `${source}/pull/3`, state: "merged", occurred_at: "2026-10-21T00:00:00Z" }],
        warnings: [],
    });
    const project = projectSchema.parse({
        id: "00000000-0000-4000-8000-000000000001", name: "Statusline", goal: "Browser status helper",
        profile: "simple", version: 1, created_at: "2026-10-21T00:00:00Z",
        repository_url: source, repository_path: "", repository_branch: "main", repository_sha: sha,
        repository_kind: "browser_extension", repository_manifest: "manifest.json",
        repository_imported_at: "2026-10-21T00:00:00Z",
    });
    const inspect = vi.spyOn(api, "previewGit").mockResolvedValue(preview);
    const create = vi.spyOn(api, "importGit").mockResolvedValue(project);
    const onCreated = vi.fn();
    render(<GitImport onClose={() => {}} onCreated={onCreated} />);
    fireEvent.change(screen.getByRole("textbox", { name: "GitHub 저장소 URL" }), { target: { value: source } });
    fireEvent.click(screen.getByRole("button", { name: "저장소 분석" }));
    await waitFor(() => expect(inspect).toHaveBeenCalledWith(source, ""));
    expect(await screen.findByRole("textbox", { name: "목표" })).toHaveProperty("value", "Browser status helper");
    expect(screen.getByRole("link", { name: /Fix toolbar/ }).getAttribute("href")).toBe(`${source}/commit/${sha}`);
    expect(screen.getByRole("link", { name: /Support dark mode/ }).getAttribute("href")).toBe(`${source}/pull/3`);
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 만들기" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({
        repository_url: source, path: "", expected_sha: sha,
        name: "Statusline", goal: "Browser status helper", profile: "simple",
    }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(project));
    vi.restoreAllMocks();
});

it("reanalyzes a selected package folder and replaces its goal draft", async () => {
    const source = "https://github.com/pydemia/vscode-extension-quickstart";
    const base = gitPreviewSchema.parse({
        repository_url: source, repository_full_name: "pydemia/vscode-extension-quickstart",
        branch: "main", sha: "a".repeat(40), path: "", kind: "repository",
        visibility: "public", scopes: [
            { path: "", label: "저장소 전체" },
            { path: "quickstart-extension", label: "quickstart-extension" },
        ],
        manifest_path: "", suggested_name: "vscode-extension-quickstart",
        suggested_goal: "루트 저장소", activities: [], warnings: [],
    });
    const nested = { ...base, path: "quickstart-extension", kind: "vscode_extension",
        manifest_path: "quickstart-extension/package.json", suggested_name: "quickstart-extension",
        suggested_goal: "VS Code extension example" };
    const inspect = vi.spyOn(api, "previewGit")
        .mockResolvedValueOnce(base).mockResolvedValueOnce(nested);
    render(<GitImport onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByRole("textbox", { name: "GitHub 저장소 URL" }), { target: { value: source } });
    fireEvent.click(screen.getByRole("button", { name: "저장소 분석" }));
    const scope = await screen.findByRole("combobox", { name: "가져올 package 폴더" });
    fireEvent.change(scope, { target: { value: "quickstart-extension" } });
    await waitFor(() => expect(inspect).toHaveBeenNthCalledWith(2, source, "quickstart-extension"));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "목표" })).toHaveProperty("value", "VS Code extension example"));
    vi.restoreAllMocks();
});
