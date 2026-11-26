import { useEffect, useState } from "react";
import { useProjectPermissions } from "./ProjectPermissions";
import { scheduleApi } from "./schedule-api";
import type { Schedule } from "./schedule-models";
import "./schedules.css";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Phase 연결을 저장하지 못했습니다.";

/** A task can be displayed in more than one Phase without creating another task. */
export function TaskPhaseField({projectId, taskId, disabled = false}: {projectId: string; taskId: string; disabled?: boolean}) {
    const can = useProjectPermissions();
    const [phases, setPhases] = useState<Schedule[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [saved, setSaved] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const load = async (signal?: AbortSignal) => {
        setLoading(true); setError("");
        try {
            const rows = await scheduleApi.list(projectId, signal);
            if (signal?.aborted) return;
            const values = rows.filter(row => row.kind === "phase");
            const memberships = values.filter(row => row.member_ids.includes(taskId)).map(row => row.id);
            setPhases(values); setSelected(memberships); setSaved(memberships);
        } catch (reason) {if (!signal?.aborted) setError(errorMessage(reason));}
        finally {if (!signal?.aborted) setLoading(false);}
    };
    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [projectId, taskId]);
    const editable = !disabled && can(projectId, "project.update");
    const save = async () => {
        setPending(true); setError("");
        try {
            await scheduleApi.taskPhases(projectId, taskId, selected, Object.fromEntries(phases.map(row => [row.id, row.revision])));
            // The mutation response has memberships only; re-read to retain fresh schedule revisions.
            await load();
        }
        catch (reason) {setError(errorMessage(reason));}
        finally {setPending(false);}
    };
    const dirty = selected.length !== saved.length || selected.some(id => !saved.includes(id));
    return <div className="task-phase-field"><fieldset disabled={!editable || pending || loading}>
        <legend>Phase</legend>
        {loading ? <p className="muted small" role="status">Phase를 불러오는 중…</p> : phases.length === 0 ? <p className="muted small">연결할 Phase가 없습니다.</p> : phases.map(phase => <label key={phase.id} className="schedule-member-option"><input type="checkbox" checked={selected.includes(phase.id)} onChange={event => setSelected(current => event.target.checked ? [...current, phase.id] : current.filter(id => id !== phase.id))} />{phase.title}</label>)}
        {editable && !loading && phases.length > 0 && <button type="button" disabled={pending || !dirty} onClick={() => void save()}>Phase 연결 저장</button>}
    </fieldset>{error && <p role="alert">{error} <button type="button" disabled={pending} onClick={() => void load()}>다시 불러오기</button></p>}</div>;
}
