import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import { formatDateOnly } from "./date-time";
import { useDateTimeSettings } from "./date-time-settings";
import { useProjectPermissions } from "./ProjectPermissions";
import type { Item, Link } from "./models";
import { scheduleApi } from "./schedule-api";
import type { Schedule, ScheduleDiff, ScheduleKind, ScheduleSnapshot } from "./schedule-models";
import "./schedules.css";

const names: Record<ScheduleKind, string> = {epic: "Epic", phase: "Phase", milestone: "Milestone", iteration: "Iteration"};
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "저장하지 못했습니다.";

function usePlanDate() {
    const settings = useDateTimeSettings();
    return (value: string | null) => formatDateOnly(value ?? "", settings.dateFormat, settings.timeZone);
}

function ScheduleEditor({row, pending, save, cancel}: {row: Schedule; pending: boolean; save: (body: unknown) => void; cancel: () => void}) {
    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        save({title: data.get("title"), expected_revision: row.revision,
            start_date: data.get("start_date") || null, end_date: data.get("end_date") || null,
            due_date: data.get("due_date") || null, confirmed_date: data.get("confirmed_date") || null,
            evidence: data.get("evidence") || "", reason: data.get("reason") || ""});
    };
    return <form className="schedule-inline-editor" onSubmit={submit}>
        <label>제목<input name="title" defaultValue={row.title} required maxLength={300} /></label>
        <div className="schedule-date-fields">
            <label>시작 예정일<input name="start_date" type="date" defaultValue={row.start_date ?? ""} /></label>
            <label>종료 예정일<input name="end_date" type="date" defaultValue={row.end_date ?? ""} /></label>
            <label>마감·목표일<input name="due_date" type="date" defaultValue={row.due_date ?? ""} /></label>
            <label>실제 확인일<input name="confirmed_date" type="date" defaultValue={row.confirmed_date ?? ""} /></label>
        </div>
        <label>확인 근거<input name="evidence" defaultValue={row.evidence} maxLength={10000} /></label>
        <label>변경 사유<input name="reason" maxLength={10000} /></label>
        <div className="schedule-actions"><button disabled={pending}>저장</button><button type="button" onClick={cancel} disabled={pending}>취소</button></div>
    </form>;
}

function MembershipEditor({row, items, pending, save, cancel}: {row: Schedule; items: Item[]; pending: boolean; save: (ids: string[]) => void; cancel: () => void}) {
    const [selected, setSelected] = useState(row.member_ids);
    return <form className="schedule-inline-editor" onSubmit={event => {event.preventDefault(); save(selected);}}>
        <fieldset><legend>{row.title}에 연결할 Story·Task</legend>
            {items.length === 0 && <p>연결할 Story·Task가 없습니다.</p>}
            {items.map(item => <label className="schedule-member-option" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={event => setSelected(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))} />{item.kind === "task" ? "Task" : "Story"} · {item.title}</label>)}
        </fieldset>
        <div className="schedule-actions"><button disabled={pending}>연결 저장</button><button type="button" onClick={cancel} disabled={pending}>취소</button></div>
    </form>;
}

function AssignmentEditor({projectId, task, iterations, pending, editable, save}: {projectId: string; task: Item; iterations: Schedule[]; pending: boolean; editable: boolean; save: (taskId: string, revision: number, iterationId: string | null, reason: string) => Promise<void>}) {
    const [state, setState] = useState<{revision: number; iteration_id: string | null} | null>(null);
    const [target, setTarget] = useState("");
    const [reason, setReason] = useState("");
    const [history, setHistory] = useState<Awaited<ReturnType<typeof scheduleApi.assignmentHistory>> | null>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        const controller = new AbortController();
        scheduleApi.assignment(projectId, task.id, controller.signal).then(value => {setState(value); setTarget(value.iteration_id ?? "");}).catch(error => {if (!controller.signal.aborted) setError(errorMessage(error));});
        return () => controller.abort();
    }, [projectId, task.id]);
    const submit = async (event: FormEvent) => {
        event.preventDefault(); if (!state) return;
        try {
            await save(task.id, state.revision, target || null, reason);
            const current = await scheduleApi.assignment(projectId, task.id); setState(current);
            setHistory(await scheduleApi.assignmentHistory(projectId, task.id)); setReason("");
        } catch (error) {setError(errorMessage(error));}
    };
    const iterationName = (id: string | null) => id ? iterations.find(row => row.id === id)?.title ?? "삭제된 일정" : "미배정";
    return <div className="schedule-assignment">
        <form onSubmit={submit}>
            <span>{task.title}</span>
            <label><span className="sr-only">{task.title} Iteration</span><select value={target} disabled={!editable || !state || pending} onChange={event => setTarget(event.target.value)}><option value="">미배정</option>{iterations.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>
            {editable && <><label><span className="sr-only">{task.title} 재배정 사유</span><input placeholder="재배정 사유 (선택)" value={reason} onChange={event => setReason(event.target.value)} maxLength={10000} /></label>
            <button disabled={!state || pending || target === (state.iteration_id ?? "")}>배정 저장</button></>}
            <button type="button" onClick={() => {void scheduleApi.assignmentHistory(projectId, task.id).then(setHistory).catch(error => setError(errorMessage(error)));}}>배정 이력</button>
        </form>
        {error && <p role="alert">{error}</p>}
        {history && <ul aria-label={`${task.title} 배정 이력`}>{history.length === 0 && <li>배정 이력이 없습니다.</li>}{history.map(change => <li key={change.id}>{iterationName(change.previous_iteration_id)} → {iterationName(change.iteration_id)} · {change.reason || "사유 없음"}</li>)}</ul>}
    </div>;
}

function PlanValue({value}: {value: NonNullable<ScheduleDiff["changes"][number]["before"]> | null}) {
    const dateLabel = usePlanDate();
    if (!value) return <span>없음</span>;
    return <span>{value.title} · revision {value.revision}{"start_date" in value
        ? ` · 시작 ${dateLabel(value.start_date)} · 종료 ${dateLabel(value.end_date)} · 목표 ${dateLabel(value.due_date)} · 확인 ${dateLabel(value.confirmed_date)}`
        : ` · 시작 예정 ${dateLabel(value.planned_date)} · 마감 ${dateLabel(value.due_date)}`}</span>;
}

export function SchedulesPage({projectId}: {projectId: string}) {
    return <ProjectSchedules key={projectId} projectId={projectId} />;
}

function ProjectSchedules({projectId}: {projectId: string}) {
    const dateLabel = usePlanDate();
    const can = useProjectPermissions();
    const editable = can(projectId, "project.update");
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [items, setItems] = useState<Item[]>([]);
    const [links, setLinks] = useState<Link[]>([]);
    const [snapshots, setSnapshots] = useState<ScheduleSnapshot[]>([]);
    const [editing, setEditing] = useState<string | null>(null);
    const [members, setMembers] = useState<string | null>(null);
    const [diff, setDiff] = useState<ScheduleDiff | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const load = async (signal?: AbortSignal) => {
        const [rows, projectItems, projectLinks, baselines] = await Promise.all([scheduleApi.list(projectId, signal), api.items(projectId, signal), api.links(projectId, signal), scheduleApi.snapshots(projectId, signal)]);
        if (signal?.aborted) return;
        setSchedules(rows); setItems(projectItems.filter(item => item.kind === "task" || item.kind === "requirement")); setLinks(projectLinks); setSnapshots(baselines);
    };
    useEffect(() => {
        const controller = new AbortController(); setLoading(true); setLoadFailed(false); setSchedules([]); setItems([]); setDiff(null); setError("");
        load(controller.signal).catch(error => {if (!controller.signal.aborted) {setError(errorMessage(error)); setLoadFailed(true);}}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
        return () => controller.abort();
    }, [projectId]); // The project owns both the current plan and its comparison scope.
    const change = async (operation: () => Promise<unknown>) => {
        setPending(true); setError("");
        try {await operation(); await load(); setEditing(null); setMembers(null); if (diff) setDiff(await scheduleApi.diff(projectId, diff.snapshot.id));}
        catch (error) {setError(errorMessage(error)); throw error;}
        finally {setPending(false);}
    };
    const run = (operation: () => Promise<unknown>) => {void change(operation).catch(() => undefined);};
    const tasks = items.filter(item => item.kind === "task");
    const iterations = schedules.filter(row => row.kind === "iteration");
    const create = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
        run(async () => {await scheduleApi.create(projectId, {title: data.get("title"), kind: data.get("kind")}); form.reset();});
    };
    if (loading) return <p role="status">상위 일정을 불러오는 중…</p>;
    if (loadFailed) return <section aria-label="상위 일정 불러오기 실패"><p role="alert">{error}</p><button onClick={() => {setLoading(true); void load().then(() => {setLoadFailed(false); setError("");}).catch(error => setError(errorMessage(error))).finally(() => setLoading(false));}}>다시 불러오기</button></section>;
    return <section className="schedules-page" aria-label="선택적 상위 일정">
        <header><h2>상위 일정</h2><p className="muted">선택적으로 목표·일정을 묶습니다. Task·Story의 필수 부모나 완료 조건이 아닙니다.</p></header>
        {error && <p role="alert">{error}</p>}
        {editable && <form className="schedule-create" onSubmit={create}><label>유형<select name="kind" defaultValue="epic">{Object.entries(names).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>제목<input name="title" required maxLength={300} placeholder="일정 또는 목표 이름" /></label><button disabled={pending}>추가</button></form>}
        <p className="muted small">현재 접근 가능한 범위 · Story {items.filter(item => item.kind === "requirement").length}개 · Task {tasks.length}개 (중복 제외)</p>
        {schedules.length === 0 && <p>등록한 상위 일정이 없습니다. Story·Task는 일정 없이도 사용할 수 있습니다.</p>}
        <div className="schedule-list">{schedules.map(row => {
            const taskIds = new Set(row.member_ids.filter(id => tasks.some(task => task.id === id)));
            const storyIds = new Set(row.member_ids.filter(id => items.some(item => item.id === id && item.kind === "requirement")));
            if (row.kind === "iteration") links.filter(link => link.relation === "implements" && taskIds.has(link.source_id) && items.some(item => item.id === link.target_id && item.kind === "requirement")).forEach(link => storyIds.add(link.target_id));
            return <article className="schedule-row" key={row.id}>
                <div className="schedule-row-heading"><span className="muted">{names[row.kind]}</span><strong>{row.title}</strong><span className="muted small">Story {storyIds.size} · Task {taskIds.size}</span>{editable && <div className="schedule-actions"><button onClick={() => {setEditing(row.id); setMembers(null);}}>일정 편집</button>{row.kind !== "iteration" && <button onClick={() => {setMembers(row.id); setEditing(null);}}>연결 편집</button>}<button disabled={pending} onClick={() => run(() => scheduleApi.remove(projectId, row.id, row.revision))}>일정 삭제</button></div>}</div>
                <p className="schedule-dates">시작 예정 {dateLabel(row.start_date)} · 종료 예정 {dateLabel(row.end_date)} · 마감·목표 {dateLabel(row.due_date)}{row.confirmed_date && <> · 실제 확인 {dateLabel(row.confirmed_date)} · {row.evidence}</>}</p>
                {row.kind === "iteration" && storyIds.size > 0 && <p className="muted small">관련 Task가 기여하는 Story: {items.filter(item => storyIds.has(item.id)).map(item => item.title).join(", ")}</p>}
                {editing === row.id && <ScheduleEditor row={row} pending={pending} cancel={() => setEditing(null)} save={body => run(() => scheduleApi.update(projectId, row.id, body))} />}
                {members === row.id && <MembershipEditor row={row} items={items} pending={pending} cancel={() => setMembers(null)} save={ids => run(() => scheduleApi.members(projectId, row.id, row.revision, ids))} />}
            </article>;
        })}</div>
        <section className="schedule-section"><h3>Task의 현재 Iteration</h3><p className="muted small">현재 배정은 Task당 하나입니다. 미완료 Task는 자동 이월되지 않으며 재배정해도 Task의 시작 예정일·마감일은 바뀌지 않습니다.</p>
            {tasks.map(task => <AssignmentEditor key={task.id} projectId={projectId} task={task} iterations={iterations} pending={pending} editable={editable && can(projectId, "task.update")} save={(tid, revision, iid, reason) => change(() => scheduleApi.assign(projectId, tid, revision, iid, reason))} />)}
        </section>
        <section className="schedule-section"><h3>일정 기준선</h3><p className="muted small">저장 시점의 일정 날짜·Task 날짜·항목 revision을 고정해 현재 계획과 비교합니다. 추적·변경의 Item revision 기준선과 별개입니다.</p>
            {can(projectId, "baseline.write") && <form className="schedule-create" onSubmit={event => {event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); run(async () => {await scheduleApi.snapshot(projectId, String(data.get("title")), String(data.get("reason"))); form.reset();});}}><label>기준선 이름<input name="title" required maxLength={300} /></label><label>선택·변경 사유<input name="reason" required maxLength={10000} /></label><button disabled={pending}>일정 기준선 저장</button></form>}
            {snapshots.length === 0 && <p>저장한 일정 기준선이 없습니다.</p>}
            <ul className="schedule-snapshots">{snapshots.map(snapshot => <li key={snapshot.id}><span>{snapshot.title} · {snapshot.reason}</span><button disabled={pending} onClick={() => {setError(""); void scheduleApi.diff(projectId, snapshot.id).then(setDiff).catch(error => setError(errorMessage(error)));}}>현재 계획과 비교</button></li>)}</ul>
            {diff && <section aria-label={`${diff.snapshot.title} 비교`}><h4>{diff.snapshot.title} → 현재 계획</h4><p className="muted small">{diff.scope}</p>{diff.changes.length === 0 ? <p>변경이 없습니다.</p> : <ul className="schedule-diff">{diff.changes.map(change => <li key={`${change.entity}-${change.id}`}><strong>{({new: "신규", changed: "변경", removed: "제거"})[change.change]}{change.recheck_required ? " · 재확인 필요" : ""}</strong><div>기준선: <PlanValue value={change.before} /></div><div>현재: <PlanValue value={change.after} /></div>{!!change.recheck_item_ids?.length && <div>재확인 대상: {items.filter(item => change.recheck_item_ids?.includes(item.id)).map(item => item.title).join(", ")}</div>}</li>)}</ul>}</section>}
        </section>
    </section>;
}

export default SchedulesPage;
