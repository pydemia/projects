import { ownerAccess, renderWithOwnerPermissions as render } from "./permissions.test-support";
import { useLayoutEffect, useRef, useState } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AuthRecoveryProvider, useAuthenticationDraft, type AuthenticationDraft } from "./auth-drafts";
import { api, ApiError } from "./api";
import { TaskTitleEdit } from "./TaskTitleEdit";
import { TaskFieldCells } from "./TaskFields";
import { ProjectActions } from "./ProjectActions";
import { TaskWorkspace } from "./TaskWorkspace";
import type { Route } from "./hooks";
import { itemSchema } from "./models";
import { idea, userId } from "./fixtures.test-data";

const checkpoints = vi.hoisted(() => new Set<() => boolean | void>());
vi.mock("./reauthentication", () => ({
    reauthentication: {snapshot: () => ({phase: "idle"})},
    useReauthenticationCheckpoint(callback: () => boolean | void) {
        const ref = useRef(callback);
        ref.current = callback;
        useLayoutEffect(() => {
            const checkpoint = () => ref.current();
            checkpoints.add(checkpoint);
            return () => {checkpoints.delete(checkpoint);};
        }, []);
    },
}));
const schema = z.object({text: z.string(), revision: z.number().int().positive()}).strict();
function Editor() {
    const recovery: AuthenticationDraft<z.infer<typeof schema>> = useAuthenticationDraft("task:one:title", schema, () => ({text, revision: 3}));
    const [text, setText] = useState(recovery.restored?.text ?? "");
    return <input aria-label="draft" value={text} onChange={event => setText(event.target.value)} />;
}
function ClosedEditor() {
    useAuthenticationDraft("task:closed:title", schema, () => null);
    return null;
}
function checkpoint() {
    let ok = true;
    act(() => {for (const callback of checkpoints) if (callback() === false) ok = false;});
    return ok;
}
afterEach(() => {sessionStorage.clear(); checkpoints.clear();});

describe("authentication draft checkpoints", () => {
    it("allows a closed editor to continue when storage access or removal is denied", () => {
        const access = vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {throw new DOMException("Access denied", "SecurityError");});
        const first = render(<AuthRecoveryProvider userId={userId}><ClosedEditor /></AuthRecoveryProvider>);
        expect(checkpoint()).toBe(true);
        first.unmount(); access.mockRestore();
        vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {throw new DOMException("Access denied", "SecurityError");});
        render(<AuthRecoveryProvider userId={userId}><ClosedEditor /></AuthRecoveryProvider>);
        expect(checkpoint()).toBe(true);
    });

    it("checkpoints the latest state and restores only the same owner without writes", () => {
        const view = render(<AuthRecoveryProvider userId={userId}><Editor /></AuthRecoveryProvider>);
        fireEvent.change(screen.getByRole("textbox"), {target: {value: "latest input"}});
        expect(sessionStorage.length).toBe(0);
        expect(checkpoint()).toBe(true);
        view.unmount();
        const other = render(<AuthRecoveryProvider userId="another-account"><Editor /></AuthRecoveryProvider>);
        expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
        other.unmount();
        render(<AuthRecoveryProvider userId={userId}><Editor /></AuthRecoveryProvider>);
        expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("latest input");
    });

    it("remounts editor state when the account changes and does nothing without an owner", () => {
        const view = render(<AuthRecoveryProvider userId={userId}><Editor /></AuthRecoveryProvider>);
        fireEvent.change(screen.getByRole("textbox"), {target: {value: "private draft"}});
        view.rerender(<AuthRecoveryProvider userId="different-owner"><Editor /></AuthRecoveryProvider>);
        expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
        view.unmount();
        render(<Editor />);
        expect(checkpoint()).toBe(true);
        expect(sessionStorage.length).toBe(0);
    });

    it("rejects invalid or extra credential fields and blocks a checkpoint on storage failure", () => {
        sessionStorage.setItem(`projects:authentication-draft:${userId}:${encodeURIComponent("task:one:title")}`,
            JSON.stringify({owner: userId, value: {text: "invalid", revision: 3, password: "must not restore"}}));
        render(<AuthRecoveryProvider userId={userId}><Editor /></AuthRecoveryProvider>);
        expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {throw new DOMException("Quota exceeded", "QuotaExceededError");});
        expect(checkpoint()).toBe(false);
    });

    it("keeps a recovered title's original revision and body until an explicit save", async () => {
        const parsed = itemSchema.parse({...idea, kind: "task", data: {workflow: "personal"}});
        if (parsed.kind !== "task") throw new Error("Expected task fixture");
        const save = vi.spyOn(api, "saveItem").mockRejectedValue(new ApiError("동시 편집 충돌", 409));
        const view = render(<AuthRecoveryProvider userId={userId}><TaskTitleEdit task={parsed} onSaved={vi.fn()} /></AuthRecoveryProvider>);
        fireEvent.click(screen.getByRole("button", {name: `${parsed.title} 제목 수정`}));
        fireEvent.change(screen.getByRole("textbox"), {target: {value: "recovered title"}});
        expect(checkpoint()).toBe(true);
        view.unmount();
        render(<AuthRecoveryProvider userId={userId}><TaskTitleEdit task={{...parsed, revision: 9, body: "new body"}} onSaved={vi.fn()} /></AuthRecoveryProvider>);
        expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("recovered title");
        expect(save).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", {name: "저장"}));
        await waitFor(() => expect(save).toHaveBeenCalledWith(parsed.id, {expected_revision: 1, title: "recovered title", body: parsed.body, data: parsed.data}));
        expect(screen.getByRole("button", {name: "최신 작업 불러오기"})).toBeTruthy();
    });

    it("keeps list and detail field drafts separate with their captured revisions", async () => {
        const parsed = itemSchema.parse({...idea, kind: "task", data: {workflow: "personal"}});
        if (parsed.kind !== "task") throw new Error("Expected task fixture");
        const save = vi.spyOn(api, "updateTaskProperties").mockResolvedValue(parsed);
        const props = {task: parsed, fields: ["context"], definitions: [], onChanged: vi.fn()};
        const view = render(<AuthRecoveryProvider userId={userId}><TaskFieldCells {...props} surface="detail" /></AuthRecoveryProvider>);
        fireEvent.click(screen.getByRole("button", {name: `${parsed.title} 맥락 편집`}));
        fireEvent.change(screen.getByRole("textbox", {name: "맥락"}), {target: {value: "detail draft"}});
        expect(checkpoint()).toBe(true);
        view.unmount();
        const list = render(<AuthRecoveryProvider userId={userId}><TaskFieldCells {...props} /></AuthRecoveryProvider>);
        expect(screen.queryByRole("textbox")).toBeNull();
        list.unmount();
        render(<AuthRecoveryProvider userId={userId}><TaskFieldCells {...props} task={{...parsed, revision: 5}} surface="detail" /></AuthRecoveryProvider>);
        expect((screen.getByRole("textbox", {name: "맥락"}) as HTMLInputElement).value).toBe("detail draft");
        expect(save).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", {name: "저장"}));
        await waitFor(() => expect(save).toHaveBeenCalledWith(parsed.id, {expected_revision: 1, values: {context: "detail draft"}}));
    });

    it("reopens a project menu rename with its captured version", async () => {
        const project = {id: idea.project_id, name: "Original project", goal: "", profile: "", version: 2, created_at: idea.created_at,
            sort_order: null, repository_url: null, repository_path: "", repository_branch: null, repository_sha: null,
            repository_kind: null, repository_manifest: null, repository_imported_at: null, access: ownerAccess(idea.project_id)};
        const rename = vi.spyOn(api, "renameProject").mockRejectedValue(new ApiError("다른 버전", 409));
        const view = render(<AuthRecoveryProvider userId={userId}><ProjectActions project={project} /></AuthRecoveryProvider>);
        fireEvent.pointerDown(screen.getByRole("button", {name: "Original project 프로젝트 메뉴"}), {button: 0, ctrlKey: false, pointerType: "mouse"});
        fireEvent.click(await screen.findByRole("menuitem", {name: "이름 수정"}));
        fireEvent.change(screen.getByRole("textbox", {name: "프로젝트명"}), {target: {value: "Recovered project"}});
        expect(checkpoint()).toBe(true);
        view.unmount();
        render(<AuthRecoveryProvider userId={userId}><ProjectActions project={{...project, version: 7}} /></AuthRecoveryProvider>);
        expect((screen.getByRole("textbox", {name: "프로젝트명"}) as HTMLInputElement).value).toBe("Recovered project");
        expect(rename).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", {name: "저장"}));
        await waitFor(() => expect(rename).toHaveBeenCalledWith(project.id, {expected_version: 2, name: "Recovered project"}));
    });

    it("preserves explicit return URL query parameters and fragment with remembered task settings", async () => {
        const original = `/?project=${idea.project_id}&view=tasks&taskScope=all&taskLayout=board&taskDensity=detailed&taskStatus=todo&q=needle&qa=preserved#body-draft`;
        window.history.replaceState(null, "", original);
        sessionStorage.setItem(`projects:task-view-memory:${userId}:${idea.project_id}`, JSON.stringify({
            settings: {schema_version: 2, task_scope: "today", mode: "simple", view: "list", query: "old query", status: "open", lens: "gtd",
                minutes: 0, context: "", energy: "any", grouping: "none", sort: "gtd", card_fields: [], list_fields: []},
            month: "2026-11", anchors: {},
        }));
        const getViews = vi.spyOn(api, "taskViews").mockResolvedValue([]);
        vi.spyOn(api, "projects").mockResolvedValue([]);
        const route: Route = {project: idea.project_id, view: "tasks", item: "", kind: "", q: "needle", qPresent: true,
            run: "", baseline: "", taskScope: "all", taskLayout: "board", taskDensity: "detailed", taskStatus: "todo"};
        const replace = vi.spyOn(window.history, "replaceState");
        render(<TaskWorkspace projectId={idea.project_id} userId={userId} route={route} items={[]} onChanged={vi.fn()} />);
        await waitFor(() => expect(getViews).toHaveBeenCalled());
        expect(`${location.pathname}${location.search}${location.hash}`).toBe(original);
        expect(replace).not.toHaveBeenCalled();
    });
});
