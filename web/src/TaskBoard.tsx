import { useEffect, useMemo, useState } from "react";
import { ApiError, api, errorMessage } from "./api";
import { navigate, useMobileViewport } from "./hooks";
import { statusLabels } from "./models";
import type { Item } from "./models";
import { Button } from "./pydemia-ui/button";
import { Checkbox } from "./pydemia-ui/checkbox";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "./pydemia-ui/dropdown-menu";
import { Input } from "./pydemia-ui/input";
import { Kanban, moveKanbanCard } from "./pydemia-ui/kanban";
import type { KanbanColumn, KanbanMove } from "./pydemia-ui/kanban";
import { NativeSelect } from "./pydemia-ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "./pydemia-ui/popover";
import { RouteLink } from "./ui";

type Task = Extract<Item, { kind: "task" }>;
type TaskState = Task["data"]["state"];
const states: TaskState[] = ["todo", "in_progress", "in_review", "done", "cancelled"];
type UndoMove = {
    taskId: string; title: string; expectedRevision: number;
    source_state: TaskState; target_state: TaskState;
    before_id: string | null; after_id: string | null;
};

function readUndo(key: string): UndoMove | null {
    try {
        const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
        if (!value || typeof value !== "object") return null;
        const undo = value as Record<string, unknown>;
        return typeof undo.taskId === "string" && typeof undo.title === "string" &&
            typeof undo.expectedRevision === "number" &&
            states.includes(undo.source_state as TaskState) &&
            states.includes(undo.target_state as TaskState) &&
            (undo.before_id === null || typeof undo.before_id === "string") &&
            (undo.after_id === null || typeof undo.after_id === "string")
            ? undo as UndoMove : null;
    } catch { return null; }
}

export function TaskBoard({ projectId, tasks, lens, savedSort, onSortChange, selectedIds, onSelect, cardFields, onChanged, onError }: {
    projectId: string;
    tasks: Task[];
    lens: "gtd" | "abc";
    savedSort: "manual" | "gtd" | "abc" | "due_date" | null;
    onSortChange: (value: "manual" | "gtd" | "abc" | "due_date") => void;
    selectedIds: ReadonlySet<string>;
    onSelect: (taskId: string, shift: boolean) => void;
    cardFields: readonly string[];
    onChanged: () => void;
    onError: (message: string) => void;
}) {
    const mobile = useMobileViewport();
    const sortKey = `projects:board-sort:${projectId}`;
    const undoKey = `projects:board-undo:${projectId}`;
    const mobileStateKey = `projects:board-mobile-state:${projectId}`;
    const [sortMode, setSortMode] = useState<"manual" | "auto">(() =>
        sessionStorage.getItem(sortKey) === "auto" ? "auto" : "manual");
    useEffect(() => {
        if (savedSort) setSortMode(savedSort === "manual" ? "manual" : "auto");
    }, [savedSort]);
    const [optimistic, setOptimistic] = useState<KanbanColumn[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState("");
    const [statusOpenId, setStatusOpenId] = useState<string | null>(null);
    const [quickState, setQuickState] = useState<TaskState | null>(null);
    const [quickTitle, setQuickTitle] = useState("");
    const [quickReason, setQuickReason] = useState("");
    const [mobileState, setMobileState] = useState<TaskState>(() => {
        const saved = sessionStorage.getItem(mobileStateKey) as TaskState | null;
        return saved && states.includes(saved) ? saved : "todo";
    });
    const [undo, setUndo] = useState<UndoMove | null>(() => readUndo(undoKey));
    const taskById = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
    const baseColumns = useMemo<KanbanColumn[]>(() => states.map(state => ({
        id: state, title: statusLabels[state]!, cards: tasks.filter(task => task.data.state === state)
            .sort((left, right) => sortMode === "manual"
                ? (left.board_order ?? 0) - (right.board_order ?? 0) || left.created_at.localeCompare(right.created_at)
                : tasks.indexOf(left) - tasks.indexOf(right))
            .map(task => ({ id: task.id, title: task.title, description: cardFields.map(field => {
                if (field === "list_name") return task.data.list_name;
                if (field === "due_date") return task.data.due_date ? `마감 ${task.data.due_date}` : "";
                if (field === "planned_date") return task.data.planned_date ? `실행 ${task.data.planned_date}` : "";
                if (field === "estimated_minutes") return task.data.estimated_minutes ? `${task.data.estimated_minutes}분` : "";
                if (field === "abc_priority") return task.data.abc_priority !== "none" ? `ABC ${task.data.abc_priority}` : "";
                if (field === "github_issue_url") return task.data.github_issue_url ? "GitHub Issue" : "";
                if (field === "context" || field === "goal") return task.data[field];
                return "";
            }).filter(Boolean).join(" · ") })),
    })), [tasks, sortMode, cardFields]);
    useEffect(() => { setOptimistic(null); setBusy(false); }, [tasks]);
    const columns = optimistic ?? baseColumns;
    function selectMobileState(state: TaskState) {
        sessionStorage.setItem(mobileStateKey, state);
        setMobileState(state);
    }
    function rememberUndo(value: UndoMove | null) {
        if (value) sessionStorage.setItem(undoKey, JSON.stringify(value));
        else sessionStorage.removeItem(undoKey);
        setUndo(value);
    }

    async function commitMove(next: KanbanColumn[], move: KanbanMove) {
        if (busy) return;
        if (sortMode === "auto" && move.fromColumnId === move.toColumnId) {
            onError("GTD/ABC 자동 정렬 중에는 열 안 순서를 바꿀 수 없습니다. 보드 정렬을 수동으로 바꿔 주세요.");
            return;
        }
        const task = taskById.get(move.cardId);
        const target = next.find(column => column.id === move.toColumnId);
        if (!task || !target) return;
        // Auto views have a visual order that can differ from the persisted manual order.
        // A status change there appends to the destination's manual order.
        const beforeId = sortMode === "manual" ? target.cards[move.toIndex + 1]?.id ?? null : null;
        // A filtered board omits tasks between visible neighbors. Anchor on only one
        // visible task so hidden cards keep their relative order on the server.
        const afterId = sortMode === "manual" && beforeId === null
            ? target.cards[move.toIndex - 1]?.id ?? null : null;
        setOptimistic(next); setBusy(true); onError("");
        try {
            const moved = await api.moveTask(task.id, {
                expected_revision: task.revision,
                source_state: move.fromColumnId,
                target_state: move.toColumnId,
                before_id: beforeId,
                after_id: afterId,
            });
            rememberUndo({
                taskId: task.id, title: task.title, expectedRevision: moved.revision,
                ...moved.undo_move,
            });
            selectMobileState(move.toColumnId as TaskState);
            onChanged();
        } catch (cause) {
            setOptimistic(null); setBusy(false);
            const completionGate = cause instanceof ApiError && cause.status === 409 &&
                task.data.workflow === "delivery" && move.toColumnId === "done";
            onError(completionGate
                ? `${errorMessage(cause)} 작업 상세에서 완료 근거를 확인해 주세요.`
                : `${errorMessage(cause)} 최신 작업을 불러온 뒤 다시 이동해 주세요.`);
            onChanged();
        }
    }

    async function undoLastMove() {
        if (!undo || busy) return;
        setBusy(true); onError("");
        try {
            await api.moveTask(undo.taskId, {
                expected_revision: undo.expectedRevision,
                source_state: undo.source_state,
                target_state: undo.target_state,
                before_id: undo.before_id,
                after_id: undo.after_id,
            });
            rememberUndo(null);
            selectMobileState(undo.target_state);
            onChanged();
        } catch (cause) {
            setBusy(false);
            if (cause instanceof ApiError && (cause.status === 409 || cause.status === 422)) rememberUndo(null);
            onError(`${errorMessage(cause)} 최신 작업을 불러온 뒤 다시 확인해 주세요.`);
            onChanged();
        }
    }

    function moveWithMenu(task: Task, state: TaskState, beforeId: string | null = null) {
        setStatusOpenId(null);
        if (busy) return;
        const result = moveKanbanCard(columns, task.id, state, beforeId);
        if (result) void commitMove(result.columns, result.move);
    }

    function adjacent(task: Task, direction: "up" | "down") {
        if (sortMode === "auto") {
            onError("자동 정렬 중에는 수동 순서를 바꿀 수 없습니다.");
            return;
        }
        const column = columns.find(candidate => candidate.id === task.data.state);
        if (!column) return;
        const index = column.cards.findIndex(card => card.id === task.id);
        if (direction === "up" && index > 0) moveWithMenu(task, task.data.state, column.cards[index - 1]!.id);
        if (direction === "down" && index >= 0 && index < column.cards.length - 1)
            moveWithMenu(task, task.data.state, column.cards[index + 2]?.id ?? null);
    }

    async function quickCreate(event: React.FormEvent, state: TaskState) {
        event.preventDefault();
        if (!quickTitle.trim() || busy) return;
        setBusy(true); onError("");
        try {
            await api.quickTask(projectId, {
                title: quickTitle.trim(), state,
                cancellation_reason: state === "cancelled" ? quickReason.trim() : "",
            });
            setQuickTitle(""); setQuickReason(""); setQuickState(null);
            onChanged();
        } catch (cause) {
            setBusy(false); onError(errorMessage(cause));
        }
    }

    return <div className="task-board-wrap" data-mobile-state={mobileState}>
        {mobile && <div className="mobile-board-picker"><label htmlFor="mobile-board-state">상태 열</label><NativeSelect id="mobile-board-state" value={mobileState} onChange={event => selectMobileState(event.target.value as TaskState)}>
            {columns.map(column => <option key={column.id} value={column.id}>{column.title} · {column.cards.length}개</option>)}
        </NativeSelect><p className="muted small">카드 메뉴로 상태와 순서를 변경할 수 있습니다.</p></div>}
        <div className="task-board-toolbar">
            <label htmlFor="task-board-sort">보드 정렬</label>
            <NativeSelect id="task-board-sort" value={sortMode} onChange={event => {
                const next = event.target.value === "auto" ? "auto" : "manual";
                setSortMode(next);
                sessionStorage.setItem(sortKey, next);
                onSortChange(next === "manual" ? "manual" : lens);
            }}>
                <option value="manual">수동 순서 · 드래그 가능</option>
                <option value="auto">{lens.toUpperCase()} 자동 순서 · 열 안 이동 제한</option>
            </NativeSelect>
            <span role="status" aria-live="polite">{busy ? "이동 저장 중…" : "카드를 끌거나 이동 버튼·메뉴를 사용하세요."}</span>
            {undo && <Button variant="outline" disabled={busy} onClick={() => { void undoLastMove(); }}>
                {undo.title} 이동 되돌리기
            </Button>}
        </div>
        <Kanban label="작업 상태 보드" columns={columns} onColumnsChange={(next, move) => { void commitMove(next, move); }}
            canReorder={sortMode === "manual"}
            canMove={move => {
                if (busy) return false;
                if (sortMode === "auto" && move.fromColumnId === move.toColumnId) {
                    onError("자동 정렬 중에는 열 안 순서를 바꿀 수 없습니다. 보드 정렬을 수동으로 바꿔 주세요.");
                    return false;
                }
                return true;
            }}
            className={busy ? "task-kanban task-board-busy" : "task-kanban"}
            renderColumnFooter={column => <div className="task-board-create">
                {quickState === column.id ? <form onSubmit={event => { void quickCreate(event, column.id as TaskState); }}>
                    <Input autoFocus aria-label={`${column.title} 새 작업 제목`} maxLength={300} value={quickTitle}
                        onChange={event => setQuickTitle(event.target.value)} placeholder="새 작업 제목" />
                    {column.id === "cancelled" && <Input aria-label="취소 사유" value={quickReason}
                        onChange={event => setQuickReason(event.target.value)} placeholder="취소 사유" />}
                    <div><Button type="submit" disabled={busy || !quickTitle.trim() || column.id === "cancelled" && !quickReason.trim()}
                        onClick={event => { event.preventDefault(); void quickCreate(event, column.id as TaskState); }}>추가</Button>
                        <Button type="button" variant="ghost" onClick={() => { setQuickState(null); setQuickTitle(""); }}>취소</Button></div>
                </form> : <Button variant="ghost" disabled={busy} onClick={() => { setQuickState(column.id as TaskState); setQuickTitle(""); }}>
                    + {column.title} 작업
                </Button>}
            </div>}
            renderCard={card => {
                const task = taskById.get(card.id);
                if (!task) return null;
                const currentColumn = columns.find(column => column.id === task.data.state);
                const cardIndex = currentColumn?.cards.findIndex(candidate => candidate.id === task.id) ?? -1;
                return <div className="task-board-card-actions">
                    <Checkbox aria-label={`${task.title} 일괄 선택`} checked={selectedIds.has(task.id)}
                        disabled={busy} onClick={event => onSelect(task.id, event.shiftKey)} />
                    <RouteLink patch={{ item: task.id }} className="task-board-detail">상세 열기</RouteLink>
                    <Popover open={statusOpenId === task.id} onOpenChange={open => { setStatusOpenId(open ? task.id : null); if (open) setSearch(""); }}>
                        <PopoverTrigger className="task-status-trigger" disabled={busy} aria-label={`${task.title} 상태 메뉴`}>
                            {statusLabels[task.data.state]} ▾
                        </PopoverTrigger>
                        <PopoverContent align="start" className="task-status-popover">
                            <label htmlFor={`status-search-${task.id}`}>상태 검색</label>
                            <Input id={`status-search-${task.id}`} value={search} onChange={event => setSearch(event.target.value)}
                                onKeyDown={event => event.stopPropagation()} placeholder="상태 검색" />
                            <div className="task-status-options">
                                {states.filter(state => statusLabels[state]!.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
                                    .map(state => <Button key={state} variant={state === task.data.state ? "outline" : "ghost"}
                                        aria-current={state === task.data.state ? "true" : undefined}
                                        onClick={() => {
                                            if (state === task.data.state) setStatusOpenId(null);
                                            else moveWithMenu(task, state);
                                        }}>{statusLabels[state]}</Button>)}
                            </div>
                        </PopoverContent>
                    </Popover>
                    <DropdownMenu>
                        <DropdownMenuTrigger className="task-more-trigger" disabled={busy} aria-label={`${task.title} 작업 메뉴`}>…</DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>{task.title}</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => navigate({ item: task.id })}>상세 편집</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={sortMode === "auto" || cardIndex <= 0}
                                onSelect={() => adjacent(task, "up")}>위로 이동</DropdownMenuItem>
                            <DropdownMenuItem disabled={sortMode === "auto" || cardIndex < 0 || cardIndex >= (currentColumn?.cards.length ?? 0) - 1}
                                onSelect={() => adjacent(task, "down")}>아래로 이동</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => moveWithMenu(task, "done")}>완료 열로 이동</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>;
            }} />
    </div>;
}
