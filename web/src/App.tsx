import { Component, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { ReactNode } from "react";
import { restoreAcceptanceToken, clearAcceptanceToken } from "./acceptance-token";
import { Brand } from "./Brand";
import { ContentLoading, LoadingScreen } from "./LoadingScreen";
import { api, ApiError, errorMessage, setCsrf } from "./api";
import { AuthRecoveryProvider, useAuthenticationDraft, type AuthenticationDraft } from "./auth-drafts";
import { AuthenticationRecovery } from "./AuthenticationRecovery";
import { authenticationReturnPath, authenticationUrl, reauthentication } from "./reauthentication";
import { navigate, routeUrl, useResource, useRoute } from "./hooks";
import type { Session, Project, Item } from "./models";
import { Button } from "./pydemia-ui/button";
import { Card } from "./pydemia-ui/card";
import { AppBody, AppHeader, AppMain, AppShell, AppSidebar } from "./pydemia-ui/app-shell";
import { Input } from "./pydemia-ui/input";
import { NativeSelect } from "./pydemia-ui/native-select";
import { SegmentedControl, SegmentedControlItem } from "./pydemia-ui/segmented-control";
import { BottomNav, BottomNavLink, SideNav, SideNavLink } from "./pydemia-ui/navigation";
import { Textarea } from "./pydemia-ui/textarea";
import { ThemeControls } from "./theme";
import { ItemsPage } from "./ItemsPage";
import { StoriesPage } from "./StoriesPage";
import { TaskStoryProvider } from "./StoryChips";
import { PlanningDialog, PlanningDraftLauncher } from "./PlanningDialog";
import SchedulesPage from "./SchedulesPage";
import { GlobalTasks } from "./GlobalTasks";
import { TaskWorkspace } from "./TaskWorkspace";
import { RunsPage } from "./RunsPage";
import { Overview, TracePage } from "./ProjectPages";
import { GitImport } from "./GitImport";
import { GitZipImport } from "./GitZipImport";
import { ProjectOrderList } from "./ProjectOrderList";
import { PreferencesPage } from "./PreferencesPage";
import { ProjectAccessSettings, ProjectInvitationAccept, ProjectOwnershipAccept } from "./ProjectAccessSettings";
import { ProjectPermissionsProvider, ProjectAccessStatus, canProject } from "./ProjectPermissions";
import {
    ActionButton, Empty, ErrorNotice, Field, Modal, PageHead, RouteLink,
} from "./ui";

const menu = [
    ["overview", "◫", "개요"], ["stories", "✎", "Story·요구사항"],
    ["tasks", "☷", "Task"], ["documents", "▤", "임시 문서"], ["schedules", "▦", "상위 일정"],
    ["tests", "✓", "테스트"], ["trace", "⌁", "추적·변경"],
    ["runs", "↗", "스킬 작업"],
];

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() {
        if (this.state.failed) return <main className="fatal-error"><h1>화면을 표시하지 못했습니다.</h1><p>서버에 저장한 내용과 브라우저에 보관한 초안은 다시 로그인한 뒤 확인할 수 있습니다.</p><ActionButton onClick={() => window.location.reload()}>앱 새로고침</ActionButton></main>;
        return this.props.children;
    }
}

export default function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [generation, setGeneration] = useState(0);
    const sessionRef = useRef<Session | null>(null);
    function signedIn(data: Session) {
        if (new URL(window.location.href).searchParams.get("view") === "login") {
            window.history.replaceState(null, "", authenticationReturnPath(window.location));
            window.dispatchEvent(new PopStateEvent("popstate"));
        }
        restoreAcceptanceToken();
        sessionRef.current = data;
        reauthentication.configure({mode: data.auth_mode ?? "password", userId: data.user.id});
        setCsrf(data.csrf_token); setSession(data); setError("");
    }
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setError("");
        api.session(controller.signal).then(data => {
            if (controller.signal.aborted) return;
            signedIn(data);
        }).catch((error: unknown) => {
            if (controller.signal.aborted) return;
            setSession(null);
            sessionRef.current = null;
            reauthentication.configure(null);
            if (!(error instanceof ApiError && error.status === 401)) setError(errorMessage(error));
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [generation]);
    useEffect(() => {
        const expired = () => {
            if (!sessionRef.current) return;
            setCsrf("");
            reauthentication.required();
        };
        window.addEventListener("projects:unauthorized", expired);
        return () => window.removeEventListener("projects:unauthorized", expired);
    }, []);
    useEffect(() => {
        setCsrf(session?.csrf_token ?? "");
    }, [session, setCsrf]);
    return <AppErrorBoundary>{loading ? <LoadingScreen /> : session ? <AuthRecoveryProvider key={session.user.id} userId={session.user.id}><Workbench key={session.user.id} session={session} onLogout={() => {
        sessionRef.current = null; reauthentication.configure(null); setCsrf(""); setSession(null);
    }} /><AuthenticationRecovery /></AuthRecoveryProvider> : <AuthPage onSignedIn={signedIn} sessionError={error} retrySession={() => setGeneration(value => value + 1)} />}</AppErrorBoundary>;
}

function AuthPage({ onSignedIn, sessionError, retrySession }: {
    onSignedIn: (session: Session) => void; sessionError: string;
    retrySession: () => void;
}) {
    const [mode, setMode] = useState<"login" | "register">("login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const health = useResource("health", signal => api.health(signal));
    const authOptions = useResource("auth-options", signal => api.authOptions(signal));
    const registrationEnabled = authOptions.status === "ready" && authOptions.data.registration_enabled;
    const microsoftLogin = authOptions.status === "ready" && authOptions.data.auth_mode === "microsoft";
    const returning = new URL(window.location.href).searchParams.get("view") === "login";
    const loginUrl = authenticationUrl("microsoft", authenticationReturnPath(window.location), window.location.origin);
    async function submit(event: React.FormEvent) {
        event.preventDefault(); setBusy(true); setError("");
        try { onSignedIn(await api.auth(mode, { username: username.trim(), password })); setPassword(""); }
        catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    return <main className="auth-page"><header className="auth-header"><Brand /><div className="auth-theme"><ThemeControls /></div></header><div className="auth-intro"><div className="eyebrow">YOUR PROJECT WORKSPACE</div><h1>아이디어부터<br />실행의 근거까지.</h1><p>메모, 요건, 스킬 작업과 검증 기록을 한 프로젝트에서 이어갑니다.</p></div>
        <Card className="auth-form">{!microsoftLogin && registrationEnabled && <SegmentedControl label="계정 작업" name="auth-mode" value={mode} onValueChange={value => { setMode(value as "login" | "register"); setError(""); }}>
            <SegmentedControlItem value="login">로그인</SegmentedControlItem><SegmentedControlItem value="register">계정 만들기</SegmentedControlItem>
        </SegmentedControl>}
            {microsoftLogin && <p className="muted">허용된 Microsoft 조직 계정으로 로그인합니다.</p>}
            {microsoftLogin && /(?:invitationToken|ownershipToken)=/.test(window.location.hash) && <p className="notice">수락 링크를 로그인 뒤 복원합니다. 복원되지 않으면 전달받은 원래 링크를 다시 열어 주세요.</p>}
            {authOptions.status === "ready" && !registrationEnabled && !microsoftLogin && <p className="muted">개인 작업공간입니다. 발급된 계정으로 로그인해 주세요.</p>}
            <h2>{mode === "login" ? returning ? "다시 로그인" : "작업공간으로 돌아가기" : "개인 작업공간 시작하기"}</h2>
            {returning && <p className="muted">로그인이 만료되었습니다. 로그인하면 보던 화면으로 돌아갑니다.</p>}
            {microsoftLogin ? <a className="primary full-width" href={loginUrl}>Microsoft 계정으로 로그인</a> : <form onSubmit={event => { void submit(event); }}><Field label="사용자 이름" hint={mode === "register" ? "3~80자 · 문자, 숫자, 밑줄, 점, 하이픈을 사용할 수 있습니다." : undefined}><Input required minLength={3} maxLength={80} autoFocus autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} /></Field><Field label="비밀번호" hint={mode === "register" ? "12자 이상으로 설정해 주세요." : undefined}><Input required type="password" minLength={mode === "register" ? 12 : 1} maxLength={256} autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} /></Field>
                {error && <ErrorNotice error={error} />}
                <Button className="primary full-width" type="submit" disabled={busy}>{busy ? "서버 확인 중…" : mode === "login" ? "로그인" : "계정 만들기"}</Button></form>}
            {sessionError && <ErrorNotice error={sessionError} retry={retrySession} />}
            <p className="auth-health">{health.status === "loading" ? "API 연결 확인 중…" : health.status === "ready" ? "API 서버 연결됨" : "API 서버에 연결되지 않았습니다."}{health.status === "error" && <ActionButton className="linkbtn" onClick={health.reload}>다시 확인</ActionButton>}</p>
        </Card>
    </main>;
}

const projectPickerDraftSchema = z.object({open: z.literal(true)}).strict();
function Workbench({ session, onLogout }: { session: Session; onLogout: () => void }) {
    const route = useRoute();
    const projects = useResource("projects", async signal => {
        const data = await api.projects(signal);
        await reauthentication.captureDrafts().catch(() => false);
        return data;
    });
    const catalog = useResource("catalog", signal => api.catalog(signal));
    const runtime = useResource("runtime", signal => api.runtime(signal));
    const [revision, setRevision] = useState(0);
    const [createOpen, setCreateOpen] = useState(false);
    const [error, setError] = useState("");
    const [logoutBusy, setLogoutBusy] = useState(false);
    const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
    const pickerRecovery: AuthenticationDraft<z.infer<typeof projectPickerDraftSchema>> = useAuthenticationDraft("project:mobile-picker", projectPickerDraftSchema,
        () => mobileProjectsOpen ? {open: true} : null);
    const [mobileProjectsOpen, setMobileProjectsOpen] = useState(!!pickerRecovery.restored);
    function closeMobileProjects() {setMobileProjectsOpen(false); pickerRecovery.clear();}
    const [orderedProjects, setOrderedProjects] = useState<Project[] | null>(null);
    const [orderingProjects, setOrderingProjects] = useState(false);
    const projectMemoryKey = `projects:last-project:${session.user.id}`;
    const [lastProjectId, setLastProjectId] = useState(() => {
        try { return localStorage.getItem(projectMemoryKey) ?? ""; }
        catch { return ""; }
    });
    const mobileMoreTrigger = useRef<HTMLButtonElement>(null);
    function closeMobileMore() {
        setMobileMoreOpen(false);
        window.requestAnimationFrame(() => mobileMoreTrigger.current?.focus());
    }
    const projectRows = projects.status === "ready" ? (orderedProjects ?? projects.data).filter(project => canProject(project, "project.read")) : [];
    const selected = projectRows.find(project => project.id === route.project);
    const previouslySelectedProject = useRef<string | null>(null);
    const contextProject = selected ?? projectRows.find(project => project.id === lastProjectId);
    useEffect(() => { setOrderedProjects(null); }, [projects.status, projects.data]);
    useEffect(() => {
        if (!selected) return;
        setLastProjectId(selected.id);
        try { localStorage.setItem(projectMemoryKey, selected.id); }
        catch { /* The current URL remains the active project context. */ }
    }, [selected?.id, projectMemoryKey]);
    useEffect(() => {
        if (projects.status === "ready" && route.view === "tasks" && !route.project && route.taskProject && projects.data.some(project => project.id === route.taskProject)) {
            navigate({...route, project: route.taskProject, taskProject: ""}, true);
            return;
        }
        if (projects.status === "ready" && !route.project && !["projects", "tasks", "settings", "project-invitation", "ownership-accept"].includes(route.view) && projects.data.length) {
            navigate({ project: contextProject?.id ?? projects.data[0]!.id, item: "", run: "", baseline: "" }, true);
        }
    }, [projects.status, projects.data, route.project, route.view, route.taskProject, contextProject?.id]);
    async function reorderProjects(ids: string[]) {
        if (orderingProjects || projects.status !== "ready") return;
        const byId = new Map(projectRows.map(project => [project.id, project]));
        if (ids.length !== projectRows.length || ids.some(id => !byId.has(id))) return;
        setOrderedProjects(ids.map(id => byId.get(id)!));
        setOrderingProjects(true); setError("");
        try { setOrderedProjects(await api.reorderProjects(ids)); projects.reload(); }
        catch (cause) { setOrderedProjects(null); setError(errorMessage(cause)); projects.reload(); }
        finally { setOrderingProjects(false); }
    }
    function projectRenamed(updated: Project) {
        setOrderedProjects(projectRows.map(project => project.id === updated.id ? updated : project));
        projects.reload();
    }
    useEffect(() => {
        let stopped = false;
        let refreshing = false;
        let lastRefresh = 0;
        const refresh = async () => {
            if (stopped || refreshing || document.visibilityState === "hidden" || Date.now() - lastRefresh < 1000) return;
            refreshing = true; lastRefresh = Date.now();
            await reauthentication.captureDrafts().catch(() => false);
            if (!stopped) projects.reload();
            refreshing = false;
        };
        const changed = () => { void refresh(); };
        window.addEventListener("focus", changed);
        window.addEventListener("projects:access-changed", changed);
        document.addEventListener("visibilitychange", changed);
        const timer = window.setInterval(changed, 15_000);
        return () => {stopped = true; window.clearInterval(timer); window.removeEventListener("focus", changed); window.removeEventListener("projects:access-changed", changed); document.removeEventListener("visibilitychange", changed);};
    }, [projects.reload]);
    useEffect(() => {
        if (selected) {previouslySelectedProject.current = selected.id; return;}
        if (projects.status !== "ready" || !route.project || previouslySelectedProject.current !== route.project || route.view === "ownership-accept") return;
        previouslySelectedProject.current = null;
        setLastProjectId("");
        try {localStorage.removeItem(projectMemoryKey);} catch { /* URL remains authoritative. */ }
        navigate({project: "", view: "projects", item: "", run: "", baseline: "", savedView: ""}, true);
    }, [projects.status, projects.data, route.project, route.view, selected, projectMemoryKey]);
    const title = route.view === "project-settings" ? "멤버·권한" : route.view === "settings" ? "설정" : route.view === "projects" ? "프로젝트 목록" : route.view === "tasks" && !route.project ? "전체 작업" : menu.find(([view]) => view === route.view)?.[2] ?? "개요";
    const projectLabel = selected?.name ?? (projects.status === "loading" && route.project ? "프로젝트 불러오는 중…" : route.view === "tasks" && !route.project ? "전체 프로젝트" : "프로젝트 목록");
    const mobileDestination = route.view !== "tasks" ? "more"
        : (route.taskScope === "inbox" || route.taskView === "inbox") ? "inbox"
            : (route.taskScope === "today" || route.taskView === "today") ? "today" : "work";
    const mobileRoutes = [
        { id: "today", label: "오늘", icon: "◷", patch: {view: "tasks", taskScope: "today", item: "", run: ""} },
        { id: "inbox", label: "Inbox", icon: "▤", patch: {view: "tasks", taskScope: "inbox", item: "", run: ""} },
        { id: "work", label: "작업", icon: "☷", patch: {view: "tasks", taskScope: "all", item: "", run: ""} },
    ];
    async function logout() {
        setLogoutBusy(true); setError("");
        try {
            const result = await api.logout();
            clearAcceptanceToken();
            for (const key of Object.keys(sessionStorage)) if (key.startsWith(`projects:task-view-memory:${session.user.id}:`)) sessionStorage.removeItem(key);
            try { localStorage.removeItem(projectMemoryKey); } catch { /* No remembered project when storage is unavailable. */ }
            if (result.auth_mode === "microsoft") {
                window.location.assign("/oauth2/sign_out");
                return;
            }
            onLogout();
        }
        catch (error) { setError(errorMessage(error)); }
        finally { setLogoutBusy(false); }
    }
    return <ProjectPermissionsProvider projects={projectRows}><AppShell appearance="canvas" className="shell"><a href="#main" className="skip-link">본문으로 이동</a>
        <AppBody className="workspace-body"><AppSidebar className="sidebar" aria-label="프로젝트 탐색"><div><Brand clientNavigation /><div className="workspace">개인 작업공간</div></div>
            <div className="project-nav"><RouteLink className="my-tasks-nav" current={!route.project && route.view === "tasks"} patch={{project: "", view: "tasks", taskScope: "all", item: ""}}>☷ 전체 작업</RouteLink><RouteLink className="side-label project-list-link" patch={{ view: "projects", item: "", run: "", baseline: "", q: "" }}>PROJECTS · 전체 보기</RouteLink>
                {projectRows.length > 0 && <ProjectOrderList projects={projectRows} currentId={route.project} onRenamed={projectRenamed} compact busy={orderingProjects} onReorder={reorderProjects} recoverySurface="sidebar" />}
                <ActionButton className="linkbtn small new-project" onClick={() => setCreateOpen(true)}>+ 프로젝트 만들기</ActionButton>
                <SideNav className="nav" aria-label="프로젝트 메뉴">{menu.map(([view, icon, label]) => {
                    const patch = { project: contextProject?.id ?? projectRows[0]?.id ?? "", view, item: "", run: "", q: view === "tasks" ? undefined : "", kind: "" };
                    return <SideNavLink key={view} variant="filled" href={routeUrl(patch)} aria-current={route.view === view && !!route.project ? "page" : undefined}
                        onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) { event.preventDefault(); navigate(patch); } }}>
                        <span className="nav-icon" aria-hidden="true">{icon}</span>{label}</SideNavLink>;
                })}</SideNav>
            </div><div className="sidebar-bottom"><span className="avatar" aria-hidden="true">{session.user.username.slice(0, 2).toUpperCase()}</span><strong>{session.user.username}</strong><p className="muted small">개인 모드</p><RouteLink className="button small preferences-link" patch={{view: "settings", item: "", run: ""}}>설정·환경설정</RouteLink><ActionButton className="small" disabled={logoutBusy} onClick={() => { void logout(); }}>{logoutBusy ? "처리 중…" : "로그아웃"}</ActionButton></div>
        </AppSidebar>
        <div className="workspace-main"><AppHeader className="topbar"><div className="crumb"><RouteLink patch={{ view: "projects", item: "", run: "", baseline: "" }}>프로젝트</RouteLink>{selected && route.view !== "projects" && <><span>/</span><strong>{selected.name}</strong><span>/</span><span>{title}</span></>}</div><div className="mobile-topbar"><Button variant="ghost" className="mobile-project-button" aria-label="프로젝트 목록 열기" aria-haspopup="dialog" aria-expanded={mobileProjectsOpen} onClick={() => setMobileProjectsOpen(true)}><span className="mobile-project-name">{projectLabel}</span><span aria-hidden="true">⌄</span></Button><strong>{title}</strong>{route.view !== "settings" && <RouteLink className="mobile-settings-link" patch={{view: "settings", item: "", run: ""}}>설정</RouteLink>}</div><div className="actions desktop-topbar-actions">
            <RouteLink className="button small preferences-link" patch={{view: "settings", item: "", run: ""}}>설정</RouteLink>
            <ActionButton className="mobile-logout small" disabled={logoutBusy} onClick={() => { void logout(); }}>로그아웃</ActionButton>
        </div></AppHeader>
            <AppMain id="main" className="page" tabIndex={-1}>
                {error && <ErrorNotice error={error} />}
                {projects.status === "loading" && <ContentLoading label="프로젝트 목록 불러오는 중…" />}
                {projects.status === "error" && <ErrorNotice error={projects.error} retry={projects.reload} />}
                {projects.status === "ready" && (route.view === "project-invitation" ? <ProjectInvitationAccept invitationId={route.invitationId ?? ""} token={new URLSearchParams(window.location.hash.slice(1)).get("invitationToken") ?? ""} expectedRevision={Number(route.expectedRevision)} onAccepted={projectId => {clearAcceptanceToken(); projects.reload(); window.history.replaceState(null, "", window.location.pathname + window.location.search); navigate({project: projectId, view: "overview", invitationId: "", expectedRevision: ""});}} /> : route.view === "ownership-accept" ? <ProjectOwnershipAccept projectId={route.project} transferId={route.ownershipId ?? ""} token={new URLSearchParams(window.location.hash.slice(1)).get("ownershipToken") ?? ""} expectedRevision={Number(route.expectedRevision)} onAccepted={projectId => {clearAcceptanceToken(); projects.reload(); navigate({project: projectId, view: "project-settings", ownershipId: "", expectedRevision: ""});}} /> : route.view === "project-settings" && selected ? <ProjectAccessSettings project={selected} userId={session.user.id} onChanged={projects.reload} /> : route.view === "settings" ? <PreferencesPage username={session.user.username} runtimeConfigured={runtime.status === "ready" ? runtime.data.configured : undefined} onLogout={() => { void logout(); }} logoutBusy={logoutBusy} /> : route.view === "tasks" && !route.project ? <GlobalTasks userId={session.user.id} route={route} catalog={catalog.status === "ready" ? catalog.data : undefined} /> : route.view === "projects" || !route.project ? <ProjectsList projects={projectRows} currentId={route.project} onRenamed={projectRenamed} ordering={orderingProjects} onReorder={reorderProjects} onCreate={() => setCreateOpen(true)} onImported={project => { projects.reload(); navigate({ project: project.id, view: "overview", item: "", run: "", baseline: "", q: "" }); }} /> : selected ? <ProjectWorkspace project={selected} onProjectRenamed={projectRenamed} userId={session.user.id} revision={revision} onChanged={() => setRevision(value => value + 1)} catalog={catalog} runtime={runtime} /> : <Empty title="프로젝트를 찾을 수 없습니다."><p>프로젝트가 존재하지 않거나 이 계정의 접근 범위에 없습니다.</p><RouteLink patch={{ project: "", view: "projects", item: "" }}>프로젝트 목록으로</RouteLink></Empty>)}
            </AppMain>
        </div><BottomNav className="mobile-bottom-nav" aria-label="모바일 주요 탐색">
            {mobileRoutes.map(({ id, label, icon, patch }) => <BottomNavLink key={id} href={routeUrl(patch)} label={label} icon={icon}
                aria-current={mobileDestination === id ? "page" : undefined}

                onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) { event.preventDefault(); navigate(patch); } }} />)}
            <Button ref={mobileMoreTrigger} variant="ghost" type="button" className="mobile-more-trigger" aria-current={mobileDestination === "more" ? "page" : undefined}
                aria-haspopup="dialog" aria-expanded={mobileMoreOpen} onClick={() => setMobileMoreOpen(true)}><span aria-hidden="true">☰</span><span>더보기</span></Button>
        </BottomNav>
        </AppBody>{mobileProjectsOpen && <Modal title="프로젝트 목록" className="mobile-project-dialog" onClose={closeMobileProjects}>
            <p className="muted small">프로젝트를 고르거나 순서를 바꿀 수 있습니다.</p>
            {error && <ErrorNotice error={error} />}
            <ProjectOrderList projects={projectRows} currentId={route.project} onRenamed={projectRenamed} compact busy={orderingProjects} onReorder={reorderProjects} onSelect={closeMobileProjects} recoverySurface="mobile-picker" />
            <div className="mobile-project-actions"><RouteLink patch={{ view: "projects", item: "", run: "", baseline: "" }} onNavigate={closeMobileProjects}>전체 보기·순서 변경</RouteLink><ActionButton onClick={() => { closeMobileProjects(); setCreateOpen(true); }}>+ 프로젝트 만들기</ActionButton></div>
        </Modal>}{mobileMoreOpen && <Modal title="더보기" className="mobile-more-dialog" onClose={closeMobileMore}>
            <p className="muted small">{selected ? `${selected.name} · 업무 영역` : "프로젝트를 선택하거나 새로 만드세요."}</p>
            <SideNav aria-label="다른 업무 화면" className="mobile-more-links" onClick={closeMobileMore}>
                {menu.filter(([view]) => view !== "tasks").map(([view, icon, label]) => <RouteLink key={view} appearance="side" patch={{ project: contextProject?.id ?? projectRows[0]?.id ?? "", view, item: "", run: "", q: "", kind: "" }} className="mobile-more-link"><span aria-hidden="true">{icon}</span>{label}</RouteLink>)}
            </SideNav>
            <div className="mobile-more-settings"><RouteLink className="button preferences-link" patch={{view: "settings", item: "", run: ""}} onNavigate={closeMobileMore}>설정·환경설정</RouteLink>
                {runtime.status === "ready" && <p className="muted small">{runtime.data.configured ? "LLM 연결 설정됨" : "LLM 미설정"}</p>}
                <ActionButton className="small" disabled={logoutBusy} onClick={() => { void logout(); }}>{logoutBusy ? "처리 중…" : "로그아웃"}</ActionButton>
            </div>
        </Modal>}<CreateProject open={createOpen} onClose={() => setCreateOpen(false)} onCreated={project => { setCreateOpen(false); projects.reload(); navigate({ project: project.id, view: "overview", plan: "choose", item: "", run: "", baseline: "", q: "" }); }} />
    </AppShell></ProjectPermissionsProvider>;
}

function ProjectWorkspace({ project, userId, revision, onChanged, catalog, runtime, onProjectRenamed }: {
    project: Project; userId: string; revision: number; onChanged: () => void;
    catalog: ReturnType<typeof useResource<Awaited<ReturnType<typeof api.catalog>>>>;
    runtime: ReturnType<typeof useResource<Awaited<ReturnType<typeof api.runtime>>>>;
    onProjectRenamed?: (project: Project) => void;
}) {
    const route = useRoute();
    const resource = useResource(`items:${project.id}:${revision}`, signal => api.items(project.id, signal));
    const previousItems = useRef<{projectId: string; items: Item[]} | null>(null);
    if (resource.status === "ready") previousItems.current = {projectId: project.id, items: resource.data};
    const cached = previousItems.current?.projectId === project.id ? previousItems.current.items : null;
    if (resource.status === "loading" && !cached) return <ContentLoading label="프로젝트 내용 불러오는 중…" />;
    if (resource.status === "error") return <ErrorNotice error={resource.error} retry={resource.reload} />;
    const items = {data: resource.status === "ready" ? resource.data : cached!};
    return <TaskStoryProvider projectId={project.id} items={items.data} revision={revision}>
        <ProjectAccessStatus project={project} />
        <div className="project-planning-toolbar"><PlanningDraftLauncher key={project.id} project={project} contextItem={items.data.find(entry => entry.id === route.item)} onApplied={onChanged} /></div>
        {route.plan === "choose" && <Modal title="프로젝트가 준비되었습니다" onClose={() => navigate({plan: ""})}>
            <p>{project.name}에서 Story와 Task를 기획하거나, 할 일부터 바로 추가할 수 있습니다.</p>
            <div className="form-actions"><ActionButton className="primary" onClick={() => navigate({plan: "initial"})}>지금 기획하기</ActionButton><ActionButton onClick={() => navigate({view: "tasks", plan: "", item: ""})}>작업부터 시작</ActionButton></div>
        </Modal>}
        {(route.plan === "initial" || route.plan === "incremental") && <PlanningDialog project={project} mode={route.plan} draftId={route.planningDraft || undefined} contextItem={items.data.find(entry => entry.id === route.item)} onClose={() => navigate({plan: "", planningDraft: ""})} onApplied={() => {onChanged(); navigate({plan: "", planningDraft: ""});}} />}

        {catalog.status === "error" && (route.view === "documents" || route.view === "runs") && <ErrorNotice error={`문서 종류·참조 목록을 읽지 못했습니다. ${catalog.error}`} retry={catalog.reload} />}
        {route.view === "stories" || route.view === "planning" && route.kind === "requirement" ? <StoriesPage key={project.id} projectId={project.id} userId={userId} route={route} items={items.data} onChanged={onChanged} onPlan={item => navigate({plan: "incremental", item: item?.id ?? ""})} /> : route.view === "schedules" ? <SchedulesPage projectId={project.id} /> : route.view === "overview" ? <Overview project={project} items={items.data} revision={revision} onProjectRenamed={onProjectRenamed} /> : route.view === "trace" ? <TracePage projectId={project.id} items={items.data} baselineId={route.baseline} revision={revision} onChanged={onChanged} /> : route.view === "runs" ? <RunsPage projectId={project.id} userId={userId} route={route} items={items.data} catalog={catalog.status === "ready" ? catalog.data : undefined} runtime={runtime} onRuntimeReload={runtime.reload} onChanged={onChanged} /> : route.view === "tasks" ? <TaskWorkspace projectId={project.id} userId={userId} route={route} items={items.data} catalog={catalog.status === "ready" ? catalog.data : undefined} onChanged={onChanged} /> : ["planning", "materials", "documents", "tests"].includes(route.view) ? <ItemsPage projectId={project.id} userId={userId} route={route} items={items.data} catalog={catalog.status === "ready" ? catalog.data : undefined} onChanged={onChanged} /> : <Empty title="이 화면을 찾을 수 없습니다."><RouteLink patch={{ view: "overview" }}>개요로 이동</RouteLink></Empty>}
        <footer className="footer-note">Projects · 개인 작업공간 · 임시 문서 저장소는 Note 연계 예정</footer>
    </TaskStoryProvider>;
}

const createProjectDraftSchema = z.object({name: z.string(), goal: z.string(), profile: z.enum(["simple", "standard"])}).strict();
function CreateProject({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (project: Project) => void }) {
    const recovery: AuthenticationDraft<z.infer<typeof createProjectDraftSchema>> = useAuthenticationDraft("project:creation", createProjectDraftSchema,
        () => open || recovery.restored ? {name, goal, profile} : null);
    const [name, setName] = useState(recovery.restored?.name ?? "");
    const [goal, setGoal] = useState(recovery.restored?.goal ?? "");
    const [profile, setProfile] = useState<"simple" | "standard">(recovery.restored?.profile ?? "simple");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function create(event: React.FormEvent) {
        event.preventDefault(); setBusy(true); setError("");
        try { const project = await api.createProject({ name: name.trim(), goal, profile }); recovery.clear(); setName(""); setGoal(""); setProfile("simple"); onCreated(project); }
        catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    function close() {recovery.clear(); setName(""); setGoal(""); setProfile("simple"); onClose();}
    if (!open && !recovery.restored) return null;
    return <Modal title="프로젝트 만들기" onClose={close}><form onSubmit={event => { void create(event); }}>
        <Field label="프로젝트 이름"><Input required autoFocus maxLength={200} value={name} onChange={event => setName(event.target.value)} /></Field>
        <details><summary>목표·작업 방식 추가</summary><Field label="목표"><Textarea rows={4} value={goal} onChange={event => setGoal(event.target.value)} placeholder="이 프로젝트로 해결할 문제와 만들 결과를 적어 주세요." /></Field>
        <Field label="프로필"><NativeSelect value={profile} onChange={event => {if (event.target.value === "simple" || event.target.value === "standard") setProfile(event.target.value);}}><option value="simple">간편 · 개인 아이디어부터 시작</option><option value="standard">표준 · 기획·설계·검증 근거 함께 관리</option></NativeSelect></Field>
        </details><p className="hint">이름만 입력하면 시작할 수 있습니다. 기획과 세부 설정은 나중에 이어가세요.</p>
        {error && <ErrorNotice error={error} />}
        <div className="form-actions"><Button variant="outline" type="button" onClick={close}>취소</Button><Button className="primary" type="submit" disabled={busy || !name.trim()}>{busy ? "만드는 중…" : "프로젝트 만들기"}</Button></div>
    </form></Modal>;
}

function ProjectsList({ projects, currentId, ordering, onReorder, onCreate, onImported, onRenamed }: {
    projects: Project[]; currentId: string; ordering: boolean;
    onReorder: (ids: string[]) => Promise<void>;
    onCreate: () => void; onImported: (project: Project) => void;
    onRenamed?: (project: Project) => void;
}) {
    const [importOpen, setImportOpen] = useState(false);
    const [gitOpen, setGitOpen] = useState(false);
    const [gitZipOpen, setGitZipOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function importFile(event: React.FormEvent) {
        event.preventDefault(); if (!file) return;
        setBusy(true); setError("");
        try {
            if (file.size > 8_000_000) throw new Error("ZIP 파일은 8 MB 이하여야 합니다.");
            const bytes = new Uint8Array(await file.arrayBuffer());
            let binary = "";
            for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
            const project = await api.importProject(btoa(binary));
            setImportOpen(false); onImported(project);
        } catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    return <>
        <PageHead title="프로젝트" description="이어갈 일을 고르거나, 새로운 아이디어를 프로젝트로 시작하세요." eyebrow="YOUR WORKSPACE"><ActionButton onClick={() => setImportOpen(true)}>백업 ZIP 복원</ActionButton><ActionButton className="git-source-action" onClick={() => setGitOpen(true)}>원격 GitHub에서 만들기</ActionButton><ActionButton onClick={() => setGitZipOpen(true)}>Git ZIP에서 만들기</ActionButton><ActionButton className="primary" onClick={onCreate}>+ 프로젝트 만들기</ActionButton></PageHead>
        {projects.length ? <section className="project-list-section"><p className="muted small">위에서 아래 순서로 표시됩니다. 손잡이를 끌거나 위·아래 버튼으로 순서를 바꾸세요.</p><ProjectOrderList projects={projects} currentId={currentId} onRenamed={onRenamed} busy={ordering} onReorder={onReorder} recoverySurface="main" /></section> : <Empty title="처음 시작하는 프로젝트"><p>원문 아이디어를 남기고, 스킬로 문서와 실행 계획을 구체화해 보세요.</p><ActionButton className="primary" onClick={onCreate}>프로젝트 만들기</ActionButton></Empty>}
        {importOpen && <Modal title="Projects 백업 ZIP 복원" onClose={() => setImportOpen(false)}><form onSubmit={event => { void importFile(event); }}><p>Projects에서 저장한 백업 ZIP을 선택해 주세요. 기존 프로젝트의 항목과 관계를 복원합니다. Git 소스 ZIP은 별도의 만들기 기능을 사용해 주세요.</p><Field label="Projects 백업 ZIP · 최대 8 MB"><Input type="file" required accept=".zip,application/zip" onChange={event => setFile(event.target.files?.[0] ?? null)} /></Field>{error && <ErrorNotice error={error} />}<div className="form-actions"><ActionButton type="button" onClick={() => setImportOpen(false)}>닫기</ActionButton><ActionButton className="primary" type="submit" disabled={busy || !file}>{busy ? "검사·복원 중…" : "백업 검사 후 복원"}</ActionButton></div></form></Modal>}
        {gitOpen && <GitImport onClose={() => setGitOpen(false)} onCreated={project => { setGitOpen(false); onImported(project); }} />}
        {gitZipOpen && <GitZipImport onClose={() => setGitZipOpen(false)} onCreated={project => { setGitZipOpen(false); onImported(project); }} />}
    </>;
}
