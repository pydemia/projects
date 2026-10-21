import { useMemo, useState } from "react";
import { api, errorMessage } from "./api";
import { navigate } from "./hooks";
import type { Route } from "./hooks";
import { NewItem, RecordEditor } from "./ItemsPage";
import { dataSchemas, statusLabels } from "./models";
import type { Catalog, Item } from "./models";
import { Input } from "./pydemia-ui/input";
import { ActionButton, Badge, Empty, ErrorNotice, ExternalLink, Field, PageHead, RouteLink } from "./ui";

type Task = Extract<Item, { kind: "task" }>;
type Lens = "gtd" | "abc";
const states = ["todo", "in_progress", "in_review", "done", "cancelled"] as const;
const simpleViews = ["today", "inbox", "upcoming"] as const;
const complexViews = ["list", "board", "calendar", "insights"] as const;

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

export function TaskWorkspace({ projectId, userId, route, items, catalog, onChanged }: {
    projectId: string; userId: string; route: Route; items: Item[];
    catalog?: Catalog; onChanged: () => void;
}) {
    const tasks = useMemo(() => items.filter((item): item is Task => item.kind === "task"), [items]);
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
    const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [newDetailed, setNewDetailed] = useState(false);
    const [busyId, setBusyId] = useState("");
    const [error, setError] = useState("");
    const today = localDay();
    const selected = tasks.find(task => task.id === route.item);
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
        return sorted(filtered, lens, minutes, context, energy);
    }, [tasks, mode, view, status, query, lens, minutes, context, energy, today]);
    async function quickAdd(event: React.FormEvent) {
        event.preventDefault();
        if (!quickTitle.trim()) return;
        setBusyId("new"); setError("");
        try {
            await api.createItem(projectId, {
                kind: "task", title: quickTitle.trim(), body: "",
                data: dataSchemas.task.parse({ workflow: "personal", requires_test: false,
                    planned_date: quickDate, list_name: "Inbox" }),
            });
            setQuickTitle(""); onChanged();
        } catch (cause) { setError(errorMessage(cause)); }
        finally { setBusyId(""); }
    }
    async function toggle(task: Task) {
        if (task.data.workflow !== "personal") {
            navigate({ taskMode: "complex", taskView: "list", item: task.id });
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
    function changeMode(next: "simple" | "complex") {
        navigate({ taskMode: next, taskView: next === "simple" ? "today" : "list" });
    }
    const list = (rows: Task[]) => <div className="task-list">
        {rows.map(task => <div className="task-row" key={task.id}>
            <ActionButton className="task-check" aria-label={`${task.title} ${task.data.state === "done" ? "다시 열기" : "완료"}`}
                disabled={busyId === task.id} onClick={() => { void toggle(task); }}>
                {task.data.state === "done" ? "↩" : task.data.workflow === "personal" ? "✓" : "→"}
            </ActionButton>
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
            <span className="task-workflow">{task.data.workflow === "personal" ? "개인" : "구현"}</span>
        </div>)}
        {!rows.length && <Empty title="이 보기에 해당하는 작업이 없습니다."><p>다른 보기나 필터를 선택하거나 새 할 일을 추가해 보세요.</p></Empty>}
    </div>;
    return <section className="task-workspace">
        <PageHead title="작업" eyebrow="TASK WORKSPACE"
            description="하나의 작업 목록을 오늘의 할 일과 정교한 프로젝트 관리 보기로 전환합니다.">
            <ActionButton onClick={() => setNewDetailed(true)}>+ 상세 작업</ActionButton>
        </PageHead>
        <div className="task-mode-bar" role="group" aria-label="작업 화면 밀도">
            <ActionButton aria-pressed={mode === "simple"} className={mode === "simple" ? "selected" : ""} onClick={() => changeMode("simple")}>간편 · To-do</ActionButton>
            <ActionButton aria-pressed={mode === "complex"} className={mode === "complex" ? "selected" : ""} onClick={() => changeMode("complex")}>정교 · 프로젝트</ActionButton>
            <span className="muted small">같은 작업 데이터 · 보기만 변경</span>
        </div>
        <form className="task-quick-add" onSubmit={event => { void quickAdd(event); }}>
            <Field label="빠른 할 일"><Input value={quickTitle} maxLength={300} onChange={event => setQuickTitle(event.target.value)} placeholder="지금 할 일을 한 줄로 적으세요" /></Field>
            <Field label="실행 예정일"><Input type="date" value={quickDate} onChange={event => setQuickDate(event.target.value)} /></Field>
            <ActionButton className="primary" type="submit" disabled={busyId === "new" || !quickTitle.trim()}>{busyId === "new" ? "추가 중…" : "+ 추가"}</ActionButton>
        </form>
        {error && <ErrorNotice error={error} />}
        <nav className="task-view-bar" aria-label="작업 보기">
            {(mode === "simple" ? simpleViews : complexViews).map(candidate => <RouteLink key={candidate}
                patch={{ taskView: candidate, item: "" }} current={view === candidate}>
                {{ today: "오늘", inbox: "Inbox", upcoming: "예정", list: "목록", board: "보드", calendar: "캘린더", insights: "집계" }[candidate]}
            </RouteLink>)}
        </nav>
        <div className="task-tools">
            <Field label="작업 검색"><Input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="제목·목록·맥락·목표" /></Field>
            {mode === "complex" && <Field label="상태"><select value={status} onChange={event => setStatus(event.target.value)}>
                <option value="all">전체</option><option value="open">진행 중 전체</option>
                {states.map(state => <option key={state} value={state}>{statusLabels[state]}</option>)}
            </select></Field>}
            <Field label="우선순위 기준"><select value={lens} onChange={event => setLens(event.target.value as Lens)}>
                <option value="gtd">GTD · 지금 가능한 행동</option><option value="abc">ABC · 목표와 가치</option>
            </select></Field>
            {lens === "gtd" && <><Field label="가용 시간"><select value={minutes} onChange={event => setMinutes(Number(event.target.value))}>
                <option value={0}>제한 없음</option><option value={15}>15분</option><option value={30}>30분</option><option value={60}>60분</option><option value={120}>120분</option>
            </select></Field>
                {mode === "complex" && <><Field label="현재 맥락"><Input value={context} onChange={event => setContext(event.target.value)} placeholder="예: desk" /></Field>
                    <Field label="현재 에너지"><select value={energy} onChange={event => setEnergy(event.target.value)}>
                        <option value="any">제한 없음</option><option value="low">낮음</option><option value="medium">보통</option><option value="high">높음</option>
                    </select></Field></>}</>}
        </div>
        <p className="task-result-count">{visible.length}개 작업 · {view === "insights" ? "현재 필터의 상태 분포" : lens === "gtd" ? "다음 행동·맥락·시간·에너지 순" : "A/B/C 가치·그룹 내 순서"} · 미산정 항목은 목록에 남깁니다.</p>
        {view === "board" && <div className="task-board">{states.map(state => <section className="task-board-column" key={state}>
            <h2>{statusLabels[state]} <small>{visible.filter(task => task.data.state === state).length}</small></h2>
            {visible.filter(task => task.data.state === state).map(task => <article className="task-board-card" key={task.id}>
                <RouteLink patch={{ item: task.id }}>{task.title}</RouteLink><p>{task.data.list_name} · {task.data.due_date || "마감 없음"}</p>
                <span>{task.data.abc_priority === "none" ? "ABC 미지정" : `ABC ${task.data.abc_priority}${task.data.abc_order || ""}`}</span>
            </article>)}</section>)}</div>}
        {view === "calendar" && <TaskCalendar tasks={visible} month={month} onMonth={setMonth} />}
        {view === "insights" && <TaskInsights tasks={visible} />}
        {(view === "today" || view === "inbox" || view === "upcoming" || view === "list") && list(visible)}
        {selected && <div className="task-selected"><div className="section-head"><h2>선택한 작업</h2>
            <ActionButton className="small" onClick={() => navigate({ item: "" })}>닫기</ActionButton></div>
            {mode === "complex" ? <RecordEditor key={selected.id} item={selected} items={items} catalog={catalog} userId={userId} onChanged={onChanged} />
                : <div><p><strong>{selected.title}</strong> · {statusLabels[selected.data.state]}</p><p>{selected.body || "추가 설명 없음"}</p>
                    <ActionButton onClick={() => navigate({ taskMode: "complex", taskView: "list" })}>정교 보기에서 상세 편집</ActionButton></div>}</div>}
        {newDetailed && <NewItem kind="task" projectId={projectId} userId={userId} items={items} catalog={catalog}
            onClose={() => setNewDetailed(false)} onCreated={item => { setNewDetailed(false); onChanged(); navigate({ taskMode: "complex", taskView: "list", item: item.id }); }} />}
    </section>;
}

function TaskCalendar({ tasks, month, onMonth }: { tasks: Task[]; month: Date; onMonth: (date: Date) => void }) {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const first = new Date(start);
    first.setDate(1 - start.getDay());
    const days = Array.from({ length: 42 }, (_, index) => {
        const date = new Date(first);
        date.setDate(first.getDate() + index);
        return date;
    });
    return <div className="task-calendar"><div className="task-calendar-head">
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
        <div className="task-chart">{groups.map(group => <div className="task-chart-row" key={group.label}>
            <span>{group.label}</span><div role="img" aria-label={`${group.label} ${group.count}건`}><i style={{ width: `${total ? 100 * group.count / total : 0}%` }} /></div><strong>{group.count}</strong>
        </div>)}</div>
    </section>;
}
