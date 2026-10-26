import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "./api";
import { GitZipImport } from "./GitZipImport";
import { gitZipPreviewSchema, projectSchema } from "./models";

it("analyzes a Git ZIP, shows absent history, then creates a project", async () => {
    const preview = gitZipPreviewSchema.parse({
        archive_sha256: "a".repeat(64), archive_name: "extension-main.zip",
        path: "", kind: "browser_extension",
        scopes: [{ path: "", label: "ZIP 전체" }],
        manifest_path: "manifest.json", suggested_name: "extension",
        suggested_goal: "Browser tool",
        warnings: ["ZIP에는 commit·PR 이력이 없습니다."],
    });
    const project = projectSchema.parse({
        id: "00000000-0000-4000-8000-000000000001", name: "extension", goal: "Browser tool",
        profile: "simple", version: 1, created_at: "2026-10-21T00:00:00Z",
        repository_url: null, repository_path: "", repository_branch: null, repository_sha: null,
        repository_kind: "browser_extension", repository_manifest: "manifest.json",
        repository_imported_at: "2026-10-21T00:00:00Z",
    });
    const inspect = vi.spyOn(api, "previewGitZip").mockResolvedValue(preview);
    const create = vi.spyOn(api, "importGitZip").mockResolvedValue(project);
    const onCreated = vi.fn();
    const file = new File(["ZIP"], "extension-main.zip", { type: "application/zip" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("ZIP").buffer });
    render(<GitZipImport onClose={() => {}} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("Git 소스 ZIP · 최대 8 MB"), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole("button", { name: "ZIP 분석" }).closest("form")!);
    await waitFor(() => expect(inspect).toHaveBeenCalledWith({
        archive_base64: "WklQ", archive_name: "extension-main.zip", path: "",
    }));
    expect(await screen.findByRole("textbox", { name: "목표" })).toHaveProperty("value", "Browser tool");
    expect(screen.getByText("ZIP에는 commit·PR 이력이 없습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 만들기" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({
        archive_base64: "WklQ", archive_name: "extension-main.zip", path: "",
        expected_sha256: "a".repeat(64), name: "extension", goal: "Browser tool", profile: "simple",
    }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(project));
    vi.restoreAllMocks();
});
