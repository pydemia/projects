import { useState, type FormEvent } from "react";
import { z } from "zod";
import { useAuthenticationDraft, type AuthenticationDraft } from "./auth-drafts";
import { useProjectPermissions } from "./ProjectPermissions";
import { ApiError, api, errorMessage } from "./api";
import type { Item, TaskFieldDefinition } from "./models";
import { TaskFieldCells } from "./TaskFields";
import { Button } from "./pydemia-ui/button";
import { Field } from "./pydemia-ui/field";
import { NativeSelect } from "./pydemia-ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "./pydemia-ui/popover";
import { Textarea } from "./pydemia-ui/textarea";
import "./task-quick-properties.css";

type Task = Extract<Item, { kind: "task" }>;
type Props = {
    task: Task;
    definitions: readonly TaskFieldDefinition[];
    onSaved: (item: Item) => void;
    onError?: (message: string) => void;
    disabled?: boolean;
};
const stateLabels: Record<Task["data"]["state"], string> = {
    todo: "할 일", in_progress: "진행 중", in_review: "검토 중", done: "완료", cancelled: "취소",
};
const workflowLabels: Record<Task["data"]["workflow"], string> = { personal: "개인 할 일", delivery: "구현 작업" };
const commonFields = ["list_name", "planned_date", "due_date", "estimated_minutes", "abc_priority", "context", "energy", "next_action", "goal"];
const advancedFields = ["abc_order", "github_issue_url", "acceptance_criteria", "result_url", "target_sha", "requires_test"];
const transitionDraftSchema = z.object({draft: z.string(), reason: z.string(), revision: z.number().int().positive()}).strict();

function TaskTransition({ task, onSaved, onError, disabled = false, property, compact = false }: Omit<Props, "definitions"> & { property: "state" | "workflow"; compact?: boolean }) {
    const recovery: AuthenticationDraft<z.infer<typeof transitionDraftSchema>> = useAuthenticationDraft(`task:${task.project_id}:${task.id}:${property}:${compact ? "list" : "detail"}`, transitionDraftSchema,
        () => open ? {draft, reason, revision} : null);
    const [open, setOpen] = useState(!!recovery.restored);
    const [draft, setDraft] = useState<string>(recovery.restored?.draft ?? task.data[property]);
    const [reason, setReason] = useState(recovery.restored?.reason ?? "");
    const [revision, setRevision] = useState(recovery.restored?.revision ?? task.revision);
    const [busy, setBusy] = useState(false);
    const [loadingLatest, setLoadingLatest] = useState(false);
    const [error, setError] = useState("");
    const [conflict, setConflict] = useState(false);
    const [latest, setLatest] = useState<Task | null>(null);
    const isType = property === "workflow";
    const can = useProjectPermissions();
    disabled = disabled || !can(task.project_id, "task.update");
    const label = isType ? "유형" : "상태";
    const labels: Record<string, string> = isType ? workflowLabels : stateLabels;

    function changeOpen(next: boolean) {
        if (busy || (disabled && next)) return;
        if (next) {
            setDraft(task.data[property]); setReason(task.data.cancellation_reason);
            setRevision(task.revision); setError(""); setConflict(false); setLatest(null);
        }
        if (!next) recovery.clear();
        setOpen(next);
    }

    function failed(cause: unknown) {
        const stale = cause instanceof ApiError && cause.status === 409;
        if (stale) { setConflict(true); setLatest(null); }
        const message = `${stale ? "저장하지 못했습니다. 입력 내용은 유지됩니다. " : ""}${errorMessage(cause)}`;
        setError(message); onError?.(message);
    }

    async function loadLatest() {
        if (busy || disabled) return;
        setBusy(true); setLoadingLatest(true); setError("");
        try {
            const current = await api.item(task.id);
            if (current.kind !== "task" || current.id !== task.id) throw new Error("불러온 항목이 해당 작업과 일치하지 않습니다.");
            setRevision(current.revision); setLatest(current); setConflict(false); onSaved(current);
        } catch (cause) { failed(cause); }
        finally { setBusy(false); setLoadingLatest(false); }
    }

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || disabled || conflict) return;
        if (!Object.hasOwn(labels, draft)) { setError("목록에 있는 항목을 선택해 주세요."); return; }
        if (!isType && draft === "cancelled" && !reason.trim()) { setError("취소 사유를 입력해 주세요."); return; }
        setBusy(true); setError("");
        try {
            const updated = isType
                ? await api.updateTaskType(task.id, { expected_revision: revision, workflow: draft === "delivery" ? "delivery" : "personal" })
                : await api.updateTaskProperties(task.id, {
                    expected_revision: revision,
                    values: draft === "cancelled" ? { state: draft, cancellation_reason: reason.trim() } : { state: draft },
                });
            setOpen(false); recovery.clear(); onSaved(updated);
        } catch (cause) { failed(cause); }
        finally { setBusy(false); }
    }

    return <Popover open={open} onOpenChange={changeOpen}>
        <PopoverTrigger asChild><Button variant="ghost" className={`task-quick-property${compact ? " task-inline-status" : ""}`} disabled={disabled} aria-label={`${task.title} ${compact ? "진행 상태" : label} 편집`}>
            {!compact && <span className="task-quick-label">{label}</span>}<span>{labels[task.data[property]]}</span>
        </Button></PopoverTrigger>
        <PopoverContent align="start" className="task-quick-editor" aria-label={`${label} 편집`} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
            <form onSubmit={event => void save(event)} noValidate>
                <Field label={label} error={error}>{props => <NativeSelect {...props} value={draft} disabled={busy || disabled} onChange={event => setDraft(event.target.value)} autoFocus>
                    {Object.entries(labels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </NativeSelect>}</Field>
                {isType && <p className="task-field-help">개인 할 일은 실행 상태를 중심으로 관리합니다. 구현 작업은 완료 시 수용 기준과 결과 URL을 확인하며, 전환하면 테스트 필수가 켜집니다. 테스트가 필수이면 대상 SHA와 통과한 테스트가 필요합니다. 완료한 작업도 완료 조건을 충족해야 전환할 수 있습니다.</p>}
                {!isType && draft === "cancelled" && <Field label="취소 사유" required>{props => <Textarea {...props} value={reason} disabled={busy || disabled} onChange={event => setReason(event.target.value)} />}</Field>}
                {!isType && draft === "done" && task.data.workflow === "delivery" && <p className="task-field-help">구현 작업의 완료 조건과 테스트 결과를 확인한 뒤 저장합니다.</p>}
                {conflict && <Button variant="outline" disabled={busy || disabled} onClick={() => void loadLatest()}>{loadingLatest ? "불러오는 중…" : "최신 작업 불러오기"}</Button>}
                {latest && <p role="status" className="task-field-help">최신 저장 값: {isType ? workflowLabels[latest.data.workflow] : stateLabels[latest.data.state]}. 입력 내용은 유지됩니다. 저장을 누르면 이 입력을 적용합니다.</p>}
                <div className="task-field-editor-actions"><Button variant="ghost" disabled={busy} onClick={() => {setOpen(false); recovery.clear();}}>닫기</Button><Button type="submit" disabled={busy || disabled || conflict}>{busy && !loadingLatest ? "저장 중…" : "저장"}</Button></div>
            </form>
        </PopoverContent>
    </Popover>;
}

export function TaskStateEdit(props: Omit<Props, "definitions">) {
    return <TaskTransition {...props} property="state" compact />;
}

export function TaskQuickProperties({ task, definitions, onSaved, onError, disabled = false }: Props) {
    const props = { task, onSaved, onError, disabled };
    return <section className="task-quick-properties" aria-label="작업 속성">
        <div className="task-quick-transitions"><TaskTransition {...props} property="state" /><TaskTransition {...props} property="workflow" /></div>
        <TaskFieldCells task={task} fields={commonFields} definitions={definitions} onChanged={onSaved} onError={onError} disabled={disabled} surface="detail" />
        <details className="task-quick-advanced"><summary>추가 속성</summary>
            <TaskFieldCells task={task} fields={[...(task.data.workflow === "delivery" ? advancedFields : ["abc_order", "github_issue_url"]), "cancellation_reason"]} definitions={definitions} onChanged={onSaved} onError={onError} disabled={disabled} surface="detail" />
        </details>
        {definitions.length > 0 && <div className="task-quick-custom"><h4>사용자 필드</h4><TaskFieldCells task={task} fields={definitions.map(field => `custom:${field.id}`)} definitions={definitions} onChanged={onSaved} onError={onError} disabled={disabled} surface="detail" /></div>}
    </section>;
}
