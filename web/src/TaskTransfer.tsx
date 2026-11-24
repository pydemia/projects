import { useEffect, useRef, useState } from "react";
import { useReauthenticationCheckpoint } from "./reauthentication";
import { canProject, useProjectCatalog, useProjectPermissions } from "./ProjectPermissions";
import { api, ApiError, errorMessage } from "./api";
import { useResource } from "./hooks";
import type { Item } from "./models";
import { Input } from "./pydemia-ui/input";
import { NativeSelect } from "./pydemia-ui/native-select";
import { ActionButton, ErrorNotice, Field, Modal } from "./ui";

export function TaskTransfer({ tasks, hiddenCount, onClose, onChanged }: {
    tasks: Item[]; hiddenCount: number; onClose: () => void;
    onChanged: (result: Awaited<ReturnType<typeof api.transferTasks>>) => void;
}) {
    const can = useProjectPermissions();
    const accessKey = useProjectCatalog().map(project => `${project.id}:${project.access?.access_revision}`).sort().join(";");
    const sourceAllowed = tasks.length > 0 && tasks.every(task => can(task.project_id, "task.move"));
    const projects = useResource("transfer-projects", signal => api.projects(signal));
    const [target, setTarget] = useState("");
    const [list, setList] = useState("");
    const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.previewTransfer>> | null>(null);
    const [result, setResult] = useState<Awaited<ReturnType<typeof api.transferTasks>> | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    useReauthenticationCheckpoint(() => !!result || !(target || list || preview || uncertain));
    useEffect(() => {
        if (target && !can(target, "project.read")) {setPreview(null); setTarget("");}
    }, [accessKey, target]);
    const operation = useRef(crypto.randomUUID());
    const undoOperation = useRef(crypto.randomUUID());
    const body = {tasks: tasks.map(task => ({id: task.id, expected_revision: task.revision})), target_project_id: target, ...(list.trim() ? {target_list_name: list.trim()} : {})};
    async function inspect() {
        if (!sourceAllowed || projects.status !== "ready" || !projects.data.some(project => project.id === target && canProject(project, "task.create") && canProject(project, "task.move"))) return;
        setBusy(true); setError("");
        try { setPreview(await api.previewTransfer(body)); }
        catch (cause) { setError(errorMessage(cause)); }
        finally { setBusy(false); }
    }
    async function commit() {
        if (!preview || !sourceAllowed || !can(target, "task.create") || !can(target, "task.move")) return;
        setBusy(true); setError("");
        try {
            const committed = await api.transferTasks({...body, preview_token: preview.preview_token, operation_id: operation.current});
            setResult(committed); setUncertain(false); onChanged(committed);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
                setUncertain(false); setPreview(null); operation.current = crypto.randomUUID();
            } else setUncertain(true);
            setError(errorMessage(cause));
        }
        finally { setBusy(false); }
    }
    async function recover() {
        setBusy(true); setError("");
        try { const committed = await api.transferOperation(operation.current); setResult(committed); setUncertain(false); onChanged(committed); }
        catch (cause) { setError(errorMessage(cause)); }
        finally { setBusy(false); }
    }
    async function undo() {
        if (!result || !can(target, "task.move") || tasks.some(task => !can(task.project_id, "task.move") || !can(task.project_id, "task.create"))) return;
        setBusy(true); setError("");
        try { const undone = await api.undoTransfer(result.transfer_id, undoOperation.current); onChanged(undone); onClose(); }
        catch (cause) { setError(errorMessage(cause)); }
        finally { setBusy(false); }
    }
    return <Modal title="프로젝트 이동" className="mobile-task-dialog" onClose={busy ? () => {} : onClose}>
        <p>{tasks.length}개 선택 · 한 번에 최대 100개{hiddenCount ? ` · 현재 조건 밖 선택 ${hiddenCount}개 포함` : ""}</p>
        <ul>{tasks.map(task => <li key={task.id}>{task.title} · {task.project_name ?? task.project_id}</li>)}</ul>
        {!result && <><Field label="대상 프로젝트"><NativeSelect value={target} disabled={busy || uncertain} onChange={event => {setTarget(event.target.value); setPreview(null); operation.current = crypto.randomUUID();}}>
            <option value="">프로젝트 선택</option>{projects.status === "ready" && projects.data.filter(project => canProject(project, "task.create") && canProject(project, "task.move") && can(project.id, "task.create") && can(project.id, "task.move")).map(project => <option key={project.id} value={project.id} disabled={tasks.length > 0 && tasks.every(task => task.project_id === project.id)}>{project.name}</option>)}
        </NativeSelect></Field>
        <Field label="대상 목록 · 비우면 기존 목록 유지"><Input value={list} maxLength={80} disabled={busy || uncertain} onChange={event => {setList(event.target.value); setPreview(null); operation.current = crypto.randomUUID();}} /></Field>
        {projects.status === "error" && <ErrorNotice error={projects.error} retry={projects.reload} />}
        {!uncertain && <ActionButton disabled={busy || !sourceAllowed || !target || tasks.length === 0 || tasks.length > 100} onClick={() => void inspect()}>이동 영향 미리보기</ActionButton>}
        {preview && <div role="status"><p>작업 {preview.impact.tasks}개 · 관계 {preview.impact.links}개 · 기준선 {preview.impact.baselines}개 · SkillRun {preview.impact.skill_runs}개</p>
            <p className="hint">이동하면 기존 프로젝트의 상위 일정 연결과 Iteration 배정은 해제됩니다. 작업 날짜와 과거 이력은 유지되며, 이동·되돌림 후 일정은 직접 다시 연결할 수 있습니다.</p>
            <p>{[...new Set(tasks.map(task => task.project_name ?? task.project_id))].join(", ")} → {projects.status === "ready" ? projects.data.find(project => project.id === target)?.name : target}</p><p>같은 ID·본문·상태·날짜·근거를 유지하며 대상 프로젝트로 이동합니다.</p>
            {preview.audience_changes.filter(change => change.audience_changed).map(change => <p className="notice" key={change.id} role="alert">{tasks.find(task => task.id === change.id)?.title ?? "작업"}: 이동하면 이 작업을 읽을 수 있는 사용자가 바뀝니다. 새로 읽는 사용자 {change.new_reader_count}명 · 접근이 사라지는 사용자 {change.removed_reader_count}명</p>)}
            {preview.blockers.map(blocker => <p key={`${blocker.id}:${blocker.reason}`} role="alert">{tasks.find(task => task.id === blocker.id)?.title ?? blocker.id}: {{not_task: "작업이 아닙니다", revision_conflict: "내용이 변경되었습니다. 새로고침 후 다시 확인하세요", same_project: "이미 대상 프로젝트에 있습니다", active_run: "실행 중인 SkillRun이 있습니다", missing_external_reference: "연결된 외부 근거가 복원되지 않았습니다", task_hierarchy: "부모 작업과 하위 작업을 함께 선택해 이동하세요"}[blocker.reason] ?? blocker.reason}</p>)}
            {!uncertain && <ActionButton className="primary" disabled={busy || !sourceAllowed || !can(target, "task.create") || !can(target, "task.move") || preview.blockers.length > 0} onClick={() => void commit()}>전체 이동 확정</ActionButton>}
        </div>}
        {uncertain && <div role="status"><p>성공 여부를 확인하지 못했습니다. 같은 요청의 결과를 조회해 주세요.</p><ActionButton disabled={busy} onClick={() => void recover()}>이동 결과 확인</ActionButton></div>}</>}
        {result && <div role="status"><p>{result.tasks.length}개 작업 이동 완료</p><ActionButton disabled={busy || !can(target, "task.move") || tasks.some(task => !can(task.project_id, "task.move") || !can(task.project_id, "task.create"))} onClick={() => void undo()}>조건 확인 후 되돌리기</ActionButton></div>}
        {error && <ErrorNotice error={error} />}
        <ActionButton disabled={busy} onClick={onClose}>닫기</ActionButton>
    </Modal>;
}
