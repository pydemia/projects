import { useState } from "react";
import { defaultDateTimeSettings, formatDateOnly } from "./date-time";
import { useDateTimeSettings } from "./date-time-settings";
import { z } from "zod";
import { useAuthenticationDraft, type AuthenticationDraft } from "./auth-drafts";
import type { FormEvent } from "react";
import { useProjectPermissions } from "./ProjectPermissions";
import { ApiError, api, errorMessage } from "./api";
import type { Item, TaskFieldDefinition } from "./models";
import { Button } from "./pydemia-ui/button";
import { Checkbox } from "./pydemia-ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./pydemia-ui/dialog";
import { Field } from "./pydemia-ui/field";
import { Input } from "./pydemia-ui/input";
import { NativeSelect } from "./pydemia-ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "./pydemia-ui/popover";
import { Textarea } from "./pydemia-ui/textarea";
import "./task-fields.css";

type Task = Extract<Item, { kind: "task" }>;
type FieldValue = string | number | boolean | string[] | null;

export const taskFieldLabels: Record<string, string> = {
    list_name: "리스트", planned_date: "계획일", due_date: "마감일",
    estimated_minutes: "예상 시간", abc_priority: "우선순위",
    context: "맥락", goal: "목표", github_issue_url: "GitHub 이슈",
    energy: "에너지", next_action: "다음 행동", abc_order: "우선순위 내 순서",
    acceptance_criteria: "수용 기준", result_url: "결과 URL", target_sha: "대상 SHA",
    requires_test: "테스트 필수", cancellation_reason: "취소 사유",
};
export const defaultListFields = ["due_date", "abc_priority"];
const viewFieldKeys = ["list_name", "planned_date", "due_date", "estimated_minutes", "abc_priority", "context", "goal", "github_issue_url"];
const fieldLimitMessage = "한 보기에 최대 32개 필드를 표시할 수 있습니다. 먼저 다른 필드를 숨겨 주세요.";
const fieldTypeLabels: Record<TaskFieldDefinition["type"], string> = {
    text: "텍스트", number: "숫자", date: "날짜", select: "선택", checkbox: "체크박스",
};
const creationDraftSchema = z.object({name: z.string(), type: z.enum(["text", "number", "date", "select", "checkbox"]), options: z.string()}).strict();
const cellDraftSchema = z.object({draft: z.string(), checked: z.boolean(), expectedRevision: z.number().int().positive(),
    fieldType: z.string(), options: z.array(z.string())}).strict();

function definitionFor(key: string, definitions: readonly TaskFieldDefinition[], projectId?: string) {
    if (!key.startsWith("custom:")) return undefined;
    const id = key.slice(7);
    return (projectId ? definitions.find(field => field.id === id && field.project_id === projectId) : undefined)
        ?? definitions.find(field => field.id === id && !field.project_id);
}

export function taskFieldLabel(key: string, definitions: readonly TaskFieldDefinition[], projectId?: string): string {
    return (definitionFor(key, definitions, projectId) ?? (!projectId ? definitions.find(field => field.id === key.slice(7)) : undefined))?.name ?? taskFieldLabels[key] ?? "사용자 필드";
}

function fieldValue(task: Task, key: string): FieldValue {
    const value = key.startsWith("custom:")
        ? task.data.custom_fields?.[key.slice(7)] : task.data[key];
    if (Array.isArray(value) && value.every(entry => typeof entry === "string")) return value;
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? value : null;
}

export function formatTaskField(task: Task, key: string, definitions: readonly TaskFieldDefinition[], dateFormat = defaultDateTimeSettings.dateFormat, timeZone = defaultDateTimeSettings.timeZone): string {
    const value = fieldValue(task, key);
    if (value === null || value === "" || (key === "abc_priority" && value === "none")) return "—";
    if (typeof value === "boolean") return value ? "체크됨" : "체크 안 됨";
    if (Array.isArray(value)) return value.join(" · ") || "—";
    if (key === "energy") return ({ any: "상관없음", low: "낮음", medium: "보통", high: "높음" } as Record<string, string>)[String(value)] ?? String(value);
    if (key === "estimated_minutes") return `${value}분`;
    if (definitionFor(key, definitions, task.project_id)?.type === "date" || key === "planned_date" || key === "due_date") return formatDateOnly(String(value), dateFormat, timeZone);
    return String(value);
}

export function TaskFieldManager({ definitions, selectedFields, onChange, onCreated, label = "필드 관리", onOpen, loading = false, error: loadError = "", onRetry, recoveryScope = "personal", projectId = "" }: {
    projectId?: string;
    definitions: readonly TaskFieldDefinition[];
    selectedFields: readonly string[];
    onChange: (fields: string[]) => void;
    onCreated: (definition: TaskFieldDefinition) => void;
    label?: string;
    onOpen?: () => void;
    loading?: boolean;
    error?: string;
    onRetry?: () => void;
    recoveryScope?: string;
}) {
    const can = useProjectPermissions();
    const canManage = !!projectId && can(projectId, "field.manage");
    const recovery: AuthenticationDraft<z.infer<typeof creationDraftSchema>> = useAuthenticationDraft(`field-manager:${recoveryScope}:${label}`, creationDraftSchema,
        () => creating ? {name, type, options} : null);
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(!!recovery.restored);
    const [name, setName] = useState(recovery.restored?.name ?? "");
    const [type, setType] = useState<TaskFieldDefinition["type"]>(recovery.restored?.type ?? "text");
    const [options, setOptions] = useState(recovery.restored?.options ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [selectionError, setSelectionError] = useState("");
    const keys = [...new Set([...viewFieldKeys, ...definitions.map(field => `custom:${field.id}`)])];
    const shown = selectedFields.filter(key => keys.includes(key));
    const ordered = [...shown, ...keys.filter(key => !shown.includes(key))];

    function toggle(key: string, checked: boolean) {
        if (checked && !selectedFields.includes(key) && selectedFields.length >= 32) {
            setSelectionError(fieldLimitMessage); return;
        }
        setSelectionError("");
        onChange(checked ? [...selectedFields, key] : selectedFields.filter(value => value !== key));
    }

    function move(key: string, offset: number) {
        const next = [...selectedFields];
        const from = next.indexOf(key);
        const to = from + offset;
        if (from < 0 || to < 0 || to >= next.length) return;
        next.splice(from, 1);
        next.splice(to, 0, key);
        onChange(next);
    }

    async function create(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || loading || !canManage) return;
        if (selectedFields.length >= 32) { setError(fieldLimitMessage); return; }
        const choices = options.split("\n").map(option => option.trim()).filter(Boolean);
        if (!name.trim()) { setError("필드 이름을 입력해 주세요."); return; }
        if (type === "select" && (!choices.length || new Set(choices).size !== choices.length)) {
            setError("중복되지 않는 선택 항목을 한 줄에 하나씩 입력해 주세요."); return;
        }
        setBusy(true);
        setError("");
        try {
            const definition = await api.createTaskField({ project_id: projectId, name: name.trim(), type, options: type === "select" ? choices : [] });
            onCreated(definition);
            onChange([...selectedFields, `custom:${definition.id}`]);
            setCreating(false);
            recovery.clear();
            setName(""); setOptions(""); setType("text");
        } catch (cause) { setError(errorMessage(cause)); }
        finally { setBusy(false); }
    }

    return <>
        <Popover open={open} onOpenChange={value => { setOpen(value); if (value) onOpen?.(); }}>
            <PopoverTrigger asChild><Button variant="ghost" className="task-field-manager-trigger">{label}</Button></PopoverTrigger>
            <PopoverContent align="end" className="task-field-manager" aria-label={label}>
                <strong>표시할 필드</strong>
                <p className="task-field-help">숨긴 필드의 값은 유지됩니다.</p>
                {loading && <p role="status" className="task-field-help">필드를 불러오는 중…</p>}
                {loadError && <div className="task-field-load-error"><p role="alert" className="task-field-error">{loadError}</p>{onRetry && <Button variant="ghost" disabled={loading} onClick={onRetry}>다시 불러오기</Button>}</div>}
                {selectionError && <p role="alert" className="task-field-error">{selectionError}</p>}
                <div className="task-field-choices">
                    {ordered.map(key => {
                        const index = selectedFields.indexOf(key);
                        const fieldLabel = taskFieldLabel(key, definitions);
                        return <div key={key} className="task-field-choice" data-field-key={key}>
                            <label><Checkbox checked={index >= 0} onCheckedChange={checked => toggle(key, checked === true)} aria-label={`${fieldLabel} 표시`} />
                                <span>{fieldLabel}</span></label>
                            {index >= 0 && <span className="task-field-order">
                                <Button variant="ghost" size="icon" disabled={index === 0} aria-label={`${fieldLabel} 위로`} onClick={() => move(key, -1)}>↑</Button>
                                <Button variant="ghost" size="icon" disabled={index === selectedFields.length - 1} aria-label={`${fieldLabel} 아래로`} onClick={() => move(key, 1)}>↓</Button>
                            </span>}
                        </div>;
                    })}
                </div>
                <Button variant="outline" disabled={!canManage} onClick={() => {
                    if (selectedFields.length >= 32) { setSelectionError(fieldLimitMessage); return; }
                    setOpen(false); setError(""); setSelectionError(""); setCreating(true);
                }}>+ 사용자 필드 추가</Button>
            </PopoverContent>
        </Popover>
        <Dialog open={creating} onOpenChange={value => { if (!busy) {setCreating(value); if (!value) recovery.clear();} }}>
            <DialogContent className="task-field-create" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
                <DialogTitle>사용자 필드 추가</DialogTitle>
                <DialogDescription>작업에 필요한 속성을 만들고 현재 보기에 표시합니다.</DialogDescription>
                <form onSubmit={event => void create(event)} noValidate>
                    <Field label="필드 이름" required>{props => <Input {...props} value={name} onChange={event => setName(event.target.value)} disabled={busy || !canManage} autoFocus />}</Field>
                    <Field label="필드 유형">{props => <NativeSelect {...props} value={type} disabled={busy || !canManage} onChange={event => {
                        const candidate = event.target.value;
                        if (candidate === "text" || candidate === "number" || candidate === "date" || candidate === "select" || candidate === "checkbox") setType(candidate);
                    }}>{Object.entries(fieldTypeLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</NativeSelect>}</Field>
                    {type === "select" && <Field label="선택 항목" description="한 줄에 하나씩 입력하세요." required>{props => <Textarea {...props} value={options} onChange={event => setOptions(event.target.value)} disabled={busy || !canManage} />}</Field>}
                    {error && <p className="task-field-error" role="alert">{error}</p>}
                    {loading && <p role="status" className="task-field-help">필드를 불러오는 중…</p>}
                    <DialogFooter><Button variant="ghost" disabled={busy} onClick={() => {setCreating(false); recovery.clear();}}>취소</Button><Button type="submit" disabled={busy || loading || !canManage}>{busy ? "추가 중…" : "필드 추가"}</Button></DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    </>;
}

function validDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function TaskFieldCell({ task, fieldKey, definitions, onChanged, onError, disabled = false, surface }: {
    task: Task; fieldKey: string; definitions: readonly TaskFieldDefinition[];
    onChanged: (item: Item) => void; onError?: (message: string) => void;
    disabled?: boolean;
    surface: string;
}) {
    const {dateFormat, timeZone} = useDateTimeSettings();
    const recovery: AuthenticationDraft<z.infer<typeof cellDraftSchema>> = useAuthenticationDraft(`task:${task.project_id}:${task.id}:field:${fieldKey}:${surface}`, cellDraftSchema,
        () => open ? {draft, checked, expectedRevision, fieldType: type, options} : null);
    const [open, setOpen] = useState(!!recovery.restored);
    const [draft, setDraft] = useState(recovery.restored?.draft ?? "");
    const [checked, setChecked] = useState(recovery.restored?.checked ?? false);
    const [busy, setBusy] = useState(false);
    const [reloading, setReloading] = useState(false);
    const [error, setError] = useState("");
    const [conflict, setConflict] = useState(false);
    const [expectedRevision, setExpectedRevision] = useState(recovery.restored?.expectedRevision ?? task.revision);
    const [latest, setLatest] = useState<Task | null>(null);
    const definition = definitionFor(fieldKey, definitions, task.project_id);
    const can = useProjectPermissions();
    disabled = disabled || !can(task.project_id, "task.update");
    const custom = fieldKey.startsWith("custom:");
    const label = taskFieldLabel(fieldKey, definitions, task.project_id);
    const type = definition?.type ?? (fieldKey === "estimated_minutes" || fieldKey === "abc_order" ? "number"
        : fieldKey === "planned_date" || fieldKey === "due_date" ? "date"
        : fieldKey === "abc_priority" || fieldKey === "energy" ? "select"
        : fieldKey === "next_action" || fieldKey === "requires_test" ? "checkbox"
        : fieldKey === "acceptance_criteria" || fieldKey === "cancellation_reason" ? "multiline" : "text");
    const options = definition?.options ?? (fieldKey === "abc_priority" ? ["A", "B", "C"]
        : fieldKey === "energy" ? ["any", "low", "medium", "high"] : []);

    function changeOpen(value: boolean) {
        if (busy || (disabled && value)) return;
        if (value) {
            const current = fieldValue(task, fieldKey);
            setDraft(current === null || (fieldKey === "abc_priority" && current === "none") ? "" : Array.isArray(current) ? current.join("\n") : String(current));
            setChecked(current === true);
            setError("");
            setConflict(false);
            setExpectedRevision(task.revision);
            setLatest(null);
        }
        if (!value) recovery.clear();
        setOpen(value);
    }

    async function loadLatest() {
        if (busy || disabled) return;
        setBusy(true); setReloading(true); setError("");
        try {
            const current = await api.item(task.id);
            if (current.kind !== "task" || current.id !== task.id) {
                throw new Error("불러온 항목이 해당 작업과 일치하지 않습니다.");
            }
            setExpectedRevision(current.revision);
            setLatest(current);
            setConflict(false);
            onChanged(current);
        } catch (cause) {
            const message = errorMessage(cause);
            setError(message); onError?.(message);
        } finally { setBusy(false); setReloading(false); }
    }

    async function save(event?: FormEvent<HTMLFormElement>, clear = false) {
        event?.preventDefault();
        if (busy || disabled || conflict) return;
        if (custom && !definition) { setError("사용자 필드를 불러온 뒤 다시 시도해 주세요."); return; }
        if (recovery.restored && (recovery.restored.fieldType !== type || JSON.stringify(recovery.restored.options) !== JSON.stringify(options))) {
            setError("필드 정의가 변경되었습니다. 입력 내용을 확인한 뒤 닫고 다시 편집해 주세요."); return;
        }
        let value: FieldValue = draft;
        let validation = "";
        if (clear || (custom && type !== "checkbox" && draft.trim() === "")) value = null;
        else if (type === "checkbox") value = checked;
        else if (type === "number") {
            if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(draft.trim()) || !Number.isFinite(Number(draft))) validation = "유효한 숫자를 입력해 주세요.";
            else {
                value = Number(draft);
                if ((fieldKey === "estimated_minutes" || fieldKey === "abc_order") && (!Number.isInteger(value) || value < 0)) validation = `${label}은 0 이상의 정수로 입력해 주세요.`;
            }
        } else if (type === "date" && draft && !validDate(draft)) validation = "날짜를 YYYY-MM-DD 형식으로 입력해 주세요.";
        else if (type === "select") {
            if (!draft) value = fieldKey === "abc_priority" ? "none" : fieldKey === "energy" ? "any" : null;
            else if (!options.includes(draft)) validation = "목록에 있는 항목을 선택해 주세요.";
        } else if (fieldKey === "list_name" && !draft.trim()) validation = "리스트 이름을 입력해 주세요.";
        if (fieldKey === "acceptance_criteria") value = draft.split("\n").map(entry => entry.trim()).filter(Boolean);
        if (validation) { setError(validation); return; }
        setBusy(true); setError("");
        try {
            const updated = await api.updateTaskProperties(task.id, { expected_revision: expectedRevision, values: { [fieldKey]: value } });
            setOpen(false);
            recovery.clear();
            onChanged(updated);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 409) {
                setConflict(true);
                setLatest(null);
            }
            const message = cause instanceof ApiError && cause.status === 409
                ? `저장하지 못했습니다. 입력 내용은 유지됩니다. ${errorMessage(cause)}` : errorMessage(cause);
            setError(message); onError?.(message);
        } finally { setBusy(false); }
    }

    return <div className="task-field-cell" data-field-key={fieldKey}>
        <Popover open={open} onOpenChange={changeOpen}>
            <PopoverTrigger asChild><Button variant="ghost" className="task-field-value" disabled={disabled || (custom && !definition)} aria-label={`${task.title} ${label} 편집`} title={label}>
                <span className="task-field-mobile-label">{label}</span><span className="task-field-value-text">{formatTaskField(task, fieldKey, definitions, dateFormat, timeZone)}</span>
            </Button></PopoverTrigger>
            <PopoverContent align="start" className="task-field-editor" aria-label={`${label} 편집`} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
                <form onSubmit={event => void save(event)} noValidate>
                    <Field label={label} error={error} description={fieldKey === "acceptance_criteria" ? "한 줄에 하나씩 입력하세요." : undefined}>{props => type === "checkbox"
                        ? <label className="task-field-check-value"><Checkbox {...props} checked={checked} onCheckedChange={value => setChecked(value === true)} disabled={busy || disabled} aria-label={label} />체크됨</label>
                        : type === "select"
                            ? <NativeSelect {...props} value={draft} onChange={event => setDraft(event.target.value)} disabled={busy || disabled}>{fieldKey !== "energy" && <option value="">선택 안 함</option>}{options.map(option => <option key={option} value={option}>{fieldKey === "energy" ? ({ any: "상관없음", low: "낮음", medium: "보통", high: "높음" } as Record<string, string>)[option] : option}</option>)}</NativeSelect>
                            : type === "multiline" ? <Textarea {...props} value={draft} onChange={event => setDraft(event.target.value)} disabled={busy || disabled} autoFocus />
                            : <Input {...props} value={draft} onChange={event => setDraft(event.target.value)} type={type === "date" ? "date" : "text"} inputMode={type === "number" ? "decimal" : undefined} disabled={busy || disabled} autoFocus />}</Field>
                    {conflict && <Button variant="outline" disabled={busy || disabled} onClick={() => void loadLatest()}>{reloading ? "불러오는 중…" : "최신 작업 불러오기"}</Button>}
                    {latest && <p role="status" className="task-field-help">최신 저장 값: {formatTaskField(latest, fieldKey, definitions, dateFormat, timeZone)}. 입력 내용은 유지됩니다. 저장을 누르면 이 입력을 적용합니다.</p>}
                    <div className="task-field-editor-actions">
                        {custom && <Button variant="ghost" disabled={busy || disabled || conflict} onClick={() => void save(undefined, true)}>값 지우기</Button>}
                        <Button variant="ghost" disabled={busy} onClick={() => {setOpen(false); recovery.clear();}}>취소</Button>
                        <Button type="submit" disabled={busy || disabled || conflict}>{busy && !reloading ? "저장 중…" : "저장"}</Button>
                    </div>
                </form>
            </PopoverContent>
        </Popover>
    </div>;
}

export function TaskFieldCells({ task, fields, definitions, onChanged, onError, disabled = false, surface = "list" }: {
    task: Task; fields: readonly string[]; definitions: readonly TaskFieldDefinition[];
    onChanged: (item: Item) => void; onError?: (message: string) => void;
    disabled?: boolean;
    surface?: string;
}) {
    return <div className="task-field-cells">{fields.map(key => <TaskFieldCell key={key} task={task} fieldKey={key} definitions={definitions} onChanged={onChanged} onError={onError} disabled={disabled} surface={surface} />)}</div>;
}
