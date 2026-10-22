import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "./api";
import { navigate, useMobileViewport, useResource } from "./hooks";
import type { Route } from "./hooks";
import { NewItem, RecordEditor } from "./ItemsPage";
import { TaskBoard } from "./TaskBoard";
import { dataSchemas, statusLabels } from "./models";
import type { Catalog, Item, TaskViewSettings } from "./models";
import { Input } from "./pydemia-ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./pydemia-ui/accordion";
import { BarList } from "./pydemia-ui/bar-list";
import { Card, CardContent } from "./pydemia-ui/card";
import { Checkbox } from "./pydemia-ui/checkbox";
import { MetricCard } from "./pydemia-ui/metric-card";
import { NativeSelect } from "./pydemia-ui/native-select";
import { SearchInput } from "./pydemia-ui/search-input";
import { SegmentedControl, SegmentedControlItem } from "./pydemia-ui/segmented-control";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./pydemia-ui/tabs";
import { ActionButton, Badge, Empty, ErrorNotice, ExternalLink, Field, Modal, PageHead, RouteLink } from "./ui";

type Task = Extract<Item, { kind: "task" }>;
type Lens = "gtd" | "abc";
const states = ["todo", "in_progress", "in_review", "done", "cancelled"] as const;
const simpleViews = ["today", "inbox", "upcoming"] as const;
const complexViews = ["list", "board", "calendar", "insights"] as const;

function readSelected(key: string): Set<string> {
    try {
        const ids: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
        return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
    } catch { return new Set(); }
}

function readBulkDraft(key: string) {
    const fallback = { open: false, state: "in_progress" as Task["data"]["state"], date: localDay(), list: "", reason: "" };
    try {
        const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
        if (!value || typeof value !== "object") return fallback;
        const draft = value as Record<string, unknown>;
        return {
            open: draft.open === true,
            state: states.includes(draft.state as Task["data"]["state"]) ? draft.state as Task["data"]["state"] : fallback.state,
            date: typeof draft.date === "string" ? draft.date : fallback.date,
            list: typeof draft.list === "string" ? draft.list : "",
            reason: typeof draft.reason === "string" ? draft.reason : "",
        };
    } catch { return fallback; }
}

function localDay(date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function isOpen(task: Task): boolean {
    return task.data.state !== "done" && task.data.state !== "cancelled";
}
function abcRank(task: Task): number {
    return { A: 0, B: 1, C: 2, none: 3 }[task.data.abc_priority];
}
function gtdRank(task: Task, minutes: number, context: string, energy: string): number {
    const estimate = task.data.estimated_minutes;
    const contextMismatch = context && task.data.context && context.toLocaleLowerCase() !== task.data.context.toLocaleLowerCase();
    const energyMismatch = energy !== "any" && task.data.energy !== "any" &&
        { low: 1, medium: 2, high: 3 }[task.data.energy] > { low: 1, medium: 2, high: 3 }[energy as "low" | "medium" | "high"];
    return (task.data.next_action ? 0 : 100) + (contextMismatch ? 30 : 0) +
        (energyMismatch ? 20 : 0) + (minutes && estimate > minutes ? 10 : 0) +
        (minutes && !estimate ? 5 : 0);
}
function sorted(tasks: Task[], lens: Lens, minutes: number, context: string, energy: string): Task[] {
    return [...tasks].sort((left, right) => {
        if (lens === "abc") {
            return abcRank(left) - abcRank(right) ||
                (left.data.abc_order || 1000) - (right.data.abc_order || 1000) ||
                (left.data.due_date || "9999").localeCompare(right.data.due_date || "9999") ||
                left.created_at.localeCompare(right.created_at);
        }
        return gtdRank(left, minutes, context, energy) - gtdRank(right, minutes, context, energy) ||
            (left.data.due_date || "9999").localeCompare(right.data.due_date || "9999") ||
            left.created_at.localeCompare(right.created_at);
    });
}
function groupedTasks(tasks: Task[], grouping: TaskViewSettings["grouping"]): Task[] {
    return grouping === "none" ? tasks : [...tasks].sort((left, right) => grouping === "state"
        ? states.indexOf(left.data.state) - states.indexOf(right.data.state)
        : left.data.list_name.localeCompare(right.data.list_name));
}

export function TaskWorkspace({ projectId, userId, route, items, catalog, onChanged }: {
    projectId: string; userId: string; route: Route; items: Item[];
    catalog?: Catalog; onChanged: () => void;
}) {
    const tasks = useMemo(() => items.filter((item): item is Task => item.kind === "task"), [items]);
    const mobile = useMobileViewport();
    const mode = route.taskMode === "complex" ? "complex" : "simple";
    const view = mode === "simple"
        ? simpleViews.find(candidate => candidate === route.taskView) ?? "today"
        : complexViews.find(candidate => candidate === route.taskView) ?? "list";
    const [quickTitle, setQuickTitle] = useState("");
    const [quickDate, setQuickDate] = useState(localDay);
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("all");
    const [lens, setLens] = useState<Lens>("gtd");
    const [minutes, setMinutes] = useState(0);
    const [context, setContext] = useState("");
    const [energy, setEnergy] = useState("any");
    const [grouping, setGrouping] = useState<TaskViewSettings["grouping"]>("none");
    const [taskSort, setTaskSort] = useState<TaskViewSettings["sort"]>("gtd");
    const [cardFields, setCardFields] = useState<TaskViewSettings["card_fields"]>(["list_name", "due_date"]);
    const selectionKey = `projects:task-selection:${projectId}`;
    const bulkDraftKey = `projects:task-bulk-draft:${projectId}`;
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => readSelected(selectionKey));
    const [selectionAnchor, setSelectionAnchor] = useState("");
    const [bulkState, setBulkState] = useState<Task["data"]["state"]>(() => readBulkDraft(bulkDraftKey).state);
    const [bulkDate, setBulkDate] = useState(() => readBulkDraft(bulkDraftKey).date);
    const [bulkList, setBulkList] = useState(() => readBulkDraft(bulkDraftKey).list);
    const [bulkReason, setBulkReason] = useState(() => readBulkDraft(bulkDraftKey).reason);
    const [savedName, setSavedName] = useState("");
    const [savedDefault, setSavedDefault] = useState(false);
    const [savedBusy, setSavedBusy] = useState(false);
    const savedViews = useResource(`task-views:${projectId}`, signal => api.taskViews(projectId, signal));
    const appliedSavedId = useRef("");
    const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [newDetailed, setNewDetailed] = useState(false);
    const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
    const [mobileAddOpen, setMobileAddOpen] = useState(false);
    const [mobileBulkOpen, setMobileBulkOpen] = useState(() => readBulkDraft(bulkDraftKey).open);
    const mobileFilterTrigger = useRef<HTMLButtonElement>(null);
    const mobileAddTrigger = useRef<HTMLButtonElement>(null);
    const mobileBulkTrigger = useRef<HTMLButtonElement>(null);
    const [mobileSelecting, setMobileSelecting] = useState(() => readSelected(selectionKey).size > 0);
    const [busyId, setBusyId] = useState("");
    const boardErrorKey = `projects:board-error:${projectId}`;
    const [error, setError] = useState(() => sessionStorage.getItem(boardErrorKey) ?? "");
    function reportBoardError(message: string) {
        if (message) sessionStorage.setItem(boardErrorKey, message);
        else sessionStorage.removeItem(boardErrorKey);
        setError(message);
    }
    const selectedRef = useRef<HTMLDivElement>(null);
    const today = localDay();
    const selected = tasks.find(task => task.id === route.item);
    const activeSavedView = savedViews.status === "ready"
        ? savedViews.data.find(candidate => candidate.id === route.savedView) : undefined;
    useEffect(() => {
        if (savedViews.status !== "ready") return;
        if (!route.savedView && !route.taskView) {
            const preferred = savedViews.data.find(candidate => candidate.is_default);
            if (preferred) navigate({ savedView: preferred.id, taskMode: preferred.settings.mode, taskView: preferred.settings.view });
        }
        if (!route.savedView) { appliedSavedId.current = ""; return; }
        const found = savedViews.data.find(candidate => candidate.id === route.savedView);
        if (!found || appliedSavedId.current === found.id) return;
        appliedSavedId.current = found.id;
        setSavedName(found.name); setSavedDefault(found.is_default);
        setQuery(found.settings.query); setStatus(found.settings.status);
        setLens(found.settings.lens); setMinutes(found.settings.minutes);
        setContext(found.settings.context); setEnergy(found.settings.energy);
        setGrouping(found.settings.grouping); setTaskSort(found.settings.sort);
        setCardFields(found.settings.card_fields);
        if (route.taskMode !== found.settings.mode || route.taskView !== found.settings.view)
            navigate({ taskMode: found.settings.mode, taskView: found.settings.view });
    }, [savedViews.status, savedViews.data, route.savedView, route.taskMode, route.taskView]);
    useEffect(() => {
        setSelectedIds(current => new Set([...current].filter(id => tasks.some(task => task.id === id))));
    }, [tasks]);
    useEffect(() => {
        sessionStorage.setItem(selectionKey, JSON.stringify([...selectedIds]));
    }, [selectedIds, selectionKey]);
    useEffect(() => {
        if (mobileBulkOpen) sessionStorage.setItem(bulkDraftKey, JSON.stringify({ open: true, state: bulkState, date: bulkDate, list: bulkList, reason: bulkReason }));
        else sessionStorage.removeItem(bulkDraftKey);
    }, [bulkDraftKey, mobileBulkOpen, bulkState, bulkDate, bulkList, bulkReason]);
    useEffect(() => {
        if (selected) selectedRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }, [selected?.id]);
    const visible = useMemo(() => {
        const searched = tasks.filter(task => `${task.title} ${task.data.list_name} ${task.data.context} ${task.data.goal}`
            .toLocaleLowerCase().includes(query.toLocaleLowerCase()));
        const filtered = searched.filter(task => {
            if (mode === "simple") {
                if (!isOpen(task)) return false;
                if (view === "today") return task.data.planned_date === today || !!task.data.due_date && task.data.due_date <= today;
                if (view === "inbox") return task.data.list_name === "Inbox";
                return task.data.planned_date > today || !task.data.planned_date && task.data.due_date > today;
            }
            if (status === "open") return isOpen(task);
            return status === "all" || task.data.state === status;
        });
        if (taskSort === "manual") return [...filtered].sort((left, right) =>
            (left.board_order ?? 0) - (right.board_order ?? 0) || left.created_at.localeCompare(right.created_at));
        if (taskSort === "due_date") return [...filtered].sort((left, right) =>
            (left.data.due_date || "9999").localeCompare(right.data.due_date || "9999") || left.created_at.localeCompare(right.created_at));
        return sorted(filtered, taskSort, minutes, context, energy);
    }, [tasks, mode, view, status, query, taskSort, minutes, context, energy, today]);
    async function quickAdd(event: React.FormEvent) {
        event.preventDefault();
        if (!quickTitle.trim()) return;
        setBusyId("new"); setError("");
        try {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const plannedDate = mode === "simple" ? view === "inbox" ? "" : view === "upcoming" ? localDay(tomorrow) : today : quickDate;
            await api.createItem(projectId, {
                kind: "task", title: quickTitle.trim(), body: "",
                data: dataSchemas.task.parse({ workflow: "personal", requires_test: false,
                    planned_date: plannedDate, list_name: "Inbox" }),
            });
            setQuickTitle(""); setMobileAddOpen(false); onChanged();
        } catch (cause) { setError(errorMessage(cause)); }
        finally { setBusyId(""); }
    }
    async function toggle(task: Task) {
        if (task.data.workflow !== "personal") {
            navigate({ taskMode: "complex", taskView: "list", item: task.id, savedView: "" });
            return;
        }
        setBusyId(task.id); setError("");
        try {
            await api.saveItem(task.id, {
                expected_revision: task.revision, title: task.title, body: task.body,
                data: { ...task.data, state: task.data.state === "done" ? "todo" : "done" },
            });
            onChanged();
        } catch (cause) { setError(errorMessage(cause)); }
        finally { setBusyId(""); }
    }
    function selectTask(taskId: string, shift: boolean) {
        setSelectedIds(current => {
            const next = new Set(current);
            if (shift && selectionAnchor) {
                const selectionOrder = view === "list" ? groupedTasks(visible, grouping) : visible;
                const from = selectionOrder.findIndex(task => task.id === selectionAnchor);
                const to = selectionOrder.findIndex(task => task.id === taskId);
                if (from >= 0 && to >= 0) {
                    for (const task of selectionOrder.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(task.id);
                    return next;
                }
            }
            if (next.has(taskId)) next.delete(taskId);
            else next.add(taskId);
            return next;
        });
        setSelectionAnchor(taskId);
    }
    async function changeTasks(taskIds: string[], changes: Record<string, string>) {
        if (!taskIds.length) return;
        setBusyId("bulk"); reportBoardError("");
        try {
            await api.bulkTasks(projectId, {
                tasks: taskIds.map(id => {
                    const task = tasks.find(candidate => candidate.id === id);
                    if (!task) throw new Error("선택한 작업을 다시 불러와 주세요.");
                    return { id, expected_revision: task.revision };
                }),
                ...changes,
            });
            setSelectedIds(new Set()); setMobileBulkOpen(false);
            sessionStorage.removeItem(selectionKey);
            sessionStorage.removeItem(bulkDraftKey);
            onChanged();
        } catch (cause) {
            reportBoardError(`${errorMessage(cause)} 변경된 작업이 있는지 확인한 뒤 다시 시도해 주세요.`);
            onChanged();
        } finally { setBusyId(""); }
    }
    async function saveView(update: boolean) {
        if (!savedName.trim()) { setError("보기 이름을 입력해 주세요."); return; }
        const settings: TaskViewSettings = {
            mode, view, query, status, lens, minutes, context,
            energy: energy as TaskViewSettings["energy"],
            grouping: mode === "simple" ? "none" : view === "board" ? "state" : grouping,
            sort: taskSort, card_fields: cardFields,
        };
        setSavedBusy(true); setError("");
        try {
            const saved = update && activeSavedView
                ? await api.updateTaskView(activeSavedView.id, {
                    name: savedName.trim(), scope: "personal", is_default: savedDefault,
                    expected_revision: activeSavedView.revision, settings,
                })
                : await api.createTaskView(projectId, {
                    name: savedName.trim(), scope: "personal", is_default: savedDefault, settings,
                });
            savedViews.reload();
            appliedSavedId.current = saved.id;
            navigate({ savedView: saved.id });
            setMobileFilterOpen(false);
        } catch (cause) { setError(errorMessage(cause)); }
        finally { setSavedBusy(false); }
    }
    async function deleteView() {
        if (!activeSavedView) return;
        setSavedBusy(true); setError("");
        try {
            await api.deleteTaskView(activeSavedView.id);
            appliedSavedId.current = "";
            setSavedName(""); setSavedDefault(false);
            navigate({ savedView: "" });
            savedViews.reload();
            setMobileFilterOpen(false);
        } catch (cause) { setError(errorMessage(cause)); }
        finally { setSavedBusy(false); }
    }
    function changeMode(next: "simple" | "complex") {
        if (next === "simple") setTaskSort(lens);
        navigate({ taskMode: next, taskView: next === "simple" ? "today" : "list", savedView: "" });
    }
    const list = (rows: Task[]) => {
        const rowGrouping = mode === "simple" ? "none" : grouping;
        const groupedRows = groupedTasks(rows, rowGrouping);
        return <div className="task-list">
        {groupedRows.map((task, index) => <div className="task-row" key={task.id}>
            {mode === "complex" && <Checkbox className="task-select" aria-label={`${task.title} 일괄 선택`}
                checked={selectedIds.has(task.id)} disabled={busyId === "bulk"}
                onClick={event => selectTask(task.id, event.shiftKey)} />}
            {rowGrouping !== "none" && (index === 0 || (rowGrouping === "state"
                ? groupedRows[index - 1]?.data.state !== task.data.state
                : groupedRows[index - 1]?.data.list_name !== task.data.list_name)) &&
                <strong className="task-group-label">{rowGrouping === "state" ? statusLabels[task.data.state] : task.data.list_name}</strong>}
            {task.data.workflow === "personal" ? <Checkbox className="task-check" aria-label={`${task.title} ${task.data.state === "done" ? "다시 열기" : "완료"}`}
                checked={task.data.state === "done"} disabled={busyId === task.id} onCheckedChange={() => { void toggle(task); }} />
                : <ActionButton className="task-check" aria-label={`${task.title} 상세 열기`} disabled={busyId === task.id} onClick={() => { void toggle(task); }}>→</ActionButton>}
            <div className="task-row-main"><RouteLink patch={{ item: task.id }} className="task-title">{task.title}</RouteLink>
                <div className="task-meta"><Badge value={task.data.state} />
                    <span>{task.data.list_name}</span>
                    {task.data.planned_date && <span>실행 {task.data.planned_date}</span>}
                    {task.data.due_date && <span>마감 {task.data.due_date}</span>}
                    {task.data.estimated_minutes > 0 && <span>{task.data.estimated_minutes}분</span>}
                    {task.data.abc_priority !== "none" && <span>ABC {task.data.abc_priority}{task.data.abc_order || ""}</span>}
                    {task.data.github_issue_url && <ExternalLink href={task.data.github_issue_url}>Issue ↗</ExternalLink>}
                </div>
            </div>
            {mode === "simple" && <div className="task-plan-actions">
                {task.data.planned_date !== today && <ActionButton className="small" disabled={busyId === "bulk"}
                    onClick={() => { void changeTasks([task.id], { planned_date: today }); }}>오늘로</ActionButton>}
                {task.data.planned_date === today && <ActionButton className="small" disabled={busyId === "bulk"}
                    onClick={() => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
                        void changeTasks([task.id], { planned_date: localDay(tomorrow) }); }}>내일로 연기</ActionButton>}
                {view === "today" && task.data.planned_date !== today && !!task.data.due_date && task.data.due_date <= today &&
                    <span className="muted small">마감일이 지나 오늘에도 표시됩니다.</span>}
            </div>}
            <span className="task-workflow">{task.data.workflow === "personal" ? "개인" : "구현"}</span>
        </div>)}
        {!groupedRows.length && <Empty title="이 보기에 해당하는 작업이 없습니다."><p>다른 보기나 필터를 선택하거나 새 할 일을 추가해 보세요.</p></Empty>}
    </div>;
    };
    const viewLabels: Record<string, string> = { today: "오늘", inbox: "Inbox", upcoming: "예정", list: "목록", board: "보드", calendar: "캘린더", insights: "집계" };
    const filterCount = Number(!!query) + Number(status !== "all") + Number(!!context) + Number(minutes > 0) + Number(energy !== "any") + Number(!!route.savedView);
    return <section className={`task-workspace ${selected ? "has-task-selection" : ""}`} data-mobile-selecting={mobile && mobileSelecting}>
        {mobile && <div className="mobile-task-header"><h1>{viewLabels[view]}</h1><p>선택한 프로젝트 · {visible.length}개 작업{activeSavedView ? ` · ${activeSavedView.name}` : ""}</p>
            <div className="mobile-task-actions"><NativeSelect aria-label="작업 보기" value={`${mode}:${view}`} onChange={event => {
                const [nextMode, nextView] = event.target.value.split(":");
                navigate({ taskMode: nextMode, taskView: nextView, item: "", savedView: "" });
            }}>
                <optgroup label="간편"><option value="simple:today">오늘</option><option value="simple:inbox">Inbox</option><option value="simple:upcoming">예정</option></optgroup>
                <optgroup label="정교"><option value="complex:list">목록</option><option value="complex:board">보드</option><option value="complex:calendar">캘린더</option><option value="complex:insights">집계</option></optgroup>
            </NativeSelect>
                <ActionButton ref={mobileFilterTrigger} type="button" onClick={() => setMobileFilterOpen(true)}>보기·필터{filterCount ? ` ${filterCount}` : ""}</ActionButton>
                {view !== "board" && <ActionButton ref={mobileAddTrigger} type="button" className="primary" onClick={() => setMobileAddOpen(true)}>+ 추가</ActionButton>}
                {mode === "complex" && (view === "list" || view === "board") && <ActionButton type="button" onClick={() => { setMobileSelecting(value => !value); if (mobileSelecting) setSelectedIds(new Set()); }}>{mobileSelecting ? "선택 취소" : "선택"}</ActionButton>}
            </div>
        </div>}
        <PageHead title="작업" eyebrow="TASK WORKSPACE"
            description="하나의 작업 목록을 오늘의 할 일과 정교한 프로젝트 관리 보기로 전환합니다.">
            <ActionButton onClick={() => setNewDetailed(true)}>+ 상세 작업</ActionButton>
        </PageHead>
        <div className="task-mode-bar">
            <SegmentedControl label="작업 화면 밀도" name="task-mode" value={mode} onValueChange={value => changeMode(value as "simple" | "complex")}>
                <SegmentedControlItem value="simple">간편 · To-do</SegmentedControlItem>
                <SegmentedControlItem value="complex">정교 · 프로젝트</SegmentedControlItem>
            </SegmentedControl>
            <span className="muted small">같은 작업 데이터 · 보기만 변경</span>
        </div>
        {mode === "simple" ? <p className="task-simple-status"><strong>오늘 {tasks.filter(task => isOpen(task) && (task.data.planned_date === today || !!task.data.due_date && task.data.due_date <= today)).length}개</strong><span>열려 있는 작업 {tasks.filter(isOpen).length}개 · 제목만 적으면 바로 추가됩니다.</span></p> : <div className="task-metrics" aria-label="작업 현황">
            <MetricCard variant="featured" label="오늘 처리할 일" value={tasks.filter(task => isOpen(task) && (task.data.planned_date === today || !!task.data.due_date && task.data.due_date <= today)).length} detail="오늘 예정 또는 마감" />
            <MetricCard variant="compact" label="진행 중" value={tasks.filter(task => isOpen(task)).length} detail="완료·취소 제외" />
            <MetricCard variant="compact" label="완료" value={tasks.filter(task => task.data.state === "done").length} detail="현재 작업 기준" />
        </div>}
        <Card className="task-compose" variant="default"><CardContent><form className="task-quick-add" onSubmit={event => { void quickAdd(event); }}>
            <Field label="빠른 할 일"><Input value={quickTitle} maxLength={300} onChange={event => setQuickTitle(event.target.value)} placeholder="지금 할 일을 한 줄로 적으세요" /></Field>
            {mode === "complex" && <Field label="실행 예정일"><Input type="date" value={quickDate} onChange={event => setQuickDate(event.target.value)} /></Field>}
            <ActionButton className="primary" type="submit" disabled={busyId === "new" || !quickTitle.trim()}>{busyId === "new" ? "추가 중…" : "+ 추가"}</ActionButton>
        </form>{mode === "simple" && <p className="task-quick-hint">{view === "inbox" ? "Inbox에 날짜 없이 보관합니다." : view === "upcoming" ? "내일 예정으로 추가합니다." : "오늘 할 일로 추가합니다."} 날짜·완료 조건은 정교 보기에서 바꿀 수 있습니다.</p>}</CardContent></Card>
        {error && <div className="task-error-block"><ErrorNotice error={error} />
            {sessionStorage.getItem(boardErrorKey) && <ActionButton type="button" onClick={() => reportBoardError("")}>알림 닫기</ActionButton>}
        </div>}
        <Tabs className="task-tabs-root" value={view} onValueChange={candidate => navigate({ taskView: candidate, item: "", savedView: "" })}>
            <TabsList className="task-view-bar" variant="line" aria-label="작업 보기">
            {(mode === "simple" ? simpleViews : complexViews).map(candidate => <TabsTrigger key={candidate} value={candidate}>
                {{ today: "오늘", inbox: "Inbox", upcoming: "예정", list: "목록", board: "보드", calendar: "캘린더", insights: "집계" }[candidate]}
            </TabsTrigger>)}
            </TabsList>
        {mode === "simple" ? <div className="task-simple-tools">
            <SearchInput label="작업 검색" value={query} onValueChange={setQuery} onSearch={() => {}} placeholder="할 일 검색" submitLabel="찾기" />
            <Accordion type="single" collapsible className="task-priority-options"><AccordionItem value="priority"><AccordionTrigger>지금 가능한 작업 찾기 · GTD / ABC</AccordionTrigger><AccordionContent><div className="task-tools">
                <Field label="우선순위 기준"><NativeSelect value={lens} onChange={event => { const next = event.target.value as Lens; setLens(next); setTaskSort(next); }}><option value="gtd">GTD · 지금 가능한 행동</option><option value="abc">ABC · 목표와 가치</option></NativeSelect></Field>
                {lens === "gtd" && <Field label="가용 시간"><NativeSelect value={minutes} onChange={event => setMinutes(Number(event.target.value))}><option value={0}>제한 없음</option><option value={15}>15분</option><option value={30}>30분</option><option value={60}>60분</option><option value={120}>120분</option></NativeSelect></Field>}
            </div></AccordionContent></AccordionItem></Accordion>
        </div> : <div className="task-tools">
            <SearchInput label="작업 검색" value={query} onValueChange={setQuery} onSearch={() => {}} placeholder="제목·목록·맥락·목표" submitLabel="찾기" />
            <Field label="상태"><NativeSelect value={status} onChange={event => setStatus(event.target.value)}>
                <option value="all">전체</option><option value="open">진행 중 전체</option>
                {states.map(state => <option key={state} value={state}>{statusLabels[state]}</option>)}
            </NativeSelect></Field>
            {(view === "list" || view === "board") && <Field label="우선순위 기준"><NativeSelect value={lens} onChange={event => { const next = event.target.value as Lens; setLens(next); setTaskSort(next); }}>
                <option value="gtd">GTD · 지금 가능한 행동</option><option value="abc">ABC · 목표와 가치</option>
            </NativeSelect></Field>}
            {(view === "list" || view === "board") && lens === "gtd" && <><Field label="가용 시간"><NativeSelect value={minutes} onChange={event => setMinutes(Number(event.target.value))}>
                <option value={0}>제한 없음</option><option value={15}>15분</option><option value={30}>30분</option><option value={60}>60분</option><option value={120}>120분</option>
            </NativeSelect></Field>
                <Field label="현재 맥락"><Input value={context} onChange={event => setContext(event.target.value)} placeholder="예: desk" /></Field>
                    <Field label="현재 에너지"><NativeSelect value={energy} onChange={event => setEnergy(event.target.value)}>
                        <option value="any">제한 없음</option><option value="low">낮음</option><option value="medium">보통</option><option value="high">높음</option>
                    </NativeSelect></Field></>}
            {(view === "list" || view === "board") && <Field label="그룹"><NativeSelect value={view === "board" ? "state" : grouping}
                disabled={view === "board"} onChange={event => setGrouping(event.target.value as TaskViewSettings["grouping"])}>
                <option value="none">그룹 없음</option><option value="state">상태</option><option value="list">목록</option>
            </NativeSelect></Field>}
            {(view === "list" || view === "board") && <Field label="정렬"><NativeSelect value={taskSort} onChange={event => setTaskSort(event.target.value as TaskViewSettings["sort"])}>
                <option value="manual">보드 수동 순서</option><option value="gtd">GTD</option><option value="abc">ABC</option><option value="due_date">마감일</option>
            </NativeSelect></Field>}
            {view === "board" && <details className="task-card-fields"><summary>카드 표시 필드</summary>
                {(["list_name", "planned_date", "due_date", "estimated_minutes", "abc_priority", "context", "goal", "github_issue_url"] as const)
                    .map(field => <label key={field}><Checkbox checked={cardFields.includes(field)}
                        onCheckedChange={() => setCardFields(current => current.includes(field)
                            ? current.filter(value => value !== field) : [...current, field])} /> {field}</label>)}
            </details>}
        </div>}
        <div className="task-saved-views" aria-label="저장된 보기">
            <Field label="개인 저장 보기"><NativeSelect value={route.savedView || ""} onChange={event => {
                const found = savedViews.status === "ready" ? savedViews.data.find(candidate => candidate.id === event.target.value) : undefined;
                if (found) navigate({ savedView: found.id, taskMode: found.settings.mode, taskView: found.settings.view });
                else navigate({ savedView: "" });
            }}><option value="">현재 보기</option>
                {savedViews.status === "ready" && savedViews.data.map(saved => <option key={saved.id} value={saved.id}>
                    {saved.name}{saved.is_default ? " · 기본" : ""}</option>)}
            </NativeSelect></Field>
            <Field label="보기 이름"><Input value={savedName} maxLength={100} onChange={event => setSavedName(event.target.value)} placeholder="보기 이름" /></Field>
            <label className="task-default-view"><Checkbox checked={savedDefault} onCheckedChange={checked => setSavedDefault(checked === true)} /> 기본 보기</label>
            <ActionButton disabled={savedBusy || !savedName.trim()} onClick={() => { void saveView(false); }}>새 보기 저장</ActionButton>
            {activeSavedView && <><ActionButton disabled={savedBusy} onClick={() => { void saveView(true); }}>현재 보기 갱신</ActionButton>
                <ActionButton disabled={savedBusy} onClick={() => { void deleteView(); }}>보기 삭제</ActionButton></>}
            {savedViews.status === "error" && <span role="alert">저장된 보기를 불러오지 못했습니다. {savedViews.error}</span>}
        </div>
        {mode === "complex" && selectedIds.size > 0 && <div className="task-bulk-toolbar" role="region" aria-label="선택 작업 일괄 변경">
            <strong>{selectedIds.size}개 선택</strong>
            <ActionButton disabled={busyId === "bulk"} onClick={() => setSelectedIds(new Set())}>선택 해제</ActionButton>
            <Field label="상태"><NativeSelect value={bulkState} onChange={event => setBulkState(event.target.value as Task["data"]["state"])}>
                {states.map(state => <option key={state} value={state}>{statusLabels[state]}</option>)}
            </NativeSelect></Field>
            {bulkState === "cancelled" && <Field label="취소 사유"><Input value={bulkReason} onChange={event => setBulkReason(event.target.value)} /></Field>}
            <ActionButton disabled={busyId === "bulk" || bulkState === "cancelled" && !bulkReason.trim()}
                onClick={() => { void changeTasks([...selectedIds], { state: bulkState,
                    ...(bulkState === "cancelled" ? { cancellation_reason: bulkReason.trim() } : {}) }); }}>상태 적용</ActionButton>
            <Field label="실행 예정일"><Input type="date" value={bulkDate} onChange={event => setBulkDate(event.target.value)} /></Field>
            <ActionButton disabled={busyId === "bulk" || !bulkDate} onClick={() => { void changeTasks([...selectedIds], { planned_date: bulkDate }); }}>날짜 적용</ActionButton>
            <ActionButton disabled={busyId === "bulk"} onClick={() => { void changeTasks([...selectedIds], { planned_date: "" }); }}>날짜 지우기</ActionButton>
            <Field label="목록"><Input value={bulkList} onChange={event => setBulkList(event.target.value)} placeholder="목록 이름" maxLength={80} /></Field>
            <ActionButton disabled={busyId === "bulk" || !bulkList.trim()} onClick={() => { void changeTasks([...selectedIds], { list_name: bulkList.trim() }); }}>목록 적용</ActionButton>
        </div>}
        <p className="task-result-count">{visible.length}개 작업 · {view === "insights" ? "현재 필터의 상태 분포" : view === "calendar" ? "실행 예정일·마감일 위치" : view === "board" ? "보드는 상태별 그룹 · 정렬은 보드에서 선택" : taskSort === "gtd" ? "다음 행동·맥락·시간·에너지 순" : taskSort === "abc" ? "A/B/C 가치·그룹 내 순서" : taskSort === "due_date" ? "마감일 순" : "수동 순서"} · 미산정 항목은 목록에 남깁니다.</p>
        {mode === "complex" && visible.length > 0 && <ActionButton className="small" disabled={busyId === "bulk"}
            onClick={() => setSelectedIds(new Set(visible.map(task => task.id)))}>현재 보기 전체 선택</ActionButton>}
        <TabsContent value={view} className="task-view-content">
        {view === "board" && <TaskBoard projectId={projectId} tasks={visible} lens={lens}
            savedSort={activeSavedView ? taskSort : null} onSortChange={setTaskSort}
            selectedIds={selectedIds} onSelect={selectTask} cardFields={cardFields}
            onChanged={onChanged} onError={reportBoardError} />}
        {view === "calendar" && <TaskCalendar tasks={visible} month={month} onMonth={setMonth} />}
        {view === "insights" && <TaskInsights tasks={visible} />}
        {(view === "today" || view === "inbox" || view === "upcoming" || view === "list") && list(visible)}
        {selected && <Card className="task-selected" ref={selectedRef}><ActionButton type="button" className="mobile-detail-back" onClick={() => navigate({ item: "" })}>← 작업 목록</ActionButton><div className="section-head"><h2>선택한 작업</h2>
            <ActionButton className="small" onClick={() => navigate({ item: "" })}>닫기</ActionButton></div>
            {mode === "complex" ? <RecordEditor key={selected.id} item={selected} items={items} catalog={catalog} userId={userId} onChanged={onChanged} />
                : <div><p><strong>{selected.title}</strong> · {statusLabels[selected.data.state]}</p><p>{selected.body || "추가 설명 없음"}</p>
                    <ActionButton onClick={() => navigate({ taskMode: "complex", taskView: "list" })}>정교 보기에서 상세 편집</ActionButton></div>}</Card>}
        </TabsContent></Tabs>
        {newDetailed && <NewItem kind="task" projectId={projectId} userId={userId} items={items} catalog={catalog}
            onClose={() => setNewDetailed(false)} onCreated={item => { setNewDetailed(false); onChanged(); navigate({ taskMode: "complex", taskView: "list", item: item.id, savedView: "" }); }} />}
        {mobile && mobileFilterOpen && <Modal title="보기·필터" className="mobile-task-dialog" onClose={() => { setMobileFilterOpen(false); window.requestAnimationFrame(() => mobileFilterTrigger.current?.focus()); }}>
            <div className="mobile-task-sheet-fields"><Field label="작업 화면"><NativeSelect value={mode} onChange={event => changeMode(event.target.value as "simple" | "complex")}><option value="simple">간편 · To-do</option><option value="complex">정교 · 프로젝트</option></NativeSelect></Field>
                <Field label="개인 저장 보기"><NativeSelect value={route.savedView || ""} onChange={event => {
                    const found = savedViews.status === "ready" ? savedViews.data.find(candidate => candidate.id === event.target.value) : undefined;
                    if (found) navigate({ savedView: found.id, taskMode: found.settings.mode, taskView: found.settings.view });
                    else navigate({ savedView: "" });
                }}><option value="">현재 보기</option>{savedViews.status === "ready" && savedViews.data.map(saved => <option key={saved.id} value={saved.id}>{saved.name}{saved.is_default ? " · 기본" : ""}</option>)}</NativeSelect></Field>
                {mode === "complex" && <div className="mobile-saved-view-actions"><Field label="보기 이름"><Input value={savedName} maxLength={100} onChange={event => setSavedName(event.target.value)} placeholder="보기 이름" /></Field>
                    <label className="task-default-view"><Checkbox checked={savedDefault} onCheckedChange={checked => setSavedDefault(checked === true)} /> 기본 보기</label>
                    <ActionButton type="button" disabled={savedBusy || !savedName.trim()} onClick={() => { void saveView(false); }}>새 보기 저장</ActionButton>
                    {activeSavedView && <><ActionButton type="button" disabled={savedBusy} onClick={() => { void saveView(true); }}>현재 보기 갱신</ActionButton>
                        <ActionButton type="button" disabled={savedBusy} onClick={() => { void deleteView(); }}>보기 삭제</ActionButton></>}
                    {savedViews.status === "error" && <span role="alert">저장된 보기를 불러오지 못했습니다. {savedViews.error}</span>}
                </div>}
                <SearchInput label="작업 검색" value={query} onValueChange={setQuery} onSearch={() => undefined} placeholder="제목·목록·맥락·목표" />
                {mode === "complex" && <Field label="상태"><NativeSelect value={status} onChange={event => setStatus(event.target.value)}><option value="all">전체</option><option value="open">진행 중 전체</option>{states.map(state => <option key={state} value={state}>{statusLabels[state]}</option>)}</NativeSelect></Field>}
                <Field label="우선순위 기준"><NativeSelect value={lens} onChange={event => { const next = event.target.value as Lens; setLens(next); setTaskSort(next); }}><option value="gtd">GTD · 지금 가능한 행동</option><option value="abc">ABC · 목표와 가치</option></NativeSelect></Field>
                {lens === "gtd" && <><Field label="가용 시간"><NativeSelect value={minutes} onChange={event => setMinutes(Number(event.target.value))}><option value={0}>제한 없음</option><option value={15}>15분</option><option value={30}>30분</option><option value={60}>60분</option><option value={120}>120분</option></NativeSelect></Field>
                    {mode === "complex" && <><Field label="현재 맥락"><Input value={context} onChange={event => setContext(event.target.value)} placeholder="예: desk" /></Field><Field label="현재 에너지"><NativeSelect value={energy} onChange={event => setEnergy(event.target.value)}><option value="any">제한 없음</option><option value="low">낮음</option><option value="medium">보통</option><option value="high">높음</option></NativeSelect></Field></>}</>}
                {mode === "complex" && (view === "list" || view === "board") && <Field label="정렬"><NativeSelect value={taskSort} onChange={event => setTaskSort(event.target.value as TaskViewSettings["sort"])}><option value="manual">보드 수동 순서</option><option value="gtd">GTD</option><option value="abc">ABC</option><option value="due_date">마감일</option></NativeSelect></Field>}
                {mode === "complex" && view === "list" && <Field label="그룹"><NativeSelect value={grouping} onChange={event => setGrouping(event.target.value as TaskViewSettings["grouping"])}><option value="none">그룹 없음</option><option value="state">상태</option><option value="list">목록</option></NativeSelect></Field>}
                {error && <ErrorNotice error={error} />}
                <ActionButton type="button" className="primary" onClick={() => setMobileFilterOpen(false)}>결과 보기 · {visible.length}개</ActionButton>
            </div>
        </Modal>}
        {mobile && mobileAddOpen && <Modal title="할 일 추가" className="mobile-task-dialog" onClose={() => { setMobileAddOpen(false); window.requestAnimationFrame(() => mobileAddTrigger.current?.focus()); }}><form className="mobile-task-sheet-fields" onSubmit={event => { void quickAdd(event); }}>
            <p className="muted small">{mode === "simple" ? view === "inbox" ? "Inbox에 날짜 없이 수집합니다." : view === "upcoming" ? "내일 실행할 일로 추가합니다." : "오늘 실행할 일로 추가합니다." : "현재 프로젝트의 개인 작업으로 추가합니다."}</p>
            <Field label="할 일 제목"><Input autoFocus required maxLength={300} value={quickTitle} onChange={event => setQuickTitle(event.target.value)} /></Field>
            {mode === "complex" && <Field label="실행 예정일"><Input type="date" value={quickDate} onChange={event => setQuickDate(event.target.value)} /></Field>}
            {error && <ErrorNotice error={error} />}
            <ActionButton className="primary" type="submit" disabled={busyId === "new" || !quickTitle.trim()}>{busyId === "new" ? "추가 중…" : "추가"}</ActionButton>
        </form></Modal>}
        {mobile && mode === "complex" && selectedIds.size > 0 && <div className="mobile-selection-bar"><strong>선택 {selectedIds.size}개{[...selectedIds].filter(id => !visible.some(task => task.id === id)).length ? ` · 숨김 ${[...selectedIds].filter(id => !visible.some(task => task.id === id)).length}개` : ""}</strong><ActionButton ref={mobileBulkTrigger} type="button" className="primary" onClick={() => setMobileBulkOpen(true)}>일괄 변경</ActionButton></div>}
        {mobile && mobileBulkOpen && <Modal title={`${selectedIds.size}개 작업 일괄 변경`} className="mobile-task-dialog" onClose={() => { setMobileBulkOpen(false); window.requestAnimationFrame(() => mobileBulkTrigger.current?.focus()); }}><div className="mobile-task-sheet-fields">
            <p className="muted small">선택한 작업 전체에 적용합니다. 완료 조건을 충족하지 못하면 모두 거부됩니다.</p>
            <Field label="상태"><NativeSelect value={bulkState} onChange={event => setBulkState(event.target.value as Task["data"]["state"])}>{states.map(state => <option key={state} value={state}>{statusLabels[state]}</option>)}</NativeSelect></Field>
            {bulkState === "cancelled" && <Field label="취소 사유"><Input value={bulkReason} onChange={event => setBulkReason(event.target.value)} /></Field>}
            <ActionButton type="button" disabled={busyId === "bulk" || bulkState === "cancelled" && !bulkReason.trim()} onClick={() => { void changeTasks([...selectedIds], { state: bulkState, ...(bulkState === "cancelled" ? { cancellation_reason: bulkReason.trim() } : {}) }); }}>상태 적용</ActionButton>
            <Field label="실행 예정일"><Input type="date" value={bulkDate} onChange={event => setBulkDate(event.target.value)} /></Field>
            <ActionButton type="button" disabled={busyId === "bulk" || !bulkDate} onClick={() => { void changeTasks([...selectedIds], { planned_date: bulkDate }); }}>날짜 적용</ActionButton>
            <Field label="목록"><Input value={bulkList} onChange={event => setBulkList(event.target.value)} maxLength={80} /></Field>
            <ActionButton type="button" disabled={busyId === "bulk" || !bulkList.trim()} onClick={() => { void changeTasks([...selectedIds], { list_name: bulkList.trim() }); }}>목록 적용</ActionButton>
            {error && <ErrorNotice error={error} />}
        </div></Modal>}
    </section>;
}

function TaskCalendar({ tasks, month, onMonth }: { tasks: Task[]; month: Date; onMonth: (date: Date) => void }) {
    const mobile = useMobileViewport();
    const [selectedDay, setSelectedDay] = useState(localDay);
    const selectedDate = new Date(`${selectedDay}T12:00:00`);
    const weekStart = new Date(selectedDate);
    weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());
    const weekDays = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + index);
        return date;
    });
    const agenda = tasks.filter(task => task.data.planned_date === selectedDay || task.data.due_date === selectedDay);
    function changeWeek(offset: number) {
        const next = new Date(selectedDate);
        next.setDate(next.getDate() + offset * 7);
        setSelectedDay(localDay(next));
    }
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const first = new Date(start);
    first.setDate(1 - start.getDay());
    const days = Array.from({ length: 42 }, (_, index) => {
        const date = new Date(first);
        date.setDate(first.getDate() + index);
        return date;
    });
    return <div className="task-calendar">{mobile && <div className="mobile-calendar"><div className="mobile-calendar-week-head">
        <ActionButton type="button" aria-label="이전 주" onClick={() => changeWeek(-1)}>←</ActionButton>
        <strong>{selectedDate.toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}</strong>
        <ActionButton type="button" aria-label="다음 주" onClick={() => changeWeek(1)}>→</ActionButton>
    </div><div className="mobile-calendar-week" role="group" aria-label="주간 날짜">
        {weekDays.map(date => { const day = localDay(date); const count = tasks.filter(task => task.data.planned_date === day || task.data.due_date === day).length;
            return <ActionButton key={day} type="button" className={day === selectedDay ? "active" : ""} aria-pressed={day === selectedDay} onClick={() => setSelectedDay(day)}>
                <span>{date.toLocaleDateString("ko-KR", { weekday: "short" })}</span><strong>{date.getDate()}</strong><small>{count ? `${count}개` : "·"}</small>
            </ActionButton>;
        })}
    </div><div className="mobile-calendar-agenda"><h2>{selectedDate.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })} · {agenda.length}개</h2>
        {agenda.map(task => <RouteLink key={task.id} patch={{ item: task.id }} className="mobile-agenda-row"><strong>{task.title}</strong><small>{task.data.planned_date === selectedDay ? "실행 예정" : ""}{task.data.planned_date === selectedDay && task.data.due_date === selectedDay ? " · " : ""}{task.data.due_date === selectedDay ? "마감" : ""}</small></RouteLink>)}
        {!agenda.length && <p className="muted">이 날짜에 표시할 작업이 없습니다.</p>}
        <ActionButton type="button" onClick={() => navigate({ taskView: "list" })}>날짜 없는 작업은 목록에서 보기</ActionButton>
    </div></div>}<div className="task-calendar-head">
        <ActionButton onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="이전 달">←</ActionButton>
        <h2>{month.toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}</h2>
        <ActionButton onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="다음 달">→</ActionButton>
    </div><div className="task-calendar-grid">{["일", "월", "화", "수", "목", "금", "토"].map(day => <span className="task-calendar-weekday" key={day}>{day}</span>)}
        {days.map(date => {
            const day = localDay(date);
            const scheduled = tasks.filter(task => task.data.planned_date === day || task.data.due_date === day);
            return <div className={`task-calendar-day ${date.getMonth() === month.getMonth() ? "" : "outside"}`} key={day}>
                <strong>{date.getDate()}</strong>{scheduled.map(task => <RouteLink patch={{ item: task.id }} key={task.id}>
                    {task.data.due_date === day ? "마감 · " : ""}{task.title}</RouteLink>)}
            </div>;
        })}</div><p className="hint">실행 예정일과 마감일을 함께 표시합니다. 날짜가 없는 작업은 목록 보기에서 확인합니다.</p></div>;
}

function TaskInsights({ tasks }: { tasks: Task[] }) {
    const total = tasks.length;
    const groups = [
        ...states.map(state => ({ label: statusLabels[state], count: tasks.filter(task => task.data.state === state).length })),
        { label: "마감 지남", count: tasks.filter(task => isOpen(task) && !!task.data.due_date && task.data.due_date < localDay()).length },
        ...(["A", "B", "C"] as const).map(priority => ({ label: `ABC ${priority}`, count: tasks.filter(task => task.data.abc_priority === priority).length })),
    ];
    const remainingMinutes = tasks.filter(isOpen).reduce((sum, task) => sum + task.data.estimated_minutes, 0);
    return <section className="task-insights" aria-label="작업 집계">
        <p>현재 조건의 작업 {total}건 · 진행 중 예상 소요 {remainingMinutes}분</p>
        <p className="hint">현재 스냅샷입니다. 완료 추세나 소요 시간 실측으로 해석하지 않습니다.</p>
        <BarList title="작업 분포" description="현재 필터 기준 · 상태 및 ABC 등급" max={Math.max(total, 1)} unit="건"
            items={groups.map((group, index) => ({ id: String(index), label: group.label ?? "기타", value: group.count }))} />
    </section>;
}
