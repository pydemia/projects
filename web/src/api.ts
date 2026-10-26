import { z } from "zod";
import {
    baselineSchema, catalogSchema, gitPreviewSchema, gitZipPreviewSchema, itemSchema, linkSchema, projectSchema,
    repositoryActivitySchema,
    reconnectSchema, resolveSchema, revisionSchema, runSchema, runtimeSchema,
    sessionSchema, summarySchema, taskViewSchema, testRunSchema, traceSchema,
} from "./models";

let csrfToken = "";

export class ApiError extends Error {
    constructor(message: string, public readonly status: number = 0) {
        super(message);
        this.name = "ApiError";
    }
}

export function setCsrf(token: string): void {
    csrfToken = token;
}

async function responseError(response: Response): Promise<ApiError> {
    let message = `서버 요청에 실패했습니다. (HTTP ${response.status})`;
    try {
        const body: unknown = await response.json();
        const parsed = z.object({ detail: z.string() }).safeParse(body);
        if (parsed.success) message = parsed.data.detail;
    } catch {
        // A proxy failure or HTML error page is still a failed API request.
    }
    if (response.status === 401) {
        window.dispatchEvent(new Event("projects:unauthorized"));
    }
    return new ApiError(message, response.status);
}

export async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
    let response: Response;
    try {
        response = await fetch(path, {
            method, headers, credentials: "same-origin", signal: options.signal,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new ApiError("서버에 연결할 수 없습니다. API 실행 상태와 네트워크를 확인한 뒤 다시 시도해 주세요.");
    }
    if (!response.ok) throw await responseError(response);
    let raw: unknown;
    try {
        raw = await response.json();
    } catch {
        throw new ApiError("서버가 JSON 응답을 반환하지 않았습니다. API 연결을 확인해 주세요.", response.status);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
        const at = parsed.error.issues[0]?.path.join(".") || "응답";
        throw new ApiError(`서버 응답 형식이 API 명세와 다릅니다. (${at})`, response.status);
    }
    return parsed.data;
}

const projectPath = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;
const itemPath = (itemId: string) => `/api/items/${encodeURIComponent(itemId)}`;
const runPath = (runId: string) => `/api/runs/${encodeURIComponent(runId)}`;
const okSchema = z.object({ ok: z.literal(true) });
const taskMoveResponseSchema = itemSchema.and(z.object({ undo_move: z.object({
    source_state: z.enum(["todo", "in_progress", "in_review", "done", "cancelled"]),
    target_state: z.enum(["todo", "in_progress", "in_review", "done", "cancelled"]),
    before_id: z.string().nullable(), after_id: z.string().nullable(),
}) }));

export const api = {
    authOptions: (signal?: AbortSignal) => request("/api/auth/options", z.object({ registration_enabled: z.boolean(), auth_mode: z.enum(["password", "microsoft"]) }), { signal }),
    session: (signal?: AbortSignal) => request("/api/session", sessionSchema, { signal }),
    auth: (mode: "login" | "register", body: unknown) => request(`/api/auth/${mode}`, sessionSchema, { method: "POST", body }),
    logout: () => request("/api/auth/logout", okSchema.extend({ auth_mode: z.enum(["password", "microsoft"]) }), { method: "POST" }),
    projects: (signal?: AbortSignal) => request("/api/projects", z.array(projectSchema), { signal }),
    reorderProjects: (project_ids: string[]) => request("/api/projects/order", z.array(projectSchema), { method: "PUT", body: { project_ids } }),
    createProject: (body: unknown) => request("/api/projects", projectSchema, { method: "POST", body }),
    importProject: (archive: string) => request("/api/projects/import", projectSchema, { method: "POST", body: { archive_base64: archive } }),
    previewGit: (repository_url: string, path = "") => request("/api/projects/from-git/preview", gitPreviewSchema, { method: "POST", body: { repository_url, path } }),
    importGit: (body: unknown) => request("/api/projects/from-git", projectSchema, { method: "POST", body }),
    previewGitZip: (body: unknown) => request("/api/projects/from-git-zip/preview", gitZipPreviewSchema, { method: "POST", body }),
    importGitZip: (body: unknown) => request("/api/projects/from-git-zip", projectSchema, { method: "POST", body }),
    repositoryActivity: (pid: string, signal?: AbortSignal) => request(`${projectPath(pid)}/repository-activity`, z.array(repositoryActivitySchema), { signal }),
    summary: (pid: string, signal?: AbortSignal) => request(`${projectPath(pid)}/summary`, summarySchema, { signal }),
    items: (pid: string, signal?: AbortSignal) => request(`${projectPath(pid)}/items`, z.array(itemSchema), { signal }),
    item: (iid: string, signal?: AbortSignal) => request(itemPath(iid), itemSchema, { signal }),
    createItem: (pid: string, body: unknown) => request(`${projectPath(pid)}/items`, itemSchema, { method: "POST", body }),
    quickTask: (pid: string, body: unknown) => request(`${projectPath(pid)}/tasks/quick`, itemSchema, { method: "POST", body }),
    bulkTasks: (pid: string, body: unknown) => request(`${projectPath(pid)}/tasks/bulk`, z.array(itemSchema), { method: "POST", body }),
    taskViews: (pid: string, signal?: AbortSignal) => request(`${projectPath(pid)}/task-views`, z.array(taskViewSchema), { signal }),
    createTaskView: (pid: string, body: unknown) => request(`${projectPath(pid)}/task-views`, taskViewSchema, { method: "POST", body }),
    updateTaskView: (vid: string, body: unknown) => request(`/api/task-views/${encodeURIComponent(vid)}`, taskViewSchema, { method: "PUT", body }),
    deleteTaskView: (vid: string) => request(`/api/task-views/${encodeURIComponent(vid)}`, okSchema, { method: "DELETE" }),
    saveItem: (iid: string, body: unknown) => request(itemPath(iid), itemSchema, { method: "PUT", body }),
    moveTask: (iid: string, body: unknown) => request(`${itemPath(iid)}/move`, taskMoveResponseSchema, { method: "POST", body }),
    confirmItem: (iid: string, revision: number) => request(`${itemPath(iid)}/confirm`, itemSchema, { method: "POST", body: { expected_revision: revision } }),
    revisions: (iid: string, signal?: AbortSignal) => request(`${itemPath(iid)}/revisions`, z.array(revisionSchema), { signal }),
    restoreItem: (iid: string, expected: number, revision: number) => request(`${itemPath(iid)}/restore`, itemSchema, { method: "POST", body: { expected_revision: expected, revision } }),
    links: (pid: string, signal?: AbortSignal) => request(`${projectPath(pid)}/links`, z.array(linkSchema), { signal }),
    createLink: (pid: string, body: unknown) => request(`${projectPath(pid)}/links`, linkSchema, { method: "POST", body }),
    deleteLink: (lid: string) => request(`/api/links/${encodeURIComponent(lid)}`, okSchema, { method: "DELETE" }),
    reviewLink: (lid: string, body: unknown) => request(`/api/links/${encodeURIComponent(lid)}/review`, linkSchema, { method: "POST", body }),
    testRuns: (pid: string, signal?: AbortSignal) => request(`${projectPath(pid)}/test-runs`, z.array(testRunSchema), { signal }),
    createTestRun: (iid: string, body: unknown) => request(`${itemPath(iid)}/test-runs`, testRunSchema, { method: "POST", body }),
    baselines: (pid: string, signal?: AbortSignal) => request(`${projectPath(pid)}/baselines`, z.array(baselineSchema), { signal }),
    createBaseline: (pid: string, name: string) => request(`${projectPath(pid)}/baselines`, baselineSchema, { method: "POST", body: { name } }),
    trace: (pid: string, signal?: AbortSignal) => request(`${projectPath(pid)}/trace`, traceSchema, { signal }),
    catalog: (signal?: AbortSignal) => request("/api/catalog", catalogSchema, { signal }),
    runtime: (signal?: AbortSignal) => request("/api/runtime", runtimeSchema, { signal }),
    resolve: (skillIds: string[]) => request("/api/skills/resolve", resolveSchema, { method: "POST", body: { skill_ids: skillIds } }),
    runs: (pid: string, signal?: AbortSignal) => request(`${projectPath(pid)}/runs`, z.array(runSchema), { signal }),
    run: (rid: string, signal?: AbortSignal) => request(runPath(rid), runSchema, { signal }),
    createRun: (pid: string, body: unknown) => request(`${projectPath(pid)}/runs`, runSchema, { method: "POST", body }),
    runAction: (rid: string, action: "cancel" | "retry") => request(`${runPath(rid)}/${action}`, runSchema, { method: "POST" }),
    applyRun: (rid: string, indices: number[], applyDocument: boolean) => request(`${runPath(rid)}/apply`, runSchema, { method: "POST", body: { selected_indices: indices, apply_document: applyDocument } }),
    reconnect: (iid: string, body: unknown) => request(`${itemPath(iid)}/reconnect`, reconnectSchema, { method: "POST", body }),
    health: (signal?: AbortSignal) => request("/health", z.object({ status: z.literal("ok") }), { signal }),
};

export async function downloadArchive(path: string, fallbackName: string): Promise<void> {
    let response: Response;
    try {
        response = await fetch(path, { credentials: "same-origin" });
    } catch {
        throw new ApiError("다운로드 서버에 연결할 수 없습니다. 다시 시도해 주세요.");
    }
    if (!response.ok) throw await responseError(response);
    const type = response.headers.get("Content-Type") ?? "";
    if (!type.includes("zip") && !type.includes("octet-stream")) {
        throw new ApiError("서버가 ZIP 파일을 반환하지 않았습니다.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fallbackName.replace(/[<>:"/\\|?*]/g, "_");
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "작업을 완료하지 못했습니다. 다시 시도해 주세요.";
}
