import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { errorMessage } from "./api";

export type Resource<T> =
    | { status: "loading"; data?: undefined; error?: undefined }
    | { status: "error"; data?: undefined; error: string }
    | { status: "ready"; data: T; error?: undefined };

export function useResource<T>(
    key: string,
    fetcher: (signal: AbortSignal) => Promise<T>,
): Resource<T> & { reload: () => void } {
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;
    const [resource, setResource] = useState<Resource<T>>({ status: "loading" });
    const [generation, setGeneration] = useState(0);
    const reload = useCallback(() => setGeneration(value => value + 1), []);
    const activeKey = useRef(key);
    useEffect(() => {
        const controller = new AbortController();
        const previousKey = activeKey.current;
        activeKey.current = key;
        setResource(previous => previousKey === key && previous.status === "ready"
            ? previous : { status: "loading" });
        fetcherRef.current(controller.signal).then(data => {
            if (!controller.signal.aborted) setResource({ status: "ready", data });
        }).catch((error: unknown) => {
            if (!controller.signal.aborted) {
                setResource({ status: "error", error: errorMessage(error) });
            }
        });
        return () => controller.abort();
    }, [key, generation]);
    if (activeKey.current !== key) return { status: "loading", reload };
    return { ...resource, reload };
}

export type Route = {
    project: string; view: string; item: string; kind: string;
    q: string; qPresent?: boolean; run: string; baseline: string;
    invitationId?: string; ownershipId?: string; expectedRevision?: string;
    plan?: string; planningDraft?: string; taskMode?: string; taskView?: string; savedView?: string;
    taskScope?: string; taskLayout?: string; taskDensity?: string; taskStatus?: string; taskProject?: string;
    taskListVariant?: string; taskProjects?: string;
};
function readRoute(): Route {
    const query = new URLSearchParams(window.location.search);
    return {
        invitationId: query.get("invitationId") ?? "", ownershipId: query.get("ownershipId") ?? "", expectedRevision: query.get("expectedRevision") ?? "",
        planningDraft: query.get("planningDraft") ?? "", plan: query.get("plan") ?? "", project: query.get("project") ?? "", view: query.get("view") ?? "overview",
        item: query.get("item") ?? "", kind: query.get("kind") ?? "",
        q: query.get("q") ?? "", qPresent: query.has("q"), run: query.get("run") ?? "",
        baseline: query.get("baseline") ?? "",
        taskMode: query.get("taskMode") ?? "", taskView: query.get("taskView") ?? "",
        savedView: query.get("savedView") ?? "",
        taskScope: query.get("taskScope") ?? "", taskLayout: query.get("taskLayout") ?? "",
        taskDensity: query.get("taskDensity") ?? "", taskStatus: query.get("taskStatus") ?? "", taskProject: query.get("taskProject") ?? "",
        taskListVariant: query.get("taskListVariant") ?? "", taskProjects: query.get("taskProjects") ?? undefined,
    };
}
export function routeUrl(patch: Partial<Route>): string {
    const previous = readRoute();
    const current = { ...previous, ...patch };
    if (Object.hasOwn(patch, "project") && patch.project !== previous.project) {
        if (!Object.hasOwn(patch, "plan")) current.plan = "";
        if (!Object.hasOwn(patch, "planningDraft")) current.planningDraft = "";
        for (const key of ["taskMode", "taskView", "taskScope", "taskLayout", "taskDensity", "taskStatus", "taskProject", "taskListVariant", "taskProjects", "savedView"] as const) {
            if (!Object.hasOwn(patch, key)) current[key] = undefined;
        }
        if (!Object.hasOwn(patch, "q")) {current.q = ""; current.qPresent = false;}
    }
    const query = new URLSearchParams();
    const preserveEmptyQuery = (current.view === "tasks" || !!current.savedView) && (
        Object.hasOwn(patch, "q") ? patch.q === "" : current.qPresent
    );
    for (const [key, value] of Object.entries(current)) {
        if (key === "qPresent") continue;
        if (typeof value === "string" && (value || key === "q" && preserveEmptyQuery || key === "taskProjects")) query.set(key, value);
    }
    return `?${query.toString()}`;
}
export function navigate(patch: Partial<Route>, replace = false): void {
    window.history[replace ? "replaceState" : "pushState"](null, "", routeUrl(patch));
    window.dispatchEvent(new PopStateEvent("popstate"));
}
export function useRoute(): Route {
    const [route, setRoute] = useState(readRoute);
    useEffect(() => {
        const update = () => setRoute(readRoute());
        window.addEventListener("popstate", update);
        return () => window.removeEventListener("popstate", update);
    }, []);
    return route;
}

export function useViewportQuery(media: string): boolean {
    const [matches, setMatches] = useState(() => window.matchMedia?.(media).matches ?? false);
    useEffect(() => {
        if (typeof window.matchMedia !== "function") return;
        const query = window.matchMedia(media);
        const update = () => setMatches(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, [media]);
    return matches;
}

export function useMobileViewport(): boolean {
    return useViewportQuery("(max-width: 760px)");
}

export const draftSchema = z.object({
    title: z.string(), body: z.string(), data: z.record(z.string(), z.unknown()),
    baseRevision: z.number().int().nonnegative(), savedLocallyAt: z.string(),
    inlineField: z.enum(["title", "body"]).optional(),
});
export type Draft = z.infer<typeof draftSchema>;
export function loadDraft(key: string): Draft | null {
    try {
        const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
        const parsed = draftSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}
export function storeDraft(key: string, draft: Draft): boolean {
    try {
        localStorage.setItem(key, JSON.stringify(draft));
        return true;
    } catch {
        return false;
    }
}
export function removeDraft(key: string): void {
    try { localStorage.removeItem(key); } catch { /* In-memory draft remains. */ }
}
