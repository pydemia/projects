import { useEffect, useRef, useState } from "react";
import { ApiError, api, errorMessage } from "./api";
import { useProjectCatalog, useProjectPermissions } from "./ProjectPermissions";
import { navigate } from "./hooks";
import type { Route } from "./hooks";
import { layoutSorts, readTaskViewMemory, taskListVariant, taskProjectIds } from "./task-view-memory";
import type { Catalog, Item, TaskViewSettings } from "./models";
import { NativeSelect } from "./pydemia-ui/native-select";
import { Button } from "./pydemia-ui/button";
import { Checkbox } from "./pydemia-ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "./pydemia-ui/popover";
import { ListFilter } from "lucide-react";
import { TaskWorkspace } from "./TaskWorkspace";
import { TaskStoryProvider } from "./StoryChips";
import { ActionButton, ErrorNotice, Field } from "./ui";

type TaskPage = Awaited<ReturnType<typeof api.tasks>>;
type Results = { key: string; items: Item[]; page?: TaskPage; cursor: string; loading: boolean; error: string };

export function GlobalTasks({ userId, route, catalog }: {
    userId: string; route: Route; catalog?: Catalog;
}) {
    const memory = route.savedView ? undefined : readTaskViewMemory(`projects:task-view-memory:${userId}:global`)?.settings;
    const layout = [route.taskLayout, route.taskView, memory?.view].find(value => value && ["list", "board", "graph", "calendar", "insights"].includes(value)) ?? "list";
    const aggregate = layout !== "list";
    const listVariant = taskListVariant(route.taskListVariant) ?? taskListVariant(memory?.list_variant);
    const filterIds = taskProjectIds(route, memory);
    const filterKey = filterIds.join(",");
    // A named view owns its project selection before the first results page.
    const waitingForSavedFilter = !!route.savedView && route.taskProjects === undefined;
    const [ordering, setOrdering] = useState(() => ({
        sort: layout === "board" ? layoutSorts(memory).board === "manual" ? memory?.lens ?? "gtd" : layoutSorts(memory).board : layoutSorts(memory).list,
        context: memory?.context ?? "", minutes: memory?.minutes ?? 0, energy: memory?.energy ?? "any" as TaskViewSettings["energy"],
    }));
    const [revision, setRevision] = useState(0);
    const [results, setResults] = useState<Results>({key: "", items: [], cursor: "", loading: true, error: ""});
    const [detail, setDetail] = useState<{id: string; item?: Item; error?: string}>({id: ""});
    const projects = useProjectCatalog();
    const can = useProjectPermissions();
    const readableProjects = projects.filter(project => can(project.id, "project.read"));
    const unavailableCount = filterIds.filter(id => !readableProjects.some(project => project.id === id)).length;
    const accessKey = projects.map(project => `${project.id}:${project.access?.access_revision ?? "unknown"}`).sort().join(";");
    const scope = route.taskScope || (["today", "inbox", "upcoming"].includes(route.taskView ?? "") ? route.taskView! : memory?.task_scope || "all");
    const params = {task_scope: scope, status: route.taskStatus || memory?.status || "open",
        query: route.qPresent || route.q ? route.q : memory?.query ?? "",
        sort: layout === "list" && listVariant === "deadline" ? "deadline" : ordering.sort,
        ...(filterKey && {project_ids: filterKey}), context: ordering.context, minutes: String(ordering.minutes), energy: ordering.energy,
        limit: aggregate ? "100" : "50", timezone: "Asia/Seoul"};
    const requestKey = `${JSON.stringify(params)}:${revision}:${accessKey}:${waitingForSavedFilter}`;
    const generation = useRef(0);
    const controllerRef = useRef<AbortController | null>(null);
    const latestKey = useRef(requestKey);
    latestKey.current = requestKey;
    // List pagination remains explicit. Other layouts must represent every page
    // of the same bounded server snapshot before their totals are complete.
    useEffect(() => {
        if (waitingForSavedFilter) return;
        const controller = new AbortController();
        controllerRef.current = controller;
        const startedGeneration = ++generation.current;
        const active = () => !controller.signal.aborted && generation.current === startedGeneration && latestKey.current === requestKey;
        setResults({key: requestKey, items: [], cursor: "", loading: true, error: ""});
        async function load() {
            let items: Item[] = [];
            let cursor = "";
            let page: TaskPage | undefined;
            let resets = 0;
            const seenCursors = new Set<string>();
            while (active()) {
                try {
                    page = await api.tasks({...params, ...(cursor ? {cursor} : {})}, controller.signal);
                    if (!active()) return;
                    items = [...new Map([...items, ...page.items].map(item => [item.id, item])).values()];
                    cursor = page.next_cursor ?? "";
                    if (cursor && seenCursors.has(cursor)) throw new Error("작업 조회가 같은 페이지를 반복했습니다. 다시 시도해 주세요.");
                    if (cursor) seenCursors.add(cursor);
                    setResults({key: requestKey, items, page, cursor, loading: aggregate && !!cursor, error: ""});
                    if (!aggregate || !cursor) return;
                } catch (cause) {
                    if (!active()) return;
                    if (cause instanceof ApiError && cause.status === 409 && cursor && resets === 0) {
                        // A changed snapshot invalidates every earlier page, too.
                        resets++; items = []; cursor = ""; page = undefined; seenCursors.clear();
                        setResults({key: requestKey, items: [], cursor: "", loading: true, error: ""});
                        continue;
                    }
                    setResults({key: requestKey, items, page, cursor, loading: false, error: errorMessage(cause)});
                    return;
                }
            }
        }
        void load();
        return () => controller.abort();
    }, [requestKey]);
    const current = results.key === requestKey ? results : {key: requestKey, items: [], cursor: "", loading: true, error: ""};
    // Detail is independent of the result set, so an out-of-page selection does
    // not become a chart datum or an extra board card.
    const readableItems = current.items.filter(item => can(item.project_id, "project.read") && (!filterIds.length || filterIds.includes(item.project_id)));
    const selectedRow = readableItems.find(item => item.id === route.item);
    const selectedItem = selectedRow ?? (detail.id === route.item && detail.item && can(detail.item.project_id, "project.read") ? detail.item : undefined);
    useEffect(() => {
        if (!route.item || selectedRow) return;
        const controller = new AbortController();
        const id = route.item;
        setDetail(previous => previous.id === id ? {...previous, error: ""} : {id});
        api.item(id, controller.signal).then(item => {
            if (!controller.signal.aborted) setDetail({id, item});
        }).catch(cause => {if (!controller.signal.aborted) setDetail(previous => ({...previous, id, error: errorMessage(cause)}));});
        return () => controller.abort();
    }, [route.item, selectedRow, revision, accessKey]);
    async function more() {
        const controller = controllerRef.current;
        if (!controller || current.loading || !current.cursor) return;
        const startedKey = requestKey;
        const startedGeneration = generation.current;
        const active = () => !controller.signal.aborted && latestKey.current === startedKey && generation.current === startedGeneration;
        setResults(previous => ({...previous, loading: true, error: ""}));
        try {
            const page = await api.tasks({...params, cursor: current.cursor}, controller.signal);
            if (!active()) return;
            setResults(previous => ({key: requestKey, items: [...new Map([...previous.items, ...page.items].map(item => [item.id, item])).values()], page, cursor: page.next_cursor ?? "", loading: false, error: ""}));
        } catch (cause) {
            if (!active()) return;
            if (cause instanceof ApiError && cause.status === 409) {setRevision(value => value + 1); return;}
            setResults(previous => ({...previous, loading: false, error: errorMessage(cause)}));
        }
    }
    const incomplete = current.loading || !!current.cursor || !!current.error;
    const showResultTotal = incomplete || !!params.query || params.status !== "open" || !!filterKey;
    const summary = current.page
        ? `${showResultTotal ? `${current.items.length} / ${current.page.total}개 · ` : ""}${incomplete ? "일부 결과 · " : ""}열린 작업 ${current.page.scope_counts.all}개 · 오늘 ${current.page.scope_counts.today}개${current.loading ? " · 나머지 불러오는 중…" : ""}${current.error ? " · 조회 실패" : ""}`
        : current.loading ? "작업 불러오는 중…" : "조회 실패";
    function selectProjects(ids: string[]) {
        navigate({taskProjects: [...ids].sort().join(","), taskProject: ""});
    }
    return <TaskStoryProvider projectId="" items={selectedItem && !selectedRow ? [...readableItems, selectedItem] : readableItems} revision={`${revision}:${accessKey}`}>
        <div className="global-task-summary">
            <Popover>
                <PopoverTrigger asChild><Button variant="outline" className="task-project-filter-trigger" aria-label={`프로젝트 필터 · ${filterIds.length ? `${filterIds.length}개 선택` : "모든 프로젝트"}`} disabled={waitingForSavedFilter}>
                    <ListFilter size={16} aria-hidden="true" />{filterIds.length ? `프로젝트 ${filterIds.length}개` : "모든 프로젝트"}
                </Button></PopoverTrigger>
                <PopoverContent align="start" className="task-project-filter" aria-label="보고 싶은 프로젝트 선택">
                    <div className="task-project-filter-heading"><strong>보고 싶은 프로젝트</strong><Button variant="ghost" disabled={!filterIds.length} onClick={() => selectProjects([])}>모두 보기</Button></div>
                    {unavailableCount > 0 && <p className="muted small">선택한 프로젝트 중 {unavailableCount}개를 사용할 수 없습니다.</p>}
                    <div className="task-project-filter-options">
                        {readableProjects.map(project => <label key={project.id}>
                            <Checkbox checked={filterIds.includes(project.id)} disabled={filterIds.length >= 100 && !filterIds.includes(project.id)}
                                onCheckedChange={on => selectProjects(on ? [...filterIds, project.id] : filterIds.filter(id => id !== project.id))} />
                            <span>{project.name}</span>
                        </label>)}
                        {!readableProjects.length && <p className="muted small">볼 수 있는 프로젝트가 없습니다.</p>}
                    </div>
                </PopoverContent>
            </Popover>
            <Field label="소속 프로젝트"><NativeSelect value="" onChange={event => navigate({project: event.target.value, view: "tasks", taskProject: "", item: "", taskScope: scope, taskLayout: layout, taskListVariant: listVariant, taskDensity: route.taskDensity || (memory?.mode === "complex" ? "detailed" : "compact"), q: params.query, taskStatus: params.status})}>
                <option value="">프로젝트로 이동</option>{readableProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </NativeSelect></Field>
            <span role="status" aria-live="polite">{summary}<span className="global-task-timezone"> · 한국 시간</span></span>
        </div>
        {current.error && <ErrorNotice error={current.error} retry={() => setRevision(value => value + 1)} />}
        {detail.id === route.item && detail.error && <ErrorNotice error={detail.error} />}
        <TaskWorkspace projectId="" userId={userId} route={route} items={readableItems} selectedItem={selectedItem} resultsLoading={current.loading} resultsIncomplete={incomplete} catalog={catalog} onOrderingChanged={setOrdering} totalOpen={current.page?.scope_counts.all} onChanged={() => setRevision(value => value + 1)} />
        {!aggregate && current.cursor && <ActionButton disabled={current.loading} onClick={() => void more()}>{current.loading ? "불러오는 중…" : "다음 작업 더 보기"}</ActionButton>}
    </TaskStoryProvider>;
}
