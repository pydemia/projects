import { useId, useMemo, useState } from "react";
import { statusLabels, type Item } from "./models";
import "./task-graph.css";

type Task = Extract<Item, { kind: "task" }>;
type GraphLink = {
    id: string; source_id: string; target_id: string; relation: string;
};
type Edge = { id: string; from: string; to: string; kind: "subtask_of" | "depends_on" };
type Position = { x: number; y: number };

const GRAPH_PAGE_SIZE = 32;
const LOOSE_PAGE_SIZE = 20;
const NODE_WIDTH = 218;
const NODE_HEIGHT = 112;
const COLUMN_GAP = 92;
const ROW_GAP = 48;
const PADDING = 28;

function graphLayout(tasks: readonly Task[], edges: readonly Edge[]) {
    const outgoing = new Map(tasks.map(task => [task.id, new Set<string>()]));
    const incoming = new Map(tasks.map(task => [task.id, 0]));
    const depth = new Map(tasks.map(task => [task.id, 0]));
    for (const edge of edges) {
        const next = outgoing.get(edge.from);
        if (!next || next.has(edge.to)) continue;
        next.add(edge.to);
        incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    }
    const queue = tasks.filter(task => incoming.get(task.id) === 0).map(task => task.id);
    for (let index = 0; index < queue.length; index++) {
        const id = queue[index];
        if (!id) continue;
        for (const next of outgoing.get(id) ?? []) {
            depth.set(next, Math.max(depth.get(next) ?? 0, (depth.get(id) ?? 0) + 1));
            const remaining = (incoming.get(next) ?? 0) - 1;
            incoming.set(next, remaining);
            if (remaining === 0) queue.push(next);
        }
    }
    const rows = [0, 0, 0, 0];
    const positions = new Map<string, Position>();
    let maxColumn = 0;
    for (const task of tasks) {
        // Bound long chains; cycles remain visible rather than hiding their nodes.
        const column = Math.min(depth.get(task.id) ?? 0, 3);
        const row = rows[column] ?? 0;
        rows[column] = row + 1;
        maxColumn = Math.max(column, maxColumn);
        positions.set(task.id, {
            x: PADDING + column * (NODE_WIDTH + COLUMN_GAP),
            y: PADDING + row * (NODE_HEIGHT + ROW_GAP),
        });
    }
    return {
        positions,
        width: PADDING * 2 + (maxColumn + 1) * NODE_WIDTH + maxColumn * COLUMN_GAP,
        height: PADDING * 2 + Math.max(...rows, 1) * (NODE_HEIGHT + ROW_GAP) - ROW_GAP,
    };
}

function edgePath(from: Position, to: Position) {
    const startX = from.x + NODE_WIDTH;
    const startY = from.y + NODE_HEIGHT / 2;
    if (to.x > from.x) {
        const endY = to.y + NODE_HEIGHT / 2;
        const middleX = (startX + to.x) / 2;
        return `M ${startX} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${to.x - 5} ${endY}`;
    }
    if (from.x === to.x && from.y === to.y) {
        return `M ${startX} ${startY} C ${startX + 42} ${startY}, ${startX + 42} ${from.y - 18}, ${startX - 24} ${from.y - 5}`;
    }
    const bendX = Math.max(startX, to.x + NODE_WIDTH) + 28;
    const endY = to.y + NODE_HEIGHT - 24;
    return `M ${startX} ${startY} C ${bendX} ${startY}, ${bendX} ${endY}, ${to.x + NODE_WIDTH + 5} ${endY}`;
}

function PageControls({ page, total, size, label, onChange }: {
    page: number; total: number; size: number; label: string;
    onChange: (page: number) => void;
}) {
    if (total <= size) return null;
    return <nav className="task-graph-pages" aria-label={label}>
        <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)} aria-label={`${label} 이전`}>이전</button>
        <span>{page + 1} / {Math.ceil(total / size)}</span>
        <button type="button" disabled={(page + 1) * size >= total} onClick={() => onChange(page + 1)} aria-label={`${label} 다음`}>다음</button>
    </nav>;
}

export function TaskGraph({ tasks, links, selectedId, onOpen, loading = false, incomplete = false }: {
    tasks: Task[];
    links: readonly GraphLink[];
    selectedId?: string | null;
    onOpen: (id: string) => void;
    loading?: boolean;
    incomplete?: boolean;
}) {
    const markerId = useId().replace(/:/g, "");
    const [requestedPage, setPage] = useState(0);
    const [requestedLoosePage, setLoosePage] = useState(0);
    const { byId, edges, connected, loose } = useMemo(() => {
        const byId = new Map(tasks.map(task => [task.id, task]));
        const edges: Edge[] = [];
        const connectedIds = new Set<string>();
        for (const link of links) {
            if (!byId.has(link.source_id) || !byId.has(link.target_id)) continue;
            if (link.relation !== "subtask_of" && link.relation !== "depends_on") continue;
            edges.push({ id: link.id, from: link.target_id, to: link.source_id, kind: link.relation });
            connectedIds.add(link.source_id);
            connectedIds.add(link.target_id);
        }
        return {
            byId, edges,
            connected: tasks.filter(task => connectedIds.has(task.id)),
            loose: tasks.filter(task => !connectedIds.has(task.id)),
        };
    }, [tasks, links]);
    const page = Math.min(requestedPage, Math.max(0, Math.ceil(connected.length / GRAPH_PAGE_SIZE) - 1));
    const loosePage = Math.min(requestedLoosePage, Math.max(0, Math.ceil(loose.length / LOOSE_PAGE_SIZE) - 1));
    const pageTasks = connected.slice(page * GRAPH_PAGE_SIZE, (page + 1) * GRAPH_PAGE_SIZE);
    const pageIds = new Set(pageTasks.map(task => task.id));
    const pageEdges = edges.filter(edge => pageIds.has(edge.from) && pageIds.has(edge.to));
    const crossingEdges = edges.filter(edge => pageIds.has(edge.from) !== pageIds.has(edge.to)).length;
    const layout = graphLayout(pageTasks, pageEdges);

    function taskButton(task: Task, positioned: boolean) {
        const position = layout.positions.get(task.id);
        return <button
            type="button" key={task.id}
            data-task-graph-id={task.id}
            className={`task-graph-node${positioned ? " task-graph-node-positioned" : ""}${selectedId === task.id ? " is-selected" : ""}`}
            style={positioned && position ? { left: position.x, top: position.y, width: NODE_WIDTH, height: NODE_HEIGHT } : undefined}
            aria-current={selectedId === task.id ? "true" : undefined}
            onClick={() => onOpen(task.id)}
        >
            <span className="task-graph-project">{task.project_name || "프로젝트"}</span>
            <strong title={task.title}>{task.title}</strong>
            <span className="task-graph-node-meta">
                <span className={`task-graph-state task-graph-state-${task.data.state}`}>{statusLabels[task.data.state] ?? task.data.state}</span>
                {selectedId === task.id && <span className="task-graph-selected">선택됨</span>}
            </span>
        </button>;
    }

    return <section className="task-graph" aria-label="작업 그래프" aria-busy={loading}>
        <header className="task-graph-header">
            <div><h2>작업의 연결</h2><p>현재 필터에 포함된 작업의 상하위 관계와 의존성을 확인합니다.</p></div>
            <span className="task-graph-count">작업 {tasks.length}개 · 관계 {edges.length}개</span>
        </header>
        <div className="task-graph-legend" aria-label="관계 범례">
            <span><i className="task-graph-line" aria-hidden="true" />상위 작업 → 하위 작업</span>
            <span><i className="task-graph-line task-graph-line-dependency" aria-hidden="true" />선행 작업 → 의존 작업</span>
        </div>
        {loading && <p className="task-graph-notice" role="status">작업 관계를 불러오는 중입니다.</p>}
        {incomplete && !loading && <p className="task-graph-notice" role="status">불러온 작업과 관계만 표시하고 있습니다.</p>}
        {!tasks.length ? <div className="task-graph-empty"><h3>{loading ? "작업을 불러오는 중입니다" : "표시할 작업이 없습니다"}</h3><p>범위나 필터를 변경하면 작업과 관계를 확인할 수 있습니다.</p></div> : <>
            {connected.length > 0 ? <>
                <div className="task-graph-toolbar">
                    <span>연결된 작업 {connected.length}개{connected.length > GRAPH_PAGE_SIZE ? ` 중 ${page * GRAPH_PAGE_SIZE + 1}–${Math.min((page + 1) * GRAPH_PAGE_SIZE, connected.length)}개 표시` : ""}</span>
                    <PageControls page={page} total={connected.length} size={GRAPH_PAGE_SIZE} label="그래프 페이지" onChange={setPage} />
                </div>
                <p className="task-graph-instruction">작업을 선택하면 상세 정보를 엽니다. 넓은 그래프는 가로로 스크롤할 수 있습니다.</p>
                <div className="task-graph-viewport" tabIndex={0} role="group" aria-label="작업 연결도, 가로 및 세로 스크롤 가능">
                    <div className="task-graph-canvas" style={{ width: layout.width, height: layout.height }}>
                        <svg className="task-graph-edges" width={layout.width} height={layout.height} aria-hidden="true" focusable="false">
                            <defs>
                                <marker id={`${markerId}-hierarchy`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" className="task-graph-arrow" /></marker>
                                <marker id={`${markerId}-dependency`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" className="task-graph-arrow-dependency" /></marker>
                            </defs>
                            {pageEdges.map(edge => {
                                const from = layout.positions.get(edge.from);
                                const to = layout.positions.get(edge.to);
                                return from && to ? <path key={edge.id} d={edgePath(from, to)} className={`task-graph-edge${edge.kind === "depends_on" ? " task-graph-edge-dependency" : ""}`} markerEnd={`url(#${markerId}-${edge.kind === "depends_on" ? "dependency" : "hierarchy"})`} /> : null;
                            })}
                        </svg>
                        {pageTasks.map(task => taskButton(task, true))}
                    </div>
                </div>
                {crossingEdges > 0 && <p className="task-graph-instruction">다른 페이지의 작업과 연결된 관계 {crossingEdges}개는 아래 관계 목록에서 확인할 수 있습니다.</p>}
                <details className="task-graph-relations">
                    <summary>관계 목록 · 현재 페이지의 작업과 연결된 관계</summary>
                    <ul>{edges.filter(edge => pageIds.has(edge.from) || pageIds.has(edge.to)).map(edge => <li key={edge.id}>
                        <button type="button" onClick={() => onOpen(edge.from)}>{byId.get(edge.from)?.title}</button>
                        <span>{edge.kind === "subtask_of" ? "상위 → 하위" : "선행 → 의존"}</span>
                        <button type="button" onClick={() => onOpen(edge.to)}>{byId.get(edge.to)?.title}</button>
                    </li>)}</ul>
                </details>
            </> : <div className="task-graph-empty"><h3>{loading ? "연결을 확인하고 있습니다" : "표시할 작업 관계가 없습니다"}</h3><p>작업 상세에서 상위 작업이나 선행 작업을 연결하면 그래프로 표시됩니다. 필터 밖의 작업과의 연결은 이 그래프에 표시되지 않습니다.</p></div>}
            {loose.length > 0 && <section className="task-graph-loose" aria-label="현재 범위에서 연결되지 않은 작업">
                <div className="task-graph-toolbar"><h3>현재 범위에서 연결되지 않은 작업 <span>{loose.length}</span></h3><PageControls page={loosePage} total={loose.length} size={LOOSE_PAGE_SIZE} label="연결되지 않은 작업 페이지" onChange={setLoosePage} /></div>
                <div className="task-graph-loose-items">{loose.slice(loosePage * LOOSE_PAGE_SIZE, (loosePage + 1) * LOOSE_PAGE_SIZE).map(task => taskButton(task, false))}</div>
            </section>}
        </>}
    </section>;
}
