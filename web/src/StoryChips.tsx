import { createContext, useContext, useEffect, type ReactNode } from "react";
import { api, ApiError } from "./api";
import { useResource } from "./hooks";
import type { Item, Link } from "./models";
import { useProjectCatalog, useProjectPermissions } from "./ProjectPermissions";
import { itemRoute } from "./Relations";
import { ErrorNotice, RouteLink } from "./ui";

const TaskStories = createContext<ReadonlyMap<string, readonly Item[]>>(new Map());
const noLinks: readonly Link[] = [];
const TaskRelations = createContext<{links: readonly Link[]; loading: boolean; incomplete: boolean}>({
    links: noLinks, loading: false, incomplete: false,
});
export function useTaskRelations() { return useContext(TaskRelations); }

export function TaskStoryProvider({projectId, items, revision, children}: {
    projectId: string; items: Item[]; revision: string | number; children: ReactNode;
}) {
    const catalog = useProjectCatalog();
    const can = useProjectPermissions();
    const readable = items.filter(item => can(item.project_id, "project.read"));
    const projects = projectId ? can(projectId, "project.read") ? [projectId] : [] : [...new Set(readable.filter(item => item.kind === "task").map(item => item.project_id))].sort();
    const accessKey = catalog.map(project => `${project.id}:${project.access?.access_revision ?? "unknown"}`).sort().join(",");
    const source = useResource(`task-story-chips:${projects.join(",")}:${revision}:${accessKey}:${readable.map(item => `${item.id}:${item.revision}`).join(",")}`, async signal => {
        const groups = await Promise.all(projects.map(id => api.links(id, signal)));
        const links = [...new Map(groups.flat().map(link => [link.id, link])).values()];
        const visible = new Map(readable.map(item => [item.id, item]));
        const taskIds = new Set(readable.filter(item => item.kind === "task").map(item => item.id));
        const canonical = links.filter(link => link.relation === "implements" && taskIds.has(link.source_id));
        const missing = [...new Set(canonical.map(link => link.target_id).filter(id => !visible.has(id)))];
        await Promise.all(missing.map(async id => {
            try {const target = await api.item(id, signal); if (can(target.project_id, "project.read")) visible.set(id, target);}
            catch (cause) {if (!(cause instanceof ApiError && (cause.status === 403 || cause.status === 404))) throw cause;}
        }));
        const byTask = new Map<string, Item[]>();
        for (const link of canonical) {
            const story = visible.get(link.target_id);
            if (!story || story.kind !== "requirement") continue;
            const stories = byTask.get(link.source_id) ?? [];
            if (!stories.some(entry => entry.id === story.id)) stories.push(story);
            byTask.set(link.source_id, stories);
        }
        return {links, byTask};
    });
    useEffect(() => {
        window.addEventListener("projects:relations-changed", source.reload);
        return () => window.removeEventListener("projects:relations-changed", source.reload);
    }, [source.reload]);
    return <TaskRelations.Provider value={{links: source.data?.links ?? noLinks, loading: source.status === "loading", incomplete: source.status !== "ready"}}>
        <TaskStories.Provider value={source.data?.byTask ?? new Map()}>
        {source.status === "error" && <ErrorNotice error={source.error} retry={source.reload} />}
        {children}
        </TaskStories.Provider>
    </TaskRelations.Provider>;
}

export function TaskStoryChips({taskId, collapsible = false}: {taskId: string; collapsible?: boolean}) {
    const stories = useContext(TaskStories).get(taskId) ?? [];
    if (!stories.length) return null;
    const links = <span className="task-story-chips" aria-label="관련 Story">
        {stories.map(story => <RouteLink key={story.id} patch={itemRoute(story)} className="task-story-chip">{story.title}</RouteLink>)}
    </span>;
    const interactions = {
        onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
        onClick: (event: React.MouseEvent) => event.stopPropagation(),
        onKeyDown: (event: React.KeyboardEvent) => event.stopPropagation(),
    };
    return collapsible ? <details className="task-story-disclosure" {...interactions}>
        <summary>관련 Story <span>{stories.length}</span></summary>
        {links}
    </details> : <span {...interactions}>{links}</span>;
}
