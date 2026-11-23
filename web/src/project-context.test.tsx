import { ownerAccess } from "./permissions.test-support";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { api } from "./api";
import type { Project } from "./models";
import { ProjectsThemeProvider } from "./theme";

vi.mock("./TaskWorkspace", () => ({TaskWorkspace: () => <p>프로젝트 작업 화면</p>}));
vi.mock("./GlobalTasks", () => ({GlobalTasks: () => <p>전체 작업 화면</p>}));
vi.mock("./ItemsPage", () => ({ItemsPage: () => <p>프로젝트 항목 화면</p>}));
vi.mock("./StoriesPage", () => ({StoriesPage: () => <p>프로젝트 Story 화면</p>}));
vi.mock("./ProjectPages", () => ({Overview: () => <p>프로젝트 개요 화면</p>, TracePage: () => <p>프로젝트 추적 화면</p>}));
vi.mock("./RunsPage", () => ({RunsPage: () => <p>프로젝트 스킬 화면</p>}));
const user = "00000000-0000-4000-8000-000000000210";
const projects: Project[] = ["첫 프로젝트", "선택한 프로젝트"].map((name, index) => ({
    id: `00000000-0000-4000-8000-00000000021${index + 1}`, name,
    goal: "", profile: "simple", version: 1, created_at: "2026-11-02T00:00:00Z",
    sort_order: index, repository_url: null, repository_path: "", repository_branch: null,
    repository_sha: null, repository_kind: null, repository_manifest: null,
    repository_imported_at: null, access: ownerAccess(`00000000-0000-4000-8000-00000000021${index + 1}`),
}));
beforeEach(() => {
    vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear();
    vi.spyOn(api, "session").mockResolvedValue({user: {id: user, username: "tester"}, csrf_token: "test"});
    vi.spyOn(api, "projects").mockResolvedValue(projects);
    vi.spyOn(api, "catalog").mockRejectedValue(new Error("unused in navigation fixture"));
    vi.spyOn(api, "runtime").mockRejectedValue(new Error("unused in navigation fixture"));
    vi.spyOn(api, "items").mockResolvedValue([]);
});
const mount = () => render(<ProjectsThemeProvider><App /></ProjectsThemeProvider>);

it("keeps the selected project through mobile task navigation, other menus and a reload", async () => {
    window.history.replaceState(null, "", `/?project=${projects[1]!.id}&view=overview`);
    const first = mount();
    await screen.findByText("프로젝트 개요 화면");
    const bottom = screen.getByRole("navigation", {name: "모바일 주요 탐색"});
    fireEvent.click(within(bottom).getByRole("link", {name: "오늘"}));
    expect(new URLSearchParams(location.search).get("project")).toBe(projects[1]!.id);
    expect(new URLSearchParams(location.search).get("taskScope")).toBe("today");
    fireEvent.click(within(screen.getByRole("navigation", {name: "프로젝트 메뉴"})).getByRole("link", {name: "Story·요구사항"}));
    expect(new URLSearchParams(location.search).get("project")).toBe(projects[1]!.id);
    first.unmount();
    mount();
    await screen.findByText("프로젝트 Story 화면");
    expect(new URLSearchParams(location.search).get("project")).toBe(projects[1]!.id);
});

it("retains project context on the project list and returns project menus from explicit global tasks", async () => {
    window.history.replaceState(null, "", `/?project=${projects[1]!.id}&view=overview`);
    mount();
    await screen.findByText("프로젝트 개요 화면");
    fireEvent.click(screen.getByRole("link", {name: "PROJECTS · 전체 보기"}));
    expect(new URLSearchParams(location.search).get("project")).toBe(projects[1]!.id);
    fireEvent.click(screen.getByRole("link", {name: "☷ 전체 작업"}));
    await screen.findByText("전체 작업 화면");
    fireEvent.click(within(screen.getByRole("navigation", {name: "프로젝트 메뉴"})).getByRole("link", {name: "Story·요구사항"}));
    await screen.findByText("프로젝트 Story 화면");
    expect(new URLSearchParams(location.search).get("project")).toBe(projects[1]!.id);
});

it("restores the last accessible project on a bare return, and rejects stale or other-account memories", async () => {
    localStorage.setItem(`projects:last-project:${user}`, projects[1]!.id);
    localStorage.setItem("projects:last-project:someone-else", projects[0]!.id);
    window.history.replaceState(null, "", "/?view=overview");
    const first = mount();
    await waitFor(() => expect(new URLSearchParams(location.search).get("project")).toBe(projects[1]!.id));
    first.unmount();
    localStorage.setItem(`projects:last-project:${user}`, "00000000-0000-4000-8000-999999999999");
    window.history.replaceState(null, "", "/?view=overview");
    mount();
    await waitFor(() => expect(new URLSearchParams(location.search).get("project")).toBe(projects[0]!.id));
});

it("returns home through the emblem or title and clears detail filters while retaining project memory", async () => {
    window.history.replaceState(null, "", `/?project=${projects[1]!.id}&view=trace&item=old&run=old&baseline=old&q=search&savedView=old&taskStatus=blocked#old`);
    mount();
    await screen.findByText("프로젝트 추적 화면");
    const home = screen.getByRole("link", {name: "Projects 홈"});
    expect(home.getAttribute("href")).toBe("?view=projects");
    fireEvent.click(home.querySelector("img")!);
    await screen.findByRole("heading", {name: "프로젝트"});
    expect(location.search).toBe("?view=projects");
    expect(location.hash).toBe("");
    expect(localStorage.getItem(`projects:last-project:${user}`)).toBe(projects[1]!.id);
    fireEvent.click(within(screen.getByRole("navigation", {name: "프로젝트 메뉴"})).getByRole("link", {name: "Story·요구사항"}));
    await screen.findByText("프로젝트 Story 화면");
    fireEvent.click(within(home).getByText("Projects"));
    await screen.findByRole("heading", {name: "프로젝트"});
    expect(location.search).toBe("?view=projects");
});

it("renders client loading feedback before session or project responses arrive", async () => {
    vi.spyOn(api, "session").mockReturnValue(new Promise(() => {}));
    window.history.replaceState(null, "", "/?view=projects");
    const pendingSession = mount();
    expect(screen.getByRole("status").textContent).toContain("프로젝트 작업공간을 불러오는 중");
    pendingSession.unmount();
    vi.spyOn(api, "session").mockResolvedValue({user: {id: user, username: "tester"}, csrf_token: "test"});
    vi.spyOn(api, "projects").mockReturnValue(new Promise(() => {}));
    mount();
    await screen.findByText("프로젝트 목록 불러오는 중…");
    expect(screen.getByRole("link", {name: "Projects 홈"})).toBeTruthy();
});
