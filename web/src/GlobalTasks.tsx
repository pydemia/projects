import { useEffect, useRef, useState } from "react";
import { ApiError, api, errorMessage } from "./api";
import { useProjectCatalog, useProjectPermissions } from "./ProjectPermissions";
import { navigate } from "./hooks";
import type { Route } from "./hooks";
import { layoutSorts, readTaskViewMemory } from "./task-view-memory";
import type { Catalog, Item, TaskViewSettings } from "./models";
import { NativeSelect } from "./pydemia-ui/native-select";
import { TaskWorkspace } from "./TaskWorkspace";
import { TaskStoryProvider } from "./StoryChips";
import { ActionButton, ErrorNotice, Field } from "./ui";

type TaskPage = Awaited<ReturnType<typeof api.tasks>>;
type Results = { key: string; items: Item[]; page?: TaskPage; cursor: string; loading: boolean; error: string };

export function GlobalTasks({ userId, route, catalog }: {
    userId: string; route: Route; catalog?: Catalog;
}) {
    const memory = readTaskViewMemory(`projects:task-view-memory:${userId}:global`)?.settings;
    const layout = route.taskLayout || (["list", "board", "calendar", "insights"].includes(route.taskView ?? "") ? route.taskView : "") || memory?.view || "list";
    const aggregate = layout !== "list";
    const [ordering, setOrdering] = useState(() => ({
        sort: layout === "board" ? layoutSorts(memory).board === "manual" ? memory?.lens ?? "gtd" : layoutSorts(memory).board : layoutSorts(memory).list,
        context: memory?.context ?? "", minutes: memory?.minutes ?? 0, energy: memory?.energy ?? "any" as TaskViewSettings["energy"],
    }));
    const [revision, setRevision] = useState(0);
    const [results, setResults] = useState<Results>({key: "", items: [], cursor: "", loading: true, error: ""});
    const [detail, setDetail] = useState<{id: string; item?: Item; error?: string}>({id: ""});
    const projects = useProjectCatalog();
    const can = useProjectPermissions();
    const accessKey = projects.map(project => `${project.id}:${project.access?.access_revision ?? "unknown"}`).sort().join(";");
    const params = {task_scope: route.taskScope || (["today", "inbox", "upcoming"].includes(route.taskView ?? "") ? route.taskView! : "all"), status: route.taskStatus || "open", query: route.q, sort: ordering.sort, context: ordering.context, minutes: String(ordering.minutes), energy: ordering.energy, limit: aggregate ? "100" : "50", timezone: "Asia/Seoul"};
    const requestKey = `${JSON.stringify(params)}:${revision}:${accessKey}`;
    const generation = useRef(0);
    const controllerRef = useRef<AbortController | null>(null);
    const latestKey = useRef(requestKey);
    latestKey.current = requestKey;
    // List pagination remains explicit. Other layouts must represent every page
    // of the same bounded server snapshot before their totals are complete.
    useEffect(() => {
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
    const readableItems = current.items.filter(item => can(item.project_id, "project.read"));
    const selectedRow = readableItems.find(item => item.id === route.item);
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
    const summary = current.page
        ? `${current.items.length} / ${current.page.total}개${incomplete ? " · 일부 결과" : " · 전체 결과"} · 열린 작업 ${current.page.scope_counts.all}개 · 오늘 ${current.page.scope_counts.today}개${current.loading ? " · 나머지 불러오는 중…" : ""}${current.error ? " · 조회 실패" : ""}`
        : current.loading ? "작업 불러오는 중…" : "조회 실패";
    return <TaskStoryProvider projectId="" items={readableItems} revision={`${revision}:${accessKey}`}>
        <div className="global-task-summary"><Field label="소속 프로젝트"><NativeSelect value="" onChange={event => navigate({project: event.target.value, view: "tasks", taskProject: "", taskScope: route.taskScope, taskLayout: route.taskLayout || layout, taskDensity: route.taskDensity || (memory?.mode === "complex" ? "detailed" : "compact"), q: route.q, taskStatus: route.taskStatus})}><option value="">모든 프로젝트</option>{projects.filter(project => can(project.id, "project.read")).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</NativeSelect></Field>
            <span>기준 시간대 Asia/Seoul · </span><span role="status" aria-live="polite">{summary}</span>
        </div>
        {current.error && <ErrorNotice error={current.error} retry={() => setRevision(value => value + 1)} />}
        {detail.id === route.item && detail.error && <ErrorNotice error={detail.error} />}
        <TaskWorkspace projectId="" userId={userId} route={route} items={readableItems} selectedItem={selectedRow ?? (detail.id === route.item && detail.item && can(detail.item.project_id, "project.read") ? detail.item : undefined)} resultsLoading={current.loading} resultsIncomplete={incomplete} catalog={catalog} onOrderingChanged={setOrdering} totalOpen={current.page?.scope_counts.all} onChanged={() => setRevision(value => value + 1)} />
        {!aggregate && current.cursor && <ActionButton disabled={current.loading} onClick={() => void more()}>{current.loading ? "불러오는 중…" : "다음 작업 더 보기"}</ActionButton>}
    </TaskStoryProvider>;
}
