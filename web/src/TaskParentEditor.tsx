import { useRef, useState } from "react";
import { api, ApiError, errorMessage } from "./api";
import { useResource } from "./hooks";
import type { Item } from "./models";
import { useProjectPermissions } from "./ProjectPermissions";
import { NativeSelect } from "./pydemia-ui/native-select";
import { taskParents } from "./task-hierarchy";
import { ActionButton, ErrorNotice, Field } from "./ui";

type Task = Extract<Item, {kind: "task"}>;

export function TaskParentEditor({task, parentId, parentTitle}: {
    task: Task; parentId?: string; parentTitle?: string;
}) {
    const can = useProjectPermissions();
    const editable = can(task.project_id, "task.update") && can(task.project_id, "relation.write");
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<string>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const submitting = useRef(false);
    const resource = useResource(`task-parent:${task.id}:${task.project_id}:${open && editable}`, async signal => {
        if (!open || !editable) return undefined;
        const [items, links] = await Promise.all([api.items(task.project_id, signal), api.links(task.project_id, signal)]);
        return {items, parents: taskParents(links)};
    });
    const data = resource.data;
    const currentParent = data?.parents.get(task.id) ?? (data ? "" : parentId ?? "");
    const selected = draft ?? currentParent;
    const candidates = data?.items.filter(item => {
        if (item.kind !== "task" || item.project_id !== task.project_id) return false;
        const seen = new Set([task.id]);
        let ancestor: string | undefined = item.id;
        while (ancestor) {
            if (seen.has(ancestor)) return false;
            seen.add(ancestor);
            ancestor = data.parents.get(ancestor);
        }
        return true;
    }) ?? [];
    async function save(event: React.FormEvent) {
        event.preventDefault();
        if (!editable || submitting.current || !data || selected === currentParent || selected && !candidates.some(item => item.id === selected)) return;
        submitting.current = true;
        setBusy(true); setError("");
        try {
            await api.updateTaskParent(task.id, {parent_task_id: selected || null, expected_parent_id: currentParent || null});
            setDraft(undefined);
            setOpen(false);
            window.dispatchEvent(new Event("projects:relations-changed"));
        } catch (cause) {
            setError(errorMessage(cause));
            if (cause instanceof ApiError && cause.status === 409) resource.reload();
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    }
    if (!editable) return parentId ? <p className="task-parent-readonly">부모 작업 · {parentTitle ?? "연결됨"}</p> : null;
    return <section className="task-parent-editor" aria-label="작업 계층">
        {parentId && <p className="task-parent-readonly">부모 작업 · {parentTitle ?? "연결됨"}</p>}
        <ActionButton type="button" className="small" disabled={busy} aria-expanded={open} onClick={() => {setOpen(value => !value); setDraft(undefined); setError("");}}>
            {open ? "부모 작업 설정 닫기" : parentId ? "부모 작업 변경" : "부모 작업 지정"}
        </ActionButton>
        {open && <form onSubmit={event => {void save(event);}}>
            {resource.status === "loading" && <p className="muted small">부모 후보를 불러오는 중…</p>}
            {resource.status === "error" && <ErrorNotice error={resource.error} retry={resource.reload} />}
            {error && <ErrorNotice error={error} />}
            {data && <><Field label="부모 작업"><NativeSelect value={selected} disabled={busy} onChange={event => setDraft(event.target.value)}>
                <option value="">없음 · 독립 작업</option>
                {candidates.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </NativeSelect></Field>
            <ActionButton type="submit" disabled={busy || selected === currentParent || !!selected && !candidates.some(item => item.id === selected)}>{busy ? "저장 중…" : "부모 작업 저장"}</ActionButton></>}
        </form>}
    </section>;
}
