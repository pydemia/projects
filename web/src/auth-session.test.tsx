import { ownerAccess } from "./permissions.test-support";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { api, ApiError } from "./api";
import { reauthentication } from "./reauthentication";
import { ProjectsThemeProvider } from "./theme";
import type { Project } from "./models";

vi.mock("./TaskWorkspace", () => ({TaskWorkspace: () => <input aria-label="작성 중인 작업" defaultValue="보관할 입력" />}));
vi.mock("./GlobalTasks", () => ({GlobalTasks: () => <p>전체 작업</p>}));
vi.mock("./ItemsPage", () => ({ItemsPage: () => <p>항목</p>}));
vi.mock("./ProjectPages", () => ({Overview: () => <p>개요</p>, TracePage: () => <p>추적</p>}));
vi.mock("./RunsPage", () => ({RunsPage: () => <p>스킬</p>}));
const project: Project = {id: "00000000-0000-4000-8000-000000000999", name: "복귀 프로젝트", goal: "", profile: "simple", version: 1,
    created_at: "2026-11-03T00:00:00Z", sort_order: 0, repository_url: null, repository_path: "", repository_branch: null,
    repository_sha: null, repository_kind: null, repository_manifest: null, repository_imported_at: null, access: ownerAccess("00000000-0000-4000-8000-000000000999")};
const original = `/?project=${project.id}&view=tasks&taskLayout=board&q=%ED%95%A0%EC%9D%BC&qa=preserved#body`;
const session = {user: {id: "owner", username: "tester"}, csrf_token: "fixture", auth_mode: "password" as const};
beforeEach(() => {
    reauthentication.configure(null);
    vi.spyOn(api, "session").mockResolvedValue(session);
    vi.spyOn(api, "projects").mockResolvedValue([project]);
    vi.spyOn(api, "items").mockResolvedValue([]);
    vi.spyOn(api, "catalog").mockRejectedValue(new Error("unused fixture"));
    vi.spyOn(api, "runtime").mockRejectedValue(new Error("unused fixture"));
    vi.spyOn(api, "health").mockResolvedValue({status: "ok"});
    vi.spyOn(api, "authOptions").mockResolvedValue({registration_enabled: false, auth_mode: "password"});
});
afterEach(() => { reauthentication.configure(null); });
const mount = () => render(<ProjectsThemeProvider><App /></ProjectsThemeProvider>);

it("restores the full return URL before mounting the authenticated workspace", async () => {
    window.history.replaceState(null, "", `/?${new URLSearchParams({view: "login", returnTo: original})}`);
    mount();
    await screen.findByLabelText("작성 중인 작업");
    expect(location.pathname + location.search + location.hash).toBe(original);
});
it("keeps the authenticated tree mounted while session recovery checkpoints run", async () => {
    window.history.replaceState(null, "", original);
    const run = vi.spyOn(reauthentication, "run").mockResolvedValue();
    mount();
    const editor = await screen.findByLabelText("작성 중인 작업");
    act(() => { window.dispatchEvent(new Event("projects:unauthorized")); });
    await waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("작성 중인 작업")).toBe(editor);
    expect(screen.queryByLabelText("비밀번호")).toBeNull();
    expect(reauthentication.snapshot().phase).toBe("required");
});
it("shows normal password login on an initial unauthenticated bootstrap without an automatic redirect", async () => {
    vi.mocked(api.session).mockRejectedValue(new ApiError("expired", 401));
    mount();
    await screen.findByLabelText("비밀번호");
    expect(reauthentication.snapshot().phase).toBe("idle");
    expect(location.search).toBe("");
});
it("offers Microsoft login with the current deep link instead of the workspace root", async () => {
    window.history.replaceState(null, "", original);
    vi.mocked(api.session).mockRejectedValue(new ApiError("expired", 401));
    vi.mocked(api.authOptions).mockResolvedValue({registration_enabled: false, auth_mode: "microsoft"});
    mount();
    const link = await screen.findByRole("link", {name: "Microsoft 계정으로 로그인"});
    expect(new URL(link.getAttribute("href")!, location.origin).searchParams.get("rd")).toBe(original);
});

it("keeps session recovery suspended and posts Microsoft logout after a concurrent session expiry", async () => {
    window.history.replaceState(null, "", original);
    vi.mocked(api.session).mockResolvedValue({...session, auth_mode: "microsoft"});
    const logout = vi.spyOn(api, "logout").mockImplementation(async () => {
        window.dispatchEvent(new Event("projects:unauthorized"));
        throw new ApiError("expired", 401);
    });
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (this: HTMLFormElement) {
        expect(this.method).toBe("post");
        expect(new URL(this.action).pathname).toBe("/oauth2/logout-global");
        this.remove();
    });
    try {
        mount();
        await screen.findByLabelText("작성 중인 작업");
        fireEvent.click(screen.getAllByRole("button", {name: "로그아웃"})[0]!);
        await waitFor(() => expect(submit).toHaveBeenCalledOnce());
        expect(logout).toHaveBeenCalledOnce();
        expect(reauthentication.snapshot().phase).toBe("idle");
    } finally { submit.mockRestore(); logout.mockRestore(); }
});
