import { useRef, useState } from "react";
import { z } from "zod";
import { useAuthenticationDraft, type AuthenticationDraft } from "./auth-drafts";
import { api, ApiError, errorMessage } from "./api";
import { dataSchemas, type Item } from "./models";
import { useProjectPermissions } from "./ProjectPermissions";
import { InlineTextEdit } from "./InlineEdit";
import { Button } from "./pydemia-ui/button";

type Task = Extract<Item, {kind: "task"}>;
const titleDraftSchema = z.object({title: z.string(), revision: z.number().int().positive(),
    body: z.string(), data: dataSchemas.task.strict()}).strict();
export function TaskTitleEdit({ task, onSaved, disabled = false, dragSurface = false, onOpen }: {
    task: Task; onSaved: (item: Item) => void; disabled?: boolean; dragSurface?: boolean; onOpen?: () => void;
}) {
    const can = useProjectPermissions();
    disabled = disabled || !can(task.project_id, "task.update");
    const recovery: AuthenticationDraft<z.infer<typeof titleDraftSchema>> = useAuthenticationDraft(`task:${task.project_id}:${task.id}:title:${dragSurface ? "board" : "list"}`, titleDraftSchema,
        () => entered.current === null ? null : {title: entered.current, revision: base.current.revision, body: base.current.body, data: base.current.data});
    const base = useRef(recovery.restored ? {...task, ...recovery.restored} : task);
    const entered = useRef<string | null>(recovery.restored?.title ?? null);
    const [conflict, setConflict] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    async function save(title: string) {
        if (disabled) return;
        try {
            const updated = await api.saveItem(task.id, {expected_revision: base.current.revision,
                title: title.trim(), body: base.current.body, data: base.current.data});
            setConflict(false); setError(""); onSaved(updated);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 409) setConflict(true);
            throw cause;
        }
    }
    async function loadLatest() {
        setLoading(true); setError("");
        try {
            const latest = await api.item(task.id);
            if (latest.kind !== "task") throw new Error("작업을 불러오지 못했습니다.");
            base.current = latest; setConflict(false); onSaved(latest);
        } catch (cause) {setError(errorMessage(cause));}
        finally {setLoading(false);}
    }
    return <span className="task-title task-title-edit" data-task-title-id={task.id}>
        <InlineTextEdit label={`${task.title} 제목`} value={task.title} required maxLength={300} disabled={disabled || loading}
            preview={onOpen && <Button variant="ghost" className={dragSurface ? "task-board-title" : "task-open-button"}
                data-kanban-title-edit={dragSurface || undefined} onClick={onOpen}><span>{task.title}</span></Button>}
            initialDraft={!disabled ? recovery.restored?.title : undefined}
            onDraftChange={value => {entered.current = value; if (value === null) recovery.clear();}}
            dragSurface={dragSurface} onBegin={() => {base.current = task; setConflict(false); setError("");}}
            onSave={save} />
        {conflict && <Button type="button" variant="outline" disabled={loading} onClick={() => void loadLatest()}>최신 작업 불러오기</Button>}
        {error && <span className="inline-edit-error" role="alert">{error}</span>}
    </span>;
}
