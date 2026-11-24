import { useEffect, useMemo, useRef, useState } from "react";
import { formatDateOnly } from "./date-time";
import { useDateTimeSettings } from "./date-time-settings";
import { z } from "zod";
import { useAuthenticationDraft, type AuthenticationDraft } from "./auth-drafts";
import { useProjectPermissions } from "./ProjectPermissions";
import { ApiError, api, errorMessage } from "./api";
import { TaskTitleEdit } from "./TaskTitleEdit";
import { TaskStoryChips } from "./StoryChips";
import { navigate, useMobileViewport } from "./hooks";
import { statusLabels } from "./models";
import type { Item, TaskFieldDefinition } from "./models";
import { formatTaskField, taskFieldLabel } from "./TaskFields";
import { Button } from "./pydemia-ui/button";
import { Checkbox } from "./pydemia-ui/checkbox";
import { Input } from "./pydemia-ui/input";
import { Kanban } from "./pydemia-ui/kanban";
import type { KanbanColumn, KanbanMove } from "./pydemia-ui/kanban";
import { NativeSelect } from "./pydemia-ui/native-select";

type Task = Extract<Item, { kind: "task" }>;
type TaskState = Task["data"]["state"];
const states: TaskState[] = ["todo", "in_progress", "in_review", "done", "cancelled"];
const quickCardDraftSchema = z.object({state: z.enum(["todo", "in_progress", "in_review", "done", "cancelled"]), title: z.string(), reason: z.string()}).strict();
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

export function TaskBoard({ projectId, tasks, lens, savedSort, onSortChange, selectedIds, onSelect, cardFields, definitions = [], onChanged, onError }: {
    projectId: string;
    tasks: Task[];
    lens: "gtd" | "abc";
    savedSort: "manual" | "gtd" | "abc" | "due_date" | null;
    onSortChange: (value: "manual" | "gtd" | "abc" | "due_date") => void;
    selectedIds: ReadonlySet<string>;
    onSelect: (taskId: string, shift: boolean) => void;
    cardFields: readonly string[];
    definitions?: readonly TaskFieldDefinition[];
    onChanged: () => void;
    onError: (message: string) => void;
}) {
    const {dateFormat, timeZone} = useDateTimeSettings();
    const recovery: AuthenticationDraft<z.infer<typeof quickCardDraftSchema>> = useAuthenticationDraft(`board:${projectId || "global"}:creation`, quickCardDraftSchema,
        () => quickState ? {state: quickState, title: quickTitle, reason: quickReason} : null);
    const mobile = useMobileViewport();
    const wrapRef = useRef<HTMLDivElement>(null);
    const can = useProjectPermissions();
    const sortKey = `projects:board-sort:${projectId}`;
    const undoKey = `projects:board-undo:${projectId}`;
    const mobileStateKey = `projects:board-mobile-state:${projectId}`;
    const [sortMode, setSortMode] = useState<"manual" | "auto">(() =>
        !projectId || sessionStorage.getItem(sortKey) === "auto" ? "auto" : "manual");
    useEffect(() => {
        if (savedSort) setSortMode(projectId && savedSort === "manual" ? "manual" : "auto");
    }, [savedSort, projectId]);
    const [optimistic, setOptimistic] = useState<KanbanColumn[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [quickState, setQuickState] = useState<TaskState | null>(recovery.restored?.state ?? null);
    const [quickTitle, setQuickTitle] = useState(recovery.restored?.title ?? "");
    const [quickReason, setQuickReason] = useState(recovery.restored?.reason ?? "");
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
            .map(task => ({ id: task.id, title: task.title, description: [...(!projectId ? [task.project_name ?? task.project_id] : []), ...cardFields.map(field => {
                if (field.startsWith("custom:")) {
                    const value = formatTaskField(task, field, definitions, dateFormat, timeZone);
                    return value === "—" ? "" : `${taskFieldLabel(field, definitions, task.project_id)} ${value}`;
                }
                if (field === "list_name") return task.data.list_name;
                if (field === "due_date") return task.data.due_date ? `마감 ${formatDateOnly(task.data.due_date, dateFormat, timeZone)}` : "";
                if (field === "planned_date") return task.data.planned_date ? `실행 ${formatDateOnly(task.data.planned_date, dateFormat, timeZone)}` : "";
                if (field === "estimated_minutes") return task.data.estimated_minutes ? `${task.data.estimated_minutes}분` : "";
                if (field === "abc_priority") return task.data.abc_priority !== "none" ? `ABC ${task.data.abc_priority}` : "";
                if (field === "github_issue_url") return task.data.github_issue_url ? "GitHub Issue" : "";
                if (field === "context" || field === "goal") return task.data[field];
                return "";
            })].filter(Boolean).join(" · ") })),
    })), [tasks, sortMode, cardFields, projectId, definitions, dateFormat, timeZone]);
    useEffect(() => { setOptimistic(null); setBusy(false); }, [tasks]);
    const columns = optimistic ?? baseColumns;
    function scrollToColumn(state: TaskState) {
        const board = wrapRef.current?.querySelector<HTMLElement>('[data-ui="kanban"]');
        const column = board?.querySelector<HTMLElement>(`[data-kanban-column="${state}"]`);
        if (!board || !column) return;
        const left = board.scrollLeft + column.getBoundingClientRect().left - board.getBoundingClientRect().left;
        if (board.scrollTo) board.scrollTo({left});
        else board.scrollLeft = left;
    }
    useEffect(() => { if (mobile) scrollToColumn(mobileState); }, [mobile]);
    useEffect(() => {
        if (!mobile) return;
        const nav = wrapRef.current?.querySelector<HTMLElement>('.mobile-board-picker nav');
        const active = nav?.querySelector<HTMLElement>('[aria-current="true"]');
        if (!nav || !active) return;
        const bounds = nav.getBoundingClientRect();
        const button = active.getBoundingClientRect();
        if (button.left < bounds.left) nav.scrollLeft += button.left - bounds.left;
        else if (button.right > bounds.right) nav.scrollLeft += button.right - bounds.right;
    }, [mobile, mobileState]);
    function selectMobileState(state: TaskState) {
        sessionStorage.setItem(mobileStateKey, state);
        setMobileState(state);
        if (mobile) scrollToColumn(state);
    }
    function rememberScrolledColumn(board: HTMLElement) {
        if (!mobile) return;
        const left = board.getBoundingClientRect().left;
        const nearest = [...board.querySelectorAll<HTMLElement>('[data-kanban-column]')]
            .sort((a, b) => Math.abs(a.getBoundingClientRect().left - left) - Math.abs(b.getBoundingClientRect().left - left))[0];
        const state = nearest?.dataset.kanbanColumn as TaskState | undefined;
        if (state && states.includes(state) && state !== mobileState) {
            sessionStorage.setItem(mobileStateKey, state);
            setMobileState(state);
        }
    }
    function rememberUndo(value: UndoMove | null) {
        if (value) sessionStorage.setItem(undoKey, JSON.stringify(value));
        else sessionStorage.removeItem(undoKey);
        setUndo(value);
    }

    async function commitMove(next: KanbanColumn[], move: KanbanMove) {
        if (busy || !can(taskById.get(move.cardId)?.project_id ?? "", "task.update")) return;
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
        if (!can(projectId, "task.update")) return;
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

    async function quickCreate(event: React.FormEvent, state: TaskState) {
        if (!can(projectId, "task.create")) {event.preventDefault(); return;}
        event.preventDefault();
        if (!quickTitle.trim() || busy) return;
        setBusy(true); onError("");
        try {
            await api.quickTask(projectId, {
                title: quickTitle.trim(), state,
                cancellation_reason: state === "cancelled" ? quickReason.trim() : "",
            });
            setQuickTitle(""); setQuickReason(""); setQuickState(null);
            recovery.clear();
            onChanged();
        } catch (cause) {
            setBusy(false); onError(errorMessage(cause));
        }
    }

    return <div ref={wrapRef} className="task-board-wrap" data-mobile-state={mobileState}>
        {mobile && <div className="mobile-board-picker"><nav aria-label="보드 상태 열">
            {columns.map(column => <Button key={column.id} variant={mobileState === column.id ? "outline" : "ghost"} aria-current={mobileState === column.id ? "true" : undefined}
                onClick={() => selectMobileState(column.id as TaskState)}>{column.title} · {column.cards.length}</Button>)}
        </nav><p className="muted small">좌우로 스크롤해 상태 열을 살펴보세요. 카드 메뉴로 이동할 수 있습니다.</p></div>}
        <div className="task-board-toolbar">
            <label htmlFor="task-board-sort">보드 정렬</label>
            <NativeSelect id="task-board-sort" value={sortMode} onChange={event => {
                const next = event.target.value === "auto" ? "auto" : "manual";
                setSortMode(next);
                sessionStorage.setItem(sortKey, next);
                onSortChange(next === "manual" ? "manual" : lens);
            }}>
                <option value="manual" disabled={!projectId}>수동 순서 · 드래그 가능</option>
                <option value="auto">{lens.toUpperCase()} 자동 순서 · 열 안 이동 제한</option>
            </NativeSelect>
            {!projectId && <span>전역 보드는 자동 정렬입니다. 수동 순서는 프로젝트 작업에서 변경하세요.</span>}<span role="status" aria-live="polite">{busy ? "이동 저장 중…" : !mobile ? "좌우로 스크롤해 열을 확인하세요. 카드는 끌거나 작업 메뉴에서 이동할 수 있습니다." : ""}</span>
            {undo && <Button variant="outline" disabled={busy || !can(projectId, "task.update")} onClick={() => { void undoLastMove(); }}>
                {undo.title} 이동 되돌리기
            </Button>}
        </div>
        <Kanban label="작업 상태 보드" columns={columns} onColumnsChange={(next, move) => { void commitMove(next, move); }}
            onCardOpen={card => navigate({item: card.id})}
            renderCardTitle={card => {
                const task = taskById.get(card.id);
                return task ? <TaskTitleEdit task={task} disabled={busy} dragSurface
                    onOpen={() => navigate({item: task.id})} onSaved={onChanged} /> : card.title;
            }}
            renderCardSelection={card => <Checkbox className="task-board-select" aria-label={`${card.title} 일괄 선택`}
                checked={selectedIds.has(card.id)} disabled={busy} onClick={event => onSelect(card.id, event.shiftKey)} />}
            onScroll={event => rememberScrolledColumn(event.currentTarget)}
            canReorder={sortMode === "manual"}
            canMoveCard={card => !busy && can(taskById.get(card.id)?.project_id ?? "", "task.update")}
            canMove={move => {
                if (busy || !can(taskById.get(move.cardId)?.project_id ?? "", "task.update")) return false;
                if (sortMode === "auto" && move.fromColumnId === move.toColumnId) {
                    onError("자동 정렬 중에는 열 안 순서를 바꿀 수 없습니다. 보드 정렬을 수동으로 바꿔 주세요.");
                    return false;
                }
                return true;
            }}
            className={busy ? "task-kanban task-board-busy" : "task-kanban"}
            renderColumnFooter={column => projectId && can(projectId, "task.create") ? <div className="task-board-create">
                {quickState === column.id ? <form onSubmit={event => { void quickCreate(event, column.id as TaskState); }}>
                    <Input autoFocus aria-label={`${column.title} 새 작업 제목`} maxLength={300} value={quickTitle}
                        onChange={event => setQuickTitle(event.target.value)} placeholder="새 작업 제목" />
                    {column.id === "cancelled" && <Input aria-label="취소 사유" value={quickReason}
                        onChange={event => setQuickReason(event.target.value)} placeholder="취소 사유" />}
                    <div><Button type="submit" disabled={busy || !quickTitle.trim() || column.id === "cancelled" && !quickReason.trim()}
                        onClick={event => { event.preventDefault(); void quickCreate(event, column.id as TaskState); }}>추가</Button>
                        <Button type="button" variant="ghost" onClick={() => { setQuickState(null); setQuickTitle(""); setQuickReason(""); recovery.clear(); }}>취소</Button></div>
                </form> : <Button variant="ghost" disabled={busy} onClick={() => { setQuickState(column.id as TaskState); setQuickTitle(""); }}>
                    + {column.title} 작업
                </Button>}
            </div> : null}
            renderCard={card => <TaskStoryChips taskId={card.id} collapsible />} />
    </div>;
}
