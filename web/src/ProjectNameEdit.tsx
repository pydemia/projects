import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useAuthenticationDraft, type AuthenticationDraft } from "./auth-drafts";
import { api, ApiError, errorMessage } from "./api";
import type { Project } from "./models";
import { canProject } from "./ProjectPermissions";
import { InlineTextEdit } from "./InlineEdit";
import { Button } from "./pydemia-ui/button";

const nameDraftSchema = z.object({name: z.string(), version: z.number().int().positive()}).strict();

export function ProjectNameEdit({ project, onSaved, disabled = false, startEditing = false, onEditingChange, onPendingChange, recoverySurface }: {
    project: Project; onSaved?: (project: Project) => void; disabled?: boolean;
    startEditing?: boolean; onEditingChange?: (editing: boolean) => void;
    onPendingChange?: (pending: boolean) => void;
    recoverySurface?: string;
}) {
    disabled = disabled || !canProject(project, "project.update");
    const recovery: AuthenticationDraft<z.infer<typeof nameDraftSchema>> = useAuthenticationDraft(`project:${project.id}:name:${recoverySurface ?? (startEditing ? "menu" : "overview")}`, nameDraftSchema,
        () => entered.current === null ? null : {name: entered.current, version: base.current.version});
    const [current, setCurrent] = useState(project);
    const base = useRef({...project, version: recovery.restored?.version ?? project.version});
    const entered = useRef<string | null>(recovery.restored?.name ?? (startEditing ? project.name : null));
    const [conflict, setConflict] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => { if (project.version >= current.version) setCurrent(project); }, [project, current.version]);
    async function save(name: string) {
        if (disabled) return;
        onPendingChange?.(true);
        try {
            const updated = await api.renameProject(project.id, {expected_version: base.current.version, name: name.trim()});
            base.current = updated; setCurrent(updated); setConflict(false); setError(""); onSaved?.(updated);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 409) setConflict(true);
            throw cause;
        } finally {onPendingChange?.(false);}
    }
    async function loadLatest() {
        setLoading(true); onPendingChange?.(true); setError("");
        try {
            const latest = await api.project(project.id);
            base.current = latest; setCurrent(latest); setConflict(false); onSaved?.(latest);
        } catch (cause) { setError(errorMessage(cause)); }
        finally { setLoading(false); onPendingChange?.(false); }
    }
    return <span className="project-name-edit">
        <InlineTextEdit label="프로젝트명" value={current.name} required maxLength={200} variant="title" disabled={disabled || loading}
            initialDraft={!disabled ? recovery.restored?.name ?? (startEditing ? current.name : undefined) : undefined} onEditingChange={onEditingChange}
            onDraftChange={value => {entered.current = value; if (value === null) recovery.clear();}}
            onBegin={() => {base.current = current; setConflict(false); setError("");}}
            onSave={save} />
        {conflict && <Button type="button" variant="outline" disabled={loading} onClick={() => void loadLatest()}>최신 프로젝트 불러오기</Button>}
        {error && <span className="inline-edit-error" role="alert">{error}</span>}
    </span>;
}
