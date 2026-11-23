import { ownerAccess, renderWithOwnerPermissions as render } from "./permissions.test-support";
import { useLayoutEffect, useRef } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AuthRecoveryProvider } from "./auth-drafts";
import { api } from "./api";
import { TaskBoard } from "./TaskBoard";
import { TaskTransfer } from "./TaskTransfer";
import { TaskNoteReferences } from "./TaskNoteReferences";
import { Relations, TestExecutions } from "./Relations";
import { reauthentication } from "./reauthentication";
import { ProjectsThemeProvider } from "./theme";
import { idea, userId } from "./fixtures.test-data";
import type { Project } from "./models";

const checkpoints = vi.hoisted(() => new Set<() => boolean | void>());
vi.mock("./reauthentication", async () => ({
    ...await vi.importActual<typeof import("./reauthentication")>("./reauthentication"),
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
vi.mock("./TaskWorkspace", () => ({TaskWorkspace: () => <p>작업</p>}));
vi.mock("./GlobalTasks", () => ({GlobalTasks: () => <p>전체 작업</p>}));
vi.mock("./ProjectPages", () => ({Overview: () => <p>개요</p>, TracePage: () => <p>추적</p>}));
const project: Project = {id: idea.project_id, name: "Existing project", goal: "", profile: "simple", version: 1,
    created_at: idea.created_at, sort_order: 0, repository_url: null, repository_path: "", repository_branch: null,
    repository_sha: null, repository_kind: null, repository_manifest: null, repository_imported_at: null, access: ownerAccess(idea.project_id)};
function mockWorkbench() {
    vi.spyOn(api, "session").mockResolvedValue({user: {id: userId, username: "fixture"}, csrf_token: "fixture", auth_mode: "password"});
    vi.spyOn(api, "projects").mockResolvedValue([project]);
    vi.spyOn(api, "items").mockResolvedValue([]);
    vi.spyOn(api, "catalog").mockRejectedValue(new Error("unused fixture"));
    vi.spyOn(api, "runtime").mockRejectedValue(new Error("unused fixture"));
}
const mountApp = () => render(<ProjectsThemeProvider><App /></ProjectsThemeProvider>);
function checkpoint() {
    let ok = true;
    act(() => {for (const callback of checkpoints) if (callback() === false) ok = false;});
    return ok;
}
afterEach(() => {sessionStorage.clear(); checkpoints.clear(); reauthentication.configure(null);});

describe("remaining form authentication checkpoints", () => {
    it("restores a create-project dialog and its entered fields without creating a project", async () => {
        mockWorkbench();
        const create = vi.spyOn(api, "createProject").mockResolvedValue(project);
        const mount = () => render(<ProjectsThemeProvider><App /></ProjectsThemeProvider>);
        window.history.replaceState(null, "", `/?project=${project.id}&view=overview`);
        const first = mount();
        fireEvent.click(await screen.findByRole("button", {name: "+ 프로젝트 만들기"}));
        fireEvent.change(screen.getByLabelText("프로젝트 이름"), {target: {value: "Unsubmitted project"}});
        fireEvent.change(screen.getByLabelText("목표"), {target: {value: "Keep this goal"}});
        fireEvent.change(screen.getByLabelText("프로필"), {target: {value: "standard"}});
        expect(checkpoint()).toBe(true);
        first.unmount();
        mount();
        await waitFor(() => expect(screen.getByLabelText("프로젝트 이름")).toHaveProperty("value", "Unsubmitted project"));
        expect(screen.getByLabelText("목표")).toHaveProperty("value", "Keep this goal");
        expect(screen.getByLabelText("프로필")).toHaveProperty("value", "standard");
        expect(create).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", {name: "취소"}));
        expect(screen.queryByLabelText("프로젝트 이름")).toBeNull();
        expect(checkpoint()).toBe(true);
        expect([...Object.keys(sessionStorage)].some(key => key.includes(encodeURIComponent("project:creation")))).toBe(false);
    });

    it("keeps an active sidebar rename when a closed main project list checkpoints later", async () => {
        mockWorkbench();
        window.history.replaceState(null, "", "/?view=projects");
        const first = mountApp();
        const sidebar = await screen.findByLabelText("프로젝트 탐색");
        const trigger = await within(sidebar).findByRole("button", {name: "Existing project 프로젝트 메뉴"});
        expect(screen.getAllByRole("button", {name: "Existing project 프로젝트 메뉴"})).toHaveLength(2);
        fireEvent.pointerDown(trigger, {button: 0, ctrlKey: false, pointerType: "mouse"});
        fireEvent.click(await screen.findByRole("menuitem", {name: "이름 수정"}));
        fireEvent.change(screen.getByLabelText("프로젝트명"), {target: {value: "Keep sidebar rename"}});
        expect(checkpoint()).toBe(true);
        first.unmount();
        mountApp();
        await waitFor(() => expect(screen.getByLabelText("프로젝트명")).toHaveProperty("value", "Keep sidebar rename"));
        expect(screen.getAllByLabelText("프로젝트명")).toHaveLength(1);
        expect(screen.getAllByRole("button", {name: "Existing project 프로젝트 메뉴"})).toHaveLength(2);
    });

    it("reopens the mobile project picker and its own rename draft after return", async () => {
        mockWorkbench();
        window.history.replaceState(null, "", "/?view=projects");
        const first = mountApp();
        await screen.findByRole("heading", {name: "프로젝트"});
        fireEvent.click(screen.getByRole("button", {name: "프로젝트 목록 열기"}));
        const picker = await screen.findByRole("dialog", {name: "프로젝트 목록"});
        fireEvent.pointerDown(within(picker).getByRole("button", {name: "Existing project 프로젝트 메뉴"}), {button: 0, ctrlKey: false, pointerType: "mouse"});
        fireEvent.click(await screen.findByRole("menuitem", {name: "이름 수정"}));
        fireEvent.change(screen.getByLabelText("프로젝트명"), {target: {value: "Keep mobile rename"}});
        expect(checkpoint()).toBe(true);
        first.unmount();
        mountApp();
        const restoredPicker = await screen.findByRole("dialog", {name: "프로젝트 목록"});
        await waitFor(() => expect(within(restoredPicker).getByLabelText("프로젝트명")).toHaveProperty("value", "Keep mobile rename"));
        expect(screen.getAllByLabelText("프로젝트명")).toHaveLength(1);
    });

    it("restores a board new-card title, selected column and cancellation reason without submitting", () => {
        const create = vi.spyOn(api, "quickTask");
        const props = {projectId: project.id, tasks: [], lens: "gtd" as const, savedSort: "manual" as const, onSortChange: vi.fn(),
            selectedIds: new Set<string>(), onSelect: vi.fn(), cardFields: [], onChanged: vi.fn(), onError: vi.fn()};
        const mount = () => render(<AuthRecoveryProvider userId={userId}><TaskBoard {...props} /></AuthRecoveryProvider>);
        const first = mount();
        fireEvent.click(screen.getByRole("button", {name: "+ 취소 작업"}));
        fireEvent.change(screen.getByLabelText("취소 새 작업 제목"), {target: {value: "Unsubmitted card"}});
        fireEvent.change(screen.getByLabelText("취소 사유"), {target: {value: "Keep reason"}});
        expect(checkpoint()).toBe(true);
        first.unmount();
        mount();
        expect(screen.getByLabelText("취소 새 작업 제목")).toHaveProperty("value", "Unsubmitted card");
        expect(screen.getByLabelText("취소 사유")).toHaveProperty("value", "Keep reason");
        expect(create).not.toHaveBeenCalled();
    });

    it("blocks redirect while a transfer target list is entered", () => {
        vi.spyOn(api, "projects").mockResolvedValue([project]);
        render(<TaskTransfer tasks={[idea]} hiddenCount={0} onClose={vi.fn()} onChanged={vi.fn()} />);
        expect(checkpoint()).toBe(true);
        const input = screen.getByLabelText("대상 목록 · 비우면 기존 목록 유지");
        fireEvent.change(input, {target: {value: "Unsubmitted list"}});
        expect(checkpoint()).toBe(false);
        expect(input).toHaveProperty("value", "Unsubmitted list");
        fireEvent.change(input, {target: {value: ""}});
        expect(checkpoint()).toBe(true);
    });

    it("blocks redirect while Note reference metadata is entered", () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", {status: 200, headers: {"Content-Type": "application/json"}})));
        render(<TaskNoteReferences item={idea} onChanged={vi.fn()} />);
        expect(checkpoint()).toBe(true);
        fireEvent.change(screen.getByLabelText("문서 revision · 선택"), {target: {value: "Unsubmitted revision"}});
        expect(checkpoint()).toBe(false);
        expect(screen.getByLabelText("문서 revision · 선택")).toHaveProperty("value", "Unsubmitted revision");
    });

    it("blocks redirect for an unsubmitted relation or test execution", () => {
        vi.spyOn(api, "links").mockResolvedValue([]);
        vi.spyOn(api, "testRuns").mockResolvedValue([]);
        const first = render(<Relations item={idea} items={[idea]} onChanged={vi.fn()} />);
        expect(checkpoint()).toBe(true);
        fireEvent.change(screen.getByLabelText("관계"), {target: {value: "depends_on"}});
        expect(checkpoint()).toBe(false);
        first.unmount();
        render(<TestExecutions item={idea} onChanged={vi.fn()} />);
        expect(checkpoint()).toBe(true);
        fireEvent.change(screen.getByLabelText("실행 환경"), {target: {value: "Unsubmitted environment"}});
        expect(checkpoint()).toBe(false);
        expect(screen.getByLabelText("실행 환경")).toHaveProperty("value", "Unsubmitted environment");
    });
});
