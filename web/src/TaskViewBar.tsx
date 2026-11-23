import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useAuthenticationDraft, type AuthenticationDraft } from "./auth-drafts";
import { BarChart3, CalendarDays, Columns3, List, MoreHorizontal, Plus, Star } from "lucide-react";
import { api, errorMessage } from "./api";
import { taskViewSchema, taskViewSettingsSchema, type TaskView, type TaskViewSettings } from "./models";
import { Button } from "./pydemia-ui/button";
import { Input } from "./pydemia-ui/input";
import { NativeSelect } from "./pydemia-ui/native-select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./pydemia-ui/dropdown-menu";
import { ErrorNotice, Field, Modal } from "./ui";
import "./task-view-bar.css";

const layouts = {
    list: { label: "목록", icon: List },
    board: { label: "보드", icon: Columns3 },
    calendar: { label: "캘린더", icon: CalendarDays },
    insights: { label: "집계", icon: BarChart3 },
};
type Layout = keyof typeof layouts;
type ViewDialog = { kind: "create"; settings: TaskViewSettings } |
    { kind: "rename" | "duplicate" | "delete"; view: TaskView };
const recoveryViewSchema = taskViewSchema.extend({settings: taskViewSettingsSchema.strict()}).strict();
const viewDraftSchema = z.object({name: z.string(), layout: z.enum(["list", "board", "calendar", "insights"]),
    dialog: z.union([z.object({kind: z.literal("create"), settings: taskViewSettingsSchema.strict()}).strict(),
        z.object({kind: z.enum(["rename", "duplicate", "delete"]), view: recoveryViewSchema}).strict()])}).strict();

export type TaskViewBarProps = {
    projectId: string;
    views: TaskView[];
    activeId: string;
    settings: TaskViewSettings;
    dirty: boolean;
    loading?: boolean;
    error?: string;
    onSelect: (id: string) => void;
    onChanged: () => void;
    onRestore?: () => void;
};

function layoutFor(settings: TaskViewSettings): Layout {
    return settings.view === "board" || settings.view === "calendar" || settings.view === "insights"
        ? settings.view : "list";
}

export function TaskViewBar({ projectId, views, activeId, settings, dirty, loading = false,
    error = "", onSelect, onChanged, onRestore }: TaskViewBarProps) {
    const recovery: AuthenticationDraft<z.infer<typeof viewDraftSchema>> = useAuthenticationDraft(`views:${projectId || "global"}:dialog`, viewDraftSchema,
        () => dialog ? {dialog, name, layout} : null);
    const [dialog, setDialog] = useState<ViewDialog | null>(recovery.restored?.dialog ?? null);
    const [name, setName] = useState(recovery.restored?.name ?? "");
    const [layout, setLayout] = useState<Layout>(recovery.restored?.layout ?? "list");
    const [busy, setBusy] = useState(false);
    const [mutationError, setMutationError] = useState("");
    const scope = useRef(projectId);
    scope.current = projectId;
    const active = views.find(view => view.id === activeId);
    const ordered = [...views].sort((left, right) => Number(right.is_default) - Number(left.is_default) || left.name.localeCompare(right.name, "ko"));
    const previousProject = useRef(projectId);
    useEffect(() => {
        if (previousProject.current !== projectId) {setDialog(null); setMutationError(""); setBusy(false);}
        previousProject.current = projectId;
    }, [projectId]);

    function openDialog(next: ViewDialog) {
        setMutationError("");
        setName(next.kind === "create" ? "" : next.kind === "duplicate" ? `${next.view.name} 복사` : next.view.name);
        setLayout(layoutFor(next.kind === "create" ? next.settings : next.view.settings));
        setDialog(next);
    }
    async function mutate(operation: () => Promise<void>) {
        if (busy) return;
        const startedScope = projectId;
        setBusy(true); setMutationError("");
        try { await operation(); }
        catch (cause) { if (scope.current === startedScope) setMutationError(errorMessage(cause)); }
        finally { if (scope.current === startedScope) setBusy(false); }
    }
    async function submitDialog() {
        if (!dialog || (dialog.kind !== "delete" && !name.trim())) return;
        const startedScope = projectId;
        await mutate(async () => {
            if (dialog.kind === "delete") {
                await api.deleteTaskView(dialog.view.id);
                if (scope.current !== startedScope) return;
                if (activeId === dialog.view.id) onSelect("");
            } else if (dialog.kind === "rename") {
                await api.updateTaskView(dialog.view.id, {
                    name: name.trim(), scope: "personal", is_default: dialog.view.is_default,
                    expected_revision: dialog.view.revision, settings: dialog.view.settings,
                });
                if (scope.current !== startedScope) return;
            } else {
                const source = dialog.kind === "create" ? dialog.settings : dialog.view.settings;
                const saved = await api.createTaskView(projectId, {
                    name: name.trim(), scope: "personal", is_default: false,
                    settings: dialog.kind === "create" ? {
                        ...source, schema_version: 2, view: layout,
                        task_scope: source.task_scope ?? (source.view === "today" || source.view === "inbox" || source.view === "upcoming" ? source.view : "all"),
                        grouping: layout === "board" ? "state" : source.grouping,
                    } : source,
                });
                if (scope.current !== startedScope) return;
                onSelect(saved.id);
            }
            setDialog(null);
            recovery.clear();
            onChanged();
        });
    }
    function saveCurrent() {
        if (!active) return;
        const startedScope = projectId;
        void mutate(async () => {
            await api.updateTaskView(active.id, { name: active.name, scope: "personal",
                is_default: active.is_default, expected_revision: active.revision, settings });
            if (scope.current === startedScope) onChanged();
        });
    }
    function toggleDefault(view: TaskView) {
        const startedScope = projectId;
        void mutate(async () => {
            await api.updateTaskView(view.id, { name: view.name, scope: "personal",
                is_default: !view.is_default, expected_revision: view.revision, settings: view.settings });
            if (scope.current === startedScope) onChanged();
        });
    }
    const displayedError = mutationError || error;
    const refreshedView = dialog && dialog.kind !== "create"
        ? views.find(view => view.id === dialog.view.id && view.revision !== dialog.view.revision)
        : undefined;
    return <section className="task-named-views" aria-label="저장한 작업 보기" aria-busy={busy || loading}>
        <div className="task-named-view-toolbar">
            <nav className="task-named-view-list" aria-label="이름으로 저장한 보기">
                {ordered.map(view => {
                    const presentation = layouts[layoutFor(view.settings)];
                    const Icon = presentation.icon;
                    const current = view.id === activeId;
                    return <div className="task-named-view" key={view.id} data-current={current}>
                        <Button variant="ghost" className="task-named-view-select" aria-current={current ? "page" : undefined}
                            aria-label={`${view.name} ${presentation.label}${view.is_default ? " 기본 보기" : ""}${current && dirty ? " 저장하지 않은 변경" : ""}`}
                            disabled={busy} onClick={() => onSelect(view.id)}>
                            <Icon aria-hidden="true" size={15} /><span>{view.name}</span>
                            <span className="task-named-view-layout">{presentation.label}</span>
                            {view.is_default && <><Star aria-hidden="true" size={12} /><span className="sr-only">기본 보기</span></>}
                            {current && dirty && <span className="task-named-view-dirty" aria-label="저장하지 않은 변경">•</span>}
                        </Button>
                        <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={busy}
                                className="task-named-view-menu" aria-label={`${view.name} 보기 관리`}><MoreHorizontal size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="task-named-view-menu-content"
                                onCloseAutoFocus={event => { if (dialog) event.preventDefault(); }}>
                                <DropdownMenuItem onSelect={() => openDialog({kind: "rename", view})}>이름 변경</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => openDialog({kind: "duplicate", view})}>보기 복제</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => toggleDefault(view)}>{view.is_default ? "기본 보기 해제" : "기본 보기로 설정"}</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="danger" onSelect={() => openDialog({kind: "delete", view})}>보기 삭제</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>;
                })}
                {!loading && views.length === 0 && <span className="task-named-view-empty">저장한 보기 없음</span>}
                <Button variant="ghost" className="task-named-view-add" disabled={busy || loading}
                    onClick={() => openDialog({kind: "create", settings})}><Plus size={16} aria-hidden="true" />보기</Button>
            </nav>
            {active && dirty && <div className="task-named-view-save">
                <span>저장하지 않은 변경</span>
                {onRestore && <Button variant="ghost" disabled={busy} onClick={onRestore}>변경 되돌리기</Button>}
                <Button variant="outline" disabled={busy || loading} onClick={saveCurrent}>현재 보기 업데이트</Button>
            </div>}
        </div>
        {loading && <p className="task-named-view-status" role="status">저장한 보기 불러오는 중…</p>}
        {displayedError && !dialog && <ErrorNotice error={displayedError} retry={onChanged} />}
        {dialog && <Modal title={dialog.kind === "create" ? "새 보기 추가" : dialog.kind === "rename" ? "보기 이름 변경" : dialog.kind === "duplicate" ? "저장한 보기 복제" : "저장한 보기 삭제"}
            onClose={() => { if (!busy) { setDialog(null); recovery.clear(); setMutationError(""); } }} className="task-named-view-dialog">
            <form onSubmit={event => { event.preventDefault(); void submitDialog(); }}>
                {dialog.kind === "delete" ? <p>‘{dialog.view.name}’ 보기를 삭제하시겠습니까? 저장한 필터와 표시 설정이 삭제됩니다. 작업은 유지됩니다.</p> : <>
                    <Field label="저장 보기 이름"><Input value={name} onChange={event => setName(event.target.value)} required maxLength={100} disabled={busy} autoFocus /></Field>
                    {dialog.kind === "create" && <Field label="저장 보기 레이아웃"><NativeSelect value={layout} disabled={busy} onChange={event => {
                        const value = event.target.value;
                        if (value === "list" || value === "board" || value === "calendar" || value === "insights") setLayout(value);
                    }}>{Object.entries(layouts).map(([value, item]) => <option value={value} key={value}>{item.label}</option>)}</NativeSelect></Field>}
                    <p className="muted">{dialog.kind === "create" ? "현재 필터와 표시할 필드를 함께 저장합니다." : dialog.kind === "duplicate" ? "저장된 설정을 복제합니다. 현재 화면의 미저장 변경은 포함하지 않습니다." : "저장된 필터와 표시 설정을 유지합니다."}</p>
                </>}
                {displayedError && <ErrorNotice error={displayedError} retry={onChanged} />}
                {refreshedView && dialog.kind !== "create" && <div className="task-named-view-refresh">
                    <p>저장된 보기가 변경되었습니다. 최신 버전을 사용해 다시 진행할 수 있습니다. 입력한 이름은 유지됩니다.</p>
                    <Button variant="outline" disabled={busy} onClick={() => {
                        setDialog({...dialog, view: refreshedView}); setMutationError("");
                    }}>최신 보기 버전 사용</Button>
                </div>}
                <div className="task-named-view-dialog-actions">
                    <Button variant="ghost" disabled={busy} onClick={() => {setDialog(null); recovery.clear(); setMutationError("");}}>취소</Button>
                    <Button type="submit" disabled={busy || (dialog.kind !== "delete" && !name.trim())}>
                        {busy ? "처리 중…" : dialog.kind === "delete" ? "보기 삭제 확인" : dialog.kind === "rename" ? "이름 변경 저장" : dialog.kind === "duplicate" ? "복제 보기 만들기" : "새 보기 만들기"}
                    </Button>
                </div>
            </form>
        </Modal>}
    </section>;
}
