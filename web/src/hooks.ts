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
    q: string; run: string; baseline: string;
};
function readRoute(): Route {
    const query = new URLSearchParams(window.location.search);
    return {
        project: query.get("project") ?? "", view: query.get("view") ?? "overview",
        item: query.get("item") ?? "", kind: query.get("kind") ?? "",
        q: query.get("q") ?? "", run: query.get("run") ?? "",
        baseline: query.get("baseline") ?? "",
    };
}
export function routeUrl(patch: Partial<Route>): string {
    const current = { ...readRoute(), ...patch };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(current)) {
        if (value) query.set(key, value);
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

export const draftSchema = z.object({
    title: z.string(), body: z.string(), data: z.record(z.string(), z.unknown()),
    baseRevision: z.number().int().nonnegative(), savedLocallyAt: z.string(),
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
