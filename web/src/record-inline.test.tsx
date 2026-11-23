import { ownerAccess, ownerProject, renderWithOwnerPermissions as render } from "./permissions.test-support";
import { fireEvent, render as renderUi, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";
import { idea, userId } from "./fixtures.test-data";
import { RecordEditor } from "./ItemsPage";
import { ProjectNameEdit } from "./ProjectNameEdit";
import { itemSchema, projectSchema } from "./models";
import { ProjectPermissionsProvider } from "./ProjectPermissions";

const parsedTask = itemSchema.parse({ ...idea, kind: "task", title: "원래 작업 제목", body: "원래 작업 본문", data: { workflow: "personal", requires_test: false, context: "사무실" } });
if (parsedTask.kind !== "task") throw new Error("Expected task fixture");
const task = parsedTask;
const project = projectSchema.parse({
    id: task.project_id, name: "원래 프로젝트명", goal: "프로젝트 목표", profile: "simple", version: 1,
    created_at: task.created_at, sort_order: 0, repository_url: null, repository_path: "",
    repository_branch: null, repository_sha: null, repository_kind: null,
    repository_manifest: null, repository_imported_at: null, access: ownerAccess(task.project_id),
});
const draftKey = `projects:draft:${userId}:${task.project_id}:${task.id}`;
const mountEditor = () => render(<RecordEditor item={task} items={[task]} userId={userId} onChanged={vi.fn()} />);

beforeAll(async () => {
    // Permission interactions require the real preview renderer to be loaded.
    // Keep lazy chunk download/transform timing outside the UI assertions.
    await import("./MarkdownContent");
});

beforeEach(() => {
    vi.spyOn(api, "taskFields").mockResolvedValue([]);
});

describe("record inline editing integration", () => {
    it("keeps a viewer's server body readable with a restored draft while refusing title and body editing", async () => {
        const save = vi.spyOn(api, "saveItem");
        const owner = ownerProject(task.project_id);
        const viewer = {...owner, access: {...owner.access!,
            role: {...owner.access!.role, name: "뷰어", preset: "viewer" as const},
            capabilities: ["project.read", "project.export"],
        }};
        localStorage.setItem(draftKey, JSON.stringify({
            title: "권한 변경 전 제목 초안", body: "권한 변경 전 본문 초안", data: task.data,
            baseRevision: task.revision, savedLocallyAt: "2026-11-07T00:00:00Z",
        }));
        renderUi(<ProjectPermissionsProvider projects={[viewer]}>
            <RecordEditor item={task} items={[task]} userId={userId} onChanged={vi.fn()} />
        </ProjectPermissionsProvider>);
        expect(await screen.findByText("원래 작업 본문")).toBeTruthy();
        const title = screen.getByRole("button", {name: "항목 제목 수정"});
        expect(title).toHaveProperty("disabled", true);
        fireEvent.click(title);
        fireEvent.click(screen.getByRole("tab", {name: "편집"}));
        expect(screen.queryByRole("textbox", {name: "항목 제목"})).toBeNull();
        expect(screen.queryByRole("textbox", {name: "본문 · Markdown"})).toBeNull();
        expect(JSON.parse(localStorage.getItem(draftKey) ?? "null")).toMatchObject({
            title: "권한 변경 전 제목 초안", body: "권한 변경 전 본문 초안", baseRevision: task.revision,
        });
        expect(save).not.toHaveBeenCalled();
    });

    it("edits a title in the reading view and saves the existing body and properties", async () => {
        const save = vi.spyOn(api, "saveItem").mockResolvedValue({ ...task, title: "새 작업 제목", revision: 2 });
        const user = userEvent.setup();
        mountEditor();
        await user.click(screen.getByRole("button", { name: "항목 제목 수정" }));
        const title = screen.getByRole("textbox", { name: "항목 제목" });
        await user.clear(title);
        await user.type(title, "새 작업 제목");
        expect(screen.getByRole("tab", { name: "본문" }).getAttribute("aria-selected")).toBe("true");
        expect(screen.getByRole("tab", { name: "편집" }).getAttribute("aria-selected")).toBe("false");
        expect((screen.getByRole("button", { name: "원래 작업 제목 상태 편집" }) as HTMLButtonElement).disabled).toBe(true);
        await user.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(save).toHaveBeenCalledWith(task.id, { expected_revision: 1, title: "새 작업 제목", body: task.body, data: task.data }));
        await waitFor(() => expect(screen.queryByRole("textbox", { name: "항목 제목" })).toBeNull());
        expect(screen.getByRole("button", { name: "항목 제목 수정" }).textContent).toBe("새 작업 제목");
        expect(screen.getByText("현재 서버 revision 2")).toBeTruthy();
        expect(localStorage.getItem(draftKey)).toBeNull();
    });

    it("opens body editing by clicking its content and saves with Ctrl+Enter", async () => {
        const save = vi.spyOn(api, "saveItem").mockResolvedValue({ ...task, body: "새 본문\n두 번째 줄", revision: 2 });
        mountEditor();
        fireEvent.click(screen.getByText(task.body));
        const body = screen.getByRole("textbox", { name: "본문" });
        fireEvent.change(body, { target: { value: "새 본문\n두 번째 줄" } });
        expect(screen.getByRole("tab", { name: "본문" }).getAttribute("aria-selected")).toBe("true");
        fireEvent.keyDown(body, { key: "Enter", code: "Enter", ctrlKey: true });
        await waitFor(() => expect(save).toHaveBeenCalledWith(task.id, { expected_revision: 1, title: task.title, body: "새 본문\n두 번째 줄", data: task.data }));
        await waitFor(() => expect(screen.queryByRole("textbox", { name: "본문" })).toBeNull());
        expect(screen.getByText(/두 번째 줄/)).toBeTruthy();
    });

    it("stores a changed inline draft locally and restores the same editor after remount", async () => {
        const save = vi.spyOn(api, "saveItem").mockResolvedValue({ ...task, title: "보관한 제목 초안", revision: 2 });
        const first = mountEditor();
        fireEvent.click(screen.getByRole("button", { name: "항목 제목 수정" }));
        fireEvent.change(screen.getByRole("textbox", { name: "항목 제목" }), { target: { value: "보관한 제목 초안" } });
        await waitFor(() => expect(JSON.parse(localStorage.getItem(draftKey) ?? "null")).toMatchObject({ title: "보관한 제목 초안", baseRevision: 1, inlineField: "title" }));
        first.unmount();
        mountEditor();
        expect((screen.getByRole("textbox", { name: "항목 제목" }) as HTMLInputElement).value).toBe("보관한 제목 초안");
        expect(screen.getByRole("tab", { name: "본문" }).getAttribute("aria-selected")).toBe("true");
        expect(save).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(save).toHaveBeenCalledWith(task.id, { expected_revision: 1, title: "보관한 제목 초안", body: task.body, data: task.data }));
    });

    it("keeps the body editor accessible when the relationship shortcut is selected", () => {
        mountEditor();
        fireEvent.click(screen.getByText(task.body));
        fireEvent.change(screen.getByRole("textbox", { name: "본문" }), { target: { value: "아직 저장하지 않은 본문" } });
        fireEvent.click(screen.getByRole("button", { name: "관계 확인" }));
        expect((screen.getByRole("textbox", { name: "본문" }) as HTMLTextAreaElement).value).toBe("아직 저장하지 않은 본문");
        expect(screen.getByRole("tab", { name: "본문" }).getAttribute("aria-selected")).toBe("true");
    });

    it("keeps a title draft after a conflict and merges only after selecting the latest revision", async () => {
        const latest = { ...task, revision: 7, title: "다른 사람이 저장한 제목", body: "서버의 최신 본문", data: { ...task.data, context: "외부", goal: "최신 목표" } };
        const save = vi.spyOn(api, "saveItem").mockRejectedValueOnce(new ApiError("다른 변경이 저장되었습니다.", 409)).mockResolvedValueOnce({ ...latest, revision: 8, title: "내 제목 초안" });
        const get = vi.spyOn(api, "item").mockResolvedValue(latest);
        const user = userEvent.setup();
        mountEditor();
        await user.click(screen.getByRole("button", { name: "항목 제목 수정" }));
        fireEvent.change(screen.getByRole("textbox", { name: "항목 제목" }), { target: { value: "내 제목 초안" } });
        await user.click(screen.getByRole("button", { name: "저장" }));
        const conflict = await screen.findByRole("region", { name: "동시 편집 충돌" });
        expect(get).toHaveBeenCalledWith(task.id);
        expect((screen.getByRole("textbox", { name: "항목 제목" }) as HTMLInputElement).value).toBe("내 제목 초안");
        expect(within(conflict).getByText("서버의 최신 본문")).toBeTruthy();
        expect(JSON.parse(localStorage.getItem(draftKey) ?? "null")).toMatchObject({ title: "내 제목 초안", baseRevision: 1 });
        expect(save).toHaveBeenCalledTimes(1);
        await user.click(within(conflict).getByRole("button", { name: "서버 최신 revision을 기준으로 병합 편집" }));
        expect(save).toHaveBeenCalledTimes(1);
        expect((screen.getByRole("textbox", { name: "항목 제목" }) as HTMLInputElement).value).toBe("내 제목 초안");
        await user.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(save).toHaveBeenLastCalledWith(task.id, { expected_revision: 7, title: "내 제목 초안", body: latest.body, data: latest.data }));
    });

    it("uses a property save's returned revision and values for the following title save", async () => {
        const latest = { ...task, revision: 4, data: { ...task.data, context: "집", estimated_minutes: 35 } };
        const properties = vi.spyOn(api, "updateTaskProperties").mockResolvedValue(latest);
        const save = vi.spyOn(api, "saveItem").mockResolvedValue({ ...latest, revision: 5, title: "속성 저장 뒤 제목" });
        const user = userEvent.setup();
        mountEditor();
        await user.click(screen.getByRole("button", { name: "원래 작업 제목 맥락 편집" }));
        fireEvent.change(screen.getByRole("textbox", { name: "맥락" }), { target: { value: "집" } });
        await user.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(properties).toHaveBeenCalledWith(task.id, { expected_revision: 1, values: { context: "집" } }));
        await user.click(screen.getByRole("button", { name: "항목 제목 수정" }));
        fireEvent.change(screen.getByRole("textbox", { name: "항목 제목" }), { target: { value: "속성 저장 뒤 제목" } });
        await user.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(save).toHaveBeenCalledWith(task.id, { expected_revision: 4, title: "속성 저장 뒤 제목", body: latest.body, data: latest.data }));
    });

    it("preserves an active title draft when an already pending property save completes", async () => {
        const latest = { ...task, revision: 4, data: { ...task.data, context: "집" } };
        let complete: ((item: typeof task) => void) | undefined;
        vi.spyOn(api, "updateTaskProperties").mockImplementation(() => new Promise(resolve => { complete = resolve; }));
        const save = vi.spyOn(api, "saveItem").mockRejectedValueOnce(new ApiError("다른 변경이 저장되었습니다.", 409)).mockResolvedValueOnce({ ...latest, revision: 5, title: "진행 중인 내 제목" });
        vi.spyOn(api, "item").mockResolvedValue(latest);
        const user = userEvent.setup();
        mountEditor();
        await user.click(screen.getByRole("button", { name: "원래 작업 제목 맥락 편집" }));
        fireEvent.change(screen.getByRole("textbox", { name: "맥락" }), { target: { value: "집" } });
        await user.click(screen.getByRole("button", { name: "저장" }));
        await user.click(screen.getByRole("button", { name: "항목 제목 수정" }));
        fireEvent.change(screen.getByRole("textbox", { name: "항목 제목" }), { target: { value: "진행 중인 내 제목" } });
        complete?.(latest);
        await screen.findByText("현재 서버 revision 4");
        expect((screen.getByRole("textbox", { name: "항목 제목" }) as HTMLInputElement).value).toBe("진행 중인 내 제목");
        expect(JSON.parse(localStorage.getItem(draftKey) ?? "null")).toMatchObject({ title: "진행 중인 내 제목", baseRevision: 1, inlineField: "title" });
        await user.click(screen.getByRole("button", { name: "저장" }));
        const conflict = await screen.findByRole("region", { name: "동시 편집 충돌" });
        expect(save).toHaveBeenCalledWith(task.id, { expected_revision: 1, title: "진행 중인 내 제목", body: task.body, data: task.data });
        await user.click(within(conflict).getByRole("button", { name: "서버 최신 revision을 기준으로 병합 편집" }));
        expect(save).toHaveBeenCalledTimes(1);
        await user.click(screen.getByRole("button", { name: "저장" }));
        await waitFor(() => expect(save).toHaveBeenLastCalledWith(task.id, { expected_revision: 4, title: "진행 중인 내 제목", body: latest.body, data: latest.data }));
    });
});

it("preserves a project name draft, fetches the latest project after conflict, then retries its version", async () => {
    const latest = { ...project, version: 6, name: "서버 최신 프로젝트명", goal: "서버 최신 목표" };
    const renamed = { ...latest, version: 7, name: "내 프로젝트 이름" };
    const rename = vi.spyOn(api, "renameProject").mockRejectedValueOnce(new ApiError("다른 변경이 저장되었습니다.", 409)).mockResolvedValueOnce(renamed);
    const get = vi.spyOn(api, "project").mockResolvedValue(latest);
    const saved = vi.fn();
    const user = userEvent.setup();
    render(<ProjectNameEdit project={project} onSaved={saved} />);
    await user.click(screen.getByRole("button", { name: "프로젝트명 수정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "프로젝트명" }), { target: { value: "내 프로젝트 이름" } });
    await user.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByRole("alert");
    expect(rename).toHaveBeenCalledWith(project.id, { expected_version: 1, name: "내 프로젝트 이름" });
    expect((screen.getByRole("textbox", { name: "프로젝트명" }) as HTMLInputElement).value).toBe("내 프로젝트 이름");
    expect(get).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "최신 프로젝트 불러오기" }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(latest));
    expect(get).toHaveBeenCalledWith(project.id);
    expect((screen.getByRole("textbox", { name: "프로젝트명" }) as HTMLInputElement).value).toBe("내 프로젝트 이름");
    expect(rename).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(rename).toHaveBeenLastCalledWith(project.id, { expected_version: 6, name: "내 프로젝트 이름" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "프로젝트명" })).toBeNull());
    expect(screen.getByRole("button", { name: "프로젝트명 수정" }).textContent).toBe("내 프로젝트 이름");
    expect(saved).toHaveBeenLastCalledWith(renamed);
});
