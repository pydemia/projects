import { Component, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError, downloadArchive, errorMessage, setCsrf } from "./api";
import { navigate, routeUrl, useResource, useRoute } from "./hooks";
import type { Session, Project } from "./models";
import { dateLabel } from "./models";
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
import { TaskWorkspace } from "./TaskWorkspace";
import { RunsPage } from "./RunsPage";
import { Overview, TracePage } from "./ProjectPages";
import { GitImport } from "./GitImport";
import { GitZipImport } from "./GitZipImport";
import {
    ActionButton, Empty, ErrorNotice, Field, Loading, Modal, PageHead, RouteLink,
} from "./ui";

const menu = [
    ["overview", "◫", "개요"], ["planning", "✎", "기획"],
    ["documents", "▤", "임시 문서"], ["tasks", "☷", "작업"],
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
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setError("");
        api.session(controller.signal).then(data => {
            if (controller.signal.aborted) return;
            setCsrf(data.csrf_token); setSession(data);
        }).catch((error: unknown) => {
            if (controller.signal.aborted) return;
            setSession(null);
            if (!(error instanceof ApiError && error.status === 401)) setError(errorMessage(error));
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [generation]);
    useEffect(() => {
        const expired = () => { setCsrf(""); setSession(null); };
        window.addEventListener("projects:unauthorized", expired);
        return () => window.removeEventListener("projects:unauthorized", expired);
    }, []);
    useEffect(() => {
        setCsrf(session?.csrf_token ?? "");
    }, [session, setCsrf]);
    function signedIn(data: Session) { setCsrf(data.csrf_token); setSession(data); setError(""); }
    return <AppErrorBoundary>{loading ? <main className="auth-page"><Brand /><Loading label="로그인 상태 확인 중…" /></main> : session ? <Workbench key={session.user.id} session={session} onLogout={() => { setCsrf(""); setSession(null); }} /> : <AuthPage onSignedIn={signedIn} sessionError={error} retrySession={() => setGeneration(value => value + 1)} />}</AppErrorBoundary>;
}

function Brand() {
    return <div className="brand"><img className="brandmark" src="/favicon.svg" alt="" aria-hidden="true" /><span>Projects</span></div>;
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
    async function submit(event: React.FormEvent) {
        event.preventDefault(); setBusy(true); setError("");
        try { onSignedIn(await api.auth(mode, { username: username.trim(), password })); setPassword(""); }
        catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    return <main className="auth-page"><Brand /><div className="auth-theme"><ThemeControls /></div><div className="auth-intro"><div className="eyebrow">YOUR PROJECT WORKSPACE</div><h1>아이디어부터<br />실행의 근거까지.</h1><p>메모, 요건, 스킬 작업과 검증 기록을 한 프로젝트에서 이어갑니다.</p></div>
        <Card className="auth-form">{!microsoftLogin && registrationEnabled && <SegmentedControl label="계정 작업" name="auth-mode" value={mode} onValueChange={value => { setMode(value as "login" | "register"); setError(""); }}>
            <SegmentedControlItem value="login">로그인</SegmentedControlItem><SegmentedControlItem value="register">계정 만들기</SegmentedControlItem>
        </SegmentedControl>}
            {microsoftLogin && <p className="muted">pydemia@pydemia.ai Microsoft 계정으로 로그인합니다.</p>}
            {authOptions.status === "ready" && !registrationEnabled && !microsoftLogin && <p className="muted">개인 작업공간입니다. 발급된 계정으로 로그인해 주세요.</p>}
            <h2>{mode === "login" ? "작업공간으로 돌아가기" : "개인 작업공간 시작하기"}</h2>
            {microsoftLogin ? <a className="primary full-width" href="/oauth2/start?rd=%2F">Microsoft 계정으로 로그인</a> : <form onSubmit={event => { void submit(event); }}><Field label="사용자 이름" hint={mode === "register" ? "3~80자 · 문자, 숫자, 밑줄, 점, 하이픈을 사용할 수 있습니다." : undefined}><Input required minLength={3} maxLength={80} autoFocus autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} /></Field><Field label="비밀번호" hint={mode === "register" ? "12자 이상으로 설정해 주세요." : undefined}><Input required type="password" minLength={mode === "register" ? 12 : 1} maxLength={256} autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} /></Field>
                {error && <ErrorNotice error={error} />}
                <Button className="primary full-width" type="submit" disabled={busy}>{busy ? "서버 확인 중…" : mode === "login" ? "로그인" : "계정 만들기"}</Button></form>}
            {sessionError && <ErrorNotice error={sessionError} retry={retrySession} />}
            <p className="auth-health">{health.status === "loading" ? "API 연결 확인 중…" : health.status === "ready" ? "API 서버 연결됨" : "API 서버에 연결되지 않았습니다."}{health.status === "error" && <ActionButton className="linkbtn" onClick={health.reload}>다시 확인</ActionButton>}</p>
        </Card>
    </main>;
}

function Workbench({ session, onLogout }: { session: Session; onLogout: () => void }) {
    const route = useRoute();
    const projects = useResource("projects", signal => api.projects(signal));
    const catalog = useResource("catalog", signal => api.catalog(signal));
    const runtime = useResource("runtime", signal => api.runtime(signal));
    const [revision, setRevision] = useState(0);
    const [createOpen, setCreateOpen] = useState(false);
    const [exportBusy, setExportBusy] = useState(false);
    const [error, setError] = useState("");
    const [logoutBusy, setLogoutBusy] = useState(false);
    const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
    const mobileMoreTrigger = useRef<HTMLButtonElement>(null);
    function closeMobileMore() {
        setMobileMoreOpen(false);
        window.requestAnimationFrame(() => mobileMoreTrigger.current?.focus());
    }
    const selected = projects.status === "ready" ? projects.data.find(project => project.id === route.project) : undefined;
    const title = menu.find(([view]) => view === route.view)?.[2] ?? "개요";
    const mobileDestination = route.view !== "tasks" ? "more"
        : route.taskMode !== "complex" && route.taskView === "inbox" ? "inbox"
            : route.taskMode !== "complex" && (!route.taskView || route.taskView === "today") ? "today" : "work";
    const mobileRoutes = [
        { id: "today", label: "오늘", icon: "◷", patch: { view: "tasks", taskMode: "simple", taskView: "today", item: "", run: "", kind: "", q: "", savedView: "" } },
        { id: "inbox", label: "Inbox", icon: "▤", patch: { view: "tasks", taskMode: "simple", taskView: "inbox", item: "", run: "", kind: "", q: "", savedView: "" } },
        { id: "work", label: "작업", icon: "☷", patch: { view: "tasks", taskMode: "complex", taskView: "list", item: "", run: "", kind: "", q: "", savedView: "" } },
    ];
    async function logout() {
        setLogoutBusy(true); setError("");
        try {
            const result = await api.logout();
            if (result.auth_mode === "microsoft") {
                window.location.assign("/oauth2/sign_out");
                return;
            }
            onLogout();
        }
        catch (error) { setError(errorMessage(error)); }
        finally { setLogoutBusy(false); }
    }
    async function exportProject() {
        if (!selected) return;
        setExportBusy(true); setError("");
        try { await downloadArchive(`/api/projects/${selected.id}/export`, `${selected.name}-project.zip`); }
        catch (error) { setError(errorMessage(error)); }
        finally { setExportBusy(false); }
    }
    return <AppShell appearance="canvas" className="shell"><a href="#main" className="skip-link">본문으로 이동</a>
        <AppBody className="workspace-body"><AppSidebar className="sidebar" aria-label="프로젝트 탐색"><div><Brand /><div className="workspace">개인 작업공간</div></div>
            <div className="project-nav"><label className="side-label" htmlFor="project-choice">PROJECT</label><NativeSelect id="project-choice" className="project-choice" value={route.project} onChange={event => navigate({ project: event.target.value, item: "", run: "", baseline: "", q: "", view: "overview" })}>
                <option value="">프로젝트 목록</option>{projects.status === "ready" && projects.data.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</NativeSelect>
                <ActionButton className="linkbtn small new-project" onClick={() => setCreateOpen(true)}>+ 프로젝트 만들기</ActionButton>
                <SideNav className="nav" aria-label="프로젝트 메뉴">{menu.map(([view, icon, label]) => {
                    const patch = { view, item: "", run: "", q: "", kind: "" };
                    return <SideNavLink key={view} variant="filled" href={routeUrl(patch)} aria-current={route.view === view && !!route.project ? "page" : undefined}
                        onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) { event.preventDefault(); navigate(patch); } }}>
                        <span className="nav-icon" aria-hidden="true">{icon}</span>{label}</SideNavLink>;
                })}</SideNav>
            </div><div className="sidebar-bottom"><span className="avatar" aria-hidden="true">{session.user.username.slice(0, 2).toUpperCase()}</span><strong>{session.user.username}</strong><p className="muted small">개인 모드</p><ActionButton className="small" disabled={logoutBusy} onClick={() => { void logout(); }}>{logoutBusy ? "처리 중…" : "로그아웃"}</ActionButton></div>
        </AppSidebar>
        <div className="workspace-main"><AppHeader className="topbar"><div className="crumb"><RouteLink patch={{ project: "", item: "", run: "", baseline: "" }}>프로젝트</RouteLink>{selected && <><span>/</span><strong>{selected.name}</strong><span>/</span><span>{title}</span></>}</div><div className="mobile-topbar"><NativeSelect aria-label="현재 프로젝트" value={route.project} onChange={event => navigate({ project: event.target.value, view: event.target.value ? "tasks" : "overview", taskMode: "simple", taskView: "today", item: "", run: "", baseline: "", q: "", savedView: "" })}>
            <option value="">프로젝트 선택</option>{projects.status === "ready" && projects.data.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}
        </NativeSelect><strong>{selected ? title : "프로젝트"}</strong></div><div className="actions desktop-topbar-actions">
            <ThemeControls />
            {runtime.status === "ready" && <span className={`runtime-label ${runtime.data.configured ? "configured" : ""}`}>{runtime.data.configured ? "LLM 연결 설정됨" : "LLM 미설정"}</span>}
            {selected && <ActionButton className="small" disabled={exportBusy} onClick={() => { void exportProject(); }}>{exportBusy ? "ZIP 받는 중…" : "프로젝트 ZIP"}</ActionButton>}
            <ActionButton className="mobile-logout small" disabled={logoutBusy} onClick={() => { void logout(); }}>로그아웃</ActionButton>
        </div></AppHeader>
            <AppMain id="main" className="page" tabIndex={-1}>
                {error && <ErrorNotice error={error} />}
                {projects.status === "loading" && <Loading label="프로젝트 목록 불러오는 중…" />}
                {projects.status === "error" && <ErrorNotice error={projects.error} retry={projects.reload} />}
                {projects.status === "ready" && (!route.project ? <ProjectsList projects={projects.data} onCreate={() => setCreateOpen(true)} onImported={project => { projects.reload(); navigate({ project: project.id, view: "overview", item: "", run: "", baseline: "", q: "" }); }} /> : selected ? <ProjectWorkspace project={selected} userId={session.user.id} revision={revision} onChanged={() => setRevision(value => value + 1)} catalog={catalog} runtime={runtime} /> : <Empty title="프로젝트를 찾을 수 없습니다."><p>프로젝트가 존재하지 않거나 이 계정의 접근 범위에 없습니다.</p><RouteLink patch={{ project: "", item: "" }}>프로젝트 목록으로</RouteLink></Empty>)}
            </AppMain>
        </div><BottomNav className="mobile-bottom-nav" aria-label="모바일 주요 탐색">
            {mobileRoutes.map(({ id, label, icon, patch }) => <BottomNavLink key={id} href={routeUrl(patch)} label={label} icon={icon}
                aria-current={selected && mobileDestination === id ? "page" : undefined}
                aria-disabled={!selected || undefined} tabIndex={selected ? undefined : -1}
                onClick={event => { if (!selected || !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) { event.preventDefault(); if (selected) navigate(patch); } }} />)}
            <Button ref={mobileMoreTrigger} variant="ghost" type="button" className="mobile-more-trigger" aria-current={mobileDestination === "more" ? "page" : undefined}
                aria-haspopup="dialog" aria-expanded={mobileMoreOpen} onClick={() => setMobileMoreOpen(true)}><span aria-hidden="true">☰</span><span>더보기</span></Button>
        </BottomNav>
        </AppBody>{mobileMoreOpen && <Modal title="더보기" className="mobile-more-dialog" onClose={closeMobileMore}>
            <p className="muted small">{selected ? `${selected.name} · 업무 영역` : "프로젝트를 선택하거나 새로 만드세요."}</p>
            <SideNav aria-label="다른 업무 화면" className="mobile-more-links" onClick={closeMobileMore}>
                {menu.filter(([view]) => view !== "tasks").map(([view, icon, label]) => <RouteLink key={view} appearance="side" patch={{ view, item: "", run: "", q: "", kind: "" }} className="mobile-more-link"><span aria-hidden="true">{icon}</span>{label}</RouteLink>)}
            </SideNav>
            <div className="mobile-more-settings"><ThemeControls idPrefix="mobile-" />
                {runtime.status === "ready" && <p className="muted small">{runtime.data.configured ? "LLM 연결 설정됨" : "LLM 미설정"}</p>}
                {selected && <ActionButton className="small" disabled={exportBusy} onClick={() => { void exportProject(); }}>{exportBusy ? "ZIP 받는 중…" : "프로젝트 ZIP"}</ActionButton>}
                <ActionButton className="small" disabled={logoutBusy} onClick={() => { void logout(); }}>{logoutBusy ? "처리 중…" : "로그아웃"}</ActionButton>
            </div>
        </Modal>}{createOpen && <CreateProject onClose={() => setCreateOpen(false)} onCreated={project => { setCreateOpen(false); projects.reload(); navigate({ project: project.id, view: "overview", item: "", run: "", baseline: "", q: "" }); }} />}
    </AppShell>;
}

function ProjectWorkspace({ project, userId, revision, onChanged, catalog, runtime }: {
    project: Project; userId: string; revision: number; onChanged: () => void;
    catalog: ReturnType<typeof useResource<Awaited<ReturnType<typeof api.catalog>>>>;
    runtime: ReturnType<typeof useResource<Awaited<ReturnType<typeof api.runtime>>>>;
}) {
    const route = useRoute();
    const items = useResource(`items:${project.id}:${revision}`, signal => api.items(project.id, signal));
    if (items.status === "loading") return <Loading label="프로젝트 내용 불러오는 중…" />;
    if (items.status === "error") return <ErrorNotice error={items.error} retry={items.reload} />;
    return <>
        {catalog.status === "error" && (route.view === "documents" || route.view === "runs") && <ErrorNotice error={`문서 종류·참조 목록을 읽지 못했습니다. ${catalog.error}`} retry={catalog.reload} />}
        {route.view === "overview" ? <Overview project={project} items={items.data} revision={revision} /> : route.view === "trace" ? <TracePage projectId={project.id} items={items.data} baselineId={route.baseline} revision={revision} onChanged={onChanged} /> : route.view === "runs" ? <RunsPage projectId={project.id} userId={userId} route={route} items={items.data} catalog={catalog.status === "ready" ? catalog.data : undefined} runtime={runtime} onRuntimeReload={runtime.reload} onChanged={onChanged} /> : route.view === "tasks" ? <TaskWorkspace projectId={project.id} userId={userId} route={route} items={items.data} catalog={catalog.status === "ready" ? catalog.data : undefined} onChanged={onChanged} /> : ["planning", "documents", "tests"].includes(route.view) ? <ItemsPage projectId={project.id} userId={userId} route={route} items={items.data} catalog={catalog.status === "ready" ? catalog.data : undefined} onChanged={onChanged} /> : <Empty title="이 화면을 찾을 수 없습니다."><RouteLink patch={{ view: "overview" }}>개요로 이동</RouteLink></Empty>}
        <footer className="footer-note">Projects · 개인 작업공간 · 임시 문서 저장소는 Note 연계 예정</footer>
    </>;
}

function CreateProject({ onClose, onCreated }: { onClose: () => void; onCreated: (project: Project) => void }) {
    const [name, setName] = useState("");
    const [goal, setGoal] = useState("");
    const [profile, setProfile] = useState("simple");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function create(event: React.FormEvent) {
        event.preventDefault(); setBusy(true); setError("");
        try { onCreated(await api.createProject({ name: name.trim(), goal, profile })); }
        catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    return <Modal title="프로젝트 만들기" onClose={onClose}><form onSubmit={event => { void create(event); }}>
        <Field label="프로젝트 이름"><Input required autoFocus maxLength={200} value={name} onChange={event => setName(event.target.value)} /></Field>
        <Field label="목표"><Textarea rows={4} value={goal} onChange={event => setGoal(event.target.value)} placeholder="이 프로젝트로 해결할 문제와 만들 결과를 적어 주세요." /></Field>
        <Field label="프로필"><NativeSelect value={profile} onChange={event => setProfile(event.target.value)}><option value="simple">간편 · 개인 아이디어부터 시작</option><option value="standard">표준 · 기획·설계·검증 근거 함께 관리</option></NativeSelect></Field>
        <p className="hint">문서 종류 35종은 선택 항목입니다. 모든 문서를 필수로 만들지 않습니다.</p>
        {error && <ErrorNotice error={error} />}
        <div className="form-actions"><Button variant="outline" type="button" onClick={onClose}>취소</Button><Button className="primary" type="submit" disabled={busy || !name.trim()}>{busy ? "만드는 중…" : "프로젝트 만들기"}</Button></div>
    </form></Modal>;
}

function ProjectsList({ projects, onCreate, onImported }: {
    projects: Project[]; onCreate: () => void; onImported: (project: Project) => void;
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
        {projects.length ? <div className="project-list">{projects.map(project => <Card key={project.id} className="project-card"><RouteLink patch={{ project: project.id, view: "overview", item: "", run: "", baseline: "", q: "" }} className="project-row"><div><h2>{project.name}</h2><p>{project.goal || "아직 작성한 목표가 없습니다."}</p></div><span>{project.profile === "simple" ? "간편" : "표준"}<small>{dateLabel(project.created_at)}</small></span><span aria-hidden="true">→</span></RouteLink></Card>)}</div> : <Empty title="처음 시작하는 프로젝트"><p>원문 아이디어를 남기고, 스킬로 문서와 실행 계획을 구체화해 보세요.</p><ActionButton className="primary" onClick={onCreate}>프로젝트 만들기</ActionButton></Empty>}
        {importOpen && <Modal title="Projects 백업 ZIP 복원" onClose={() => setImportOpen(false)}><form onSubmit={event => { void importFile(event); }}><p>Projects에서 저장한 백업 ZIP을 선택해 주세요. 기존 프로젝트의 항목과 관계를 복원합니다. Git 소스 ZIP은 별도의 만들기 기능을 사용해 주세요.</p><Field label="Projects 백업 ZIP · 최대 8 MB"><Input type="file" required accept=".zip,application/zip" onChange={event => setFile(event.target.files?.[0] ?? null)} /></Field>{error && <ErrorNotice error={error} />}<div className="form-actions"><ActionButton type="button" onClick={() => setImportOpen(false)}>닫기</ActionButton><ActionButton className="primary" type="submit" disabled={busy || !file}>{busy ? "검사·복원 중…" : "백업 검사 후 복원"}</ActionButton></div></form></Modal>}
        {gitOpen && <GitImport onClose={() => setGitOpen(false)} onCreated={project => { setGitOpen(false); onImported(project); }} />}
        {gitZipOpen && <GitZipImport onClose={() => setGitZipOpen(false)} onCreated={project => { setGitZipOpen(false); onImported(project); }} />}
    </>;
}
