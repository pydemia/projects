import { useRef, useState, type DragEvent } from "react";
import type { Project } from "./models";
import { dateLabel } from "./models";
import { Button } from "./pydemia-ui/button";
import { RouteLink } from "./ui";

export function movedProjectIds(
    projects: readonly Project[], draggedId: string, targetId: string, after = false,
): string[] | null {
    const ids = projects.map(project => project.id);
    const from = ids.indexOf(draggedId);
    if (from < 0 || !ids.includes(targetId) || draggedId === targetId) return null;
    ids.splice(from, 1);
    const target = ids.indexOf(targetId);
    ids.splice(target + Number(after), 0, draggedId);
    return ids.every((id, index) => id === projects[index]?.id) ? null : ids;
}

export function ProjectOrderList({ projects, currentId, compact = false, busy, onReorder, onSelect }: {
    projects: readonly Project[];
    currentId: string;
    compact?: boolean;
    busy: boolean;
    onReorder: (ids: string[]) => Promise<void>;
    onSelect?: () => void;
}) {
    const dragging = useRef<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);

    function reorder(draggedId: string, targetId: string, after = false) {
        const ids = movedProjectIds(projects, draggedId, targetId, after);
        if (ids) void onReorder(ids);
    }
    function startDrag(event: DragEvent<HTMLButtonElement>, id: string) {
        dragging.current = id;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", id);
    }
    function endDrag() {
        dragging.current = null;
        setDropTarget(null);
    }
    function drop(event: DragEvent<HTMLLIElement>, targetId: string) {
        event.preventDefault();
        const draggedId = dragging.current;
        const rect = event.currentTarget.getBoundingClientRect();
        const after = event.clientY > rect.top + rect.height / 2;
        endDrag();
        if (!draggedId || draggedId === targetId) return;
        reorder(draggedId, targetId, after);
    }

    return <ol className={`project-order-list${compact ? " compact" : ""}`} aria-label="프로젝트 목록">
        {projects.map((project, index) => <li key={project.id} className="project-order-item"
            data-drop-position={dropTarget?.id === project.id ? dropTarget.after ? "after" : "before" : undefined}
            onDragOver={event => { if (!busy && dragging.current) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; const rect = event.currentTarget.getBoundingClientRect(); setDropTarget({ id: project.id, after: event.clientY > rect.top + rect.height / 2 }); } }}
            onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null); }}
            onDrop={event => { if (!busy) drop(event, project.id); }}>
            <Button type="button" variant="ghost" className="project-drag-handle" draggable={!busy && projects.length > 1}
                disabled={busy || projects.length < 2} aria-label={`${project.name} 순서 끌어서 이동`}
                title="끌어서 순서 변경" onDragStart={event => startDrag(event, project.id)} onDragEnd={endDrag}>⠿</Button>
            <RouteLink patch={{ project: project.id, view: "overview", item: "", run: "", baseline: "", q: "" }}
                className="project-order-link" current={currentId === project.id} onNavigate={onSelect}>
                {!compact && <span className="project-order-number">{String(index + 1).padStart(2, "0")}</span>}
                <span className="project-order-copy"><strong>{project.name}</strong>{!compact && <small>{project.goal || "아직 작성한 목표가 없습니다."}</small>}</span>
                {!compact && <span className="project-order-meta">{project.profile === "simple" ? "간편" : "표준"}<small>{dateLabel(project.created_at)}</small></span>}
            </RouteLink>
            <div className="project-order-actions">
                <Button type="button" variant="ghost" disabled={busy || index === 0} aria-label={`${project.name} 위로 이동`}
                    onClick={() => reorder(project.id, projects[index - 1]!.id)}>↑</Button>
                <Button type="button" variant="ghost" disabled={busy || index === projects.length - 1} aria-label={`${project.name} 아래로 이동`}
                    onClick={() => reorder(project.id, projects[index + 1]!.id, true)}>↓</Button>
            </div>
        </li>)}
    </ol>;
}
