import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { ownerProject } from "./permissions.test-support";
import { reauthentication } from "./reauthentication";
import { ProjectsThemeProvider } from "./theme";

const navigation = vi.hoisted(() => vi.fn<(url: string) => void>());
vi.mock("./reauthentication", async () => {
    const actual = await vi.importActual<typeof import("./reauthentication")>("./reauthentication");
    return {...actual, reauthentication: actual.createReauthenticationController({
        location: () => window.location, storage: () => sessionStorage, now: () => Date.now(),
        navigate: navigation, canNavigate: () => true,
    })};
});
vi.mock("./ProjectPages", () => ({Overview: () => <p>수락한 프로젝트 개요</p>, TracePage: () => null}));

const invitationId = "00000000-0000-4000-8000-000000000701";
const token = "synthetic-one-use-invitation";
const destination = `/?view=project-invitation&invitationId=${invitationId}&expectedRevision=4`;
const role = {id: "00000000-0000-4000-8000-000000000702", name: "뷰어", preset: "viewer" as const};
const owner = ownerProject("00000000-0000-4000-8000-000000000703", "수락을 검토할 프로젝트");
const project = {...owner, access: {...owner.access!, role, capabilities: ["project.read", "project.export"]}};
let authenticated = false;
let joined = false;
let account = "first";
let previewRevision = 9;
type RecordedRequest = {path: string; method: string; body: unknown; csrf: string | null; authenticated: boolean};
let requests: RecordedRequest[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {"Content-Type": "application/json"}});

beforeEach(() => {
    reauthentication.configure(null);
    navigation.mockClear(); sessionStorage.clear();
    authenticated = false; joined = false; account = "first"; previewRevision = 9; requests = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
        const path = String(input);
        const method = options?.method ?? "GET";
        const body: unknown = typeof options?.body === "string" ? JSON.parse(options.body) : undefined;
        const csrf = new Headers(options?.headers).get("X-CSRF-Token");
        requests.push({path, method, body, csrf, authenticated});
        if (path === "/api/auth/options") return json({registration_enabled: false, auth_mode: "microsoft"});
        if (path === "/health") return json({status: "ok"});
        if (path === "/api/session") return authenticated ? json({user: {
            id: account === "first" ? "00000000-0000-4000-8000-000000000704" : "00000000-0000-4000-8000-000000000705",
            username: account === "first" ? "첫 로그인 계정" : "새 로그인 계정",
        }, csrf_token: `csrf-${account}`, auth_mode: "microsoft"}) : json({detail: "인증이 필요합니다."}, 401);
        if (!authenticated) return json({detail: "세션이 만료되었습니다."}, 401);
        if (path === "/api/projects") return json(joined ? [project] : []);
        if (path === `/api/projects/${project.id}/items`) return json([]);
        if (path === `/api/project-invitations/${invitationId}/preview`) return json({
            project_id: project.id, project_name: project.name, access_revision: previewRevision, role,
            kind: "membership", expires_at: "2030-11-07T00:00:00Z",
        });
        if (path === `/api/project-invitations/${invitationId}/accept`) {joined = true; return json({project_id: project.id});}
        return json({detail: "이 테스트에서 사용하지 않는 경로"}, 503);
    }));
});
afterEach(() => {reauthentication.configure(null); sessionStorage.clear();});
const mount = () => render(<ProjectsThemeProvider><App /></ProjectsThemeProvider>);
const acceptanceRequests = () => requests.filter(request => request.path.endsWith("/accept"));
const previewRequests = () => requests.filter(request => request.path.endsWith("/preview"));
function redirectDestination(url: string) {
    const rd = new URL(url, window.location.origin).searchParams.get("rd");
    if (!rd) throw new Error("Expected Microsoft login return destination");
    return rd;
}

it("checkpoints a fresh signed-out invitation before Microsoft login and restores it only after authenticated bootstrap", async () => {
    window.history.replaceState(null, "", `${destination}#invitationToken=${token}`);
    const signedOut = mount();
    const login = await screen.findByRole("link", {name: "Microsoft 계정으로 로그인"});
    const href = login.getAttribute("href")!;
    expect(decodeURIComponent(href)).not.toContain(token);
    const rd = redirectDestination(href);
    expect(rd).toBe(destination);
    expect(JSON.parse(sessionStorage.getItem("projects:pending-acceptance")!)).toMatchObject({
        kind: "invitation", id: invitationId, revision: "4", token,
    });
    expect(previewRequests()).toHaveLength(0);
    expect(acceptanceRequests()).toHaveLength(0);
    signedOut.unmount();

    authenticated = true;
    // OAuth can return through the existing local login envelope. The actual
    // App session bootstrap must restore that route before mounting acceptance.
    window.history.replaceState(null, "", `/?${new URLSearchParams({view: "login", returnTo: rd})}`);
    mount();
    await screen.findByText(project.name);
    expect(new URLSearchParams(window.location.hash.slice(1)).get("invitationToken")).toBe(token);
    expect(previewRequests()).toHaveLength(1);
    expect(previewRequests()[0]).toMatchObject({method: "POST", body: {token}, csrf: "csrf-first"});
    expect(acceptanceRequests()).toHaveLength(0);
    expect(screen.getByRole("button", {name: "현재 계정으로 수락"})).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByRole("button", {name: "현재 계정으로 수락"}));
    await screen.findByText("수락한 프로젝트 개요");
    expect(acceptanceRequests()).toHaveLength(1);
    expect(acceptanceRequests()[0]?.body).toMatchObject({token, expected_revision: 9});
    expect(sessionStorage.getItem("projects:pending-acceptance")).toBeNull();
    expect(window.location.hash).toBe("");
});

it("checkpoints an expired invitation session without leaking its token and requires a new preview and explicit acceptance after login", async () => {
    authenticated = true;
    window.history.replaceState(null, "", `${destination}#invitationToken=${token}`);
    const first = mount();
    await screen.findByText(project.name);
    expect(previewRequests()).toHaveLength(1);
    authenticated = false;
    fireEvent.click(screen.getByRole("button", {name: "현재 계정으로 수락"}));
    await waitFor(() => expect(navigation).toHaveBeenCalledOnce());
    const login = navigation.mock.calls[0]![0];
    expect(decodeURIComponent(login)).not.toContain(token);
    expect(sessionStorage.getItem("projects:pending-acceptance")).toContain(token);
    expect(sessionStorage.getItem("projects:reauthentication-attempt")).not.toContain(token);
    expect(acceptanceRequests()).toHaveLength(1);
    expect(acceptanceRequests()[0]?.authenticated).toBe(false);
    expect(joined).toBe(false);
    first.unmount();

    authenticated = true; account = "second"; previewRevision = 10;
    window.history.replaceState(null, "", redirectDestination(login));
    mount();
    await screen.findByText(project.name);
    expect(screen.getByText("새 로그인 계정")).not.toBeNull();
    expect(new URLSearchParams(window.location.hash.slice(1)).get("invitationToken")).toBe(token);
    expect(previewRequests()).toHaveLength(2);
    expect(previewRequests()[1]).toMatchObject({body: {token}, csrf: "csrf-second"});
    // The earlier expired POST is never replayed under this new session.
    expect(acceptanceRequests()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", {name: "현재 계정으로 수락"}));
    await screen.findByText("수락한 프로젝트 개요");
    expect(acceptanceRequests()).toHaveLength(2);
    expect(acceptanceRequests()[1]).toMatchObject({authenticated: true, csrf: "csrf-second", body: {token, expected_revision: 10}});
    expect(sessionStorage.getItem("projects:pending-acceptance")).toBeNull();
});
