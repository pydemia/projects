import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { DateTimeValue } from "./date-time-settings";
import { z } from "zod";
import { useAuthenticationDraft, type AuthenticationDraft } from "./auth-drafts";
import { canProject, useProjectCatalog, useProjectPermissions } from "./ProjectPermissions";
import { api, ApiError, errorMessage } from "./api";
import { loadDraft, navigate, useMobileViewport, useResource, useViewportQuery } from "./hooks";
import type { Route } from "./hooks";
import { NewItem, RecordEditor } from "./ItemsPage";
import { layoutSorts, readTaskViewMemory, taskListVariant, taskListVariants, taskProjectIds } from "./task-view-memory";
import { TaskContext } from "./TaskContext";
import { TaskTransfer } from "./TaskTransfer";
import { TaskNoteReferences } from "./TaskNoteReferences";
import { TaskBoard } from "./TaskBoard";
import { TaskGraph } from "./TaskGraph";
import { TaskParentEditor } from "./TaskParentEditor";
import { flattenTaskTree, subtreeDeadlineOrder, taskHierarchy, taskParents, type TaskTreeRow } from "./task-hierarchy";
import { defaultListFields, taskFieldLabel, TaskFieldCells, TaskFieldManager } from "./TaskFields";
import { TaskViewBar } from "./TaskViewBar";
import { TaskTitleEdit } from "./TaskTitleEdit";
import { TaskStoryChips, useTaskRelations } from "./StoryChips";
import { TaskListStatus } from "./TaskListStatus";
import { dataSchemas, statusLabels } from "./models";
import type { Catalog, Item, TaskFieldDefinition, TaskViewSettings } from "./models";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./pydemia-ui/dropdown-menu";
import { Input } from "./pydemia-ui/input";
import { Textarea } from "./pydemia-ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./pydemia-ui/accordion";
import { BarList } from "./pydemia-ui/bar-list";
import { Button } from "./pydemia-ui/button";
import { PortalScope } from "./pydemia-ui/foundation/portal-scope";
import { Checkbox } from "./pydemia-ui/checkbox";
import { NativeSelect } from "./pydemia-ui/native-select";
import { PageHeader } from "./pydemia-ui/page-header";
import { SearchInput } from "./pydemia-ui/search-input";
import { SegmentedControl, SegmentedControlItem } from "./pydemia-ui/segmented-control";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./pydemia-ui/tabs";
import { ActionButton, Empty, ErrorNotice, Field, Modal, RouteLink } from "./ui";
import "./task-management.css";

type Task = Extract<Item, { kind: "task" }>;
type CancellationTarget = Pick<Task, "id" | "project_id" | "revision" | "title" | "body" | "data">;
type Lens = "gtd" | "abc";
const states = ["todo", "in_progress", "in_review", "done", "cancelled"] as const;
const taskScopes = ["all", "today", "inbox", "upcoming"] as const;
const complexViews = ["list", "board", "graph", "calendar", "insights"] as const;
const deadlineLabels = ["기한 지남", "오늘 마감", "다음 마감", "마감일 없음", "종료"] as const;
const savedViewRoute = { taskScope: "", taskLayout: "", taskDensity: "", taskMode: "", taskView: "",
    taskListVariant: "", taskProjects: undefined, taskProject: "", q: undefined, taskStatus: "" };
const quickDraftSchema = z.object({quickTitle: z.string(), creationProject: z.string(), mobileAddOpen: z.boolean(), newDetailed: z.boolean(),
    savedName: z.string(), savedDefault: z.boolean()}).strict();
const cancellationDraftSchema = z.object({reason: z.string(), task: z.object({id: z.string().uuid(), project_id: z.string().uuid(),
    revision: z.number().int().positive(), title: z.string(), body: z.string(), data: dataSchemas.task.strict()}).strict()}).strict();

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

function todayGroup(task: Task, today: string): number {
    if (task.data.due_date && task.data.due_date < today) return 0;
    if (task.data.planned_date === today || task.data.due_date === today) return 1;
    return 2;
}
function todayTasks(tasks: Task[], today: string): Task[] {
    return [...tasks].sort((left, right) => todayGroup(left, today) - todayGroup(right, today));
}

function deadlineGroup(task: Task, today: string): number {
    if (!isOpen(task)) return 4;
    if (!task.data.due_date) return 3;
    if (task.data.due_date < today) return 0;
    return task.data.due_date === today ? 1 : 2;
}

function taskListGroups(tasks: Task[], grouping: TaskViewSettings["grouping"] | "today" | "deadline", today: string, deadlineTask?: (task: Task) => Task) {
    if (grouping === "none") return [];
    const groups = new Map<string, {key: string; label: string; state?: Task["data"]["state"]; tasks: Task[]}>();
    const ordered = grouping === "deadline" ? tasks : grouping === "today" ? todayTasks(tasks, today) : groupedTasks(tasks, grouping);
    for (const task of ordered) {
        const value = grouping === "deadline" ? deadlineGroup(deadlineTask?.(task) ?? task, today) : grouping === "today" ? todayGroup(task, today)
            : grouping === "state" ? task.data.state : task.data.list_name;
        const key = `${grouping}:${value}`;
        const label = typeof value === "number" ? (grouping === "deadline" ? deadlineLabels : ["마감 지남", "오늘", "미처리 계획"])[value]!
            : grouping === "state" ? statusLabels[task.data.state] ?? value : value;
        let group = groups.get(key);
        if (!group) {
            group = {key, label, state: grouping === "state" ? task.data.state : undefined, tasks: []};
            groups.set(key, group);
        }
        group.tasks.push(task);
    }
    return [...groups.values()];
}

function TaskDetailPanel({modal, panelRef, onClose, children}: {
    modal: boolean; panelRef: React.RefObject<HTMLDialogElement | null>; onClose: () => void; children: ReactNode;
}) {
    const [element, setElement] = useState<HTMLDialogElement | null>(null);
    const attach = useCallback((node: HTMLDialogElement | null) => {panelRef.current = node; setElement(node);}, [panelRef]);
    const nativeDialog = typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal === "function"
        && typeof HTMLDialogElement.prototype.show === "function" && typeof HTMLDialogElement.prototype.close === "function";
    const modalOpen = modal && nativeDialog;
    useLayoutEffect(() => {
        if (!element || !nativeDialog) return;
        if (element.open) element.close();
        if (modalOpen) element.showModal();
        else element.show();
    }, [element, modalOpen, nativeDialog]);
    return <dialog className="task-selected" data-presentation={modalOpen ? "modal" : "inline"}
        ref={attach} open={nativeDialog ? undefined : true}
        role={modalOpen ? "dialog" : "region"} aria-modal={modalOpen || undefined} aria-label="선택한 작업" tabIndex={-1}
        onCancel={event => {event.preventDefault(); onClose();}}
        onClick={event => {
            if (!modalOpen || event.target !== event.currentTarget) return;
            const {left, right, top, bottom} = event.currentTarget.getBoundingClientRect();
            if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) onClose();
        }}>
        <PortalScope container={element ?? undefined}>{children}</PortalScope>
    </dialog>;
}

export function TaskWorkspace({ projectId, userId, route, items, selectedItem, resultsLoading = false, resultsIncomplete = false, catalog, totalOpen, onOrderingChanged, onChanged }: {
    projectId: string; userId: string; route: Route; items: Item[];
    selectedItem?: Item; resultsLoading?: boolean; resultsIncomplete?: boolean;
    catalog?: Catalog; totalOpen?: number; onOrderingChanged?: (ordering: {sort: TaskViewSettings["sort"]; context: string; minutes: number; energy: TaskViewSettings["energy"]}) => void; onChanged: () => void;
}) {
    const can = useProjectPermissions();
    const relations = useTaskRelations();
    const parents = useMemo(() => taskParents(relations.links), [relations.links]);
    const accessKey = useProjectCatalog().map(project => `${project.id}:${project.access?.access_revision}`).sort().join(";");
    const quickRecovery: AuthenticationDraft<z.infer<typeof quickDraftSchema>> = useAuthenticationDraft(`workspace:${projectId || "global"}:creation`, quickDraftSchema,
        () => quickTitle || mobileAddOpen || newDetailed || savedName ? {quickTitle, creationProject, mobileAddOpen, newDetailed, savedName, savedDefault} : null);
    const tasks = useMemo(() => items.filter((item): item is Task => item.kind === "task"), [items]);
    const taskCache = useRef(new Map<string, Task>());
    for (const task of tasks) if ((taskCache.current.get(task.id)?.revision ?? 0) <= task.revision) taskCache.current.set(task.id, task);
    if (selectedItem?.kind === "task" && (taskCache.current.get(selectedItem.id)?.revision ?? 0) <= selectedItem.revision) taskCache.current.set(selectedItem.id, selectedItem);
    const memoryKey = `projects:task-view-memory:${userId}:${projectId || "global"}`;
    const memory = useMemo(() => readTaskViewMemory(memoryKey), [memoryKey]);
    const remembered = route.savedView ? undefined : memory?.settings;
    const mobile = useMobileViewport();
    const wide = useViewportQuery("(min-width: 1181px)");
    const mode = route.taskDensity ? route.taskDensity === "detailed" ? "complex" : "simple" : route.taskMode ? route.taskMode === "complex" ? "complex" : "simple" : remembered?.mode ?? "simple";
    const scope = taskScopes.find(candidate => candidate === route.taskScope) ??
        taskScopes.find(candidate => candidate === route.taskView) ?? remembered?.task_scope ?? "all";
    const requestedView = complexViews.find(candidate => candidate === route.taskLayout) ??
        complexViews.find(candidate => candidate === route.taskView) ?? complexViews.find(candidate => candidate === remembered?.view) ?? "list";
    const view = requestedView;
    const listVariant = taskListVariant(route.taskListVariant) ?? taskListVariant(remembered?.list_variant);
    const deadlineList = view === "list" && listVariant === "deadline";
    const splitList = view === "list" && listVariant === "split";
    const detailModal = view === "list" && !mobile && (!splitList || !wide);
    const projectFilters = projectId ? [] : taskProjectIds(route, remembered);
    const projectFilterKey = projectFilters.join(",");
    const creationProjects = useResource("task-create-projects", signal => api.projects(signal));
    const [creationProject, setCreationProject] = useState(quickRecovery.restored?.creationProject ?? projectId);
    const transferDestination = useRef("");
    const [transferIds, setTransferIds] = useState<string[]>([]);
    const [quickTitle, setQuickTitle] = useState(quickRecovery.restored?.quickTitle ?? "");
    useEffect(() => {
        if (projectId) { setCreationProject(projectId); return; }
        if (creationProjects.status !== "ready") return;
        // Preserve a recovered draft's project. A denied target must be chosen
        // explicitly instead of silently replaying the draft in another project.
        if (creationProject) return;
        if (creationProjects.data.some(project => project.id === creationProject && canProject(project, "task.create"))) return;
        let rememberedProject = "";
        try { rememberedProject = sessionStorage.getItem(`projects:task-create:${userId}`) ?? localStorage.getItem(`projects:last-project:${userId}`) ?? ""; } catch { /* URL/project list still provides a valid fallback. */ }
        setCreationProject(creationProjects.data.filter(project => canProject(project, "task.create") && can(project.id, "task.create")).find(project => project.id === rememberedProject)?.id ?? creationProjects.data.find(project => canProject(project, "task.create"))?.id ?? "");
    }, [projectId, userId, creationProjects.status, creationProjects.data]);
    const query = route.qPresent || route.q || route.savedView ? route.q : remembered?.query ?? "";
    const setQuery = (q: string) => navigate({ q });
    const status = route.taskStatus || remembered?.status || "open";
    const setStatus = (taskStatus: string) => navigate({ taskStatus });
    const [lens, setLens] = useState<Lens>(remembered?.lens ?? "gtd");
    const [minutes, setMinutes] = useState(remembered?.minutes ?? 0);
    const [context, setContext] = useState(remembered?.context ?? "");
    const [energy, setEnergy] = useState<string>(remembered?.energy ?? "any");
    const [grouping, setGrouping] = useState<TaskViewSettings["grouping"]>(remembered?.grouping ?? "state");
    const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
    const [collapsedTasks, setCollapsedTasks] = useState<ReadonlySet<string>>(() => new Set());
    const groupId = useId();
    const [sortByLayout, setSortByLayout] = useState(() => layoutSorts(remembered));
    const layoutSort = view === "board" ? !projectId && sortByLayout.board === "manual" ? lens : sortByLayout.board : sortByLayout.list;
    const taskSort = deadlineList ? "deadline" : layoutSort;
    const setTaskSort = (sort: TaskViewSettings["sort"]) => setSortByLayout(current => view === "board"
        ? {...current, board: sort === "deadline" ? "due_date" : sort} : {...current, list: sort});
    useEffect(() => {onOrderingChanged?.({sort: layoutSort, context, minutes, energy: energy as TaskViewSettings["energy"]});}, [layoutSort, context, minutes, energy, onOrderingChanged]);
    const [cardFields, setCardFields] = useState<TaskViewSettings["card_fields"]>(remembered?.card_fields ?? ["list_name", "due_date"]);
    const [listFields, setListFields] = useState<string[]>(remembered?.list_fields ?? defaultListFields);
    const [fieldManagerOpened, setFieldManagerOpened] = useState(false);
    const [createdFields, setCreatedFields] = useState<TaskFieldDefinition[]>([]);
    const needDefinitions = fieldManagerOpened || [...listFields, ...cardFields].some(key => key.startsWith("custom:")) || tasks.some(task => Object.keys(task.data.custom_fields ?? {}).length > 0);
    const fieldDefinitions = useResource(`task-fields:${userId}:${projectId}:${needDefinitions}:${accessKey}`, signal => needDefinitions ? api.taskFields(signal, projectId || undefined) : Promise.resolve([]));
    const definitions = [...new Map([...(fieldDefinitions.status === "ready" ? fieldDefinitions.data : []), ...createdFields].filter(field => !field.project_id || can(field.project_id, "project.read")).map(field => [`${field.project_id ?? "library"}:${field.id}`, field])).values()];
    const fieldManagerProps = {projectId, definitions, onOpen: () => setFieldManagerOpened(true), loading: needDefinitions && fieldDefinitions.status === "loading", error: fieldDefinitions.status === "error" ? fieldDefinitions.error : "", onRetry: fieldDefinitions.reload,
        onCreated: (field: TaskFieldDefinition) => {setCreatedFields(current => [...current, field]); fieldDefinitions.reload();}};
    const selectionKey = `projects:task-selection:${userId}:${projectId}`;
    const bulkDraftKey = `projects:task-bulk-draft:${userId}:${projectId}`;
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => readSelected(selectionKey));
    const [selectionAnchor, setSelectionAnchor] = useState("");
    const [bulkState, setBulkState] = useState<Task["data"]["state"]>(() => readBulkDraft(bulkDraftKey).state);
    const [bulkDate, setBulkDate] = useState(() => readBulkDraft(bulkDraftKey).date);
    const [bulkList, setBulkList] = useState(() => readBulkDraft(bulkDraftKey).list);
    const [bulkReason, setBulkReason] = useState(() => readBulkDraft(bulkDraftKey).reason);
    const [savedName, setSavedName] = useState(quickRecovery.restored?.savedName ?? "");
    const [savedDefault, setSavedDefault] = useState(quickRecovery.restored?.savedDefault ?? false);
    const [savedBusy, setSavedBusy] = useState(false);
    const savedViews = useResource(`task-views:${projectId}`, signal => api.taskViews(projectId, signal));
    const appliedSavedId = useRef("");
    const recoveredSavedName = useRef(!!quickRecovery.restored);
    const [restoreGeneration, setRestoreGeneration] = useState(0);
    const [calendarField, setCalendarField] = useState<"planned" | "due">(remembered?.calendar_date_field ?? "planned");
    const [month, setMonth] = useState(() => memory ? new Date(`${memory.month}-01T12:00:00`) : new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [anchors, setAnchors] = useState(memory?.anchors ?? {});
    const workspaceRef = useRef<HTMLElement>(null);
    const [newDetailed, setNewDetailed] = useState(quickRecovery.restored?.newDetailed ?? false);
    const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
    const [mobileAddOpen, setMobileAddOpen] = useState(quickRecovery.restored?.mobileAddOpen ?? false);
    const [mobileBulkOpen, setMobileBulkOpen] = useState(() => readBulkDraft(bulkDraftKey).open);
    const mobileFilterTrigger = useRef<HTMLButtonElement>(null);
    const mobileAddTrigger = useRef<HTMLButtonElement>(null);
    const mobileBulkTrigger = useRef<HTMLButtonElement>(null);
    const [mobileSelecting, setMobileSelecting] = useState(() => readSelected(selectionKey).size > 0);
    const [busyId, setBusyId] = useState("");
    const cancellationRecovery: AuthenticationDraft<z.infer<typeof cancellationDraftSchema>> = useAuthenticationDraft(`workspace:${projectId || "global"}:cancellation`, cancellationDraftSchema,
        () => cancellingTask ? {reason: cancellationReason, task: {id: cancellingTask.id, project_id: cancellingTask.project_id,
            revision: cancellingTask.revision, title: cancellingTask.title, body: cancellingTask.body, data: cancellingTask.data}} : null);
    const [cancellingTask, setCancellingTask] = useState<CancellationTarget | null>(cancellationRecovery.restored?.task ?? null);
    const [cancellationReason, setCancellationReason] = useState(cancellationRecovery.restored?.reason ?? "");
    useEffect(() => {
        const revoked = new Set<string>();
        for (const [id, task] of taskCache.current) if (!can(task.project_id, "project.read")) {revoked.add(id); taskCache.current.delete(id);}
        if (revoked.size) {
            setSelectedIds(current => new Set([...current].filter(id => !revoked.has(id))));
            setTransferIds(current => current.filter(id => !revoked.has(id)));
        }
        if (cancellingTask && !can(cancellingTask.project_id, "project.read")) setCancellingTask(null);
    }, [accessKey]);
    const boardErrorKey = `projects:board-error:${projectId}`;
    const [error, setError] = useState(() => sessionStorage.getItem(boardErrorKey) ?? "");
    function reportBoardError(message: string) {
        if (message) sessionStorage.setItem(boardErrorKey, message);
        else sessionStorage.removeItem(boardErrorKey);
        setError(message);
    }
    const selectedRef = useRef<HTMLDialogElement>(null);
    const today = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
    const cachedSelected = taskCache.current.get(route.item);
    const selected = cachedSelected && can(cachedSelected.project_id, "project.read") ? cachedSelected : undefined;
    function openTask(id: string) {
        if (selected?.id === id) {
            focusSelectedTask();
            return;
        }
        navigate({item: id});
    }
    function focusSelectedTask() {
        const panel = selectedRef.current;
        if (!panel) return;
        panel.scrollTop = 0;
        panel.focus({preventScroll: true});
        if (!detailModal) panel.scrollIntoView?.({block: mobile ? "start" : "nearest", inline: "nearest"});
    }
    const activeSavedView = savedViews.status === "ready"
        ? savedViews.data.find(candidate => candidate.id === route.savedView) : undefined;
    const savedDirty = !!activeSavedView && (
        view !== (complexViews.includes(activeSavedView.settings.view as typeof complexViews[number]) ? activeSavedView.settings.view : "list") ||
        mode !== activeSavedView.settings.mode ||
        scope !== (activeSavedView.settings.task_scope ?? (taskScopes.includes(activeSavedView.settings.view as typeof taskScopes[number]) ? activeSavedView.settings.view : "all")) ||
        query !== activeSavedView.settings.query || status !== activeSavedView.settings.status ||
        lens !== activeSavedView.settings.lens || minutes !== activeSavedView.settings.minutes ||
        context !== activeSavedView.settings.context || energy !== activeSavedView.settings.energy ||
        (view === "board" ? "state" : grouping) !== activeSavedView.settings.grouping || JSON.stringify(sortByLayout) !== JSON.stringify(layoutSorts(activeSavedView.settings)) ||
        calendarField !== (activeSavedView.settings.calendar_date_field ?? "planned") ||
        listVariant !== taskListVariant(activeSavedView.settings.list_variant) ||
        (!projectId && projectFilterKey !== taskProjectIds({}, activeSavedView.settings).join(",")) ||
        JSON.stringify(cardFields) !== JSON.stringify(activeSavedView.settings.card_fields) ||
        JSON.stringify(listFields) !== JSON.stringify(activeSavedView.settings.list_fields ?? defaultListFields)
    );
    const settings: TaskViewSettings = {schema_version: 2, task_scope: scope, calendar_date_field: calendarField, mode, view, query, status, lens, minutes, context, energy: energy as TaskViewSettings["energy"], grouping: view === "board" ? "state" : grouping, sort: taskSort, layout_sorts: sortByLayout, card_fields: cardFields, list_fields: listFields, list_variant: listVariant ?? null, project_ids: projectFilters};
    useEffect(() => {
        if (savedViews.status !== "ready") return;
        if (!route.savedView && !route.taskView && !route.taskLayout && !route.taskScope && !route.taskDensity && !route.taskListVariant && route.taskProjects === undefined && !remembered) {
            const preferred = savedViews.data.find(candidate => candidate.is_default);
            if (preferred) navigate({ savedView: preferred.id });
        }
        if (!route.savedView) { appliedSavedId.current = ""; return; }
        const found = savedViews.data.find(candidate => candidate.id === route.savedView);
        if (!found) return;
        if (appliedSavedId.current === found.id && (projectId || route.taskProjects !== undefined)) {
            setSavedName(found.name); setSavedDefault(found.is_default); return;
        }
        appliedSavedId.current = found.id;
        if (recoveredSavedName.current) recoveredSavedName.current = false;
        else {setSavedName(found.name); setSavedDefault(found.is_default);}
        setLens(found.settings.lens); setMinutes(found.settings.minutes);
        setContext(found.settings.context); setEnergy(found.settings.energy);
        setGrouping(found.settings.grouping); setSortByLayout(layoutSorts(found.settings));
        setCardFields(found.settings.card_fields); setCalendarField(found.settings.calendar_date_field ?? "planned");
        setListFields(found.settings.list_fields ?? defaultListFields);
        const patch = {taskDensity: route.taskDensity || (found.settings.mode === "complex" ? "detailed" : "compact"), taskLayout: route.taskLayout || (complexViews.includes(found.settings.view as typeof complexViews[number]) ? found.settings.view : "list"), taskScope: route.taskScope || found.settings.task_scope || (taskScopes.includes(found.settings.view as typeof taskScopes[number]) ? found.settings.view : "all"), q: route.qPresent ? route.q : found.settings.query, taskStatus: route.taskStatus || found.settings.status,
            taskListVariant: taskListVariant(route.taskListVariant) ?? found.settings.list_variant ?? "",
            taskProjects: projectId ? undefined : route.taskProjects ?? taskProjectIds(route, found.settings).join(",")};
        if (route.taskDensity !== patch.taskDensity || route.taskLayout !== patch.taskLayout || route.taskScope !== patch.taskScope ||
            route.q !== patch.q || route.taskStatus !== patch.taskStatus || (route.taskListVariant || "") !== patch.taskListVariant || route.taskProjects !== patch.taskProjects) navigate(patch, true);
    }, [savedViews.status, savedViews.data, route.savedView, route.taskMode, route.taskView, restoreGeneration]);

    useEffect(() => {
        if (!remembered || route.savedView) return;
        const patch = {taskScope: route.taskScope || scope, taskLayout: route.taskLayout || view, taskDensity: route.taskDensity || (mode === "complex" ? "detailed" : "compact"), q: query, taskStatus: status,
            taskListVariant: listVariant ?? "", taskProjects: projectId ? undefined : route.taskProjects ?? (projectFilterKey || undefined)};
        // An explicit return URL is already complete. Rewriting it would discard
        // unrelated query parameters and its fragment after authentication.
        if (route.taskScope === patch.taskScope && route.taskLayout === patch.taskLayout && route.taskDensity === patch.taskDensity &&
            route.q === patch.q && route.taskStatus === patch.taskStatus && (route.taskListVariant || "") === patch.taskListVariant && route.taskProjects === patch.taskProjects) return;
        navigate(patch, true);
    }, [memoryKey]);
    useEffect(() => {
        try { sessionStorage.setItem(memoryKey, JSON.stringify({settings, month: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`, anchors})); }
        catch { /* The current view remains available if session storage is full. */ }
    }, [memoryKey, scope, mode, view, query, status, lens, minutes, context, energy, grouping, taskSort, sortByLayout, cardFields, listFields, calendarField, month, anchors, listVariant, projectFilterKey]);
    useEffect(() => {
        if (route.item) {setAnchors(current => current[view] === route.item ? current : {...current, [view]: route.item}); return;}
        const anchor = anchors[view];
        if (!anchor) return;
        const frame = window.requestAnimationFrame(() => {
            const link = workspaceRef.current?.querySelector<HTMLElement>(`[data-task-title-id="${anchor}"] :is(.task-open-button, .task-board-title, button[data-ui="inline-edit-value"]), [data-task-graph-id="${anchor}"]`) ?? Array.from(workspaceRef.current?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [])
                .find(candidate => new URL(candidate.href, location.href).searchParams.get("item") === anchor);
            const groupTrigger = link?.closest("[hidden]")?.closest(".task-list-group")?.querySelector<HTMLButtonElement>(".task-group-heading button");
            const parent = parents.get(anchor);
            const parentTrigger = link?.closest("[hidden]") && parent ? workspaceRef.current?.querySelector<HTMLButtonElement>(`[data-subtask-toggle="${parent}"]:not([hidden] *)`) : null;
            const target = parentTrigger ?? groupTrigger ?? link;
            target?.scrollIntoView?.({block: "nearest", behavior: "auto"});
            target?.focus({preventScroll: true});
        });
        return () => window.cancelAnimationFrame(frame);
    }, [route.item, view]);
    useEffect(() => {
        sessionStorage.setItem(selectionKey, JSON.stringify([...selectedIds]));
    }, [selectedIds, selectionKey]);
    useEffect(() => {
        if (mobileBulkOpen) sessionStorage.setItem(bulkDraftKey, JSON.stringify({ open: true, state: bulkState, date: bulkDate, list: bulkList, reason: bulkReason }));
        else sessionStorage.removeItem(bulkDraftKey);
    }, [bulkDraftKey, mobileBulkOpen, bulkState, bulkDate, bulkList, bulkReason]);
    useEffect(() => {
        if (selected) focusSelectedTask();
    }, [selected?.id]);
    const visible = useMemo(() => {
        const filteredProjects = new Set(projectFilterKey ? projectFilterKey.split(",") : []);
        const searched = tasks.filter(task => (!filteredProjects.size || filteredProjects.has(task.project_id)) && `${task.title} ${task.data.list_name} ${task.data.context} ${task.data.goal}`
            .toLocaleLowerCase().includes(query.toLocaleLowerCase()));
        const filtered = searched.filter(task => {
            if (scope !== "all" && !isOpen(task)) return false;
            if (scope === "today" && !(!!task.data.planned_date && task.data.planned_date <= today || !!task.data.due_date && task.data.due_date <= today)) return false;
            if (scope === "inbox" && task.data.list_name !== "Inbox") return false;
            if (scope === "upcoming" && !(task.data.planned_date > today || !task.data.planned_date && task.data.due_date > today)) return false;
            if (status === "open") return isOpen(task);
            return status === "all" || task.data.state === status;
        });
        if (taskSort === "manual") return [...filtered].sort((left, right) =>
            (left.board_order ?? 0) - (right.board_order ?? 0) || left.created_at.localeCompare(right.created_at));
        if (taskSort === "due_date" || taskSort === "deadline") return [...filtered].sort((left, right) =>
            (taskSort === "deadline" ? deadlineGroup(left, today) - deadlineGroup(right, today) : 0) ||
            (left.data.due_date || "9999").localeCompare(right.data.due_date || "9999") || left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
        return sorted(filtered, taskSort, minutes, context, energy);
    }, [tasks, projectFilterKey, scope, status, query, taskSort, minutes, context, energy, today]);
    const rowGrouping = deadlineList ? "deadline" : splitList ? "none" : scope === "today" && !listVariant ? "today" : grouping;
    const groupsAndRows = useMemo(() => {
        if (view !== "list") return {groups: [], rows: [], children: new Map<string, Task[]>()};
        const tree = taskHierarchy(visible, parents);
        const deadline = deadlineList ? subtreeDeadlineOrder(tree.roots, tree.children, visible) : undefined;
        const roots = deadline?.roots ?? tree.roots;
        const groups = taskListGroups(roots, rowGrouping, today, deadline?.deadlineTask).map(group => ({...group,
            rows: flattenTaskTree(group.tasks, tree.children, collapsedTasks),
        }));
        return {groups, rows: groups.length ? [] : flattenTaskTree(roots, tree.children, collapsedTasks), children: tree.children};
    }, [view, visible, parents, deadlineList, rowGrouping, today, collapsedTasks]);
    const {groups: listGroups, rows: listRows, children: subtasks} = groupsAndRows;
    const shownRows = view === "list" ? (listGroups.length ? listGroups.filter(group => !collapsedGroups.has(group.key)).flatMap(group => group.rows) : listRows)
        .filter(row => !row.hidden).map(row => row.task) : visible;
    const shownRowIds = new Set(shownRows.map(task => task.id));
    const hiddenSelectionCount = [...selectedIds].filter(id => !shownRowIds.has(id)).length;
    async function quickAdd(event: React.FormEvent) {
        event.preventDefault();
        if (!quickTitle.trim() || !creationProject || !can(creationProject, "task.create")) return;
        setBusyId("new"); setError("");
        try {
            const tomorrow = new Date(`${today}T12:00:00`);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const plannedDate = scope === "inbox" ? "" : scope === "upcoming" ? localDay(tomorrow) : scope === "all" ? "" : today;
            await api.createItem(creationProject, {
                kind: "task", title: quickTitle.trim(), body: "",
                data: dataSchemas.task.parse({ workflow: "personal", requires_test: false,
                    planned_date: plannedDate, list_name: "Inbox" }),
            });
            setQuickTitle(""); setMobileAddOpen(false); quickRecovery.clear(); onChanged();
        } catch (cause) { setError(errorMessage(cause)); }
        finally { setBusyId(""); }
    }
    async function saveListState(task: CancellationTarget, state: Task["data"]["state"], reason = task.data.cancellation_reason): Promise<boolean> {
        if (busyId || !can(task.project_id, "task.update") || state === task.data.state) return false;
        setBusyId(task.id); setError("");
        try {
            await api.saveItem(task.id, {
                expected_revision: task.revision, title: task.title, body: task.body,
                data: { ...task.data, state, cancellation_reason: reason },
            });
            onChanged();
            return true;
        } catch (cause) {
            setError(cause instanceof ApiError && cause.status === 409 && task.data.workflow === "delivery" && state === "done"
                ? `${errorMessage(cause)} 작업 상세에서 완료 근거를 확인해 주세요.` : errorMessage(cause));
            return false;
        }
        finally { setBusyId(""); }
    }
    function chooseListState(task: Task, state: Task["data"]["state"]) {
        if (busyId || !can(task.project_id, "task.update") || state === task.data.state) return;
        if (state === "cancelled") {
            setError(""); setCancellationReason(task.data.cancellation_reason); setCancellingTask(task);
        } else void saveListState(task, state);
    }
    function startTransfer(ids: string[]) {
        if (!ids.length || ids.some(id => !can(taskCache.current.get(id)?.project_id ?? "", "task.move"))) return;
        const dirtyTask = ids.map(id => taskCache.current.get(id)).find(task => task && loadDraft(`projects:draft:${userId}:${task.project_id}:${task.id}`));
        if (dirtyTask) {
            setError("프로젝트를 이동하기 전에 선택한 작업의 미저장 초안을 저장하거나 버려 주세요. 이동은 아직 실행하지 않았습니다.");
            navigate({item: dirtyTask.id}); return;
        }
        setTransferIds(ids);
    }
    function selectTask(taskId: string, shift: boolean) {
        setSelectedIds(current => {
            const next = new Set(current);
            if (shift && selectionAnchor) {
                const selectionOrder = view === "list" ? shownRows : visible;
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
        if (!taskIds.length || taskIds.some(id => !can(taskCache.current.get(id)?.project_id ?? "", "task.update"))) return;
        const projectIds = new Set(taskIds.map(id => taskCache.current.get(id)?.project_id));
        if (projectIds.size !== 1 || projectIds.has(undefined)) { setError("서로 다른 프로젝트의 상태·날짜 변경은 프로젝트별로 선택해 주세요. 프로젝트 이동은 함께 할 수 있습니다."); return; }
        setBusyId("bulk"); reportBoardError("");
        try {
            await api.bulkTasks(taskCache.current.get(taskIds[0]!)!.project_id, {
                tasks: taskIds.map(id => {
                    const task = taskCache.current.get(id);
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
            navigate({ savedView: saved.id, taskProjects: projectId ? undefined : projectFilterKey });
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
        navigate({ taskDensity: next === "simple" ? "compact" : "detailed" });
    }
    const remainingFields = deadlineList ? listFields.filter(field => field !== "due_date") : listFields;
    function renderTaskRow({task, depth, hidden}: TaskTreeRow) {
        function saveField(item: Item) {
            if (item.kind === "task") taskCache.current.set(item.id, {...task, ...item, project_name: item.project_name ?? task.project_name, board_order: item.board_order ?? task.board_order});
            setError("");
            onChanged();
        }
        const childCount = subtasks.get(task.id)?.length ?? 0;
        const isSubtask = parents.has(task.id);
        const parentVisible = depth > 0;
        const parentId = parents.get(task.id);
        const parentTitle = !parentVisible && parentId ? taskCache.current.get(parentId)?.title : undefined;
        return <div className="task-row" key={task.id} data-current={selected?.id === task.id} data-checked={selectedIds.has(task.id)}
            data-depth={depth} data-hierarchy={parentVisible || childCount > 0} hidden={hidden} style={{"--task-depth": Math.min(depth, 5)} as React.CSSProperties}
            onClick={event => {
                const target = event.target;
                if (event.defaultPrevented || !(target instanceof Element) || !event.currentTarget.contains(target)) return;
                if (target.closest("a, button, input, select, textarea, label, summary, [contenteditable]")) return;
                openTask(task.id);
            }}>
            {deadlineList && <div className="task-deadline-cell"><TaskFieldCells task={task} fields={["due_date"]} definitions={definitions} referenceDay={today} onChanged={saveField} onError={setError} /></div>}
            <div className="task-row-identity">
            <div className="task-row-controls">
            {mode === "complex" && <label className="task-checkbox-target task-select-target" title="일괄 작업 선택"><Checkbox className="task-select" aria-label={`${task.title} 일괄 선택`}
                checked={selectedIds.has(task.id)} disabled={busyId === "bulk" || !can(task.project_id, "task.update")}
                onClick={event => selectTask(task.id, event.shiftKey)} /></label>}
            <TaskListStatus title={task.title} state={task.data.state}
                disabled={!!busyId || !can(task.project_id, "task.update") || mobile && mode === "complex" && mobileSelecting}
                onChange={state => chooseListState(task, state)} />
            </div>
            <div className="task-row-main"><div className="task-row-title-line">
                {childCount > 0 && <Button type="button" variant="ghost" className="task-subtask-toggle" data-subtask-toggle={task.id}
                    aria-label={`${task.title} 하위 작업 ${childCount}개`} aria-expanded={!collapsedTasks.has(task.id)} onClick={() => setCollapsedTasks(current => {
                        const next = new Set(current);
                        if (next.has(task.id)) next.delete(task.id);
                        else next.add(task.id);
                        return next;
                    })}><ChevronRight size={14} aria-hidden="true" /><span>{childCount > 99 ? "99+" : childCount}</span></Button>}
                <TaskTitleEdit task={task} onOpen={() => openTask(task.id)} current={selected?.id === task.id} disabled={!!busyId} onSaved={item => {if (item.kind === "task") taskCache.current.set(item.id, {...task, ...item, project_name: task.project_name, board_order: task.board_order}); onChanged();}} />
                </div>
                <div className="task-meta">{(rowGrouping !== "state" || parentVisible) && <span className="task-row-state">{statusLabels[task.data.state]}</span>}
                    {isSubtask && !parentVisible && <span>{parentTitle ? `부모 작업 · ${parentTitle}` : "하위 작업"}</span>}
                    {!projectId && <span>{task.project_name ?? task.project_id}</span>}
                    {!can(task.project_id, "task.update") && <span>읽기 전용</span>}
                    {rowGrouping !== "list" && !listFields.includes("list_name") && <span>{task.data.list_name}</span>}
                    {scope === "today" && task.data.planned_date && !listFields.includes("planned_date") && <span>실행 <DateTimeValue value={task.data.planned_date} dateOnly /></span>}
                    <TaskStoryChips taskId={task.id} collapsible />
                </div>
            </div>
            </div>
            {remainingFields.length > 0 && <TaskFieldCells task={task} fields={remainingFields} definitions={definitions} referenceDay={today} onChanged={saveField} onError={setError} />}
            {mode === "simple" && <div className="task-plan-actions">
                {task.data.planned_date !== today && <ActionButton className="small" disabled={busyId === "bulk" || !can(task.project_id, "task.update")}
                    onClick={() => { void changeTasks([task.id], { planned_date: today }); }}>오늘로</ActionButton>}
                {task.data.planned_date === today && <ActionButton className="small" disabled={busyId === "bulk" || !can(task.project_id, "task.update")}
                    onClick={() => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
                        void changeTasks([task.id], { planned_date: localDay(tomorrow) }); }}>내일로 연기</ActionButton>}
            </div>}
            <DropdownMenu><DropdownMenuTrigger className="task-row-menu" aria-label={`${task.title} 작업 메뉴`}>⋯</DropdownMenuTrigger><DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => openTask(task.id)}>상세 열기</DropdownMenuItem>
                <DropdownMenuItem disabled={!can(task.project_id, "task.update")} onSelect={() => {void changeTasks([task.id], {planned_date: today});}}>오늘로 계획</DropdownMenuItem>
                <DropdownMenuItem disabled={!can(task.project_id, "task.update")} onSelect={() => {const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() + 1); void changeTasks([task.id], {planned_date: localDay(date)});}}>내일로 연기</DropdownMenuItem>
                <DropdownMenuSeparator /><DropdownMenuItem disabled={!can(task.project_id, "task.move")} onSelect={() => startTransfer([task.id])}>프로젝트 이동</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
        </div>;
    }
    function renderTaskList() {
        if (!visible.length) return resultsLoading || resultsIncomplete ? null : <Empty title="이 보기에 해당하는 작업이 없습니다."><p>{scope === "today" ? `오늘 조건에는 0개 · 전체 열린 작업 ${totalOpen ?? tasks.filter(isOpen).length}개` : "현재 검색·필터에 해당하는 작업이 없습니다."}</p><ActionButton onClick={() => navigate({taskScope: "all", q: "", taskStatus: "open"})}>모든 열린 작업 보기</ActionButton></Empty>;
        return <div className="task-list-scroll"><div className="task-list" data-variant={listVariant ?? "state"} data-fields={remainingFields.length > 0} data-multi-select={mode === "complex"} style={{"--task-field-count": remainingFields.length} as React.CSSProperties}>
            <div className="task-list-columns" aria-hidden="true">{deadlineList && <strong className="task-deadline-cell">마감일</strong>}<strong className="task-column-identity">작업</strong>{remainingFields.length > 0 && <div className="task-field-headings">{remainingFields.map(key => <span key={key}>{taskFieldLabel(key, definitions)}</span>)}</div>}{mode === "simple" && <span>계획</span>}<span /></div>
            {listGroups.length ? listGroups.map((group, index) => {
                const expanded = !collapsedGroups.has(group.key);
                const contentId = `${groupId}-${index}`;
                const subtaskCount = group.rows.length - group.tasks.length;
                return <section className="task-list-group" key={group.key} data-group={group.key} aria-label={group.label}>
                    <h3 className="task-group-heading"><Button type="button" variant="ghost" aria-expanded={expanded} aria-controls={contentId} onClick={() => setCollapsedGroups(current => {
                        const next = new Set(current);
                        if (next.has(group.key)) next.delete(group.key);
                        else next.add(group.key);
                        return next;
                    })}>
                        <ChevronRight size={15} aria-hidden="true" />
                        {group.state && <span className="task-status-dot" data-state={group.state} aria-hidden="true" />}
                        <span className="task-group-label">{group.label}</span><span className="task-group-count">{group.tasks.length}개{subtaskCount > 0 && ` · 하위 ${subtaskCount}개`}</span>
                    </Button></h3>
                    <div id={contentId} hidden={!expanded}>{group.rows.map(renderTaskRow)}</div>
                </section>;
            }) : listRows.map(renderTaskRow)}
        </div></div>;
    }
    const selectedWritable = selectedIds.size > 0 && [...selectedIds].every(id => can(taskCache.current.get(id)?.project_id ?? "", "task.update"));
    const selectedMovable = selectedIds.size > 0 && [...selectedIds].every(id => can(taskCache.current.get(id)?.project_id ?? "", "task.move"));
    const viewLabels: Record<string, string> = { all: "모든 작업", today: "오늘", inbox: "Inbox", upcoming: "예정", list: "목록", board: "보드", graph: "그래프", calendar: "캘린더", insights: "집계" };
    const filterCount = Number(!!query.trim()) + Number(status !== "open") + Number(!!context) + Number(minutes > 0) + Number(energy !== "any") + Number(!!projectFilterKey);
    const statusFilter = <Field label="상태"><NativeSelect value={status} onChange={event => setStatus(event.target.value)}>
        <option value="open">열린 작업</option><option value="all">모든 상태</option>
        {states.map(state => <option key={state} value={state}>{statusLabels[state]}</option>)}
    </NativeSelect></Field>;
    const groupFilter = view === "list" && !deadlineList && !splitList && (scope !== "today" || !!listVariant) && <Field label="그룹"><NativeSelect value={grouping}
        onChange={event => setGrouping(event.target.value as TaskViewSettings["grouping"])}>
        <option value="none">그룹 없음</option><option value="state">상태별 그룹</option><option value="list">목록별 그룹</option>
    </NativeSelect></Field>;
    const listVariantSwitch = view === "list" && <SegmentedControl className="task-list-variant-switch" label="목록 보기" name="task-list-variant"
        value={listVariant ?? "state"} onValueChange={value => {
            if (value === "state") setGrouping("state");
            navigate({taskListVariant: value});
        }}>
        {Object.entries(taskListVariants).map(([value, label]) => <SegmentedControlItem key={value} value={value}>{label}</SegmentedControlItem>)}
    </SegmentedControl>;
    const fieldManager = (label: string) => <TaskFieldManager {...fieldManagerProps} label={label} recoveryScope={`${projectId || "global"}:${view}`} selectedFields={view === "board" ? cardFields : listFields} onChange={view === "board" ? setCardFields : setListFields} />;
    function selectSavedView(savedView: string) {
        if (savedView) {
            appliedSavedId.current = "";
            navigate({...savedViewRoute, savedView});
            setRestoreGeneration(value => value + 1);
            return;
        }
        navigate({savedView: "", taskScope: scope, taskLayout: view, taskDensity: mode === "complex" ? "detailed" : "compact", taskListVariant: listVariant ?? "", taskProjects: projectId ? undefined : projectFilterKey, q: query, taskStatus: status});
    }
    const restoreSavedView = () => selectSavedView(route.savedView ?? "");
    const savedViewBar = <TaskViewBar projectId={projectId} views={savedViews.status === "ready" ? savedViews.data : []} activeId={route.savedView ?? ""} settings={settings} dirty={savedDirty}
        loading={savedViews.status === "loading"} error={savedViews.status === "error" ? savedViews.error : ""} onSelect={selectSavedView} onChanged={savedViews.reload} onRestore={restoreSavedView} />;
    const allProjectsLink = projectId && <RouteLink className="task-all-projects-link" patch={{project: "", view: "tasks", item: "", taskScope: "all"}}>전체 작업</RouteLink>;
    const taskTransfer = transferIds.length > 0 && <TaskTransfer tasks={transferIds.flatMap(id => {const task = taskCache.current.get(id); return task ? [task] : [];})} hiddenCount={transferIds.filter(id => !shownRowIds.has(id)).length} onClose={() => {setTransferIds([]); if (transferDestination.current) {navigate({project: transferDestination.current}); transferDestination.current = "";}}} onChanged={result => {
        for (const moved of result.tasks) if (moved.kind === "task") taskCache.current.set(moved.id, moved);
        const movedSelected = result.tasks.find(task => task.id === route.item);
        if (projectId && movedSelected) transferDestination.current = movedSelected.project_id;
        onChanged();
    }} />;
    return <section ref={workspaceRef} data-density={mode} className={`task-workspace ${selected ? "has-task-selection" : ""}`} data-mobile-selecting={mobile && mode === "complex" && mobileSelecting}>
        {mobile && <div className="mobile-task-header"><div className="mobile-task-title"><div><h1>{projectId ? "작업" : "전체 작업"}</h1>{allProjectsLink}</div>
            <SegmentedControl className="task-density-control" label="보기 모드" name="mobile-task-mode" value={mode} onValueChange={value => changeMode(value as "simple" | "complex")}>
                <SegmentedControlItem value="simple">간단</SegmentedControlItem><SegmentedControlItem value="complex">상세</SegmentedControlItem>
            </SegmentedControl></div>
            <SegmentedControl className="mobile-task-layout-control" label="작업 보기" name="mobile-task-layout" value={view} onValueChange={taskLayout => navigate({taskLayout})}>
                {complexViews.map(value => <SegmentedControlItem key={value} value={value}>{viewLabels[value]!}</SegmentedControlItem>)}
            </SegmentedControl>
            <div className="mobile-task-mode-actions"><div className="mobile-task-actions">
                <ActionButton ref={mobileFilterTrigger} type="button" onClick={() => setMobileFilterOpen(true)}>보기·필터{filterCount ? ` ${filterCount}` : ""}</ActionButton>
                {(view === "list" || view === "board") && fieldManager("필드")}
                {(view !== "board" || !projectId) && <ActionButton ref={mobileAddTrigger} type="button" className="primary" disabled={!can(creationProject, "task.create")} onClick={() => setMobileAddOpen(true)}>+ 추가</ActionButton>}
                {mode === "complex" && (view === "list" || view === "board") && <ActionButton type="button" onClick={() => { setMobileSelecting(value => !value); if (mobileSelecting) setSelectedIds(new Set()); }}>{mobileSelecting ? "선택 취소" : "선택"}</ActionButton>}
            </div></div>
        </div>}
        <div className="task-heading-row"><PageHeader className="pagehead" title={projectId ? "작업" : "전체 작업"} actions={allProjectsLink || undefined} />
        <div className="task-compose"><form className="task-quick-add" onSubmit={event => { void quickAdd(event); }}>
            {!projectId && <Field label="새 작업 소속"><NativeSelect value={creationProject} onChange={event => {setCreationProject(event.target.value); try {sessionStorage.setItem(`projects:task-create:${userId}`, event.target.value);} catch { /* Current selection remains usable. */ }}}><option value="">프로젝트 선택</option>{creationProjects.status === "ready" && creationProjects.data.filter(project => canProject(project, "task.create") && can(project.id, "task.create")).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</NativeSelect></Field>}<Field label="빠른 할 일"><Input disabled={!can(creationProject, "task.create")} value={quickTitle} maxLength={300} onChange={event => setQuickTitle(event.target.value)} placeholder="새 작업 제목" /></Field>
            <ActionButton className="primary" type="submit" disabled={!can(creationProject, "task.create") || busyId === "new" || !quickTitle.trim() || !creationProject}>{busyId === "new" ? "추가 중…" : "+ 추가"}</ActionButton>
        </form></div>
            <ActionButton disabled={!creationProject || !can(creationProject, "task.create")} onClick={() => setNewDetailed(true)}>상세 입력</ActionButton>
        </div>
        <div className="task-context-controls"><div className="task-scope-bar"><SegmentedControl label="작업 범위" name="task-scope" value={scope} onValueChange={taskScope => navigate({taskScope})}>
            {taskScopes.map(value => <SegmentedControlItem key={value} value={value}>{viewLabels[value]!}</SegmentedControlItem>)}
        </SegmentedControl></div>
        <div className="task-mode-bar">
            <strong className="task-mode-caption">보기 모드</strong>
            <SegmentedControl className="task-density-control" label="보기 모드" name="task-mode" value={mode} onValueChange={value => changeMode(value as "simple" | "complex")}>
                <SegmentedControlItem value="simple">간단</SegmentedControlItem>
                <SegmentedControlItem value="complex">상세</SegmentedControlItem>
            </SegmentedControl>
        </div></div>
        {error && <div className="task-error-block"><ErrorNotice error={error} />
            {sessionStorage.getItem(boardErrorKey) && <ActionButton type="button" onClick={() => reportBoardError("")}>알림 닫기</ActionButton>}
        </div>}
        <div className="task-view-layout" data-split={splitList}><Tabs className="task-tabs-root" value={view} onValueChange={candidate => navigate({ taskLayout: candidate })}>
            <div className="task-view-switcher">
            <TabsList className="task-view-bar" variant="line" aria-label="작업 보기">
            {complexViews.map(candidate => <TabsTrigger key={candidate} value={candidate}>
                {viewLabels[candidate]}
            </TabsTrigger>)}
            </TabsList>
            <div className="task-saved-view-strip">{savedViewBar}</div>
            </div>
        {route.savedView && !activeSavedView && savedViews.status !== "loading" && <ActionButton className="small" onClick={() => selectSavedView("")}>현재 조건으로 보기</ActionButton>}
        {listVariantSwitch}
        {mode === "simple" ? <div className="task-simple-tools">
            <SearchInput variant="toolbar" label="작업 검색" value={query} onValueChange={setQuery} onSearch={() => {}} placeholder="작업 검색" submitLabel="찾기" />
            {statusFilter}
            {groupFilter}
            {(view === "list" || view === "board") && fieldManager(view === "board" ? "카드 필드" : "+ 필드")}
            <Accordion type="single" collapsible className="task-priority-options"><AccordionItem value="priority"><AccordionTrigger>지금 가능한 작업 찾기 · GTD / ABC</AccordionTrigger><AccordionContent><div className="task-tools">
                <Field label="우선순위 기준"><NativeSelect value={lens} onChange={event => { const next = event.target.value as Lens; setLens(next); setTaskSort(next); }}><option value="gtd">GTD · 지금 가능한 행동</option><option value="abc">ABC · 목표와 가치</option></NativeSelect></Field>
                {lens === "gtd" && <Field label="가용 시간"><NativeSelect value={minutes} onChange={event => setMinutes(Number(event.target.value))}><option value={0}>제한 없음</option><option value={15}>15분</option><option value={30}>30분</option><option value={60}>60분</option><option value={120}>120분</option></NativeSelect></Field>}
            </div></AccordionContent></AccordionItem></Accordion>
        </div> : <div className="task-tools">
            <SearchInput variant="toolbar" label="작업 검색" value={query} onValueChange={setQuery} onSearch={() => {}} placeholder="작업 검색" submitLabel="찾기" />
            {(view === "list" || view === "board") && fieldManager(view === "board" ? "카드 필드" : "+ 필드")}
            {statusFilter}
            {groupFilter}
            <details className="task-advanced-settings"><summary>보기 설정 · GTD/ABC·정렬</summary><div className="task-tools">
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
            {(view === "list" || view === "board") && !deadlineList && <Field label="정렬"><NativeSelect value={taskSort} onChange={event => setTaskSort(event.target.value as TaskViewSettings["sort"])}>
                <option value="manual" disabled={!projectId && view === "board"}>보드 수동 순서</option><option value="gtd">GTD</option><option value="abc">ABC</option><option value="due_date">마감일</option>
            </NativeSelect></Field>}
            </div></details>
        </div>}
        <details className="task-view-settings"><summary>저장 보기·설정{activeSavedView ? " · " + activeSavedView.name : ""}{savedDirty ? " · 변경 중" : ""}</summary><div className="task-saved-views" aria-label="저장된 보기">
            <Field label="개인 저장 보기"><NativeSelect value={route.savedView || ""} onChange={event => {
                selectSavedView(event.target.value);
            }}><option value="">현재 보기</option>
                {savedViews.status === "ready" && savedViews.data.map(saved => <option key={saved.id} value={saved.id}>
                    {saved.name}{saved.is_default ? " · 기본" : ""}</option>)}
            </NativeSelect></Field>
            <Field label="보기 이름"><Input value={savedName} maxLength={100} onChange={event => setSavedName(event.target.value)} placeholder="보기 이름" /></Field>
            <label className="task-default-view"><Checkbox checked={savedDefault} onCheckedChange={checked => setSavedDefault(checked === true)} /> 기본 보기</label>
            <ActionButton disabled={savedBusy || !savedName.trim()} onClick={() => { void saveView(false); }}>새 보기 저장</ActionButton>
            {activeSavedView && <><ActionButton disabled={savedBusy} onClick={() => { void saveView(true); }}>현재 보기 갱신</ActionButton>
                <ActionButton disabled={savedBusy} onClick={restoreSavedView}>저장 상태 복원</ActionButton><ActionButton disabled={savedBusy} onClick={() => { void deleteView(); }}>보기 삭제</ActionButton></>}
            {savedViews.status === "error" && <span role="alert">저장된 보기를 불러오지 못했습니다. {savedViews.error}</span>}
        </div>
        </details>
        {mode === "complex" && selectedIds.size > 0 && <div className="task-bulk-toolbar" role="region" aria-label="선택 작업 일괄 변경">
            <strong>{selectedIds.size}개 선택</strong>{hiddenSelectionCount > 0 && <span>화면에 숨겨진 작업 {hiddenSelectionCount}개</span>}<ActionButton disabled={!selectedMovable} onClick={() => startTransfer([...selectedIds])}>프로젝트 이동</ActionButton>
            <ActionButton disabled={busyId === "bulk"} onClick={() => setSelectedIds(new Set())}>선택 해제</ActionButton>
            <Field label="상태"><NativeSelect value={bulkState} onChange={event => setBulkState(event.target.value as Task["data"]["state"])}>
                {states.map(state => <option key={state} value={state}>{statusLabels[state]}</option>)}
            </NativeSelect></Field>
            {bulkState === "cancelled" && <Field label="취소 사유"><Input value={bulkReason} onChange={event => setBulkReason(event.target.value)} /></Field>}
            <ActionButton disabled={!selectedWritable || busyId === "bulk" || bulkState === "cancelled" && !bulkReason.trim()}
                onClick={() => { void changeTasks([...selectedIds], { state: bulkState,
                    ...(bulkState === "cancelled" ? { cancellation_reason: bulkReason.trim() } : {}) }); }}>상태 적용</ActionButton>
            <Field label="실행 예정일"><Input type="date" value={bulkDate} onChange={event => setBulkDate(event.target.value)} /></Field>
            <ActionButton disabled={!selectedWritable || busyId === "bulk" || !bulkDate} onClick={() => { void changeTasks([...selectedIds], { planned_date: bulkDate }); }}>날짜 적용</ActionButton>
            <ActionButton disabled={!selectedWritable || busyId === "bulk"} onClick={() => { void changeTasks([...selectedIds], { planned_date: "" }); }}>날짜 지우기</ActionButton>
            <Field label="목록"><Input value={bulkList} onChange={event => setBulkList(event.target.value)} placeholder="목록 이름" maxLength={80} /></Field>
            <ActionButton disabled={!selectedWritable || busyId === "bulk" || !bulkList.trim()} onClick={() => { void changeTasks([...selectedIds], { list_name: bulkList.trim() }); }}>목록 적용</ActionButton>
        </div>}
        <div className="task-result-bar"><p className="task-result-count">
            <strong>{resultsIncomplete ? `불러온 작업 ${visible.length}개 · 일부 결과` : `${visible.length}개 작업`}</strong>
            {view === "list" && <span>{deadlineList ? "기한 지남부터" : <>{rowGrouping !== "none" && `${rowGrouping === "state" ? "상태별" : rowGrouping === "list" ? "목록별" : "오늘 조건별"} · `}{taskSort === "gtd" ? "GTD 순" : taskSort === "abc" ? "ABC 순" : taskSort === "due_date" || taskSort === "deadline" ? "마감일 순" : "수동 순서"}</>}</span>}
            </p>
            {mode === "complex" && shownRows.length > 0 && <ActionButton className="small task-select-all" disabled={busyId === "bulk"}
                onClick={() => setSelectedIds(new Set(shownRows.map(task => task.id)))}>현재 보기 전체 선택</ActionButton>}
        </div>
        <TabsContent value={view} className="task-view-content">
        {view === "board" && <TaskBoard projectId={projectId} tasks={visible} lens={lens}
            savedSort={sortByLayout.board} onSortChange={setTaskSort}
            selectedIds={selectedIds} onSelect={selectTask} cardFields={cardFields} definitions={definitions}
            onChanged={onChanged} onError={reportBoardError} />}
        {view === "calendar" && <TaskCalendar tasks={visible} month={month} onMonth={setMonth} dateField={calendarField} onDateField={setCalendarField} />}
        {view === "graph" && <TaskGraph tasks={visible} links={relations.links} selectedId={selected?.id} onOpen={openTask}
            loading={resultsLoading || relations.loading} incomplete={resultsIncomplete || relations.incomplete} />}
        {view === "insights" && <TaskInsights tasks={visible} incomplete={resultsIncomplete} />}
        {view === "list" && renderTaskList()}
        </TabsContent></Tabs>
        {selected && <TaskDetailPanel modal={detailModal} panelRef={selectedRef} onClose={() => navigate({item: ""})}>
            <ActionButton type="button" className="mobile-detail-back" onClick={() => navigate({ item: "" })}>← 작업 목록</ActionButton>
            <div className="section-head"><h2>선택한 작업</h2><ActionButton disabled={!can(selected.project_id, "task.move")} onClick={() => startTransfer([selected.id])}>프로젝트 이동</ActionButton>
                <ActionButton className="small" onClick={() => navigate({ item: "" })}>닫기</ActionButton></div>
            {!visible.some(task => task.id === selected.id) && <p role="status">선택한 작업은 현재 조건 밖에 있습니다. 상세와 초안은 유지됩니다.</p>}
            <TaskParentEditor key={`parent:${selected.id}`} task={selected} parentId={parents.get(selected.id)} parentTitle={taskCache.current.get(parents.get(selected.id) ?? "")?.title} />
            <RecordEditor key={`record:${selected.id}`} item={selected} items={items} catalog={catalog} userId={userId} onChanged={onChanged} /><TaskNoteReferences item={selected} onChanged={onChanged} /><TaskContext itemId={selected.id} revision={selected.revision} />
            {detailModal && taskTransfer}
        </TaskDetailPanel>}
        {splitList && !selected && <aside className="task-split-placeholder" aria-label="작업 상세"><h2>작업 상세</h2><p>목록에서 작업을 선택하세요.</p></aside>}
        </div>
        {cancellingTask && <Modal title="작업 취소" onClose={() => { if (!busyId) { setCancellingTask(null); cancellationRecovery.clear(); setError(""); } }}>
            <p>{cancellingTask.title}</p><form onSubmit={event => {
                event.preventDefault();
                if (!cancellationReason.trim()) return;
                void saveListState(cancellingTask, "cancelled", cancellationReason.trim()).then(saved => { if (saved) {setCancellingTask(null); cancellationRecovery.clear();} });
            }}>
                <Field label="취소 사유"><Textarea disabled={!can(cancellingTask.project_id, "task.update")} value={cancellationReason} onChange={event => setCancellationReason(event.target.value)} required /></Field>
                {error && <ErrorNotice error={error} />}
                <div className="actions"><ActionButton type="button" disabled={!!busyId} onClick={() => { setCancellingTask(null); cancellationRecovery.clear(); setError(""); }}>돌아가기</ActionButton>
                    <ActionButton type="submit" className="primary" disabled={!!busyId || !can(cancellingTask.project_id, "task.update") || !cancellationReason.trim()}>{busyId ? "저장 중…" : "취소 확정"}</ActionButton></div>
            </form>
        </Modal>}
        {newDetailed && creationProject && <NewItem kind="task" projectId={creationProject} userId={userId} items={items} catalog={catalog}
            onClose={() => setNewDetailed(false)} onCreated={item => { setNewDetailed(false); onChanged(); navigate({ taskMode: "complex", taskView: "list", item: item.id, savedView: "" }); }} />}
        {mobile && mobileFilterOpen && <Modal title="보기·필터" className="mobile-task-dialog" onClose={() => { setMobileFilterOpen(false); window.requestAnimationFrame(() => mobileFilterTrigger.current?.focus()); }}>
            <div className="mobile-task-sheet-fields">{savedDirty && <p role="status">저장 보기 변경 중 · 명시적으로 갱신하거나 저장 상태를 복원하세요.</p>}
                <Field label="개인 저장 보기"><NativeSelect value={route.savedView || ""} onChange={event => {
                    selectSavedView(event.target.value);
                }}><option value="">현재 보기</option>{savedViews.status === "ready" && savedViews.data.map(saved => <option key={saved.id} value={saved.id}>{saved.name}{saved.is_default ? " · 기본" : ""}</option>)}</NativeSelect></Field>
                {mode === "complex" && <div className="mobile-saved-view-actions"><Field label="보기 이름"><Input value={savedName} maxLength={100} onChange={event => setSavedName(event.target.value)} placeholder="보기 이름" /></Field>
                    <label className="task-default-view"><Checkbox checked={savedDefault} onCheckedChange={checked => setSavedDefault(checked === true)} /> 기본 보기</label>
                    <ActionButton type="button" disabled={savedBusy || !savedName.trim()} onClick={() => { void saveView(false); }}>새 보기 저장</ActionButton>
                    {activeSavedView && <><ActionButton type="button" disabled={savedBusy} onClick={() => { void saveView(true); }}>현재 보기 갱신</ActionButton>
                        <ActionButton type="button" disabled={savedBusy} onClick={restoreSavedView}>저장 상태 복원</ActionButton><ActionButton type="button" disabled={savedBusy} onClick={() => { void deleteView(); }}>보기 삭제</ActionButton></>}
                    {savedViews.status === "error" && <span role="alert">저장된 보기를 불러오지 못했습니다. {savedViews.error}</span>}
                </div>}
                <SearchInput label="작업 검색" value={query} onValueChange={setQuery} onSearch={() => undefined} placeholder="제목·목록·맥락·목표" />
                {statusFilter}
                {groupFilter}
                <Field label="우선순위 기준"><NativeSelect value={lens} onChange={event => { const next = event.target.value as Lens; setLens(next); setTaskSort(next); }}><option value="gtd">GTD · 지금 가능한 행동</option><option value="abc">ABC · 목표와 가치</option></NativeSelect></Field>
                {lens === "gtd" && <><Field label="가용 시간"><NativeSelect value={minutes} onChange={event => setMinutes(Number(event.target.value))}><option value={0}>제한 없음</option><option value={15}>15분</option><option value={30}>30분</option><option value={60}>60분</option><option value={120}>120분</option></NativeSelect></Field>
                    {mode === "complex" && <><Field label="현재 맥락"><Input value={context} onChange={event => setContext(event.target.value)} placeholder="예: desk" /></Field><Field label="현재 에너지"><NativeSelect value={energy} onChange={event => setEnergy(event.target.value)}><option value="any">제한 없음</option><option value="low">낮음</option><option value="medium">보통</option><option value="high">높음</option></NativeSelect></Field></>}</>}
                {mode === "complex" && (view === "list" || view === "board") && !deadlineList && <Field label="정렬"><NativeSelect value={taskSort} onChange={event => setTaskSort(event.target.value as TaskViewSettings["sort"])}><option value="manual" disabled={!projectId && view === "board"}>보드 수동 순서</option><option value="gtd">GTD</option><option value="abc">ABC</option><option value="due_date">마감일</option></NativeSelect></Field>}
                {error && <ErrorNotice error={error} />}
                <ActionButton type="button" className="primary" onClick={() => setMobileFilterOpen(false)}>결과 보기 · {visible.length}개</ActionButton>
            </div>
        </Modal>}
        {mobile && mobileAddOpen && <Modal title="할 일 추가" className="mobile-task-dialog" onClose={() => { setMobileAddOpen(false); window.requestAnimationFrame(() => mobileAddTrigger.current?.focus()); }}><form className="mobile-task-sheet-fields" onSubmit={event => { void quickAdd(event); }}>
            <p className="muted small">{mode === "simple" ? scope === "inbox" ? "Inbox에 날짜 없이 수집합니다." : scope === "upcoming" ? "내일 실행할 일로 추가합니다." : "오늘 실행할 일로 추가합니다." : projectId ? "현재 프로젝트의 개인 작업으로 추가합니다." : "소속 프로젝트를 선택해 개인 작업으로 추가합니다."}</p>
            {!projectId && <Field label="새 작업 소속"><NativeSelect value={creationProject} onChange={event => setCreationProject(event.target.value)}><option value="">프로젝트 선택</option>{creationProjects.status === "ready" && creationProjects.data.filter(project => canProject(project, "task.create") && can(project.id, "task.create")).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</NativeSelect></Field>}<Field label="할 일 제목"><Input disabled={!can(creationProject, "task.create")} autoFocus required maxLength={300} value={quickTitle} onChange={event => setQuickTitle(event.target.value)} /></Field>
            {error && <ErrorNotice error={error} />}
            <ActionButton className="primary" type="submit" disabled={!can(creationProject, "task.create") || busyId === "new" || !quickTitle.trim() || !creationProject}>{busyId === "new" ? "추가 중…" : "추가"}</ActionButton>
        </form></Modal>}
        {mobile && mode === "complex" && selectedIds.size > 0 && <div className="mobile-selection-bar"><strong>선택 {selectedIds.size}개{hiddenSelectionCount > 0 ? ` · 숨김 ${hiddenSelectionCount}개` : ""}</strong><ActionButton ref={mobileBulkTrigger} type="button" className="primary" onClick={() => setMobileBulkOpen(true)}>일괄 변경</ActionButton></div>}
        {mobile && mobileBulkOpen && <Modal title={`${selectedIds.size}개 작업 일괄 변경`} className="mobile-task-dialog" onClose={() => { setMobileBulkOpen(false); window.requestAnimationFrame(() => mobileBulkTrigger.current?.focus()); }}><div className="mobile-task-sheet-fields"><ActionButton disabled={!selectedMovable} onClick={() => {setMobileBulkOpen(false); startTransfer([...selectedIds]);}}>프로젝트 이동</ActionButton>
            <p className="muted small">선택한 작업 전체에 적용합니다. 완료 조건을 충족하지 못하면 모두 거부됩니다.</p>
            <Field label="상태"><NativeSelect value={bulkState} onChange={event => setBulkState(event.target.value as Task["data"]["state"])}>{states.map(state => <option key={state} value={state}>{statusLabels[state]}</option>)}</NativeSelect></Field>
            {bulkState === "cancelled" && <Field label="취소 사유"><Input value={bulkReason} onChange={event => setBulkReason(event.target.value)} /></Field>}
            <ActionButton type="button" disabled={!selectedWritable || busyId === "bulk" || bulkState === "cancelled" && !bulkReason.trim()} onClick={() => { void changeTasks([...selectedIds], { state: bulkState, ...(bulkState === "cancelled" ? { cancellation_reason: bulkReason.trim() } : {}) }); }}>상태 적용</ActionButton>
            <Field label="실행 예정일"><Input type="date" value={bulkDate} onChange={event => setBulkDate(event.target.value)} /></Field>
            <ActionButton type="button" disabled={!selectedWritable || busyId === "bulk" || !bulkDate} onClick={() => { void changeTasks([...selectedIds], { planned_date: bulkDate }); }}>날짜 적용</ActionButton>
            <Field label="목록"><Input value={bulkList} onChange={event => setBulkList(event.target.value)} maxLength={80} /></Field>
            <ActionButton type="button" disabled={!selectedWritable || busyId === "bulk" || !bulkList.trim()} onClick={() => { void changeTasks([...selectedIds], { list_name: bulkList.trim() }); }}>목록 적용</ActionButton>
            {error && <ErrorNotice error={error} />}
        </div></Modal>}
        {(!selected || !detailModal) && taskTransfer}
    </section>;
}

function TaskCalendar({ tasks, month, onMonth, dateField, onDateField }: { tasks: Task[]; month: Date; onMonth: (date: Date) => void; dateField: "planned" | "due"; onDateField: (value: "planned" | "due") => void }) {
    const taskDate = (task: Task) => dateField === "planned" ? task.data.planned_date : task.data.due_date;
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
    const agenda = tasks.filter(task => taskDate(task) === selectedDay);
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
    return <div className="task-calendar"><Field label="캘린더 날짜 기준"><NativeSelect value={dateField} onChange={event => onDateField(event.target.value as "planned" | "due")}><option value="planned">실행 예정일</option><option value="due">마감일</option></NativeSelect></Field>{mobile && <div className="mobile-calendar"><div className="mobile-calendar-week-head">
        <ActionButton type="button" aria-label="이전 주" onClick={() => changeWeek(-1)}>←</ActionButton>
        <strong>{selectedDate.toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}</strong>
        <ActionButton type="button" aria-label="다음 주" onClick={() => changeWeek(1)}>→</ActionButton>
    </div><div className="mobile-calendar-week" role="group" aria-label="주간 날짜">
        {weekDays.map(date => { const day = localDay(date); const count = tasks.filter(task => taskDate(task) === day).length;
            return <ActionButton key={day} type="button" className={day === selectedDay ? "active" : ""} aria-pressed={day === selectedDay} onClick={() => setSelectedDay(day)}>
                <span>{date.toLocaleDateString("ko-KR", { weekday: "short" })}</span><strong>{date.getDate()}</strong><small>{count ? `${count}개` : "·"}</small>
            </ActionButton>;
        })}
    </div><div className="mobile-calendar-agenda"><h2><DateTimeValue value={selectedDay} dateOnly /> ({selectedDate.toLocaleDateString("ko-KR", {weekday: "short"})}) · {agenda.length}개</h2>
        {agenda.map(task => <div key={task.id} className="calendar-task-entry"><RouteLink patch={{ item: task.id }} className="mobile-agenda-row"><strong>{task.title}</strong><small>{task.data.planned_date === selectedDay ? "실행 예정" : ""}{task.data.planned_date === selectedDay && task.data.due_date === selectedDay ? " · " : ""}{task.data.due_date === selectedDay ? "마감" : ""}</small></RouteLink><TaskStoryChips taskId={task.id} /></div>)}
        {!agenda.length && <p className="muted">이 날짜에 표시할 작업이 없습니다.</p>}
        <ActionButton type="button" onClick={() => navigate({ taskLayout: "list" })}>날짜 없는 작업은 목록에서 보기</ActionButton>
    </div></div>}<div className="task-calendar-head">
        <ActionButton onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="이전 달">←</ActionButton>
        <h2>{month.toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}</h2>
        <ActionButton onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="다음 달">→</ActionButton>
    </div><div className="task-calendar-grid">{["일", "월", "화", "수", "목", "금", "토"].map(day => <span className="task-calendar-weekday" key={day}>{day}</span>)}
        {days.map(date => {
            const day = localDay(date);
            const scheduled = tasks.filter(task => taskDate(task) === day);
            return <div className={`task-calendar-day ${date.getMonth() === month.getMonth() ? "" : "outside"}`} key={day}>
                <strong>{date.getDate()}</strong>{scheduled.map(task => <div key={task.id} className="calendar-task-entry"><RouteLink patch={{ item: task.id }}>
                    {task.data.due_date === day ? "마감 · " : ""}{task.title}</RouteLink><TaskStoryChips taskId={task.id} /></div>)}
            </div>;
        })}</div><div className="calendar-overflow"><h3>날짜 없는 작업 · {tasks.filter(task => !taskDate(task)).length}개</h3>{tasks.filter(task => !taskDate(task)).map(task => <div key={task.id} className="calendar-task-entry"><RouteLink patch={{item: task.id}}>{task.title}</RouteLink><TaskStoryChips taskId={task.id} /></div>)}<h3>다른 기간의 작업 · {tasks.filter(task => taskDate(task) && !days.some(date => localDay(date) === taskDate(task))).length}개</h3>{tasks.filter(task => taskDate(task) && !days.some(date => localDay(date) === taskDate(task))).map(task => <div key={task.id} className="calendar-task-entry"><RouteLink patch={{item: task.id}}><DateTimeValue value={taskDate(task)} dateOnly /> · {task.title}</RouteLink><TaskStoryChips taskId={task.id} /></div>)}</div></div>;
}

function TaskInsights({ tasks, incomplete = false }: { tasks: Task[]; incomplete?: boolean }) {
    const total = tasks.length;
    const groups = [
        ...states.map(state => ({ label: statusLabels[state], count: tasks.filter(task => task.data.state === state).length })),
        { label: "마감 지남", count: tasks.filter(task => isOpen(task) && !!task.data.due_date && task.data.due_date < localDay()).length },
        ...(["A", "B", "C"] as const).map(priority => ({ label: `ABC ${priority}`, count: tasks.filter(task => task.data.abc_priority === priority).length })),
    ];
    const remainingMinutes = tasks.filter(isOpen).reduce((sum, task) => sum + task.data.estimated_minutes, 0);
    return <section className="task-insights" aria-label="작업 집계">
        <p>{incomplete ? `불러온 작업 ${total}건 · 일부 결과` : `현재 조건의 작업 ${total}건`} · 진행 중 예상 소요 {remainingMinutes}분</p>
        <p className="hint">현재 스냅샷입니다. 완료 추세나 소요 시간 실측으로 해석하지 않습니다.</p>
        <BarList title="작업 분포" description="현재 필터 기준 · 상태 및 ABC 등급" max={Math.max(total, 1)} unit="건"
            items={groups.map((group, index) => ({ id: String(index), label: group.label ?? "기타", value: group.count }))} />
    </section>;
}
